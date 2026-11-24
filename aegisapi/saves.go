package aegisapi

import (
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

	"aegisgui/aegiscore"
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

// SaveKinds: виды сохранений встроенного запуска. srm = SRAM / карта памяти ядра, state = снимок.
// Kinds used by the in-app player. Other suffixes (aegiscore.SaveSuffixes) go through ?suffix=.
var SaveKinds = map[string]string{"srm": ".srm", "state": ".state"}

// SaveMaxBytes: состояние PS1 около 5 МБ, карта PS2 8 МБ, с запасом.
const SaveMaxBytes = 64 << 20

// SaveHistoryKeep и SaveHistoryDir живут в aegiscore (их использует и переименование).
const SaveHistoryKeep = aegiscore.SaveHistoryKeep
const SaveHistoryDir = aegiscore.SaveHistoryDir

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

func romBaseName(romPath string) string { return aegiscore.RomBaseName(romPath) }

// SavePathFor returns <rom folder>/<rom base><ext> for a kind, or "" for an unknown kind.
func SavePathFor(romPath, kind string) string {
	ext, ok := SaveKinds[kind]
	if !ok || romPath == "" {
		return ""
	}
	return filepath.Join(filepath.Dir(romPath), romBaseName(romPath)+ext)
}

func saveHistoryFolder(romPath string) string {
	return aegiscore.SaveHistoryFolder(filepath.Dir(romPath), romBaseName(romPath))
}

// WriteSave writes data as the save of romPath (kind srm|state). If a different save already exists
// it is copied into the history folder first. Same bytes = nothing is written (the player saves every 30 s).
// Returns the save path and the backup path ("" when no backup was made).
func WriteSave(romPath, kind string, data []byte, now time.Time) (string, string, error) {
	ext, ok := SaveKinds[kind]
	if !ok {
		return "", "", fmt.Errorf("unknown save kind %q", kind)
	}
	return aegiscore.WriteSaveBytes(filepath.Dir(romPath), romBaseName(romPath), ext, data, now)
}

// SaveFileInfo describes one save file for the list endpoints.
type SaveFileInfo struct {
	Name     string `json:"name"`
	Kind     string `json:"kind"`   // srm | state | sav | state.auto | 1.mcd …
	Suffix   string `json:"suffix"` // .srm, .state.auto, _1.mcd …
	Size     int64  `json:"size"`
	Modified string `json:"modified"`
	// Только у найденных в папках эмуляторов. / Emulator folders only.
	Path   string `json:"path,omitempty"`
	Source string `json:"source,omitempty"`
	Shared bool   `json:"shared,omitempty"` // общая карта памяти (PS2), не одной игры
}

func kindOfSuffix(sfx string) string {
	return strings.TrimLeft(strings.ToLower(sfx), "._")
}

func fileInfo(path, suffix string) *SaveFileInfo {
	st, err := os.Stat(path)
	if err != nil || st.IsDir() {
		return nil
	}
	return &SaveFileInfo{
		Name: filepath.Base(path), Kind: kindOfSuffix(suffix), Suffix: suffix,
		Size: st.Size(), Modified: st.ModTime().UTC().Format(time.RFC3339),
	}
}

// ListSaves returns the current save files and the history of a ROM.
func ListSaves(romPath string) map[string]interface{} {
	current := []SaveFileInfo{}
	history := []SaveFileInfo{}
	dir := filepath.Dir(romPath)
	base := romBaseName(romPath)
	hist := saveHistoryFolder(romPath)
	for _, sfx := range aegiscore.SaveSuffixes {
		if fi := fileInfo(filepath.Join(dir, base+sfx), sfx); fi != nil {
			current = append(current, *fi)
		}
		for _, n := range aegiscore.HistoryEntries(hist, sfx) {
			if fi := fileInfo(filepath.Join(hist, n), sfx); fi != nil {
				history = append(history, *fi)
			}
		}
	}
	// Новые сверху независимо от вида. / Newest first across kinds.
	sort.SliceStable(history, func(i, j int) bool { return history[i].Name > history[j].Name })
	return map[string]interface{}{"rom": filepath.Base(romPath), "base": base, "dir": dir, "current": current, "history": history}
}

// EmulatorSaveDirs: где эмуляторы из «Среды» держат сохранения. emus — пути к exe или папкам.
// RetroArch: saves/, states/ (и подпапки ядер); DuckStation, PCSX2, ePSXe: memcards/.
// Плюс стандартные папки DuckStation и PCSX2 в «Документах».
// Where emulators from Environment keep saves. emus are exe or folder paths.
func EmulatorSaveDirs(emus []string) []string {
	seen := map[string]bool{}
	out := []string{}
	add := func(d string) {
		if d == "" {
			return
		}
		d = filepath.Clean(d)
		key := strings.ToLower(d)
		if seen[key] {
			return
		}
		if st, err := os.Stat(d); err != nil || !st.IsDir() {
			return
		}
		seen[key] = true
		out = append(out, d)
	}
	addTree := func(d string) {
		add(d)
		entries, err := os.ReadDir(d)
		if err != nil {
			return
		}
		for _, e := range entries {
			if e.IsDir() && !strings.HasPrefix(e.Name(), ".") {
				add(filepath.Join(d, e.Name()))
			}
		}
	}
	roots := []string{}
	for _, e := range emus {
		e = strings.TrimSpace(strings.Trim(e, `"`))
		if e == "" {
			continue
		}
		e = filepath.FromSlash(e)
		if st, err := os.Stat(e); err == nil && !st.IsDir() {
			e = filepath.Dir(e)
		}
		roots = append(roots, e)
	}
	if home, err := os.UserHomeDir(); err == nil {
		roots = append(roots,
			filepath.Join(home, "Documents", "DuckStation"),
			filepath.Join(home, "Documents", "PCSX2"),
			filepath.Join(home, ".config", "retroarch"),
		)
	}
	for _, r := range roots {
		for _, sub := range []string{"saves", "states", "memcards", "sstates"} {
			addTree(filepath.Join(r, sub))
		}
	}
	return out
}

// FindEmulatorSaves looks for saves of a ROM (same base name) in emulator folders.
// For PS2 the shared memory cards (*.ps2) are listed too, marked Shared.
func FindEmulatorSaves(romPath, consoleCode string, emus []string) []SaveFileInfo {
	base := romBaseName(romPath)
	romDir := strings.ToLower(filepath.Clean(filepath.Dir(romPath)))
	ps2 := strings.EqualFold(consoleCode, "ps2")
	out := []SaveFileInfo{}
	for _, d := range EmulatorSaveDirs(emus) {
		if strings.ToLower(d) == romDir {
			continue
		}
		entries, err := os.ReadDir(d)
		if err != nil {
			continue
		}
		for _, e := range entries {
			if e.IsDir() {
				continue
			}
			name := e.Name()
			sfx := aegiscore.SaveSuffixOf(name, base)
			shared := false
			if sfx == "" {
				if !ps2 || !strings.EqualFold(filepath.Ext(name), ".ps2") {
					continue
				}
				sfx, shared = ".ps2", true
			}
			p := filepath.Join(d, name)
			fi := fileInfo(p, sfx)
			if fi == nil {
				continue
			}
			fi.Path = p
			fi.Source = d
			fi.Shared = shared
			out = append(out, *fi)
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Modified > out[j].Modified })
	return out
}

func readLimited(r io.Reader) ([]byte, int) {
	body, err := io.ReadAll(io.LimitReader(r, SaveMaxBytes+1))
	if err != nil {
		return nil, http.StatusBadRequest
	}
	if len(body) == 0 {
		return nil, http.StatusBadRequest
	}
	if len(body) > SaveMaxBytes {
		return nil, http.StatusRequestEntityTooLarge
	}
	return body, 0
}

func writeJSON(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(v)
}

// suffixFromQuery: ?kind=srm|state (плеер) или ?suffix=.sav (карточка игры).
func suffixFromQuery(q url.Values) string {
	if k := q.Get("kind"); k != "" {
		return SaveKinds[k]
	}
	s := q.Get("suffix")
	for _, x := range aegiscore.SaveSuffixes {
		if strings.EqualFold(x, s) {
			return x
		}
	}
	return ""
}

func writeSaveResponse(w http.ResponseWriter, path, backup string) {
	resp := map[string]interface{}{"ok": true, "name": filepath.Base(path), "dir": filepath.Dir(path)}
	if backup != "" {
		resp["backup"] = filepath.Base(backup)
	}
	writeJSON(w, resp)
}

// RegisterSaveRoutes adds the save endpoints:
//
//	GET|PUT /api/native/saves?<rom>&kind=srm|state | &suffix=.sav   текущий файл / current file
//	GET  /api/native/saves/list?<rom>                               текущие и история / current and history
//	GET  /api/native/saves/history?<rom>&name=<файл истории>         скачать версию / download a version
//	POST /api/native/saves/restore?<rom>&name=<файл истории>         сделать текущей / make it current
//	GET  /api/native/saves/external?<rom>&emu=<exe|папка>…          в папках эмуляторов / in emulator folders
//	POST /api/native/saves/import-external?<rom>&path=<файл>&emu=…  забрать оттуда / copy it next to the ROM
func RegisterSaveRoutes(mux *http.ServeMux, touch func()) {
	if touch == nil {
		touch = func() {}
	}
	romOr404 := func(w http.ResponseWriter, r *http.Request) string {
		rom := ResolveRomOnDisk(r.URL.Query())
		if rom == "" {
			http.Error(w, "rom not found", http.StatusNotFound)
		}
		w.Header().Set("Cache-Control", "no-store")
		return rom
	}

	mux.HandleFunc("/api/native/saves", func(w http.ResponseWriter, r *http.Request) {
		touch()
		q := r.URL.Query()
		sfx := suffixFromQuery(q)
		if sfx == "" {
			http.Error(w, "unknown kind", http.StatusBadRequest)
			return
		}
		rom := romOr404(w, r)
		if rom == "" {
			return
		}
		dir, base := filepath.Dir(rom), romBaseName(rom)
		switch r.Method {
		case http.MethodGet, http.MethodHead:
			p := filepath.Join(dir, base+sfx)
			if st, err := os.Stat(p); err != nil || st.IsDir() {
				http.Error(w, "no save", http.StatusNotFound)
				return
			}
			w.Header().Set("X-Aegis-Save-Name", url.PathEscape(filepath.Base(p)))
			w.Header().Set("Content-Type", "application/octet-stream")
			http.ServeFile(w, r, p)
		case http.MethodPut, http.MethodPost:
			body, code := readLimited(r.Body)
			if code != 0 {
				http.Error(w, "bad save body", code)
				return
			}
			path, backup, err := aegiscore.WriteSaveBytes(dir, base, sfx, body, time.Now())
			if err != nil {
				http.Error(w, "write failed: "+err.Error(), http.StatusInternalServerError)
				return
			}
			writeSaveResponse(w, path, backup)
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
		if rom := romOr404(w, r); rom != "" {
			writeJSON(w, ListSaves(rom))
		}
	})

	// Файл истории: только имя вида <отметка><суффикс> внутри .aegis-saves/<ром>/.
	historyFile := func(rom, name string) (string, string) {
		if name != filepath.Base(name) {
			return "", ""
		}
		_, sfx, ok := aegiscore.ParseHistoryName(name)
		if !ok {
			return "", ""
		}
		p := filepath.Join(saveHistoryFolder(rom), name)
		if st, err := os.Stat(p); err != nil || st.IsDir() {
			return "", ""
		}
		return p, sfx
	}

	mux.HandleFunc("/api/native/saves/history", func(w http.ResponseWriter, r *http.Request) {
		touch()
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		rom := romOr404(w, r)
		if rom == "" {
			return
		}
		p, _ := historyFile(rom, r.URL.Query().Get("name"))
		if p == "" {
			http.Error(w, "no such version", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/octet-stream")
		http.ServeFile(w, r, p)
	})

	mux.HandleFunc("/api/native/saves/restore", func(w http.ResponseWriter, r *http.Request) {
		touch()
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		rom := romOr404(w, r)
		if rom == "" {
			return
		}
		p, sfx := historyFile(rom, r.URL.Query().Get("name"))
		if p == "" {
			http.Error(w, "no such version", http.StatusNotFound)
			return
		}
		data, err := os.ReadFile(p)
		if err != nil || len(data) == 0 {
			http.Error(w, "read failed", http.StatusInternalServerError)
			return
		}
		path, backup, err := aegiscore.WriteSaveBytes(filepath.Dir(rom), romBaseName(rom), sfx, data, time.Now())
		if err != nil {
			http.Error(w, "write failed: "+err.Error(), http.StatusInternalServerError)
			return
		}
		writeSaveResponse(w, path, backup)
	})

	mux.HandleFunc("/api/native/saves/external", func(w http.ResponseWriter, r *http.Request) {
		touch()
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		rom := romOr404(w, r)
		if rom == "" {
			return
		}
		q := r.URL.Query()
		writeJSON(w, map[string]interface{}{"files": FindEmulatorSaves(rom, q.Get("consoleCode"), q["emu"])})
	})

	// Забрать сохранение из папки эмулятора. Путь принимается, только если его же нашёл /external
	// для этого рома: чужие файлы так не прочитать.
	// Copy a save from an emulator folder. The path is accepted only if /external finds it for this ROM.
	mux.HandleFunc("/api/native/saves/import-external", func(w http.ResponseWriter, r *http.Request) {
		touch()
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		rom := romOr404(w, r)
		if rom == "" {
			return
		}
		q := r.URL.Query()
		want := filepath.Clean(filepath.FromSlash(q.Get("path")))
		var hit *SaveFileInfo
		for _, f := range FindEmulatorSaves(rom, q.Get("consoleCode"), q["emu"]) {
			if strings.EqualFold(filepath.Clean(f.Path), want) {
				f := f
				hit = &f
				break
			}
		}
		if hit == nil || hit.Shared {
			http.Error(w, "not a save of this rom", http.StatusForbidden)
			return
		}
		if hit.Size > SaveMaxBytes {
			http.Error(w, "save too large", http.StatusRequestEntityTooLarge)
			return
		}
		data, err := os.ReadFile(hit.Path)
		if err != nil || len(data) == 0 {
			http.Error(w, "read failed", http.StatusInternalServerError)
			return
		}
		path, backup, err := aegiscore.WriteSaveBytes(filepath.Dir(rom), romBaseName(rom), hit.Suffix, data, time.Now())
		if err != nil {
			http.Error(w, "write failed: "+err.Error(), http.StatusInternalServerError)
			return
		}
		writeSaveResponse(w, path, backup)
	})
}
