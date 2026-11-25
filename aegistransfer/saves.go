package aegistransfer

// Сохранения по Wi-Fi (план 0.6.0, задача 7 для сети). Та же логика, что у выгрузки в папку
// или на SD (syncRomSavesWithDevice в src/utils/saveFiles.ts):
//   - сохранение есть только с одной стороны — копируется на другую;
//   - есть с обеих и отличается — текущим становится более новое по времени, а обе версии
//     остаются в истории библиотеки (<папка рома>/.aegis-saves/<имя>/);
//   - на устройство история не пишется, снимки состояний (.state*) не ездят.
// Связь «ром в сборке → ром в библиотеке» пишет выгрузка сборки в .aegis-saves-map.json
// в корне папки сборки.
//
// Saves over Wi-Fi (0.6.0 plan, task 7 for the network). Same rules as the folder/SD export
// (syncRomSavesWithDevice in src/utils/saveFiles.ts): one side only — copied over; both and
// different — the newer by time wins, both versions stay in the library history; no history on
// the device, no save states. The build export writes the "ROM in build → ROM in library" links
// into .aegis-saves-map.json at the build folder root.

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"aegisgui/aegiscore"
)

// SaveMapFile — файл связей в корне папки сборки / the links file at the build folder root.
const SaveMapFile = ".aegis-saves-map.json"

// saveMapSearchDepth — на сколько папок вверх от заливаемой искать файл связей
// (EASYROMS, Roms, Emulation/roms лежат внутри корня сборки).
// How many folders up from the uploaded one to look for the links file.
const saveMapSearchDepth = 3

// maxSaveBytes — больше этого не сохранение / anything bigger is not a save.
const maxSaveBytes = 64 << 20

// SaveLink — ром в папке сборки и его место в библиотеке.
// SaveLink is a ROM in the build folder and its place in the library.
type SaveLink struct {
	// Rel — путь рома от заливаемой папки через "/" / ROM path from the uploaded folder, "/"-separated.
	Rel string
	// LibDir — папка рома в библиотеке / ROM folder in the library.
	LibDir string
	// LibBase — имя рома в библиотеке без расширения / library ROM name without extension.
	LibBase string
}

// SaveMapEntry — запись файла связей (пути абсолютные) / a links file entry (absolute paths).
type SaveMapEntry struct {
	Rom     string `json:"rom"`
	LibDir  string `json:"libDir"`
	LibBase string `json:"libBase"`
}

type saveMap struct {
	Version int            `json:"version"`
	Entries []SaveMapEntry `json:"entries"`
}

// FindSaveMap ищет файл связей в localDir и выше / looks for the links file in localDir and above.
func FindSaveMap(localDir string) ([]SaveMapEntry, string) {
	dir := filepath.Clean(localDir)
	for i := 0; i <= saveMapSearchDepth; i++ {
		raw, err := os.ReadFile(filepath.Join(dir, SaveMapFile))
		if err == nil {
			var m saveMap
			if json.Unmarshal(raw, &m) == nil {
				return m.Entries, dir
			}
			return nil, ""
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return nil, ""
}

// LinksForUpload отбирает записи внутри localDir. resolve проверяет папку библиотеки
// (в API — только папки, выбранные пользователем); nil — без проверки.
// LinksForUpload keeps the entries inside localDir. resolve checks the library folder (in the
// API, only user-picked folders); nil means no check.
func LinksForUpload(localDir string, entries []SaveMapEntry, resolve func(string) (string, error)) []SaveLink {
	root := filepath.Clean(localDir)
	seen := map[string]bool{}
	var out []SaveLink
	for _, e := range entries {
		if e.Rom == "" || e.LibDir == "" || e.LibBase == "" || strings.ContainsAny(e.LibBase, `/\`) {
			continue
		}
		rel, err := filepath.Rel(root, filepath.Clean(e.Rom))
		if err != nil || rel == "." || strings.HasPrefix(rel, "..") || filepath.IsAbs(rel) {
			continue
		}
		lib := filepath.Clean(e.LibDir)
		if resolve != nil {
			if lib, err = resolve(lib); err != nil {
				continue
			}
		}
		rel = filepath.ToSlash(rel)
		if seen[strings.ToLower(rel)] {
			continue
		}
		seen[strings.ToLower(rel)] = true
		out = append(out, SaveLink{Rel: rel, LibDir: lib, LibBase: e.LibBase})
	}
	return out
}

// isSaveLike — файл похож на сохранение (по суффиксу) / the file looks like a save (by suffix).
func isSaveLike(name string) bool {
	low := strings.ToLower(name)
	for _, s := range aegiscore.SaveSuffixes {
		if len(low) > len(s) && strings.HasSuffix(low, s) {
			return true
		}
	}
	return false
}

// SaveStats — итог сверки сохранений / save sync result.
type SaveStats struct {
	Roms       int `json:"roms"`       // ромов со связью / linked ROMs
	ToDevice   int `json:"toDevice"`   // файлов на приставку / files to the handheld
	FromDevice int `json:"fromDevice"` // файлов в библиотеку / files to the library
	Conflicts  int `json:"conflicts"`  // отличались с обеих сторон / differed on both sides
	Failed     int `json:"failed"`
}

func stemOf(name string) string {
	ext := path.Ext(name)
	if ext == "" || ext == name {
		return name
	}
	return strings.TrimSuffix(name, ext)
}

// readRemote читает маленький файл с устройства / reads a small file from the device.
func readRemote(c *conn, p string) ([]byte, error) {
	var data []byte
	err := c.retry(func(r Remote) error {
		rd, err := r.OpenRead(p)
		if err != nil {
			return err
		}
		defer rd.Close()
		data, err = io.ReadAll(io.LimitReader(rd, maxSaveBytes+1))
		if err == nil && len(data) > maxSaveBytes {
			err = errors.New("save file is too big")
		}
		return err
	})
	return data, err
}

// writeRemote пишет файл целиком через .aegis-part / writes a whole file via .aegis-part.
func writeRemote(c *conn, p string, data []byte, mtime time.Time) error {
	return c.retry(func(r Remote) error {
		part := p + PartSuffix
		w, err := openWriteSized(r, part, 0, int64(len(data)))
		if err != nil {
			return err
		}
		_, err = w.Write(data)
		if cerr := w.Close(); err == nil {
			err = cerr
		}
		if err != nil {
			return err
		}
		if err := r.Replace(part, p); err != nil {
			return err
		}
		_ = r.Chtimes(p, mtime)
		return nil
	})
}

// writeLocal пишет файл с заданным временем / writes a file with the given time.
func writeLocal(file string, data []byte, mtime time.Time) error {
	tmp := file + ".aegis-tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	if err := os.Rename(tmp, file); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	if !mtime.IsZero() {
		_ = os.Chtimes(file, mtime, mtime)
	}
	return nil
}

// syncSaves сверяет сохранения ромов сборки с устройством.
// syncSaves reconciles the saves of the build's ROMs with the device.
func syncSaves(c *conn, j *Job, localDir, remoteDir string, links []SaveLink, now time.Time) error {
	suffixes := aegiscore.DeviceSyncSuffixes()
	listings := map[string]map[string]RemoteEntry{}
	fail := func(rel string, err error) {
		j.set(func(s *Snapshot) {
			s.Saves.Failed++
			if len(s.Errors) < maxListedErrors {
				s.Errors = append(s.Errors, FileError{Path: rel, Code: Classify(err), Message: err.Error()})
			}
		})
	}
	for _, l := range links {
		if c.ctx.Err() != nil {
			return c.ctx.Err()
		}
		rdir := path.Join(remoteDir, path.Dir(l.Rel))
		entries, ok := listings[rdir]
		if !ok {
			var exists bool
			if err := c.retry(func(r Remote) error {
				var e error
				entries, exists, e = r.ReadDir(rdir)
				return e
			}); err != nil {
				if Classify(err) == CodeConnLost {
					return err
				}
				fail(l.Rel, err)
				continue
			}
			if !exists {
				entries = nil
			}
			listings[rdir] = entries
		}
		romName := path.Base(l.Rel)
		// Рома на устройстве нет (не залился) — сохранения не трогаем.
		// The ROM is not on the device (not uploaded): leave its saves alone.
		if entries == nil {
			continue
		}
		if _, ok := entries[romName]; !ok {
			continue
		}
		lower := make(map[string]string, len(entries))
		for name, e := range entries {
			if !e.IsDir {
				lower[strings.ToLower(name)] = name
			}
		}
		j.set(func(s *Snapshot) { s.Saves.Roms++; s.Current = l.Rel })
		devBase := stemOf(romName)
		buildDir := filepath.Join(localDir, filepath.FromSlash(path.Dir(l.Rel)))
		for _, sfx := range suffixes {
			devName, hasDev := lower[strings.ToLower(devBase+sfx)]
			if !hasDev {
				devName = devBase + sfx
			}
			libPath := filepath.Join(l.LibDir, l.LibBase+sfx)
			libSt, libErr := os.Stat(libPath)
			hasLib := libErr == nil && libSt.Mode().IsRegular()
			if !hasLib && !hasDev {
				continue
			}
			devPath := path.Join(rdir, devName)
			buildCopy := filepath.Join(buildDir, devName)
			if err := syncOneSave(c, j, l, sfx, libPath, libSt, hasLib, devPath, entries[devName], hasDev, buildCopy, now); err != nil {
				if c.ctx.Err() != nil {
					return c.ctx.Err()
				}
				if Classify(err) == CodeConnLost {
					return err
				}
				fail(path.Join(path.Dir(l.Rel), devName), err)
			}
		}
	}
	return nil
}

func syncOneSave(c *conn, j *Job, l SaveLink, sfx, libPath string, libSt os.FileInfo, hasLib bool,
	devPath string, devEntry RemoteEntry, hasDev bool, buildCopy string, now time.Time) error {
	// Копия в папке сборки — такая же, как текущая версия, чтобы следующая выгрузка в папку
	// не приняла её за более новую. / The build folder copy matches the current version, so the
	// next folder export does not take it for a newer one.
	updateBuild := func(data []byte, mtime time.Time) {
		if st, err := os.Stat(filepath.Dir(buildCopy)); err == nil && st.IsDir() {
			_ = writeLocal(buildCopy, data, mtime)
		}
	}
	if hasLib && libSt.Size() > maxSaveBytes {
		return fmt.Errorf("%s: save file is too big", libPath)
	}
	var libData []byte
	if hasLib {
		var err error
		if libData, err = os.ReadFile(libPath); err != nil {
			return err
		}
	}
	if hasLib && !hasDev {
		if err := writeRemote(c, devPath, libData, libSt.ModTime()); err != nil {
			return err
		}
		updateBuild(libData, libSt.ModTime())
		j.set(func(s *Snapshot) { s.Saves.ToDevice++ })
		return nil
	}
	devData, err := readRemote(c, devPath)
	if err != nil {
		return err
	}
	devTime := devEntry.ModTime
	if !hasLib {
		if _, _, err := aegiscore.WriteSaveBytes(l.LibDir, l.LibBase, sfx, devData, now); err != nil {
			return err
		}
		_ = os.Chtimes(libPath, devTime, devTime)
		updateBuild(devData, devTime)
		j.set(func(s *Snapshot) { s.Saves.FromDevice++ })
		return nil
	}
	if bytes.Equal(libData, devData) {
		return nil
	}
	j.set(func(s *Snapshot) { s.Saves.Conflicts++ })
	if devTime.After(libSt.ModTime()) {
		// На приставке играли позже: прежнее из библиотеки уходит в историю.
		// Played on the handheld later: the library's previous one goes to history.
		if _, _, err := aegiscore.WriteSaveBytes(l.LibDir, l.LibBase, sfx, devData, now); err != nil {
			return err
		}
		_ = os.Chtimes(libPath, devTime, devTime)
		updateBuild(devData, devTime)
		j.set(func(s *Snapshot) { s.Saves.FromDevice++ })
		return nil
	}
	// В библиотеке новее: версия с приставки — в историю библиотеки, на приставку новое.
	// The library is newer: the handheld's version goes to the library history, the new one up.
	if _, err := aegiscore.BackupBytesToHistory(l.LibDir, l.LibBase, sfx, devData, devTime, now); err != nil {
		return err
	}
	if err := writeRemote(c, devPath, libData, libSt.ModTime()); err != nil {
		return err
	}
	updateBuild(libData, libSt.ModTime())
	j.set(func(s *Snapshot) { s.Saves.ToDevice++ })
	return nil
}
