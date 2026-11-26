package aegisapi

// Локальные медиа по видам для /api/native/fs/resolve-media (своё окно, без handle'ов браузера).
// Те же правила, что в src/utils/mediaKinds.ts и collectLocalMediaFromHandle
// (src/utils/persistentHandles.ts): вид по суффиксу имени, затем по папке, пара -image/-thumb
// решается по размеру картинки.
//
// Local media by kind for /api/native/fs/resolve-media (native window, no browser handles).
// Same rules as src/utils/mediaKinds.ts and collectLocalMediaFromHandle: kind from the name
// suffix, then the folder; an -image/-thumb pair is decided by the image size.

import (
	"encoding/binary"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// Виды картинок, как MediaKind во фронтенде. / Image kinds, as MediaKind in the frontend.
const (
	MediaBoxart  = "boxart"
	MediaSnap    = "snap"
	MediaTitle   = "title"
	MediaMarquee = "marquee"
	MediaImage   = "image"
)

var MediaKinds = []string{MediaBoxart, MediaSnap, MediaTitle, MediaMarquee, MediaImage}

var mediaSuffixKind = []struct {
	re   *regexp.Regexp
	kind string
}{
	{regexp.MustCompile(`[-_](thumb|thumbnail|boxart|box|box2d|box2dfront|boxfront|cover|front)$`), MediaBoxart},
	{regexp.MustCompile(`[-_](snap|screenshot|screen|ss)$`), MediaSnap},
	{regexp.MustCompile(`[-_](title|titlescreen|sstitle)$`), MediaTitle},
	{regexp.MustCompile(`[-_](marquee|wheel|logo|banner|wheelhd)$`), MediaMarquee},
	{regexp.MustCompile(`[-_](image|mix|mixrbv\d?)$`), MediaImage},
}

var mediaThumbRe = regexp.MustCompile(`[-_](thumb|thumbnail)$`)

var mediaDirKind = map[string]string{
	"boxart": MediaBoxart, "boxarts": MediaBoxart, "named_boxarts": MediaBoxart, "covers": MediaBoxart,
	"cover": MediaBoxart, "box2dfront": MediaBoxart, "box2d": MediaBoxart, "box": MediaBoxart, "boxes": MediaBoxart,
	"boxfront": MediaBoxart, "box-2d": MediaBoxart, "box_2d": MediaBoxart, "box2d-front": MediaBoxart,
	"thumbnails": MediaBoxart,
	"snap":       MediaSnap, "snaps": MediaSnap, "named_snaps": MediaSnap, "screenshots": MediaSnap,
	"screenshot": MediaSnap, "ss": MediaSnap, "snapshots": MediaSnap,
	"titles": MediaTitle, "titlescreen": MediaTitle, "titleshots": MediaTitle, "screenshottitle": MediaTitle,
	"screenshot-title": MediaTitle, "titlescreens": MediaTitle, "named_titles": MediaTitle, "sstitle": MediaTitle,
	"marquee": MediaMarquee, "marquees": MediaMarquee, "wheel": MediaMarquee, "wheels": MediaMarquee,
	"wheelhd": MediaMarquee, "wheel-hd": MediaMarquee, "wheelcarbon": MediaMarquee, "wheel-carbon": MediaMarquee,
	"wheelsteel": MediaMarquee, "wheel-steel": MediaMarquee, "logos": MediaMarquee, "named_logos": MediaMarquee,
	"banners": MediaMarquee,
}

var (
	localImageExts = map[string]bool{".png": true, ".jpg": true, ".jpeg": true, ".webp": true, ".bmp": true}
	localVideoExts = map[string]bool{".mp4": true, ".webm": true}
	stemSuffixRe   = regexp.MustCompile(`(?i)(-image|-marquee|-thumb|-video)$`)
	bracketsRe     = regexp.MustCompile(`\[.*?\]|\(.*?\)`)
)

// ClassifyMediaName: вид по имени файла и папке (суффикс точнее папки).
// Kind from the file name and its folder (the suffix beats the folder).
func ClassifyMediaName(fileName, dirName string) string {
	low := strings.ToLower(strings.TrimSpace(strings.TrimSuffix(fileName, filepath.Ext(fileName))))
	for _, s := range mediaSuffixKind {
		if s.kind != MediaImage && s.re.MatchString(low) {
			return s.kind
		}
	}
	if k, ok := mediaDirKind[strings.ToLower(dirName)]; ok {
		return k
	}
	return MediaImage
}

// stripAnyMediaSuffix: имя без расширения и суффикса вида. / Stem without extension and kind suffix.
func stripAnyMediaSuffix(fileName string) string {
	base := strings.TrimSpace(strings.TrimSuffix(fileName, filepath.Ext(fileName)))
	low := strings.ToLower(base)
	for _, s := range mediaSuffixKind {
		if loc := s.re.FindStringIndex(low); loc != nil {
			return strings.TrimSpace(base[:loc[0]])
		}
	}
	return base
}

// NormalizeMediaKey: как normalizeStemKey во фронтенде. / Same as normalizeStemKey in the frontend.
func NormalizeMediaKey(name string) string {
	s := strings.TrimSuffix(name, filepath.Ext(name))
	s = stemSuffixRe.ReplaceAllString(s, "")
	s = bracketsRe.ReplaceAllString(s, " ")
	var b strings.Builder
	for _, r := range strings.ToLower(s) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || (r >= 'а' && r <= 'я') || r == 'ё' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

type mediaSlot struct {
	kinds map[string]string
	thumb string
}

// LocalMediaIndex: картинки и видео папки библиотеки по ключам имени.
// LocalMediaIndex: images and videos of a library folder by name key.
type LocalMediaIndex struct {
	slots  map[string]*mediaSlot
	videos map[string]string
	// kinds: все виды медиа (gamemedia.go) по имени рома, для фильтра «Медиа».
	// kinds: every media kind (gamemedia.go) by ROM name, for the "Media" filter.
	kinds map[string]map[string]bool
	// readSize читает размер картинки; подменяется в тестах. / Reads an image size; replaced in tests.
	readSize func(path string) (int, int, bool)
}

// IndexLocalMedia обходит root на глубину maxDepth (папки фона, карт и мануалов пропускаются).
// IndexLocalMedia walks root down to maxDepth (fan art, map and manual folders are skipped).
func IndexLocalMedia(root string, maxDepth int) *LocalMediaIndex {
	idx := &LocalMediaIndex{slots: map[string]*mediaSlot{}, videos: map[string]string{}, kinds: map[string]map[string]bool{}, readSize: readImageFileSize}
	root = strings.TrimSpace(root)
	if root == "" {
		return idx
	}
	if st, err := os.Stat(root); err != nil || !st.IsDir() {
		return idx
	}
	root = filepath.Clean(root)
	baseDepth := strings.Count(root, string(filepath.Separator))
	_ = filepath.WalkDir(root, func(p string, d os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return nil
		}
		name := d.Name()
		if d.IsDir() {
			if p == root {
				return nil
			}
			low := strings.ToLower(name)
			// Папки фона, карт и т. п. обходим ради фильтра «Медиа», в обложки они не идут (см. add).
			// Fan art, map etc. folders are walked for the "Media" filter; they never become covers (see add).
			if strings.HasPrefix(name, ".") || low == "_duplicates_1g1r" || low == "_baddumps_junk" ||
				strings.Count(p, string(filepath.Separator))-baseDepth > maxDepth {
				return filepath.SkipDir
			}
			return nil
		}
		idx.add(p)
		return nil
	})
	return idx
}

func (idx *LocalMediaIndex) add(p string) {
	name := filepath.Base(p)
	ext := strings.ToLower(filepath.Ext(name))
	parent := filepath.Dir(p)
	dirPath := filepath.Base(filepath.Dir(parent)) + "/" + filepath.Base(parent)
	if kind, stem := ClassifyGameMedia(name, dirPath); kind != "" {
		if idx.kinds == nil {
			idx.kinds = map[string]map[string]bool{}
		}
		for _, k := range []string{strings.ToLower(stem), GameMediaNameKey(stem)} {
			if k == "" {
				continue
			}
			if idx.kinds[k] == nil {
				idx.kinds[k] = map[string]bool{}
			}
			idx.kinds[k][kind] = true
		}
		if GameMediaNonCoverKinds[kind] {
			return
		}
	}
	if NonCoverMediaDirs[strings.ToLower(filepath.Base(parent))] {
		return
	}
	rawNoExt := strings.ToLower(strings.TrimSuffix(name, filepath.Ext(name)))
	stripped := stemSuffixRe.ReplaceAllString(rawNoExt, "")
	norm := NormalizeMediaKey(name)
	if localVideoExts[ext] {
		for _, k := range []string{rawNoExt, stripped, norm} {
			if k != "" {
				if _, ok := idx.videos[k]; !ok {
					idx.videos[k] = p
				}
			}
		}
		return
	}
	if !localImageExts[ext] {
		return
	}
	dir := filepath.Base(filepath.Dir(p))
	kind := ClassifyMediaName(name, dir)
	isThumb := mediaThumbRe.MatchString(rawNoExt)
	anySuffix := strings.ToLower(stripAnyMediaSuffix(name))
	for _, k := range []string{rawNoExt, stripped, anySuffix, norm} {
		if k == "" {
			continue
		}
		s := idx.slots[k]
		if s == nil {
			s = &mediaSlot{kinds: map[string]string{}}
			idx.slots[k] = s
		}
		if isThumb {
			if s.thumb == "" {
				s.thumb = p
			}
		} else if _, ok := s.kinds[kind]; !ok {
			s.kinds[kind] = p
		}
	}
}

// Lookup: пути картинок по видам и путь видео для ключей имени рома.
// Lookup: image paths by kind and a video path for the ROM name keys.
func (idx *LocalMediaIndex) Lookup(keys []string) (map[string]string, string) {
	out := map[string]string{}
	thumb := ""
	video := ""
	for _, k := range keys {
		if k == "" {
			continue
		}
		if s := idx.slots[k]; s != nil {
			for _, kind := range MediaKinds {
				if _, ok := out[kind]; !ok && s.kinds[kind] != "" {
					out[kind] = s.kinds[kind]
				}
			}
			if thumb == "" {
				thumb = s.thumb
			}
		}
		if video == "" {
			video = idx.videos[k]
		}
	}
	if thumb == "" {
		return out, video
	}
	if out[MediaImage] != "" && out[MediaBoxart] == "" {
		aw, ah, okA := idx.readSize(out[MediaImage])
		bw, bh, okB := idx.readSize(thumb)
		pick := -1
		if okA && okB {
			pick = PickBoxartOfPair(aw, ah, bw, bh)
		}
		switch pick {
		case 0:
			out[MediaBoxart] = out[MediaImage]
			if out[MediaSnap] == "" {
				out[MediaSnap] = thumb
			}
			delete(out, MediaImage)
			return out, video
		case 1:
			out[MediaBoxart] = thumb
			if out[MediaSnap] == "" {
				out[MediaSnap] = out[MediaImage]
			}
			delete(out, MediaImage)
			return out, video
		}
	}
	if out[MediaBoxart] == "" {
		out[MediaBoxart] = thumb
	} else if out[MediaImage] == "" {
		out[MediaImage] = thumb
	}
	return out, video
}

// RomMediaKeys: ключи поиска для рома, как stemKeys во фронтенде.
// RomMediaKeys: lookup keys for a ROM, as stemKeys in the frontend.
func RomMediaKeys(oldFile, cleanFile, title string) []string {
	stem := func(s string) string {
		b := filepath.Base(s)
		return strings.ToLower(strings.TrimSuffix(b, filepath.Ext(b)))
	}
	keys := []string{}
	for _, k := range []string{stem(oldFile), stem(cleanFile), strings.ToLower(title), NormalizeMediaKey(title + ".x"), NormalizeMediaKey(filepath.Base(oldFile))} {
		if k != "" {
			keys = append(keys, k)
		}
	}
	return keys
}

// PreferredCover: картинка для старого поля boxArtUrl, боксарт в первую очередь.
// PreferredCover: the image for the legacy boxArtUrl, box art first.
func PreferredCover(media map[string]string) string {
	for _, k := range []string{MediaBoxart, MediaImage, MediaTitle, MediaSnap, MediaMarquee} {
		if media[k] != "" {
			return media[k]
		}
	}
	return ""
}

// PickBoxartOfPair: какая из двух картинок боксарт (0 или 1), -1 если не понять.
// Боксарт крупнее скриншота, а при близком размере вытянут вверх.
// PickBoxartOfPair: which of two images is box art (0 or 1), -1 when unclear.
func PickBoxartOfPair(aw, ah, bw, bh int) int {
	if aw <= 0 || ah <= 0 || bw <= 0 || bh <= 0 {
		return -1
	}
	areaA, areaB := float64(aw*ah), float64(bw*bh)
	big, small := areaA, areaB
	if small > big {
		big, small = small, big
	}
	if big > small*1.35 {
		if areaA > areaB {
			return 0
		}
		return 1
	}
	ra, rb := float64(ah)/float64(aw), float64(bh)/float64(bw)
	if ra-rb < 0.05 && rb-ra < 0.05 {
		return -1
	}
	if ra > rb {
		return 0
	}
	return 1
}

func readImageFileSize(p string) (int, int, bool) {
	f, err := os.Open(p)
	if err != nil {
		return 0, 0, false
	}
	defer f.Close()
	head := make([]byte, 65536)
	n, _ := io.ReadFull(f, head)
	return ImageSizeFromBytes(head[:n])
}

// ImageSizeFromBytes: размер по заголовку PNG, JPEG, WebP, BMP без декодирования.
// ImageSizeFromBytes: size from a PNG, JPEG, WebP or BMP header, without decoding.
func ImageSizeFromBytes(b []byte) (int, int, bool) {
	if len(b) < 26 {
		return 0, 0, false
	}
	be16 := func(i int) int { return int(binary.BigEndian.Uint16(b[i:])) }
	le16 := func(i int) int { return int(binary.LittleEndian.Uint16(b[i:])) }
	switch {
	case b[0] == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G':
		return int(binary.BigEndian.Uint32(b[16:])), int(binary.BigEndian.Uint32(b[20:])), true
	case b[0] == 'B' && b[1] == 'M':
		w, h := int(int32(binary.LittleEndian.Uint32(b[18:]))), int(int32(binary.LittleEndian.Uint32(b[22:])))
		if w < 0 {
			w = -w
		}
		if h < 0 {
			h = -h
		}
		return w, h, true
	case string(b[0:4]) == "RIFF" && string(b[8:12]) == "WEBP":
		switch string(b[12:16]) {
		case "VP8X":
			if len(b) >= 30 {
				w := 1 + (int(b[24]) | int(b[25])<<8 | int(b[26])<<16)
				h := 1 + (int(b[27]) | int(b[28])<<8 | int(b[29])<<16)
				return w, h, true
			}
		case "VP8 ":
			if len(b) >= 30 {
				return le16(26) & 0x3fff, le16(28) & 0x3fff, true
			}
		case "VP8L":
			bits := uint32(b[21]) | uint32(b[22])<<8 | uint32(b[23])<<16 | uint32(b[24])<<24
			return int(bits&0x3fff) + 1, int((bits>>14)&0x3fff) + 1, true
		}
		return 0, 0, false
	case b[0] == 0xff && b[1] == 0xd8:
		i := 2
		for i+9 < len(b) {
			if b[i] != 0xff {
				i++
				continue
			}
			m := b[i+1]
			if m == 0xd8 || m == 0x01 || (m >= 0xd0 && m <= 0xd7) || m == 0xff {
				if m == 0xff {
					i++
				} else {
					i += 2
				}
				continue
			}
			if m >= 0xc0 && m <= 0xcf && m != 0xc4 && m != 0xc8 && m != 0xcc {
				return be16(i + 7), be16(i + 5), true
			}
			i += 2 + be16(i+2)
		}
	}
	return 0, 0, false
}

// ResolveMediaItem: строка базы, для которой ищем медиа. / A database row to find media for.
type ResolveMediaItem struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	CleanFile string `json:"cleanFile"`
	OldFile   string `json:"oldFile"`
}

// ResolvedMedia: ответ для одной строки. media — ссылки по видам, boxArtUrl — боксарт в первую очередь.
// ResolvedMedia: the answer for one row. media holds URLs by kind, boxArtUrl prefers box art.
type ResolvedMedia struct {
	ID        string            `json:"id"`
	BoxArtURL string            `json:"boxArtUrl"`
	VideoURL  string            `json:"videoUrl"`
	Media     map[string]string `json:"media,omitempty"`
	// Kinds: виды медиа игры для фильтра «Медиа». / The game's media kinds for the "Media" filter.
	Kinds []string `json:"kinds,omitempty"`
}

// MediaKindsOf: виды медиа по ключам имени рома. / Media kinds for the ROM name keys.
func (idx *LocalMediaIndex) MediaKindsOf(names []string) []string {
	set := map[string]bool{}
	for _, n := range names {
		for _, k := range []string{strings.ToLower(n), GameMediaNameKey(n)} {
			for kind := range idx.kinds[k] {
				set[kind] = true
			}
		}
	}
	out := make([]string, 0, len(set))
	for k := range set {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// ResolveLocalMedia ищет медиа строк в папке библиотеки; ссылки ведут на urlPrefix + путь.
// ResolveLocalMedia finds media for rows in the library folder; URLs are urlPrefix + escaped path.
func ResolveLocalMedia(libraryPath string, items []ResolveMediaItem, urlPrefix string) []ResolvedMedia {
	idx := IndexLocalMedia(libraryPath, 5)
	link := func(p string) string {
		if p == "" {
			return ""
		}
		return urlPrefix + url.QueryEscape(p)
	}
	out := make([]ResolvedMedia, 0, len(items))
	for _, it := range items {
		paths, video := idx.Lookup(RomMediaKeys(it.OldFile, it.CleanFile, it.Title))
		res := ResolvedMedia{ID: it.ID, VideoURL: link(video), BoxArtURL: link(PreferredCover(paths))}
		stemOf := func(s string) string {
			b := filepath.Base(s)
			return strings.TrimSuffix(b, filepath.Ext(b))
		}
		res.Kinds = idx.MediaKindsOf([]string{stemOf(it.OldFile), stemOf(it.CleanFile), it.Title})
		if len(paths) > 0 {
			res.Media = map[string]string{}
			for k, p := range paths {
				res.Media[k] = link(p)
			}
		}
		out = append(out, res)
	}
	return out
}
