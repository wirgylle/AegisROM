package aegisapi

// Все медиа одной игры для галереи в карточке (десктоп, без handle'ов браузера).
// Тот же словарь видов, что src/utils/gameMediaKinds.ts: папки Skraper media/<вид>/ и раскладка
// проекта images/<ром>-fanart.png и т. п.
//
// GET /api/native/fs/game-media?consoleCode=&romFileName=&relativePath=&libraryPath=&sdCardPath=
//   → {"ok":true,"items":[{"kind":"fanart","name":"…","size":123,"url":"/api/native/fs/game-media/file?…&rel=…"}]}
// GET|HEAD /api/native/fs/game-media/file?…&rel=<путь от папки консоли>
//   отдаёт файл, только если это медиа этого рома внутри папки рома или уровнем выше.
//
// All media of one game for the gallery in the game card (desktop, no browser handles).
// Same kind dictionary as src/utils/gameMediaKinds.ts.

import (
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

var gameMediaDirKind = map[string]string{
	"boxart": "boxart", "boxarts": "boxart", "named_boxarts": "boxart", "covers": "boxart", "cover": "boxart",
	"box2dfront": "boxart", "box2d-front": "boxart", "box2d": "boxart", "box-2d": "boxart", "box_2d": "boxart",
	"box": "boxart", "boxes": "boxart", "boxfront": "boxart", "thumbnails": "boxart",
	"box3d": "box3d", "box-3d": "box3d", "box_3d": "box3d", "boxes3d": "box3d", "3dboxes": "box3d",
	"boxback": "boxback", "boxbacks": "boxback", "box-back": "boxback", "box2dback": "boxback",
	"images": "image", "image": "image", "mix": "image", "mixrbv1": "image", "mixrbv2": "image", "miximages": "image",
	"snap": "snap", "snaps": "snap", "named_snaps": "snap", "screenshot": "snap", "screenshots": "snap",
	"snapshots": "snap", "ss": "snap",
	"titles": "title", "titlescreen": "title", "titlescreens": "title", "titleshots": "title",
	"screenshottitle": "title", "screenshot-title": "title", "named_titles": "title", "sstitle": "title",
	"marquee": "marquee", "marquees": "marquee", "wheel": "marquee", "wheels": "marquee", "wheelhd": "marquee",
	"wheel-hd": "marquee", "wheelcarbon": "marquee", "wheel-carbon": "marquee", "wheelsteel": "marquee",
	"wheel-steel": "marquee", "logos": "marquee", "named_logos": "marquee", "banners": "marquee",
	"screenmarquee": "screenmarquee", "screenmarquees": "screenmarquee", "screenmarqueesmall": "screenmarquee",
	"steamgrid": "steamgrid", "steamgrids": "steamgrid",
	"fanart": "fanart", "fanarts": "fanart", "backgrounds": "fanart",
	"support": "support", "supports": "support", "cartridge": "support", "cartridges": "support", "carts": "support",
	"physicalmedia":  "support",
	"supporttexture": "supporttexture", "supporttextures": "supporttexture", "support-texture": "supporttexture",
	"maps": "map", "map": "map",
	"bezel": "bezel", "bezels": "bezel",
	"videos": "video", "video": "video", "snapvideos": "video", "video-snaps": "video",
	"manuals": "manual", "manual": "manual", "docs": "manual",
	"tipsandtricks": "tips", "tips-and-tricks": "tips", "tips": "tips",
}

var gameMediaSuffix = []struct {
	re   *regexp.Regexp
	kind string
}{
	{regexp.MustCompile(`(?i)[-_](supporttexture)$`), "supporttexture"},
	{regexp.MustCompile(`(?i)[-_](screenmarquee)$`), "screenmarquee"},
	{regexp.MustCompile(`(?i)[-_](steamgrid)$`), "steamgrid"},
	{regexp.MustCompile(`(?i)[-_](fanart)$`), "fanart"},
	{regexp.MustCompile(`(?i)[-_](cartridge|support)$`), "support"},
	{regexp.MustCompile(`(?i)[-_](boxback|box2dback)$`), "boxback"},
	{regexp.MustCompile(`(?i)[-_](box3d)$`), "box3d"},
	{regexp.MustCompile(`(?i)[-_](map|maps)$`), "map"},
	{regexp.MustCompile(`(?i)[-_](bezel)$`), "bezel"},
	{regexp.MustCompile(`(?i)[-_](tips|tipsandtricks)$`), "tips"},
	{regexp.MustCompile(`(?i)[-_ ](manual)$`), "manual"},
	{regexp.MustCompile(`(?i)[-_](video|snapvideo)$`), "video"},
	{regexp.MustCompile(`(?i)[-_](marquee|wheel|logo|wheelhd)$`), "marquee"},
	{regexp.MustCompile(`(?i)[-_](title|titleshot|titlescreen)$`), "title"},
	{regexp.MustCompile(`(?i)[-_](mix|mixrbv\d?)$`), "image"},
	{regexp.MustCompile(`(?i)[-_](thumb|snap|screenshot|ss)$`), "snap"},
	{regexp.MustCompile(`(?i)[-_](image|boxart|box|cover|box2d)$`), "boxart"},
}

// GameMediaNonCoverKinds: виды, которые не обложки. / Kinds that are not covers.
var GameMediaNonCoverKinds = map[string]bool{
	"boxback": true, "screenmarquee": true, "steamgrid": true, "fanart": true, "support": true,
	"supporttexture": true, "map": true, "bezel": true, "manual": true, "tips": true,
}

var (
	gmImageExts = map[string]bool{".png": true, ".jpg": true, ".jpeg": true, ".webp": true, ".bmp": true, ".gif": true}
	gmVideoExts = map[string]bool{".mp4": true, ".webm": true, ".mkv": true, ".avi": true, ".mov": true, ".m4v": true}
	gmLayout    = map[string]bool{"images": true, "marquees": true, "videos": true, "manuals": true}
	gmContainer = map[string]bool{"media": true, "downloaded_media": true}
	gmKeyBrack  = regexp.MustCompile(`\[.*?\]|\(.*?\)`)
)

func gmExtFits(kind, ext string) bool {
	switch kind {
	case "video":
		return gmVideoExts[ext]
	case "manual":
		return ext == ".pdf"
	case "map":
		return gmImageExts[ext] || ext == ".pdf"
	case "tips":
		return gmImageExts[ext] || ext == ".pdf" || ext == ".txt"
	}
	return gmImageExts[ext]
}

// ClassifyGameMedia: вид и имя рома по имени файла и пути папки (как classifyGameMediaFile в TS).
// Пустой вид — не медиа. / Kind and ROM stem from a file name and folder path; empty kind: not media.
func ClassifyGameMedia(fileName, dirPath string) (kind, stem string) {
	ext := strings.ToLower(filepath.Ext(fileName))
	if ext == "" {
		return "", ""
	}
	base := strings.TrimSpace(strings.TrimSuffix(fileName, filepath.Ext(fileName)))
	parts := strings.FieldsFunc(strings.ToLower(dirPath), func(r rune) bool { return r == '/' || r == '\\' })
	dir := ""
	if len(parts) > 0 {
		dir = parts[len(parts)-1]
	}
	inContainer := len(parts) >= 2 && gmContainer[parts[len(parts)-2]]
	layout := gmLayout[dir] && !inContainer
	bySuffix, suffixStem := "", base
	for _, s := range gameMediaSuffix {
		if loc := s.re.FindStringIndex(base); loc != nil {
			bySuffix = s.kind
			suffixStem = strings.TrimSpace(base[:loc[0]])
			break
		}
	}
	byDir := gameMediaDirKind[dir]
	stem = base
	switch {
	case byDir != "" && !layout && !(byDir == "image" && bySuffix != ""):
		kind = byDir
		if bySuffix == byDir {
			stem = suffixStem
		}
	case bySuffix != "":
		kind, stem = bySuffix, suffixStem
	case layout && dir == "videos" && gmVideoExts[ext]:
		kind = "video"
	case layout && dir == "manuals" && ext == ".pdf":
		kind = "manual"
	case layout && dir == "images" && gmImageExts[ext]:
		kind = "boxart"
	case layout && dir == "marquees" && gmImageExts[ext]:
		kind = "marquee"
	}
	if kind == "" || stem == "" || !gmExtFits(kind, ext) {
		return "", ""
	}
	return kind, stem
}

// GameMediaNameKey: ключ сравнения имён без скобок, знаков и регистра. / Name key without brackets and punctuation.
func GameMediaNameKey(name string) string {
	s := gmKeyBrack.ReplaceAllString(name, " ")
	var b strings.Builder
	for _, r := range strings.ToLower(s) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || (r >= 'а' && r <= 'я') || r == 'ё' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func gmStemMatches(stem string, romStems []string) bool {
	low := strings.ToLower(strings.TrimSpace(stem))
	if low == "" {
		return false
	}
	k := GameMediaNameKey(stem)
	allDigits := k != "" && strings.Trim(k, "0123456789") == ""
	for _, s := range romStems {
		if strings.ToLower(strings.TrimSpace(s)) == low {
			return true
		}
		if k != "" && !allDigits && GameMediaNameKey(s) == k {
			return true
		}
	}
	return false
}

// GameMediaFile: найденный файл. Rel — путь от Base (папка консоли или папка рома).
// GameMediaFile: a found file. Rel is the path from Base (the console or ROM folder).
type GameMediaFile struct {
	Kind string `json:"kind"`
	Name string `json:"name"`
	Size int64  `json:"size"`
	Rel  string `json:"rel"`
	Base string `json:"-"`
}

// gameMediaBases: папка рома и уровнем выше (многодисковая игра в своей папке), и имена рома.
// The ROM folder and one level up (a multi-disc game in its own folder), and the ROM names.
func gameMediaBases(romPath string) ([]string, []string) {
	dir := filepath.Dir(romPath)
	stem := strings.TrimSuffix(filepath.Base(romPath), filepath.Ext(romPath))
	return []string{dir, filepath.Dir(dir)}, []string{stem, filepath.Base(dir)}
}

// ListGameMedia ищет медиа рома в раскладке проекта и в media/<вид>/ рядом с ромом и уровнем выше.
// ListGameMedia finds a ROM's media in the project layout and media/<kind>/ next to it and one level up.
func ListGameMedia(romPath string) []GameMediaFile {
	bases, stems := gameMediaBases(romPath)
	out := []GameMediaFile{}
	seen := map[string]bool{}
	for _, base := range bases {
		dirs := []string{"images", "marquees", "videos", "manuals"}
		for c := range gmContainer {
			entries, err := os.ReadDir(filepath.Join(base, c))
			if err != nil {
				continue
			}
			for _, e := range entries {
				if e.IsDir() {
					dirs = append(dirs, c+"/"+e.Name())
				}
			}
		}
		for _, rel := range dirs {
			entries, err := os.ReadDir(filepath.Join(base, filepath.FromSlash(rel)))
			if err != nil {
				continue
			}
			for _, e := range entries {
				if e.IsDir() || strings.HasPrefix(e.Name(), ".") {
					continue
				}
				kind, stem := ClassifyGameMedia(e.Name(), rel)
				if kind == "" || !gmStemMatches(stem, stems) {
					continue
				}
				full := filepath.Join(base, filepath.FromSlash(rel), e.Name())
				if seen[strings.ToLower(full)] {
					continue
				}
				seen[strings.ToLower(full)] = true
				var size int64
				if info, err := e.Info(); err == nil {
					size = info.Size()
				}
				out = append(out, GameMediaFile{Kind: kind, Name: e.Name(), Size: size, Rel: rel + "/" + e.Name(), Base: base})
			}
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Kind != out[j].Kind {
			return out[i].Kind < out[j].Kind
		}
		return out[i].Rel < out[j].Rel
	})
	return out
}

func findRomForQuery(q url.Values) string {
	for _, c := range RomPathCandidates(q.Get("consoleCode"), q.Get("romFileName"), q.Get("relativePath"), q.Get("libraryPath"), q.Get("sdCardPath")) {
		if st, err := os.Stat(c); err == nil && !st.IsDir() {
			return c
		}
	}
	return ""
}

func gmContentType(ext string) string {
	switch ext {
	case ".pdf":
		return "application/pdf"
	case ".txt":
		return "text/plain; charset=utf-8"
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".webp":
		return "image/webp"
	case ".gif":
		return "image/gif"
	case ".bmp":
		return "image/bmp"
	case ".mp4", ".m4v":
		return "video/mp4"
	case ".webm":
		return "video/webm"
	}
	return "application/octet-stream"
}

// RegisterGameMediaRoutes adds /api/native/fs/game-media and /api/native/fs/game-media/file.
func RegisterGameMediaRoutes(mux *http.ServeMux, touch func()) {
	if touch == nil {
		touch = func() {}
	}
	romQuery := func(q url.Values) url.Values {
		out := url.Values{}
		for _, k := range []string{"consoleCode", "romFileName", "relativePath", "libraryPath", "sdCardPath"} {
			out.Set(k, q.Get(k))
		}
		return out
	}
	mux.HandleFunc("/api/native/fs/game-media", func(w http.ResponseWriter, r *http.Request) {
		touch()
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		rom := findRomForQuery(r.URL.Query())
		if rom == "" {
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"ok": false, "items": []interface{}{}})
			return
		}
		type item struct {
			Kind string `json:"kind"`
			Name string `json:"name"`
			Size int64  `json:"size"`
			URL  string `json:"url"`
		}
		items := []item{}
		bases, _ := gameMediaBases(rom)
		for _, f := range ListGameMedia(rom) {
			q := romQuery(r.URL.Query())
			q.Set("rel", f.Rel)
			if f.Base != bases[0] {
				q.Set("up", "1")
			}
			items = append(items, item{Kind: f.Kind, Name: f.Name, Size: f.Size, URL: "/api/native/fs/game-media/file?" + q.Encode()})
		}
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "items": items})
	})
	mux.HandleFunc("/api/native/fs/game-media/file", func(w http.ResponseWriter, r *http.Request) {
		touch()
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		q := r.URL.Query()
		rom := findRomForQuery(q)
		if rom == "" {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		bases, stems := gameMediaBases(rom)
		base := bases[0]
		if q.Get("up") == "1" {
			base = bases[1]
		}
		rel := filepath.FromSlash(strings.ReplaceAll(q.Get("rel"), "\\", "/"))
		if rel == "" || filepath.IsAbs(rel) {
			http.Error(w, "bad path", http.StatusBadRequest)
			return
		}
		full := filepath.Join(base, rel)
		if rr, err := filepath.Rel(base, full); err != nil || strings.HasPrefix(rr, "..") {
			http.Error(w, "bad path", http.StatusBadRequest)
			return
		}
		// Отдаём только медиа этого рома. / Only this ROM's media is served.
		kind, stem := ClassifyGameMedia(filepath.Base(full), filepath.ToSlash(filepath.Dir(rel)))
		if kind == "" || !gmStemMatches(stem, stems) {
			http.Error(w, "not media", http.StatusForbidden)
			return
		}
		if st, err := os.Stat(full); err != nil || st.IsDir() {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", gmContentType(strings.ToLower(filepath.Ext(full))))
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")
		http.ServeFile(w, r, full)
	})
}
