package aegiscore

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
)

func TestStripBin2352ToISO(t *testing.T) {
	sync := []byte{0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x00}
	const sectors = 32
	var bin, want bytes.Buffer
	for s := 0; s < sectors; s++ {
		sec := make([]byte, 2352)
		copy(sec, sync)
		payload := bytes.Repeat([]byte{byte(s)}, 2048)
		copy(sec[24:], payload) // MODE2/XA: данные с 24-го байта
		bin.Write(sec)
		want.Write(payload)
	}
	dir := t.TempDir()
	in, out := filepath.Join(dir, "game.bin"), filepath.Join(dir, "game.iso")
	if err := os.WriteFile(in, bin.Bytes(), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := StripBin2352ToISO(in, out); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(out)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, want.Bytes()) {
		t.Fatalf("ISO mismatch: len %d, want %d", len(got), want.Len())
	}

	small := filepath.Join(dir, "small.bin")
	_ = os.WriteFile(small, make([]byte, 100), 0o644)
	if err := StripBin2352ToISO(small, filepath.Join(dir, "x.iso")); err == nil {
		t.Error("слишком маленький образ должен давать ошибку")
	}
}
