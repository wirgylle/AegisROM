package aegiscore

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// Индекс обложек Libretro.
//
// Раньше список брался только со страницы thumbnails.libretro.com/<система>/Named_Boxarts/.
// Этот сервер медленный, режет частые запросы и часто отвечает 404/таймаутом: тогда вся консоль
// считалась «не найденной», а в журнале копились сотни ошибок. Теперь основной источник — те же
// картинки в репозиториях github.com/libretro-thumbnails: список файлов берётся одним запросом
// к GitHub API (дерево репозитория), сами картинки — с raw.githubusercontent.com. Список
// кэшируется на диске на 14 дней. Старый сервер остаётся запасным.
//
// Из дерева видно, какие типы есть у игры (Boxarts / Snaps / Titles / Logos), поэтому ссылки
// строятся только на существующие файлы — без запросов, которые заведомо дадут 404.
//
// Libretro thumbnail index.
//
// The list used to come only from thumbnails.libretro.com/<system>/Named_Boxarts/. That server is
// slow, rate-limits and often answers 404 or times out, so a whole console was "not found" and the
// log filled with errors. The primary source is now the same images in the github.com/libretro-thumbnails
// repositories: the file list is one GitHub API call (the repo tree), images come from
// raw.githubusercontent.com. The list is cached on disk for 14 days. The old server is the fallback.
//
// The tree shows which types a game has, so URLs are built only for files that exist (no sure 404s).

// Адреса можно подменить в тестах; пустой libretroGitHubAPIBase отключает GitHub.
// Overridable in tests; an empty libretroGitHubAPIBase disables GitHub.
var (
	libretroGitHubAPIBase = "https://api.github.com"
	libretroRawBase       = "https://raw.githubusercontent.com"
)

const libretroThumbsOrg = "libretro-thumbnails"

// libretroDiskCacheTTL — сколько список с диска считается свежим. / Disk list freshness.
var libretroDiskCacheTTL = 14 * 24 * time.Hour

var libretroDiskCacheDir string

// SetLibretroIndexCacheDir задаёт папку для кэша списков обложек ("" — без кэша на диске).
// SetLibretroIndexCacheDir sets the folder for the thumbnail list cache ("" disables it).
func SetLibretroIndexCacheDir(dir string) {
	cacheMu.Lock()
	libretroDiskCacheDir = dir
	cacheMu.Unlock()
}

// Источник списка. / Where a list came from.
const (
	thumbSourceGitHub   = "github"
	thumbSourceLibretro = "libretro"
)

// Типы картинок Libretro (папки в репозитории). / Libretro image types (repo folders).
const (
	ThumbBoxarts = "Named_Boxarts"
	ThumbSnaps   = "Named_Snaps"
	ThumbTitles  = "Named_Titles"
	ThumbLogos   = "Named_Logos"
)

var thumbTypes = []string{ThumbBoxarts, ThumbSnaps, ThumbTitles, ThumbLogos}

// libretroIndexData — что известно о системе: имена (без .png) по типам.
// Known nil-карта типа значит «неизвестно» (старый сервер даёт только Boxarts).
// libretroIndexData: names (no .png) per type. A nil map means "unknown" (the old server lists Boxarts only).
type libretroIndexData struct {
	Source    string                     `json:"source"`
	FetchedAt time.Time                  `json:"fetchedAt"`
	Types     map[string]map[string]bool `json:"-"`
	// Links — файлы-симлинки в репозитории: raw.githubusercontent отдаёт по ним текст, а не
	// картинку, поэтому их берём со старого сервера, который ссылки разворачивает.
	// Links: symlinked files; raw.githubusercontent serves their text, so those come from the old server.
	Links map[string]bool `json:"-"`
}

type libretroIndexDisk struct {
	Source    string              `json:"source"`
	FetchedAt time.Time           `json:"fetchedAt"`
	Types     map[string][]string `json:"types"`
	Links     []string            `json:"links,omitempty"`
}

var libretroIndexInfo = make(map[string]*libretroIndexData)

// LibretroRepoName: «Nintendo - Game Boy» → «Nintendo_-_Game_Boy» (имя репозитория на GitHub).
func LibretroRepoName(system string) string {
	return strings.ReplaceAll(strings.TrimSpace(system), " ", "_")
}

// thumbUnsafeChars — символы, которые Libretro заменяет на «_» в именах картинок.
// thumbUnsafeChars: characters Libretro replaces with "_" in image names.
var thumbUnsafeChars = regexp.MustCompile("[&*/:`<>?\\\\|\"]")

// SanitizeThumbName приводит имя рома к имени картинки Libretro.
func SanitizeThumbName(name string) string {
	return thumbUnsafeChars.ReplaceAllString(strings.TrimSpace(name), "_")
}

type ghTree struct {
	Tree []struct {
		Path string `json:"path"`
		Mode string `json:"mode"`
		Type string `json:"type"`
		SHA  string `json:"sha"`
	} `json:"tree"`
	Truncated bool `json:"truncated"`
}

func getGitHubTree(client *http.Client, treeURL string) (*ghTree, error) {
	req, err := http.NewRequest(http.MethodGet, treeURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "AegisROM")
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, resp.Body)
		return nil, httpStatusError{resp.StatusCode}
	}
	var t ghTree
	if err := json.NewDecoder(resp.Body).Decode(&t); err != nil {
		return nil, err
	}
	return &t, nil
}

func newIndexData(source string) *libretroIndexData {
	d := &libretroIndexData{Source: source, FetchedAt: time.Now(), Types: map[string]map[string]bool{}, Links: map[string]bool{}}
	return d
}

// addPath разбирает путь «Named_Boxarts/Name.png». / Parses "Named_Boxarts/Name.png".
func (d *libretroIndexData) addPath(path, mode string) {
	slash := strings.IndexByte(path, '/')
	if slash <= 0 || !strings.HasSuffix(strings.ToLower(path), ".png") {
		return
	}
	typ, file := path[:slash], path[slash+1:]
	if strings.Contains(file, "/") {
		return
	}
	known := false
	for _, t := range thumbTypes {
		if t == typ {
			known = true
		}
	}
	if !known {
		return
	}
	name := file[:len(file)-4]
	if d.Types[typ] == nil {
		d.Types[typ] = map[string]bool{}
	}
	d.Types[typ][name] = true
	if mode == "120000" {
		d.Links[typ+"/"+name] = true
	}
}

// fetchGitHubIndex: одно дерево целиком; если GitHub его обрезал (очень большие системы),
// берём корень и каждую папку Named_* отдельно.
// fetchGitHubIndex: one recursive tree; if GitHub truncates it, list the root and each Named_* folder.
func fetchGitHubIndex(system string) (*libretroIndexData, error) {
	client := &http.Client{Timeout: libretroIndexTimeout}
	base := fmt.Sprintf("%s/repos/%s/%s/git/trees/", libretroGitHubAPIBase, libretroThumbsOrg, url.PathEscape(LibretroRepoName(system)))
	t, err := getGitHubTree(client, base+"HEAD?recursive=1")
	if err != nil {
		return nil, err
	}
	d := newIndexData(thumbSourceGitHub)
	if !t.Truncated {
		for _, e := range t.Tree {
			if e.Type == "blob" {
				d.addPath(e.Path, e.Mode)
			}
		}
		return d, nil
	}
	root, err := getGitHubTree(client, base+"HEAD")
	if err != nil {
		return nil, err
	}
	for _, e := range root.Tree {
		if e.Type != "tree" || !strings.HasPrefix(e.Path, "Named_") {
			continue
		}
		sub, err := getGitHubTree(client, base+url.PathEscape(e.SHA))
		if err != nil {
			return nil, err
		}
		for _, f := range sub.Tree {
			if f.Type == "blob" {
				d.addPath(e.Path+"/"+f.Path, f.Mode)
			}
		}
	}
	return d, nil
}

func diskCachePath(system string) string {
	if libretroDiskCacheDir == "" {
		return ""
	}
	return filepath.Join(libretroDiskCacheDir, LibretroRepoName(system)+".json")
}

func loadIndexFromDisk(system string) *libretroIndexData {
	cacheMu.Lock()
	p := diskCachePath(system)
	cacheMu.Unlock()
	if p == "" {
		return nil
	}
	raw, err := os.ReadFile(p)
	if err != nil {
		return nil
	}
	var disk libretroIndexDisk
	if json.Unmarshal(raw, &disk) != nil || len(disk.Types) == 0 {
		return nil
	}
	d := newIndexData(disk.Source)
	d.FetchedAt = disk.FetchedAt
	for typ, names := range disk.Types {
		m := make(map[string]bool, len(names))
		for _, n := range names {
			m[n] = true
		}
		d.Types[typ] = m
	}
	for _, l := range disk.Links {
		d.Links[l] = true
	}
	return d
}

func saveIndexToDisk(system string, d *libretroIndexData) {
	cacheMu.Lock()
	p := diskCachePath(system)
	cacheMu.Unlock()
	if p == "" {
		return
	}
	disk := libretroIndexDisk{Source: d.Source, FetchedAt: d.FetchedAt, Types: map[string][]string{}}
	for typ, m := range d.Types {
		for n := range m {
			disk.Types[typ] = append(disk.Types[typ], n)
		}
	}
	for l := range d.Links {
		disk.Links = append(disk.Links, l)
	}
	raw, err := json.Marshal(disk)
	if err != nil {
		return
	}
	_ = os.MkdirAll(filepath.Dir(p), 0o755)
	tmp := p + ".tmp"
	if os.WriteFile(tmp, raw, 0o644) == nil {
		_ = os.Rename(tmp, p)
	}
}

// entries — все имена (любого типа) для поиска по названию. / All names of any type, for title search.
func (d *libretroIndexData) entries() []libretroEntry {
	seen := map[string]bool{}
	var out []libretroEntry
	for _, typ := range thumbTypes {
		for name := range d.Types[typ] {
			if seen[name] {
				continue
			}
			seen[name] = true
			clean := ExtractCleanTitle(name)
			out = append(out, libretroEntry{FileName: name, NormKey: BuildComparisonKey(clean), Tokens: tokenizeNormalized(clean)})
		}
	}
	return out
}

// has: есть ли картинка типа typ. Неизвестный тип (nil) — «может быть», ссылку строим.
// has: whether an image of type typ exists; an unknown type (nil) means "maybe", the URL is built.
func (d *libretroIndexData) has(typ, name string) bool {
	if d == nil {
		return true
	}
	m, ok := d.Types[typ]
	if !ok || m == nil {
		return d.Source != thumbSourceGitHub
	}
	return m[name]
}

// loadIndexData: диск (свежий) → GitHub → старый сервер → диск (устаревший).
// loadIndexData: fresh disk → GitHub → old server → stale disk.
func loadIndexData(system string) (*libretroIndexData, error) {
	disk := loadIndexFromDisk(system)
	if disk != nil && time.Since(disk.FetchedAt) < libretroDiskCacheTTL {
		return disk, nil
	}
	var ghErr error
	if libretroGitHubAPIBase != "" {
		d, err := fetchGitHubIndex(system)
		if err == nil && len(d.Types) > 0 {
			saveIndexToDisk(system, d)
			return d, nil
		}
		ghErr = err
		if se, ok := err.(httpStatusError); ok && se.code == http.StatusNotFound && disk == nil {
			// Репозитория нет — консоль Libretro не поддерживает; старый сервер её тоже не знает.
			// No repository: Libretro has no thumbnails for this console.
			return nil, err
		}
	}
	names, err := fetchLibretroListing(system)
	if err == nil && len(names) > 0 {
		d := newIndexData(thumbSourceLibretro)
		d.Types[ThumbBoxarts] = names
		// Логотипов у старого сервера почти нет — не угадываем. / Logos are rare there, not guessed.
		d.Types[ThumbLogos] = map[string]bool{}
		return d, nil
	}
	if disk != nil {
		return disk, nil
	}
	if err == nil && ghErr != nil {
		err = ghErr
	}
	if err == nil {
		err = httpStatusError{http.StatusNotFound}
	}
	return nil, err
}

// fetchLibretroListing — список Named_Boxarts со старого сервера (с одним повтором).
func fetchLibretroListing(system string) (map[string]bool, error) {
	names, err := fetchLibretroListingOnce(system)
	if err != nil && isRetryableIndexError(err) {
		time.Sleep(libretroIndexRetryDelay)
		names, err = fetchLibretroListingOnce(system)
	}
	return names, err
}

func fetchLibretroListingOnce(system string) (map[string]bool, error) {
	indexURL := fmt.Sprintf("%s/%s/Named_Boxarts/", libretroThumbnailsBase, url.PathEscape(system))
	client := &http.Client{Timeout: libretroIndexTimeout}
	resp, err := client.Get(indexURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, httpStatusError{resp.StatusCode}
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	out := map[string]bool{}
	for _, m := range hrefPngRegex.FindAllStringSubmatch(string(body), -1) {
		if len(m) < 2 {
			continue
		}
		// PathUnescape, а не QueryUnescape: «+» в имени файла — это плюс, а не пробел.
		// PathUnescape, not QueryUnescape: "+" in a file name is a plus, not a space.
		decoded, err := url.PathUnescape(m[1])
		if err != nil {
			continue
		}
		decoded = decoded[strings.LastIndex(decoded, "/")+1:]
		out[strings.TrimSuffix(decoded, ".png")] = true
	}
	return out, nil
}

func indexInfo(system string) *libretroIndexData {
	cacheMu.Lock()
	defer cacheMu.Unlock()
	return libretroIndexInfo[system]
}

// LibretroMedia — ссылки на картинки одной игры; пустая строка — такой картинки нет.
// LibretroMedia: image URLs for one game; empty means the image does not exist.
type LibretroMedia struct {
	BoxArt string
	Snap   string
	Title  string
	Logo   string
}

func thumbURL(d *libretroIndexData, system, typ, name string) string {
	if !d.has(typ, name) {
		return ""
	}
	fileEsc := url.PathEscape(name + ".png")
	if d != nil && d.Source == thumbSourceGitHub && !d.Links[typ+"/"+name] {
		return fmt.Sprintf("%s/%s/%s/HEAD/%s/%s", libretroRawBase, libretroThumbsOrg, url.PathEscape(LibretroRepoName(system)), typ, fileEsc)
	}
	return fmt.Sprintf("%s/%s/%s/%s", libretroThumbnailsBase, url.PathEscape(system), typ, fileEsc)
}

// LibretroMediaURLs строит ссылки только на существующие картинки игры.
// LibretroMediaURLs builds URLs only for images that exist.
func LibretroMediaURLs(system, fileName string) LibretroMedia {
	if strings.TrimSpace(system) == "" || strings.TrimSpace(fileName) == "" {
		return LibretroMedia{}
	}
	d := indexInfo(system)
	if d == nil {
		// Индекс не загружен: Logos у большинства систем нет, их не угадываем.
		// No index loaded: most systems have no Logos, so they are not guessed.
		d = &libretroIndexData{Source: thumbSourceLibretro, Types: map[string]map[string]bool{ThumbLogos: {}}}
	}
	return LibretroMedia{
		BoxArt: thumbURL(d, system, ThumbBoxarts, fileName),
		Snap:   thumbURL(d, system, ThumbSnaps, fileName),
		Title:  thumbURL(d, system, ThumbTitles, fileName),
		Logo:   thumbURL(d, system, ThumbLogos, fileName),
	}
}

// exactFileMatch: имя рома (без расширения) совпало с именем картинки — самый точный признак,
// работает и для названий вроде «1942» или «E.T.», которые по словам не ищутся.
// exactFileMatch: the ROM file name equals an image name; works for "1942" or "E.T." too.
func exactFileMatch(system, fileStem string) string {
	stem := SanitizeThumbName(fileStem)
	if stem == "" {
		return ""
	}
	d := indexInfo(system)
	if d == nil {
		return ""
	}
	for _, typ := range thumbTypes {
		if d.Types[typ][stem] {
			return stem
		}
	}
	lower := strings.ToLower(stem)
	for _, typ := range thumbTypes {
		for n := range d.Types[typ] {
			if strings.ToLower(n) == lower {
				return n
			}
		}
	}
	return ""
}
