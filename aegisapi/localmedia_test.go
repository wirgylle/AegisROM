package aegisapi

import (
	"encoding/binary"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writePNG(t *testing.T, p string, w, h int) {
	t.Helper()
	b := make([]byte, 33)
	copy(b, []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'})
	binary.BigEndian.PutUint32(b[16:], uint32(w))
	binary.BigEndian.PutUint32(b[20:], uint32(h))
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, b, 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestClassifyMediaName(t *testing.T) {
	cases := []struct{ file, dir, want string }{
		{"Game-marquee.png", "images", MediaMarquee},
		{"Game.png", "Named_Snaps", MediaSnap},
		{"Game.png", "box2dfront", MediaBoxart},
		{"Game-image.png", "images", MediaImage},
		{"Game.png", "screenshottitle", MediaTitle},
		{"Game-thumb.png", "images", MediaBoxart},
	}
	for _, c := range cases {
		if got := ClassifyMediaName(c.file, c.dir); got != c.want {
			t.Errorf("%s in %s: got %s, want %s", c.file, c.dir, got, c.want)
		}
	}
}

func TestResolveLocalMediaByKind(t *testing.T) {
	root := t.TempDir()
	// Skraper/ES-DE: виды по папкам. / Kinds by folder.
	writePNG(t, filepath.Join(root, "snes", "media", "box2dfront", "Chrono Trigger (USA).png"), 600, 800)
	writePNG(t, filepath.Join(root, "snes", "media", "screenshot", "Chrono Trigger (USA).png"), 256, 224)
	writePNG(t, filepath.Join(root, "snes", "media", "wheel", "Chrono Trigger (USA).png"), 400, 150)
	writePNG(t, filepath.Join(root, "snes", "media", "fanart", "Chrono Trigger (USA).png"), 1920, 1080)
	_ = os.MkdirAll(filepath.Join(root, "snes", "media", "videos"), 0o755)
	_ = os.WriteFile(filepath.Join(root, "snes", "media", "videos", "Chrono Trigger (USA).mp4"), []byte("x"), 0o644)

	res := ResolveLocalMedia(root, []ResolveMediaItem{{ID: "1", Title: "Chrono Trigger", OldFile: "Chrono Trigger (USA).sfc"}}, "/m?path=")
	if len(res) != 1 {
		t.Fatalf("results: %d", len(res))
	}
	r := res[0]
	for _, k := range []string{MediaBoxart, MediaSnap, MediaMarquee} {
		if r.Media[k] == "" {
			t.Errorf("missing %s: %+v", k, r.Media)
		}
	}
	if !strings.Contains(r.BoxArtURL, "box2dfront") {
		t.Errorf("cover should be box art, got %s", r.BoxArtURL)
	}
	if strings.Contains(r.Media[MediaImage], "fanart") || strings.Contains(r.BoxArtURL, "fanart") {
		t.Errorf("fan art must be skipped")
	}
	if r.VideoURL == "" {
		t.Errorf("video not found")
	}
}

func TestResolveLocalMediaImageThumbPair(t *testing.T) {
	root := t.TempDir()
	// Старый скраппер AegisROM: боксарт в -image, скриншот в -thumb.
	// The old AegisROM scraper: box art in -image, screenshot in -thumb.
	writePNG(t, filepath.Join(root, "images", "Sonic-image.png"), 640, 900)
	writePNG(t, filepath.Join(root, "images", "Sonic-thumb.png"), 320, 224)
	res := ResolveLocalMedia(root, []ResolveMediaItem{{ID: "s", Title: "Sonic", OldFile: "Sonic.md"}}, "")
	m := res[0].Media
	if !strings.HasSuffix(m[MediaBoxart], "Sonic-image.png") || !strings.HasSuffix(m[MediaSnap], "Sonic-thumb.png") {
		t.Fatalf("pair not decided by size: %+v", m)
	}
}

func TestImageSizeFromBytesJPEG(t *testing.T) {
	b := []byte{0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x2c, 0x00, 0xc8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0}
	w, h, ok := ImageSizeFromBytes(b)
	if !ok || w != 200 || h != 300 {
		t.Fatalf("got %d x %d ok=%v", w, h, ok)
	}
}
