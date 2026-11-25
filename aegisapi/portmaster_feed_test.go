package aegisapi

import (
	"os"
	"strings"
	"testing"
)

// Реальные записи из PortMaster-Info/ports.json (ноябрь 2026): avail — массив
// строк "устройство:ALL". / Real entries: avail is an array of "device:ALL".
func TestParsePortMasterFeed_RealSample(t *testing.T) {
	f, err := os.Open("testdata/portmaster_ports_sample.json")
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	games, skipped, err := parsePortMasterFeed(f)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if skipped != 0 || len(games) != 2 {
		t.Fatalf("games=%d skipped=%d, want 2/0", len(games), skipped)
	}
	g := games[0]
	if g.ID != "2048.zip" || g.Slug != "2048" || g.Title == "" || g.DownloadUrl == "" || g.SizeBytes <= 0 {
		t.Fatalf("bad entry: %+v", g)
	}
	hasR36S := false
	for _, d := range g.AvailDevices {
		if strings.Contains(d, ":") {
			t.Fatalf("device id not trimmed: %q", d)
		}
		if d == "r36s" {
			hasR36S = true
		}
	}
	if !hasR36S {
		t.Fatalf("r36s missing in %v", g.AvailDevices)
	}
	if !strings.HasSuffix(g.CoverUrl, ".png") && !strings.HasSuffix(g.CoverUrl, ".jpg") {
		t.Fatalf("cover url: %q", g.CoverUrl)
	}
}

// Старая форма (avail — объект) и смена типов других полей не должны ронять
// каталог; непригодная запись пропускается. / Old object form and type drift.
func TestParsePortMasterFeed_ShapeDrift(t *testing.T) {
	feed := `{"ports":{
	  "old.zip":{"name":"old.zip","items":"Old/","attr":{"title":"Old","rtr":"true","runtime":"mono-6.12.0.122.squashfs",
	     "genres":"puzzle","porter":"someone","reqs":null,"avail":{"r36s":{},"rg353m":{}},
	     "image":{"covers":"cover.png","screenshot":"shot.png"}},
	     "source":{"url":"https://github.com/PortsMaster/x/old.zip","size":"1234","md5":"abc"}},
	  "new.zip":{"name":"new.zip","items":["New/"],"attr":{"title":"New","rtr":false,"runtime":["a","b"],
	     "avail":["r36s:ALL","r36s:ArkOS","x55:ALL"],"image":{"covers":[],"screenshot":"s.jpg"}},
	     "source":{"url":"u","size":5}},
	  "broken.zip":"not an object"
	}}`
	games, skipped, err := parsePortMasterFeed(strings.NewReader(feed))
	if err != nil {
		t.Fatal(err)
	}
	if len(games) != 2 || skipped != 1 {
		t.Fatalf("games=%d skipped=%d, want 2/1", len(games), skipped)
	}
	byID := map[string]pmItem{}
	for _, g := range games {
		byID[g.ID] = g
	}
	old := byID["old.zip"]
	if strings.Join(old.AvailDevices, ",") != "r36s,rg353m" || !old.ReadyToRun || old.SizeBytes != 1234 ||
		len(old.Runtime) != 1 || len(old.Genres) != 1 || old.Requirements == nil || !strings.HasSuffix(old.CoverUrl, "/cover.png") {
		t.Fatalf("old form: %+v", old)
	}
	nw := byID["new.zip"]
	if strings.Join(nw.AvailDevices, ",") != "r36s,x55" || len(nw.Runtime) != 2 || !strings.HasSuffix(nw.CoverUrl, "/s.jpg") {
		t.Fatalf("new form: %+v", nw)
	}
}

// Полный живой каталог: AEGIS_PM_FEED=/путь/ports.json go test -run FullFeed ./aegisapi
func TestParsePortMasterFeed_FullFeed(t *testing.T) {
	path := os.Getenv("AEGIS_PM_FEED")
	if path == "" {
		t.Skip("AEGIS_PM_FEED not set")
	}
	f, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	games, skipped, err := parsePortMasterFeed(f)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("games=%d skipped=%d", len(games), skipped)
	if skipped != 0 || len(games) < 100 {
		t.Fatalf("games=%d skipped=%d", len(games), skipped)
	}
}
