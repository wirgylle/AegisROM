package aegisapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"aegisgui/aegiscore"
)

// ScreenScraper (screenscraper.fr) — запасной источник медиа после Libretro.
// В отличие от Libretro ищет игру по CRC, имени файла и размеру, а не только по названию.
// Ключи в код не зашиты: API требует ключ разработчика (devid/devpassword, выдаётся на форуме
// ScreenScraper) и учётку пользователя. Всё это пользователь вводит сам, хранится в
// <appDir>/screenscraper.json (права 0600) и в браузер не отдаётся.
//
// ScreenScraper is a fallback media source after Libretro. It identifies a game by CRC, file name
// and size, not only by title. No keys are embedded: the API needs developer credentials
// (devid/devpassword, issued on the ScreenScraper forum) and a user account. The user enters them,
// they live in <appDir>/screenscraper.json (0600) and are never sent back to the browser.

// screenScraperAPIBase можно подменить в тестах. / Overridable in tests.
var screenScraperAPIBase = "https://api.screenscraper.fr/api2"

const screenScraperSoftName = "AegisROM"

// Ключ разработчика ScreenScraper, вшитый при сборке (как у EmulationStation на R36S):
// пользователю хватает своего логина и пароля. В git ключа нет, его подставляет CI из секретов:
//
//	go build -ldflags "-X aegisgui/aegisapi.ssBuiltinDevID=... -X aegisgui/aegisapi.ssBuiltinDevPassword=..."
//
// Если ключ не вшит (локальная сборка), его можно ввести вручную в «Дополнительно».
//
// ScreenScraper developer key baked in at build time (as EmulationStation on the R36S does), so the user
// only needs their own login and password. The key is not in git; CI injects it from secrets via -ldflags.
// Without a baked key (local builds) it can be entered by hand under "Advanced".
var (
	ssBuiltinDevID       = ""
	ssBuiltinDevPassword = ""
)

func ssHasBuiltinDevKey() bool { return ssBuiltinDevID != "" && ssBuiltinDevPassword != "" }

// ssSystemIDs: id систем ScreenScraper по имени системы Libretro (как в CONSOLE_CATALOG).
// Список составлен по документации ScreenScraper, на живом API не сверен.
// ssSystemIDs maps Libretro system names to ScreenScraper system ids (from the docs, not
// verified against the live API).
var ssSystemIDs = map[string]int{
	"Sega - Mega Drive - Genesis":                    1,
	"Sega - Master System - Mark III":                2,
	"Nintendo - Nintendo Entertainment System":       3,
	"Nintendo - Super Nintendo Entertainment System": 4,
	"Nintendo - Game Boy":                            9,
	"Nintendo - Game Boy Color":                      10,
	"Nintendo - Game Boy Advance":                    12,
	"Nintendo - GameCube":                            13,
	"Nintendo - Nintendo 64":                         14,
	"Nintendo - Nintendo DS":                         15,
	"Nintendo - Wii":                                 16,
	"Sega - 32X":                                     19,
	"Sega - Mega-CD - Sega CD":                       20,
	"Sega - Game Gear":                               21,
	"Sega - Saturn":                                  22,
	"Sega - Dreamcast":                               23,
	"Atari - 2600":                                   26,
	"Atari - Lynx":                                   28,
	"NEC - PC Engine - TurboGrafx 16":                31,
	"Microsoft - Xbox":                               32,
	"Atari - 7800":                                   41,
	"Sony - PlayStation":                             57,
	"Sony - PlayStation 2":                           58,
	"Sony - PlayStation 3":                           59,
	"Sony - PlayStation Portable":                    61,
	"FBNeo - Arcade Games":                           75,
	"Nintendo - Family Computer Disk System":         106,
	"DOS":                                            135,
}

// ssDiscSystems: для этих систем romtype=iso. / romtype=iso for these systems.
var ssDiscSystems = map[int]bool{13: true, 16: true, 20: true, 22: true, 23: true, 32: true, 57: true, 58: true, 59: true, 61: true}

// Коды причин ScreenScraper сверх общих (aegiscore.Miss*). / ScreenScraper-specific reason codes.
const (
	ssMissAuth  = "ss-auth"  // неверный логин/ключ или API закрыт для гостей / bad credentials or API closed
	ssMissLimit = "ss-limit" // дневной лимит или лимит потоков / daily quota or thread limit
)

type ssCredentials struct {
	DevID       string `json:"devId"`
	DevPassword string `json:"devPassword"`
	User        string `json:"user"`
	Password    string `json:"password"`
	// MaxPerMin — лимит запросов в минуту из ответа ssuserInfos (0 — неизвестен).
	MaxPerMin int `json:"maxPerMin,omitempty"`
}

// devKey: свой ключ пользователя, иначе вшитый. / The user's own key, else the built-in one.
func (c ssCredentials) devKey() (string, string) {
	if c.DevID != "" && c.DevPassword != "" {
		return c.DevID, c.DevPassword
	}
	return ssBuiltinDevID, ssBuiltinDevPassword
}

// configured: нужны логин и пароль; ключ разработчика — только если он не вшит в сборку.
// configured: login and password; a developer key only when none is built in.
func (c ssCredentials) configured() bool {
	id, pw := c.devKey()
	return id != "" && pw != "" && c.User != "" && c.Password != ""
}

func (c ssCredentials) authParams() url.Values {
	v := url.Values{}
	id, pw := c.devKey()
	v.Set("devid", id)
	v.Set("devpassword", pw)
	v.Set("softname", screenScraperSoftName)
	v.Set("ssid", c.User)
	v.Set("sspassword", c.Password)
	v.Set("output", "json")
	return v
}

// ssAuthParamNames убираются из ссылок на медиа, которые уходят в браузер.
// ssAuthParamNames are stripped from media links sent to the browser.
var ssAuthParamNames = []string{"devid", "devpassword", "softname", "ssid", "sspassword"}

type screenScraper struct {
	path   string
	client *http.Client

	mu    sync.Mutex
	creds ssCredentials

	paceMu sync.Mutex
	last   time.Time
}

func newScreenScraper(appDir string) *screenScraper {
	s := &screenScraper{
		path:   filepath.Join(appDir, "screenscraper.json"),
		client: &http.Client{Timeout: 30 * time.Second},
	}
	if raw, err := os.ReadFile(s.path); err == nil {
		_ = json.Unmarshal(raw, &s.creds)
	}
	return s
}

func (s *screenScraper) get() ssCredentials {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.creds
}

func (s *screenScraper) save(c ssCredentials) error {
	raw, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(s.path, raw, 0o600); err != nil {
		return err
	}
	s.mu.Lock()
	s.creds = c
	s.mu.Unlock()
	return nil
}

func (s *screenScraper) clear() {
	_ = os.Remove(s.path)
	s.mu.Lock()
	s.creds = ssCredentials{}
	s.mu.Unlock()
}

// pace держит паузу между запросами: у бесплатной учётки один поток и лимит в минуту.
// pace spaces requests out: a free account has one thread and a per-minute limit.
// ssMinInterval — минимальная пауза между запросами (в тестах 0). / Minimum gap between requests (0 in tests).
var ssMinInterval = 1200 * time.Millisecond

func (s *screenScraper) pace(maxPerMin int) {
	interval := ssMinInterval
	if maxPerMin > 0 {
		if d := time.Minute / time.Duration(maxPerMin); d > interval && ssMinInterval > 0 {
			interval = d
		}
	}
	s.paceMu.Lock()
	defer s.paceMu.Unlock()
	if wait := interval - time.Since(s.last); wait > 0 && !s.last.IsZero() {
		time.Sleep(wait)
	}
	s.last = time.Now()
}

// ssHTTPError переводит коды ответа ScreenScraper в причину.
// ssHTTPError maps ScreenScraper status codes to a reason.
type ssHTTPError struct {
	code int
	body string
}

func (e ssHTTPError) Error() string {
	msg := strings.TrimSpace(e.body)
	if len(msg) > 160 {
		msg = msg[:160]
	}
	if msg == "" {
		return fmt.Sprintf("HTTP %d", e.code)
	}
	return fmt.Sprintf("HTTP %d: %s", e.code, msg)
}

func (e ssHTTPError) reasonCode() string {
	switch e.code {
	case 404:
		return aegiscore.MissNotInDB
	case 401, 403, 423, 426:
		return ssMissAuth
	case 429, 430, 431:
		return ssMissLimit
	}
	return aegiscore.MissNetwork
}

func (e ssHTTPError) fatal() bool {
	c := e.reasonCode()
	return c == ssMissAuth || c == ssMissLimit
}

func (s *screenScraper) call(endpoint string, params url.Values) ([]byte, error) {
	resp, err := s.client.Get(screenScraperAPIBase + "/" + endpoint + "?" + params.Encode())
	if err != nil {
		// В тексте url.Error есть полный адрес с паролем — отдаём только причину.
		// url.Error text contains the full URL with the password; keep only the cause.
		var ue *url.Error
		if errors.As(err, &ue) {
			return nil, ue.Err
		}
		return nil, errors.New("сетевая ошибка")
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, ssHTTPError{code: resp.StatusCode, body: string(body)}
	}
	// На неизвестную игру API иногда отвечает 200 с текстом ошибки вместо JSON.
	// For an unknown game the API sometimes answers 200 with an error text instead of JSON.
	trimmed := strings.TrimSpace(string(body))
	if !strings.HasPrefix(trimmed, "{") {
		if strings.Contains(strings.ToLower(trimmed), "non trouv") {
			return nil, ssHTTPError{code: 404, body: trimmed}
		}
		return nil, ssHTTPError{code: 502, body: trimmed}
	}
	return body, nil
}

type ssUserInfo struct {
	MaxThreads        int `json:"maxThreads"`
	MaxPerMin         int `json:"maxPerMin"`
	RequestsToday     int `json:"requestsToday"`
	MaxRequestsPerDay int `json:"maxRequestsPerDay"`
}

func atoiLoose(v any) int {
	switch t := v.(type) {
	case float64:
		return int(t)
	case string:
		n, _ := strconv.Atoi(strings.TrimSpace(t))
		return n
	}
	return 0
}

func (s *screenScraper) checkUser(c ssCredentials) (ssUserInfo, error) {
	body, err := s.call("ssuserInfos.php", c.authParams())
	if err != nil {
		return ssUserInfo{}, err
	}
	var parsed struct {
		Response struct {
			SSUser map[string]any `json:"ssuser"`
		} `json:"response"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil || parsed.Response.SSUser == nil {
		return ssUserInfo{}, errors.New("неожиданный ответ ScreenScraper")
	}
	u := parsed.Response.SSUser
	return ssUserInfo{
		MaxThreads:        atoiLoose(u["maxthreads"]),
		MaxPerMin:         atoiLoose(u["maxrequestspermin"]),
		RequestsToday:     atoiLoose(u["requeststoday"]),
		MaxRequestsPerDay: atoiLoose(u["maxrequestsperday"]),
	}, nil
}

type ssLookupItem struct {
	ID             string `json:"id"`
	LibretroSystem string `json:"libretroSystem"`
	RomName        string `json:"romName"`
	RomSize        int64  `json:"romSize"`
	CRC            string `json:"crc"`
	Region         string `json:"region"`
}

type ssLookupResult struct {
	ID                    string `json:"id"`
	Matched               bool   `json:"matched"`
	MatchedCanonicalTitle string `json:"matchedCanonicalTitle,omitempty"`
	BoxArtUrl             string `json:"boxArtUrl,omitempty"`
	SnapUrl               string `json:"snapUrl,omitempty"`
	MarqueeUrl            string `json:"marqueeUrl,omitempty"`
	VideoUrl              string `json:"videoUrl,omitempty"`
	TitleSource           string `json:"titleSource,omitempty"`
	Reason                string `json:"reason,omitempty"`
	ReasonCode            string `json:"reasonCode,omitempty"`
}

type ssMedia struct {
	Type   string `json:"type"`
	URL    string `json:"url"`
	Region string `json:"region"`
}

type ssGame struct {
	Noms []struct {
		Region string `json:"region"`
		Text   string `json:"text"`
	} `json:"noms"`
	Medias []ssMedia `json:"medias"`
}

// ssRegionOrder: регионы ScreenScraper в порядке предпочтения для региона рома.
// ssRegionOrder: ScreenScraper regions in preference order for the ROM's region.
func ssRegionOrder(region string) []string {
	r := strings.ToLower(region)
	first := ""
	switch {
	case strings.Contains(r, "usa"), r == "us":
		first = "us"
	case strings.Contains(r, "europe"), strings.Contains(r, "russia"), r == "eu":
		first = "eu"
	case strings.Contains(r, "japan"), r == "jp":
		first = "jp"
	case strings.Contains(r, "world"):
		first = "wor"
	}
	order := []string{}
	if first != "" {
		order = append(order, first)
	}
	for _, x := range []string{"wor", "us", "eu", "ss", "jp", ""} {
		if x != first {
			order = append(order, x)
		}
	}
	return order
}

// pickSSMedia выбирает первый тип из types с лучшим регионом. / Picks the best-region media of the first available type.
func pickSSMedia(medias []ssMedia, types []string, regions []string) string {
	for _, t := range types {
		var ofType []ssMedia
		for _, m := range medias {
			if m.Type == t && m.URL != "" {
				ofType = append(ofType, m)
			}
		}
		if len(ofType) == 0 {
			continue
		}
		for _, reg := range regions {
			for _, m := range ofType {
				if m.Region == reg {
					return m.URL
				}
			}
		}
		return ofType[0].URL
	}
	return ""
}

func pickSSName(g ssGame, regions []string) string {
	for _, reg := range regions {
		for _, n := range g.Noms {
			if n.Region == reg && strings.TrimSpace(n.Text) != "" {
				return strings.TrimSpace(n.Text)
			}
		}
	}
	for _, n := range g.Noms {
		if strings.TrimSpace(n.Text) != "" {
			return strings.TrimSpace(n.Text)
		}
	}
	return ""
}

// proxiedSSMediaURL убирает из ссылки логин и ключи и заворачивает её в наш прокси,
// который подставит их обратно на стороне сервера.
// proxiedSSMediaURL strips credentials and wraps the link in our proxy, which re-adds them server-side.
func proxiedSSMediaURL(raw string) string {
	if raw == "" {
		return ""
	}
	u, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	q := u.Query()
	for _, k := range ssAuthParamNames {
		q.Del(k)
	}
	u.RawQuery = q.Encode()
	return "/api/screenscraper/media?url=" + url.QueryEscape(u.String())
}

func isScreenScraperHost(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" {
		return false
	}
	h := strings.ToLower(u.Hostname())
	return h == "screenscraper.fr" || strings.HasSuffix(h, ".screenscraper.fr")
}

// lookup ищет одну игру. fatal=true — дальше запрашивать бессмысленно (логин, лимит).
// lookup finds one game; fatal=true means further requests are pointless (credentials, quota).
func (s *screenScraper) lookup(c ssCredentials, it ssLookupItem) (res ssLookupResult, fatal bool) {
	res.ID = it.ID
	sysID, ok := ssSystemIDs[it.LibretroSystem]
	if !ok {
		res.ReasonCode = aegiscore.MissNoSystem
		res.Reason = "ScreenScraper: консоль не сопоставлена"
		return res, false
	}
	if strings.TrimSpace(it.RomName) == "" && it.CRC == "" {
		res.ReasonCode = aegiscore.MissNoTitle
		res.Reason = "ScreenScraper: нет имени файла и CRC"
		return res, false
	}
	p := c.authParams()
	p.Set("systemeid", strconv.Itoa(sysID))
	if ssDiscSystems[sysID] {
		p.Set("romtype", "iso")
	} else {
		p.Set("romtype", "rom")
	}
	if it.RomName != "" {
		p.Set("romnom", it.RomName)
	}
	if it.RomSize > 0 {
		p.Set("romtaille", strconv.FormatInt(it.RomSize, 10))
	}
	if crc := strings.TrimSpace(it.CRC); len(crc) == 8 {
		p.Set("crc", strings.ToUpper(crc))
	}

	s.pace(c.MaxPerMin)
	body, err := s.call("jeuInfos.php", p)
	if err != nil {
		var he ssHTTPError
		if errors.As(err, &he) {
			res.ReasonCode = he.reasonCode()
			if res.ReasonCode == aegiscore.MissNotInDB {
				res.Reason = "ScreenScraper: игра не найдена"
			} else {
				res.Reason = "ScreenScraper: " + he.Error()
			}
			return res, he.fatal()
		}
		res.ReasonCode = aegiscore.MissNetwork
		res.Reason = "ScreenScraper недоступен: " + err.Error()
		return res, false
	}
	var parsed struct {
		Response struct {
			Jeu ssGame `json:"jeu"`
		} `json:"response"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		res.ReasonCode = aegiscore.MissNetwork
		res.Reason = "ScreenScraper: не удалось разобрать ответ"
		return res, false
	}
	g := parsed.Response.Jeu
	regions := ssRegionOrder(it.Region)
	res.MatchedCanonicalTitle = pickSSName(g, regions)
	res.BoxArtUrl = proxiedSSMediaURL(pickSSMedia(g.Medias, []string{"box-2D", "box-2D-side", "mixrbv1"}, regions))
	res.SnapUrl = proxiedSSMediaURL(pickSSMedia(g.Medias, []string{"ss", "sstitle"}, regions))
	res.MarqueeUrl = proxiedSSMediaURL(pickSSMedia(g.Medias, []string{"wheel", "wheel-hd", "screenmarquee"}, regions))
	res.VideoUrl = proxiedSSMediaURL(pickSSMedia(g.Medias, []string{"video-normalized", "video"}, regions))
	if res.MatchedCanonicalTitle == "" || (res.BoxArtUrl == "" && res.SnapUrl == "") {
		res.ReasonCode = aegiscore.MissNotInDB
		res.Reason = "ScreenScraper: игра есть, но без обложки и скриншота"
		res.MatchedCanonicalTitle = ""
		return res, false
	}
	res.Matched = true
	res.TitleSource = "screenscraper"
	return res, false
}

func registerScreenScraperRoutes(mux *http.ServeMux, appDir string, touch func()) {
	ss := newScreenScraper(appDir)
	writeJSON := func(w http.ResponseWriter, v any) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		_ = json.NewEncoder(w).Encode(v)
	}

	// GET — настроен ли (без паролей); POST — проверить и сохранить; DELETE — забыть.
	// GET: is it configured (no secrets); POST: verify and save; DELETE: forget.
	mux.HandleFunc("/api/screenscraper/config", func(w http.ResponseWriter, r *http.Request) {
		touch()
		switch r.Method {
		case http.MethodGet:
			c := ss.get()
			writeJSON(w, map[string]any{
				"configured": c.configured(), "user": c.User, "hasDevKey": c.DevID != "",
				// builtinDevKey=true — форме нужны только логин и пароль. / The form needs login and password only.
				"builtinDevKey": ssHasBuiltinDevKey(),
			})
		case http.MethodDelete:
			ss.clear()
			writeJSON(w, map[string]any{"ok": true, "configured": false})
		case http.MethodPost:
			var in ssCredentials
			if err := json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&in); err != nil {
				writeJSON(w, map[string]any{"ok": false, "error": "bad json"})
				return
			}
			old := ss.get()
			in.DevID, in.User = strings.TrimSpace(in.DevID), strings.TrimSpace(in.User)
			// Пустой пароль/ключ в форме — оставить сохранённый. / Empty secret in the form keeps the stored one.
			if in.DevPassword == "" {
				in.DevPassword = old.DevPassword
			}
			if in.Password == "" && in.User == old.User {
				in.Password = old.Password
			}
			if in.DevID == "" {
				in.DevID = old.DevID
			}
			if in.User == "" || in.Password == "" {
				writeJSON(w, map[string]any{"ok": false, "error": "нужны логин и пароль ScreenScraper / ScreenScraper login and password are required"})
				return
			}
			if !in.configured() {
				writeJSON(w, map[string]any{"ok": false, "error": "в этой сборке нет ключа разработчика: укажите devid и devpassword в «Дополнительно» / this build has no developer key: enter devid and devpassword under Advanced"})
				return
			}
			info, err := ss.checkUser(in)
			if err != nil {
				writeJSON(w, map[string]any{"ok": false, "error": err.Error()})
				return
			}
			in.MaxPerMin = info.MaxPerMin
			if err := ss.save(in); err != nil {
				writeJSON(w, map[string]any{"ok": false, "error": err.Error()})
				return
			}
			writeJSON(w, map[string]any{"ok": true, "configured": true, "user": in.User, "info": info})
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// GET — остаток запросов на сегодня из ssuserInfos (один запрос к ScreenScraper). Нужен окну
	// выбора источника: при исчерпанном лимите источник пропускается, а не падает на каждом роме.
	// GET: today's remaining requests from ssuserInfos (one ScreenScraper request). Used by the
	// source picker: with the quota used up the source is skipped instead of failing on every ROM.
	mux.HandleFunc("/api/screenscraper/quota", func(w http.ResponseWriter, r *http.Request) {
		touch()
		c := ss.get()
		if !c.configured() {
			writeJSON(w, map[string]any{"ok": false, "configured": false})
			return
		}
		info, err := ss.checkUser(c)
		if err != nil {
			code := aegiscore.MissNetwork
			var he ssHTTPError
			if errors.As(err, &he) {
				code = he.reasonCode()
			}
			writeJSON(w, map[string]any{"ok": false, "configured": true, "reasonCode": code, "error": err.Error()})
			return
		}
		writeJSON(w, map[string]any{"ok": true, "configured": true, "user": c.User, "info": info})
	})

	// POST {items:[…]} — поиск по одной игре за раз, с паузами. Клиент шлёт небольшие пачки,
	// чтобы показывать прогресс и уметь остановиться.
	// POST {items:[…]}: one game at a time with pauses. The client sends small batches to show
	// progress and to be able to stop.
	mux.HandleFunc("/api/screenscraper/lookup", func(w http.ResponseWriter, r *http.Request) {
		touch()
		var req struct {
			Items []ssLookupItem `json:"items"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 4<<20)).Decode(&req); err != nil {
			writeJSON(w, map[string]any{"results": []any{}, "error": "bad json"})
			return
		}
		c := ss.get()
		if !c.configured() {
			writeJSON(w, map[string]any{"results": []any{}, "stop": ssMissAuth, "error": "ScreenScraper не настроен"})
			return
		}
		results := make([]ssLookupResult, 0, len(req.Items))
		stop := ""
		for _, it := range req.Items {
			if r.Context().Err() != nil {
				break
			}
			res, fatal := ss.lookup(c, it)
			results = append(results, res)
			if fatal {
				stop = res.ReasonCode
				break
			}
		}
		writeJSON(w, map[string]any{"results": results, "stop": stop})
	})

	// Медиа ScreenScraper: ссылка без ключей, ключи подставляем здесь. Только хосты screenscraper.fr.
	// ScreenScraper media: the link has no keys, we add them here. screenscraper.fr hosts only.
	mux.HandleFunc("/api/screenscraper/media", func(w http.ResponseWriter, r *http.Request) {
		touch()
		target := r.URL.Query().Get("url")
		if !isScreenScraperHost(target) {
			http.Error(w, "invalid url", http.StatusBadRequest)
			return
		}
		u, _ := url.Parse(target)
		q := u.Query()
		for k, vs := range ss.get().authParams() {
			if k == "output" {
				continue
			}
			q[k] = vs
		}
		u.RawQuery = q.Encode()
		client := &http.Client{Timeout: 60 * time.Second}
		resp, err := client.Get(u.String())
		if err != nil {
			http.Error(w, "screenscraper unavailable", http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()
		if ct := resp.Header.Get("Content-Type"); ct != "" {
			w.Header().Set("Content-Type", ct)
		}
		w.WriteHeader(resp.StatusCode)
		_, _ = io.Copy(w, resp.Body)
	})
}
