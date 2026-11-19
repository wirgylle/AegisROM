package aegiscore

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
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
const libretroIndexRetryAfter = 5 * time.Minute

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

func fetchLibretroIndex(libretroSystem string) ([]libretroEntry, error) {
	indexURL := fmt.Sprintf("%s/%s/Named_Boxarts/", libretroThumbnailsBase, url.PathEscape(libretroSystem))
	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Get(indexURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	matches := hrefPngRegex.FindAllStringSubmatch(string(body), -1)
	var entries []libretroEntry
	for _, m := range matches {
		if len(m) < 2 {
			continue
		}
		decoded, err := url.QueryUnescape(m[1])
		if err != nil {
			continue
		}
		noExt := strings.TrimSuffix(decoded, ".png")
		clean := ExtractCleanTitle(noExt)
		entries = append(entries, libretroEntry{
			FileName: noExt,
			NormKey:  BuildComparisonKey(clean),
			Tokens:   tokenizeNormalized(clean),
		})
	}
	return entries, nil
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

// TitleMatch — результат онлайн-сверки названия с индексом Libretro.
type TitleMatch struct {
	FileName string  // имя из индекса Libretro без .png, например "Contra (USA)"; "" — не найдено
	Source   string  // TitleSourceLibretroExact / TitleSourceLibretroFuzzy; "" — не найдено
	Score    float64 // сходство 0..1 (1 для точного совпадения)
	Reason   string  // почему не найдено (пусто, если найдено)
}

// MatchLibretroTitle ищет название рома в индексе обложек Libretro и объясняет, если не нашёл.
func MatchLibretroTitle(libretroSystem, cleanTitle, compKey, preferredRegion string) TitleMatch {
	if strings.TrimSpace(libretroSystem) == "" {
		return TitleMatch{Reason: "для этой консоли нет индекса Libretro"}
	}
	if IsPureNumberOrGenericTitle(cleanTitle) {
		return TitleMatch{Reason: "нет исходного названия для поиска (имя файла — номер)"}
	}
	entries, err := LoadLibretroIndex(libretroSystem)
	if err != nil {
		return TitleMatch{Reason: "индекс Libretro недоступен: " + err.Error()}
	}
	if len(entries) == 0 {
		return TitleMatch{Reason: "индекс Libretro для «" + libretroSystem + "» пуст"}
	}
	return matchInEntries(entries, cleanTitle, compKey, preferredRegion)
}

func matchInEntries(entries []libretroEntry, cleanTitle, compKey, preferredRegion string) TitleMatch {
	var exactCandidates []string
	for _, e := range entries {
		if e.NormKey == compKey {
			exactCandidates = append(exactCandidates, e.FileName)
		}
	}
	if len(exactCandidates) > 0 {
		pick := exactCandidates[0]
		found := false
		for _, c := range exactCandidates {
			if strings.Contains(strings.ToLower(c), strings.ToLower(preferredRegion)) {
				pick, found = c, true
				break
			}
		}
		if !found {
			for _, c := range exactCandidates {
				if strings.Contains(c, "(USA") || strings.Contains(c, "(World") {
					pick = c
					break
				}
			}
		}
		return TitleMatch{FileName: pick, Source: TitleSourceLibretroExact, Score: 1}
	}

	targetTokens := tokenizeNormalized(cleanTitle)
	if len(targetTokens) == 0 {
		return TitleMatch{Reason: "в названии нет слов для поиска"}
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
		return TitleMatch{Reason: "в индексе Libretro нет игр с такими словами"}
	}
	return TitleMatch{
		Score:  bestScore,
		Reason: fmt.Sprintf("в индексе Libretro нет похожего названия (ближайшее: «%s», сходство %d%%)", bestName, int(bestScore*100)),
	}
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
