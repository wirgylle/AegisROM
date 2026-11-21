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
	oldBase, oldDelay := libretroThumbnailsBase, libretroIndexRetryDelay
	libretroThumbnailsBase, libretroIndexRetryDelay = srv.URL, 0
	cacheMu.Lock()
	libretroIndexCache = make(map[string][]libretroEntry)
	libretroIndexFailures = make(map[string]indexFailure)
	cacheMu.Unlock()
	t.Cleanup(func() {
		srv.Close()
		libretroThumbnailsBase, libretroIndexRetryDelay = oldBase, oldDelay
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
	// Один повтор на 5xx, дальше ошибка кэшируется. / One retry on 5xx, then the error is cached.
	if n := atomic.LoadInt32(hits); n != 2 {
		t.Errorf("индекс запрошен %d раз, ожидалось 2 (повтор, затем кэш ошибки)", n)
	}
	if m := MatchLibretroTitle(sys, "Sonic", "sonic", "USA"); m.ReasonCode != MissNetwork {
		t.Errorf("5xx: code %q, want %q", m.ReasonCode, MissNetwork)
	}
	// Старый API: при недоступном индексе возвращает "<название> (<регион>)".
	if got := FindBestLibretroMatch(sys, "Sonic", "sonic", "USA"); got != "Sonic (USA)" {
		t.Errorf("FindBestLibretroMatch = %q", got)
	}
}

func TestMissReasonCodes(t *testing.T) {
	withLibretroServer(t, []string{"Contra (USA)"}, 200)
	sys := "Nintendo - Nintendo Entertainment System"
	cases := []struct{ title, want string }{
		{"Totally Unknown Game", MissNotInDB},
		{"Contra Force Extreme Edition Deluxe", MissNotInDB},
		{"000123", MissNoTitle},
		{"Contra", ""},
	}
	for _, c := range cases {
		if got := MatchLibretroTitle(sys, c.title, BuildComparisonKey(c.title), "USA").ReasonCode; got != c.want {
			t.Errorf("%q: code %q, want %q", c.title, got, c.want)
		}
	}
	if got := MatchLibretroTitle("", "Contra", "contra", "USA").ReasonCode; got != MissNoSystem {
		t.Errorf("empty system: %q", got)
	}
}

func TestMissingLibretroFolderIsNoSystem(t *testing.T) {
	hits := withLibretroServer(t, nil, http.StatusNotFound)
	m := MatchLibretroTitle("Nintendo - Switch", "Zelda", "zelda", "USA")
	if m.ReasonCode != MissNoSystem {
		t.Errorf("404: code %q, want %q", m.ReasonCode, MissNoSystem)
	}
	if n := atomic.LoadInt32(hits); n != 1 {
		t.Errorf("404 не повторяется, запросов %d", n)
	}
}

// Не найдено — никаких догадок «<название> (USA).png»: пустые ссылки не затрут рабочую обложку.
// Not found — no guessed "<title> (USA).png": empty URLs never replace a working cover.
func TestLibretroThumbnailURLs(t *testing.T) {
	if b, s, m := LibretroThumbnailURLs("Sony - PlayStation", ""); b != "" || s != "" || m != "" {
		t.Errorf("empty name must give empty URLs: %q %q %q", b, s, m)
	}
	if b, _, _ := LibretroThumbnailURLs("", "Contra (USA)"); b != "" {
		t.Errorf("empty system must give empty URL: %q", b)
	}
	b, s, m := LibretroThumbnailURLs("Nintendo - Nintendo Entertainment System", "Contra (USA)")
	want := libretroThumbnailsBase + "/Nintendo%20-%20Nintendo%20Entertainment%20System/Named_Boxarts/Contra%20%28USA%29.png"
	if b != want {
		t.Errorf("boxart = %q, want %q", b, want)
	}
	if !strings.Contains(s, "/Named_Snaps/") || !strings.Contains(m, "/Named_Titles/") {
		t.Errorf("snap/title = %q %q", s, m)
	}
}
