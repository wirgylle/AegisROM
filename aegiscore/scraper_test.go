package aegiscore

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
)

func withLibretroServer(t *testing.T, names []string, status int) *int32 {
	t.Helper()
	var hits int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&hits, 1)
		if status != 200 {
			w.WriteHeader(status)
			return
		}
		var b strings.Builder
		for _, n := range names {
			b.WriteString(`<a href="` + url.PathEscape(n+".png") + `">x</a>`)
		}
		_, _ = w.Write([]byte(b.String()))
	}))
	oldBase := libretroThumbnailsBase
	libretroThumbnailsBase = srv.URL
	cacheMu.Lock()
	libretroIndexCache = make(map[string][]libretroEntry)
	libretroIndexFailures = make(map[string]indexFailure)
	cacheMu.Unlock()
	t.Cleanup(func() {
		srv.Close()
		libretroThumbnailsBase = oldBase
	})
	return &hits
}

func TestMatchLibretroTitle(t *testing.T) {
	withLibretroServer(t, []string{
		"Super Mario World (USA)",
		"Super Mario Kart (USA)",
		"Contra (USA)",
		"Contra (Japan)",
		"Legend of Zelda, The - A Link to the Past (USA)",
	}, 200)
	sys := "Nintendo - Super Nintendo Entertainment System"

	cases := []struct {
		title, region, wantFile, wantSource string
	}{
		{"Super Mario World", "USA", "Super Mario World (USA)", TitleSourceLibretroExact},
		{"Contra", "Japan", "Contra (Japan)", TitleSourceLibretroExact},
		{"Zelda Link to the Past", "USA", "Legend of Zelda, The - A Link to the Past (USA)", TitleSourceLibretroFuzzy},
	}
	for _, c := range cases {
		m := MatchLibretroTitle(sys, c.title, BuildComparisonKey(c.title), c.region)
		if m.FileName != c.wantFile || m.Source != c.wantSource || m.Reason != "" {
			t.Errorf("%q: got %+v", c.title, m)
		}
	}

	// Раньше World вырезался и «Super Mario World» превращался в «Super Mario».
	m := MatchLibretroTitle(sys, "Super Mario World", BuildComparisonKey("Super Mario World"), "USA")
	if got := ExtractCleanTitle(m.FileName); got != "Super Mario World" {
		t.Errorf("canonical title = %q", got)
	}

	nf := MatchLibretroTitle(sys, "Totally Unknown Game", BuildComparisonKey("Totally Unknown Game"), "USA")
	if nf.FileName != "" || nf.Reason == "" {
		t.Errorf("not found: %+v", nf)
	}
	if num := MatchLibretroTitle(sys, "000001", "000001", "USA"); num.FileName != "" || !strings.Contains(num.Reason, "номер") {
		t.Errorf("numbered: %+v", num)
	}
	if none := MatchLibretroTitle("", "Contra", "contra", "USA"); none.Reason == "" {
		t.Errorf("no system: %+v", none)
	}
}

func TestLibretroIndexFailureIsCached(t *testing.T) {
	hits := withLibretroServer(t, nil, http.StatusBadGateway)
	sys := "Sega - Mega Drive - Genesis"
	for i := 0; i < 5; i++ {
		m := MatchLibretroTitle(sys, "Sonic", "sonic", "USA")
		if m.FileName != "" || !strings.Contains(m.Reason, "недоступен") {
			t.Fatalf("got %+v", m)
		}
	}
	if n := atomic.LoadInt32(hits); n != 1 {
		t.Errorf("индекс запрошен %d раз, ожидался 1 (ошибка должна кэшироваться)", n)
	}
	// Старый API: при недоступном индексе возвращает "<название> (<регион>)".
	if got := FindBestLibretroMatch(sys, "Sonic", "sonic", "USA"); got != "Sonic (USA)" {
		t.Errorf("FindBestLibretroMatch = %q", got)
	}
}
