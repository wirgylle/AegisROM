package aegisapi

// Каталоги и скачивание тем для «Починки флешки». Окно не может само качать с GitHub
// (CORS у архивов репозиториев), поэтому Go отдаёт только два фиксированных каталога
// и архивы по строгому списку адресов. Распаковка идёт в окне, в папку тем на карте.
//
// Theme catalogs and downloads for the card repair tool. The window cannot fetch GitHub
// repository archives itself (CORS), so Go serves only two fixed catalogs and archives
// from a strict list of addresses. Unpacking happens in the window, into the card's
// themes folder.

import (
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
)

// Каталоги тем: тот же список, что читает ThemeMaster на ArkOS/dArkOS, и официальный
// репозиторий тем Onion. / Theme catalogs: the list ThemeMaster reads on ArkOS/dArkOS,
// and the official Onion theme repository.
var themeCatalogURLs = map[string]string{
	"oga":   "https://raw.githubusercontent.com/Jetup13/Emulationstation-OGA-Theme-Gallery/main/README.md",
	"onion": "https://raw.githubusercontent.com/OnionUI/Themes/main/generated/custom/index.md",
}

// Каталог Onion разбит на страницы index-15-8a.md и т.п. / The Onion catalog is paged.
const onionCatalogBase = "https://raw.githubusercontent.com/OnionUI/Themes/main/generated/custom/"

var onionPageRe = regexp.MustCompile(`^index(-[0-9]{2}-[0-9a-f]{2})?\.md$`)

var themeDownloadPatterns = []*regexp.Regexp{
	// Архив репозитория темы EmulationStation. / An EmulationStation theme repository archive.
	regexp.MustCompile(`^https://codeload\.github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/zip/HEAD$`),
	// Готовый архив темы Onion. / A packaged Onion theme.
	regexp.MustCompile(`^https://raw\.githubusercontent\.com/OnionUI/Themes/main/release/[^?#]+\.zip$`),
}

func isThemeDownloadURL(u string) bool {
	for _, re := range themeDownloadPatterns {
		if re.MatchString(u) {
			return true
		}
	}
	return false
}

// RegisterThemeRoutes: GET /api/themes/catalog?src=oga|onion → текст каталога;
// page= — страница каталога Onion; GET /api/themes/download?url= → zip темы.
func RegisterThemeRoutes(mux *http.ServeMux, touch func(), client *http.Client) {
	if touch == nil {
		touch = func() {}
	}
	if client == nil {
		client = portMasterHTTPClient()
	}
	proxy := func(w http.ResponseWriter, src, contentType string) {
		resp, err := client.Get(src)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			http.Error(w, fmt.Sprintf("HTTP %d", resp.StatusCode), http.StatusBadGateway)
			return
		}
		w.Header().Set("Content-Type", contentType)
		if resp.ContentLength > 0 {
			w.Header().Set("Content-Length", strconv.FormatInt(resp.ContentLength, 10))
		}
		w.WriteHeader(http.StatusOK)
		_, _ = io.Copy(w, resp.Body)
	}
	mux.HandleFunc("/api/themes/catalog", func(w http.ResponseWriter, r *http.Request) {
		touch()
		q := r.URL.Query()
		src, ok := themeCatalogURLs[q.Get("src")]
		if page := q.Get("page"); ok && page != "" {
			if q.Get("src") != "onion" || !onionPageRe.MatchString(page) {
				ok = false
			} else {
				src = onionCatalogBase + page
			}
		}
		if !ok {
			http.Error(w, "unknown theme catalog", http.StatusBadRequest)
			return
		}
		proxy(w, src, "text/markdown; charset=utf-8")
	})
	mux.HandleFunc("/api/themes/download", func(w http.ResponseWriter, r *http.Request) {
		touch()
		u := r.URL.Query().Get("url")
		if !isThemeDownloadURL(u) {
			http.Error(w, "Invalid theme download URL", http.StatusBadRequest)
			return
		}
		proxy(w, u, "application/zip")
	})
}
