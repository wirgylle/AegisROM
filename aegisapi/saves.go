package aegisapi

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// Менеджер сохранений, шаг 1: сохранения встроенного запуска (EmulatorJS) лежат файлами рядом с ромом.
// Save manager, step 1: saves from the in-app player (EmulatorJS) are stored as files next to the ROM.
//
// Имена как у RetroArch с сохранениями в папке игры: <имя рома без расширения>.srm и .state.
// Такие файлы подхватит RetroArch на ПК и на приставке, если сборка кладёт сохранения рядом с игрой.
// Names follow RetroArch with saves in the content folder: <rom base>.srm and .state.
//
// Перед перезаписью прежняя версия уходит в <папка рома>/.aegis-saves/<имя рома>/, хранятся
// последние SaveHistoryKeep версий каждого вида.
// Before an overwrite the previous version is moved to <rom folder>/.aegis-saves/<rom base>/,
// the newest SaveHistoryKeep versions of each kind are kept.
//
//	GET  /api/native/saves?<rom query>&kind=srm|state   файл сохранения / the save file (404 if none)
//	PUT  /api/native/saves?<rom query>&kind=srm|state   записать / write (body = bytes)
//	GET  /api/native/saves/list?<rom query>             текущие файлы и история / current files and history
//
// <rom query> такой же, как у /api/native/fs/rom: consoleCode, romFileName, relativePath, libraryPath, sdCardPath.
// Маршруты под /api/, значит закрыты Guard (токен сессии, Origin, Host).

// SaveKinds: какие виды сохранений принимаем. srm = SRAM / карта памяти ядра, state = снимок состояния.
var SaveKinds = map[string]string{"srm": ".srm", "state": ".state"}

// SaveMaxBytes: состояние PS1 около 5 МБ, с запасом.
const SaveMaxBytes = 64 << 20

// SaveHistoryKeep: сколько прошлых версий каждого вида хранить.
const SaveHistoryKeep = 10

// SaveHistoryDir: папка истории рядом с ромом.
const SaveHistoryDir = ".aegis-saves"

// ResolveRomOnDisk finds the ROM file itself (a .cue stays a .cue), the same way as the quick test.
func ResolveRomOnDisk(q url.Values) string {
	for _, c := range RomPathCandidates(q.Get("consoleCode"), q.Get("romFileName"), q.Get("relativePath"), q.Get("libraryPath"), q.Get("sdCardPath")) {
		if !QuickTestRomExts[strings.ToLower(filepath.Ext(c))] {
			continue
		}
		if st, err := os.Stat(c); err == nil && !st.IsDir() {
			return c
		}
	}
	return ""
}

func romBaseName(romPath string) string {
	base := filepath.Base(romPath)
	return strings.TrimSuffix(base, filepath.Ext(base))
}

// SavePathFor returns <rom folder>/<rom base><ext> for a kind, or "" for an unknown kind.
func SavePathFor(romPath, kind string) string {
	ext, ok := SaveKinds[kind]
	if !ok || romPath == "" {
		return ""
	}
	return filepath.Join(filepath.Dir(romPath), romBaseName(romPath)+ext)
}

func saveHistoryFolder(romPath string) string {
	return filepath.Join(filepath.Dir(romPath), SaveHistoryDir, romBaseName(romPath))
}

// WriteSave writes data as the save of romPath. If a different save already exists it is moved
// into the history folder first. Same bytes = nothing is written (the player saves every 30 s).
// Returns the save path and the backup path ("" when no backup was made).
func WriteSave(romPath, kind string, data []byte, now time.Time) (string, string, error) {
	target := SavePathFor(romPath, kind)
	if target == "" {
		return "", "", fmt.Errorf("unknown save kind %q", kind)
	}
	backup := ""
	if old, err := os.ReadFile(target); err == nil {
		if bytes.Equal(old, data) {
			return target, "", nil
		}
		dir := saveHistoryFolder(romPath)
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return "", "", err
		}
		stamp := now.Format("20060102-150405")
		backup = filepath.Join(dir, stamp+SaveKinds[kind])
		for i := 2; ; i++ {
			if _, err := os.Stat(backup); os.IsNotExist(err) {
				break
			}
			backup = filepath.Join(dir, fmt.Sprintf("%s-%d%s", stamp, i, SaveKinds[kind]))
		}
		if err := os.WriteFile(backup, old, 0o644); err != nil {
			return "", "", err
		}
		pruneSaveHistory(dir, SaveKinds[kind], SaveHistoryKeep)
	}
	tmp := target + ".aegis-tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return "", "", err
	}
	if err := os.Rename(tmp, target); err != nil {
		_ = os.Remove(tmp)
		return "", "", err
	}
	return target, backup, nil
}

// SaveFileInfo describes one save file for the list endpoint.
type SaveFileInfo struct {
	Name     string `json:"name"`
	Kind     string `json:"kind"`
	Size     int64  `json:"size"`
	Modified string `json:"modified"`
}

func historyEntries(dir, ext string) []os.DirEntry {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	out := []os.DirEntry{}
	for _, e := range entries {
		if !e.IsDir() && strings.EqualFold(filepath.Ext(e.Name()), ext) {
			out = append(out, e)
		}
	}
	// Имена начинаются с отметки времени, значит сортировка по имени = по времени.
	sort.Slice(out, func(i, j int) bool { return out[i].Name() > out[j].Name() })
	return out
}

func pruneSaveHistory(dir, ext string, keep int) {
	entries := historyEntries(dir, ext)
	for i := keep; i < len(entries); i++ {
		_ = os.Remove(filepath.Join(dir, entries[i].Name()))
	}
}

func fileInfo(path, kind string) *SaveFileInfo {
	st, err := os.Stat(path)
	if err != nil || st.IsDir() {
		return nil
	}
	return &SaveFileInfo{Name: filepath.Base(path), Kind: kind, Size: st.Size(), Modified: st.ModTime().UTC().Format(time.RFC3339)}
}

// ListSaves returns the current save files and the history of a ROM.
func ListSaves(romPath string) map[string]interface{} {
	current := []SaveFileInfo{}
	history := []SaveFileInfo{}
	kinds := []string{"srm", "state"}
	for _, kind := range kinds {
		if fi := fileInfo(SavePathFor(romPath, kind), kind); fi != nil {
			current = append(current, *fi)
		}
		dir := saveHistoryFolder(romPath)
		for _, e := range historyEntries(dir, SaveKinds[kind]) {
			if fi := fileInfo(filepath.Join(dir, e.Name()), kind); fi != nil {
				history = append(history, *fi)
			}
		}
	}
	return map[string]interface{}{"rom": filepath.Base(romPath), "current": current, "history": history}
}

// RegisterSaveRoutes adds /api/native/saves and /api/native/saves/list.
func RegisterSaveRoutes(mux *http.ServeMux, touch func()) {
	if touch == nil {
		touch = func() {}
	}
	mux.HandleFunc("/api/native/saves", func(w http.ResponseWriter, r *http.Request) {
		touch()
		q := r.URL.Query()
		kind := q.Get("kind")
		if _, ok := SaveKinds[kind]; !ok {
			http.Error(w, "unknown kind", http.StatusBadRequest)
			return
		}
		rom := ResolveRomOnDisk(q)
		if rom == "" {
			http.Error(w, "rom not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		switch r.Method {
		case http.MethodGet, http.MethodHead:
			p := SavePathFor(rom, kind)
			if st, err := os.Stat(p); err != nil || st.IsDir() {
				http.Error(w, "no save", http.StatusNotFound)
				return
			}
			w.Header().Set("X-Aegis-Save-Name", url.PathEscape(filepath.Base(p)))
			w.Header().Set("Content-Type", "application/octet-stream")
			http.ServeFile(w, r, p)
		case http.MethodPut, http.MethodPost:
			body, err := io.ReadAll(io.LimitReader(r.Body, SaveMaxBytes+1))
			if err != nil {
				http.Error(w, "read error", http.StatusBadRequest)
				return
			}
			if len(body) == 0 {
				http.Error(w, "empty save", http.StatusBadRequest)
				return
			}
			if len(body) > SaveMaxBytes {
				http.Error(w, "save too large", http.StatusRequestEntityTooLarge)
				return
			}
			path, backup, err := WriteSave(rom, kind, body, time.Now())
			if err != nil {
				http.Error(w, "write failed: "+err.Error(), http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			resp := map[string]interface{}{"ok": true, "name": filepath.Base(path), "dir": filepath.Dir(path)}
			if backup != "" {
				resp["backup"] = filepath.Base(backup)
			}
			_ = json.NewEncoder(w).Encode(resp)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/native/saves/list", func(w http.ResponseWriter, r *http.Request) {
		touch()
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		rom := ResolveRomOnDisk(r.URL.Query())
		if rom == "" {
			http.Error(w, "rom not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(ListSaves(rom))
	})
}
