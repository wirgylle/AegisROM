package aegisapi

import (
	"aegisgui/aegiscore"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// RegisterLibraryRoutes регистрирует API, общее для всех оболочек (десктоп, aegis-server):
// база библиотеки (/api/db/*), сохранённые сборки, PortMaster, скрапер медиа и DAT (/api/dat/*).
// Данные хранятся в appDir. touch вызывается на каждый запрос (heartbeat десктопа), может быть nil.
func RegisterLibraryRoutes(mux *http.ServeMux, appDir string, touch func()) {
	if touch == nil {
		touch = func() {}
	}
	dbFilePath := filepath.Join(appDir, "aegisrom-v5-db.json")
	registerDatRoutes(mux, appDir, touch)
	registerScreenScraperRoutes(mux, appDir, touch)
	registerScrapeMissRoutes(mux, appDir, touch)
	// Списки обложек libretro-thumbnails кэшируются на диске, чтобы не упираться в лимит GitHub API.
	// Thumbnail lists are cached on disk so the GitHub API rate limit is not hit on every run.
	aegiscore.SetLibretroIndexCacheDir(filepath.Join(appDir, "cache", "libretro-thumbs"))

	// 4. Persistent AegisDB Endpoints
	mux.HandleFunc("/api/db/state", func(w http.ResponseWriter, r *http.Request) {
		touch()
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		if raw, err := os.ReadFile(dbFilePath); err == nil && len(raw) > 10 {
			_, _ = w.Write(raw)
			return
		}
		_, _ = w.Write([]byte(`{"version":"0.6.1-dev","masterLibraryPath":"D:/AegisROM_MasterLibrary","sdCardMountPath":"E:/EASYROMS","bufferZonePath":"D:/AegisROM_MasterLibrary/_Combain_Inbox","preferredRegionOrder":["Russia","USA","Europe","Japan"],"emulatorCustomPaths":{},"starredEmulatorsByConsole":{"nes":"retroarch_fceumm","snes":"retroarch_snes9x","genesis":"retroarch_genesis_plus_gx","gba":"mgba_standalone","psx":"duckstation","ps2":"pcsx2","ps3":"rpcs3","switch":"ryujinx","xbox":"xemu"},"records":[]}`))
	})

	mux.HandleFunc("/api/db/sync", func(w http.ResponseWriter, r *http.Request) {
		touch()
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		body, _ := io.ReadAll(r.Body)
		var payload struct {
			State json.RawMessage `json:"state"`
		}
		if err := json.Unmarshal(body, &payload); err == nil && len(payload.State) > 2 {
			_ = os.WriteFile(dbFilePath, payload.State, 0644)
			_, _ = w.Write([]byte(`{"ok":true,"state":` + string(payload.State) + `}`))
			return
		}
		_, _ = w.Write([]byte(`{"ok":true}`))
	})

	mux.HandleFunc("/api/db/reset-seed", func(w http.ResponseWriter, r *http.Request) {
		touch()
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = os.Remove(dbFilePath)
		_, _ = w.Write([]byte(`{"ok":true}`))
	})

	// 4b. Persistent Saved Builds Storage (/api/db/builds)
	buildsFilePath := filepath.Join(appDir, "aegisrom-v5-builds.json")
	mux.HandleFunc("/api/db/builds", func(w http.ResponseWriter, r *http.Request) {
		touch()
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		if r.Method == http.MethodPost {
			body, _ := io.ReadAll(r.Body)
			var payload struct {
				Builds json.RawMessage `json:"builds"`
			}
			if err := json.Unmarshal(body, &payload); err == nil && len(payload.Builds) >= 2 {
				_ = os.WriteFile(buildsFilePath, payload.Builds, 0644)
				_, _ = w.Write([]byte(`{"ok":true,"builds":` + string(payload.Builds) + `}`))
				return
			}
			http.Error(w, "Invalid builds payload", http.StatusBadRequest)
			return
		}
		if raw, err := os.ReadFile(buildsFilePath); err == nil && len(raw) >= 2 {
			_, _ = w.Write([]byte(`{"ok":true,"builds":` + string(raw) + `}`))
			return
		}
		_, _ = w.Write([]byte(`{"ok":true,"builds":[]}`))
	})

	// 4c. Native PortMaster Feed Proxy & Zip Downloader
	portMasterCachePath := filepath.Join(appDir, "portmaster-info-cache.json")
	mux.HandleFunc("/api/portmaster/catalog", func(w http.ResponseWriter, r *http.Request) {
		touch()
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		forceRefresh := r.URL.Query().Get("refresh") == "1" || r.URL.Query().Get("refresh") == "true"

		if !forceRefresh {
			if st, err := os.Stat(portMasterCachePath); err == nil && time.Since(st.ModTime()) < 6*time.Hour {
				if raw, err := os.ReadFile(portMasterCachePath); err == nil && len(raw) > 20 {
					_, _ = w.Write(raw)
					return
				}
			}
		}

		client := &http.Client{Timeout: 25 * time.Second}
		resp, err := client.Get("https://raw.githubusercontent.com/PortsMaster/PortMaster-Info/main/ports.json")
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			http.Error(w, fmt.Sprintf("portmaster catalog: HTTP %d", resp.StatusCode), http.StatusBadGateway)
			return
		}
		games, skipped, err := parsePortMasterFeed(resp.Body)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		outBytes, _ := json.Marshal(map[string]interface{}{
			"ok":        true,
			"syncedAt":  time.Now().UTC().Format(time.RFC3339),
			"fromCache": false,
			"total":     len(games),
			"skipped":   skipped,
			"games":     games,
		})
		_ = os.WriteFile(portMasterCachePath, outBytes, 0644)
		_, _ = w.Write(outBytes)
	})

	mux.HandleFunc("/api/portmaster/download", func(w http.ResponseWriter, r *http.Request) {
		targetURL := r.URL.Query().Get("url")
		if targetURL == "" || (!strings.HasPrefix(targetURL, "https://github.com/PortsMaster/") && !strings.HasPrefix(targetURL, "https://raw.githubusercontent.com/PortsMaster/")) {
			http.Error(w, "Invalid PortMaster download URL", http.StatusBadRequest)
			return
		}
		httpClient := &http.Client{Timeout: 45 * time.Second}
		resp, err := httpClient.Get(targetURL)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()
		w.Header().Set("Content-Type", "application/zip")
		w.WriteHeader(resp.StatusCode)
		_, _ = io.Copy(w, resp.Body)
	})

	// 5. Media Proxy for R36S Scraper (Libretro Boxart / Archive.org Short Videos)
	mux.HandleFunc("/api/r36s/proxy-media", func(w http.ResponseWriter, r *http.Request) {
		targetURL := r.URL.Query().Get("url")
		if targetURL == "" || (!strings.HasPrefix(targetURL, "https://") && !strings.HasPrefix(targetURL, "http://")) {
			http.Error(w, "Invalid URL", http.StatusBadRequest)
			return
		}
		httpClient := &http.Client{Timeout: 20 * time.Second}
		resp, err := httpClient.Get(targetURL)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()
		if ct := resp.Header.Get("Content-Type"); ct != "" {
			w.Header().Set("Content-Type", ct)
		}
		w.WriteHeader(resp.StatusCode)
		_, _ = io.Copy(w, resp.Body)
	})

	// 5b. Batch R36S Scraper Endpoint (Libretro Boxart + Archive.org Short Gameplay Videos)
	mux.HandleFunc("/api/r36s/scrape-batch", func(w http.ResponseWriter, r *http.Request) {
		touch()
		w.Header().Set("Content-Type", "application/json; charset=utf-8")

		body, err := io.ReadAll(r.Body)
		if err != nil {
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"results": []interface{}{}})
			return
		}

		var req struct {
			Items []struct {
				ID             string `json:"id"`
				CleanTitle     string `json:"cleanTitle"`
				FileName       string `json:"fileName"`
				ComparisonKey  string `json:"comparisonKey"`
				Region         string `json:"region"`
				LibretroSystem string `json:"libretroSystem"`
				ArchiveVideoID string `json:"archiveVideoId"`
			} `json:"items"`
		}
		if err := json.Unmarshal(body, &req); err != nil {
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"results": []interface{}{}})
			return
		}

		type scrapeResult struct {
			ID                    string `json:"id"`
			MatchedCanonicalTitle string `json:"matchedCanonicalTitle"`
			MatchedFileName       string `json:"matchedFileName"`
			BoxArtUrl             string `json:"boxArtUrl"`
			SnapUrl               string `json:"snapUrl"`
			MarqueeUrl            string `json:"marqueeUrl"`
			VideoUrl              string `json:"videoUrl"`
			TitleShotUrl          string `json:"titleShotUrl,omitempty"`
			// Matched: название найдено в индексе Libretro. Если false, MatchedCanonicalTitle —
			// исходное название (как раньше), а Reason объясняет, почему не найдено.
			Matched     bool    `json:"matched"`
			TitleSource string  `json:"titleSource,omitempty"`
			MatchScore  float64 `json:"matchScore,omitempty"`
			Reason      string  `json:"reason,omitempty"`
			ReasonCode  string  `json:"reasonCode,omitempty"`
		}

		results := make([]scrapeResult, 0, len(req.Items))
		for _, item := range req.Items {
			prefRegion := item.Region
			if prefRegion == "" {
				prefRegion = "USA"
			}
			// match объясняет результат; matchedName — прежняя логика для URL обложек (индекс кэширован).
			// Имя файла без расширения: после переименования по DAT оно совпадает с именем картинки.
			// File name without extension: after a DAT rename it equals the image name.
			stem := strings.TrimSpace(item.FileName)
			if dot := strings.LastIndex(stem, "."); dot > 0 {
				stem = stem[:dot]
			}
			match := aegiscore.MatchLibretroRom(item.LibretroSystem, stem, item.CleanTitle, item.ComparisonKey, prefRegion)
			// Ссылки на обложки даём только для найденного названия. Раньше при промахе
			// строилась догадка «<название> (USA).png»: такой файл почти всегда 404, а клиент
			// затирал этой ссылкой рабочую обложку.
			// Cover URLs only for a matched title. A miss used to produce a guessed
			// "<title> (USA).png" that is almost always a 404 and replaced a working cover.
			boxArtURL, snapURL, marqueeURL := aegiscore.LibretroThumbnailURLs(item.LibretroSystem, match.FileName)
			titleShotURL := aegiscore.LibretroMediaURLs(item.LibretroSystem, match.FileName).Title
			matchedName := match.FileName
			canonicalTitle := item.CleanTitle
			if matchedName != "" {
				if t := aegiscore.ExtractCleanTitle(matchedName); t != "" {
					canonicalTitle = t
				}
			}

			videoURL := ""
			if item.ArchiveVideoID != "" && matchedName != "" {
				matchedVid := aegiscore.FindBestArchiveVideoMatch(item.ArchiveVideoID, canonicalTitle, item.ComparisonKey)
				if matchedVid != "" {
					videoURL = fmt.Sprintf("https://archive.org/download/%s/%s", item.ArchiveVideoID, url.PathEscape(matchedVid))
				}
			}

			results = append(results, scrapeResult{
				ID:                    item.ID,
				MatchedCanonicalTitle: canonicalTitle,
				MatchedFileName:       matchedName,
				BoxArtUrl:             boxArtURL,
				SnapUrl:               snapURL,
				MarqueeUrl:            marqueeURL,
				VideoUrl:              videoURL,
				TitleShotUrl:          titleShotURL,
				Matched:               match.FileName != "",
				TitleSource:           match.Source,
				MatchScore:            match.Score,
				Reason:                match.Reason,
				ReasonCode:            match.ReasonCode,
			})
		}

		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"results": results,
		})
	})

}

// SPAHandler отдаёт собранный React UI из assets; неизвестные пути получают index.html.
func SPAHandler(assets fs.FS, indexBytes []byte, touch func()) http.HandlerFunc {
	if touch == nil {
		touch = func() {}
	}
	return func(w http.ResponseWriter, r *http.Request) {
		touch()
		w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")

		cleanPath := strings.TrimPrefix(r.URL.Path, "/")
		if cleanPath == "" || cleanPath == "index.html" {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write(indexBytes)
			return
		}

		// Read exact asset from embeddedWebDist
		assetBytes, err := fs.ReadFile(assets, cleanPath)
		if err == nil {
			w.Header().Set("Content-Type", MimeTypeForExt(filepath.Ext(cleanPath)))
			_, _ = w.Write(assetBytes)
			return
		}

		// SPA fallback to index.html for client-side routes
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write(indexBytes)
	}
}

// Explicit MIME types immune to Windows Registry (HKCR\.js = text/plain) bugs that cause white screens in Chromium
// MimeTypeForExt возвращает Content-Type для расширения файла фронтенда.
func MimeTypeForExt(ext string) string {
	switch strings.ToLower(ext) {
	case ".html", ".htm":
		return "text/html; charset=utf-8"
	case ".js", ".mjs":
		return "application/javascript; charset=utf-8"
	case ".css":
		return "text/css; charset=utf-8"
	case ".json", ".webmanifest":
		return "application/json; charset=utf-8"
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".svg":
		return "image/svg+xml"
	case ".ico":
		return "image/x-icon"
	case ".wasm":
		return "application/wasm"
	case ".woff2":
		return "font/woff2"
	case ".woff":
		return "font/woff"
	case ".ttf":
		return "font/ttf"
	default:
		return "application/octet-stream"
	}
}
