package aegisapi

import (
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

// «Быстрый тест»: отдаёт файл рома встроенному WASM-эмулятору (EmulatorJS в окне приложения).
// Quick test: streams a ROM file to the in-app WASM emulator (EmulatorJS in the app window).
//
// GET /api/native/fs/rom?consoleCode=&romFileName=&relativePath=&libraryPath=&sdCardPath=
// Ищет файл так же, как запуск во внешнем эмуляторе, отдаёт только образы игр
// (QuickTestRomExts) не больше QuickTestMaxBytes. Для .cue отдаёт первый трек.
// Маршрут под /api/, значит закрыт Guard (токен сессии, проверка Origin и Host).

// QuickTestRomExts: образы, которые открывают встроенные WASM-ядра (см. src/utils/quickTest.ts).
var QuickTestRomExts = map[string]bool{
	".nes": true, ".unf": true, ".unif": true, ".sfc": true, ".smc": true, ".fig": true, ".swc": true, ".bs": true,
	".md": true, ".gen": true, ".smd": true, ".bin": true, ".sms": true, ".gg": true, ".sg": true,
	".gb": true, ".gbc": true, ".dmg": true, ".gba": true, ".agb": true, ".pce": true, ".sgx": true,
	".a26": true, ".chd": true, ".pbp": true, ".iso": true, ".img": true, ".cue": true, ".zip": true, ".7z": true,
}

// QuickTestMaxBytes: ром целиком живёт в памяти WASM, больше 1 ГБ в окне не тестируем.
const QuickTestMaxBytes = 1 << 30

// RomPathCandidates lists where a ROM from the library may live on disk:
// an absolute path, or a path relative to the library / SD card root (also inside <console>/).
func RomPathCandidates(consoleCode, romFileName, relativePath, libraryPath, sdCardPath string) []string {
	cLower := strings.ToLower(consoleCode)
	candidates := []string{}
	if relativePath != "" {
		relOS := filepath.FromSlash(relativePath)
		if filepath.IsAbs(relOS) {
			candidates = append(candidates, relOS)
		}
		if libraryPath != "" {
			candidates = append(candidates, filepath.Join(filepath.FromSlash(libraryPath), relOS))
		}
		if sdCardPath != "" {
			candidates = append(candidates, filepath.Join(filepath.FromSlash(sdCardPath), relOS))
		}
	}
	if romFileName != "" {
		if filepath.IsAbs(romFileName) {
			candidates = append(candidates, romFileName)
		}
		for _, baseDir := range []string{libraryPath, sdCardPath} {
			if baseDir == "" {
				continue
			}
			bOS := filepath.FromSlash(baseDir)
			candidates = append(candidates,
				filepath.Join(bOS, romFileName),
				filepath.Join(bOS, cLower, romFileName),
			)
		}
	}
	return candidates
}

// CueFirstTrack returns the first FILE entry of a .cue sheet, looked up next to the sheet.
// Only the base name is used, so a sheet cannot point reads into other folders.
func CueFirstTrack(cuePath string) string {
	st, err := os.Stat(cuePath)
	if err != nil || st.IsDir() || st.Size() > 1<<20 {
		return ""
	}
	data, err := os.ReadFile(cuePath)
	if err != nil {
		return ""
	}
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if len(line) < 5 || !strings.EqualFold(line[:5], "FILE ") {
			continue
		}
		rest := strings.TrimSpace(line[5:])
		name := ""
		if strings.HasPrefix(rest, "\"") {
			if end := strings.Index(rest[1:], "\""); end >= 0 {
				name = rest[1 : 1+end]
			}
		} else if f := strings.Fields(rest); len(f) > 0 {
			name = f[0]
		}
		if name == "" {
			return ""
		}
		base := filepath.Base(filepath.FromSlash(strings.ReplaceAll(name, "\\", "/")))
		p := filepath.Join(filepath.Dir(cuePath), base)
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			return p
		}
		return ""
	}
	return ""
}

// ResolveQuickTestRom finds the file to stream for a quick test request.
// It returns the path, or an HTTP status explaining why there is none.
func ResolveQuickTestRom(q url.Values) (string, int) {
	found := ""
	for _, c := range RomPathCandidates(q.Get("consoleCode"), q.Get("romFileName"), q.Get("relativePath"), q.Get("libraryPath"), q.Get("sdCardPath")) {
		if !QuickTestRomExts[strings.ToLower(filepath.Ext(c))] {
			continue
		}
		if st, err := os.Stat(c); err == nil && !st.IsDir() {
			found = c
			break
		}
	}
	if found == "" {
		return "", http.StatusNotFound
	}
	if strings.EqualFold(filepath.Ext(found), ".cue") {
		track := CueFirstTrack(found)
		if track == "" || !QuickTestRomExts[strings.ToLower(filepath.Ext(track))] || strings.EqualFold(filepath.Ext(track), ".cue") {
			return "", http.StatusNotFound
		}
		found = track
	}
	st, err := os.Stat(found)
	if err != nil || st.IsDir() {
		return "", http.StatusNotFound
	}
	if st.Size() > QuickTestMaxBytes {
		return "", http.StatusRequestEntityTooLarge
	}
	return found, http.StatusOK
}

// RegisterQuickTestRoutes adds GET /api/native/fs/rom (and /api/native/fs/manual, see manual.go).
func RegisterQuickTestRoutes(mux *http.ServeMux, touch func()) {
	if touch == nil {
		touch = func() {}
	}
	RegisterManualRoutes(mux, touch)
	mux.HandleFunc("/api/native/fs/rom", func(w http.ResponseWriter, r *http.Request) {
		touch()
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		path, status := ResolveQuickTestRom(r.URL.Query())
		if status != http.StatusOK {
			http.Error(w, http.StatusText(status), status)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Aegis-Rom-Name", url.PathEscape(filepath.Base(path)))
		w.Header().Set("Content-Type", "application/octet-stream")
		http.ServeFile(w, r, path)
	})
}
