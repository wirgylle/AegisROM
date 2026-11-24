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

	"aegisgui/aegiscore"
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
	hist := aegiscore.HistoryEntries(saveHistoryFolder(rom), ".srm")
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

func TestSaveManagerRoutes(t *testing.T) {
	lib := t.TempDir()
	writeFile(t, filepath.Join(lib, "gba", "Golden Sun (USA).gba"), 64)
	emu := t.TempDir()
	exe := filepath.Join(emu, "retroarch.exe")
	writeFile(t, exe, 1)
	if err := os.MkdirAll(filepath.Join(emu, "saves", "mGBA"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(emu, "saves", "mGBA", "Golden Sun (USA).srm"), []byte("from-ra"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(emu, "saves", "Other Game.srm"), []byte("nope"), 0o644); err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	RegisterSaveRoutes(mux, nil)
	q := url.Values{"consoleCode": {"gba"}, "romFileName": {"Golden Sun (USA).gba"}, "libraryPath": {lib}}
	do := func(method, path string, body []byte) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, httptest.NewRequest(method, path, bytes.NewReader(body)))
		return rec
	}

	// Импорт .sav с диска пользователя через ?suffix=.
	if rec := do(http.MethodPut, "/api/native/saves?suffix=.sav&"+q.Encode(), []byte("v1")); rec.Code != 200 {
		t.Fatalf("PUT sav: %d %s", rec.Code, rec.Body.String())
	}
	do(http.MethodPut, "/api/native/saves?suffix=.sav&"+q.Encode(), []byte("v2"))
	if rec := do(http.MethodPut, "/api/native/saves?suffix=.exe&"+q.Encode(), []byte("x")); rec.Code != 400 {
		t.Fatalf("foreign suffix: %d", rec.Code)
	}

	var list struct {
		Current []SaveFileInfo `json:"current"`
		History []SaveFileInfo `json:"history"`
	}
	_ = json.Unmarshal(do(http.MethodGet, "/api/native/saves/list?"+q.Encode(), nil).Body.Bytes(), &list)
	if len(list.Current) != 1 || list.Current[0].Kind != "sav" || len(list.History) != 1 {
		t.Fatalf("list: %+v", list)
	}
	old := list.History[0].Name
	if rec := do(http.MethodGet, "/api/native/saves/history?name="+url.QueryEscape(old)+"&"+q.Encode(), nil); rec.Body.String() != "v1" {
		t.Fatalf("history get: %d %q", rec.Code, rec.Body.String())
	}
	if rec := do(http.MethodGet, "/api/native/saves/history?name=..%2F..%2Fsecret.srm&"+q.Encode(), nil); rec.Code != 404 {
		t.Fatalf("traversal: %d", rec.Code)
	}
	if rec := do(http.MethodPost, "/api/native/saves/restore?name="+url.QueryEscape(old)+"&"+q.Encode(), nil); rec.Code != 200 {
		t.Fatalf("restore: %d %s", rec.Code, rec.Body.String())
	}
	if b, _ := os.ReadFile(filepath.Join(lib, "gba", "Golden Sun (USA).sav")); string(b) != "v1" {
		t.Fatalf("restored = %q", b)
	}

	// Папки эмуляторов: находится только сохранение этой игры.
	qe := url.Values{}
	for k, v := range q {
		qe[k] = v
	}
	qe.Set("emu", exe)
	var ext struct {
		Files []SaveFileInfo `json:"files"`
	}
	_ = json.Unmarshal(do(http.MethodGet, "/api/native/saves/external?"+qe.Encode(), nil).Body.Bytes(), &ext)
	if len(ext.Files) != 1 || ext.Files[0].Suffix != ".srm" {
		t.Fatalf("external: %+v", ext.Files)
	}
	qi := url.Values{}
	for k, v := range qe {
		qi[k] = v
	}
	qi.Set("path", ext.Files[0].Path)
	if rec := do(http.MethodPost, "/api/native/saves/import-external?"+qi.Encode(), nil); rec.Code != 200 {
		t.Fatalf("import-external: %d %s", rec.Code, rec.Body.String())
	}
	if b, _ := os.ReadFile(filepath.Join(lib, "gba", "Golden Sun (USA).srm")); string(b) != "from-ra" {
		t.Fatalf("imported = %q", b)
	}
	qi.Set("path", filepath.Join(emu, "saves", "Other Game.srm"))
	if rec := do(http.MethodPost, "/api/native/saves/import-external?"+qi.Encode(), nil); rec.Code != 403 {
		t.Fatalf("foreign file: %d", rec.Code)
	}
}
