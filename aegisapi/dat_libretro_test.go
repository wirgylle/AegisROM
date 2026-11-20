package aegisapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
)

const sampleClrDat = `clrmamepro (
	name "Nintendo - Nintendo Entertainment System"
	description "Nintendo - Nintendo Entertainment System"
)

game (
	name "Contra (USA)"
	region "USA"
	rom ( name "Contra (USA).nes" size 131088 crc 7D9B8A3B md5 00000000000000000000000000000000 sha1 0000000000000000000000000000000000000000 )
)
`

func TestFetchLibretroDats(t *testing.T) {
	var hits int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&hits, 1)
		switch r.URL.Path {
		case "/no-intro/Nintendo - Nintendo Entertainment System.dat":
			_, _ = w.Write([]byte(sampleClrDat))
		case "/no-intro/Sega - Game Gear.dat":
			_, _ = w.Write([]byte("<html>not a dat</html>"))
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()
	old := libretroDatBase
	libretroDatBase = srv.URL
	defer func() { libretroDatBase = old }()

	appDir := t.TempDir()
	mux := http.NewServeMux()
	registerDatRoutes(mux, appDir, func() {})

	post := func(body string) map[string]json.RawMessage {
		t.Helper()
		req := httptest.NewRequest(http.MethodPost, "/api/dat/fetch-libretro", bytes.NewBufferString(body))
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
		}
		var out map[string]json.RawMessage
		if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
			t.Fatal(err)
		}
		return out
	}

	out := post(`{"systems":["Nintendo - Nintendo Entertainment System","Sega - Game Gear","../../etc/passwd","Nintendo - Nintendo Entertainment System"]}`)
	var fetched, failed []libretroFetchResult
	_ = json.Unmarshal(out["fetched"], &fetched)
	_ = json.Unmarshal(out["failed"], &failed)
	if len(fetched) != 1 || fetched[0].Games != 1 {
		t.Fatalf("fetched = %+v", fetched)
	}
	if len(failed) != 2 {
		t.Fatalf("failed = %+v", failed)
	}
	// Мусор вместо DAT не попадает в папку. / A non-DAT response never lands in the folder.
	if _, err := os.Stat(filepath.Join(DatDir(appDir), LibretroDatFileName("no-intro", "Sega - Game Gear"))); err == nil {
		t.Error("invalid DAT was stored")
	}
	// Неизвестная система не превращается в запрос. / Unknown systems are not requested.
	if atomic.LoadInt32(&hits) != 2 {
		t.Errorf("hits = %d, want 2", hits)
	}
	if !strings.Contains(string(out["status"]), `"games":1`) {
		t.Errorf("status = %s", out["status"])
	}

	// Поиск по CRC после автозагрузки находит название. / Lookup by CRC works after the download.
	req := httptest.NewRequest(http.MethodPost, "/api/dat/lookup", bytes.NewBufferString(`{"items":[{"id":"1","system":"Nintendo - Nintendo Entertainment System","crc32":"7d9b8a3b","size":131088}]}`))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if !strings.Contains(rec.Body.String(), `"name":"Contra (USA)"`) || !strings.Contains(rec.Body.String(), `"source":"no-intro"`) {
		t.Errorf("lookup = %s", rec.Body.String())
	}

	// Повторный вызов не качает заново. / A second call does not download again.
	out = post(`{"systems":["Nintendo - Nintendo Entertainment System"]}`)
	var skipped []libretroFetchResult
	_ = json.Unmarshal(out["skipped"], &skipped)
	if len(skipped) != 1 || atomic.LoadInt32(&hits) != 2 {
		t.Errorf("skipped = %+v, hits = %d", skipped, hits)
	}
}
