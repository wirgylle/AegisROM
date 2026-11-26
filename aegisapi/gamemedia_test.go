package aegisapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"testing"
)

func TestClassifyGameMedia(t *testing.T) {
	cases := []struct{ file, dir, kind, stem string }{
		{"Game.png", "media/boxes", "boxart", "Game"},
		{"Game.png", "media/images", "image", "Game"},
		{"Game.png", "media/fanart", "fanart", "Game"},
		{"Game.pdf", "media/maps", "map", "Game"},
		{"Game.png", "media/screenmarquee", "screenmarquee", "Game"},
		{"Game.png", "media/steamgrid", "steamgrid", "Game"},
		{"Game.png", "media/support", "support", "Game"},
		{"Game.png", "media/supporttexture", "supporttexture", "Game"},
		{"Game.txt", "media/tipsandtricks", "tips", "Game"},
		{"Game.mp4", "media/videos", "video", "Game"},
		{"Game.png", "media/wheels", "marquee", "Game"},
		{"Game-fanart.png", "nes/images", "fanart", "Game"},
		{"Game-image.png", "images", "boxart", "Game"},
		{"Game-thumb.png", "images", "snap", "Game"},
		{"Game.pdf", "manuals", "manual", "Game"},
		{"Game.txt", "media/videos", "", ""},
		{"Game.png", "nes", "", ""},
	}
	for _, c := range cases {
		k, s := ClassifyGameMedia(c.file, c.dir)
		if k != c.kind || s != c.stem {
			t.Errorf("%s in %s: got %q %q, want %q %q", c.file, c.dir, k, s, c.kind, c.stem)
		}
	}
}

func TestGameMediaRoutesAndKinds(t *testing.T) {
	root := t.TempDir()
	nes := filepath.Join(root, "nes")
	files := map[string]string{
		"Battletoads (USA).nes":                     "ROM",
		"images/Battletoads (USA)-image.png":        "BOX",
		"images/Battletoads (USA)-fanart.png":       "FAN",
		"media/maps/Battletoads (USA).png":          "MAP",
		"media/support/Battletoads (USA).png":       "CART",
		"media/tipsandtricks/Battletoads (USA).pdf": "TIPS",
		"media/fanart/Contra (USA).png":             "OTHER",
	}
	for rel, body := range files {
		p := filepath.Join(nes, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	got := map[string]string{}
	for _, f := range ListGameMedia(filepath.Join(nes, "Battletoads (USA).nes")) {
		got[f.Kind] = f.Rel
	}
	want := map[string]string{
		"boxart":  "images/Battletoads (USA)-image.png",
		"fanart":  "images/Battletoads (USA)-fanart.png",
		"map":     "media/maps/Battletoads (USA).png",
		"support": "media/support/Battletoads (USA).png",
		"tips":    "media/tipsandtricks/Battletoads (USA).pdf",
	}
	if len(got) != len(want) {
		t.Fatalf("got %v", got)
	}
	for k, v := range want {
		if got[k] != v {
			t.Errorf("%s: got %q want %q", k, got[k], v)
		}
	}

	mux := http.NewServeMux()
	RegisterGameMediaRoutes(mux, nil)
	q := url.Values{"romFileName": {"Battletoads (USA).nes"}, "consoleCode": {"nes"}, "libraryPath": {root}}
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest("GET", "/api/native/fs/game-media?"+q.Encode(), nil))
	var resp struct {
		OK    bool `json:"ok"`
		Items []struct{ Kind, URL string }
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil || !resp.OK || len(resp.Items) != 5 {
		t.Fatalf("list: %v %s", err, rec.Body.String())
	}
	for _, it := range resp.Items {
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, httptest.NewRequest("GET", it.URL, nil))
		if rec.Code != 200 {
			t.Errorf("%s: %d", it.URL, rec.Code)
		}
	}
	// Чужой файл и выход из папки запрещены. / Another ROM's file and path escapes are refused.
	for _, rel := range []string{"media/fanart/Contra (USA).png", "../nes/Battletoads (USA).nes", "Battletoads (USA).nes"} {
		q2 := url.Values{}
		for k, v := range q {
			q2[k] = v
		}
		q2.Set("rel", rel)
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, httptest.NewRequest("GET", "/api/native/fs/game-media/file?"+q2.Encode(), nil))
		if rec.Code == 200 {
			t.Errorf("%s served", rel)
		}
	}

	// Фильтр «Медиа»: виды из ResolveLocalMedia, фон не становится обложкой.
	res := ResolveLocalMedia(root, []ResolveMediaItem{{ID: "1", Title: "Battletoads", OldFile: "Battletoads (USA).nes"}}, "/m?p=")
	if len(res) != 1 {
		t.Fatal(res)
	}
	kinds := map[string]bool{}
	for _, k := range res[0].Kinds {
		kinds[k] = true
	}
	for _, k := range []string{"boxart", "fanart", "map", "support", "tips"} {
		if !kinds[k] {
			t.Errorf("kind %s missing: %v", k, res[0].Kinds)
		}
	}
	if u, _ := url.QueryUnescape(res[0].BoxArtURL); filepath.Base(u) != "Battletoads (USA)-image.png" {
		t.Errorf("cover = %s", res[0].BoxArtURL)
	}
}
