package aegisapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestWriteSaveHistory(t *testing.T) {
	lib := t.TempDir()
	rom := filepath.Join(lib, "snes", "Chrono Trigger (USA).sfc")
	writeFile(t, rom, 64)
	now := time.Date(2026, 11, 20, 10, 0, 0, 0, time.UTC)

	p, backup, err := WriteSave(rom, "srm", []byte("v1"), now)
	if err != nil || backup != "" || filepath.Base(p) != "Chrono Trigger (USA).srm" {
		t.Fatalf("first write: %q %q %v", p, backup, err)
	}
	// Те же байты: ни записи, ни копии.
	if _, backup, _ = WriteSave(rom, "srm", []byte("v1"), now); backup != "" {
		t.Fatalf("same bytes made a backup %q", backup)
	}
	for i := 2; i <= SaveHistoryKeep+4; i++ {
		if _, _, err := WriteSave(rom, "srm", []byte{byte(i)}, now); err != nil {
			t.Fatal(err)
		}
	}
	hist := historyEntries(saveHistoryFolder(rom), ".srm")
	if len(hist) != SaveHistoryKeep {
		t.Fatalf("history has %d files, want %d", len(hist), SaveHistoryKeep)
	}
	got, _ := os.ReadFile(p)
	if !bytes.Equal(got, []byte{byte(SaveHistoryKeep + 4)}) {
		t.Fatalf("current save = %v", got)
	}
	if _, _, err := WriteSave(rom, "exe", []byte("x"), now); err == nil {
		t.Fatal("unknown kind accepted")
	}
}

func TestSaveRoutes(t *testing.T) {
	lib := t.TempDir()
	writeFile(t, filepath.Join(lib, "psx", "Game.bin"), 64)
	if err := os.WriteFile(filepath.Join(lib, "psx", "Game.cue"), []byte("FILE \"Game.bin\" BINARY\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	RegisterSaveRoutes(mux, nil)
	q := url.Values{"consoleCode": {"psx"}, "romFileName": {"Game.cue"}, "libraryPath": {lib}}

	do := func(method, path string, body []byte) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, httptest.NewRequest(method, path, bytes.NewReader(body)))
		return rec
	}

	if rec := do(http.MethodGet, "/api/native/saves?kind=srm&"+q.Encode(), nil); rec.Code != 404 {
		t.Fatalf("GET before write: %d", rec.Code)
	}
	if rec := do(http.MethodPut, "/api/native/saves?kind=srm&"+q.Encode(), []byte("memcard")); rec.Code != 200 {
		t.Fatalf("PUT: %d %s", rec.Code, rec.Body.String())
	}
	// Для .cue сохранение называется по .cue, как в RetroArch.
	if _, err := os.Stat(filepath.Join(lib, "psx", "Game.srm")); err != nil {
		t.Fatalf("Game.srm not written: %v", err)
	}
	rec := do(http.MethodGet, "/api/native/saves?kind=srm&"+q.Encode(), nil)
	if rec.Code != 200 || rec.Body.String() != "memcard" {
		t.Fatalf("GET: %d %q", rec.Code, rec.Body.String())
	}
	if rec := do(http.MethodPut, "/api/native/saves?kind=exe&"+q.Encode(), []byte("x")); rec.Code != 400 {
		t.Fatalf("bad kind: %d", rec.Code)
	}
	if rec := do(http.MethodPut, "/api/native/saves?kind=state&"+q.Encode(), nil); rec.Code != 400 {
		t.Fatalf("empty body: %d", rec.Code)
	}
	missing := url.Values{"consoleCode": {"psx"}, "romFileName": {"Nope.cue"}, "libraryPath": {lib}}
	if rec := do(http.MethodPut, "/api/native/saves?kind=srm&"+missing.Encode(), []byte("x")); rec.Code != 404 {
		t.Fatalf("missing rom: %d", rec.Code)
	}

	do(http.MethodPut, "/api/native/saves?kind=srm&"+q.Encode(), []byte("memcard2"))
	rec = do(http.MethodGet, "/api/native/saves/list?"+q.Encode(), nil)
	var list struct {
		Current []SaveFileInfo `json:"current"`
		History []SaveFileInfo `json:"history"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &list); err != nil {
		t.Fatal(err)
	}
	if len(list.Current) != 1 || len(list.History) != 1 {
		t.Fatalf("list: %+v", list)
	}
}
