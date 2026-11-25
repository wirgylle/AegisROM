package aegisdesktop

import (
	"os"
	"path/filepath"
	"testing"
)

// Раскладка Skraper: <консоль>/media/<вид>/. Фон из fanart не должен стать обложкой.
// Skraper layout: <console>/media/<kind>/. Fan art must not become the cover.
func TestIndexMediaSkraperLayout(t *testing.T) {
	root := t.TempDir()
	for _, p := range []string{
		"psx/media/fanart/Game.png",
		"psx/media/images/Game.png",
		"psx/media/videos/Game.mp4",
	} {
		full := filepath.Join(root, filepath.FromSlash(p))
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	images, videos := indexMedia(root)
	if got := filepath.Base(filepath.Dir(images["game"])); got != "images" {
		t.Fatalf("cover from %q, want images", images["game"])
	}
	if videos["game"] == "" {
		t.Fatal("video in media/videos not found")
	}
}
