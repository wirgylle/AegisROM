package aegisapi

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func formRequest(t *testing.T, fields map[string]string) *http.Request {
	t.Helper()
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	for k, v := range fields {
		_ = mw.WriteField(k, v)
	}
	_ = mw.Close()
	r := httptest.NewRequest(http.MethodPost, "/api/native/converter/chd", &body)
	r.Header.Set("Content-Type", mw.FormDataContentType())
	return r
}

func TestConverterOutDirChecksRoots(t *testing.T) {
	mux, root := newVFSTestMux(t)
	vfsDo(mux, http.MethodPost, "/api/native/vfs/pick", `{}`)

	if p, err := ConverterOutDir(formRequest(t, map[string]string{})); err != nil || p != "" {
		t.Fatalf("no outDir: got %q, %v", p, err)
	}
	if p, err := ConverterOutDir(formRequest(t, map[string]string{"outDir": root})); err != nil || p != root {
		t.Fatalf("root: got %q, %v", p, err)
	}
	if _, err := ConverterOutDir(formRequest(t, map[string]string{"outDir": filepath.Dir(root)})); err == nil {
		t.Fatal("outside the picked folders must be denied")
	}
	if _, err := ConverterOutDir(formRequest(t, map[string]string{"outDir": filepath.Join(root, "missing")})); err == nil {
		t.Fatal("missing folder must fail")
	}
}

func TestSendConverterOutputsMovesFiles(t *testing.T) {
	tmp := t.TempDir()
	out := t.TempDir()
	_ = os.WriteFile(filepath.Join(tmp, "Game.bin"), []byte("BIN"), 0o644)
	_ = os.WriteFile(filepath.Join(tmp, "Game.cue"), []byte("CUE"), 0o644)
	_ = os.WriteFile(filepath.Join(out, "Game.bin"), []byte("OLD"), 0o644)

	rec := httptest.NewRecorder()
	SendConverterOutputs(rec, tmp, out, []string{"Game.bin", "Game.cue", "Missing.sub"})
	if rec.Code != http.StatusOK {
		t.Fatalf("got %d: %s", rec.Code, rec.Body.String())
	}
	var resp struct {
		OK    bool     `json:"ok"`
		Mode  string   `json:"mode"`
		Files []string `json:"files"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if !resp.OK || resp.Mode != "disk" || len(resp.Files) != 2 {
		t.Fatalf("unexpected answer %+v", resp)
	}
	if b, _ := os.ReadFile(filepath.Join(out, "Game.bin")); string(b) != "BIN" {
		t.Fatalf("Game.bin not replaced: %q", b)
	}
	if _, err := os.Stat(filepath.Join(tmp, "Game.cue")); !os.IsNotExist(err) {
		t.Fatal("source should be moved away")
	}

	rec = httptest.NewRecorder()
	SendConverterOutputs(rec, t.TempDir(), out, []string{"Nothing.chd"})
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("no output: got %d", rec.Code)
	}
}
