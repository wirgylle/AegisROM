package aegisapi

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sync"
)

// Учёт ромов, для которых скраппер не нашёл медиа: <appDir>/scrape-misses.json.
// Ключ — ключ рома в базе (консоль + CRC), поэтому запись переживает перескан и переименование.
// Следующий запуск может пропустить эти ромы и не шерстить всё заново.
//
// ROMs the scraper found no media for: <appDir>/scrape-misses.json. The key is the ROM's database key
// (console + CRC), so it survives a rescan and a rename. The next run can skip them.

type scrapeMiss struct {
	Code   string `json:"code"`             // aegiscore.Miss* / ss-*
	At     int64  `json:"at"`               // unix ms
	Title  string `json:"title,omitempty"`  // для отображения / for display
	Source string `json:"source,omitempty"` // какие источники пробовали / sources tried
}

type scrapeMissStore struct {
	mu   sync.Mutex
	path string
	data map[string]scrapeMiss
}

func newScrapeMissStore(appDir string) *scrapeMissStore {
	s := &scrapeMissStore{path: filepath.Join(appDir, "scrape-misses.json"), data: map[string]scrapeMiss{}}
	if raw, err := os.ReadFile(s.path); err == nil {
		_ = json.Unmarshal(raw, &s.data)
	}
	return s
}

func (s *scrapeMissStore) snapshot() map[string]scrapeMiss {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make(map[string]scrapeMiss, len(s.data))
	for k, v := range s.data {
		out[k] = v
	}
	return out
}

func (s *scrapeMissStore) apply(set map[string]scrapeMiss, clear []string, clearAll bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if clearAll {
		s.data = map[string]scrapeMiss{}
	}
	for _, k := range clear {
		delete(s.data, k)
	}
	for k, v := range set {
		if k != "" {
			s.data[k] = v
		}
	}
	raw, err := json.Marshal(s.data)
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

// GET /api/scrape/misses → {"misses":{key:{code,at,…}}}
// POST /api/scrape/misses {"set":{key:{…}},"clear":[key],"clearAll":false}
func registerScrapeMissRoutes(mux *http.ServeMux, appDir string, touch func()) {
	store := newScrapeMissStore(appDir)
	mux.HandleFunc("/api/scrape/misses", func(w http.ResponseWriter, r *http.Request) {
		touch()
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		switch r.Method {
		case http.MethodGet:
			_ = json.NewEncoder(w).Encode(map[string]any{"misses": store.snapshot()})
		case http.MethodPost:
			var req struct {
				Set      map[string]scrapeMiss `json:"set"`
				Clear    []string              `json:"clear"`
				ClearAll bool                  `json:"clearAll"`
			}
			if err := json.NewDecoder(io.LimitReader(r.Body, 32<<20)).Decode(&req); err != nil {
				w.WriteHeader(http.StatusBadRequest)
				_ = json.NewEncoder(w).Encode(map[string]any{"ok": false, "error": "bad json"})
				return
			}
			if err := store.apply(req.Set, req.Clear, req.ClearAll); err != nil {
				w.WriteHeader(http.StatusInternalServerError)
				_ = json.NewEncoder(w).Encode(map[string]any{"ok": false, "error": err.Error()})
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "count": len(store.snapshot())})
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
}
