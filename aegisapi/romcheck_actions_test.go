package aegisapi

import (
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

	"aegisgui/aegiscore"
)

func TestRomCheckRoutesDenyOutsidePickedFolders(t *testing.T) {
	mux, root := newVFSTestMux(t)
	RegisterRomCheckRoutes(mux, nil, RomCheckOptions{})
	outside := filepath.Join(t.TempDir(), "x.chd")
	_ = os.WriteFile(outside, []byte("x"), 0o644)
	for _, tc := range []struct{ path, body string }{
		{"/api/native/romcheck/trash", `{"paths":[` + jsonStr(outside) + `]}`},
		{"/api/native/romcheck/reveal", `{"path":` + jsonStr(outside) + `}`},
		{"/api/native/romcheck/rebuild-chd", `{"path":` + jsonStr(outside) + `}`},
	} {
		if rec := vfsDo(mux, http.MethodPost, tc.path, tc.body); rec.Code != http.StatusForbidden {
			t.Fatalf("%s: got %d, want 403", tc.path, rec.Code)
		}
	}
	// После выбора папки корзина вне Windows отвечает 501, файл остаётся.
	// After picking the folder, trash outside Windows answers 501 and the file stays.
	vfsDo(mux, http.MethodPost, "/api/native/vfs/pick", "")
	inside := filepath.Join(root, "a.bin")
	_ = os.WriteFile(inside, []byte("x"), 0o644)
	rec := vfsDo(mux, http.MethodPost, "/api/native/romcheck/trash", `{"paths":[`+jsonStr(inside)+`]}`)
	if rec.Code != http.StatusNotImplemented {
		t.Fatalf("trash: got %d, want 501", rec.Code)
	}
	if _, err := os.Stat(inside); err != nil {
		t.Fatal("file must stay")
	}
	rec = vfsDo(mux, http.MethodPost, "/api/native/romcheck/rebuild-chd", `{"path":`+jsonStr(inside)+`}`)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("rebuild of a non-CHD: got %d, want 403", rec.Code)
	}
}

func jsonStr(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}

// PS1 CHD с дорожкой MODE1 (из ISO на 2048) пересобирается в MODE2/2352.
// A PS1 CHD with a MODE1 track (from a 2048-byte ISO) is rebuilt as MODE2/2352.
func TestRebuildCDCHDMakesRawPS1Track(t *testing.T) {
	chdman, err := exec.LookPath("chdman")
	if err != nil {
		t.Skip("chdman not installed")
	}
	dir := t.TempDir()
	iso := make([]byte, 2048*64)
	pvd := iso[16*2048:]
	pvd[0] = 1
	copy(pvd[1:], "CD001")
	pvd[6] = 1
	copy(pvd[8:], "PLAYSTATION                     ")
	isoPath := filepath.Join(dir, "game.iso")
	if err := os.WriteFile(isoPath, iso, 0o644); err != nil {
		t.Fatal(err)
	}
	chd := filepath.Join(dir, "Game.chd")
	if b, err := exec.Command(chdman, "createcd", "-f", "-i", isoPath, "-o", chd).CombinedOutput(); err != nil {
		t.Fatalf("chdman: %v %s", err, b)
	}
	before, err := aegiscore.InspectCHD(chd)
	if err != nil || len(before.Tracks) != 1 || !strings.HasPrefix(before.Tracks[0].Type, "MODE1") {
		t.Fatalf("setup: %+v %v", before, err)
	}
	if _, err := RebuildCDCHD(context.Background(), chdman, chd, "psx", nil); err != nil {
		t.Fatal(err)
	}
	after, err := aegiscore.InspectCHD(chd)
	if err != nil {
		t.Fatal(err)
	}
	if len(after.Tracks) != 1 || after.Tracks[0].Type != "MODE2_RAW" {
		t.Fatalf("after rebuild: %+v", after.Tracks)
	}
	// Временная папка убрана. / The temp folder is gone.
	ents, _ := os.ReadDir(dir)
	for _, e := range ents {
		if strings.HasPrefix(e.Name(), ".aegis-rebuild-") {
			t.Fatalf("temp folder left: %s", e.Name())
		}
	}
}

// Окно Edge: CHD приходит файлом, без пути. / Edge window: the CHD comes as a file, no path.
func TestChdVerifyAcceptsUpload(t *testing.T) {
	chdman, err := exec.LookPath("chdman")
	if err != nil {
		t.Skip("chdman not installed")
	}
	dir := t.TempDir()
	iso := make([]byte, 2048*32)
	isoPath := filepath.Join(dir, "g.iso")
	_ = os.WriteFile(isoPath, iso, 0o644)
	chd := filepath.Join(dir, "g.chd")
	if b, err := exec.Command(chdman, "createcd", "-f", "-i", isoPath, "-o", chd).CombinedOutput(); err != nil {
		t.Fatalf("chdman: %v %s", err, b)
	}
	data, _ := os.ReadFile(chd)
	var body strings.Builder
	mw := multipart.NewWriter(&body)
	_ = mw.WriteField("deep", "1")
	fw, _ := mw.CreateFormFile("file", "g.chd")
	_, _ = fw.Write(data)
	_ = mw.Close()
	req := httptest.NewRequest(http.MethodPost, "/api/native/converter/verify", strings.NewReader(body.String()))
	req.Header.Set("Content-Type", mw.FormDataContentType())
	rec := httptest.NewRecorder()
	HandleChdVerify(rec, req, chdman, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("got %d: %s", rec.Code, rec.Body.String())
	}
	var res struct {
		Deep struct {
			Ran bool `json:"ran"`
			OK  bool `json:"ok"`
		} `json:"deep"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &res)
	if !res.Deep.Ran || !res.Deep.OK {
		t.Fatalf("deep verify: %s", rec.Body.String())
	}
}
