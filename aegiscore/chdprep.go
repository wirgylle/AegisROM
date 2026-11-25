package aegiscore

// Подготовка входа для chdman createcd / Preparing the input for chdman createcd.
//
// RU: chdman понимает только .cue, .gdi, .toc, .nrg и .iso. Всё остальное (.bin без .cue, .img, .ccd,
// .mdf) он читает как текстовый .toc, находит 0 дорожек и бесконечно крутит «Compressing, -nan%»,
// оставляя CHD из одного заголовка (124 байта). Проверено на chdman 0.264.
// ISO с секторами по 2048 байт chdman пишет как дорожку MODE1 без сырых секторов. PCSX ReARMed
// (основное ядро PS1 на R36S/ArkOS) читает из CHD сырые кадры по 2352 байта и такой диск не
// запускает (libpcsxcore/cdriso.c, cdread_chd). Поэтому образ PS1 на 2048 перестраивается в
// MODE2/2352 (Form 1, с EDC/ECC) до вызова chdman.
//
// EN: chdman only understands .cue, .gdi, .toc, .nrg and .iso. Anything else (.bin without .cue, .img,
// .ccd, .mdf) is read as a text .toc, yields 0 tracks and spins on "Compressing, -nan%" forever, leaving
// a header-only 124-byte CHD. Checked with chdman 0.264.
// A 2048-byte-sector ISO becomes a MODE1 track without raw sectors. PCSX ReARMed (the main PS1 core on
// R36S/ArkOS) reads raw 2352-byte frames from a CHD and cannot boot such a disc (libpcsxcore/cdriso.c,
// cdread_chd). So a 2048-byte PS1 image is rebuilt as MODE2/2352 (Form 1, with EDC/ECC) before chdman.

import (
	"bufio"
	"bytes"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// ChdmanCDCodecs pins the classic CD codecs every libchdr build reads (no Zstandard).
const ChdmanCDCodecs = "cdlz,cdzl,cdfl"

// ChdmanCreateCDArgs returns the chdman arguments for a CD CHD.
func ChdmanCreateCDArgs(input, output string) []string {
	return []string{"createcd", "-f", "-c", ChdmanCDCodecs, "-i", input, "-o", output}
}

var cdSync = []byte{0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x00}

// DiscLayout describes a raw single-track disc image.
type DiscLayout struct {
	SectorSize  int  // 2048, 2352 or 2448
	DataOffset  int  // 16 (MODE1) or 24 (MODE2 XA) for raw sectors, 0 for 2048
	PlayStation bool // ISO9660 system identifier says PLAYSTATION
}

// InspectDiscImage guesses the sector size and mode of a single-track image.
func InspectDiscImage(path string) (DiscLayout, int64, error) {
	f, err := os.Open(path)
	if err != nil {
		return DiscLayout{}, 0, err
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		return DiscLayout{}, 0, err
	}
	head := make([]byte, 20*2448)
	n, _ := io.ReadFull(f, head)
	head = head[:n]
	l := DiscLayout{SectorSize: 2048}
	switch {
	case len(head) >= 2460 && bytes.HasPrefix(head, cdSync) && bytes.Equal(head[2448:2460], cdSync):
		l.SectorSize = 2448
	case len(head) >= 2364 && bytes.HasPrefix(head, cdSync) && bytes.Equal(head[2352:2364], cdSync):
		l.SectorSize = 2352
	case st.Size()%2048 != 0 && st.Size()%2448 == 0 && st.Size()%2352 != 0:
		l.SectorSize = 2448
	case st.Size()%2048 != 0 && st.Size()%2352 == 0:
		l.SectorSize = 2352
	}
	pvd := 16 * l.SectorSize
	if l.SectorSize == 2048 {
		l.PlayStation = len(head) >= pvd+40 && strings.HasPrefix(string(head[pvd+8:pvd+40]), "PLAYSTATION")
	} else {
		l.DataOffset = 24
		if len(head) > pvd+15 && head[pvd+15] == 1 {
			l.DataOffset = 16
		}
		base := pvd + l.DataOffset
		l.PlayStation = len(head) >= base+40 && strings.HasPrefix(string(head[base+8:base+40]), "PLAYSTATION")
	}
	return l, st.Size(), nil
}

// PrepareCDInput turns whatever the user picked into something chdman createcd reads correctly.
// entry is the main file in tmpDir (companion files are already next to it). console is a short code
// or "". It returns the path to pass to chdman and short notes for the log.
func PrepareCDInput(entry, tmpDir, baseName, console string) (string, []string, error) {
	ext := strings.ToLower(filepath.Ext(entry))
	psx := isPSXConsole(console)
	switch ext {
	case ".cue":
		fixed, notes, err := fixCueFileRefs(entry, tmpDir)
		if err != nil {
			return "", notes, err
		}
		return fixed, notes, nil
	case ".gdi", ".toc", ".nrg":
		return entry, nil, nil
	case ".mds":
		mdf := findSibling(tmpDir, entry, ".mdf")
		if mdf == "" {
			return "", nil, errors.New("нет .mdf рядом с .mds / no .mdf next to the .mds")
		}
		return rawImageToCue(mdf, tmpDir, baseName, psx)
	case ".ccd":
		img := findSibling(tmpDir, entry, ".img")
		if img == "" {
			return "", nil, errors.New("нет .img рядом с .ccd / no .img next to the .ccd")
		}
		return rawImageToCue(img, tmpDir, baseName, psx)
	default: // .iso, .bin, .img, .mdf and anything else
		return rawImageToCue(entry, tmpDir, baseName, psx)
	}
}

func isPSXConsole(c string) bool {
	switch strings.ToLower(strings.TrimSpace(c)) {
	case "psx", "ps1", "playstation", "ps":
		return true
	}
	return false
}

// rawImageToCue writes a .cue for a single-track image. 2352-byte images are referenced in place,
// 2448-byte ones are stripped of subchannel data, 2048-byte PS1 images are rebuilt as MODE2/2352.
func rawImageToCue(img, tmpDir, baseName string, psx bool) (string, []string, error) {
	l, size, err := InspectDiscImage(img)
	if err != nil {
		return "", nil, err
	}
	if size < 32768 {
		return "", nil, fmt.Errorf("образ %s слишком мал (%d Б) / image too small", filepath.Base(img), size)
	}
	cue := filepath.Join(tmpDir, baseName+"_aegis.cue")
	var notes []string
	dataFile := img
	mode := "MODE2/2352"
	switch l.SectorSize {
	case 2448:
		dataFile = filepath.Join(tmpDir, baseName+"_aegis.bin")
		if err := stripSubchannel(img, dataFile); err != nil {
			return "", nil, err
		}
		if l.DataOffset == 16 {
			mode = "MODE1/2352"
		}
		notes = append(notes, "2448 → 2352 (subchannel removed)")
	case 2352:
		if l.DataOffset == 16 {
			mode = "MODE1/2352"
		}
	default: // 2048
		if psx || l.PlayStation {
			dataFile = filepath.Join(tmpDir, baseName+"_aegis.bin")
			if err := ConvertISO2048ToMode2Raw(img, dataFile); err != nil {
				return "", nil, err
			}
			notes = append(notes, "PS1 ISO 2048 → MODE2/2352 (для PCSX ReARMed / for PCSX ReARMed). ISO 2048 не хранит XA-аудио и видео Form 2: если игра их использует, нужен исходный .bin/.cue / ISO 2048 lacks XA Form 2 audio/video; use the original .bin/.cue if the game needs them")
		} else {
			mode = "MODE1/2048"
		}
	}
	// .cue лежит в tmpDir рядом с образом: chdman ищет FILE относительно .cue.
	// The .cue sits in tmpDir next to the image: chdman resolves FILE relative to the .cue.
	body := fmt.Sprintf("FILE \"%s\" BINARY\r\n  TRACK 01 %s\r\n    INDEX 01 00:00:00\r\n", filepath.Base(dataFile), mode)
	if err := os.WriteFile(cue, []byte(body), 0o644); err != nil {
		return "", nil, err
	}
	return cue, notes, nil
}

func findSibling(dir, entry, ext string) string {
	stem := strings.TrimSuffix(filepath.Base(entry), filepath.Ext(entry))
	var any string
	ents, _ := os.ReadDir(dir)
	for _, e := range ents {
		name := e.Name()
		if e.IsDir() || !strings.EqualFold(filepath.Ext(name), ext) {
			continue
		}
		if strings.EqualFold(strings.TrimSuffix(name, filepath.Ext(name)), stem) {
			return filepath.Join(dir, name)
		}
		if any == "" {
			any = filepath.Join(dir, name)
		}
	}
	return any
}

var cueFileRe = regexp.MustCompile(`(?i)^(\s*FILE\s+)("([^"]*)"|(\S+))(\s+.*)$`)

// fixCueFileRefs checks that every FILE in the .cue exists in tmpDir. Paths and wrong letter case are
// rewritten to the uploaded file names (uploads keep only base names). A missing track is an error.
func fixCueFileRefs(cuePath, tmpDir string) (string, []string, error) {
	raw, err := os.ReadFile(cuePath)
	if err != nil {
		return "", nil, err
	}
	raw = bytes.TrimPrefix(raw, []byte{0xEF, 0xBB, 0xBF})
	byLower := map[string]string{}
	if ents, err := os.ReadDir(tmpDir); err == nil {
		for _, e := range ents {
			if !e.IsDir() {
				byLower[strings.ToLower(e.Name())] = e.Name()
			}
		}
	}
	var out bytes.Buffer
	var notes []string
	var missing []string
	changed := false
	sc := bufio.NewScanner(bytes.NewReader(raw))
	sc.Buffer(make([]byte, 64*1024), 1<<20)
	for sc.Scan() {
		line := sc.Text()
		if m := cueFileRe.FindStringSubmatch(line); m != nil {
			ref := m[3]
			if ref == "" {
				ref = m[4]
			}
			base := filepath.Base(strings.ReplaceAll(ref, `\`, `/`))
			real, ok := byLower[strings.ToLower(base)]
			if !ok {
				missing = append(missing, ref)
			} else if real != ref {
				line = m[1] + `"` + real + `"` + m[5]
				changed = true
				notes = append(notes, fmt.Sprintf("cue: %s → %s", ref, real))
			}
		}
		out.WriteString(line)
		out.WriteString("\r\n")
	}
	if len(missing) > 0 {
		return "", notes, fmt.Errorf("в .cue указаны файлы, которых нет: %s / the .cue lists missing files: %s",
			strings.Join(missing, ", "), strings.Join(missing, ", "))
	}
	if !changed {
		return cuePath, notes, nil
	}
	fixed := strings.TrimSuffix(cuePath, filepath.Ext(cuePath)) + "_aegis.cue"
	if err := os.WriteFile(fixed, out.Bytes(), 0o644); err != nil {
		return "", notes, err
	}
	return fixed, notes, nil
}

func stripSubchannel(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	w := bufio.NewWriterSize(out, 1<<20)
	buf := make([]byte, 2448)
	for {
		if _, err := io.ReadFull(in, buf); err != nil {
			if err == io.EOF || err == io.ErrUnexpectedEOF {
				break
			}
			out.Close()
			return err
		}
		if _, err := w.Write(buf[:2352]); err != nil {
			out.Close()
			return err
		}
	}
	if err := w.Flush(); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}

// ConvertISO2048ToMode2Raw rebuilds 2048-byte sectors as raw MODE2 Form 1 sectors (2352 bytes:
// sync, MSF header from 00:02:00, XA subheader, data, EDC and ECC).
func ConvertISO2048ToMode2Raw(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	w := bufio.NewWriterSize(out, 4<<20)
	data := make([]byte, 2048)
	sector := make([]byte, 2352)
	for lba := 0; ; lba++ {
		n, rErr := io.ReadFull(in, data)
		if n == 0 {
			break
		}
		if n < 2048 {
			clear(data[n:])
		}
		BuildMode2Form1Sector(sector, lba, data)
		if _, err := w.Write(sector); err != nil {
			out.Close()
			return err
		}
		if rErr != nil {
			break
		}
	}
	if err := w.Flush(); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}

func toBCD(v int) byte { return byte((v/10)<<4 | v%10) }

// BuildMode2Form1Sector fills a 2352-byte MODE2 Form 1 sector for the given LBA.
func BuildMode2Form1Sector(sector []byte, lba int, data []byte) {
	copy(sector[0:12], cdSync)
	frames := lba + 150
	sector[12] = toBCD(frames / (60 * 75))
	sector[13] = toBCD((frames / 75) % 60)
	sector[14] = toBCD(frames % 75)
	sector[15] = 2
	// XA subheader: file 0, channel 0, submode 0x08 (data), coding 0; written twice.
	sub := []byte{0, 0, 0x08, 0, 0, 0, 0x08, 0}
	copy(sector[16:24], sub)
	copy(sector[24:2072], data)
	edc := cdEDC(sector[16:2072])
	sector[2072] = byte(edc)
	sector[2073] = byte(edc >> 8)
	sector[2074] = byte(edc >> 16)
	sector[2075] = byte(edc >> 24)
	// ECC для MODE2 считается с обнулённым адресом. / MODE2 ECC is computed with the address zeroed.
	var hdr [4]byte
	copy(hdr[:], sector[12:16])
	clear(sector[12:16])
	eccCompute(sector[12:], 86, 24, 2, 86, sector[0x81C:])
	eccCompute(sector[12:], 52, 43, 86, 88, sector[0x8C8:])
	copy(sector[12:16], hdr[:])
}

var (
	edcTable  [256]uint32
	eccFLUT   [256]byte
	eccBLUT   [256]byte
	tablesSet bool
)

func initCDTables() {
	if tablesSet {
		return
	}
	for i := 0; i < 256; i++ {
		j := i << 1
		if i&0x80 != 0 {
			j ^= 0x11D
		}
		eccFLUT[i] = byte(j)
		eccBLUT[i^j] = byte(i)
		edc := uint32(i)
		for k := 0; k < 8; k++ {
			if edc&1 != 0 {
				edc = (edc >> 1) ^ 0xD8018001
			} else {
				edc >>= 1
			}
		}
		edcTable[i] = edc
	}
	tablesSet = true
}

func init() { initCDTables() }

func cdEDC(b []byte) uint32 {
	var edc uint32
	for _, x := range b {
		edc = (edc >> 8) ^ edcTable[(edc^uint32(x))&0xff]
	}
	return edc
}

// eccCompute is the standard CD-ROM P/Q parity (as in ECM and MAME's cdrom.cpp).
func eccCompute(src []byte, majorCount, minorCount, majorMult, minorInc int, dest []byte) {
	size := majorCount * minorCount
	for major := 0; major < majorCount; major++ {
		index := (major>>1)*majorMult + (major & 1)
		var a, b byte
		for minor := 0; minor < minorCount; minor++ {
			t := src[index]
			index += minorInc
			if index >= size {
				index -= size
			}
			a ^= t
			b ^= t
			a = eccFLUT[a]
		}
		a = eccBLUT[eccFLUT[a]^b]
		dest[major] = a
		dest[major+majorCount] = a ^ b
	}
}
