package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"aegisgui/aegisapi"
)

func newTestServer(t *testing.T) (*httptest.Server, string) {
	t.Helper()
	data := t.TempDir()
	dist := t.TempDir()
	if err := os.WriteFile(filepath.Join(dist, "index.html"), []byte("<html>app</html>"), 0o644); err != nil {
		t.Fatal(err)
	}
	index, _ := os.ReadFile(filepath.Join(dist, "index.html"))
	mux := http.NewServeMux()
	aegisapi.RegisterLibraryRoutes(mux, data, nil)
	mux.Handle("/", aegisapi.SPAHandler(os.DirFS(dist), index, nil))
	ts := httptest.NewUnstartedServer(nil)
	ts.Start()
	port := ts.URL[strings.LastIndex(ts.URL, ":")+1:]
	ts.Config.Handler = aegisapi.NewGuard(mux, "tok", port)
	return ts, data
}

func do(t *testing.T, ts *httptest.Server, method, path, body string, token bool) (int, string) {
	t.Helper()
	req, _ := http.NewRequest(method, ts.URL+path, strings.NewReader(body))
	if token {
		req.Header.Set(aegisapi.TokenHeader, "tok")
	}
	resp, err := ts.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, string(b)
}

func TestServerDBRoundTrip(t *testing.T) {
	ts, data := newTestServer(t)
	defer ts.Close()

	if code, _ := do(t, ts, "GET", "/api/db/state", "", false); code != http.StatusUnauthorized {
		t.Fatalf("без токена: %d", code)
	}

	code, body := do(t, ts, "GET", "/api/db/state", "", true)
	var seed map[string]any
	if code != 200 || json.Unmarshal([]byte(body), &seed) != nil || seed["records"] == nil {
		t.Fatalf("seed state: %d %s", code, body)
	}

	state := `{"version":"0.5.4","records":[{"id":"1"}]}`
	if code, _ := do(t, ts, "POST", "/api/db/sync", `{"state":`+state+`}`, true); code != 200 {
		t.Fatalf("sync: %d", code)
	}
	if code, body := do(t, ts, "GET", "/api/db/state", "", true); code != 200 || body != state {
		t.Fatalf("state after sync: %d %s", code, body)
	}
	if _, err := os.Stat(filepath.Join(data, "aegisrom-v5-db.json")); err != nil {
		t.Fatal(err)
	}

	if code, body := do(t, ts, "POST", "/api/db/builds", `{"builds":[{"id":"b"}]}`, true); code != 200 || !strings.Contains(body, `"b"`) {
		t.Fatalf("builds post: %d %s", code, body)
	}
	if code, body := do(t, ts, "GET", "/api/db/builds", "", true); code != 200 || body != `{"ok":true,"builds":[{"id":"b"}]}` {
		t.Fatalf("builds get: %d %s", code, body)
	}

	if code, _ := do(t, ts, "GET", "/api/portmaster/download?url=https://evil.example/x.zip", "", true); code != http.StatusBadRequest {
		t.Fatalf("portmaster чужой URL: %d", code)
	}
}

func TestServerSPA(t *testing.T) {
	ts, _ := newTestServer(t)
	defer ts.Close()
	for _, p := range []string{"/", "/library/some-route"} {
		if code, body := do(t, ts, "GET", p, "", false); code != 200 || body != "<html>app</html>" {
			t.Errorf("%s: %d %q", p, code, body)
		}
	}
}

func TestRunRejectsNonLoopback(t *testing.T) {
	if err := run("0.0.0.0:0", t.TempDir(), t.TempDir()); err == nil {
		t.Fatal("ожидалась ошибка для не-loopback адреса")
	}
}
