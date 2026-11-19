package aegisapi

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"time"
)

// Хранилище настроек UI на диске / On-disk store for UI state.
//
// RU: Настройки и базы библиотек фронтенд держит в localStorage и IndexedDB
// окна браузера. Они привязаны к профилю конкретного браузера (Edge --app) и
// пропадут при переходе на нативное окно (Wails/WebView2, WKWebView). Поэтому
// фронтенд зеркалит их сюда, в appDir/storage/<key>.json, а новое окно
// восстанавливает их отсюда при первом запуске.
//
// EN: The frontend keeps settings and library databases in localStorage and
// IndexedDB, which belong to one browser profile (Edge --app) and would be lost
// when moving to a native window (Wails/WebView2, WKWebView). The frontend
// mirrors them here, to appDir/storage/<key>.json, and a new window restores
// them from here on first launch.
//
//	GET    /api/native/storage            -> {"ok":true,"keys":{"<key>":"<RFC3339 mtime>"}}
//	GET    /api/native/storage?key=K      -> stored value as is, 404 if absent
//	PUT    /api/native/storage?key=K      -> body stored as is
//	DELETE /api/native/storage?key=K
const storageMaxBytes = 512 << 20

var storageKeyRe = regexp.MustCompile(`^[A-Za-z0-9_.-]{1,96}$`)

// RegisterStorageRoutes adds /api/native/storage to mux (data in dataDir/storage).
func RegisterStorageRoutes(mux *http.ServeMux, dataDir string, touch func()) {
	if touch == nil {
		touch = func() {}
	}
	dir := filepath.Join(dataDir, "storage")

	mux.HandleFunc("/api/native/storage", func(w http.ResponseWriter, r *http.Request) {
		touch()
		w.Header().Set("Cache-Control", "no-store")
		key := r.URL.Query().Get("key")

		if key == "" {
			if r.Method != http.MethodGet {
				http.Error(w, "key required", http.StatusBadRequest)
				return
			}
			keys := map[string]string{}
			if entries, err := os.ReadDir(dir); err == nil {
				for _, e := range entries {
					name := e.Name()
					if e.IsDir() || filepath.Ext(name) != ".json" {
						continue
					}
					k := name[:len(name)-len(".json")]
					if !storageKeyRe.MatchString(k) {
						continue
					}
					if info, err := e.Info(); err == nil {
						keys[k] = info.ModTime().UTC().Format(time.RFC3339)
					}
				}
			}
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "keys": keys})
			return
		}

		if !storageKeyRe.MatchString(key) {
			http.Error(w, "invalid key", http.StatusBadRequest)
			return
		}
		path := filepath.Join(dir, key+".json")

		switch r.Method {
		case http.MethodGet:
			raw, err := os.ReadFile(path)
			if err != nil {
				http.Error(w, "not found", http.StatusNotFound)
				return
			}
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			_, _ = w.Write(raw)
		case http.MethodPut, http.MethodPost:
			body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, storageMaxBytes))
			if err != nil {
				http.Error(w, "body too large or unreadable", http.StatusRequestEntityTooLarge)
				return
			}
			if err := writeFileAtomic(dir, path, body); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			_, _ = w.Write([]byte(`{"ok":true}`))
		case http.MethodDelete:
			if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			_, _ = w.Write([]byte(`{"ok":true}`))
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
}

// writeFileAtomic writes through a temp file and rename, so a crash never
// leaves a half-written library database.
func writeFileAtomic(dir, path string, data []byte) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, ".tmp-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		_ = os.Remove(tmpName)
		return err
	}
	if err := tmp.Close(); err != nil {
		_ = os.Remove(tmpName)
		return err
	}
	if err := os.Rename(tmpName, path); err != nil {
		_ = os.Remove(tmpName)
		return err
	}
	return nil
}
