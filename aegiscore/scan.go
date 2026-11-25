package aegiscore

import (
	"archive/zip"
	"crypto/md5"
	"encoding/hex"
	"fmt"
	"hash/crc32"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// Scan each folder for sequential numbered ROM filenames (1, 2, 3... / 01, 02... / 001, 002... / 0001, 0002...)
// while excluding 007 James Bond games so they never loop.
func BuildSequentialNumberedCache(candidatePaths []string) {
	byDir := make(map[string][]string)
	for _, p := range candidatePaths {
		dir := filepath.Dir(p)
		byDir[dir] = append(byDir[dir], filepath.Base(p))
	}

	newCache := make(map[string]map[string]bool)

	for dir, files := range byDir {
		dirFlags := make(map[string]bool)
		type numFile struct {
			lowerName string
			num       int
			isPure    bool
		}
		var parsed []numFile
		numSet := make(map[int]bool)

		for _, fn := range files {
			if IsJamesBond007Game(fn) {
				continue
			}
			ext := filepath.Ext(fn)
			base := strings.TrimSpace(strings.TrimSuffix(fn, ext))
			// Also strip region tags like "0001 (USA)" -> "0001" to check if the core name is just a number
			baseWithoutTags := strings.TrimSpace(TagStripRegex.ReplaceAllString(base, ""))
			lowerBase := strings.ToLower(baseWithoutTags)

			if pm := PureNumberRegex.FindStringSubmatch(lowerBase); len(pm) >= 2 {
				if n, err := strconv.Atoi(pm[1]); err == nil {
					// If the file is literally named "007 (USA).nes" (already has region tag and is 007), don't treat as raw number
					if lowerBase == "007" && base != baseWithoutTags {
						continue
					}
					parsed = append(parsed, numFile{lowerName: strings.ToLower(fn), num: n, isPure: true})
					numSet[n] = true
					continue
				}
			}
		}

		// A file in this folder is considered a numbered ROM if:
		// 1. It is part of a sequence of numbers in the same folder (e.g., n-1, n+1, n-2, n+2 exist in the folder, or >= 2 numbered ROMs in folder)
		// 2. Or it is a pure number (like 0001.pbp, 01.bin) and not "007" standalone
		hasSequenceInFolder := len(parsed) >= 2
		for _, pf := range parsed {
			isAdjacent := numSet[pf.num-1] || numSet[pf.num+1] || numSet[pf.num-2] || numSet[pf.num+2]
			if pf.num == 7 && !hasSequenceInFolder && !isAdjacent {
				// Standalone "007" without other sequential numbers in the folder -> treat as Agent 007!
				continue
			}
			if pf.isPure || isAdjacent || hasSequenceInFolder {
				dirFlags[pf.lowerName] = true
			}
		}

		newCache[dir] = dirFlags
	}

	cacheMu.Lock()
	seqNumberedDirCache = newCache
	cacheMu.Unlock()
}

func isNumberedRomFile(fullPath, fileName, extractedTitle string) bool {
	// Never mark as an unrenamed numbered ROM if the file is already named as a James Bond 007 title!
	if IsJamesBond007Game(fileName) {
		return false
	}
	ext := filepath.Ext(fileName)
	base := strings.TrimSpace(strings.TrimSuffix(fileName, ext))
	baseWithoutTags := strings.TrimSpace(TagStripRegex.ReplaceAllString(base, ""))
	lowerBase := strings.ToLower(baseWithoutTags)

	// If the filename is "007" (or "007 (USA)") and the internal ROM header is ALSO a 007 Bond game,
	// and the filename already contains tags or "007", prevent re-renaming loop!
	if lowerBase == "007" && IsJamesBond007Game(extractedTitle) && base != "007" && base != "0007" {
		return false
	}

	dir := filepath.Dir(fullPath)
	cacheMu.Lock()
	dirMap, ok := seqNumberedDirCache[dir]
	cacheMu.Unlock()
	if ok {
		if dirMap[strings.ToLower(fileName)] {
			return true
		}
	}

	if lowerBase == "007" {
		return false
	}
	return PureNumberRegex.MatchString(lowerBase)
}

func isNumberedRomFileName(fileName string) bool {
	if IsJamesBond007Game(fileName) {
		return false
	}
	base := strings.TrimSuffix(fileName, filepath.Ext(fileName))
	baseWithoutTags := strings.TrimSpace(TagStripRegex.ReplaceAllString(base, ""))
	lower := strings.ToLower(baseWithoutTags)
	if lower == "007" {
		return false
	}
	return PureNumberRegex.MatchString(lower)
}

func detectConsoleCode(fullPath, ext string) string {
	lowerPath := strings.ToLower(filepath.ToSlash(fullPath))
	parts := strings.Split(lowerPath, "/")

	for i := len(parts) - 2; i >= 0; i-- {
		seg := parts[i]
		switch seg {
		case "famicom", "fc":
			if ext == ".nes" || ext == ".unf" || ext == ".zip" {
				return "famicom"
			}
		case "fds", "famicom disk system":
			return "fds"
		case "nes", "dendy":
			if ext == ".nes" || ext == ".unf" || ext == ".zip" {
				return "nes"
			}
		case "snes", "sfc", "superfamicom", "super nintendo":
			return "snes"
		case "gba", "game boy advance", "gameboy advance":
			return "gba"
		case "gbc", "game boy color", "gameboy color":
			return "gbc"
		case "gb", "game boy", "gameboy":
			return "gb"
		case "megadrive", "genesis", "md", "sega megadrive", "sega genesis":
			return "genesis"
		case "mastersystem", "sms":
			return "mastersystem"
		case "gamegear", "gg":
			return "gamegear"
		case "sega32x", "32x":
			return "sega32x"
		case "pcengine", "pce", "turbografx", "tg16":
			return "pcengine"
		case "psx", "ps1", "playstation":
			return "psx"
		case "psp":
			return "psp"
		case "nds", "ds":
			return "nds"
		case "n64", "nintendo64":
			return "n64"
		case "arcade", "mame", "fbneo", "neogeo", "cps", "cps1", "cps2", "cps3":
			return "arcade"
		}
	}

	if code, ok := ExtToDefaultConsole[ext]; ok {
		return code
	}
	return "arcade"
}

func AnalyzeSubfolderContext(rootFolder, fullPath string) (relSubfolder string, isRusFolder bool, isTopFolder bool) {
	rel, err := filepath.Rel(rootFolder, filepath.Dir(fullPath))
	if err != nil || rel == "." {
		rel = "(Корень)"
	}
	relSubfolder = rel

	lowerRel := strings.ToLower(rel)
	if strings.Contains(lowerRel, "rus") || strings.Contains(lowerRel, "рус") || strings.Contains(lowerRel, "perevod") || strings.Contains(lowerRel, "перевод") {
		isRusFolder = true
	}
	if strings.Contains(lowerRel, "top") || strings.Contains(lowerRel, "best") || strings.Contains(lowerRel, "лучш") || strings.Contains(lowerRel, "hit") || strings.Contains(lowerRel, "100") {
		isTopFolder = true
	}
	return
}

func InspectRomFile(rootFolder, path string) (RomItem, bool) {
	fi, err := os.Stat(path)
	if err != nil {
		return RomItem{}, false
	}

	ext := strings.ToLower(filepath.Ext(path))
	crcTable := crc32.MakeTable(crc32.IEEE)

	if ext == ".zip" {
		zr, err := zip.OpenReader(path)
		if err != nil {
			return RomItem{}, false
		}
		defer zr.Close()

		for _, zf := range zr.File {
			if zf.FileInfo().IsDir() {
				continue
			}
			innerExt := strings.ToLower(filepath.Ext(zf.Name))
			if _, ok := ExtToDefaultConsole[innerExt]; !ok {
				continue
			}

			rc, err := zf.Open()
			if err != nil {
				continue
			}
			data, err := io.ReadAll(rc)
			rc.Close()
			if err != nil {
				continue
			}

			crcHex := fmt.Sprintf("%08X", crc32.Checksum(data, crcTable))
			skip := detectHeaderSkip(innerExt, data)
			hdrCrcHex := crcHex
			if skip > 0 && len(data) > skip {
				hdrCrcHex = fmt.Sprintf("%08X", crc32.Checksum(data[skip:], crcTable))
			}
			md5Sum := md5.Sum(data)
			consoleCode := detectConsoleCode(path, innerExt)

			return buildRomItem(rootFolder, path, fi.Name(), fi.Size(), ".zip", consoleCode, crcHex, hdrCrcHex, hex.EncodeToString(md5Sum[:])), true
		}
		return RomItem{}, false
	}

	if _, ok := ExtToDefaultConsole[ext]; !ok {
		return RomItem{}, false
	}

	// For huge CD/ISO/PBP/CHD files (> 32 MB), hash the first 16 MB for fast CRC32 without stalling the disk
	var crcHex, hdrCrcHex, md5Hex string
	if fi.Size() > 32*1024*1024 {
		f, err := os.Open(path)
		if err != nil {
			return RomItem{}, false
		}
		buf := make([]byte, 4*1024*1024)
		n, _ := f.Read(buf)
		f.Close()
		crcHex = fmt.Sprintf("%08X", crc32.Checksum(buf[:n], crcTable))
		hdrCrcHex = crcHex
		md5Sum := md5.Sum(buf[:n])
		md5Hex = hex.EncodeToString(md5Sum[:])
	} else {
		data, err := os.ReadFile(path)
		if err != nil {
			return RomItem{}, false
		}
		crcHex = fmt.Sprintf("%08X", crc32.Checksum(data, crcTable))
		skip := detectHeaderSkip(ext, data)
		hdrCrcHex = crcHex
		if skip > 0 && len(data) > skip {
			hdrCrcHex = fmt.Sprintf("%08X", crc32.Checksum(data[skip:], crcTable))
		}
		md5Sum := md5.Sum(data)
		md5Hex = hex.EncodeToString(md5Sum[:])
	}

	consoleCode := detectConsoleCode(path, ext)
	return buildRomItem(rootFolder, path, fi.Name(), fi.Size(), ext, consoleCode, crcHex, hdrCrcHex, md5Hex), true
}

func detectHeaderSkip(ext string, data []byte) int {
	if ext == ".nes" && len(data) >= 16 && string(data[:4]) == "NES\x1a" {
		return 16
	}
	if (ext == ".smc" || ext == ".sfc") && len(data)%1024 == 512 && len(data) > 512 {
		return 512
	}
	return 0
}

func buildRomItem(rootFolder, fullPath, fileName string, size int64, ext, consoleCode, crcHex, hdrCrcHex, md5Hex string) RomItem {
	relSub, isRusFolder, isTopFolder := AnalyzeSubfolderContext(rootFolder, fullPath)
	isRusFile := rusTagRegex.MatchString(fileName) || isRusFolder

	// Extract real game title from gamelist.xml OR internal binary ROM header (e.g. for 1.pbp, 02.bin, 0001.pbp, etc.)
	gamelistTitle := GamelistTitleForFile(fullPath)
	internalHdrTitle := ExtractInternalBinaryRomTitle(fullPath, ext, consoleCode)

	extractedTitle := ""
	if gamelistTitle != "" {
		extractedTitle = gamelistTitle
	} else if internalHdrTitle != "" {
		extractedTitle = internalHdrTitle
	}

	isNumbered := isNumberedRomFile(fullPath, fileName, extractedTitle)

	cleanTitle := ExtractCleanTitle(fileName)
	if (isNumbered || len(cleanTitle) <= 3) && extractedTitle != "" {
		cleanTitle = ExtractCleanTitle(extractedTitle)
	}
	if extractedTitle == "" {
		extractedTitle = cleanTitle
	}

	if rusTagRegex.MatchString(extractedTitle) {
		isRusFile = true
	}

	region := ParseRegion(fileName+" "+extractedTitle, isRusFile)
	revision := parseRevision(fileName)
	compKey := BuildComparisonKey(cleanTitle)
	isJunk := junkRegex.MatchString(fileName)
	modKind := DetectRomModKind(fileName, fullPath)

	meta, ok := ConsoleCatalog[consoleCode]
	if !ok {
		meta = ConsoleCatalog["nes"]
	}

	canonExt := ext
	if ext == ".smc" {
		canonExt = ".sfc"
	} else if ext == ".gen" || ext == ".smd" {
		canonExt = ".md"
	}

	// CRITICAL FIX v5.0: Never append a fake "(World)" tag when region is unknown/World,
	// and if CleanTitle is still a pure number, keep original fileName!
	canonicalName := fileName
	if !IsPureNumberOrGenericTitle(cleanTitle) && CountLettersInString(cleanTitle) >= 2 {
		if isRusFile {
			canonicalName = fmt.Sprintf("%s (RUS)%s", cleanTitle, canonExt)
		} else if revision != "" && region != "World" {
			canonicalName = fmt.Sprintf("%s (%s) (%s)%s", cleanTitle, region, revision, canonExt)
		} else if region != "World" {
			canonicalName = fmt.Sprintf("%s (%s)%s", cleanTitle, region, canonExt)
		} else {
			canonicalName = fmt.Sprintf("%s%s", cleanTitle, canonExt)
		}
	}

	romDir := filepath.Dir(fullPath)
	baseNoExt := strings.TrimSuffix(fileName, filepath.Ext(fileName))
	imgRel, _, _, vidRel := ResolveExistingMediaPathsForRom(romDir, baseNoExt, cleanTitle)

	mediaStatus := "Нет медиа"
	hasImg := imgRel != ""
	hasVid := vidRel != ""
	if hasImg && hasVid {
		mediaStatus = "✔ Картинка + Видео"
	} else if hasImg {
		mediaStatus = "✔ Картинка"
	}

	status := "verified"
	reason := "Оставить 1G1R"
	if isJunk {
		status = "junk_bad_dump"
		reason = "Битый дамп [b]"
	} else if modKind != ModOriginal {
		reason = modKeptReason(fullPath)
	} else if isNumbered && !IsPureNumberOrGenericTitle(cleanTitle) {
		reason = "Порядковый № -> " + cleanTitle
	} else if isNumbered {
		reason = "Порядковый № (требуется парсинг)"
	}

	return RomItem{
		FilePath:        fullPath,
		SourceSubfolder: relSub,
		FileName:        fileName,
		ExtractedTitle:  extractedTitle,
		CleanTitle:      cleanTitle,
		ComparisonKey:   compKey,
		CanonicalName:   canonicalName,
		Extension:       ext,
		ConsoleCode:     consoleCode,
		Generation:      meta.GenerationFolder,
		FileSize:        size,
		CRC32:           crcHex,
		HeaderlessCRC32: hdrCrcHex,
		MD5:             md5Hex,
		Region:          region,
		IsRussian:       isRusFile,
		IsFromTopFolder: isTopFolder,
		IsNumberedFile:  isNumbered,
		Revision:        revision,
		Status:          status,
		ModKind:         modKind,
		Is1G1RWinner:    !isJunk,
		Reason:          reason,
		MediaStatus:     mediaStatus,
	}
}

// Check if two files in the same folder are companion files of the same CD game (e.g., 000001.cue + 000001.bin)
func areCompanionDiscFiles(a, b RomItem) bool {
	if !strings.EqualFold(filepath.Dir(a.FilePath), filepath.Dir(b.FilePath)) {
		return false
	}
	baseA := strings.ToLower(strings.TrimSuffix(a.FileName, filepath.Ext(a.FileName)))
	baseB := strings.ToLower(strings.TrimSuffix(b.FileName, filepath.Ext(b.FileName)))
	if baseA != baseB {
		return false
	}
	return !strings.EqualFold(a.Extension, b.Extension)
}

func modKeptReason(path string) string {
	if IsInHackFolder(path) {
		return "Хак/перевод в hackroms/: не дубль оригинала"
	}
	return "Хак/перевод: не дубль оригинала, можно перенести в " + HackRomsDir + "/"
}

func DeduplicateAcrossSubfolders(items []RomItem, priority []string) []RomItem {
	seenHash := make(map[string]int)
	for i := range items {
		if items[i].Status == "junk_bad_dump" {
			continue
		}
		hKey := items[i].ConsoleCode + "::crc::" + items[i].HeaderlessCRC32
		if firstIdx, exists := seenHash[hKey]; exists {
			if areCompanionDiscFiles(items[i], items[firstIdx]) {
				continue
			}
			if scoreRomCandidate(items[i], priority) > scoreRomCandidate(items[firstIdx], priority) {
				items[firstIdx].Status = "duplicate_clone"
				items[firstIdx].Is1G1RWinner = false
				items[firstIdx].Reason = fmt.Sprintf("Дубль по CRC32 (оставлен из %s)", items[i].SourceSubfolder)
				seenHash[hKey] = i
			} else {
				items[i].Status = "duplicate_clone"
				items[i].Is1G1RWinner = false
				items[i].Reason = fmt.Sprintf("Дубль по CRC32 (оставлен из %s)", items[firstIdx].SourceSubfolder)
			}
		} else {
			seenHash[hKey] = i
		}
	}

	// Хаки и переводы — не дубли оригинала: в сравнение по названию не идут (точные копии по CRC отсеяны выше).
	// Hacks and translations are not duplicates of the original: they skip title matching (exact CRC copies are removed above).
	groups := make(map[string][]int)
	for i, it := range items {
		if it.Status == "verified" && it.ModKind == ModOriginal {
			// Do not group unparsed numbered files together by title if their title is still a pure number!
			if IsPureNumberOrGenericTitle(it.CleanTitle) {
				continue
			}
			gKey := it.ConsoleCode + "::title::" + it.ComparisonKey
			groups[gKey] = append(groups[gKey], i)
		}
	}

	for _, idxs := range groups {
		if len(idxs) <= 1 {
			continue
		}
		bestIdx := idxs[0]
		bestScore := scoreRomCandidate(items[bestIdx], priority)
		for _, idx := range idxs[1:] {
			sc := scoreRomCandidate(items[idx], priority)
			if sc > bestScore {
				bestScore = sc
				bestIdx = idx
			}
		}
		winner := items[bestIdx]
		for _, idx := range idxs {
			if idx == bestIdx || areCompanionDiscFiles(items[idx], winner) {
				items[idx].Is1G1RWinner = true
				items[idx].Status = "verified"
				if idx == bestIdx {
					items[idx].Reason = fmt.Sprintf("Лучший из %d папок (%s)", len(idxs), winner.Region)
				}
			} else {
				items[idx].Is1G1RWinner = false
				items[idx].Status = "duplicate_clone"
				items[idx].Reason = fmt.Sprintf("Дубль из [%s]", items[idx].SourceSubfolder)
			}
		}
	}

	byConsole := make(map[string][]int)
	for i, it := range items {
		if it.Status == "verified" && it.ModKind == ModOriginal && !IsPureNumberOrGenericTitle(it.CleanTitle) {
			byConsole[it.ConsoleCode] = append(byConsole[it.ConsoleCode], i)
		}
	}

	for _, idxs := range byConsole {
		for a := 0; a < len(idxs); a++ {
			idxA := idxs[a]
			if items[idxA].Status != "verified" {
				continue
			}
			for b := a + 1; b < len(idxs); b++ {
				idxB := idxs[b]
				if items[idxB].Status != "verified" {
					continue
				}
				if areCompanionDiscFiles(items[idxA], items[idxB]) {
					continue
				}
				if areTitlesSameGame(items[idxA].CleanTitle, items[idxB].CleanTitle, items[idxA].ComparisonKey, items[idxB].ComparisonKey) {
					if scoreRomCandidate(items[idxB], priority) > scoreRomCandidate(items[idxA], priority) {
						items[idxA].Status = "duplicate_clone"
						items[idxA].Is1G1RWinner = false
						items[idxA].Reason = fmt.Sprintf("Повтор (оставлен %s)", items[idxB].FileName)
						break
					} else {
						items[idxB].Status = "duplicate_clone"
						items[idxB].Is1G1RWinner = false
						items[idxB].Reason = fmt.Sprintf("Повтор (оставлен %s)", items[idxA].FileName)
					}
				}
			}
		}
	}

	return items
}

func areTitlesSameGame(titleA, titleB, keyA, keyB string) bool {
	if keyA == keyB {
		return true
	}
	if strings.EqualFold(strings.TrimSpace(titleA), strings.TrimSpace(titleB)) {
		return true
	}
	toksA := tokenizeNormalized(titleA)
	toksB := tokenizeNormalized(titleB)
	if len(toksA) < 2 || len(toksB) < 2 {
		return false
	}
	common := 0
	for t := range toksA {
		if toksB[t] {
			common++
		}
	}
	union := len(toksA) + len(toksB) - common
	if union == 0 {
		return false
	}
	return float64(common)/float64(union) >= 0.85
}

func scoreRomCandidate(r RomItem, priority []string) int {
	score := 0
	for i, reg := range priority {
		if strings.EqualFold(r.Region, reg) {
			score += (len(priority) - i) * 100
			break
		}
	}
	if r.IsRussian && len(priority) > 0 && strings.EqualFold(priority[0], "Russia") {
		score += 60
	}
	if r.Revision != "" {
		score += 15
	}
	if r.IsFromTopFolder {
		score += 10
	}
	if r.Extension != ".zip" {
		score += 5
	}
	return score
}
