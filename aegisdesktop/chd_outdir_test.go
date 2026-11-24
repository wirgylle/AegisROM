package aegisdesktop

import (
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"aegisgui/aegisapi"
)

// Проверка с настоящим chdman (пропускается, если его нет в PATH).
// Check with a real chdman (skipped when it is not on PATH).
func chdTestSetup(t *testing.T) (chdman, root string, form func(fields map[string]string) (*bytes.Buffer, string)) {
	t.Helper()
	chdman, err := exec.LookPath("chdman")
	if err != nil {
		t.Skip("chdman not on PATH")
	}
	root = filepath.Join(t.TempDir(), "Build")
	if err := os.MkdirAll(root, 0o755); err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	aegisapi.RegisterVFSRoutes(mux, t.TempDir(), nil, aegisapi.VFSOptions{
		PickFolder: func(string) (string, error) { return root, nil },
	})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/native/vfs/pick", strings.NewReader(`{}`)))
	if rec.Code != http.StatusOK {
		t.Fatalf("pick: %d", rec.Code)
	}
	// Синтетический диск: 300 секторов MODE1/2048. / Synthetic disc: 300 MODE1/2048 sectors.
	iso := bytes.Repeat([]byte("AEGISROM"), 300*2048/8)
	cue := "FILE \"Game.iso\" BINARY\r\n  TRACK 01 MODE1/2048\r\n    INDEX 01 00:00:00\r\n"
	form = func(fields map[string]string) (*bytes.Buffer, string) {
		var body bytes.Buffer
		mw := multipart.NewWriter(&body)
		for k, v := range fields {
			_ = mw.WriteField(k, v)
		}
		fw, _ := mw.CreateFormFile("entryFile", "Game.cue")
		_, _ = fw.Write([]byte(cue))
		fw, _ = mw.CreateFormFile("companionFiles", "Game.iso")
		_, _ = fw.Write(iso)
		_ = mw.Close()
		return &body, mw.FormDataContentType()
	}
	return chdman, root, form
}

func TestHandleChdWritesStraightToOutDir(t *testing.T) {
	chdman, root, form := chdTestSetup(t)
	body, ct := form(map[string]string{"targetExt": ".chd", "baseName": "Game (USA)", "outDir": root})
	req := httptest.NewRequest(http.MethodPost, "/api/native/converter/chd", body)
	req.Header.Set("Content-Type", ct)
	rec := httptest.NewRecorder()
	handleChd(rec, req, chdman)
	if rec.Code != http.StatusOK {
		t.Fatalf("got %d: %s", rec.Code, rec.Body.String())
	}
	if rec.Header().Get("X-Output-Mode") != "disk" {
		t.Fatalf("mode %q", rec.Header().Get("X-Output-Mode"))
	}
	var resp struct {
		Files []string `json:"files"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	if len(resp.Files) != 1 || resp.Files[0] != "Game (USA).chd" {
		t.Fatalf("files %v", resp.Files)
	}
	st, err := os.Stat(filepath.Join(root, "Game (USA).chd"))
	if err != nil || st.Size() == 0 {
		t.Fatalf("chd not written: %v", err)
	}
	if rec.Body.Len() > 1024 {
		t.Fatalf("answer should be small JSON, got %d bytes", rec.Body.Len())
	}

	// Вне выбранных папок — отказ. / Outside the picked folders: denied.
	body, ct = form(map[string]string{"targetExt": ".chd", "baseName": "X", "outDir": filepath.Dir(root)})
	req = httptest.NewRequest(http.MethodPost, "/api/native/converter/chd", body)
	req.Header.Set("Content-Type", ct)
	rec = httptest.NewRecorder()
	handleChd(rec, req, chdman)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("outside root: got %d", rec.Code)
	}
}

func TestHandleChdStopsWhenRequestIsCancelled(t *testing.T) {
	chdman, root, form := chdTestSetup(t)
	body, ct := form(map[string]string{"targetExt": ".chd", "baseName": "Cancelled", "outDir": root})
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	req := httptest.NewRequest(http.MethodPost, "/api/native/converter/chd", body).WithContext(ctx)
	req.Header.Set("Content-Type", ct)
	rec := httptest.NewRecorder()
	start := time.Now()
	handleChd(rec, req, chdman)
	if rec.Code == http.StatusOK {
		t.Fatal("a cancelled request must not succeed")
	}
	if time.Since(start) > 10*time.Second {
		t.Fatal("chdman was not stopped")
	}
	if _, err := os.Stat(filepath.Join(root, "Cancelled.chd")); !os.IsNotExist(err) {
		t.Fatal("no output expected after cancel")
	}
}
