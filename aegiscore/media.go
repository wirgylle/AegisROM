package aegiscore

import (
	"fmt"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func RenameCompanionCueBin(romDir, oldBase, newBase, ext string) (oldCompanionPath string, newCompanionPath string) {
	if strings.EqualFold(ext, ".bin") {
		oldCue := filepath.Join(romDir, oldBase+".cue")
		newCue := filepath.Join(romDir, newBase+".cue")
		if cueData, err := os.ReadFile(oldCue); err == nil {
			updatedCue := strings.ReplaceAll(string(cueData), oldBase+".bin", newBase+".bin")
			updatedCue = strings.ReplaceAll(updatedCue, oldBase+".BIN", newBase+".bin")
			_ = os.WriteFile(newCue, []byte(updatedCue), 0644)
			if !strings.EqualFold(oldCue, newCue) {
				_ = os.Remove(oldCue)
			}
			return oldCue, newCue
		}
	} else if strings.EqualFold(ext, ".cue") {
		oldBin := filepath.Join(romDir, oldBase+".bin")
		newBin := filepath.Join(romDir, newBase+".bin")
		if _, err := os.Stat(oldBin); err == nil {
			_ = os.Rename(oldBin, newBin)
			newCue := filepath.Join(romDir, newBase+".cue")
			if cueData, err := os.ReadFile(newCue); err == nil {
				updatedCue := strings.ReplaceAll(string(cueData), oldBase+".bin", newBase+".bin")
				updatedCue = strings.ReplaceAll(updatedCue, oldBase+".BIN", newBase+".bin")
				_ = os.WriteFile(newCue, []byte(updatedCue), 0644)
			}
			return oldBin, newBin
		}
	}
	return "", ""
}

var standardMediaDirs = map[string]bool{
	"images":   true,
	"marquees": true,
	"videos":   true,
}

// Critical R36S (ArkOS / DarkOS / EmuELEC) system & console folders on EASYROMS that MUST NEVER be deleted!
var protectedR36SDirs = map[string]bool{
	"bios": true, "tools": true, "themes": true, "ports": true,
	"launchimages": true, "bgmusic": true, "retroarch": true,
	"saves": true, "savestates": true, "backup": true, "backups": true,
	"anbernic": true, "arkos": true, "darkos": true, "emuelec": true,
	"system": true, "config": true, "cheats": true, "overlays": true,
	"shaders": true, "bezels": true, "music": true, "movies": true,
	"kodi": true, "scummvm": true, "dos": true, "pico8": true, "pico-8": true,
	"tic80": true, "openbor": true, "easyrpg": true, "solarushd": true,
	"nes": true, "famicom": true, "fc": true, "fds": true,
	"snes": true, "sfc": true, "superfamicom": true,
	"gb": true, "gbc": true, "gba": true, "nds": true, "n64": true,
	"virtualboy": true, "gamegear": true, "gg": true,
	"mastersystem": true, "sms": true, "genesis": true, "megadrive": true, "md": true,
	"segacd": true, "mega-cd": true, "sega32x": true, "32x": true,
	"saturn": true, "dreamcast": true, "dc": true,
	"psx": true, "ps1": true, "psp": true,
	"atari2600": true, "atari5200": true, "atari7800": true, "lynx": true, "jaguar": true,
	"pcengine": true, "pce": true, "pcenginecd": true, "tg16": true, "supergrafx": true,
	"neogeo": true, "neogeocd": true, "ngp": true, "ngpc": true,
	"wonderswan": true, "wonderswancolor": true,
	"arcade": true, "fbneo": true, "mame": true, "mame2003": true, "mame2003-plus": true,
	"cps1": true, "cps2": true, "cps3": true,
	"amiga": true, "c64": true, "msx": true, "msx2": true,
	"vectrex": true, "coleco": true, "intellivision": true, "zxspectrum": true,
}

var knownPhantomDirReasons = map[string]string{
	"download_images":   "Фантомный дубликат (верный каталог R36S — «images», этот не нужен)",
	"downloaded_images": "Фантомный каталог старого скрепера (верный каталог — «images»)",
	"downloaded_media":  "Лишний каталог стороннего скрепера (не используется ArkOS/DarkOS)",
	"media":             "Нестандартная папка (ArkOS/DarkOS берет обложки из «images»)",
	"boxart":            "Дублирующая папка обложек (верная папка — «images»)",
	"boxarts":           "Дублирующая папка обложек (верная папка — «images»)",
	"snap":              "Старая папка скриншотов (не используется в gamelist.xml)",
	"snaps":             "Старая папка скриншотов (не используется в gamelist.xml)",
	"wheel":             "Старая папка логотипов (в R36S используется «marquees»)",
	"wheels":            "Старая папка логотипов (в R36S используется «marquees»)",
	"banners":           "Нестандартная папка баннеров (в R36S используется «marquees»)",
	"mix":               "Временная папка миксов скрепера (не нужна)",
	"manuals":           "Папка PDF-мануалов (занимает место на флешке)",
	"covers":            "Нестандартная папка обложек (верная папка — «images»)",
	"screenshots":       "Лишняя папка скриншотов (верная папка — «images»)",
	"temp":              "Временная папка",
	"tmp":               "Временная папка",
	"top 100":           "Вложенная подпапка ромов (ромы должны быть в основном каталоге)",
	"top100":            "Вложенная подпапка ромов (ромы должны быть в основном каталоге)",
	"rus":               "Вложенная подпапка ромов (ромы должны быть в основном каталоге)",
}

func ScanForPhantomFolders(rootFolder string) []PhantomFolderItem {
	var found []PhantomFolderItem

	_ = filepath.Walk(rootFolder, func(p string, fi os.FileInfo, err error) error {
		if err != nil || !fi.IsDir() {
			return nil
		}
		if filepath.Clean(p) == filepath.Clean(rootFolder) {
			return nil
		}

		name := fi.Name()
		lower := strings.ToLower(name)

		if strings.HasPrefix(name, ".") || name == "$RECYCLE.BIN" || name == "System Volume Information" {
			return filepath.SkipDir
		}

		// Skip the 3 official valid R36S media directories!
		if standardMediaDirs[lower] {
			return filepath.SkipDir
		}

		// Never touch protected R36S system or console directories (bios, tools, ports, themes, gba, psx, etc.)!
		if protectedR36SDirs[lower] {
			return nil
		}
		if _, isConsole := ConsoleCatalog[lower]; isConsole {
			return nil
		}
		if lower == "organized" || strings.HasPrefix(lower, "1_8bit") || strings.HasPrefix(lower, "2_16bit") || strings.HasPrefix(lower, "3_portable") || strings.HasPrefix(lower, "4_32_64bit") {
			return nil
		}

		// Calculate files & bytes inside this candidate subfolder
		fileCount := 0
		var totalBytes int64
		hasRom := false
		hasMedia := false

		entries, readErr := os.ReadDir(p)
		if readErr == nil {
			for _, e := range entries {
				if !e.IsDir() {
					fileCount++
					if info, sErr := e.Info(); sErr == nil {
						totalBytes += info.Size()
					}
					ext := strings.ToLower(filepath.Ext(e.Name()))
					if _, ok := ExtToDefaultConsole[ext]; ok || ext == ".zip" {
						hasRom = true
					}
					if ext == ".png" || ext == ".jpg" || ext == ".mp4" {
						hasMedia = true
					}
				}
			}
		}

		rel, relErr := filepath.Rel(rootFolder, p)
		if relErr != nil {
			rel = p
		}

		if reason, isKnownPhantom := knownPhantomDirReasons[lower]; isKnownPhantom {
			found = append(found, PhantomFolderItem{
				FullPath:       p,
				RelativePath:   rel,
				FolderName:     name,
				Reason:         reason,
				FileCount:      fileCount,
				TotalBytes:     totalBytes,
				HasUsefulMedia: hasMedia,
				DefaultChecked: !hasRom, // Auto-check if no unextracted ROMs inside
			})
			return filepath.SkipDir
		}

		if lower == "_duplicates_1g1r" || lower == "_baddumps_junk" {
			found = append(found, PhantomFolderItem{
				FullPath:       p,
				RelativePath:   rel,
				FolderName:     name,
				Reason:         "Карантин отсеянных дубликатов и битых ромов (можно очистить)",
				FileCount:      fileCount,
				TotalBytes:     totalBytes,
				HasUsefulMedia: false,
				DefaultChecked: true,
			})
			return filepath.SkipDir
		}

		// Only flag empty folders if they are subfolders inside a console directory and NOT root EASYROMS folders
		parentBase := strings.ToLower(filepath.Base(filepath.Dir(p)))
		_, parentIsConsole := ConsoleCatalog[parentBase]
		if len(entries) == 0 && parentIsConsole && !protectedR36SDirs[lower] {
			found = append(found, PhantomFolderItem{
				FullPath:       p,
				RelativePath:   rel,
				FolderName:     name,
				Reason:         "Пустая вложенная подпапка (0 файлов)",
				FileCount:      0,
				TotalBytes:     0,
				HasUsefulMedia: false,
				DefaultChecked: true,
			})
			return filepath.SkipDir
		}

		// Any other non-standard subfolder inside a console folder
		if parentIsConsole {
			reason := "Нестандартная подпапка внутри каталога консоли"
			if hasRom {
				reason = "Подпапка с ромами (нажмите кнопку 2, чтобы вытащить ромы в корень консоли)"
			}
			found = append(found, PhantomFolderItem{
				FullPath:       p,
				RelativePath:   rel,
				FolderName:     name,
				Reason:         reason,
				FileCount:      fileCount,
				TotalBytes:     totalBytes,
				HasUsefulMedia: hasMedia,
				DefaultChecked: !hasRom,
			})
			return filepath.SkipDir
		}

		return nil
	})

	return found
}

// Resolve actual existing media files on disk for a ROM so gamelist.xml NEVER points to non-existent -image.png/-thumb.png files!
func ResolveExistingMediaPathsForRom(consoleDir, baseNoExt, cleanTitle string) (imgRel, thumbRel, marqueeRel, videoRel string) {
	if consoleDir == "" {
		return "", "", "", ""
	}

	checkRelFile := func(rel string) string {
		rel = strings.TrimSpace(rel)
		if rel == "" {
			return ""
		}
		cleanRel := strings.TrimPrefix(strings.ReplaceAll(rel, "\\", "/"), "./")
		cleanRel = strings.TrimPrefix(cleanRel, "/")
		fullPath := filepath.Join(consoleDir, filepath.FromSlash(cleanRel))
		if fi, err := os.Stat(fullPath); err == nil && !fi.IsDir() && fi.Size() > 0 {
			return "./" + cleanRel
		}
		return ""
	}

	// 1. Check if gamelist.xml (or backup) already has valid existing paths for this ROM
	_, entryMap := loadGamelistMapsForDir(consoleDir)
	for _, keyCandidate := range []string{strings.ToLower(baseNoExt), strings.ToLower(cleanTitle), strings.ToLower(SanitizeFileName(cleanTitle))} {
		if keyCandidate == "" {
			continue
		}
		if ge, ok := entryMap[keyCandidate]; ok {
			if imgRel == "" {
				imgRel = checkRelFile(ge.Image)
			}
			if thumbRel == "" {
				thumbRel = checkRelFile(ge.Thumbnail)
			}
			if marqueeRel == "" {
				marqueeRel = checkRelFile(ge.Marquee)
			}
			if videoRel == "" {
				videoRel = checkRelFile(ge.Video)
			}
		}
	}

	// 2. Probe candidate base names (current ROM base, sanitized title, stripped numeric prefix)
	var candidateBases []string
	seenBase := make(map[string]bool)
	addCandidate := func(b string) {
		b = strings.TrimSpace(b)
		if b == "" {
			return
		}
		low := strings.ToLower(b)
		if !seenBase[low] {
			seenBase[low] = true
			candidateBases = append(candidateBases, b)
		}
	}
	addCandidate(baseNoExt)
	if cleanTitle != "" {
		addCandidate(SanitizeFileName(cleanTitle))
		addCandidate(cleanTitle)
	}

	imgDirs := []string{"images", "downloaded_images", "download_images", "boxart", "snap", "covers"}
	imgSuffixes := []string{"-image.png", ".png", "-image.jpg", ".jpg", ".jpeg", "-boxart.png", "-boxart.jpg", "-snap.png", "-thumb.png", "-thumb.jpg"}
	thumbSuffixes := []string{"-thumb.png", "-thumb.jpg", "-image.png", ".png", ".jpg", ".jpeg", "-snap.png"}

	if imgRel == "" {
		for _, b := range candidateBases {
			for _, d := range imgDirs {
				for _, sfx := range imgSuffixes {
					if found := checkRelFile(d + "/" + b + sfx); found != "" {
						imgRel = found
						break
					}
				}
				if imgRel != "" {
					break
				}
			}
			if imgRel != "" {
				break
			}
		}
	}

	if thumbRel == "" {
		for _, b := range candidateBases {
			for _, d := range imgDirs {
				for _, sfx := range thumbSuffixes {
					if found := checkRelFile(d + "/" + b + sfx); found != "" {
						thumbRel = found
						break
					}
				}
				if thumbRel != "" {
					break
				}
			}
			if thumbRel != "" {
				break
			}
		}
	}
	// Fallback: if image exists on disk, use it as thumbnail too so R36S grid/boxart view never shows an empty image!
	if thumbRel == "" && imgRel != "" {
		thumbRel = imgRel
	}
	if imgRel == "" && thumbRel != "" {
		imgRel = thumbRel
	}

	marqueeDirs := []string{"marquees", "banners", "wheels", "images", "downloaded_images"}
	marqueeSuffixes := []string{"-marquee.png", "-marquee.jpg", "-banner.png", "-wheel.png", ".png", ".jpg"}
	if marqueeRel == "" {
		for _, b := range candidateBases {
			for _, d := range marqueeDirs {
				for _, sfx := range marqueeSuffixes {
					// Avoid picking normal boxart in "images/" as marquee unless it has -marquee/-banner/-wheel suffix
					if (d == "images" || d == "downloaded_images") && (sfx == ".png" || sfx == ".jpg") {
						continue
					}
					if found := checkRelFile(d + "/" + b + sfx); found != "" {
						marqueeRel = found
						break
					}
				}
				if marqueeRel != "" {
					break
				}
			}
			if marqueeRel != "" {
				break
			}
		}
	}

	videoDirs := []string{"videos", "snap", "images"}
	videoSuffixes := []string{"-video.mp4", ".mp4"}
	if videoRel == "" {
		for _, b := range candidateBases {
			for _, d := range videoDirs {
				for _, sfx := range videoSuffixes {
					if found := checkRelFile(d + "/" + b + sfx); found != "" {
						videoRel = found
						break
					}
				}
				if videoRel != "" {
					break
				}
			}
			if videoRel != "" {
				break
			}
		}
	}

	return imgRel, thumbRel, marqueeRel, videoRel
}

// Relocate & rename media from both standard ("images") and phantom ("download_images", "downloaded_images", "boxart") folders
// while preserving image file extensions (.png / .jpg) and keeping both plain and -image/-thumb names for 100% R36S compatibility!
func RelocateExistingMediaForRom(oldRomDir, newRomDir, oldBase, newBase string) {
	mediaSpecs := []struct {
		srcSubDir string
		dstSubDir string
		suffix    string
	}{
		{"images", "images", "-image.png"},
		{"images", "images", "-thumb.png"},
		{"images", "images", "-marquee.png"},
		{"images", "images", "-image.jpg"},
		{"images", "images", "-thumb.jpg"},
		{"images", "images", "-marquee.jpg"},
		{"images", "images", ".png"},
		{"images", "images", ".bmp"},
		{"images", "images", ".jpg"},
		{"images", "images", ".jpeg"},
		{"downloaded_images", "images", "-image.png"},
		{"downloaded_images", "images", "-thumb.png"},
		{"downloaded_images", "images", ".png"},
		{"downloaded_images", "images", ".jpg"},
		{"downloaded_images", "images", ".jpeg"},
		{"download_images", "images", "-image.png"},
		{"download_images", "images", ".png"},
		{"download_images", "images", ".jpg"},
		{"boxart", "images", ".png"},
		{"boxart", "images", ".jpg"},
		{"snap", "images", ".png"},
		{"snap", "images", ".jpg"},
		{"marquees", "marquees", "-marquee.png"},
		{"marquees", "marquees", ".png"},
		{"marquees", "marquees", ".jpg"},
		{"wheels", "marquees", ".png"},
		{"videos", "videos", "-video.mp4"},
		{"videos", "videos", ".mp4"},
		{"snap", "videos", ".mp4"},
	}

	// Сохранения (.srm, .sav, .state…) и их история едут вместе с ромом, см. saves.go.
	// Saves (.srm, .sav, .state…) and their history follow the ROM, see saves.go.
	MoveRomSaves(oldRomDir, newRomDir, oldBase, newBase, time.Now())

	for _, ms := range mediaSpecs {
		src := filepath.Join(oldRomDir, ms.srcSubDir, oldBase+ms.suffix)
		if fi, err := os.Stat(src); err == nil && !fi.IsDir() {
			ext := filepath.Ext(ms.suffix)
			dstSuffix := ms.suffix
			if (ms.suffix == ".png" || ms.suffix == ".bmp" || ms.suffix == ".jpg" || ms.suffix == ".jpeg") && ms.dstSubDir == "images" {
				dstSuffix = "-image" + ext
			} else if (ms.suffix == ".png" || ms.suffix == ".jpg") && ms.dstSubDir == "marquees" {
				dstSuffix = "-marquee" + ext
			} else if ms.suffix == ".mp4" {
				dstSuffix = "-video.mp4"
			}
			targetDir := filepath.Join(newRomDir, ms.dstSubDir)
			_ = os.MkdirAll(targetDir, 0755)
			dst := filepath.Join(targetDir, newBase+dstSuffix)
			if !strings.EqualFold(filepath.Clean(src), filepath.Clean(dst)) {
				_ = os.Rename(src, dst)
			}
			// Also ensure plain name (e.g. images/<newBase>.png) and -thumb exist so any R36S theme finds the picture
			if ms.dstSubDir == "images" && dstSuffix != "-marquee"+ext {
				plainDst := filepath.Join(targetDir, newBase+ext)
				if _, err := os.Stat(plainDst); err != nil {
					_ = CopyLocalFile(dst, plainDst)
				}
				thumbDst := filepath.Join(targetDir, newBase+"-thumb"+ext)
				if _, err := os.Stat(thumbDst); err != nil {
					_ = CopyLocalFile(dst, thumbDst)
				}
			}
		}
	}
}

func CleanOrphanedMedia(searchRoot string) (deletedFiles int, freedBytes int64) {
	mediaFolderNames := map[string]bool{
		"images":            true,
		"download_images":   true,
		"downloaded_images": true,
		"marquees":          true,
		"banners":           true,
		"videos":            true,
		"snap":              true,
		"boxart":            true,
		"wheels":            true,
	}

	var mediaDirs []string
	_ = filepath.Walk(searchRoot, func(p string, fi os.FileInfo, err error) error {
		if err != nil || !fi.IsDir() {
			return nil
		}
		name := fi.Name()
		if name == "_Duplicates_1G1R" || name == "_BadDumps_Junk" {
			return filepath.SkipDir
		}
		if mediaFolderNames[strings.ToLower(name)] {
			mediaDirs = append(mediaDirs, p)
			return filepath.SkipDir
		}
		return nil
	})

	mediaSuffixes := []string{
		"-image", "-thumb", "-marquee", "-video", "-banner", "-boxart", "-snap", "-wheel", "-fanart",
	}

	for _, mDir := range mediaDirs {
		consoleDir := filepath.Dir(mDir)

		activeRomBases := make(map[string]string)
		activeRomNorms := make(map[string]string)

		dirEntries, err := os.ReadDir(consoleDir)
		if err != nil {
			continue
		}
		for _, de := range dirEntries {
			if de.IsDir() {
				continue
			}
			ext := strings.ToLower(filepath.Ext(de.Name()))
			if _, isRom := ExtToDefaultConsole[ext]; isRom || ext == ".zip" {
				base := strings.TrimSuffix(de.Name(), filepath.Ext(de.Name()))
				activeRomBases[strings.ToLower(base)] = base
				norm := BuildComparisonKey(ExtractCleanTitle(de.Name()))
				if norm != "" {
					activeRomNorms[norm] = base
				}
			}
		}

		mFiles, err := os.ReadDir(mDir)
		if err != nil {
			continue
		}
		for _, mf := range mFiles {
			if mf.IsDir() {
				continue
			}
			mPath := filepath.Join(mDir, mf.Name())
			mExt := strings.ToLower(filepath.Ext(mf.Name()))
			if mExt != ".png" && mExt != ".jpg" && mExt != ".jpeg" && mExt != ".mp4" && mExt != ".avi" && mExt != ".mkv" && mExt != ".gif" {
				continue
			}

			baseNoExt := strings.TrimSuffix(mf.Name(), filepath.Ext(mf.Name()))
			strippedBase := baseNoExt
			matchedSuffix := ""
			for _, sfx := range mediaSuffixes {
				if strings.HasSuffix(strings.ToLower(strippedBase), sfx) {
					strippedBase = strippedBase[:len(strippedBase)-len(sfx)]
					matchedSuffix = sfx
					break
				}
			}

			if _, exists := activeRomBases[strings.ToLower(strippedBase)]; exists {
				continue
			}

			mediaNorm := BuildComparisonKey(ExtractCleanTitle(strippedBase))
			if targetRomBase, exists := activeRomNorms[mediaNorm]; exists && mediaNorm != "" {
				newMediaName := targetRomBase + matchedSuffix + mExt
				newMediaPath := filepath.Join(mDir, newMediaName)
				if _, statErr := os.Stat(newMediaPath); statErr != nil {
					_ = os.Rename(mPath, newMediaPath)
					logLine(fmt.Sprintf("[ПРИВЯЗАНО МЕДИА] %s -> %s", mf.Name(), newMediaName))
					continue
				}
			}

			var fSize int64
			if fi, statErr := mf.Info(); statErr == nil {
				fSize = fi.Size()
			}
			if err := os.Remove(mPath); err == nil {
				deletedFiles++
				freedBytes += fSize
				logLine(fmt.Sprintf("[УДАЛЕНО ЛИШНЕЕ МЕДИА] %s\\%s (ром отсутствует)", filepath.Base(mDir), mf.Name()))
			}
		}
	}

	return deletedFiles, freedBytes
}

func GenerateFallbackCoverPNG(destPath, title, consoleName, badge string, width, height int) error {
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			border := x < 6 || x >= width-6 || y < 6 || y >= height-6
			if border {
				img.Set(x, y, color.RGBA{R: 16, G: 185, B: 129, A: 255})
			} else if y < 44 {
				img.Set(x, y, color.RGBA{R: 30, G: 41, B: 59, A: 255})
			} else {
				r := uint8(15 + (y*20)/height)
				g := uint8(23 + (x*20)/width)
				b := uint8(42 + (y*35)/height)
				img.Set(x, y, color.RGBA{R: r, G: g, B: b, A: 255})
			}
		}
	}
	f, err := os.Create(destPath)
	if err != nil {
		return err
	}
	defer f.Close()
	return png.Encode(f, img)
}
