package aegiscore

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestGamelistTitleForFile(t *testing.T) {
	ResetScanCaches()
	dir := t.TempDir()
	// Неэкранированный & и мусор вне <game> не должны ломать разбор.
	xml := `<?xml version="1.0"?>
<gameList>
  <game><path>./000001.chd</path><name>000001. Tekken 3</name></game>
  <game><path>./000002.chd</path><name>Tom & Jerry</name><image>./images/000002.png</image></game>
  <game><path>./123456.chd</path><name>123456</name></game>
  <broken
</gameList>`
	if err := os.WriteFile(filepath.Join(dir, "gamelist.xml"), []byte(xml), 0o644); err != nil {
		t.Fatal(err)
	}
	cases := map[string]string{
		"000001.chd":         "Tekken 3",
		"000001 (World).chd": "Tekken 3", // сопоставление по номеру
		"000002.chd":         "Tom & Jerry",
		"123456.chd":         "",            // номер вместо названия не принимается
		"000003.chd":         "3D Lemmings", // нет в gamelist.xml -> заводская карта R36S
	}
	for file, want := range cases {
		if got := GamelistTitleForFile(filepath.Join(dir, file)); got != want {
			t.Errorf("GamelistTitleForFile(%q) = %q, want %q", file, got, want)
		}
	}
	// При найденных настоящих названиях создаётся резервная копия заводского gamelist.xml.
	if _, err := os.Stat(filepath.Join(dir, "gamelist_factory_backup.xml")); err != nil {
		t.Errorf("backup not created: %v", err)
	}
}

func TestWriteArkOSGamelistXMLRoundTrip(t *testing.T) {
	ResetScanCaches()
	dir := t.TempDir()
	roms := []RomItem{
		{FilePath: filepath.Join(dir, "Contra (USA).nes"), FileName: "Contra (USA).nes", CleanTitle: "Contra", CanonicalName: "Contra (USA).nes", Region: "USA", ConsoleCode: "nes", Extension: ".nes"},
	}
	if err := os.WriteFile(roms[0].FilePath, []byte("rom"), 0o644); err != nil {
		t.Fatal(err)
	}
	WriteArkOSGamelistXML(dir, roms)
	data, err := os.ReadFile(filepath.Join(dir, "gamelist.xml"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data), "<gameList>") || !strings.Contains(string(data), "Contra") {
		t.Errorf("unexpected gamelist.xml:\n%s", data)
	}
}

func TestSanitizeFileName(t *testing.T) {
	got := SanitizeFileName(`Bad:Name?<>|*"/\`)
	if strings.ContainsAny(got, `:?<>|*"/\`) {
		t.Errorf("SanitizeFileName left forbidden chars: %q", got)
	}
}

func TestFormatBytes(t *testing.T) {
	if got := FormatBytes(512); !strings.Contains(got, "512") {
		t.Errorf("FormatBytes(512) = %q", got)
	}
	if got := FormatBytes(5 * 1024 * 1024); !strings.Contains(got, "5") {
		t.Errorf("FormatBytes(5MB) = %q", got)
	}
}
