package aegiscore

import (
	"bytes"
	"compress/flate"
	"encoding/binary"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf16"
)

func decodeXMLEntities(s string) string {
	s = strings.ReplaceAll(s, "&amp;", "&")
	s = strings.ReplaceAll(s, "&apos;", "'")
	s = strings.ReplaceAll(s, "&#39;", "'")
	s = strings.ReplaceAll(s, "&quot;", "\"")
	s = strings.ReplaceAll(s, "&lt;", "<")
	s = strings.ReplaceAll(s, "&gt;", ">")
	return strings.TrimSpace(s)
}

func extractXMLTagValue(block, tag string) string {
	openTag := "<" + strings.ToLower(tag) + ">"
	closeTag := "</" + strings.ToLower(tag) + ">"
	lowerBlock := strings.ToLower(block)
	startIdx := strings.Index(lowerBlock, openTag)
	if startIdx == -1 {
		return ""
	}
	valStart := startIdx + len(openTag)
	endIdx := strings.Index(lowerBlock[valStart:], closeTag)
	if endIdx == -1 {
		return ""
	}
	return decodeXMLEntities(block[valStart : valStart+endIdx])
}

func IsPureNumberOrGenericTitle(s string) bool {
	trimmed := strings.TrimSpace(s)
	if trimmed == "" {
		return true
	}
	noTags := strings.TrimSpace(TagStripRegex.ReplaceAllString(trimmed, ""))
	lower := strings.ToLower(noTags)
	if lower == "007" {
		return false
	}
	if PureNumberRegex.MatchString(lower) {
		return true
	}
	switch lower {
	case "playstation", "psx", "ps1", "cd-rom", "cdrom", "game", "rom", "untitled", "unknown", "new", "track", "track01", "data":
		return true
	}
	return false
}

func normalizePS1Serial(raw string) string {
	m := ps1SerialRegex.FindStringSubmatch(raw)
	if len(m) == 4 {
		return strings.ToUpper(m[1] + m[2] + m[3])
	}
	return ""
}

// Extracts normalized numeric key from filenames like "000001 (World).chd" -> "000001", "1 (USA).pbp" -> "000001"
func ExtractCoreNumberKey(fileNameOrStem string) string {
	base := strings.TrimSpace(strings.TrimSuffix(filepath.Base(fileNameOrStem), filepath.Ext(fileNameOrStem)))
	noTags := strings.TrimSpace(TagStripRegex.ReplaceAllString(base, ""))
	lower := strings.ToLower(noTags)
	if pm := PureNumberRegex.FindStringSubmatch(lower); len(pm) >= 2 {
		if n, err := strconv.Atoi(pm[1]); err == nil && n >= 0 && n <= 999999 {
			return fmt.Sprintf("%06d", n)
		}
		return lower
	}
	return lower
}

// Extract real internal game title directly from binary ROM headers:
// Supports PS1/PSP .PBP (PARAM.SFO + PSISOIMG), PS1 .CHD (deflate hunk decompression),
// PS1 .BIN/.ISO/.IMG/.MDF/.CUE/.M3U (ISO9660 Root Directory LBA + SYSTEM.CNF + 350+ Serial DB + PS1 Memory Card Save Header),
// GBA (0xA0), GB/GBC (0x134), SNES (0x7FC0/0xFFC0), Genesis (0x150), N64 (0x20), NDS (0x68 UTF-16 Banner).
func ExtractInternalBinaryRomTitle(romPath, ext, consoleCode string) string {
	f, err := os.Open(romPath)
	if err != nil {
		return ""
	}
	defer f.Close()

	// 1. Check PS1 / PSP EBOOT.PBP (PARAM.SFO header + PSISOIMG0000 TOC/DiscID)
	if ext == ".pbp" {
		hdr := make([]byte, 0x28)
		if _, err := io.ReadFull(f, hdr); err == nil && string(hdr[0:4]) == "\x00PBP" {
			sfoOffset := binary.LittleEndian.Uint32(hdr[0x08:0x0C])
			dataOffset := binary.LittleEndian.Uint32(hdr[0x0C:0x10])
			psarOffset := binary.LittleEndian.Uint32(hdr[0x24:0x28])

			var sfoTitle, sfoDiscID string
			if sfoOffset > 0 && dataOffset > sfoOffset && (dataOffset-sfoOffset) < 65536 {
				sfoBuf := make([]byte, dataOffset-sfoOffset)
				if _, err := f.ReadAt(sfoBuf, int64(sfoOffset)); err == nil {
					sfoTitle, sfoDiscID = parseParamSFO(sfoBuf)
				}
			}

			// Check if DISC_ID or PSAR header maps to a known PS1 game
			serialKey := normalizePS1Serial(sfoDiscID)
			if serialKey == "" {
				serialKey = normalizePS1Serial(sfoTitle)
			}
			if serialKey == "" && psarOffset > 0 {
				psarBuf := make([]byte, 2048)
				if n, _ := f.ReadAt(psarBuf, int64(psarOffset)); n > 0 {
					if m := ps1SerialRegex.FindSubmatch(psarBuf[:n]); len(m) == 4 {
						serialKey = strings.ToUpper(string(m[1]) + string(m[2]) + string(m[3]))
					}
				}
			}

			if serialKey != "" {
				if mapped, ok := ps1SerialToTitle[serialKey]; ok {
					return mapped
				}
			}

			// If PARAM.SFO TITLE is a real game title (NOT a number like "000001" and NOT a raw serial), use it!
			if sfoTitle != "" && !IsPureNumberOrGenericTitle(sfoTitle) && normalizePS1Serial(sfoTitle) == "" {
				cleaned := cleanInternalHeaderString(sfoTitle)
				if len(cleaned) >= 3 && !IsPureNumberOrGenericTitle(cleaned) {
					return cleaned
				}
			}

			// Scan first 1 MB of PSAR stream inside PBP for PS1 Serial or Memory Card Title
			if psarOffset > 0 {
				psarScan := make([]byte, 1024*1024)
				if n, _ := f.ReadAt(psarScan, int64(psarOffset)); n > 0 {
					if t := extractPS1TitleFromRawBytes(psarScan[:n]); t != "" {
						return t
					}
				}
			}
		}
	}

	// 2. Check PlayStation 1 (.chd, .bin, .iso, .img, .mdf, .cue, .m3u, .ccd)
	if consoleCode == "psx" || ext == ".iso" || ext == ".bin" || ext == ".img" || ext == ".mdf" || ext == ".chd" || ext == ".cue" || ext == ".m3u" || ext == ".ccd" {
		if ext == ".chd" {
			if chdTitle := extractPS1TitleFromCHD(f); chdTitle != "" {
				return chdTitle
			}
		}

		targetFile := f
		if ext == ".cue" || ext == ".m3u" || ext == ".ccd" {
			textBytes, _ := os.ReadFile(romPath)
			textStr := string(textBytes)
			// Check if .cue or .m3u contains a PS1 serial or a real filename inside FILE "..."
			if m := ps1SerialRegex.FindStringSubmatch(textStr); len(m) == 4 {
				serialKey := strings.ToUpper(m[1] + m[2] + m[3])
				if knownTitle, ok := ps1SerialToTitle[serialKey]; ok {
					return knownTitle
				}
			}
			// Find companion .bin / .img / .iso / .chd / .pbp in the same directory
			romDir := filepath.Dir(romPath)
			baseNoExt := strings.TrimSuffix(filepath.Base(romPath), filepath.Ext(romPath))
			for _, compExt := range []string{".bin", ".BIN", ".img", ".IMG", ".iso", ".ISO", ".chd", ".CHD", ".pbp", ".PBP"} {
				compPath := filepath.Join(romDir, baseNoExt+compExt)
				if bf, err := os.Open(compPath); err == nil {
					defer bf.Close()
					if strings.EqualFold(compExt, ".chd") {
						if chdTitle := extractPS1TitleFromCHD(bf); chdTitle != "" {
							return chdTitle
						}
					}
					targetFile = bf
					break
				}
			}
		}

		if discTitle := extractPS1TitleFromDiscFile(targetFile); discTitle != "" {
			return discTitle
		}

		// Fallback: check if any existing image/video in images/ or videos/ starts with this number and has a title attached
		if mediaTitle := extractTitleFromCompanionMediaFile(romPath); mediaTitle != "" {
			return mediaTitle
		}
	}

	// 3. Game Boy Advance (.gba) -> offset 0xA0 (12 bytes ASCII)
	if ext == ".gba" || consoleCode == "gba" {
		buf := make([]byte, 16)
		if _, err := f.ReadAt(buf, 0xA0); err == nil {
			title := cleanInternalHeaderString(string(buf[:12]))
			if len(title) >= 3 && !IsPureNumberOrGenericTitle(title) {
				return title
			}
		}
	}

	// 4. Game Boy / Game Boy Color (.gb, .gbc) -> offset 0x134 (15 bytes ASCII)
	if ext == ".gb" || ext == ".gbc" || consoleCode == "gb" || consoleCode == "gbc" {
		buf := make([]byte, 15)
		if _, err := f.ReadAt(buf, 0x0134); err == nil {
			title := cleanInternalHeaderString(string(buf))
			if len(title) >= 3 && !IsPureNumberOrGenericTitle(title) {
				return title
			}
		}
	}

	// 5. Super Nintendo (.sfc, .smc) -> LoROM 0x7FC0 or HiROM 0xFFC0 (21 bytes ASCII)
	if ext == ".sfc" || ext == ".smc" || consoleCode == "snes" {
		fi, err := f.Stat()
		if err == nil {
			skip := int64(0)
			if fi.Size()%1024 == 512 {
				skip = 512
			}
			for _, off := range []int64{0x7FC0 + skip, 0xFFC0 + skip} {
				buf := make([]byte, 21)
				if _, err := f.ReadAt(buf, off); err == nil {
					if isPrintableASCII(buf) {
						title := cleanInternalHeaderString(string(buf))
						if len(title) >= 3 && !IsPureNumberOrGenericTitle(title) {
							return title
						}
					}
				}
			}
		}
	}

	// 6. Sega Mega Drive / Genesis (.md, .gen, .bin) -> 0x150 (48 bytes Overseas Title) or 0x120
	if ext == ".md" || ext == ".gen" || ext == ".smd" || consoleCode == "genesis" {
		sig := make([]byte, 16)
		if _, err := f.ReadAt(sig, 0x100); err == nil && strings.Contains(string(sig), "SEGA") {
			for _, off := range []int64{0x150, 0x120} {
				buf := make([]byte, 48)
				if _, err := f.ReadAt(buf, off); err == nil {
					title := cleanInternalHeaderString(string(buf))
					if len(title) >= 3 && !IsPureNumberOrGenericTitle(title) {
						return title
					}
				}
			}
		}
	}

	// 7. Nintendo 64 (.z64, .n64, .v64) -> 0x20 (20 bytes ASCII)
	if ext == ".z64" || ext == ".n64" || ext == ".v64" || consoleCode == "n64" {
		buf := make([]byte, 20)
		if _, err := f.ReadAt(buf, 0x20); err == nil && isPrintableASCII(buf) {
			title := cleanInternalHeaderString(string(buf))
			if len(title) >= 3 && !IsPureNumberOrGenericTitle(title) {
				return title
			}
		}
	}

	// 8. Nintendo DS (.nds) -> Banner Offset at 0x68 (uint32 LE), English UTF-16LE title at banner + 0x240
	if ext == ".nds" || consoleCode == "nds" {
		ptrBuf := make([]byte, 4)
		if _, err := f.ReadAt(ptrBuf, 0x68); err == nil {
			bannerOff := int64(binary.LittleEndian.Uint32(ptrBuf))
			if bannerOff > 0 {
				utf16Buf := make([]byte, 256)
				if _, err := f.ReadAt(utf16Buf, bannerOff+0x240); err == nil {
					u16s := make([]uint16, 128)
					for i := 0; i < 128; i++ {
						u16s[i] = binary.LittleEndian.Uint16(utf16Buf[i*2 : i*2+2])
						if u16s[i] == 0 {
							u16s = u16s[:i]
							break
						}
					}
					decoded := strings.ReplaceAll(string(utf16.Decode(u16s)), "\n", " - ")
					title := cleanInternalHeaderString(decoded)
					if len(title) >= 3 && !IsPureNumberOrGenericTitle(title) {
						return title
					}
				}
			}
		}
	}

	return ""
}

// Extract PS1 game title from .BIN / .ISO / .IMG / .MDF disc image by following ISO9660 Root Directory LBA -> SYSTEM.CNF & Boot EXE
func extractPS1TitleFromDiscFile(f *os.File) string {
	// Read first 256 KB to locate ISO9660 Primary Volume Descriptor ("\x01CD001")
	headChunk := make([]byte, 256*1024)
	n, _ := f.ReadAt(headChunk, 0)
	if n <= 0 {
		return ""
	}
	headChunk = headChunk[:n]

	var volID string
	idx := bytes.Index(headChunk, []byte("\x01CD001"))
	if idx != -1 && idx+190 <= len(headChunk) {
		volID = strings.TrimSpace(string(bytes.Trim(headChunk[idx+40:idx+72], "\x00 ")))

		// Determine sector size (2352 for raw BIN/IMG/MDF vs 2048 for ISO)
		sectorSize := int64(2048)
		if idx > 34000 {
			sectorSize = 2352
		}

		// ISO9660 Root Directory Record is at offset 156 of Primary Volume Descriptor; Extent LBA is at 156+2 = 158 (uint32 LE)
		rootLBA := int64(binary.LittleEndian.Uint32(headChunk[idx+158 : idx+162]))
		if rootLBA >= 16 && rootLBA < 450000 {
			rootDirBuf := make([]byte, 64*1024)
			rn, _ := f.ReadAt(rootDirBuf, rootLBA*sectorSize)
			if rn > 0 {
				rootDirBuf = rootDirBuf[:rn]
				// 1. Check if the Root Directory entries contain SYSTEM.CNF or a PS1 Serial executable name (SLUS_xxx.xx;1)
				if sysIdx := bytes.Index(bytes.ToUpper(rootDirBuf), []byte("SYSTEM.CNF")); sysIdx >= 33 {
					sysLBA := int64(binary.LittleEndian.Uint32(rootDirBuf[sysIdx-31 : sysIdx-27]))
					if sysLBA >= 16 && sysLBA < 450000 {
						sysBuf := make([]byte, 4096)
						if sn, _ := f.ReadAt(sysBuf, sysLBA*sectorSize); sn > 0 {
							if m := ps1SerialRegex.FindSubmatch(sysBuf[:sn]); len(m) == 4 {
								serialKey := strings.ToUpper(string(m[1]) + string(m[2]) + string(m[3]))
								if known, ok := ps1SerialToTitle[serialKey]; ok {
									return known
								}
							}
						}
					}
				}

				// 2. Scan Root Directory for any PS1 Serial filename (SLUS_xxx.xx, SCUS_xxx.xx, SLES_xxx.xx, etc.)
				if m := ps1SerialRegex.FindSubmatchIndex(rootDirBuf); len(m) >= 8 {
					prefix := string(rootDirBuf[m[2]:m[3]])
					part1 := string(rootDirBuf[m[4]:m[5]])
					part2 := string(rootDirBuf[m[6]:m[7]])
					serialKey := strings.ToUpper(prefix + part1 + part2)
					if known, ok := ps1SerialToTitle[serialKey]; ok {
						return known
					}
					// If serial is not in our static dictionary, jump to the Boot Executable's LBA to read its PS1 Memory Card Save Header!
					if m[0] >= 33 {
						exeLBA := int64(binary.LittleEndian.Uint32(rootDirBuf[m[0]-31 : m[0]-27]))
						if exeLBA >= 16 && exeLBA < 450000 {
							exeBuf := make([]byte, 512*1024)
							if en, _ := f.ReadAt(exeBuf, exeLBA*sectorSize); en > 0 {
								if mcTitle := extractPS1MemoryCardTitle(exeBuf[:en]); mcTitle != "" {
									return mcTitle
								}
							}
						}
					}
				}
			}
		}
	}

	// Scan up to the first 6 MB of the disc image for PS1 Serial or PS1 Memory Card Save Header Title
	const chunkSize = 1024 * 1024
	buf := make([]byte, chunkSize)
	var fallbackMemCardTitle string
	for off := int64(0); off < 6*chunkSize; off += chunkSize {
		rn, _ := f.ReadAt(buf, off)
		if rn <= 0 {
			break
		}
		slice := buf[:rn]
		if m := ps1SerialRegex.FindSubmatch(slice); len(m) == 4 {
			serialKey := strings.ToUpper(string(m[1]) + string(m[2]) + string(m[3]))
			if known, ok := ps1SerialToTitle[serialKey]; ok {
				return known
			}
		}
		if fallbackMemCardTitle == "" {
			fallbackMemCardTitle = extractPS1MemoryCardTitle(slice)
		}
	}

	if fallbackMemCardTitle != "" {
		return fallbackMemCardTitle
	}

	if volID != "" && len(volID) >= 3 && !IsPureNumberOrGenericTitle(volID) && normalizePS1Serial(volID) == "" {
		return cleanInternalHeaderString(volID)
	}

	return ""
}

// Decompress first hunks of MAME Compressed Hunks of Data (.CHD v5) to extract PS1 Serial, Memory Card Title, or ISO9660 Volume ID
func extractPS1TitleFromCHD(f *os.File) string {
	hdr := make([]byte, 124)
	if _, err := f.ReadAt(hdr, 0); err != nil || string(hdr[0:8]) != "MComprHD" {
		return ""
	}
	version := binary.BigEndian.Uint32(hdr[12:16])
	if version == 5 {
		hunkBytes := binary.BigEndian.Uint32(hdr[56:60])
		unitBytes := binary.BigEndian.Uint32(hdr[60:64])
		mapOffset := int64(binary.BigEndian.Uint64(hdr[40:48]))
		if hunkBytes > 0 && hunkBytes <= 256*1024 && mapOffset > 0 {
			frames := int(hunkBytes) / 2448
			if unitBytes > 0 {
				frames = int(hunkBytes) / int(unitBytes)
			}
			if frames <= 0 {
				frames = 8
			}
			eccBytes := (frames + 7) / 8
			compLenBytes := 2
			if hunkBytes >= 65536 {
				compLenBytes = 3
			}
			cdzlHdrLen := compLenBytes + eccBytes

			const maxHunksToScan = 48
			mapBuf := make([]byte, maxHunksToScan*12)
			if mn, _ := f.ReadAt(mapBuf, mapOffset); mn >= 12 {
				var decompStream bytes.Buffer
				numHunks := mn / 12
				for h := 0; h < numHunks; h++ {
					entry := mapBuf[h*12 : (h+1)*12]
					compType := entry[0]
					compLen := int(entry[1])<<16 | int(entry[2])<<8 | int(entry[3])
					blockOff := int64(entry[4])<<40 | int64(entry[5])<<32 | int64(entry[6])<<24 | int64(entry[7])<<16 | int64(entry[8])<<8 | int64(entry[9])
					if compLen <= 4 || compLen > 256*1024 || blockOff <= 0 {
						continue
					}
					cBuf := make([]byte, compLen)
					if cn, _ := f.ReadAt(cBuf, blockOff); cn == compLen {
						if compType == 4 {
							decompStream.Write(cBuf)
						} else if compType <= 3 {
							// Try cdzl deflate offset first, then fallback offsets
							for _, skip := range []int{cdzlHdrLen, 3, 4, 2, 0} {
								if skip >= len(cBuf) {
									continue
								}
								fr := flate.NewReader(bytes.NewReader(cBuf[skip:]))
								out, _ := io.ReadAll(io.LimitReader(fr, int64(hunkBytes)))
								_ = fr.Close()
								if len(out) >= 2048 {
									decompStream.Write(out)
									break
								}
							}
						}
					}
					if decompStream.Len() >= 512*1024 {
						break
					}
				}
				if decompStream.Len() > 0 {
					if t := extractPS1TitleFromRawBytes(decompStream.Bytes()); t != "" {
						return t
					}
				}
			}
		}
	}

	// Fallback raw scan on first 2 MB of CHD
	raw := make([]byte, 2*1024*1024)
	if n, _ := f.ReadAt(raw, 0); n > 0 {
		if t := extractPS1TitleFromRawBytes(raw[:n]); t != "" {
			return t
		}
	}
	return ""
}

func extractPS1TitleFromRawBytes(data []byte) string {
	if m := ps1SerialRegex.FindSubmatch(data); len(m) == 4 {
		serialKey := strings.ToUpper(string(m[1]) + string(m[2]) + string(m[3]))
		if known, ok := ps1SerialToTitle[serialKey]; ok {
			return known
		}
	}
	if mc := extractPS1MemoryCardTitle(data); mc != "" {
		return mc
	}
	if idx := bytes.Index(data, []byte("\x01CD001")); idx != -1 && idx+72 <= len(data) {
		volID := strings.TrimSpace(string(bytes.Trim(data[idx+40:idx+72], "\x00 ")))
		if len(volID) >= 3 && !IsPureNumberOrGenericTitle(volID) && normalizePS1Serial(volID) == "" {
			return cleanInternalHeaderString(volID)
		}
	}
	return ""
}

// Extract official game title from Sony PS1 Memory Card 128-byte Save Header ("SC" + 0x11/0x12/0x13 + Shift-JIS/ASCII Title)
func extractPS1MemoryCardTitle(data []byte) string {
	for i := 0; i+96 <= len(data); i++ {
		if data[i] != 'S' || data[i+1] != 'C' {
			continue
		}
		iconFlag := data[i+2]
		blockCnt := data[i+3]
		if (iconFlag != 0x11 && iconFlag != 0x12 && iconFlag != 0x13) || blockCnt < 1 || blockCnt > 15 {
			continue
		}
		// Check reserved zero bytes at offset 68..79 to confirm genuine PS1 Memory Card header
		zeroes := 0
		for z := 68; z < 80; z++ {
			if data[i+z] == 0 {
				zeroes++
			}
		}
		if zeroes < 8 {
			continue
		}

		titleBytes := data[i+4 : i+68]
		decoded := decodePS1ShiftJISOrASCII(titleBytes)
		cleaned := cleanInternalHeaderString(decoded)
		if len(cleaned) >= 4 && !IsPureNumberOrGenericTitle(cleaned) && normalizePS1Serial(cleaned) == "" {
			return cleaned
		}
	}
	return ""
}

func decodePS1ShiftJISOrASCII(b []byte) string {
	var out strings.Builder
	for i := 0; i < len(b); i++ {
		c := b[i]
		if c == 0 {
			break
		}
		// Shift-JIS 2-byte full-width ASCII characters (0x81 / 0x82)
		if (c == 0x81 || c == 0x82) && i+1 < len(b) {
			c2 := b[i+1]
			i++
			if c == 0x81 {
				switch c2 {
				case 0x40:
					out.WriteByte(' ')
				case 0x44:
					out.WriteByte('.')
				case 0x46:
					out.WriteByte(':')
				case 0x49:
					out.WriteByte('!')
				case 0x5B, 0x7C:
					out.WriteByte('-')
				case 0x5E:
					out.WriteByte('/')
				case 0x66:
					out.WriteByte('\'')
				case 0x95:
					out.WriteByte('&')
				default:
					out.WriteByte(' ')
				}
			} else if c == 0x82 {
				if c2 >= 0x4F && c2 <= 0x58 {
					out.WriteByte('0' + (c2 - 0x4F))
				} else if c2 >= 0x60 && c2 <= 0x79 {
					out.WriteByte('A' + (c2 - 0x60))
				} else if c2 >= 0x81 && c2 <= 0x9A {
					out.WriteByte('a' + (c2 - 0x81))
				}
			}
			continue
		}
		if c >= 32 && c <= 126 {
			out.WriteByte(c)
		} else {
			break
		}
	}
	return strings.TrimSpace(out.String())
}

// Check if any media file in images/ or videos/ starts with the ROM's number and has a real title attached (e.g. "000001 - Tekken 3.png")
func extractTitleFromCompanionMediaFile(romPath string) string {
	romDir := filepath.Dir(romPath)
	baseNoExt := strings.ToLower(strings.TrimSuffix(filepath.Base(romPath), filepath.Ext(romPath)))
	if !PureNumberRegex.MatchString(baseNoExt) {
		return ""
	}
	for _, sub := range []string{"images", "downloaded_images", "download_images", "boxart", "videos"} {
		mDir := filepath.Join(romDir, sub)
		entries, err := os.ReadDir(mDir)
		if err != nil {
			continue
		}
		for _, e := range entries {
			if e.IsDir() {
				continue
			}
			nameNoExt := strings.TrimSuffix(e.Name(), filepath.Ext(e.Name()))
			lower := strings.ToLower(nameNoExt)
			for _, sfx := range []string{"-image", "-thumb", "-boxart", "-snap", "-marquee", "-video"} {
				if strings.HasSuffix(lower, sfx) {
					nameNoExt = nameNoExt[:len(nameNoExt)-len(sfx)]
					lower = strings.ToLower(nameNoExt)
					break
				}
			}
			if strings.HasPrefix(lower, baseNoExt) && len(nameNoExt) > len(baseNoExt)+2 {
				stripped := stripLeadingIndexExcept007(nameNoExt)
				if stripped != "" && !IsPureNumberOrGenericTitle(stripped) {
					return stripped
				}
			}
		}
	}
	return ""
}

// Parse Sony PARAM.SFO binary table (inside PS1/PSP .PBP files) to extract TITLE and DISC_ID
func parseParamSFO(sfo []byte) (title string, discID string) {
	if len(sfo) < 20 || string(sfo[0:4]) != "\x00PSF" {
		return "", ""
	}
	keyTableStart := binary.LittleEndian.Uint32(sfo[0x08:0x0C])
	dataTableStart := binary.LittleEndian.Uint32(sfo[0x0C:0x10])
	numEntries := binary.LittleEndian.Uint32(sfo[0x10:0x14])
	if numEntries > 256 || int(keyTableStart) >= len(sfo) || int(dataTableStart) >= len(sfo) {
		return "", ""
	}

	for i := uint32(0); i < numEntries; i++ {
		entryOff := 20 + i*16
		if int(entryOff+16) > len(sfo) {
			break
		}
		keyOff := uint32(binary.LittleEndian.Uint16(sfo[entryOff : entryOff+2]))
		dataLen := binary.LittleEndian.Uint32(sfo[entryOff+4 : entryOff+8])
		dataOff := binary.LittleEndian.Uint32(sfo[entryOff+12 : entryOff+16])

		absKey := keyTableStart + keyOff
		absData := dataTableStart + dataOff
		if int(absKey) >= len(sfo) || int(absData+dataLen) > len(sfo) {
			continue
		}

		// Read null-terminated key name
		keyEnd := absKey
		for int(keyEnd) < len(sfo) && sfo[keyEnd] != 0 {
			keyEnd++
		}
		keyName := string(sfo[absKey:keyEnd])
		val := strings.TrimRight(string(sfo[absData:absData+dataLen]), "\x00 ")

		if keyName == "TITLE" && val != "" {
			title = val
		} else if keyName == "DISC_ID" && val != "" {
			discID = val
		}
	}
	return title, discID
}

func isPrintableASCII(b []byte) bool {
	printable := 0
	for _, c := range b {
		if c == 0 {
			break
		}
		if c >= 32 && c <= 126 {
			printable++
		} else {
			return false
		}
	}
	return printable >= 3
}

func cleanInternalHeaderString(raw string) string {
	var b strings.Builder
	for _, r := range raw {
		if r >= 32 && r != 127 {
			b.WriteRune(r)
		}
	}
	s := strings.TrimSpace(b.String())
	s = strings.ReplaceAll(s, "_", " ")
	fields := strings.Fields(s)
	s = strings.Join(fields, " ")
	// Convert ALL-CAPS internal cartridge headers (like "SUPER MARIO WORLD") to Title Case
	if s == strings.ToUpper(s) && len(s) > 4 {
		words := strings.Fields(strings.ToLower(s))
		for i, w := range words {
			if w == "ii" || w == "iii" || w == "iv" || w == "vi" || w == "vii" || w == "viii" {
				words[i] = strings.ToUpper(w)
			} else if len(w) > 0 {
				runes := []rune(w)
				runes[0] = unicode.ToUpper(runes[0])
				words[i] = string(runes)
			}
		}
		return strings.Join(words, " ")
	}
	return s
}

// Explicit exception for Agent 007 (James Bond) games so "007" is never stripped or caught in an endless rename loop!
func IsJamesBond007Game(text string) bool {
	lower := strings.ToLower(strings.TrimSpace(text))
	if lower == "" {
		return false
	}
	bondKeywords := []string{
		"james bond", "agent 007", "goldeneye", "tomorrow never dies",
		"world is not enough", "nightfire", "agent under fire",
		"everything or nothing", "from russia with love", "007 racing",
		"goldfinger", "licence to kill", "license to kill", "live and let die",
		"view to a kill", "spy who loved me", "octopussy", "moonraker",
		"quantum of solace", "blood stone", "007: ", "007 - ", "007 (",
		"007 [", "007_", "duel 007", "007 duel",
	}
	for _, kw := range bondKeywords {
		if strings.Contains(lower, kw) {
			return true
		}
	}
	return false
}

func CountLettersInString(s string) int {
	cnt := 0
	for _, r := range s {
		if unicode.IsLetter(r) {
			cnt++
		}
	}
	return cnt
}

// Strip leading catalog index numbers (e.g. "001 - Super Mario", "02. Contra"), EXCEPT when the number is "007"
// OR when stripping the number would leave no real alphabetic title (preventing "000001 (World)" -> "(World)" bug)!
func stripLeadingIndexExcept007(s string) string {
	if IsJamesBond007Game(s) {
		return s
	}
	for i := 0; i < 2; i++ {
		m := leadingNumRegex.FindStringSubmatchIndex(s)
		if len(m) >= 4 {
			numStr := s[m[2]:m[3]]
			if numStr == "007" {
				// Preserve "007" prefix for Agent 007 games!
				break
			}
			remainder := strings.TrimSpace(s[m[1]:])
			remWithoutTags := strings.TrimSpace(TagStripRegex.ReplaceAllString(remainder, ""))
			if CountLettersInString(remWithoutTags) < 2 {
				// Do NOT strip the number if there is no alphabetic title after it!
				break
			}
			s = remainder
		} else {
			break
		}
	}
	return s
}

func BuildComparisonKey(cleanTitle string) string {
	s := strings.ToLower(cleanTitle)
	s = stripLeadingIndexExcept007(s)

	romanPairs := []struct{ rom, dig string }{
		{" viii ", " 8 "}, {" vii ", " 7 "}, {" vi ", " 6 "},
		{" iv ", " 4 "}, {" iii ", " 3 "}, {" ii ", " 2 "},
	}
	s = " " + s + " "
	for _, rp := range romanPairs {
		s = strings.ReplaceAll(s, rp.rom, rp.dig)
	}

	words := strings.FieldsFunc(s, func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r)
	})

	noiseWords := map[string]bool{
		"the": true, "and": true, "version": true, "edition": true,
		"rus": true, "russian": true, "ru": true, "eng": true, "english": true,
		"usa": true, "eur": true, "europe": true, "japan": true, "jpn": true, "world": true,
		"rev": true, "v1": true, "v2": true, "top": true, "top100": true,
		"рус": true, "русская": true, "версия": true, "перевод": true,
	}

	var kept []string
	for _, w := range words {
		if noiseWords[w] {
			continue
		}
		kept = append(kept, w)
	}

	res := strings.Join(kept, "")
	if res == "" {
		return strings.ReplaceAll(strings.ToLower(cleanTitle), " ", "")
	}
	return res
}

func ExtractCleanTitle(fileName string) string {
	ext := filepath.Ext(fileName)
	rawBase := strings.TrimSpace(strings.TrimSuffix(fileName, ext))

	// First strip region/bracket tags like "(World)" or "(USA)" BEFORE checking if it's a pure number!
	withoutTags := strings.TrimSpace(TagStripRegex.ReplaceAllString(rawBase, " "))
	if PureNumberRegex.MatchString(strings.ToLower(withoutTags)) {
		return withoutTags
	}

	base := stripLeadingIndexExcept007(withoutTags)
	base = strings.ReplaceAll(base, "_", " ")
	base = strings.ReplaceAll(base, ".", " ")

	tokens := strings.Fields(base)
	var filtered []string
	for _, t := range tokens {
		up := strings.ToUpper(t)
		if up == "USA" || up == "EUR" || up == "EUROPE" || up == "JAPAN" || up == "JPN" ||
			up == "WORLD" || up == "RUS" || up == "RUSSIAN" || up == "RU" ||
			up == "V1" || up == "V1.0" || up == "V1.1" || up == "TOP100" ||
			up == "РУС" || up == "РУССКАЯ" || up == "ВЕРСИЯ" {
			continue
		}
		filtered = append(filtered, t)
	}
	candidate := strings.Join(filtered, " ")
	if len(filtered) == 0 || CountLettersInString(candidate) < 2 {
		if withoutTags != "" {
			return withoutTags
		}
		return rawBase
	}
	return candidate
}

func ParseRegion(name string, isRus bool) string {
	if isRus {
		return "Russia"
	}
	m := regionRegex.FindStringSubmatch(name)
	if len(m) > 1 {
		r := strings.ToUpper(m[1])
		switch r {
		case "U", "US", "USA", "UE", "JU":
			return "USA"
		case "E", "EUR", "EUROPE", "EN,FR,DE":
			return "Europe"
		case "J", "JPN", "JAPAN", "EN,JA":
			return "Japan"
		case "W", "WORLD":
			return "World"
		case "RUSSIA", "RUS", "RU":
			return "Russia"
		default:
			return m[1]
		}
	}
	lower := strings.ToLower(name)
	if strings.Contains(lower, "usa") {
		return "USA"
	}
	if strings.Contains(lower, "eur") || strings.Contains(lower, "pal") {
		return "Europe"
	}
	if strings.Contains(lower, "jap") || strings.Contains(lower, "jpn") {
		return "Japan"
	}
	return "World"
}

func parseRevision(name string) string {
	m := revisionRegex.FindStringSubmatch(name)
	if len(m) > 1 {
		return m[1]
	}
	return ""
}
