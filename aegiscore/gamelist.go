package aegiscore

import (
	"encoding/xml"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// Fault-tolerant gamelist.xml parser that NEVER fails on unescaped '&' or malformed XML in factory R36S cards,
// checks backup files (gamelist_factory_backup.xml, gamelist.xml.bak, etc.), and auto-creates a factory backup!
func loadGamelistMapsForDir(dir string) (map[string]string, map[string]GameEntryXML) {
	cacheMu.Lock()
	titleMap, tLoaded := gamelistTitleCache[dir]
	entryMap, eLoaded := gamelistEntryCache[dir]
	cacheMu.Unlock()

	if tLoaded && eLoaded {
		return titleMap, entryMap
	}

	titleMap = make(map[string]string)
	entryMap = make(map[string]GameEntryXML)

	// Candidate gamelist files in priority order (check factory backups first so if gamelist.xml was overwritten with 000001, backups win!)
	candidateFiles := []string{
		filepath.Join(dir, "gamelist_factory_backup.xml"),
		filepath.Join(dir, "gamelist.xml.bak"),
		filepath.Join(dir, "gamelist.bak"),
		filepath.Join(dir, "gamelist_backup.xml"),
		filepath.Join(dir, "gamelist.old"),
		filepath.Join(dir, "gamelist.xml"),
	}
	// Also check parent directory if ROMs are inside a subfolder of a console folder
	parentDir := filepath.Dir(dir)
	if parentDir != dir {
		candidateFiles = append(candidateFiles,
			filepath.Join(parentDir, "gamelist_factory_backup.xml"),
			filepath.Join(parentDir, "gamelist.xml.bak"),
			filepath.Join(parentDir, "gamelist.xml"),
		)
	}

	realNamesFoundInPrimary := 0
	primaryGlPath := filepath.Join(dir, "gamelist.xml")
	backupGlPath := filepath.Join(dir, "gamelist_factory_backup.xml")

	for _, glPath := range candidateFiles {
		data, err := os.ReadFile(glPath)
		if err != nil || len(data) == 0 {
			continue
		}
		blocks := xmlGameBlockRegex.FindAllStringSubmatch(string(data), -1)
		for _, b := range blocks {
			if len(b) < 2 {
				continue
			}
			body := b[1]
			rawPath := extractXMLTagValue(body, "path")
			rawName := extractXMLTagValue(body, "name")
			if rawPath == "" {
				continue
			}

			cleanP := strings.ToLower(filepath.Base(strings.ReplaceAll(rawPath, "\\", "/")))
			noExt := strings.TrimSuffix(cleanP, filepath.Ext(cleanP))

			entry := GameEntryXML{
				Path:        rawPath,
				Name:        rawName,
				Desc:        extractXMLTagValue(body, "desc"),
				Image:       extractXMLTagValue(body, "image"),
				Thumbnail:   extractXMLTagValue(body, "thumbnail"),
				Marquee:     extractXMLTagValue(body, "marquee"),
				Video:       extractXMLTagValue(body, "video"),
				Rating:      extractXMLTagValue(body, "rating"),
				ReleaseDate: extractXMLTagValue(body, "releasedate"),
				Developer:   extractXMLTagValue(body, "developer"),
				Publisher:   extractXMLTagValue(body, "publisher"),
				Genre:       extractXMLTagValue(body, "genre"),
				Region:      extractXMLTagValue(body, "region"),
			}

			if _, exists := entryMap[cleanP]; !exists {
				entryMap[cleanP] = entry
			}
			if _, exists := entryMap[noExt]; !exists {
				entryMap[noExt] = entry
			}
			coreK := ExtractCoreNumberKey(cleanP)
			if coreK != "" {
				if _, exists := entryMap[coreK]; !exists {
					entryMap[coreK] = entry
				}
			}

			// Strip leading index numbers from gamelist <name> like "000001. Tekken 3", EXCEPT 007 James Bond games!
			cleanN := stripLeadingIndexExcept007(strings.TrimSpace(rawName))
			// Only accept cleanN as a real title if it is NOT a pure number like "000001"!
			if cleanP != "" && cleanN != "" && !IsPureNumberOrGenericTitle(cleanN) {
				if _, exists := titleMap[cleanP]; !exists {
					titleMap[cleanP] = cleanN
				}
				if _, exists := titleMap[noExt]; !exists {
					titleMap[noExt] = cleanN
				}
				if coreK != "" {
					if _, exists := titleMap[coreK]; !exists {
						titleMap[coreK] = cleanN
					}
				}
				if strings.EqualFold(glPath, primaryGlPath) {
					realNamesFoundInPrimary++
				}
			}
		}
	}

	// If primary gamelist.xml has real factory titles and we haven't backed it up yet, save gamelist_factory_backup.xml!
	if realNamesFoundInPrimary > 0 {
		if _, err := os.Stat(backupGlPath); err != nil {
			if origBytes, rErr := os.ReadFile(primaryGlPath); rErr == nil {
				_ = os.WriteFile(backupGlPath, origBytes, 0644)
			}
		}
	}

	cacheMu.Lock()
	gamelistTitleCache[dir] = titleMap
	gamelistEntryCache[dir] = entryMap
	cacheMu.Unlock()

	return titleMap, entryMap
}

func GamelistTitleForFile(romPath string) string {
	dir := filepath.Dir(romPath)
	fileNameLower := strings.ToLower(filepath.Base(romPath))
	baseNoExtLower := strings.ToLower(strings.TrimSuffix(filepath.Base(romPath), filepath.Ext(romPath)))
	coreKey := ExtractCoreNumberKey(romPath)

	// If user selected a custom XML file, check it first!
	if selectedCustomXmlPath != "" {
		customTMap, _ := parseSingleXmlFileMaps(selectedCustomXmlPath)
		if title, ok := customTMap[fileNameLower]; ok && title != "" && !IsPureNumberOrGenericTitle(title) {
			return title
		}
		if title, ok := customTMap[baseNoExtLower]; ok && title != "" && !IsPureNumberOrGenericTitle(title) {
			return title
		}
		if coreKey != "" {
			if title, ok := customTMap[coreKey]; ok && title != "" && !IsPureNumberOrGenericTitle(title) {
				return title
			}
		}
	}

	titleMap, _ := loadGamelistMapsForDir(dir)

	if title, ok := titleMap[fileNameLower]; ok && title != "" && !IsPureNumberOrGenericTitle(title) {
		return title
	}
	if title, ok := titleMap[baseNoExtLower]; ok && title != "" && !IsPureNumberOrGenericTitle(title) {
		return title
	}
	if coreKey != "" {
		if title, ok := titleMap[coreKey]; ok && title != "" && !IsPureNumberOrGenericTitle(title) {
			return title
		}
	}
	// Fallback to embedded R36S factory gamelist.xml map (630 numbered PSX games 000001..000634)
	if factoryTitle, ok := FactoryR36SNumberMap[baseNoExtLower]; ok && factoryTitle != "" {
		return factoryTitle
	}
	if coreKey != "" {
		if factoryTitle, ok := FactoryR36SNumberMap[coreKey]; ok && factoryTitle != "" {
			return factoryTitle
		}
	}
	return ""
}

func WriteArkOSGamelistXML(consoleDir string, roms []RomItem) {
	// 1. Always preserve a backup of the original factory gamelist.xml before modifying it!
	origGamelistPath := filepath.Join(consoleDir, "gamelist.xml")
	backupGamelistPath := filepath.Join(consoleDir, "gamelist_factory_backup.xml")
	if _, err := os.Stat(backupGamelistPath); err != nil {
		if origBytes, readErr := os.ReadFile(origGamelistPath); readErr == nil && len(origBytes) > 32 {
			_ = os.WriteFile(backupGamelistPath, origBytes, 0644)
		}
	}

	titleMap, existingEntries := loadGamelistMapsForDir(consoleDir)

	// Deduplicate by lowercase FileName and skip raw companion .bin tracks if a .cue/.m3u exists for the same base
	cueBases := make(map[string]bool)
	for _, r := range roms {
		ext := strings.ToLower(filepath.Ext(r.FileName))
		if ext == ".cue" || ext == ".m3u" || ext == ".ccd" {
			base := strings.ToLower(strings.TrimSuffix(r.FileName, filepath.Ext(r.FileName)))
			cueBases[base] = true
		}
	}

	seenFiles := make(map[string]bool)
	var gl GameListXML

	for _, r := range roms {
		if _, err := os.Stat(r.FilePath); err != nil {
			continue
		}
		lowFile := strings.ToLower(r.FileName)
		if seenFiles[lowFile] {
			continue
		}
		ext := strings.ToLower(filepath.Ext(r.FileName))
		baseNoExt := strings.TrimSuffix(r.FileName, filepath.Ext(r.FileName))
		if (ext == ".bin" || ext == ".img" || ext == ".sub") && cueBases[strings.ToLower(baseNoExt)] {
			continue
		}
		seenFiles[lowFile] = true

		displayName := strings.TrimSpace(r.CleanTitle)
		// Never write a raw number like "000001" over a real title from gamelist or binary header!
		if displayName == "" || PureNumberRegex.MatchString(displayName) {
			if savedTitle, ok := titleMap[strings.ToLower(baseNoExt)]; ok && savedTitle != "" && !PureNumberRegex.MatchString(savedTitle) {
				displayName = savedTitle
			} else if hdrTitle := ExtractInternalBinaryRomTitle(r.FilePath, ext, r.ConsoleCode); hdrTitle != "" && !PureNumberRegex.MatchString(hdrTitle) {
				displayName = hdrTitle
			} else if displayName == "" {
				displayName = baseNoExt
			}
		}

		if r.IsRussian && !strings.Contains(strings.ToUpper(displayName), "[RUS]") {
			displayName += " [RUS]"
		}

		meta := ConsoleCatalog[r.ConsoleCode]
		desc := fmt.Sprintf(
			"Игра: %s | Консоль: %s (%s) | Регион: %s | CRC32: %s.",
			displayName, meta.DisplayName, r.Generation, r.Region, r.HeaderlessCRC32,
		)
		rating := "0.9"
		genre := meta.DisplayName

		if prev, ok := existingEntries[strings.ToLower(baseNoExt)]; ok {
			if strings.TrimSpace(prev.Desc) != "" && !strings.Contains(prev.Desc, "Подготовлено AegisROM") {
				desc = prev.Desc
			}
			if strings.TrimSpace(prev.Rating) != "" {
				rating = prev.Rating
			}
			if strings.TrimSpace(prev.Genre) != "" {
				genre = prev.Genre
			}
		}

		// Resolve actual existing media files on disk so we NEVER write broken -image.png/-thumb.png paths!
		imgRel, thumbRel, marqueeRel, videoRel := ResolveExistingMediaPathsForRom(consoleDir, baseNoExt, displayName)

		entry := GameEntryXML{
			Path:      "./" + r.FileName,
			Name:      displayName,
			Desc:      desc,
			Image:     imgRel,
			Thumbnail: thumbRel,
			Marquee:   marqueeRel,
			Video:     videoRel,
			Rating:    rating,
			Genre:     genre,
			Region:    r.Region,
		}

		gl.Games = append(gl.Games, entry)
	}

	// Also preserve any existing entries in gamelist.xml for files in consoleDir that weren't in roms slice
	for _, prev := range existingEntries {
		cleanP := strings.TrimPrefix(strings.ReplaceAll(strings.TrimSpace(prev.Path), "\\", "/"), "./")
		cleanP = strings.TrimPrefix(cleanP, "/")
		fName := filepath.Base(cleanP)
		if fName == "" || fName == "." || seenFiles[strings.ToLower(fName)] {
			continue
		}
		fullP := filepath.Join(consoleDir, fName)
		if _, err := os.Stat(fullP); err != nil {
			continue
		}
		seenFiles[strings.ToLower(fName)] = true
		baseNoExt := strings.TrimSuffix(fName, filepath.Ext(fName))
		fExt := strings.ToLower(filepath.Ext(fName))
		cCode := detectConsoleCode(fullP, fExt)

		name := strings.TrimSpace(prev.Name)
		if name == "" || PureNumberRegex.MatchString(name) {
			if hdr := ExtractInternalBinaryRomTitle(fullP, fExt, cCode); hdr != "" && !PureNumberRegex.MatchString(hdr) {
				name = hdr
			} else if name == "" {
				name = baseNoExt
			}
		}
		imgRel, thumbRel, marqueeRel, videoRel := ResolveExistingMediaPathsForRom(consoleDir, baseNoExt, name)
		prev.Path = "./" + fName
		prev.Name = name
		if imgRel != "" {
			prev.Image = imgRel
		}
		if thumbRel != "" {
			prev.Thumbnail = thumbRel
		}
		if marqueeRel != "" {
			prev.Marquee = marqueeRel
		}
		if videoRel != "" {
			prev.Video = videoRel
		}
		gl.Games = append(gl.Games, prev)
	}

	// Clear gamelist cache for this dir so subsequent scans read the updated XML
	cacheMu.Lock()
	delete(gamelistTitleCache, filepath.Clean(consoleDir))
	delete(gamelistEntryCache, filepath.Clean(consoleDir))
	cacheMu.Unlock()

	xmlBytes, err := xml.MarshalIndent(gl, "", "  ")
	if err == nil {
		fullXML := append([]byte(xml.Header), xmlBytes...)
		_ = os.WriteFile(origGamelistPath, fullXML, 0644)
	}
}

// Repair broken gamelist.xml bindings and restore empty pictures/names in a console folder
func RepairGamelistAndMediaBindingsInDir(consoleDir string) int {
	entries, err := os.ReadDir(consoleDir)
	if err != nil {
		return 0
	}
	var romsInDir []RomItem
	for _, de := range entries {
		if de.IsDir() {
			continue
		}
		ext := strings.ToLower(filepath.Ext(de.Name()))
		if _, ok := ExtToDefaultConsole[ext]; ok || ext == ".zip" {
			fPath := filepath.Join(consoleDir, de.Name())
			fi, err := de.Info()
			if err != nil || fi.Size() == 0 {
				continue
			}
			item, ok := InspectRomFile(consoleDir, fPath)
			if ok {
				romsInDir = append(romsInDir, item)
			}
		}
	}
	if len(romsInDir) == 0 {
		return 0
	}
	WriteArkOSGamelistXML(consoleDir, romsInDir)
	return len(romsInDir)
}

func parseSingleXmlFileMaps(xmlPath string) (map[string]string, map[string]GameEntryXML) {
	tMap := make(map[string]string)
	eMap := make(map[string]GameEntryXML)
	data, err := os.ReadFile(xmlPath)
	if err != nil || len(data) == 0 {
		return tMap, eMap
	}
	blocks := xmlGameBlockRegex.FindAllStringSubmatch(string(data), -1)
	for _, b := range blocks {
		if len(b) < 2 {
			continue
		}
		body := b[1]
		rawPath := extractXMLTagValue(body, "path")
		rawName := extractXMLTagValue(body, "name")
		if rawPath == "" {
			continue
		}
		cleanP := strings.ToLower(filepath.Base(strings.ReplaceAll(rawPath, "\\", "/")))
		noExt := strings.TrimSuffix(cleanP, filepath.Ext(cleanP))
		coreK := ExtractCoreNumberKey(cleanP)

		entry := GameEntryXML{
			Path:      rawPath,
			Name:      rawName,
			Image:     extractXMLTagValue(body, "image"),
			Thumbnail: extractXMLTagValue(body, "thumbnail"),
			Marquee:   extractXMLTagValue(body, "marquee"),
			Video:     extractXMLTagValue(body, "video"),
			Genre:     extractXMLTagValue(body, "genre"),
		}
		eMap[cleanP] = entry
		eMap[noExt] = entry
		if coreK != "" {
			eMap[coreK] = entry
		}

		cleanN := stripLeadingIndexExcept007(strings.TrimSpace(rawName))
		if cleanN != "" && !IsPureNumberOrGenericTitle(cleanN) {
			tMap[cleanP] = cleanN
			tMap[noExt] = cleanN
			if coreK != "" {
				tMap[coreK] = cleanN
			}
		}
	}
	return tMap, eMap
}

// BuildXMLMappingCandidatesForFolder также учитывает уже просканированные ромы (scanned).
func BuildXMLMappingCandidatesForFolder(folder string, scanned []RomItem) []XmlMappingCandidate {
	// Index real ROM files on disk in folder, folder/psx, folder/ps1, and scannedRoms
	// by their normalized core number key (so "000001 (World).chd" maps to "000001"!)
	type diskRomInfo struct {
		fileName       string
		fullPath       string
		coreKey        string
		extractedTitle string
	}
	diskByCore := make(map[string]diskRomInfo)
	diskByLower := make(map[string]diskRomInfo)

	localScanned := make([]RomItem, len(scanned))
	copy(localScanned, scanned)

	for _, r := range localScanned {
		ck := ExtractCoreNumberKey(r.FileName)
		info := diskRomInfo{
			fileName:       r.FileName,
			fullPath:       r.FilePath,
			coreKey:        ck,
			extractedTitle: r.ExtractedTitle,
		}
		diskByLower[strings.ToLower(r.FileName)] = info
		diskByLower[strings.ToLower(strings.TrimSuffix(r.FileName, filepath.Ext(r.FileName)))] = info
		if ck != "" {
			diskByCore[ck] = info
		}
	}

	// Also directly scan disk in folder, folder/psx, folder/ps1 so even if user hasn't clicked "1. Scan", we find "000001 (World).chd"!
	for _, candDir := range []string{folder, filepath.Join(folder, "psx"), filepath.Join(folder, "ps1")} {
		if candDir == "" {
			continue
		}
		entries, err := os.ReadDir(candDir)
		if err != nil {
			continue
		}
		for _, e := range entries {
			if e.IsDir() {
				continue
			}
			ext := strings.ToLower(filepath.Ext(e.Name()))
			if _, ok := ExtToDefaultConsole[ext]; !ok && ext != ".zip" {
				continue
			}
			ck := ExtractCoreNumberKey(e.Name())
			low := strings.ToLower(e.Name())
			if _, exists := diskByLower[low]; !exists {
				info := diskRomInfo{
					fileName: e.Name(),
					fullPath: filepath.Join(candDir, e.Name()),
					coreKey:  ck,
				}
				diskByLower[low] = info
				diskByLower[strings.TrimSuffix(low, ext)] = info
				if ck != "" {
					if _, cExists := diskByCore[ck]; !cExists {
						diskByCore[ck] = info
					}
				}
			}
		}
	}

	titleMap, entryMap := loadGamelistMapsForDir(folder)
	if selectedCustomXmlPath != "" {
		cTMap, cEMap := parseSingleXmlFileMaps(selectedCustomXmlPath)
		for k, v := range cTMap {
			titleMap[k] = v
		}
		for k, v := range cEMap {
			entryMap[k] = v
		}
	}

	type rawPair struct {
		diskFileName string
		coreKey      string
		title        string
		hasOnDisk    bool
		hasImg       bool
		hasVid       bool
		sourceLabel  string
	}
	var pairs []rawPair
	seenCore := make(map[string]bool)

	// 1. Collect from custom XML or folder's gamelist.xml if present
	for k, ge := range entryMap {
		if strings.Contains(k, ".") {
			fName := filepath.Base(strings.ReplaceAll(strings.TrimSpace(ge.Path), "\\", "/"))
			ext := strings.ToLower(filepath.Ext(fName))
			if ext == ".srm" || strings.Contains(strings.ToLower(ge.Name), "zzz(notgame)") {
				continue
			}
			ck := ExtractCoreNumberKey(fName)
			if ck == "" {
				ck = strings.ToLower(strings.TrimSuffix(fName, filepath.Ext(fName)))
			}
			if seenCore[ck] {
				continue
			}
			t := titleMap[ck]
			if t == "" {
				t = titleMap[strings.ToLower(fName)]
			}
			if t == "" {
				t = FactoryR36SNumberMap[ck]
			}
			if t == "" || IsPureNumberOrGenericTitle(t) {
				continue
			}
			seenCore[ck] = true

			actualName := fName
			hasDisk := false
			if dInfo, ok := diskByCore[ck]; ok {
				actualName = dInfo.fileName
				hasDisk = true
			} else if dInfo, ok := diskByLower[strings.ToLower(fName)]; ok {
				actualName = dInfo.fileName
				hasDisk = true
			}

			srcLbl := "В базе XML"
			if hasDisk {
				srcLbl = "✔ Найден в папке (XML)"
			}
			pairs = append(pairs, rawPair{
				diskFileName: actualName,
				coreKey:      ck,
				title:        t,
				hasOnDisk:    hasDisk,
				hasImg:       ge.Image != "" || ge.Thumbnail != "",
				hasVid:       ge.Video != "",
				sourceLabel:  srcLbl,
			})
		}
	}

	// 2. Also include embedded R36S factory XML mappings (630 numbered PSX games 000001..000634)
	var keys []string
	for k := range FactoryR36SNumberMap {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		if seenCore[k] {
			continue
		}
		t := FactoryR36SNumberMap[k]
		actualName := k + ".chd"
		hasDisk := false
		if dInfo, ok := diskByCore[k]; ok {
			actualName = dInfo.fileName
			hasDisk = true
		}
		seenCore[k] = true
		srcLbl := "В базе XML (630 игр)"
		if hasDisk {
			srcLbl = "✔ Найден в папке (000001/World)"
		}
		pairs = append(pairs, rawPair{
			diskFileName: actualName,
			coreKey:      k,
			title:        t,
			hasOnDisk:    hasDisk,
			hasImg:       true,
			hasVid:       true,
			sourceLabel:  srcLbl,
		})
	}

	// 3. Also include any numbered ROMs on disk resolved via deep binary header inspection!
	for ck, dInfo := range diskByCore {
		if seenCore[ck] {
			continue
		}
		hdrTitle := dInfo.extractedTitle
		if hdrTitle == "" || IsPureNumberOrGenericTitle(hdrTitle) {
			ext := strings.ToLower(filepath.Ext(dInfo.fullPath))
			hdrTitle = ExtractInternalBinaryRomTitle(dInfo.fullPath, ext, detectConsoleCode(dInfo.fullPath, ext))
		}
		if hdrTitle != "" && !IsPureNumberOrGenericTitle(hdrTitle) && CountLettersInString(hdrTitle) >= 2 {
			seenCore[ck] = true
			pairs = append(pairs, rawPair{
				diskFileName: dInfo.fileName,
				coreKey:      ck,
				title:        hdrTitle,
				hasOnDisk:    true,
				hasImg:       false,
				hasVid:       false,
				sourceLabel:  "✔ Заголовок диска (Deep Header)",
			})
		}
	}

	// Sort so ROMs actually found in the user's folder appear at the very top!
	sort.Slice(pairs, func(i, j int) bool {
		if pairs[i].hasOnDisk != pairs[j].hasOnDisk {
			return pairs[i].hasOnDisk
		}
		return pairs[i].diskFileName < pairs[j].diskFileName
	})

	anyMatchedOnDisk := false
	for _, p := range pairs {
		if p.hasOnDisk {
			anyMatchedOnDisk = true
			break
		}
	}

	// Count duplicate titles so we disambiguate with [000593]
	titleCounts := make(map[string]int)
	for _, p := range pairs {
		cleanT := strings.TrimSpace(strings.ReplaceAll(p.title, "(World)", ""))
		safeBase := strings.ToLower(SanitizeFileName(cleanT))
		titleCounts[safeBase]++
	}
	titleSeen := make(map[string]int)

	var result []XmlMappingCandidate
	for _, p := range pairs {
		ext := filepath.Ext(p.diskFileName)
		if ext == "" {
			ext = ".chd"
		}
		cleanT := strings.TrimSpace(strings.ReplaceAll(p.title, "(World)", ""))
		safeBase := SanitizeFileName(cleanT)
		lowSafe := strings.ToLower(safeBase)
		titleSeen[lowSafe]++
		if titleCounts[lowSafe] > 1 && titleSeen[lowSafe] > 1 {
			safeBase = SanitizeFileName(fmt.Sprintf("%s [%s]", safeBase, p.coreKey))
		}
		newFile := safeBase + ext

		defaultChk := true
		if anyMatchedOnDisk {
			defaultChk = p.hasOnDisk
		}

		result = append(result, XmlMappingCandidate{
			OldFileName:    p.diskFileName,
			CoreKey:        p.coreKey,
			CleanTitle:     cleanT,
			NewFileName:    newFile,
			HasRomOnDisk:   p.hasOnDisk,
			HasImage:       p.hasImg,
			HasVideo:       p.hasVid,
			DefaultChecked: defaultChk,
			SourceLabel:    p.sourceLabel,
		})
	}
	return result
}
