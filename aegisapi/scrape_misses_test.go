package aegisapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestScrapeMissesPersist(t *testing.T) {
	dir := t.TempDir()
	mux := http.NewServeMux()
	registerScrapeMissRoutes(mux, dir, func() {})
	post := func(body string) {
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/scrape/misses", strings.NewReader(body)))
		if rec.Code != 200 {
			t.Fatalf("%s → %d %s", body, rec.Code, rec.Body.String())
		}
	}
	post(`{"set":{"NES:ab12":{"code":"not-in-db","at":1},"SNES:cd34":{"code":"network","at":2}}}`)
	post(`{"clear":["SNES:cd34"]}`)

	// Новый экземпляр читает файл с диска. / A new instance reads the file from disk.
	mux2 := http.NewServeMux()
	registerScrapeMissRoutes(mux2, dir, func() {})
	rec := httptest.NewRecorder()
	mux2.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/scrape/misses", nil))
	var out struct {
		Misses map[string]scrapeMiss `json:"misses"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if len(out.Misses) != 1 || out.Misses["NES:ab12"].Code != "not-in-db" {
		t.Errorf("misses: %+v", out.Misses)
	}
}
