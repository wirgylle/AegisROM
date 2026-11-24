package aegisapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

// fakeScreenScraper отвечает как API ScreenScraper (по документации; живой API не проверен).
func fakeScreenScraper(t *testing.T) *[]url.Values {
	t.Helper()
	var calls []url.Values
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		calls = append(calls, q)
		if q.Get("sspassword") != "secret" {
			w.WriteHeader(403)
			_, _ = w.Write([]byte("Erreur de login"))
			return
		}
		switch {
		case strings.HasSuffix(r.URL.Path, "/ssuserInfos.php"):
			_, _ = w.Write([]byte(`{"response":{"ssuser":{"id":"val","maxthreads":"1","maxrequestspermin":"600","requeststoday":"5","maxrequestsperday":"20000"}}}`))
		case strings.HasSuffix(r.URL.Path, "/jeuInfos.php"):
			switch q.Get("romnom") {
			case "001.nes":
				_, _ = w.Write([]byte(`{"response":{"jeu":{"noms":[{"region":"jp","text":"Rockman"},{"region":"us","text":"Mega Man"}],
				"medias":[{"type":"box-2D","region":"jp","url":"https://neoclone.screenscraper.fr/api2/mediaJeu.php?devid=d&devpassword=dp&ssid=val&sspassword=secret&media=box-2D(jp)"},
				{"type":"box-2D","region":"us","url":"https://neoclone.screenscraper.fr/api2/mediaJeu.php?devid=d&devpassword=dp&ssid=val&sspassword=secret&media=box-2D(us)"},
				{"type":"ss","region":"wor","url":"https://neoclone.screenscraper.fr/api2/mediaJeu.php?media=ss(wor)"}]}}}`))
			case "quota.nes":
				w.WriteHeader(430)
				_, _ = w.Write([]byte("quota"))
			default:
				w.WriteHeader(404)
				_, _ = w.Write([]byte("Erreur : Rom/Iso/Dossier non trouvée !"))
			}
		}
	}))
	old, oldGap := screenScraperAPIBase, ssMinInterval
	screenScraperAPIBase, ssMinInterval = srv.URL, 0
	t.Cleanup(func() { srv.Close(); screenScraperAPIBase, ssMinInterval = old, oldGap })
	return &calls
}

func ssPost(t *testing.T, mux *http.ServeMux, path, body string) map[string]any {
	t.Helper()
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, path, strings.NewReader(body)))
	var out map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("%s: %v (%s)", path, err, rec.Body.String())
	}
	return out
}

func TestScreenScraperConfigAndLookup(t *testing.T) {
	calls := fakeScreenScraper(t)
	dir := t.TempDir()
	mux := http.NewServeMux()
	registerScreenScraperRoutes(mux, dir, func() {})

	// Без настройки поиск сразу просит логин. / Lookup without config asks for credentials.
	if out := ssPost(t, mux, "/api/screenscraper/lookup", `{"items":[{"id":"a"}]}`); out["stop"] != ssMissAuth {
		t.Fatalf("unconfigured: %v", out)
	}
	if out := ssPost(t, mux, "/api/screenscraper/config", `{"devId":"d","devPassword":"dp","user":"val","password":"wrong"}`); out["ok"] != false {
		t.Fatalf("wrong password saved: %v", out)
	}
	out := ssPost(t, mux, "/api/screenscraper/config", `{"devId":"d","devPassword":"dp","user":"val","password":"secret"}`)
	if out["ok"] != true {
		t.Fatalf("config: %v", out)
	}
	// GET не отдаёт пароли. / GET never returns secrets.
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/screenscraper/config", nil))
	if strings.Contains(rec.Body.String(), "secret") || strings.Contains(rec.Body.String(), `"dp"`) {
		t.Fatalf("GET leaks secrets: %s", rec.Body.String())
	}

	out = ssPost(t, mux, "/api/screenscraper/lookup", `{"items":[
		{"id":"a","libretroSystem":"Nintendo - Nintendo Entertainment System","romName":"001.nes","romSize":40976,"crc":"1234abcd","region":"USA"},
		{"id":"b","libretroSystem":"Nintendo - Nintendo Entertainment System","romName":"zzz.nes"},
		{"id":"c","libretroSystem":"Nintendo - Switch","romName":"x.nsp"},
		{"id":"d","libretroSystem":"Nintendo - Nintendo Entertainment System","romName":"quota.nes"},
		{"id":"e","libretroSystem":"Nintendo - Nintendo Entertainment System","romName":"never.nes"}]}`)
	res := out["results"].([]any)
	if out["stop"] != ssMissLimit || len(res) != 4 {
		t.Fatalf("stop on quota: stop=%v n=%d", out["stop"], len(res))
	}
	a := res[0].(map[string]any)
	if a["matched"] != true || a["matchedCanonicalTitle"] != "Mega Man" || a["titleSource"] != "screenscraper" {
		t.Errorf("a: %v", a)
	}
	box := a["boxArtUrl"].(string)
	inner, _ := url.QueryUnescape(strings.TrimPrefix(box, "/api/screenscraper/media?url="))
	if !strings.HasPrefix(box, "/api/screenscraper/media?url=") || !strings.Contains(inner, "box-2D%28us%29") {
		t.Errorf("box url: %s", box)
	}
	if strings.Contains(box, "secret") || strings.Contains(box, "dp") {
		t.Errorf("box url leaks credentials: %s", box)
	}
	if code := res[1].(map[string]any)["reasonCode"]; code != "not-in-db" {
		t.Errorf("b: %v", res[1])
	}
	if code := res[2].(map[string]any)["reasonCode"]; code != "no-system" {
		t.Errorf("c: %v", res[2])
	}
	// CRC и тип рома ушли в запрос. / CRC and rom type were sent.
	var first url.Values
	for _, q := range *calls {
		if q.Get("romnom") == "001.nes" {
			first = q
		}
	}
	if first.Get("crc") != "1234ABCD" || first.Get("systemeid") != "3" || first.Get("romtype") != "rom" || first.Get("romtaille") != "40976" {
		t.Errorf("query: %v", first)
	}
}

func TestScreenScraperMediaProxyOnlyItsHosts(t *testing.T) {
	mux := http.NewServeMux()
	registerScreenScraperRoutes(mux, t.TempDir(), func() {})
	for _, bad := range []string{"https://evil.example/x.png", "http://neoclone.screenscraper.fr/x", "https://screenscraper.fr.evil.com/x"} {
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/screenscraper/media?url="+url.QueryEscape(bad), nil))
		if rec.Code != http.StatusBadRequest {
			t.Errorf("%s: code %d", bad, rec.Code)
		}
	}
}

// Ключ вшит в сборку — хватает логина и пароля, как на R36S.
// A built-in key: login and password are enough, as on the R36S.
func TestScreenScraperLoginOnlyWithBuiltinKey(t *testing.T) {
	calls := fakeScreenScraper(t)
	mux := http.NewServeMux()
	registerScreenScraperRoutes(mux, t.TempDir(), func() {})

	// Без вшитого ключа одних логина и пароля мало. / Without a built-in key, login alone is not enough.
	if out := ssPost(t, mux, "/api/screenscraper/config", `{"user":"val","password":"secret"}`); out["ok"] != false {
		t.Fatalf("saved without a dev key: %v", out)
	}

	oldID, oldPw := ssBuiltinDevID, ssBuiltinDevPassword
	ssBuiltinDevID, ssBuiltinDevPassword = "bid", "bpw"
	t.Cleanup(func() { ssBuiltinDevID, ssBuiltinDevPassword = oldID, oldPw })

	if out := ssPost(t, mux, "/api/screenscraper/config", `{"user":"val","password":"secret"}`); out["ok"] != true {
		t.Fatalf("login only: %v", out)
	}
	last := (*calls)[len(*calls)-1]
	if last.Get("devid") != "bid" || last.Get("devpassword") != "bpw" || last.Get("ssid") != "val" {
		t.Errorf("query: %v", last)
	}
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/screenscraper/config", nil))
	if !strings.Contains(rec.Body.String(), `"builtinDevKey":true`) || strings.Contains(rec.Body.String(), "bpw") {
		t.Errorf("GET: %s", rec.Body.String())
	}
}

// Остаток запросов для окна выбора источника. / Remaining requests for the source picker.
func TestScreenScraperQuota(t *testing.T) {
	fakeScreenScraper(t)
	mux := http.NewServeMux()
	registerScreenScraperRoutes(mux, t.TempDir(), func() {})
	get := func() map[string]any {
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/screenscraper/quota", nil))
		var out map[string]any
		_ = json.Unmarshal(rec.Body.Bytes(), &out)
		return out
	}
	if out := get(); out["configured"] != false {
		t.Fatalf("unconfigured: %v", out)
	}
	if out := ssPost(t, mux, "/api/screenscraper/config", `{"devId":"d","devPassword":"dp","user":"val","password":"secret"}`); out["ok"] != true {
		t.Fatalf("config: %v", out)
	}
	out := get()
	info, _ := out["info"].(map[string]any)
	if out["ok"] != true || info["requestsToday"] != float64(5) || info["maxRequestsPerDay"] != float64(20000) {
		t.Fatalf("quota: %v", out)
	}
	if strings.Contains(fmt.Sprint(out), "secret") {
		t.Fatalf("quota leaks password: %v", out)
	}
}
