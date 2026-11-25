package aegiscore

import (
	"bytes"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

// Сохранения рядом с ромом (менеджер сохранений 0.6.0). Общая часть для HTTP API и переименования.
// Saves next to the ROM (0.6.0 save manager). Shared by the HTTP API and the renamers.
//
// Сохранение = <имя рома без расширения><суффикс> в папке рома, как у RetroArch с сохранениями
// в папке игры. История: <папка рома>/.aegis-saves/<имя рома>/<ГГГГММДД-ччммсс>[-N]<суффикс>.
// A save is <rom base><suffix> in the ROM folder (RetroArch "saves in content dir").
// History: <rom folder>/.aegis-saves/<rom base>/<YYYYMMDD-hhmmss>[-N]<suffix>.

// SaveHistoryDir: папка истории рядом с ромом. / History folder next to the ROM.
const SaveHistoryDir = ".aegis-saves"

// SaveHistoryKeep: сколько прошлых версий каждого суффикса хранить. / Versions kept per suffix.
const SaveHistoryKeep = 10

// SaveSuffixes: какие файлы рядом с ромом считаются его сохранениями. Длинные суффиксы раньше
// коротких не нужны: имя сравнивается целиком (<база><суффикс>).
// Which files next to a ROM are its saves. Matching is exact (<base><suffix>).
//
//	.srm          SRAM / карта памяти ядра libretro (RetroArch, EmulatorJS)
//	.sav .rtc     mGBA, Gambatte, VBA и др. / mGBA, Gambatte, VBA etc.
//	.dsv          DeSmuME
//	.eep .fla .sra .mpk   Mupen64 / ParaLLEl
//	.mcr .mcd _1.mcd _2.mcd   карты памяти PS1 / PS1 memory cards (ePSXe, DuckStation)
//	.state .state1-9 .state.auto   снимки состояния / save states
var SaveSuffixes = []string{
	".srm", ".sav", ".rtc", ".dsv", ".eep", ".fla", ".sra", ".mpk",
	".mcr", ".mcd", "_1.mcd", "_2.mcd",
	".state", ".state.auto",
	".state1", ".state2", ".state3", ".state4", ".state5", ".state6", ".state7", ".state8", ".state9",
}

// IsSaveSuffix reports whether s is one of SaveSuffixes (case-insensitive).
func IsSaveSuffix(s string) bool {
	for _, x := range SaveSuffixes {
		if strings.EqualFold(x, s) {
			return true
		}
	}
	return false
}

// SaveSuffixOf returns the save suffix of fileName for a given ROM base ("" if it is not its save).
func SaveSuffixOf(fileName, romBase string) string {
	if len(fileName) <= len(romBase) || !strings.EqualFold(fileName[:len(romBase)], romBase) {
		return ""
	}
	rest := fileName[len(romBase):]
	for _, x := range SaveSuffixes {
		if strings.EqualFold(x, rest) {
			return x
		}
	}
	return ""
}

// RomBaseName: имя рома без последнего расширения (.cue остаётся основой для образов).
func RomBaseName(romPath string) string {
	base := filepath.Base(romPath)
	return strings.TrimSuffix(base, filepath.Ext(base))
}

// SaveHistoryFolder returns <dir>/.aegis-saves/<base>.
func SaveHistoryFolder(dir, base string) string {
	return filepath.Join(dir, SaveHistoryDir, base)
}

var historyNameRe = regexp.MustCompile(`^(\d{8}-\d{6})(-\d+)?(.+)$`)

// ParseHistoryName splits "20261120-131830-2.srm" into stamp and suffix. ok=false for foreign files.
func ParseHistoryName(name string) (stamp, suffix string, ok bool) {
	m := historyNameRe.FindStringSubmatch(name)
	if m == nil || !IsSaveSuffix(m[3]) {
		return "", "", false
	}
	return m[1], m[3], true
}

// HistoryEntries lists history files of one suffix, newest first.
func HistoryEntries(dir, suffix string) []string {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	out := []string{}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		if _, sfx, ok := ParseHistoryName(e.Name()); ok && strings.EqualFold(sfx, suffix) {
			out = append(out, e.Name())
		}
	}
	// Имена начинаются с отметки времени: сортировка по имени = по времени.
	sort.Slice(out, func(i, j int) bool { return out[i] > out[j] })
	return out
}

// PruneSaveHistory keeps the newest `keep` versions of a suffix.
func PruneSaveHistory(dir, suffix string, keep int) {
	entries := HistoryEntries(dir, suffix)
	for i := keep; i < len(entries); i++ {
		_ = os.Remove(filepath.Join(dir, entries[i]))
	}
}

// freeHistoryPath returns a free <dir>/<stamp>[-N]<suffix>.
func freeHistoryPath(dir, stamp, suffix string) string {
	p := filepath.Join(dir, stamp+suffix)
	for i := 2; ; i++ {
		if _, err := os.Stat(p); os.IsNotExist(err) {
			return p
		}
		p = filepath.Join(dir, fmt.Sprintf("%s-%d%s", stamp, i, suffix))
	}
}

// BackupToHistory copies file into the history folder of base (in dir). Returns the new path.
func BackupToHistory(file, dir, base, suffix string, now time.Time) (string, error) {
	hdir := SaveHistoryFolder(dir, base)
	if err := os.MkdirAll(hdir, 0o755); err != nil {
		return "", err
	}
	dst := freeHistoryPath(hdir, now.Format("20060102-150405"), suffix)
	if err := copyKeepTime(file, dst); err != nil {
		return "", err
	}
	PruneSaveHistory(hdir, suffix, SaveHistoryKeep)
	return dst, nil
}

func copyKeepTime(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	st, err := in.Stat()
	if err != nil {
		return err
	}
	tmp := dst + ".aegis-tmp"
	out, err := os.Create(tmp)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		_ = os.Remove(tmp)
		return err
	}
	if err := out.Close(); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	if err := os.Rename(tmp, dst); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	_ = os.Chtimes(dst, st.ModTime(), st.ModTime())
	return nil
}

// moveFile renames, falling back to copy+remove across volumes; keeps the modification time.
func moveFile(src, dst string) error {
	if err := os.Rename(src, dst); err == nil {
		return nil
	}
	if err := copyKeepTime(src, dst); err != nil {
		return err
	}
	return os.Remove(src)
}

func sameFileBytes(a, b string) bool {
	sa, ea := os.Stat(a)
	sb, eb := os.Stat(b)
	if ea != nil || eb != nil || sa.Size() != sb.Size() {
		return false
	}
	da, ea := os.ReadFile(a)
	db, eb := os.ReadFile(b)
	return ea == nil && eb == nil && bytes.Equal(da, db)
}

// DeviceSyncSuffixes: сохранения, которые ездят на приставку и обратно. Снимки состояний (.state*)
// остаются дома: RetroArch на приставке открывает их только с той же версией ядра. Как
// DEVICE_SYNC_SUFFIXES в src/utils/saveFiles.ts.
// Saves that travel to the handheld and back. Save states stay home (same as the TS list).
func DeviceSyncSuffixes() []string {
	out := make([]string, 0, len(SaveSuffixes))
	for _, s := range SaveSuffixes {
		if !strings.HasPrefix(s, ".state") {
			out = append(out, s)
		}
	}
	return out
}

// BackupBytesToHistory кладёт data в историю base (в dir) с временем mtime.
// BackupBytesToHistory stores data in the history of base (in dir) with time mtime.
func BackupBytesToHistory(dir, base, suffix string, data []byte, mtime, now time.Time) (string, error) {
	if !IsSaveSuffix(suffix) {
		return "", fmt.Errorf("unknown save suffix %q", suffix)
	}
	hdir := SaveHistoryFolder(dir, base)
	if err := os.MkdirAll(hdir, 0o755); err != nil {
		return "", err
	}
	dst := freeHistoryPath(hdir, now.Format("20060102-150405"), suffix)
	tmp := dst + ".aegis-tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return "", err
	}
	if err := os.Rename(tmp, dst); err != nil {
		_ = os.Remove(tmp)
		return "", err
	}
	if !mtime.IsZero() {
		_ = os.Chtimes(dst, mtime, mtime)
	}
	PruneSaveHistory(hdir, suffix, SaveHistoryKeep)
	return dst, nil
}

// WriteSaveBytes writes data as <dir>/<base><suffix>. A different existing file is copied to
// history first; identical bytes are not rewritten. Returns the save path and the backup path.
func WriteSaveBytes(dir, base, suffix string, data []byte, now time.Time) (string, string, error) {
	if !IsSaveSuffix(suffix) {
		return "", "", fmt.Errorf("unknown save suffix %q", suffix)
	}
	target := filepath.Join(dir, base+suffix)
	backup := ""
	if old, err := os.ReadFile(target); err == nil {
		if bytes.Equal(old, data) {
			return target, "", nil
		}
		b, err := BackupToHistory(target, dir, base, suffix, now)
		if err != nil {
			return "", "", err
		}
		backup = b
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

// SaveMoveResult: what MoveRomSaves did (for the log).
type SaveMoveResult struct {
	Moved     int // файлов сохранений перенесено / save files moved
	Conflicts int // у цели уже было своё сохранение / the target already had its own save
	History   int // файлов истории перенесено / history files moved
}

// MoveRomSaves carries the saves of a ROM along when it is renamed or moved
// (rename, 1G1R winner, JP → RU replacement):
//
//  1. история .aegis-saves/<old>/ переезжает в .aegis-saves/<new>/ (имена не теряются);
//  2. каждое сохранение сначала копируется в историю, потом переименовывается;
//  3. если у нового имени уже есть своё сохранение, текущим остаётся более новое по времени,
//     а второе лежит в истории. Ничего не удаляется без копии.
//
// 1. history .aegis-saves/<old>/ moves to .aegis-saves/<new>/;
// 2. every save is copied into history first, then renamed;
// 3. if the new name already has its own save, the newer one by time stays current and the
// other one is kept in history. Nothing is dropped without a copy.
func MoveRomSaves(oldDir, newDir, oldBase, newBase string, now time.Time) SaveMoveResult {
	res := SaveMoveResult{}
	if oldDir == "" || oldBase == "" || newBase == "" {
		return res
	}
	if newDir == "" {
		newDir = oldDir
	}
	same := strings.EqualFold(filepath.Clean(oldDir), filepath.Clean(newDir)) && oldBase == newBase
	if same {
		return res
	}

	// 1. История. / History.
	oldHist := SaveHistoryFolder(oldDir, oldBase)
	newHist := SaveHistoryFolder(newDir, newBase)
	if entries, err := os.ReadDir(oldHist); err == nil && !strings.EqualFold(filepath.Clean(oldHist), filepath.Clean(newHist)) {
		_ = os.MkdirAll(newHist, 0o755)
		touched := map[string]bool{}
		for _, e := range entries {
			if e.IsDir() {
				continue
			}
			stamp, sfx, ok := ParseHistoryName(e.Name())
			if !ok {
				continue
			}
			dst := freeHistoryPath(newHist, stamp, sfx)
			if moveFile(filepath.Join(oldHist, e.Name()), dst) == nil {
				res.History++
				touched[sfx] = true
			}
		}
		for sfx := range touched {
			PruneSaveHistory(newHist, sfx, SaveHistoryKeep)
		}
		_ = os.Remove(oldHist)                               // только если пустая / only if empty
		_ = os.Remove(filepath.Join(oldDir, SaveHistoryDir)) // то же / same
	}

	// 2–3. Сами сохранения. / The saves themselves.
	for _, sfx := range SaveSuffixes {
		src := filepath.Join(oldDir, oldBase+sfx)
		sst, err := os.Stat(src)
		if err != nil || sst.IsDir() {
			continue
		}
		dst := filepath.Join(newDir, newBase+sfx)
		// Переименование только регистром (Windows): один и тот же файл.
		if strings.EqualFold(filepath.Clean(src), filepath.Clean(dst)) {
			if src != dst && moveFile(src, dst) == nil {
				res.Moved++
			}
			continue
		}
		if _, err := BackupToHistory(src, newDir, newBase, sfx, now); err != nil {
			continue // без копии не трогаем / no copy, no move
		}
		if dstSt, err := os.Stat(dst); err == nil && !dstSt.IsDir() {
			res.Conflicts++
			if sameFileBytes(src, dst) {
				_ = os.Remove(src)
				res.Moved++
				continue
			}
			if !sst.ModTime().After(dstSt.ModTime()) {
				// Своё сохранение цели новее: оно остаётся, перенесённое уже в истории.
				_ = os.Remove(src)
				continue
			}
			if _, err := BackupToHistory(dst, newDir, newBase, sfx, now); err != nil {
				continue
			}
		}
		if err := os.MkdirAll(newDir, 0o755); err != nil {
			continue
		}
		if moveFile(src, dst) == nil {
			res.Moved++
		}
	}
	return res
}
