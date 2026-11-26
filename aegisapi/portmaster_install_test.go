package aegisapi

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"testing"
	"time"
)

func makePortZip(t *testing.T, files map[string]string) []byte {
	t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for name, body := range files {
		w, err := zw.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		_, _ = w.Write([]byte(body))
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

// rewriteTransport отправляет любой запрос на тестовый сервер. / sends any request to the test server.
type rewriteTransport struct{ target *url.URL }

func (rt rewriteTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	r2 := r.Clone(r.Context())
	r2.URL.Scheme = rt.target.Scheme
	r2.URL.Host = rt.target.Host
	return http.DefaultTransport.RoundTrip(r2)
}

func TestSafePortEntryPath(t *testing.T) {
	cases := map[string]string{
		"Celeste.sh":            "Celeste.sh",
		"celeste/conf/a.ini":    "celeste/conf/a.ini",
		"ports/Game.sh":         "Game.sh",
		"../evil.sh":            "",
		"game/../../evil":       "",
		"/etc/passwd":           "",
		"C:/Windows/system.dll": "",
		"game\\data.bin":        "game/data.bin",
	}
	for in, want := range cases {
		if got := safePortEntryPath(in); got != want {
			t.Errorf("safePortEntryPath(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestIsPortMasterURL(t *testing.T) {
	ok := []string{
		"https://github.com/PortsMaster/PortMaster-New/releases/download/x/a.zip",
		"https://github.com/PortsMaster-MV/PortMaster-MV-New/releases/download/x/b.zip",
	}
	for _, u := range ok {
		if !isPortMasterURL(u) {
			t.Errorf("want allowed: %s", u)
		}
	}
	for _, u := range []string{"", "https://github.com/PortsMasterEvil/x.zip", "https://example.com/PortsMaster/x.zip", "file:///etc/passwd"} {
		if isPortMasterURL(u) {
			t.Errorf("want denied: %s", u)
		}
	}
}

func TestPortMasterInstallUnpacksIntoPorts(t *testing.T) {
	zipBytes := makePortZip(t, map[string]string{
		"Celeste.sh":                 "#!/bin/bash\necho hi\n",
		"celeste/conf/settings.ini":  "x=1",
		"celeste/gamedata/README.md": "put files here",
		"../escape.txt":              "bad",
	})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", strconv.Itoa(len(zipBytes)))
		_, _ = w.Write(zipBytes)
	}))
	defer srv.Close()
	target, _ := url.Parse(srv.URL)

	mux, root := newVFSTestMux(t)
	if rec := vfsDo(mux, http.MethodPost, "/api/native/vfs/pick", ""); rec.Code != http.StatusOK {
		t.Fatalf("pick: %d %s", rec.Code, rec.Body.String())
	}
	RegisterPortMasterInstallRoutes(mux, nil, &http.Client{Transport: rewriteTransport{target}})

	body, _ := json.Marshal(map[string]string{
		"url":  "https://github.com/PortsMaster/PortMaster-New/releases/download/x/celeste.zip",
		"dest": filepath.Join(root, "ports"),
		"slug": "celeste",
	})
	rec := vfsDo(mux, http.MethodPost, "/api/portmaster/install", string(body))
	if rec.Code != http.StatusOK {
		t.Fatalf("install: %d %s", rec.Code, rec.Body.String())
	}
	var start struct{ ID string }
	_ = json.Unmarshal(rec.Body.Bytes(), &start)

	var st struct {
		Phase, Launcher, Error string
		Files                  int
	}
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		rec = vfsDo(mux, http.MethodGet, "/api/portmaster/install/status?id="+start.ID, "")
		_ = json.Unmarshal(rec.Body.Bytes(), &st)
		if st.Phase == "done" || st.Phase == "error" {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if st.Phase != "done" {
		t.Fatalf("phase %q, error %q", st.Phase, st.Error)
	}
	if st.Files != 3 || st.Launcher != "Celeste.sh" {
		t.Fatalf("files=%d launcher=%q", st.Files, st.Launcher)
	}
	ports := filepath.Join(root, "ports")
	if b, err := os.ReadFile(filepath.Join(ports, "celeste", "conf", "settings.ini")); err != nil || string(b) != "x=1" {
		t.Fatalf("settings.ini: %v %q", err, b)
	}
	info, err := os.Stat(filepath.Join(ports, "Celeste.sh"))
	if err != nil {
		t.Fatal(err)
	}
	if runtime.GOOS != "windows" && info.Mode()&0o100 == 0 {
		t.Errorf("Celeste.sh not executable: %v", info.Mode())
	}
	if _, err := os.Stat(filepath.Join(root, "escape.txt")); err == nil {
		t.Error("zip-slip entry was written")
	}
	entries, _ := os.ReadDir(ports)
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".part") {
			t.Errorf("temp file left: %s", e.Name())
		}
	}
}

func TestPortMasterInstallDeniesFolderOutsideRoots(t *testing.T) {
	mux, _ := newVFSTestMux(t)
	RegisterPortMasterInstallRoutes(mux, nil, nil)
	body, _ := json.Marshal(map[string]string{
		"url":  "https://github.com/PortsMaster/PortMaster-New/releases/download/x/a.zip",
		"dest": t.TempDir(),
	})
	if rec := vfsDo(mux, http.MethodPost, "/api/portmaster/install", string(body)); rec.Code != http.StatusForbidden {
		t.Fatalf("got %d, want 403", rec.Code)
	}
}
