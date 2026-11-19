package dat

import (
	"archive/zip"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const noIntroXML = `<?xml version="1.0"?>
<!DOCTYPE datafile PUBLIC "-//Logiqx//DTD ROM Management Datafile//EN" "http://www.logiqx.com/Dats/datafile.dtd">
<datafile>
	<header>
		<name>Nintendo - Nintendo Entertainment System (Headered)</name>
		<description>Nintendo - Nintendo Entertainment System (Headered)</description>
		<version>20240101-000000</version>
		<homepage>No-Intro</homepage>
		<url>https://www.no-intro.org</url>
	</header>
	<game name="Super Mario Bros. (World)">
		<description>Super Mario Bros. (World)</description>
		<rom name="Super Mario Bros. (World).nes" size="40976" crc="3337EC46" md5="811b027eaf99c2def7b933c5208636de" sha1="ea343f4e445a9050d4b4fbac2c77d0693b1d0922"/>
	</game>
	<game name="Tom &amp; Jerry (USA)">
		<rom name="Tom &amp; Jerry (USA).nes" size="262160" crc="1A2B3C4D"/>
	</game>
</datafile>`

const redumpXML = `<?xml version="1.0"?>
<datafile>
	<header>
		<name>Sony - PlayStation</name>
		<homepage>redump.org</homepage>
		<url>http://redump.org/</url>
	</header>
	<game name="Final Fantasy VII (USA) (Disc 1)">
		<category>Games</category>
		<serial>SCUS-94163</serial>
		<rom name="Final Fantasy VII (USA) (Disc 1).cue" size="99" crc="11111111"/>
		<rom name="Final Fantasy VII (USA) (Disc 1).bin" size="747435024" crc="1459CBEF"/>
	</game>
</datafile>`

const libretroCMP = `clrmamepro (
	name "Sony - PlayStation"
	description "Sony - PlayStation"
	homepage "github.com/libretro/libretro-database"
)

game (
	name "Crash Bandicoot (USA)"
	serial "SCUS-94900"
	rom ( name "Crash Bandicoot (USA).bin" size 512000000 crc 6E9C1C94 md5 0123456789abcdef0123456789abcdef serial "SCUS-94900" )
)

game (
	name "Spyro \"Year\" (USA)"
	rom ( name "Spyro (USA).bin" size 100 crc AABBCCDD )
)
`

func mustParse(t *testing.T, body, file string) (*Info, []*Game) {
	t.Helper()
	info, games, err := Parse(strings.NewReader(body), file)
	if err != nil {
		t.Fatalf("Parse(%s): %v", file, err)
	}
	return info, games
}

func TestParseLogiqxNoIntro(t *testing.T) {
	info, games := mustParse(t, noIntroXML, "nes.dat")
	if info.Source != SourceNoIntro {
		t.Fatalf("source = %q", info.Source)
	}
	if info.System != "nintendo - nintendo entertainment system" {
		t.Fatalf("system = %q", info.System)
	}
	if len(games) != 2 || games[1].Name != "Tom & Jerry (USA)" {
		t.Fatalf("games = %+v", games)
	}
	r := games[0].Roms[0]
	if r.Size != 40976 || r.CRC32 != "3337EC46" || len(r.SHA1) != 40 {
		t.Fatalf("rom = %+v", r)
	}
}

func TestParseClrMamePro(t *testing.T) {
	info, games := mustParse(t, libretroCMP, "metadat/redump/Sony - PlayStation.dat")
	if info.Source != SourceRedump {
		t.Fatalf("source from path hint = %q", info.Source)
	}
	if len(games) != 2 {
		t.Fatalf("games = %d", len(games))
	}
	if games[0].Serials[0] != "SCUS94900" {
		t.Fatalf("serials = %v", games[0].Serials)
	}
	if games[1].Name != `Spyro "Year" (USA)` {
		t.Fatalf("escaped name = %q", games[1].Name)
	}
}

func newTestIndex(t *testing.T) *Index {
	ix := NewIndex()
	for _, d := range []struct{ body, file string }{
		{noIntroXML, "nes.dat"}, {redumpXML, "psx.dat"}, {libretroCMP, "libretro-psx.dat"},
	} {
		info, games := mustParse(t, d.body, d.file)
		ix.Add(info, games)
	}
	return ix
}

func TestLookup(t *testing.T) {
	ix := newTestIndex(t)
	cases := []struct {
		name string
		q    Query
		want string
		by   string
	}{
		{"crc+size", Query{CRC32: "3337ec46", Size: 40976}, "Super Mario Bros. (World)", "crc32"},
		{"sha1", Query{SHA1: "EA343F4E445A9050D4B4FBAC2C77D0693B1D0922"}, "Super Mario Bros. (World)", "sha1"},
		{"headerless", Query{CRC32: "00000000", Size: 999, HeaderlessCRC32: "3337EC46", HeaderlessSize: 40976}, "Super Mario Bros. (World)", "crc32-headerless"},
		{"disc track", Query{CRC32: "1459CBEF", Size: 747435024, System: "Sony - PlayStation"}, "Final Fantasy VII (USA) (Disc 1)", "crc32"},
		{"serial", Query{Serial: "SCUS_941.63"}, "Final Fantasy VII (USA) (Disc 1)", "serial"},
		{"md5", Query{MD5: "0123456789ABCDEF0123456789ABCDEF"}, "Crash Bandicoot (USA)", "md5"},
	}
	for _, c := range cases {
		m := ix.Lookup(c.q)
		if !m.Matched || m.Name != c.want || m.MatchedBy != c.by {
			t.Errorf("%s: got %+v", c.name, m)
		}
	}
	if m := ix.Lookup(Query{CRC32: "3337EC46", Size: 1}); m.Matched {
		t.Errorf("size mismatch must not match: %+v", m)
	}
	if m := ix.Lookup(Query{CRC32: "DEADBEEF", Size: 1, System: "Sega - Mega Drive - Genesis"}); m.Matched || !strings.Contains(m.Reason, "нет DAT для системы") {
		t.Errorf("unknown system reason: %+v", m)
	}
	if m := NewIndex().Lookup(Query{CRC32: "3337EC46"}); m.Matched || m.Reason == "" {
		t.Errorf("empty index: %+v", m)
	}
}

func TestLookupPrefersSameSystem(t *testing.T) {
	ix := NewIndex()
	a := `<datafile><header><name>Sega - Mega Drive - Genesis</name><homepage>No-Intro</homepage></header>
<game name="Game A (USA)"><rom name="a.md" size="10" crc="CAFEBABE"/></game></datafile>`
	b := `<datafile><header><name>Sega - Master System - Mark III</name><homepage>No-Intro</homepage></header>
<game name="Game B (Europe)"><rom name="b.sms" size="10" crc="CAFEBABE"/></game></datafile>`
	for i, body := range []string{a, b} {
		info, games := mustParse(t, body, []string{"md.dat", "sms.dat"}[i])
		ix.Add(info, games)
	}
	if m := ix.Lookup(Query{CRC32: "CAFEBABE", Size: 10, System: "Sega - Master System - Mark III"}); m.Name != "Game B (Europe)" {
		t.Fatalf("got %+v", m)
	}
}

func TestLoadDirWithZipAndBadFile(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "nes.dat"), []byte(noIntroXML), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "broken.dat"), []byte("hello"), 0o644); err != nil {
		t.Fatal(err)
	}
	sub := filepath.Join(dir, "redump")
	_ = os.Mkdir(sub, 0o755)
	zf, err := os.Create(filepath.Join(sub, "psx.zip"))
	if err != nil {
		t.Fatal(err)
	}
	zw := zip.NewWriter(zf)
	w, _ := zw.Create("Sony - PlayStation (2024).dat")
	_, _ = w.Write([]byte(redumpXML))
	_ = zw.Close()
	_ = zf.Close()

	st := NewIndex().LoadDir(dir)
	if st.Games != 3 {
		t.Fatalf("games = %d, dats = %+v", st.Games, st.Dats)
	}
	var sawErr, sawZip bool
	for _, d := range st.Dats {
		if d.Error != "" && d.File == "broken.dat" {
			sawErr = true
		}
		if strings.HasPrefix(d.File, "psx.zip/") && d.Source == SourceRedump {
			sawZip = true
		}
	}
	if !sawErr || !sawZip {
		t.Fatalf("dats = %+v", st.Dats)
	}
}

func TestNormalize(t *testing.T) {
	if got := NormalizeSystem("Nintendo - Game Boy (Parent-Clone) (20240101)"); got != "nintendo - game boy" {
		t.Errorf("NormalizeSystem = %q", got)
	}
	if got := NormalizeSerial(" slus-005.94 "); got != "SLUS00594" {
		t.Errorf("NormalizeSerial = %q", got)
	}
}
