package aegiscore

import (
	"bytes"
	"context"
	"crypto/rand"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// gfMul multiplies in GF(2^8) with the CD-ROM polynomial 0x11D.
func gfMul(a, b byte) byte {
	var p byte
	for b != 0 {
		if b&1 != 0 {
			p ^= a
		}
		hi := a & 0x80
		a <<= 1
		if hi != 0 {
			a ^= 0x1D
		}
		b >>= 1
	}
	return p
}

func gfPow2(n int) byte {
	v := byte(1)
	for i := 0; i < n; i++ {
		v = gfMul(v, 2)
	}
	return v
}

// Независимая проверка P/Q по ECMA-130: синдромы кодовых слов равны нулю.
// Independent P/Q check per ECMA-130: codeword syndromes are zero.
func TestMode2Form1SectorParity(t *testing.T) {
	data := make([]byte, 2048)
	_, _ = rand.Read(data)
	s := make([]byte, 2352)
	BuildMode2Form1Sector(s, 1234, data)
	if !bytes.Equal(s[:12], cdSync) || s[15] != 2 {
		t.Fatal("bad sync/mode")
	}
	if got, want := cdEDC(s[16:2072]), uint32(s[2072])|uint32(s[2073])<<8|uint32(s[2074])<<16|uint32(s[2075])<<24; got != want {
		t.Fatalf("EDC mismatch %08x vs %08x", got, want)
	}
	z := append([]byte(nil), s...)
	clear(z[12:16]) // MODE2: address zeroed for ECC
	area := z[12:]
	word := func(w, b int) byte { return area[2*w+b] }
	// P: 43 columns x 2 bytes, 26 elements (24 data + 2 parity).
	for c := 0; c < 43; c++ {
		for b := 0; b < 2; b++ {
			var s0, s1 byte
			for r := 0; r < 26; r++ {
				v := word(43*r+c, b)
				s0 ^= v
				s1 ^= gfMul(gfPow2(25-r), v)
			}
			if s0 != 0 || s1 != 0 {
				t.Fatalf("P syndrome non-zero at column %d byte %d", c, b)
			}
		}
	}
	// Q: 26 diagonals x 2 bytes, 45 elements (43 data + 2 parity).
	for d := 0; d < 26; d++ {
		for b := 0; b < 2; b++ {
			var s0, s1 byte
			for m := 0; m < 45; m++ {
				var w int
				switch {
				case m < 43:
					w = (44*m + 43*d) % 1118
				case m == 43:
					w = 1118 + d
				default:
					w = 1118 + 26 + d
				}
				v := word(w, b)
				s0 ^= v
				s1 ^= gfMul(gfPow2(44-m), v)
			}
			if s0 != 0 || s1 != 0 {
				t.Fatalf("Q syndrome non-zero at diagonal %d byte %d", d, b)
			}
		}
	}
}

func writeCooked(t *testing.T, path string, sectors int, system string) {
	t.Helper()
	b := make([]byte, sectors*2048)
	_, _ = rand.Read(b)
	pvd := 16 * 2048
	b[pvd] = 1
	copy(b[pvd+1:], "CD001")
	sys := make([]byte, 32)
	for i := range sys {
		sys[i] = ' '
	}
	copy(sys, system)
	copy(b[pvd+8:], sys)
	if err := os.WriteFile(path, b, 0o644); err != nil {
		t.Fatal(err)
	}
}

func writeRaw(t *testing.T, path string, sectors int) {
	t.Helper()
	data := make([]byte, 2048)
	s := make([]byte, 2352)
	var buf bytes.Buffer
	for i := 0; i < sectors; i++ {
		_, _ = rand.Read(data)
		if i == 16 {
			data[0] = 1
			copy(data[1:], "CD001")
			copy(data[8:], "PLAYSTATION")
		}
		BuildMode2Form1Sector(s, i, data)
		buf.Write(s)
	}
	if err := os.WriteFile(path, buf.Bytes(), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestInspectDiscImage(t *testing.T) {
	dir := t.TempDir()
	writeCooked(t, filepath.Join(dir, "a.iso"), 40, "PLAYSTATION")
	writeCooked(t, filepath.Join(dir, "b.iso"), 40, "SEGA SEGASATURN")
	writeRaw(t, filepath.Join(dir, "c.bin"), 40)
	for name, want := range map[string]DiscLayout{
		"a.iso": {SectorSize: 2048, PlayStation: true},
		"b.iso": {SectorSize: 2048},
		"c.bin": {SectorSize: 2352, DataOffset: 24, PlayStation: true},
	} {
		got, _, err := InspectDiscImage(filepath.Join(dir, name))
		if err != nil || got != want {
			t.Errorf("%s: got %+v err %v, want %+v", name, got, err, want)
		}
	}
}

func TestFixCueFileRefs(t *testing.T) {
	dir := t.TempDir()
	_ = os.WriteFile(filepath.Join(dir, "Game (Track 1).bin"), []byte("x"), 0o644)
	cue := filepath.Join(dir, "game.cue")
	_ = os.WriteFile(cue, []byte("\xEF\xBB\xBFFILE \"C:\\roms\\GAME (TRACK 1).BIN\" BINARY\r\n  TRACK 01 MODE2/2352\r\n    INDEX 01 00:00:00\r\n"), 0o644)
	fixed, _, err := fixCueFileRefs(cue, dir)
	if err != nil {
		t.Fatal(err)
	}
	b, _ := os.ReadFile(fixed)
	if !strings.Contains(string(b), `FILE "Game (Track 1).bin" BINARY`) {
		t.Fatalf("not rewritten: %q", b)
	}
	_ = os.WriteFile(cue, []byte("FILE \"missing.bin\" BINARY\r\n  TRACK 01 MODE2/2352\r\n"), 0o644)
	if _, _, err := fixCueFileRefs(cue, dir); err == nil || !strings.Contains(err.Error(), "missing.bin") {
		t.Fatalf("expected missing-file error, got %v", err)
	}
}

// С настоящим chdman: каждый вход даёт CHD с сырыми секторами, без зависания.
// With a real chdman: every input gives a CHD with raw sectors and does not hang.
func TestPrepareCDInputWithChdman(t *testing.T) {
	chdman, err := exec.LookPath("chdman")
	if err != nil {
		t.Skip("chdman not installed")
	}
	cases := []struct {
		name, console string
		setup         func(dir string) string
		wantType      string
	}{
		{"bin without cue", "psx", func(d string) string { writeRaw(t, filepath.Join(d, "g.bin"), 300); return filepath.Join(d, "g.bin") }, "MODE2_RAW"},
		{"ccd+img", "psx", func(d string) string {
			writeRaw(t, filepath.Join(d, "g.img"), 300)
			_ = os.WriteFile(filepath.Join(d, "g.ccd"), []byte("[CloneCD]\r\nVersion=3\r\n"), 0o644)
			return filepath.Join(d, "g.ccd")
		}, "MODE2_RAW"},
		{"psx iso 2048", "", func(d string) string { writeCooked(t, filepath.Join(d, "g.iso"), 300, "PLAYSTATION"); return filepath.Join(d, "g.iso") }, "MODE2_RAW"},
		{"saturn iso 2048", "saturn", func(d string) string { writeCooked(t, filepath.Join(d, "g.iso"), 300, "SEGA SEGASATURN"); return filepath.Join(d, "g.iso") }, "MODE1"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			dir := t.TempDir()
			entry := c.setup(dir)
			in, _, err := PrepareCDInput(entry, dir, "Out", c.console)
			if err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
			defer cancel()
			out := filepath.Join(dir, "Out.chd")
			cmd := exec.CommandContext(ctx, chdman, ChdmanCreateCDArgs(in, out)...)
			cmd.Dir = dir
			if b, err := cmd.CombinedOutput(); err != nil {
				t.Fatalf("chdman: %v\n%s", err, tailOf(b))
			}
			info, err := InspectCHD(out)
			if err != nil {
				t.Fatal(err)
			}
			if info.Kind != "cd" || len(info.Tracks) != 1 || info.Tracks[0].Type != c.wantType || info.Tracks[0].Frames != 300 {
				t.Fatalf("unexpected CHD: %+v", info)
			}
			if strings.Join(info.Codecs, ",") != ChdmanCDCodecs {
				t.Fatalf("codecs %v", info.Codecs)
			}
			if info.Truncated {
				t.Fatal("reported truncated")
			}
			issues := CheckCHDForConsole(info, "psx")
			hasErr := false
			for _, is := range issues {
				hasErr = hasErr || is.Level == "error"
			}
			if hasErr != (c.wantType == "MODE1") {
				t.Fatalf("psx issues %+v", issues)
			}
			// Обрезанный файл. / Truncated file.
			st, _ := os.Stat(out)
			_ = os.Truncate(out, st.Size()-100)
			if info, _ := InspectCHD(out); info == nil || !info.Truncated {
				t.Fatal("truncation not detected")
			}
		})
	}
}

func tailOf(b []byte) string {
	if len(b) > 500 {
		b = b[len(b)-500:]
	}
	return string(b)
}
