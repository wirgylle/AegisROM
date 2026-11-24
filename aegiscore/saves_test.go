package aegiscore

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func put(t *testing.T, p, body string, mod time.Time) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	if !mod.IsZero() {
		_ = os.Chtimes(p, mod, mod)
	}
}

func read(t *testing.T, p string) string {
	t.Helper()
	b, err := os.ReadFile(p)
	if err != nil {
		t.Fatalf("read %s: %v", p, err)
	}
	return string(b)
}

func TestSaveSuffixOf(t *testing.T) {
	cases := map[string]string{
		"Game (USA).srm":        ".srm",
		"game (usa).SRM":        ".srm",
		"Game (USA).state.auto": ".state.auto",
		"Game (USA).state3":     ".state3",
		"Game (USA)_1.mcd":      "_1.mcd",
		"Game (USA).sfc":        "",
		"Game (USA) 2.srm":      "",
	}
	for name, want := range cases {
		if got := SaveSuffixOf(name, "Game (USA)"); got != want {
			t.Errorf("%s: got %q want %q", name, got, want)
		}
	}
}

func TestMoveRomSavesRename(t *testing.T) {
	dir := t.TempDir()
	now := time.Date(2026, 11, 24, 12, 0, 0, 0, time.Local)
	put(t, filepath.Join(dir, "Old.srm"), "sram", time.Time{})
	put(t, filepath.Join(dir, "Old.state"), "st", time.Time{})
	put(t, filepath.Join(dir, SaveHistoryDir, "Old", "20261120-101010.srm"), "older", time.Time{})

	res := MoveRomSaves(dir, dir, "Old", "New (USA)", now)
	if res.Moved != 2 || res.History != 1 || res.Conflicts != 0 {
		t.Fatalf("result %+v", res)
	}
	if read(t, filepath.Join(dir, "New (USA).srm")) != "sram" || read(t, filepath.Join(dir, "New (USA).state")) != "st" {
		t.Fatal("saves not renamed")
	}
	if _, err := os.Stat(filepath.Join(dir, "Old.srm")); !os.IsNotExist(err) {
		t.Fatal("old save left behind")
	}
	hist := SaveHistoryFolder(dir, "New (USA)")
	if got := HistoryEntries(hist, ".srm"); len(got) != 2 || got[1] != "20261120-101010.srm" {
		t.Fatalf("srm history %v", got)
	}
	if got := HistoryEntries(hist, ".state"); len(got) != 1 {
		t.Fatalf("state history %v", got)
	}
	if _, err := os.Stat(filepath.Join(dir, SaveHistoryDir)); err != nil {
		t.Fatal("history root removed")
	}
	if _, err := os.Stat(SaveHistoryFolder(dir, "Old")); !os.IsNotExist(err) {
		t.Fatal("old history folder left behind")
	}
}

func TestMoveRomSavesConflictNewerWins(t *testing.T) {
	src := t.TempDir()
	dst := t.TempDir()
	now := time.Date(2026, 11, 24, 12, 0, 0, 0, time.Local)
	old := now.Add(-48 * time.Hour)
	recent := now.Add(-1 * time.Hour)

	// JP-версия играна недавно, у RU-версии старое сохранение: текущим становится JP.
	put(t, filepath.Join(src, "Game (Japan).srm"), "jp", recent)
	put(t, filepath.Join(dst, "Game (Russia).srm"), "ru", old)
	res := MoveRomSaves(src, dst, "Game (Japan)", "Game (Russia)", now)
	if res.Conflicts != 1 || res.Moved != 1 {
		t.Fatalf("result %+v", res)
	}
	if read(t, filepath.Join(dst, "Game (Russia).srm")) != "jp" {
		t.Fatal("newer save must win")
	}
	hist := SaveHistoryFolder(dst, "Game (Russia)")
	bodies := map[string]bool{}
	for _, n := range HistoryEntries(hist, ".srm") {
		bodies[read(t, filepath.Join(hist, n))] = true
	}
	if !bodies["jp"] || !bodies["ru"] {
		t.Fatalf("both versions must be in history: %v", bodies)
	}

	// Обратный случай: у цели сохранение новее, оно остаётся.
	put(t, filepath.Join(src, "B.srm"), "src-old", old)
	put(t, filepath.Join(dst, "C.srm"), "dst-new", recent)
	MoveRomSaves(src, dst, "B", "C", now)
	if read(t, filepath.Join(dst, "C.srm")) != "dst-new" {
		t.Fatal("older moved save replaced a newer one")
	}
	if _, err := os.Stat(filepath.Join(src, "B.srm")); !os.IsNotExist(err) {
		t.Fatal("source save left behind")
	}
	if len(HistoryEntries(SaveHistoryFolder(dst, "C"), ".srm")) != 1 {
		t.Fatal("moved save must be kept in history")
	}
}

func TestWriteSaveBytesAndPrune(t *testing.T) {
	dir := t.TempDir()
	now := time.Date(2026, 11, 24, 12, 0, 0, 0, time.Local)
	for i := 0; i < SaveHistoryKeep+3; i++ {
		if _, _, err := WriteSaveBytes(dir, "G", ".sav", []byte{byte(i)}, now); err != nil {
			t.Fatal(err)
		}
	}
	if got := HistoryEntries(SaveHistoryFolder(dir, "G"), ".sav"); len(got) != SaveHistoryKeep {
		t.Fatalf("history len %d", len(got))
	}
	if _, _, err := WriteSaveBytes(dir, "G", ".exe", []byte("x"), now); err == nil {
		t.Fatal("foreign suffix accepted")
	}
}
