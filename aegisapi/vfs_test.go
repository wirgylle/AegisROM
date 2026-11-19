package aegisapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func newVFSTestMux(t *testing.T) (*http.ServeMux, string) {
	t.Helper()
	root := filepath.Join(t.TempDir(), "Library")
	if err := os.MkdirAll(root, 0o755); err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	RegisterVFSRoutes(mux, t.TempDir(), nil, VFSOptions{
		PickFolder: func(string) (string, error) { return root, nil },
	})
	return mux, root
}

func vfsDo(mux *http.ServeMux, method, target, body string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(method, target, strings.NewReader(body)))
	return rec
}

func q(p string) string { return url.QueryEscape(p) }

func TestVFSDeniesPathsOutsidePickedFolders(t *testing.T) {
	mux, root := newVFSTestMux(t)
	// Nothing picked yet: everything is denied.
	if rec := vfsDo(mux, http.MethodGet, "/api/native/vfs/list?path="+q(root), ""); rec.Code != http.StatusForbidden {
		t.Fatalf("before pick: got %d, want 403", rec.Code)
	}
	if rec := vfsDo(mux, http.MethodPost, "/api/native/vfs/pick", `{}`); rec.Code != http.StatusOK {
		t.Fatalf("pick: got %d", rec.Code)
	}
	outside := filepath.Dir(root)
	for _, p := range []string{outside, filepath.Join(root, "..", "x"), root + "-sibling", "relative/path", ""} {
		if rec := vfsDo(mux, http.MethodGet, "/api/native/vfs/stat?path="+q(p), ""); rec.Code != http.StatusForbidden {
			t.Errorf("%q: got %d, want 403", p, rec.Code)
		}
	}
	if rec := vfsDo(mux, http.MethodPost, "/api/native/vfs/remove?recursive=1&path="+q(root), ""); rec.Code != http.StatusForbidden {
		t.Errorf("removing the root itself: got %d, want 403", rec.Code)
	}
}

func TestVFSFileOperations(t *testing.T) {
	mux, root := newVFSTestMux(t)
	vfsDo(mux, http.MethodPost, "/api/native/vfs/pick", `{}`)

	dir := filepath.Join(root, "snes")
	if rec := vfsDo(mux, http.MethodPost, "/api/native/vfs/mkdir?path="+q(dir), ""); rec.Code != http.StatusOK {
		t.Fatalf("mkdir: %d", rec.Code)
	}
	file := filepath.Join(dir, "Game (USA).sfc")
	if rec := vfsDo(mux, http.MethodPut, "/api/native/vfs/write?path="+q(file), "ROMDATA"); rec.Code != http.StatusOK {
		t.Fatalf("write: %d %s", rec.Code, rec.Body)
	}

	var list struct {
		Entries []vfsEntry `json:"entries"`
	}
	_ = json.Unmarshal(vfsDo(mux, http.MethodGet, "/api/native/vfs/list?path="+q(dir), "").Body.Bytes(), &list)
	if len(list.Entries) != 1 || list.Entries[0].Kind != "file" || list.Entries[0].Size != 7 {
		t.Fatalf("list: %+v", list.Entries)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/native/vfs/read?path="+q(file), nil)
	req.Header.Set("Range", "bytes=3-5")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusPartialContent || rec.Body.String() != "DAT" {
		t.Fatalf("range read: %d %q", rec.Code, rec.Body.String())
	}

	moved := filepath.Join(root, "Game (Europe).sfc")
	if rec := vfsDo(mux, http.MethodPost, "/api/native/vfs/move?from="+q(file)+"&to="+q(moved), ""); rec.Code != http.StatusOK {
		t.Fatalf("move: %d", rec.Code)
	}
	if rec := vfsDo(mux, http.MethodGet, "/api/native/vfs/stat?path="+q(file), ""); rec.Code != http.StatusNotFound {
		t.Fatalf("old path after move: %d, want 404", rec.Code)
	}

	head := []byte(VFSUploadMarker + moved)
	dst := filepath.Join(t.TempDir(), "upload.sfc")
	handled, err := MaterializeVFSUpload(head, dst)
	if !handled || err != nil {
		t.Fatalf("materialize: %v %v", handled, err)
	}
	if raw, _ := os.ReadFile(dst); string(raw) != "ROMDATA" {
		t.Fatalf("materialized content: %q", raw)
	}
	if handled, err := MaterializeVFSUpload([]byte(VFSUploadMarker+"/etc/passwd"), dst); !handled || err == nil {
		t.Fatal("materialize outside roots must fail")
	}

	if rec := vfsDo(mux, http.MethodPost, "/api/native/vfs/remove?path="+q(dir), ""); rec.Code != http.StatusOK {
		t.Fatalf("remove empty dir: %d", rec.Code)
	}
}
