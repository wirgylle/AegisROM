package aegistransfer

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"aegisgui/aegiscore"
)

func readStr(t *testing.T, p string) string {
	t.Helper()
	b, err := os.ReadFile(p)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func historyFiles(t *testing.T, libDir, base string) []string {
	t.Helper()
	list, _ := filepath.Glob(filepath.Join(aegiscore.SaveHistoryFolder(libDir, base), "*"))
	out := make([]string, 0, len(list))
	for _, p := range list {
		out = append(out, readStrNoFail(p))
	}
	return out
}

func readStrNoFail(p string) string {
	b, _ := os.ReadFile(p)
	return string(b)
}

// saveFixture: сборка с 5 ромами, библиотека и приставка с разными сохранениями.
// saveFixture: a build of 5 ROMs, a library and a handheld with different saves.
type saveFixture struct {
	build, lib, device string
	links              []SaveLink
	old, mid, recent   time.Time
}

func newSaveFixture(t *testing.T, deviceRoot string) *saveFixture {
	f := &saveFixture{build: t.TempDir(), lib: t.TempDir(), device: deviceRoot}
	f.old = time.Now().Add(-3 * time.Hour).Truncate(time.Second)
	f.mid = time.Now().Add(-2 * time.Hour).Truncate(time.Second)
	f.recent = time.Now().Add(-1 * time.Hour).Truncate(time.Second)
	dev := filepath.Join(deviceRoot, "roms", "snes")
	for _, g := range []string{"A", "B", "C", "D", "E"} {
		writeAt(t, filepath.Join(f.build, "snes", g+".sfc"), []byte("rom "+g), f.old)
		writeAt(t, filepath.Join(f.lib, g+" (USA).sfc"), []byte("rom "+g), f.old)
		f.links = append(f.links, SaveLink{Rel: "snes/" + g + ".sfc", LibDir: f.lib, LibBase: g + " (USA)"})
	}
	// A: только в библиотеке (+ снимок состояния, который не едет).
	writeAt(t, filepath.Join(f.lib, "A (USA).srm"), []byte("lib A"), f.mid)
	writeAt(t, filepath.Join(f.lib, "A (USA).state"), []byte("state A"), f.mid)
	// B: только на приставке (имя в другом регистре).
	writeAt(t, filepath.Join(dev, "B.SRM"), []byte("dev B"), f.mid)
	// C: с обеих сторон, на приставке новее.
	writeAt(t, filepath.Join(f.lib, "C (USA).srm"), []byte("lib C"), f.mid)
	writeAt(t, filepath.Join(dev, "C.srm"), []byte("dev C newer"), f.recent)
	// D: с обеих сторон, в библиотеке новее.
	writeAt(t, filepath.Join(f.lib, "D (USA).srm"), []byte("lib D newer"), f.recent)
	writeAt(t, filepath.Join(dev, "D.srm"), []byte("dev D"), f.mid)
	// E: одинаковые.
	writeAt(t, filepath.Join(f.lib, "E (USA).sav"), []byte("same E"), f.mid)
	writeAt(t, filepath.Join(dev, "E.sav"), []byte("same E"), f.recent)
	return f
}

func (f *saveFixture) check(t *testing.T, s Snapshot, devTimes bool) {
	t.Helper()
	dev := filepath.Join(f.device, "roms", "snes")
	if s.State != "done" || !s.SyncSaves {
		t.Fatalf("job: %+v", s)
	}
	want := SaveStats{Roms: 5, ToDevice: 2, FromDevice: 2, Conflicts: 2}
	if s.Saves != want {
		t.Fatalf("saves %+v, want %+v", s.Saves, want)
	}
	// A → приставка, снимок состояния остался дома.
	if got := readStr(t, filepath.Join(dev, "A.srm")); got != "lib A" {
		t.Fatalf("A on device: %q", got)
	}
	if _, err := os.Stat(filepath.Join(dev, "A.state")); err == nil {
		t.Fatal("save state went to the device")
	}
	// B → библиотека, время как на приставке.
	if got := readStr(t, filepath.Join(f.lib, "B (USA).srm")); got != "dev B" {
		t.Fatalf("B in library: %q", got)
	}
	if st, _ := os.Stat(filepath.Join(f.lib, "B (USA).srm")); devTimes && !st.ModTime().Equal(f.mid) {
		t.Fatalf("B time %v, want %v", st.ModTime(), f.mid)
	}
	// C: новое с приставки стало текущим, прежнее из библиотеки — в истории.
	if got := readStr(t, filepath.Join(f.lib, "C (USA).srm")); got != "dev C newer" {
		t.Fatalf("C in library: %q", got)
	}
	if h := historyFiles(t, f.lib, "C (USA)"); len(h) != 1 || h[0] != "lib C" {
		t.Fatalf("C history: %q", h)
	}
	if got := readStr(t, filepath.Join(dev, "C.srm")); got != "dev C newer" {
		t.Fatalf("C on device: %q", got)
	}
	// D: библиотека новее — на приставку, версия с приставки в истории библиотеки.
	if got := readStr(t, filepath.Join(dev, "D.srm")); got != "lib D newer" {
		t.Fatalf("D on device: %q", got)
	}
	if h := historyFiles(t, f.lib, "D (USA)"); len(h) != 1 || h[0] != "dev D" {
		t.Fatalf("D history: %q", h)
	}
	// E: без изменений и без истории.
	if h := historyFiles(t, f.lib, "E (USA)"); len(h) != 0 {
		t.Fatalf("E history: %q", h)
	}
	// Копии в папке сборки совпадают с текущими версиями.
	for name, wantData := range map[string]string{"A.srm": "lib A", "B.SRM": "dev B", "C.srm": "dev C newer", "D.srm": "lib D newer"} {
		if got := readStrNoFail(filepath.Join(f.build, "snes", name)); got != wantData {
			t.Fatalf("build copy %s: %q, want %q", name, got, wantData)
		}
	}
	// На приставку история не пишется.
	if _, err := os.Stat(filepath.Join(dev, aegiscore.SaveHistoryDir)); err == nil {
		t.Fatal("history written to the device")
	}
}

func TestSavesSyncOverDirRemote(t *testing.T) {
	device := t.TempDir()
	f := newSaveFixture(t, device)
	dial := func(ctx context.Context) (Remote, error) { return DirRemote{Root: device}, nil }
	s := waitJob(t, Start(context.Background(), "1", Profile{Name: "dev", RemoteDir: "/roms"}, f.build, dial, f.links...))
	f.check(t, s, true)

	// Повтор: нечего делать. / Rerun: nothing to do.
	s = waitJob(t, Start(context.Background(), "2", Profile{Name: "dev", RemoteDir: "/roms"}, f.build, dial, f.links...))
	if s.State != "done" || s.Uploaded != 0 || (s.Saves != SaveStats{Roms: 5}) {
		t.Fatalf("rerun: %+v", s)
	}
}

func TestSavesSyncOverWebDAV(t *testing.T) {
	ds := startDAV(t, "basic", "ark", "pw", "")
	f := newSaveFixture(t, ds.root)
	s := waitJob(t, Start(context.Background(), "1", ds.prof, f.build, davDialer(ds.prof, "pw"), f.links...))
	// WebDAV не ставит время файла, поэтому время B не сверяем. / WebDAV keeps no file times.
	f.check(t, s, false)
	s = waitJob(t, Start(context.Background(), "2", ds.prof, f.build, davDialer(ds.prof, "pw"), f.links...))
	if s.State != "done" || s.Uploaded != 0 || (s.Saves != SaveStats{Roms: 5}) {
		t.Fatalf("rerun: %+v", s)
	}
}

// Без связей зеркало не затирает сохранение на приставке.
// Without links the mirror never overwrites a save on the handheld.
func TestMirrorKeepsDeviceSaves(t *testing.T) {
	build, device := t.TempDir(), t.TempDir()
	now := time.Now().Truncate(time.Second)
	writeAt(t, filepath.Join(build, "gba", "G.gba"), []byte("rom"), now.Add(-time.Hour))
	writeAt(t, filepath.Join(build, "gba", "G.sav"), []byte("old build copy, longer"), now)
	writeAt(t, filepath.Join(build, "gba", "H.sav"), []byte("new save"), now)
	writeAt(t, filepath.Join(device, "roms", "gba", "G.sav"), []byte("played"), now.Add(-time.Hour))
	dial := func(ctx context.Context) (Remote, error) { return DirRemote{Root: device}, nil }
	s := waitJob(t, Start(context.Background(), "1", Profile{RemoteDir: "/roms"}, build, dial))
	if s.State != "done" || s.SyncSaves || s.Uploaded != 2 || s.Skipped != 1 {
		t.Fatalf("%+v", s)
	}
	if got := readStr(t, filepath.Join(device, "roms", "gba", "G.sav")); got != "played" {
		t.Fatalf("device save overwritten: %q", got)
	}
	if got := readStr(t, filepath.Join(device, "roms", "gba", "H.sav")); got != "new save" {
		t.Fatalf("missing save not uploaded: %q", got)
	}
}

// Ром не залился — его сохранения не трогаем. / ROM not uploaded: its saves stay untouched.
func TestSavesSkipRomMissingOnDevice(t *testing.T) {
	build, lib, device := t.TempDir(), t.TempDir(), t.TempDir()
	writeAt(t, filepath.Join(lib, "X.srm"), []byte("lib"), time.Now())
	if err := os.MkdirAll(filepath.Join(device, "roms"), 0o755); err != nil {
		t.Fatal(err)
	}
	links := []SaveLink{{Rel: "snes/X.sfc", LibDir: lib, LibBase: "X"}}
	dial := func(ctx context.Context) (Remote, error) { return DirRemote{Root: device}, nil }
	s := waitJob(t, Start(context.Background(), "1", Profile{RemoteDir: "/roms"}, build, dial, links...))
	if s.State != "done" || s.Saves.Roms != 0 || s.Saves.ToDevice != 0 {
		t.Fatalf("%+v", s)
	}
}

func TestFindSaveMapAndLinks(t *testing.T) {
	root := t.TempDir()
	lib := t.TempDir()
	other := t.TempDir()
	up := filepath.Join(root, "EASYROMS")
	m := saveMap{Version: 1, Entries: []SaveMapEntry{
		{Rom: filepath.Join(up, "snes", "A.sfc"), LibDir: lib, LibBase: "A (USA)"},
		{Rom: filepath.Join(up, "snes", "a.sfc"), LibDir: lib, LibBase: "dup"},      // дубль / duplicate
		{Rom: filepath.Join(root, "outside.sfc"), LibDir: lib, LibBase: "O"},        // вне папки / outside
		{Rom: filepath.Join(up, "nes", "B.nes"), LibDir: other, LibBase: "B"},       // папка не выбрана / not picked
		{Rom: filepath.Join(up, "nes", "C.nes"), LibDir: lib, LibBase: "../escape"}, // плохое имя / bad name
		{Rom: filepath.Join(up, "gb", "D.gb"), LibDir: lib, LibBase: ""},            // пусто / empty
	}}
	raw, _ := json.Marshal(m)
	writeAt(t, filepath.Join(root, SaveMapFile), raw, time.Now())
	entries, at := FindSaveMap(filepath.Join(up, "snes"))
	if at != root || len(entries) != len(m.Entries) {
		t.Fatalf("map at %q: %d entries", at, len(entries))
	}
	resolve := func(p string) (string, error) {
		if strings.HasPrefix(p, lib) {
			return p, nil
		}
		return "", errors.New("denied")
	}
	links := LinksForUpload(up, entries, resolve)
	if len(links) != 1 || links[0].Rel != "snes/A.sfc" || links[0].LibBase != "A (USA)" {
		t.Fatalf("%+v", links)
	}
	if e, _ := FindSaveMap(t.TempDir()); e != nil {
		t.Fatal("found a map where there is none")
	}
}
