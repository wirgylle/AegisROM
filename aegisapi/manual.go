package aegisapi

import (
	"encoding/xml"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

// Мануалы игр (PDF), которые скачивает Skraper и другие скрапперы.
// Game manuals (PDF) downloaded by Skraper and other scrapers.
//
// GET|HEAD /api/native/fs/manual?consoleCode=&romFileName=&relativePath=&libraryPath=&sdCardPath=&manualRel=
// Ром ищется так же, как для «Запуска» (RomPathCandidates). Мануал берётся из manualRel (путь от папки
// скана, который нашёл скан), из тега <manual> в gamelist.xml рядом с ромом или по имени рома в
// manuals/, media/manuals/ (раскладка Skraper) рядом с ромом и уровнем выше. Отдаются только PDF.
// The ROM is found like for Play. The manual comes from manualRel (found by the scan), the <manual>
// tag of gamelist.xml next to the ROM, or the ROM name in manuals/ or media/manuals/ next to the ROM
// and one level up. Only PDFs are served.

// ManualMaxBytes: больше мануалы не отдаём. / Larger manuals are not served.
const ManualMaxBytes = 512 << 20

// ManualSearchDirs: папки мануалов относительно папки рома. / Manual folders relative to the ROM folder.
var ManualSearchDirs = []string{"manuals", "media/manuals", "manual", "media/manual", "downloaded_media/manuals"}

func isManualExt(p string) bool {
	return strings.EqualFold(filepath.Ext(p), ".pdf")
}

func isFile(p string) bool {
	st, err := os.Stat(p)
	return err == nil && !st.IsDir() && st.Size() <= ManualMaxBytes
}

type gamelistManualDoc struct {
	Games []struct {
		Path   string `xml:"path"`
		Manual string `xml:"manual"`
	} `xml:"game"`
}

// gamelistManual returns the <manual> path of romPath from the gamelist.xml next to it.
// The path must stay inside the gamelist folder.
func gamelistManual(romPath string) string {
	dir := filepath.Dir(romPath)
	glPath := filepath.Join(dir, "gamelist.xml")
	st, err := os.Stat(glPath)
	if err != nil || st.IsDir() || st.Size() > 64<<20 {
		return ""
	}
	data, err := os.ReadFile(glPath)
	if err != nil {
		return ""
	}
	var doc gamelistManualDoc
	if xml.Unmarshal(data, &doc) != nil {
		return ""
	}
	base := strings.ToLower(filepath.Base(romPath))
	for _, g := range doc.Games {
		if g.Manual == "" {
			continue
		}
		gp := strings.ReplaceAll(strings.TrimSpace(g.Path), "\\", "/")
		if strings.ToLower(filepath.Base(filepath.FromSlash(gp))) != base {
			continue
		}
		rel := filepath.FromSlash(strings.ReplaceAll(strings.TrimSpace(g.Manual), "\\", "/"))
		if filepath.IsAbs(rel) {
			return ""
		}
		p := filepath.Join(dir, rel)
		if r, err := filepath.Rel(dir, p); err != nil || strings.HasPrefix(r, "..") {
			return ""
		}
		return p
	}
	return ""
}

// manualNearRom looks for <stem>.pdf / <stem>-manual.pdf in the manual folders next to the ROM
// and one level up (a multi-disc game folder sits inside the console folder).
func manualNearRom(romPath string) string {
	ext := filepath.Ext(romPath)
	stem := strings.TrimSuffix(filepath.Base(romPath), ext)
	dir := filepath.Dir(romPath)
	stems := []string{stem}
	parentStem := filepath.Base(dir)
	for _, base := range []string{dir, filepath.Dir(dir)} {
		for _, sub := range ManualSearchDirs {
			folder := filepath.Join(base, filepath.FromSlash(sub))
			for _, s := range append(stems, parentStem) {
				for _, name := range []string{s + ".pdf", s + "-manual.pdf", s + "_manual.pdf"} {
					p := filepath.Join(folder, name)
					if isFile(p) {
						return p
					}
				}
			}
		}
	}
	return ""
}

// ResolveManual finds the manual file for a request. It returns the path, or an HTTP status.
func ResolveManual(q url.Values) (string, int) {
	if rel := strings.TrimSpace(q.Get("manualRel")); rel != "" && isManualExt(rel) {
		for _, c := range RomPathCandidates(q.Get("consoleCode"), "", rel, q.Get("libraryPath"), q.Get("sdCardPath")) {
			if isManualExt(c) && isFile(c) {
				return c, http.StatusOK
			}
		}
	}
	for _, c := range RomPathCandidates(q.Get("consoleCode"), q.Get("romFileName"), q.Get("relativePath"), q.Get("libraryPath"), q.Get("sdCardPath")) {
		st, err := os.Stat(c)
		if err != nil || st.IsDir() {
			continue
		}
		if p := gamelistManual(c); p != "" && isManualExt(p) && isFile(p) {
			return p, http.StatusOK
		}
		if p := manualNearRom(c); p != "" {
			return p, http.StatusOK
		}
		return "", http.StatusNotFound
	}
	return "", http.StatusNotFound
}

// RegisterManualRoutes adds GET|HEAD /api/native/fs/manual.
func RegisterManualRoutes(mux *http.ServeMux, touch func()) {
	if touch == nil {
		touch = func() {}
	}
	mux.HandleFunc("/api/native/fs/manual", func(w http.ResponseWriter, r *http.Request) {
		touch()
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		path, status := ResolveManual(r.URL.Query())
		if status != http.StatusOK {
			http.Error(w, http.StatusText(status), status)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Content-Type", "application/pdf")
		w.Header().Set("X-Aegis-Manual-Name", url.PathEscape(filepath.Base(path)))
		w.Header().Set("Content-Disposition", "inline")
		http.ServeFile(w, r, path)
	})
}
