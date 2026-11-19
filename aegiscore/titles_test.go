package aegiscore

import (
	"encoding/binary"
	"testing"
)

func TestExtractCleanTitle(t *testing.T) {
	cases := map[string]string{
		"Super Mario Kart (USA).sfc": "Super Mario Kart",
		// Известная ошибка: слово World в названии вырезается как регион.
		// Тест фиксирует текущее поведение; исправлять отдельным PR вместе с тестом.
		"Super Mario World (USA).sfc":        "Super Mario",
		"001 - Contra (Japan).nes":           "Contra",
		"02. Sonic the Hedgehog (Europe).md": "Sonic the Hedgehog",
		"000001 (World).chd":                 "000001",
		"0001.pbp":                           "0001",
		"007 - GoldenEye (USA).z64":          "007 - GoldenEye",
		"Tekken_3_RUS.bin":                   "Tekken 3",
	}
	for in, want := range cases {
		if got := ExtractCleanTitle(in); got != want {
			t.Errorf("ExtractCleanTitle(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestBuildComparisonKey(t *testing.T) {
	// Римские цифры, регионы и порядковые номера не должны различать одну и ту же игру.
	same := [][2]string{
		{"Final Fantasy VII", "Final Fantasy 7"},
		{"The Legend of Zelda", "Legend of Zelda (USA)"},
		{"001 - Contra", "Contra"},
	}
	for _, p := range same {
		a, b := BuildComparisonKey(p[0]), BuildComparisonKey(p[1])
		if a != b {
			t.Errorf("keys differ: %q -> %q, %q -> %q", p[0], a, p[1], b)
		}
	}
	if BuildComparisonKey("Contra") == BuildComparisonKey("Super Contra") {
		t.Error("разные игры получили одинаковый ключ")
	}
	if got := BuildComparisonKey("007 - GoldenEye"); got != "007goldeneye" {
		t.Errorf("007 должен сохраниться, got %q", got)
	}
}

func TestParseRegion(t *testing.T) {
	cases := []struct {
		name  string
		isRus bool
		want  string
	}{
		{"Game (USA).nes", false, "USA"},
		{"Game (U).nes", false, "USA"},
		{"Game (E).nes", false, "Europe"},
		{"Game (Japan).nes", false, "Japan"},
		{"Game (W).nes", false, "World"},
		{"Game (Rus).nes", false, "Russia"},
		{"Game (USA).nes", true, "Russia"},
		{"Game PAL.nes", false, "Europe"},
		{"Game.nes", false, "World"},
	}
	for _, c := range cases {
		if got := ParseRegion(c.name, c.isRus); got != c.want {
			t.Errorf("ParseRegion(%q, %v) = %q, want %q", c.name, c.isRus, got, c.want)
		}
	}
}

func TestParseRevision(t *testing.T) {
	if got := parseRevision("Game (USA) (Rev 1).sfc"); got != "Rev 1" {
		t.Errorf("got %q", got)
	}
	if got := parseRevision("Game (USA).sfc"); got != "" {
		t.Errorf("got %q", got)
	}
}

func TestIsPureNumberOrGenericTitle(t *testing.T) {
	for _, s := range []string{"", "000001", "0001 (World)", "game_01", "PlayStation", "track01"} {
		if !IsPureNumberOrGenericTitle(s) {
			t.Errorf("%q должен считаться номером/заглушкой", s)
		}
	}
	for _, s := range []string{"007", "Tekken 3", "Contra"} {
		if IsPureNumberOrGenericTitle(s) {
			t.Errorf("%q — настоящее название", s)
		}
	}
}

func TestExtractCoreNumberKey(t *testing.T) {
	cases := map[string]string{
		"000001 (World).chd": "000001",
		"000001.chd":         "000001",
		"1 (USA).pbp":        "000001",
		"Tekken 3.chd":       "tekken 3",
	}
	for in, want := range cases {
		if got := ExtractCoreNumberKey(in); got != want {
			t.Errorf("ExtractCoreNumberKey(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestNormalizePS1Serial(t *testing.T) {
	for _, in := range []string{"SLUS_001.70", "slus-00170", "SLUS00170"} {
		if got := normalizePS1Serial(in); got != "SLUS00170" {
			t.Errorf("normalizePS1Serial(%q) = %q", in, got)
		}
	}
	if got := normalizePS1Serial("not a serial"); got != "" {
		t.Errorf("got %q", got)
	}
}

func TestExtractPS1TitleFromRawBytes(t *testing.T) {
	// Серийник из встроенной базы.
	data := append(make([]byte, 100), []byte("cdrom:\\SLUS_001.70;1")...)
	if got := extractPS1TitleFromRawBytes(data); got != "Resident Evil (USA)" {
		t.Errorf("serial: got %q", got)
	}

	// Метка тома ISO 9660 (Primary Volume Descriptor), заглавные буквы -> Title Case.
	pvd := make([]byte, 2048)
	copy(pvd, "\x01CD001")
	copy(pvd[40:72], "CRASH_BANDICOOT                 ")
	if got := extractPS1TitleFromRawBytes(pvd); got != "Crash Bandicoot" {
		t.Errorf("volume id: got %q", got)
	}

	// Метка тома, похожая на номер, не годится.
	copy(pvd[40:72], "000001                          ")
	if got := extractPS1TitleFromRawBytes(pvd); got != "" {
		t.Errorf("numeric volume id: got %q", got)
	}
}

func TestExtractPS1MemoryCardTitle(t *testing.T) {
	block := make([]byte, 128)
	block[0], block[1], block[2], block[3] = 'S', 'C', 0x11, 1
	copy(block[4:68], "Metal Gear Solid")
	if got := extractPS1MemoryCardTitle(block); got != "Metal Gear Solid" {
		t.Errorf("got %q", got)
	}
}

// buildSFO собирает минимальный PARAM.SFO с переданными строковыми ключами.
func buildSFO(kv [][2]string) []byte {
	var keys, vals []byte
	type ent struct{ ko, vo, vl int }
	var ents []ent
	for _, p := range kv {
		ents = append(ents, ent{len(keys), len(vals), len(p[1]) + 1})
		keys = append(keys, append([]byte(p[0]), 0)...)
		vals = append(vals, append([]byte(p[1]), 0)...)
	}
	hdr := 20 + 16*len(kv)
	keyStart := hdr
	dataStart := keyStart + len(keys)
	out := make([]byte, dataStart+len(vals))
	copy(out, "\x00PSF")
	binary.LittleEndian.PutUint32(out[8:], uint32(keyStart))
	binary.LittleEndian.PutUint32(out[12:], uint32(dataStart))
	binary.LittleEndian.PutUint32(out[16:], uint32(len(kv)))
	for i, e := range ents {
		off := 20 + 16*i
		binary.LittleEndian.PutUint16(out[off:], uint16(e.ko))
		binary.LittleEndian.PutUint32(out[off+4:], uint32(e.vl))
		binary.LittleEndian.PutUint32(out[off+12:], uint32(e.vo))
	}
	copy(out[keyStart:], keys)
	copy(out[dataStart:], vals)
	return out
}

func TestParseParamSFO(t *testing.T) {
	sfo := buildSFO([][2]string{{"DISC_ID", "SCUS94900"}, {"TITLE", "Crash Bandicoot"}})
	title, id := parseParamSFO(sfo)
	if title != "Crash Bandicoot" || id != "SCUS94900" {
		t.Errorf("got title=%q id=%q", title, id)
	}
	if title, id := parseParamSFO([]byte("garbage-garbage-garbage")); title != "" || id != "" {
		t.Errorf("garbage parsed as %q/%q", title, id)
	}
}

func TestIsJamesBond007Game(t *testing.T) {
	if !IsJamesBond007Game("007 - Tomorrow Never Dies (USA)") || !IsJamesBond007Game("GoldenEye 007") {
		t.Error("Bond game not detected")
	}
	if IsJamesBond007Game("000007 Contra") {
		t.Error("false positive")
	}
}

func TestDetectHeaderSkip(t *testing.T) {
	nes := append([]byte("NES\x1a"), make([]byte, 40)...)
	if got := detectHeaderSkip(".nes", nes); got != 16 {
		t.Errorf("nes: %d", got)
	}
	if got := detectHeaderSkip(".smc", make([]byte, 1024+512)); got != 512 {
		t.Errorf("smc copier header: %d", got)
	}
	if got := detectHeaderSkip(".smc", make([]byte, 2048)); got != 0 {
		t.Errorf("smc no header: %d", got)
	}
}
