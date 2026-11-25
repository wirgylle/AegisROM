package main

import (
	"path/filepath"
	"testing"
)

func TestDetectModKind(t *testing.T) {
	cases := []struct{ name, path, want string }{
		{"Contra (USA).nes", "/r/nes/Contra (USA).nes", ""},
		{"Contra (USA) [h1].nes", "", "hack"},
		{"Final Fantasy (U) [T+Rus1.0_Shedevr].nes", "", "translation"},
		{"Metroid (Hack) [T+Rus].nes", "", "hack"},
		{"Contra (USA) [t1].nes", "", "trainer"},
		{"Contra (USA) [f1].nes", "", "fix"},
		{"Contra (USA) (Patched).nes", "", "patched"},
		{"Contra (USA).nes", "/r/nes/hackroms/Contra (USA).nes", "patched"},
		{"Contra (USA) [b1].nes", "", ""},
	}
	for _, c := range cases {
		if got := detectModKind(c.name, filepath.FromSlash(c.path)); got != c.want {
			t.Errorf("detectModKind(%q) = %q, want %q", c.name, got, c.want)
		}
	}
}

func TestJunkRegexKeepsHacks(t *testing.T) {
	for _, n := range []string{"Game [h1].nes", "Game [t1].nes", "Game [T+Rus].nes", "Game (Unl).nes"} {
		if junkRegex.MatchString(n) {
			t.Errorf("%s не битый дамп", n)
		}
	}
	for _, n := range []string{"Game [b1].nes", "Game [p].nes", "Game [o2].nes", "Game (Pirate).nes", "Game (Bootleg).nes"} {
		if !junkRegex.MatchString(n) {
			t.Errorf("%s — битый дамп", n)
		}
	}
}

func TestApply1G1RSkipsHacks(t *testing.T) {
	roms := []RomInfo{
		{FileName: "Contra (USA).nes", Region: "USA", Status: "verified", CloneGroup: "Contra", Is1G1RWinner: true},
		{FileName: "Contra (Europe).nes", Region: "Europe", Status: "verified", CloneGroup: "Contra", Is1G1RWinner: true},
		{FileName: "Contra (USA) [h1].nes", Region: "USA", Status: "verified", CloneGroup: "Contra", Is1G1RWinner: true, ModKind: "hack"},
		{FileName: "Contra (USA) [T+Rus].nes", Region: "USA", Status: "verified", CloneGroup: "Contra", Is1G1RWinner: true, ModKind: "translation"},
	}
	out := apply1G1R(roms, []string{"USA", "Europe"})
	if !out[0].Is1G1RWinner || out[1].Is1G1RWinner {
		t.Errorf("из оригиналов остаётся USA: %v %v", out[0].Is1G1RWinner, out[1].Is1G1RWinner)
	}
	if !out[2].Is1G1RWinner || !out[3].Is1G1RWinner || out[2].Status != "verified" || out[3].Status != "verified" {
		t.Errorf("хак и перевод не дубли: %+v %+v", out[2], out[3])
	}
}
