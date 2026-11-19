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

	// 4. Persistent AegisDB Endpoints
	mux.HandleFunc("/api/db/state", func(w http.ResponseWriter, r *http.Request) {
		touch()
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		if raw, err := os.ReadFile(dbFilePath); err == nil && len(raw) > 10 {
			_, _ = w.Write(raw)
			return
		}
		_, _ = w.Write([]byte(`{"version":"0.5.6-dev","masterLibraryPath":"D:/AegisROM_MasterLibrary","sdCardMountPath":"E:/EASYROMS","bufferZonePath":"D:/AegisROM_MasterLibrary/_Combain_Inbox","preferredRegionOrder":["Russia","USA","Europe","Japan"],"emulatorCustomPaths":{},"starredEmulatorsByConsole":{"nes":"retroarch_fceumm","snes":"retroarch_snes9x","genesis":"retroarch_genesis_plus_gx","gba":"mgba_standalone","psx":"duckstation","ps2":"pcsx2","ps3":"rpcs3","switch":"ryujinx","xbox":"xemu"},"records":[]}`))
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
		var rawFeed struct {
			Ports map[string]struct {
				Name  string   `json:"name"`
				Items []string `json:"items"`
				Attr  struct {
					Title   string                 `json:"title"`
					Desc    string                 `json:"desc"`
					Genres  []string               `json:"genres"`
					Rtr     bool                   `json:"rtr"`
					Porter  []string               `json:"porter"`
					Runtime interface{}            `json:"runtime"`
					Reqs    []string               `json:"reqs"`
					Inst    string                 `json:"inst"`
					InstMd  string                 `json:"inst_md"`
					Avail   map[string]interface{} `json:"avail"`
					Image   struct {
						Covers     []string `json:"covers"`
						Screenshot string   `json:"screenshot"`
					} `json:"image"`
				} `json:"attr"`
				Source struct {
					URL         string `json:"url"`
					Size        int64  `json:"size"`
					DateUpdated string `json:"date_updated"`
					MD5         string `json:"md5"`
				} `json:"source"`
			} `json:"ports"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&rawFeed); err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		type pmItem struct {
			ID                      string   `json:"id"`
			Slug                    string   `json:"slug"`
			Title                   string   `json:"title"`
			Desc                    string   `json:"desc"`
			Genres                  []string `json:"genres"`
			ReadyToRun              bool     `json:"readyToRun"`
			Porter                  []string `json:"porter"`
			Runtime                 []string `json:"runtime"`
			Requirements            []string `json:"requirements"`
			InstructionsRaw         string   `json:"instructionsRaw"`
			InstructionsMd          string   `json:"instructionsMd"`
			RequiredDataTargetPath  string   `json:"requiredDataTargetPath"`
			RequiredDataHint        string   `json:"requiredDataHint"`
			Items                   []string `json:"items"`
			AvailDevices            []string `json:"availDevices"`
			SupportedConsolesPretty []string `json:"supportedConsolesPretty"`
			CoverUrl                string   `json:"coverUrl"`
			ScreenshotUrl           string   `json:"screenshotUrl"`
			DownloadUrl             string   `json:"downloadUrl"`
			SizeBytes               int64    `json:"sizeBytes"`
			DateUpdated             string   `json:"dateUpdated"`
			MD5                     string   `json:"md5"`
		}
		games := make([]pmItem, 0, len(rawFeed.Ports))
		for key, entry := range rawFeed.Ports {
			slug := strings.TrimSuffix(entry.Name, ".zip")
			if slug == "" {
				slug = strings.TrimSuffix(key, ".zip")
			}
			coverUrl := ""
			shotUrl := ""
			if entry.Attr.Image.Screenshot != "" {
				shotUrl = "https://raw.githubusercontent.com/PortsMaster/PortMaster-New/main/ports/" + url.PathEscape(slug) + "/" + url.PathEscape(entry.Attr.Image.Screenshot)
			}
			if len(entry.Attr.Image.Covers) > 0 {
				coverUrl = "https://raw.githubusercontent.com/PortsMaster/PortMaster-New/main/ports/" + url.PathEscape(slug) + "/" + url.PathEscape(entry.Attr.Image.Covers[0])
			} else {
				coverUrl = shotUrl
			}
			rtList := []string{}
			switch v := entry.Attr.Runtime.(type) {
			case string:
				if v != "" {
					rtList = append(rtList, v)
				}
			case []interface{}:
				for _, x := range v {
					if s, ok := x.(string); ok {
						rtList = append(rtList, s)
					}
				}
			}
			availKeys := make([]string, 0, len(entry.Attr.Avail))
			for ak := range entry.Attr.Avail {
				availKeys = append(availKeys, ak)
			}
			games = append(games, pmItem{
				ID:                      key,
				Slug:                    slug,
				Title:                   entry.Attr.Title,
				Desc:                    entry.Attr.Desc,
				Genres:                  entry.Attr.Genres,
				ReadyToRun:              entry.Attr.Rtr,
				Porter:                  entry.Attr.Porter,
				Runtime:                 rtList,
				Requirements:            entry.Attr.Reqs,
				InstructionsRaw:         entry.Attr.Inst,
				InstructionsMd:          entry.Attr.InstMd,
				RequiredDataTargetPath:  "ports/" + slug,
				RequiredDataHint:        "Поместите файлы игры в папку ports/" + slug + "/",
				Items:                   entry.Items,
				AvailDevices:            availKeys,
				SupportedConsolesPretty: []string{"R36S (ArkOS)", "Anbernic (MuOS/Knulli)", "ROCKNIX"},
				CoverUrl:                coverUrl,
				ScreenshotUrl:           shotUrl,
				DownloadUrl:             entry.Source.URL,
				SizeBytes:               entry.Source.Size,
				DateUpdated:             entry.Source.DateUpdated,
				MD5:                     entry.Source.MD5,
			})
		}
		outBytes, _ := json.Marshal(map[string]interface{}{
			"ok":        true,
			"syncedAt":  time.Now().UTC().Format(time.RFC3339),
			"fromCache": false,
			"total":     len(games),
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
			// Matched: название найдено в индексе Libretro. Если false, MatchedCanonicalTitle —
			// исходное название (как раньше), а Reason объясняет, почему не найдено.
			Matched     bool    `json:"matched"`
			TitleSource string  `json:"titleSource,omitempty"`
			MatchScore  float64 `json:"matchScore,omitempty"`
			Reason      string  `json:"reason,omitempty"`
		}

		results := make([]scrapeResult, 0, len(req.Items))
		for _, item := range req.Items {
			prefRegion := item.Region
			if prefRegion == "" {
				prefRegion = "USA"
			}
			// match объясняет результат; matchedName — прежняя логика для URL обложек (индекс кэширован).
			match := aegiscore.MatchLibretroTitle(item.LibretroSystem, item.CleanTitle, item.ComparisonKey, prefRegion)
			matchedName := aegiscore.FindBestLibretroMatch(item.LibretroSystem, item.CleanTitle, item.ComparisonKey, prefRegion)
			if matchedName == "" {
				matchedName = fmt.Sprintf("%s (USA)", item.CleanTitle)
			}
			canonicalTitle := aegiscore.ExtractCleanTitle(matchedName)
			if canonicalTitle == "" {
				canonicalTitle = item.CleanTitle
			}

			sysEsc := url.PathEscape(item.LibretroSystem)
			fileEsc := url.PathEscape(matchedName + ".png")

			boxArtURL := fmt.Sprintf("https://thumbnails.libretro.com/%s/Named_Boxarts/%s", sysEsc, fileEsc)
			snapURL := fmt.Sprintf("https://thumbnails.libretro.com/%s/Named_Snaps/%s", sysEsc, fileEsc)
			marqueeURL := fmt.Sprintf("https://thumbnails.libretro.com/%s/Named_Titles/%s", sysEsc, fileEsc)

			videoURL := ""
			if item.ArchiveVideoID != "" {
				matchedVid := aegiscore.FindBestArchiveVideoMatch(item.ArchiveVideoID, item.CleanTitle, item.ComparisonKey)
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
				Matched:               match.FileName != "",
				TitleSource:           match.Source,
				MatchScore:            match.Score,
				Reason:                match.Reason,
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
