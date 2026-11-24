package aegiscore

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

type fakeTreeEntry struct {
	Path string `json:"path"`
	Mode string `json:"mode"`
	Type string `json:"type"`
	SHA  string `json:"sha"`
}

// withGitHubServer поднимает фейковый GitHub API. truncated=true — рекурсивное дерево обрезано,
// и клиент должен дочитать папки по одной.
func withGitHubServer(t *testing.T, files map[string]string, truncated bool, status int) *int32 {
	t.Helper()
	var hits int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&hits, 1)
		if status != 200 {
			w.WriteHeader(status)
			return
		}
		path := r.URL.Path
		var out struct {
			Tree      []fakeTreeEntry `json:"tree"`
			Truncated bool            `json:"truncated"`
		}
		switch {
		case strings.HasSuffix(path, "/git/trees/HEAD") && r.URL.Query().Get("recursive") == "1":
			out.Truncated = truncated
			if !truncated {
				for p, mode := range files {
					out.Tree = append(out.Tree, fakeTreeEntry{Path: p, Mode: mode, Type: "blob"})
				}
			}
		case strings.HasSuffix(path, "/git/trees/HEAD"):
			dirs := map[string]bool{}
			for p := range files {
				if i := strings.IndexByte(p, '/'); i > 0 {
					dirs[p[:i]] = true
				}
			}
			for d := range dirs {
				out.Tree = append(out.Tree, fakeTreeEntry{Path: d, Type: "tree", SHA: "sha-" + d})
			}
		default:
			dir := strings.TrimPrefix(path[strings.LastIndex(path, "/")+1:], "sha-")
			for p, mode := range files {
				if strings.HasPrefix(p, dir+"/") {
					out.Tree = append(out.Tree, fakeTreeEntry{Path: strings.TrimPrefix(p, dir+"/"), Mode: mode, Type: "blob"})
				}
			}
		}
		_ = json.NewEncoder(w).Encode(out)
	}))
	// Старый сервер в этих тестах всегда недоступен. / The old server is always down here.
	old := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusBadGateway) }))
	oBase, oGH, oRaw, oDelay := libretroThumbnailsBase, libretroGitHubAPIBase, libretroRawBase, libretroIndexRetryDelay
	libretroThumbnailsBase, libretroGitHubAPIBase, libretroRawBase, libretroIndexRetryDelay = old.URL, srv.URL, "https://raw.example", 0
	cacheMu.Lock()
	libretroIndexCache = make(map[string][]libretroEntry)
	libretroIndexInfo = make(map[string]*libretroIndexData)
	libretroIndexFailures = make(map[string]indexFailure)
	libretroDiskCacheDir = ""
	cacheMu.Unlock()
	t.Cleanup(func() {
		srv.Close()
		old.Close()
		libretroThumbnailsBase, libretroGitHubAPIBase, libretroRawBase, libretroIndexRetryDelay = oBase, oGH, oRaw, oDelay
		SetLibretroIndexCacheDir("")
	})
	return &hits
}

var nesFiles = map[string]string{
	"Named_Boxarts/1942 (Japan, USA).png":                  "100644",
	"Named_Snaps/1942 (Japan, USA).png":                    "100644",
	"Named_Boxarts/Contra (USA).png":                       "100644",
	"Named_Titles/Contra (USA).png":                        "100644",
	"Named_Boxarts/E.T. - The Extra-Terrestrial (USA).png": "100644",
	"Named_Boxarts/Linked Game (USA).png":                  "120000",
	"README.md":                                            "100644",
}

const nesSys = "Nintendo - Nintendo Entertainment System"

func TestGitHubIndexAndExistingTypesOnly(t *testing.T) {
	for _, truncated := range []bool{false, true} {
		withGitHubServer(t, nesFiles, truncated, 200)
		m := MatchLibretroRom(nesSys, "", "Contra", "contra", "USA")
		if m.FileName != "Contra (USA)" {
			t.Fatalf("truncated=%v: %+v", truncated, m)
		}
		media := LibretroMediaURLs(nesSys, m.FileName)
		wantBox := "https://raw.example/libretro-thumbnails/Nintendo_-_Nintendo_Entertainment_System/HEAD/Named_Boxarts/Contra%20%28USA%29.png"
		if media.BoxArt != wantBox {
			t.Errorf("boxart %q", media.BoxArt)
		}
		// Скриншота у Contra нет — ссылки нет (раньше был заведомый 404). / No snap → no URL.
		if media.Snap != "" || media.Title == "" || media.Logo != "" {
			t.Errorf("types: %+v", media)
		}
	}
}

func TestNumberTitleAndFileNameMatch(t *testing.T) {
	withGitHubServer(t, nesFiles, false, 200)
	// Имя файла как в No-Intro — точное совпадение. / No-Intro file name → exact.
	if m := MatchLibretroRom(nesSys, "1942 (Japan, USA)", "1942", "1942", "USA"); m.FileName != "1942 (Japan, USA)" {
		t.Errorf("file stem: %+v", m)
	}
	// Название «1942» без имени файла тоже находится (раньше — «нет названия»).
	if m := MatchLibretroRom(nesSys, "", "1942", BuildComparisonKey("1942"), "USA"); m.FileName != "1942 (Japan, USA)" {
		t.Errorf("number title: %+v", m)
	}
	// «000123» — по-прежнему номер. / Still a number.
	if m := MatchLibretroRom(nesSys, "", "000123", "000123", "USA"); m.ReasonCode != MissNoTitle {
		t.Errorf("000123: %+v", m)
	}
	// Символы, которые Libretro заменяет на «_». / Characters Libretro replaces.
	if got := SanitizeThumbName(`Tom & Jerry: "x"?`); got != `Tom _ Jerry_ _x__` {
		t.Errorf("sanitize %q", got)
	}
	// Симлинк — со старого сервера, raw.githubusercontent отдал бы текст ссылки.
	if u := LibretroMediaURLs(nesSys, "Linked Game (USA)").BoxArt; !strings.HasPrefix(u, libretroThumbnailsBase) {
		t.Errorf("symlink url %q", u)
	}
}

func TestGitHubIndexDiskCache(t *testing.T) {
	hits := withGitHubServer(t, nesFiles, false, 200)
	SetLibretroIndexCacheDir(t.TempDir())
	if m := MatchLibretroRom(nesSys, "", "Contra", "contra", "USA"); m.FileName == "" {
		t.Fatalf("%+v", m)
	}
	first := atomic.LoadInt32(hits)
	cacheMu.Lock()
	libretroIndexCache = make(map[string][]libretroEntry)
	libretroIndexInfo = make(map[string]*libretroIndexData)
	cacheMu.Unlock()
	if m := MatchLibretroRom(nesSys, "", "Contra", "contra", "USA"); m.FileName == "" {
		t.Fatalf("from disk: %+v", m)
	}
	if atomic.LoadInt32(hits) != first {
		t.Errorf("второй запуск должен читать список с диска / second run must use the disk cache")
	}
	if u := LibretroMediaURLs(nesSys, "Contra (USA)").Snap; u != "" {
		t.Errorf("types must survive the disk cache: snap %q", u)
	}
}

func TestGitHubMissingRepoIsNoSystem(t *testing.T) {
	withGitHubServer(t, nil, false, http.StatusNotFound)
	if m := MatchLibretroRom("Nintendo - Switch", "", "Zelda", "zelda", "USA"); m.ReasonCode != MissNoSystem {
		t.Errorf("%+v", m)
	}
}

func TestGitHubRateLimitFallsBackToNetworkReason(t *testing.T) {
	withGitHubServer(t, nil, false, http.StatusForbidden)
	if m := MatchLibretroRom(nesSys, "", "Contra", "contra", "USA"); m.ReasonCode != MissNetwork {
		t.Errorf("%+v", m)
	}
}
