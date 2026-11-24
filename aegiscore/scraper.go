package aegiscore

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"
	"unicode"
)

func tokenizeNormalized(s string) map[string]bool {
	res := make(map[string]bool)
	var cur strings.Builder
	for _, r := range strings.ToLower(s) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			cur.WriteRune(r)
		} else if cur.Len() > 0 {
			tok := cur.String()
			if len(tok) > 1 && tok != "the" && tok != "and" && tok != "version" {
				res[tok] = true
			}
			cur.Reset()
		}
	}
	if cur.Len() > 0 {
		tok := cur.String()
		if len(tok) > 1 && tok != "the" && tok != "and" && tok != "version" {
			res[tok] = true
		}
	}
	return res
}

// libretroThumbnailsBase — адрес сервера обложек Libretro (переопределяется в тестах).
var libretroThumbnailsBase = "https://thumbnails.libretro.com"

// libretroIndexRetryAfter — сколько не повторять загрузку индекса после сетевой ошибки,
// чтобы пакетная сверка не ждала таймаут на каждом роме.
const libretroIndexRetryAfter = 2 * time.Minute

// libretroIndexTimeout — список обложек больших систем (PS1, FBNeo) весит мегабайты,
// 20 секунд на медленном канале не хватало, и вся консоль считалась «не найденной».
// libretroIndexTimeout: big system listings are megabytes; 20 s was too short on slow links.
var libretroIndexTimeout = 90 * time.Second

type indexFailure struct {
	err error
	at  time.Time
}

var libretroIndexFailures = make(map[string]indexFailure)

// LoadLibretroIndex возвращает список названий с обложками Libretro для системы
// (кэшируется) или ошибку загрузки.
func LoadLibretroIndex(libretroSystem string) ([]libretroEntry, error) {
	cacheMu.Lock()
	if cached, ok := libretroIndexCache[libretroSystem]; ok {
		cacheMu.Unlock()
		return cached, nil
	}
	if f, ok := libretroIndexFailures[libretroSystem]; ok && time.Since(f.at) < libretroIndexRetryAfter {
		cacheMu.Unlock()
		return nil, f.err
	}
	cacheMu.Unlock()

	entries, err := fetchLibretroIndex(libretroSystem)
	cacheMu.Lock()
	if err != nil {
		libretroIndexFailures[libretroSystem] = indexFailure{err: err, at: time.Now()}
	} else {
		delete(libretroIndexFailures, libretroSystem)
		libretroIndexCache[libretroSystem] = entries
	}
	cacheMu.Unlock()
	return entries, err
}

// fetchLibretroIndex: GitHub (libretro-thumbnails) → старый сервер, с кэшем на диске (thumbs_index.go).
// fetchLibretroIndex: GitHub (libretro-thumbnails) → old server, with a disk cache (thumbs_index.go).
func fetchLibretroIndex(libretroSystem string) ([]libretroEntry, error) {
	d, err := loadIndexData(libretroSystem)
	if err != nil {
		return nil, err
	}
	cacheMu.Lock()
	libretroIndexInfo[libretroSystem] = d
	cacheMu.Unlock()
	return d.entries(), nil
}

type httpStatusError struct{ code int }

func (e httpStatusError) Error() string { return fmt.Sprintf("HTTP %d", e.code) }

// libretroIndexRetryDelay — пауза перед повтором (в тестах 0). / Pause before the retry (0 in tests).
var libretroIndexRetryDelay = 2 * time.Second

// Повторяем сетевые сбои и 5xx; 404 и прочие 4xx повторять бессмысленно.
// Retry network errors and 5xx; 404 and other 4xx won't change.
func isRetryableIndexError(err error) bool {
	if se, ok := err.(httpStatusError); ok {
		return se.code >= 500
	}
	return true
}

// GetOrLoadLibretroIndex — как LoadLibretroIndex, но без ошибки (nil при сбое).
func GetOrLoadLibretroIndex(libretroSystem string) []libretroEntry {
	entries, _ := LoadLibretroIndex(libretroSystem)
	return entries
}

// Источники названия, найденного онлайн.
const (
	TitleSourceLibretroExact = "libretro-exact" // ключ сравнения совпал с названием в индексе Libretro
	TitleSourceLibretroFuzzy = "libretro-fuzzy" // похожее название (совпадение слов >= 55%)
)

// libretroFuzzyThreshold — минимальное сходство слов для нечёткого совпадения.
const libretroFuzzyThreshold = 0.55

// Коды причин промаха: по ним клиент группирует отчёт скраппера и предлагает следующий шаг.
// Miss reason codes: the client groups the scraper report by them and offers the next step.
const (
	MissNoSystem = "no-system" // у консоли нет списка Libretro / console has no Libretro listing
	MissNoTitle  = "no-title"  // имя — номер или мусор, искать нечего / name is a number or junk
	MissNetwork  = "network"   // список Libretro не загрузился / listing failed to load
	MissNotInDB  = "not-in-db" // список загружен, игры в нём нет / listing loaded, game not in it
)

// TitleMatch — результат онлайн-сверки названия с индексом Libretro.
type TitleMatch struct {
	FileName   string  // имя из индекса Libretro без .png, например "Contra (USA)"; "" — не найдено
	Source     string  // TitleSourceLibretroExact / TitleSourceLibretroFuzzy; "" — не найдено
	Score      float64 // сходство 0..1 (1 для точного совпадения)
	Reason     string  // почему не найдено (пусто, если найдено)
	ReasonCode string  // MissNoSystem / MissNoTitle / MissNetwork / MissNotInDB; пусто, если найдено
}

// MatchLibretroTitle ищет название рома в индексе обложек Libretro и объясняет, если не нашёл.
func MatchLibretroTitle(libretroSystem, cleanTitle, compKey, preferredRegion string) TitleMatch {
	return MatchLibretroRom(libretroSystem, "", cleanTitle, compKey, preferredRegion)
}

// MatchLibretroRom: сначала точное имя файла рома (после переименования по DAT оно совпадает с
// именем картинки), потом название. Номерные названия («1942») ищутся только точно, без нечёткого поиска.
// MatchLibretroRom: exact ROM file name first (after a DAT rename it equals the image name), then the
// title. Number-only titles ("1942") are matched exactly only, never fuzzily.
func MatchLibretroRom(libretroSystem, fileStem, cleanTitle, compKey, preferredRegion string) TitleMatch {
	if strings.TrimSpace(libretroSystem) == "" {
		return TitleMatch{Reason: "для этой консоли нет индекса Libretro", ReasonCode: MissNoSystem}
	}
	numeric := IsPureNumberOrGenericTitle(cleanTitle)
	if numeric && strings.TrimSpace(fileStem) == "" && !looksLikeRealNumberTitle(cleanTitle) {
		return TitleMatch{Reason: "нет исходного названия для поиска (имя файла — номер)", ReasonCode: MissNoTitle}
	}
	entries, err := LoadLibretroIndex(libretroSystem)
	if err != nil {
		code := MissNetwork
		if se, ok := err.(httpStatusError); ok && se.code == http.StatusNotFound {
			// Такой папки/репозитория у Libretro нет: консоль не поддерживается, это не сеть.
			code = MissNoSystem
		}
		return TitleMatch{Reason: "индекс Libretro недоступен: " + err.Error(), ReasonCode: code}
	}
	if len(entries) == 0 {
		return TitleMatch{Reason: "индекс Libretro для «" + libretroSystem + "» пуст", ReasonCode: MissNoSystem}
	}
	if name := exactFileMatch(libretroSystem, fileStem); name != "" {
		return TitleMatch{FileName: name, Source: TitleSourceLibretroExact, Score: 1}
	}
	if numeric {
		m := matchExactOnly(entries, compKey, preferredRegion)
		if m.FileName == "" {
			m.Reason, m.ReasonCode = "нет исходного названия для поиска (имя файла — номер)", MissNoTitle
		}
		return m
	}
	return matchInEntries(entries, cleanTitle, compKey, preferredRegion)
}

// looksLikeRealNumberTitle: «1942», «2020 Super Baseball» — настоящие названия, а «000123» — нет.
// looksLikeRealNumberTitle: "1942" is a real title, "000123" is not.
func looksLikeRealNumberTitle(t string) bool {
	t = strings.TrimSpace(t)
	return len(t) >= 2 && len(t) <= 5 && !strings.HasPrefix(t, "0")
}

func matchExactOnly(entries []libretroEntry, compKey, preferredRegion string) TitleMatch {
	if strings.TrimSpace(compKey) == "" {
		return TitleMatch{}
	}
	var cands []string
	for _, e := range entries {
		if e.NormKey == compKey {
			cands = append(cands, e.FileName)
		}
	}
	if len(cands) == 0 {
		return TitleMatch{}
	}
	return TitleMatch{FileName: pickRegion(cands, preferredRegion), Source: TitleSourceLibretroExact, Score: 1}
}

func pickRegion(cands []string, preferredRegion string) string {
	sort.Strings(cands)
	for _, c := range cands {
		if preferredRegion != "" && strings.Contains(strings.ToLower(c), strings.ToLower(preferredRegion)) {
			return c
		}
	}
	for _, c := range cands {
		if strings.Contains(c, "(USA") || strings.Contains(c, "(World") {
			return c
		}
	}
	return cands[0]
}

func matchInEntries(entries []libretroEntry, cleanTitle, compKey, preferredRegion string) TitleMatch {
	var exactCandidates []string
	for _, e := range entries {
		if e.NormKey == compKey {
			exactCandidates = append(exactCandidates, e.FileName)
		}
	}
	if len(exactCandidates) > 0 {
		return TitleMatch{FileName: pickRegion(exactCandidates, preferredRegion), Source: TitleSourceLibretroExact, Score: 1}
	}

	targetTokens := tokenizeNormalized(cleanTitle)
	if len(targetTokens) == 0 {
		return TitleMatch{Reason: "в названии нет слов для поиска", ReasonCode: MissNoTitle}
	}

	bestName := ""
	bestScore := 0.0

	for _, e := range entries {
		if len(e.Tokens) == 0 {
			continue
		}
		common := 0
		for t := range targetTokens {
			if e.Tokens[t] {
				common++
			}
		}
		if common == 0 {
			continue
		}
		union := len(targetTokens) + len(e.Tokens) - common
		score := float64(common) / float64(union)
		if strings.Contains(e.FileName, "(USA") {
			score += 0.05
		}
		if score > bestScore {
			bestScore = score
			bestName = e.FileName
		}
	}

	if bestScore >= libretroFuzzyThreshold {
		return TitleMatch{FileName: bestName, Source: TitleSourceLibretroFuzzy, Score: bestScore}
	}
	if bestName == "" {
		return TitleMatch{Reason: "в индексе Libretro нет игр с такими словами", ReasonCode: MissNotInDB}
	}
	return TitleMatch{
		Score:      bestScore,
		ReasonCode: MissNotInDB,
		Reason:     fmt.Sprintf("в индексе Libretro нет похожего названия (ближайшее: «%s», сходство %d%%)", bestName, int(bestScore*100)),
	}
}

// LibretroThumbnailURLs строит ссылки на обложку, скриншот и «марки» (логотип, если есть, иначе
// титульный экран) для имени из индекса Libretro. Ссылки только на существующие файлы.
// LibretroThumbnailURLs: box art, snap and marquee (logo if any, else title screen); only existing files.
func LibretroThumbnailURLs(libretroSystem, fileName string) (boxArt, snap, marquee string) {
	m := LibretroMediaURLs(libretroSystem, fileName)
	marquee = m.Logo
	if marquee == "" {
		marquee = m.Title
	}
	return m.BoxArt, m.Snap, marquee
}

// FindBestLibretroMatch возвращает имя из индекса Libretro или "" (не найдено).
// Если индекс недоступен или пуст, возвращает "<cleanTitle> (<регион>)", как раньше.
func FindBestLibretroMatch(libretroSystem, cleanTitle, compKey, preferredRegion string) string {
	entries := GetOrLoadLibretroIndex(libretroSystem)
	if len(entries) == 0 {
		return fmt.Sprintf("%s (%s)", cleanTitle, preferredRegion)
	}
	return matchInEntries(entries, cleanTitle, compKey, preferredRegion).FileName
}

func GetOrLoadArchiveVideoIndex(archiveID string) []archiveVideoEntry {
	cacheMu.Lock()
	if cached, ok := archiveVideoCache[archiveID]; ok {
		cacheMu.Unlock()
		return cached
	}
	cacheMu.Unlock()

	metaURL := fmt.Sprintf("https://archive.org/metadata/%s/files", archiveID)
	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Get(metaURL)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()

	var payload struct {
		Result []struct {
			Name string `json:"name"`
		} `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil
	}

	var entries []archiveVideoEntry
	for _, f := range payload.Result {
		if !strings.HasSuffix(strings.ToLower(f.Name), ".mp4") || strings.HasSuffix(strings.ToLower(f.Name), ".ia.mp4") {
			continue
		}
		clean := ExtractCleanTitle(f.Name)
		entries = append(entries, archiveVideoEntry{
			FileName: f.Name,
			NormKey:  BuildComparisonKey(clean),
			Tokens:   tokenizeNormalized(clean),
		})
	}

	cacheMu.Lock()
	archiveVideoCache[archiveID] = entries
	cacheMu.Unlock()
	return entries
}

func FindBestArchiveVideoMatch(archiveID, cleanTitle, compKey string) string {
	entries := GetOrLoadArchiveVideoIndex(archiveID)
	if len(entries) == 0 {
		return ""
	}

	for _, e := range entries {
		if e.NormKey == compKey {
			return e.FileName
		}
	}

	targetTokens := tokenizeNormalized(cleanTitle)
	if len(targetTokens) == 0 {
		return ""
	}

	bestFile := ""
	bestScore := 0.0
	for _, e := range entries {
		if len(e.Tokens) == 0 {
			continue
		}
		common := 0
		for t := range targetTokens {
			if e.Tokens[t] {
				common++
			}
		}
		if common == 0 {
			continue
		}
		union := len(targetTokens) + len(e.Tokens) - common
		score := float64(common) / float64(union)
		if score > bestScore {
			bestScore = score
			bestFile = e.FileName
		}
	}

	if bestScore >= 0.55 {
		return bestFile
	}
	return ""
}

func DownloadFileHTTP(rawURL, destPath string, timeout time.Duration) bool {
	if fi, err := os.Stat(destPath); err == nil && fi.Size() > 256 {
		return true
	}
	client := &http.Client{Timeout: timeout}
	resp, err := client.Get(rawURL)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return false
	}
	out, err := os.Create(destPath)
	if err != nil {
		return false
	}
	written, err := io.Copy(out, resp.Body)
	out.Close()
	if err != nil || written < 256 {
		_ = os.Remove(destPath)
		return false
	}
	return true
}
