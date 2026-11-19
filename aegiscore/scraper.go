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

func GetOrLoadLibretroIndex(libretroSystem string) []libretroEntry {
	cacheMu.Lock()
	if cached, ok := libretroIndexCache[libretroSystem]; ok {
		cacheMu.Unlock()
		return cached
	}
	cacheMu.Unlock()

	indexURL := fmt.Sprintf("https://thumbnails.libretro.com/%s/Named_Boxarts/", url.PathEscape(libretroSystem))
	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Get(indexURL)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil
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

	cacheMu.Lock()
	libretroIndexCache[libretroSystem] = entries
	cacheMu.Unlock()
	return entries
}

func FindBestLibretroMatch(libretroSystem, cleanTitle, compKey, preferredRegion string) string {
	entries := GetOrLoadLibretroIndex(libretroSystem)
	if len(entries) == 0 {
		return fmt.Sprintf("%s (%s)", cleanTitle, preferredRegion)
	}

	var exactCandidates []string
	for _, e := range entries {
		if e.NormKey == compKey {
			exactCandidates = append(exactCandidates, e.FileName)
		}
	}
	if len(exactCandidates) > 0 {
		for _, c := range exactCandidates {
			if strings.Contains(strings.ToLower(c), strings.ToLower(preferredRegion)) {
				return c
			}
		}
		for _, c := range exactCandidates {
			if strings.Contains(c, "(USA") || strings.Contains(c, "(World") {
				return c
			}
		}
		return exactCandidates[0]
	}

	targetTokens := tokenizeNormalized(cleanTitle)
	if len(targetTokens) == 0 {
		return ""
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

	if bestScore >= 0.55 {
		return bestName
	}
	return ""
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
