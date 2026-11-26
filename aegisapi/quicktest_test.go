package aegisapi

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"testing"
)

func writeFile(t *testing.T, path string, size int) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, make([]byte, size), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestQuickTestRomResolve(t *testing.T) {
	lib := t.TempDir()
	writeFile(t, filepath.Join(lib, "nes", "Game (USA).nes"), 40)
	writeFile(t, filepath.Join(lib, "psx", "Disc (Track 1).bin"), 64)
	writeFile(t, filepath.Join(lib, "psx", "secret.txt"), 3)
	cue := "FILE \"Disc (Track 1).bin\" BINARY\r\n  TRACK 01 MODE2/2352\r\nFILE \"Disc (Track 2).bin\" BINARY\r\n"
	if err := os.WriteFile(filepath.Join(lib, "psx", "Disc.cue"), []byte(cue), 0o644); err != nil {
		t.Fatal(err)
	}
	evil := "FILE \"../nes/Game (USA).nes\" BINARY\n"
	if err := os.WriteFile(filepath.Join(lib, "psx", "Evil.cue"), []byte(evil), 0o644); err != nil {
		t.Fatal(err)
	}

	cases := []struct {
		name   string
		q      url.Values
		status int
		base   string
	}{
		{"in console folder", url.Values{"consoleCode": {"NES"}, "romFileName": {"Game (USA).nes"}, "libraryPath": {lib}}, 200, "Game (USA).nes"},
		{"relative path", url.Values{"relativePath": {"nes/Game (USA).nes"}, "libraryPath": {lib}}, 200, "Game (USA).nes"},
		{"cue -> first track", url.Values{"consoleCode": {"psx"}, "romFileName": {"Disc.cue"}, "libraryPath": {lib}}, 200, "Disc (Track 1).bin"},
		{"cue cannot leave its folder", url.Values{"consoleCode": {"psx"}, "romFileName": {"Evil.cue"}, "libraryPath": {lib}}, 404, ""},
		{"not a rom extension", url.Values{"consoleCode": {"psx"}, "romFileName": {"secret.txt"}, "libraryPath": {lib}}, 404, ""},
		{"missing", url.Values{"consoleCode": {"nes"}, "romFileName": {"Nope.nes"}, "libraryPath": {lib}}, 404, ""},
	}
	for _, c := range cases {
		got, status := ResolveQuickTestRom(c.q)
		if status != c.status {
			t.Errorf("%s: status %d, want %d", c.name, status, c.status)
			continue
		}
		if c.base != "" && filepath.Base(got) != c.base {
			t.Errorf("%s: got %q, want %q", c.name, got, c.base)
		}
	}
}

func TestQuickTestRomRoute(t *testing.T) {
	lib := t.TempDir()
	writeFile(t, filepath.Join(lib, "gba", "Hello World.gba"), 128)
	mux := http.NewServeMux()
	RegisterQuickTestRoutes(mux, nil)

	q := url.Values{"consoleCode": {"gba"}, "romFileName": {"Hello World.gba"}, "libraryPath": {lib}}
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/native/fs/rom?"+q.Encode(), nil))
	if rec.Code != 200 || rec.Body.Len() != 128 {
		t.Fatalf("GET: code %d, len %d", rec.Code, rec.Body.Len())
	}
	if got := rec.Header().Get("X-Aegis-Rom-Name"); got != "Hello%20World.gba" {
		t.Fatalf("X-Aegis-Rom-Name = %q", got)
	}

	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/native/fs/rom?"+q.Encode(), nil))
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("POST: code %d", rec.Code)
	}
}

// Путь из базы начинается с имени папки библиотеки (скан папки одной консоли).
// The database path starts with the library folder's name (scan of a single console folder).
func TestQuickTestRomRootNamePrefix(t *testing.T) {
	lib := filepath.Join(t.TempDir(), "NES")
	writeFile(t, filepath.Join(lib, "Battletoads (USA).nes"), 40)
	q := url.Values{
		"consoleCode":  {"nes"},
		"romFileName":  {""},
		"relativePath": {"NES/Battletoads (USA).nes"},
		"libraryPath":  {filepath.ToSlash(lib)},
	}
	path, status := ResolveQuickTestRom(q)
	if status != http.StatusOK || filepath.Base(path) != "Battletoads (USA).nes" {
		t.Fatalf("got %q %d", path, status)
	}
}
