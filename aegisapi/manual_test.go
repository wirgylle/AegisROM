package aegisapi

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"testing"
)

func TestResolveManual(t *testing.T) {
	lib := t.TempDir()
	writeFile(t, filepath.Join(lib, "psx", "Game (USA).chd"), 10)
	writeFile(t, filepath.Join(lib, "psx", "media", "manuals", "Game (USA).pdf"), 20)
	writeFile(t, filepath.Join(lib, "snes", "Other.sfc"), 10)
	writeFile(t, filepath.Join(lib, "snes", "manuals", "Other-manual.pdf"), 20)
	writeFile(t, filepath.Join(lib, "nes", "Gl.nes"), 10)
	writeFile(t, filepath.Join(lib, "nes", "docs", "x.pdf"), 20)
	gl := `<?xml version="1.0"?><gameList><game><path>./Gl.nes</path><manual>./docs/x.pdf</manual></game></gameList>`
	if err := os.WriteFile(filepath.Join(lib, "nes", "gamelist.xml"), []byte(gl), 0o644); err != nil {
		t.Fatal(err)
	}
	writeFile(t, filepath.Join(lib, "secret.pdf"), 5)
	writeFile(t, filepath.Join(lib, "gb", "Evil.gb"), 10)
	evil := `<gameList><game><path>./Evil.gb</path><manual>../secret.pdf</manual></game></gameList>`
	if err := os.WriteFile(filepath.Join(lib, "gb", "gamelist.xml"), []byte(evil), 0o644); err != nil {
		t.Fatal(err)
	}
	// Многодисковая папка: мануал в media/manuals консоли. / Multi-disc folder: manual one level up.
	writeFile(t, filepath.Join(lib, "psx", "FF7", "FF7 (Disc 1).chd"), 10)
	writeFile(t, filepath.Join(lib, "psx", "media", "manuals", "FF7.pdf"), 20)

	cases := []struct {
		name   string
		q      url.Values
		status int
		base   string
	}{
		{"skraper media/manuals", url.Values{"consoleCode": {"psx"}, "romFileName": {"Game (USA).chd"}, "libraryPath": {lib}}, 200, "Game (USA).pdf"},
		{"-manual suffix", url.Values{"consoleCode": {"snes"}, "romFileName": {"Other.sfc"}, "libraryPath": {lib}}, 200, "Other-manual.pdf"},
		{"gamelist manual tag", url.Values{"relativePath": {"nes/Gl.nes"}, "libraryPath": {lib}}, 200, "x.pdf"},
		{"gamelist cannot leave folder", url.Values{"consoleCode": {"gb"}, "romFileName": {"Evil.gb"}, "libraryPath": {lib}}, 404, ""},
		{"manualRel from scan", url.Values{"manualRel": {"psx/media/manuals/Game (USA).pdf"}, "libraryPath": {lib}}, 200, "Game (USA).pdf"},
		{"manualRel must be pdf", url.Values{"manualRel": {"psx/Game (USA).chd"}, "libraryPath": {lib}}, 404, ""},
		{"multi-disc folder", url.Values{"relativePath": {"psx/FF7/FF7 (Disc 1).chd"}, "libraryPath": {lib}}, 200, "FF7.pdf"},
		{"no manual", url.Values{"consoleCode": {"gb"}, "romFileName": {"None.gb"}, "libraryPath": {lib}}, 404, ""},
	}
	for _, c := range cases {
		got, status := ResolveManual(c.q)
		if status != c.status {
			t.Errorf("%s: status %d, want %d (%q)", c.name, status, c.status, got)
			continue
		}
		if c.base != "" && filepath.Base(got) != c.base {
			t.Errorf("%s: got %q, want %q", c.name, got, c.base)
		}
	}
}

func TestManualRoute(t *testing.T) {
	lib := t.TempDir()
	writeFile(t, filepath.Join(lib, "psx", "Game.chd"), 10)
	writeFile(t, filepath.Join(lib, "psx", "media", "manuals", "Game.pdf"), 33)
	mux := http.NewServeMux()
	RegisterQuickTestRoutes(mux, nil)
	q := url.Values{"consoleCode": {"psx"}, "romFileName": {"Game.chd"}, "libraryPath": {lib}}

	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodHead, "/api/native/fs/manual?"+q.Encode(), nil))
	if rec.Code != 200 {
		t.Fatalf("HEAD: code %d", rec.Code)
	}
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/native/fs/manual?"+q.Encode(), nil))
	if rec.Code != 200 || rec.Body.Len() != 33 || rec.Header().Get("Content-Type") != "application/pdf" {
		t.Fatalf("GET: code %d, len %d, type %q", rec.Code, rec.Body.Len(), rec.Header().Get("Content-Type"))
	}
}
