package aegisapi

import (
	"aegisgui/aegiscore/dat"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

// Предел размера одного загружаемого DAT. Самые большие DAT Redump/No-Intro в ZIP — десятки МБ.
// Size limit for one uploaded DAT. The largest Redump/No-Intro DATs are tens of MB zipped.
const maxDatUpload = 256 << 20

// Предел числа ромов в одном запросе поиска. / Max ROMs per lookup request.
const maxDatLookupItems = 2000

// DatDir — папка с DAT-файлами внутри appDir. / Folder with DAT files inside appDir.
func DatDir(appDir string) string { return filepath.Join(appDir, "dats") }

// registerDatRoutes: поиск названий по хешу в DAT No-Intro/Redump.
//
//	GET  /api/dat/status          — загруженные DAT и путь к папке
//	POST /api/dat/reload          — перечитать папку
//	POST /api/dat/import?name=X   — сохранить DAT/ZIP из тела запроса в папку и перечитать
//	POST /api/dat/lookup          — {"items":[dat.Query]} → {"results":[dat.Match]}
//
// registerDatRoutes: title lookup by hash in No-Intro/Redump DATs (see routes above).
func registerDatRoutes(mux *http.ServeMux, appDir string, touch func()) {
	dir := DatDir(appDir)
	ix := dat.NewIndex()
	var loadOnce sync.Once
	var reloadMu sync.Mutex
	ensure := func() {
		loadOnce.Do(func() {
			_ = os.MkdirAll(dir, 0o755)
			ix.LoadDir(dir)
		})
	}
	reload := func() dat.Status {
		reloadMu.Lock()
		defer reloadMu.Unlock()
		ensure()
		return ix.LoadDir(dir)
	}
	writeJSON := func(w http.ResponseWriter, v any) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		_ = json.NewEncoder(w).Encode(v)
	}

	mux.HandleFunc("/api/dat/status", func(w http.ResponseWriter, r *http.Request) {
		touch()
		ensure()
		writeJSON(w, ix.Status())
	})

	mux.HandleFunc("/api/dat/reload", func(w http.ResponseWriter, r *http.Request) {
		touch()
		if r.Method != http.MethodPost {
			http.Error(w, "POST only", http.StatusMethodNotAllowed)
			return
		}
		writeJSON(w, reload())
	})

	mux.HandleFunc("/api/dat/import", func(w http.ResponseWriter, r *http.Request) {
		touch()
		if r.Method != http.MethodPost {
			http.Error(w, "POST only", http.StatusMethodNotAllowed)
			return
		}
		name := filepath.Base(strings.ReplaceAll(r.URL.Query().Get("name"), "\\", "/"))
		ext := strings.ToLower(filepath.Ext(name))
		if name == "." || name == "/" || strings.HasPrefix(name, ".") || (ext != ".dat" && ext != ".xml" && ext != ".zip") {
			http.Error(w, "нужен файл .dat, .xml или .zip / expected a .dat, .xml or .zip file", http.StatusBadRequest)
			return
		}
		ensure()
		tmp, err := os.CreateTemp(dir, ".upload-*"+ext)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		tmpPath := tmp.Name()
		defer os.Remove(tmpPath)
		_, err = io.Copy(tmp, http.MaxBytesReader(w, r.Body, maxDatUpload))
		tmp.Close()
		if err != nil {
			http.Error(w, "не удалось принять файл / upload failed: "+err.Error(), http.StatusBadRequest)
			return
		}
		// Проверяем, что это DAT, до того как класть в папку. / Validate before storing.
		if _, _, err := dat.ParseFile(tmpPath); err != nil {
			http.Error(w, "файл не похож на DAT / not a DAT file: "+err.Error(), http.StatusBadRequest)
			return
		}
		if err := os.Rename(tmpPath, filepath.Join(dir, name)); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, reload())
	})

	// POST /api/dat/fetch-libretro — {"systems":["Sony - PlayStation"],"force":false}:
	// скачать DAT No-Intro/Redump из libretro-database и перечитать папку.
	// Download No-Intro/Redump DATs from libretro-database and reload the folder.
	mux.HandleFunc("/api/dat/fetch-libretro", func(w http.ResponseWriter, r *http.Request) {
		touch()
		if r.Method != http.MethodPost {
			http.Error(w, "POST only", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			Systems []string `json:"systems"`
			Force   bool     `json:"force"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&req); err != nil {
			http.Error(w, "bad JSON: "+err.Error(), http.StatusBadRequest)
			return
		}
		if len(req.Systems) > 64 {
			http.Error(w, "too many systems", http.StatusRequestEntityTooLarge)
			return
		}
		ensure()
		reloadMu.Lock()
		fetched, skipped, failed := libretroFetchAll(dir, req.Systems, req.Force)
		reloadMu.Unlock()
		st := reload()
		writeJSON(w, map[string]any{"fetched": fetched, "skipped": skipped, "failed": failed, "status": st})
	})

	mux.HandleFunc("/api/dat/lookup", func(w http.ResponseWriter, r *http.Request) {
		touch()
		if r.Method != http.MethodPost {
			http.Error(w, "POST only", http.StatusMethodNotAllowed)
			return
		}
		ensure()
		var req struct {
			Items []dat.Query `json:"items"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<20)).Decode(&req); err != nil {
			http.Error(w, "bad JSON: "+err.Error(), http.StatusBadRequest)
			return
		}
		if len(req.Items) > maxDatLookupItems {
			http.Error(w, "too many items", http.StatusRequestEntityTooLarge)
			return
		}
		results := make([]dat.Match, len(req.Items))
		for i, q := range req.Items {
			results[i] = ix.Lookup(q)
		}
		st := ix.Status()
		writeJSON(w, map[string]any{"results": results, "dats": len(st.Dats), "games": st.Games})
	})
}
