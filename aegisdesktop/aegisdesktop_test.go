package aegisdesktop

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func mkfile(t *testing.T, p string, mode os.FileMode) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, []byte("x"), mode); err != nil {
		t.Fatal(err)
	}
}

// mkapp creates a fake .app bundle with a binary named bin.
func mkapp(t *testing.T, bundle, bin string, plist bool) {
	t.Helper()
	mkfile(t, filepath.Join(bundle, "Contents", "MacOS", bin), 0o755)
	if plist {
		xml := `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict>
<key>CFBundleName</key><string>Other</string>
<key>CFBundleExecutable</key><string>` + bin + `</string></dict></plist>`
		mkfile(t, filepath.Join(bundle, "Contents", "Info.plist"), 0o644)
		_ = os.WriteFile(filepath.Join(bundle, "Contents", "Info.plist"), []byte(xml), 0o644)
	}
}

func TestBundleExecutable(t *testing.T) {
	dir := t.TempDir()
	// Info.plist names the binary.
	a := filepath.Join(dir, "RPCS3.app")
	mkapp(t, a, "rpcs3", true)
	mkfile(t, filepath.Join(a, "Contents", "MacOS", "helper"), 0o755)
	if got := BundleExecutable(a); got != filepath.Join(a, "Contents", "MacOS", "rpcs3") {
		t.Fatalf("plist: %q", got)
	}
	// No plist: file named like the bundle wins over others.
	b := filepath.Join(dir, "Dolphin.app")
	mkapp(t, b, "Dolphin", false)
	mkfile(t, filepath.Join(b, "Contents", "MacOS", "aaa"), 0o755)
	if got := BundleExecutable(b); got != filepath.Join(b, "Contents", "MacOS", "Dolphin") {
		t.Fatalf("name: %q", got)
	}
	// Not executable → not launchable.
	c := filepath.Join(dir, "Broken.app")
	mkfile(t, filepath.Join(c, "Contents", "MacOS", "Broken"), 0o644)
	if IsLaunchable(c) {
		t.Fatal("bundle without executable must not be launchable")
	}
	if !IsLaunchable(a) || ExecutablePath(a) == a {
		t.Fatal("bundle must resolve to its binary")
	}
}

func TestDarwinDetectAndCores(t *testing.T) {
	home := t.TempDir()
	apps := filepath.Join(home, "Applications")
	mkapp(t, filepath.Join(apps, "RetroArch.app"), "RetroArch", true)
	mkapp(t, filepath.Join(apps, "PCSX2-v2.2.0.app"), "PCSX2-v2.2.0", false)
	cores := filepath.Join(home, "Library", "Application Support", "RetroArch", "cores")
	mkfile(t, filepath.Join(cores, "snes9x_libretro.dylib"), 0o644)
	mkfile(t, filepath.Join(cores, "readme.txt"), 0o644)

	p := DarwinPlatform(home)
	custom := filepath.Join(t.TempDir(), "My Dolphin.app")
	mkapp(t, custom, "Dolphin", false)
	det, gotCores := p.DetectEmulators(map[string]string{"dolphin_standalone": custom, "mgba_standalone": "/nope.app"})
	if det["retroarch"] != filepath.Join(apps, "RetroArch.app") {
		t.Fatalf("retroarch: %v", det)
	}
	if det["pcsx2_standalone"] != filepath.Join(apps, "PCSX2-v2.2.0.app") {
		t.Fatalf("pcsx2 glob: %v", det)
	}
	if det["dolphin_standalone"] != custom || det["mgba_standalone"] != "" {
		t.Fatalf("custom: %v", det)
	}
	if !reflect.DeepEqual(gotCores, []string{"snes9x_libretro.dll"}) {
		t.Fatalf("cores: %v", gotCores)
	}
	if got := p.ResolveCore(det["retroarch"], "snes9x_libretro.dll"); got != filepath.Join(cores, "snes9x_libretro.dylib") {
		t.Fatalf("core: %q", got)
	}
	if got := p.ResolveCore(det["retroarch"], "missing_libretro.dll"); got != "" {
		t.Fatalf("missing core: %q", got)
	}
	args := p.LaunchArgs(det["retroarch"], "snes9x_libretro.dll", "/r/game.sfc", false)
	if !reflect.DeepEqual(args, []string{"-L", filepath.Join(cores, "snes9x_libretro.dylib"), "/r/game.sfc"}) {
		t.Fatalf("args: %v", args)
	}
	if a := p.LaunchArgs("/A/DuckStation.app", "", "/r/g.chd", false); a[0] != "-batch" {
		t.Fatalf("duckstation: %v", a)
	}
}

type fakeDialogs struct{ file, folder string }

func (f fakeDialogs) PickFolder(string, string) (string, error)     { return f.folder, nil }
func (f fakeDialogs) PickFile(string, []FileFilter) (string, error) { return f.file, nil }

func post(t *testing.T, mux *http.ServeMux, path string, body any) map[string]any {
	t.Helper()
	raw, _ := json.Marshal(body)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, path, bytes.NewReader(raw)))
	var out map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("%s: %d %s", path, rec.Code, rec.Body.String())
	}
	return out
}

func TestLaunchRoute(t *testing.T) {
	home := t.TempDir()
	appDir := t.TempDir()
	ra := filepath.Join(home, "Applications", "RetroArch.app")
	mkapp(t, ra, "RetroArch", true)
	lib := t.TempDir()
	mkfile(t, filepath.Join(lib, "snes", "Game.sfc"), 0o644)

	var started *exec.Cmd
	mux := http.NewServeMux()
	RegisterRoutes(mux, Options{
		AppDir: appDir, Platform: DarwinPlatform(home), Dialogs: fakeDialogs{},
		Start: func(c *exec.Cmd) error { started = c; return nil },
	})

	// A path that is not a detected emulator must not run.
	res := post(t, mux, "/api/native/emulators/launch", map[string]any{"exePath": "/bin/sh", "romFileName": "Game.sfc", "libraryPath": lib, "consoleCode": "snes"})
	if res["ok"] != false || started != nil {
		t.Fatalf("arbitrary exe accepted: %v", res)
	}
	res = post(t, mux, "/api/native/emulators/launch", map[string]any{
		"exePath": `C:\RetroArch-Win64\retroarch.exe`, "isRetroArch": true,
		"romFileName": "Game.sfc", "libraryPath": lib, "consoleCode": "snes",
	})
	if res["ok"] != true || started == nil {
		t.Fatalf("launch: %v", res)
	}
	if started.Path != filepath.Join(ra, "Contents", "MacOS", "RetroArch") || started.Args[len(started.Args)-1] != filepath.Join(lib, "snes", "Game.sfc") {
		t.Fatalf("cmd: %v %v", started.Path, started.Args)
	}

	// Browse stores a picked bundle; a non-app is rejected.
	other := filepath.Join(t.TempDir(), "mGBA.app")
	mkapp(t, other, "mGBA", false)
	mux2 := http.NewServeMux()
	RegisterRoutes(mux2, Options{AppDir: appDir, Platform: DarwinPlatform(home), Dialogs: fakeDialogs{file: other}})
	res = post(t, mux2, "/api/native/emulators/browse", map[string]any{"emulatorId": "mgba_standalone"})
	if res["ok"] != true || LoadEmulatorConfig(appDir).CustomPaths["mgba_standalone"] != other {
		t.Fatalf("browse: %v", res)
	}
}

func TestChdmanAndMedia(t *testing.T) {
	home := t.TempDir()
	appDir := t.TempDir()
	t.Setenv("PATH", "")
	mux := http.NewServeMux()
	plat := DarwinPlatform(home)
	plat.Chdman, plat.ExtraPath = nil, nil
	RegisterRoutes(mux, Options{AppDir: appDir, Platform: plat, Dialogs: fakeDialogs{}})

	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/native/converter/chd", strings.NewReader("")))
	if rec.Code != http.StatusPreconditionFailed || !strings.Contains(rec.Body.String(), "brew install rom-tools") {
		t.Fatalf("chd without chdman: %d %s", rec.Code, rec.Body.String())
	}
	mkfile(t, filepath.Join(appDir, "tools", "chdman"), 0o755)
	if got := plat.FindChdman(appDir); got != filepath.Join(appDir, "tools", "chdman") {
		t.Fatalf("chdman: %q", got)
	}

	lib := t.TempDir()
	mkfile(t, filepath.Join(lib, "media", "images", "Game-image.png"), 0o644)
	res := post(t, mux, "/api/native/fs/resolve-media", map[string]any{
		"libraryPath": lib, "items": []map[string]string{{"id": "1", "cleanFile": "Game.sfc"}},
	})
	results := res["results"].([]any)
	if !strings.Contains(results[0].(map[string]any)["boxArtUrl"].(string), "Game-image.png") {
		t.Fatalf("media: %v", res)
	}
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/native/fs/media?path="+filepath.Join(lib, "x.txt"), nil))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("non-media served: %d", rec.Code)
	}
}
