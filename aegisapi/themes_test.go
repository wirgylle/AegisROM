package aegisapi

import (
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
)

func TestIsThemeDownloadURL(t *testing.T) {
	ok := []string{
		"https://codeload.github.com/Jetup13/es-theme-nes-box/zip/HEAD",
		"https://codeload.github.com/mluizvitor/es-theme-albedo/zip/HEAD",
		"https://raw.githubusercontent.com/OnionUI/Themes/main/release/System%209%20by%20injekim.zip",
	}
	for _, u := range ok {
		if !isThemeDownloadURL(u) {
			t.Errorf("want allowed: %s", u)
		}
	}
	bad := []string{
		"",
		"https://codeload.github.com/a/b/zip/HEAD?x=1",
		"https://codeload.github.com/a/b/tar.gz/HEAD",
		"https://codeload.github.com/a/../b/zip/HEAD",
		"https://raw.githubusercontent.com/OnionUI/Themes/main/release/x.exe",
		"https://raw.githubusercontent.com/Evil/Themes/main/release/x.zip",
		"https://example.com/x.zip",
		"file:///etc/passwd",
	}
	for _, u := range bad {
		if isThemeDownloadURL(u) {
			t.Errorf("want denied: %s", u)
		}
	}
}

func TestThemeRoutes(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "PATH:"+r.URL.Path)
	}))
	defer upstream.Close()
	target, _ := url.Parse(upstream.URL)
	mux := http.NewServeMux()
	RegisterThemeRoutes(mux, nil, &http.Client{Transport: rewriteTransport{target: target}})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	get := func(p string) (int, string) {
		resp, err := http.Get(srv.URL + p)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		b, _ := io.ReadAll(resp.Body)
		return resp.StatusCode, string(b)
	}
	if code, body := get("/api/themes/catalog?src=oga"); code != 200 || body != "PATH:/Jetup13/Emulationstation-OGA-Theme-Gallery/main/README.md" {
		t.Fatalf("catalog oga: %d %q", code, body)
	}
	if code, body := get("/api/themes/catalog?src=onion&page=index-15-8a.md"); code != 200 || body != "PATH:/OnionUI/Themes/main/generated/custom/index-15-8a.md" {
		t.Fatalf("onion page: %d %q", code, body)
	}
	for _, bad := range []string{"src=onion&page=../../x.md", "src=oga&page=index-15-8a.md", "src=onion&page=index.md%3F"} {
		if code, _ := get("/api/themes/catalog?" + bad); code != http.StatusBadRequest {
			t.Fatalf("%s must be refused, got %d", bad, code)
		}
	}
	if code, _ := get("/api/themes/catalog?src=https://evil"); code != http.StatusBadRequest {
		t.Fatalf("unknown catalog must be refused, got %d", code)
	}
	if code, body := get("/api/themes/download?url=" + url.QueryEscape("https://codeload.github.com/Jetup13/es-theme-nes-box/zip/HEAD")); code != 200 || body != "PATH:/Jetup13/es-theme-nes-box/zip/HEAD" {
		t.Fatalf("download: %d %q", code, body)
	}
	if code, _ := get("/api/themes/download?url=" + url.QueryEscape("https://example.com/a.zip")); code != http.StatusBadRequest {
		t.Fatalf("foreign url must be refused, got %d", code)
	}
}
