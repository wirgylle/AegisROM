package aegiscore

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDetectRomModKind(t *testing.T) {
	cases := []struct{ name, path, want string }{
		{"Contra (USA).nes", "/r/nes/Contra (USA).nes", ModOriginal},
		{"Contra (USA) [h1].nes", "", ModHack},
		{"Contra (USA) [h2C Hack by Foo].nes", "", ModHack},
		{"Final Fantasy (U) [T+Rus1.0_Shedevr].nes", "", ModTranslation},
		{"Final Fantasy (U) [T-Eng].nes", "", ModTranslation},
		{"Metroid (Hack) [T+Rus].nes", "", ModHack},
		{"Zelda (USA) (Translated Rus).sfc", "", ModTranslation},
		{"Contra (USA) [t1].nes", "", ModTrainer},
		{"Contra (USA) [f1].nes", "", ModFix},
		{"Contra (USA) (Patched).nes", "", ModPatched},
		{"Contra (USA).nes", "/r/nes/hackroms/Contra (USA).nes", ModPatched},
		{"Contra (USA) [b1].nes", "", ModOriginal},
		{"Tetris (World) [T+Rus].gb", "", ModTranslation},
	}
	for _, c := range cases {
		if got := DetectRomModKind(c.name, filepath.FromSlash(c.path)); got != c.want {
			t.Errorf("DetectRomModKind(%q, %q) = %q, want %q", c.name, c.path, got, c.want)
		}
	}
}

func TestJunkRegexKeepsHacksAndTrainers(t *testing.T) {
	for _, name := range []string{"Game [h1].nes", "Game [t1].nes", "Game [T+Rus].nes", "Game [h].nes"} {
		if junkRegex.MatchString(name) {
			t.Errorf("%s не должен считаться битым дампом", name)
		}
	}
	for _, name := range []string{"Game [b1].nes", "Game [p1].nes", "Game [o2].nes", "Game (Pirate).nes", "Game (Bad).nes"} {
		if !junkRegex.MatchString(name) {
			t.Errorf("%s должен считаться битым дампом", name)
		}
	}
}

func TestInspectRomFileHackIsNotJunk(t *testing.T) {
	ResetScanCaches()
	root := t.TempDir()
	dir := filepath.Join(root, "nes")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	rom := append([]byte("NES\x1a"), make([]byte, 44)...)
	path := filepath.Join(dir, "Contra (USA) [h1].nes")
	if err := os.WriteFile(path, rom, 0o644); err != nil {
		t.Fatal(err)
	}
	it, ok := InspectRomFile(root, path)
	if !ok {
		t.Fatal("InspectRomFile вернул false")
	}
	if it.Status != "verified" || !it.Is1G1RWinner || it.ModKind != ModHack {
		t.Errorf("хак: status=%q winner=%v mod=%q", it.Status, it.Is1G1RWinner, it.ModKind)
	}
}

func TestDeduplicateKeepsHackNextToOriginal(t *testing.T) {
	mk := func(path, crc, mod string) RomItem {
		return RomItem{
			FilePath: filepath.FromSlash(path), FileName: filepath.Base(path),
			SourceSubfolder: filepath.Base(filepath.Dir(path)),
			ConsoleCode:     "nes", Extension: ".nes", Region: "USA",
			HeaderlessCRC32: crc, CleanTitle: "Contra", ComparisonKey: BuildComparisonKey("Contra"),
			Status: "verified", Is1G1RWinner: true, ModKind: mod,
		}
	}
	items := []RomItem{
		mk("/r/nes/Contra (USA).nes", "AAAA", ModOriginal),
		mk("/r/nes/Contra (USA) [h1].nes", "BBBB", ModHack),
		mk("/r/nes/Contra (USA) [T+Rus].nes", "CCCC", ModTranslation),
		mk("/r/nes/hackroms/Contra (USA) [T+Rus].nes", "CCCC", ModTranslation), // точная копия по CRC
		mk("/r/nes2/Contra (USA).nes", "DDDD", ModOriginal),                    // другой дамп оригинала
	}
	out := DeduplicateAcrossSubfolders(items, []string{"USA"})
	if !out[1].Is1G1RWinner || !out[2].Is1G1RWinner {
		t.Errorf("хак и перевод не дубли оригинала: %v %v", out[1].Is1G1RWinner, out[2].Is1G1RWinner)
	}
	if out[3].Status != "duplicate_clone" {
		t.Errorf("точная копия перевода по CRC: status = %q", out[3].Status)
	}
	winners := 0
	for _, i := range []int{0, 4} {
		if out[i].Is1G1RWinner {
			winners++
		}
	}
	if winners != 1 {
		t.Errorf("из двух оригиналов должен остаться один, осталось %d", winners)
	}
}
