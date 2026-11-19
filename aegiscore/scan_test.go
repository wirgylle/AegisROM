package aegiscore

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDetectConsoleCode(t *testing.T) {
	cases := []struct{ path, ext, want string }{
		{"/roms/snes/Game.sfc", ".sfc", "snes"},
		{"/roms/famicom/Game.nes", ".nes", "famicom"},
		{"/roms/psx/000001.chd", ".chd", "psx"},
		{"/roms/misc/Game.gba", ".gba", "gba"},     // по расширению
		{"/roms/misc/Game.bin", ".bin", "genesis"}, // .bin по умолчанию = Genesis
		{"/roms/misc/Game.xyz", ".xyz", "arcade"},
	}
	for _, c := range cases {
		if got := detectConsoleCode(filepath.FromSlash(c.path), c.ext); got != c.want {
			t.Errorf("detectConsoleCode(%q) = %q, want %q", c.path, got, c.want)
		}
	}
}

func TestAnalyzeSubfolderContext(t *testing.T) {
	root := filepath.FromSlash("/roms")
	rel, rus, top := AnalyzeSubfolderContext(root, filepath.FromSlash("/roms/NES Rus/Game.nes"))
	if rel != "NES Rus" || !rus || top {
		t.Errorf("got %q rus=%v top=%v", rel, rus, top)
	}
	rel, rus, top = AnalyzeSubfolderContext(root, filepath.FromSlash("/roms/Top 100/Game.nes"))
	if !top || rus {
		t.Errorf("got %q rus=%v top=%v", rel, rus, top)
	}
	rel, _, _ = AnalyzeSubfolderContext(root, filepath.FromSlash("/roms/Game.nes"))
	if rel != "(Корень)" {
		t.Errorf("root rel = %q", rel)
	}
}

func TestScoreRomCandidate(t *testing.T) {
	prio := []string{"Russia", "Europe", "USA", "Japan"}
	rus := RomItem{Region: "Russia", IsRussian: true, Extension: ".nes"}
	usa := RomItem{Region: "USA", Extension: ".nes"}
	usaZip := RomItem{Region: "USA", Extension: ".zip"}
	usaRev := RomItem{Region: "USA", Revision: "Rev 1", Extension: ".nes"}
	if !(scoreRomCandidate(rus, prio) > scoreRomCandidate(usa, prio)) {
		t.Error("приоритетный регион должен побеждать")
	}
	if !(scoreRomCandidate(usa, prio) > scoreRomCandidate(usaZip, prio)) {
		t.Error("распакованный файл должен быть лучше .zip")
	}
	if !(scoreRomCandidate(usaRev, prio) > scoreRomCandidate(usa, prio)) {
		t.Error("ревизия должна давать бонус")
	}
	// Точные значения фиксируют формулу 1G1R.
	if got := scoreRomCandidate(rus, prio); got != 4*100+60+5 {
		t.Errorf("rus score = %d", got)
	}
}

func TestDeduplicateAcrossSubfolders(t *testing.T) {
	prio := []string{"Europe", "USA", "Japan"}
	mk := func(path, region, crc, title string) RomItem {
		return RomItem{
			FilePath: filepath.FromSlash(path), FileName: filepath.Base(path),
			SourceSubfolder: filepath.Base(filepath.Dir(path)),
			ConsoleCode:     "nes", Extension: ".nes", Region: region,
			HeaderlessCRC32: crc, CleanTitle: title, ComparisonKey: BuildComparisonKey(title),
			Status: "verified", Is1G1RWinner: true,
		}
	}
	items := []RomItem{
		mk("/r/a/Contra (USA).nes", "USA", "AAAA", "Contra"),
		mk("/r/b/Contra (Europe).nes", "Europe", "BBBB", "Contra"),
		mk("/r/c/Contra (USA).nes", "USA", "AAAA", "Contra"), // точный дубль по CRC
		mk("/r/a/Battletoads (USA).nes", "USA", "CCCC", "Battletoads"),
		mk("/r/a/000001.nes", "World", "DDDD", "000001"),
		mk("/r/a/000002.nes", "World", "EEEE", "000002"),
	}
	items[3].Status = "verified"
	out := DeduplicateAcrossSubfolders(items, prio)

	winners := map[string]bool{}
	for _, it := range out {
		if it.Is1G1RWinner {
			winners[it.FilePath] = true
		}
	}
	want := []string{"/r/b/Contra (Europe).nes", "/r/a/Battletoads (USA).nes", "/r/a/000001.nes", "/r/a/000002.nes"}
	for _, w := range want {
		if !winners[filepath.FromSlash(w)] {
			t.Errorf("%s должен остаться победителем", w)
		}
	}
	if len(winners) != len(want) {
		t.Errorf("победителей %d, ожидалось %d: %v", len(winners), len(want), winners)
	}
	if out[2].Status != "duplicate_clone" {
		t.Errorf("CRC-дубль: status = %q", out[2].Status)
	}
}

func TestDeduplicateKeepsCueBinPair(t *testing.T) {
	mk := func(name, ext string) RomItem {
		return RomItem{
			FilePath: filepath.Join("r", "psx", name), FileName: name, ConsoleCode: "psx",
			Extension: ext, Region: "USA", HeaderlessCRC32: name,
			CleanTitle: "Tekken 3", ComparisonKey: "tekken3", Status: "verified", Is1G1RWinner: true,
		}
	}
	out := DeduplicateAcrossSubfolders([]RomItem{mk("Tekken 3.cue", ".cue"), mk("Tekken 3.bin", ".bin")}, []string{"USA"})
	for _, it := range out {
		if !it.Is1G1RWinner {
			t.Errorf("%s: cue и bin одной игры не дубли", it.FileName)
		}
	}
}

func TestInspectRomFileNES(t *testing.T) {
	ResetScanCaches()
	root := t.TempDir()
	dir := filepath.Join(root, "nes")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	body := make([]byte, 32)
	for i := range body {
		body[i] = byte(i)
	}
	rom := append(append([]byte("NES\x1a"), make([]byte, 12)...), body...)
	path := filepath.Join(dir, "Contra (USA) (Rev 1).nes")
	if err := os.WriteFile(path, rom, 0o644); err != nil {
		t.Fatal(err)
	}
	it, ok := InspectRomFile(root, path)
	if !ok {
		t.Fatal("InspectRomFile вернул false")
	}
	if it.ConsoleCode != "nes" || it.Region != "USA" || it.Revision != "Rev 1" || it.CleanTitle != "Contra" {
		t.Errorf("unexpected item: %+v", it)
	}
	if it.CRC32 == it.HeaderlessCRC32 {
		t.Error("CRC без iNES-заголовка должен отличаться от полного CRC")
	}
	if it.CanonicalName != "Contra (USA) (Rev 1).nes" {
		t.Errorf("CanonicalName = %q", it.CanonicalName)
	}
	if _, ok := InspectRomFile(root, filepath.Join(dir, "readme.txt")); ok {
		t.Error("txt не ром")
	}
}
