package aegiscore

// Чтение заголовка и метаданных CHD без распаковки / Reading a CHD header and metadata without decompressing.
//
// RU: Нужен, чтобы проверить готовый CHD: формат (CD или DVD), тип дорожек, кодеки сжатия и не обрезан
// ли файл. Карта хунков в CHD v5 лежит в конце файла, поэтому обрезанный файл виден по её границе.
//
// EN: Used to check a finished CHD: its kind (CD or DVD), track types, compression codecs and whether
// the file is cut short. In CHD v5 the hunk map sits at the end of the file, so a truncated file shows
// up by its bounds.

import (
	"bytes"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
)

// CHDTrack is one CD track from CHT2/CHTR/CHGT metadata.
type CHDTrack struct {
	Number int    `json:"number"`
	Type   string `json:"type"`
	Frames int    `json:"frames"`
}

// CHDInfo is what InspectCHD reads from a file.
type CHDInfo struct {
	Version      int        `json:"version"`
	Kind         string     `json:"kind"` // cd | gd | dvd | hd | unknown
	Codecs       []string   `json:"codecs"`
	LogicalBytes uint64     `json:"logicalBytes"`
	HunkBytes    uint32     `json:"hunkBytes"`
	FileBytes    int64      `json:"fileBytes"`
	Tracks       []CHDTrack `json:"tracks"`
	Truncated    bool       `json:"truncated"`
	HasParent    bool       `json:"hasParent"`
}

// ErrNotCHD means the file does not start with the CHD signature.
var ErrNotCHD = errors.New("not a CHD file (no MComprHD signature)")

// InspectCHD reads the header and metadata of a CHD file.
func InspectCHD(path string) (*CHDInfo, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		return nil, err
	}
	return inspectCHDReader(f, st.Size())
}

func inspectCHDReader(r io.ReaderAt, size int64) (*CHDInfo, error) {
	head := make([]byte, 124)
	n, _ := r.ReadAt(head, 0)
	if n < 16 || !bytes.Equal(head[:8], []byte("MComprHD")) {
		return nil, ErrNotCHD
	}
	be := binary.BigEndian
	info := &CHDInfo{Version: int(be.Uint32(head[12:16])), FileBytes: size, Kind: "unknown"}
	var metaOffset uint64
	switch info.Version {
	case 5:
		if n < 124 {
			info.Truncated = true
			return info, nil
		}
		for i := 0; i < 4; i++ {
			c := be.Uint32(head[16+i*4:])
			if c != 0 {
				info.Codecs = append(info.Codecs, fourCC(c))
			}
		}
		info.LogicalBytes = be.Uint64(head[32:40])
		mapOffset := be.Uint64(head[40:48])
		metaOffset = be.Uint64(head[48:56])
		info.HunkBytes = be.Uint32(head[56:60])
		info.HasParent = !allZero(head[104:124])
		info.Truncated = chdV5MapOutOfBounds(r, size, mapOffset, info)
	case 3, 4:
		if n < 48 {
			info.Truncated = true
			return info, nil
		}
		info.Codecs = []string{legacyCodec(be.Uint32(head[20:24]))}
		info.LogicalBytes = be.Uint64(head[28:36])
		metaOffset = be.Uint64(head[36:44])
		if info.Version == 4 && n >= 48 {
			info.HunkBytes = be.Uint32(head[44:48])
		} else if n >= 80 {
			info.HunkBytes = be.Uint32(head[76:80])
		}
		info.HasParent = be.Uint32(head[16:20])&1 != 0
	default:
		return info, fmt.Errorf("unsupported CHD version %d", info.Version)
	}
	if metaOffset != 0 && int64(metaOffset) >= size {
		info.Truncated = true
	}
	readCHDMetadata(r, size, metaOffset, info)
	return info, nil
}

// chdV5MapOutOfBounds reports whether the hunk map runs past the end of the file.
func chdV5MapOutOfBounds(r io.ReaderAt, size int64, mapOffset uint64, info *CHDInfo) bool {
	if mapOffset == 0 || int64(mapOffset) >= size {
		return true
	}
	if len(info.Codecs) == 0 {
		// Без сжатия: 4 байта на хунк. / Uncompressed: 4 bytes per hunk.
		if info.HunkBytes == 0 {
			return false
		}
		hunks := (info.LogicalBytes + uint64(info.HunkBytes) - 1) / uint64(info.HunkBytes)
		return int64(mapOffset+hunks*4) > size
	}
	mh := make([]byte, 16)
	if n, _ := r.ReadAt(mh, int64(mapOffset)); n < 16 {
		return true
	}
	mapLen := binary.BigEndian.Uint32(mh[0:4])
	return int64(mapOffset)+16+int64(mapLen) > size
}

func readCHDMetadata(r io.ReaderAt, size int64, off uint64, info *CHDInfo) {
	be := binary.BigEndian
	for guard := 0; off != 0 && guard < 4096; guard++ {
		if int64(off)+16 > size {
			info.Truncated = true
			return
		}
		hdr := make([]byte, 16)
		if n, _ := r.ReadAt(hdr, int64(off)); n < 16 {
			info.Truncated = true
			return
		}
		tag := fourCC(be.Uint32(hdr[0:4]))
		length := be.Uint32(hdr[4:8]) & 0x00ffffff
		next := be.Uint64(hdr[8:16])
		switch tag {
		case "CHT2", "CHTR", "CHGT", "CHCD":
			if tag == "CHGT" {
				info.Kind = "gd"
			} else if info.Kind == "unknown" {
				info.Kind = "cd"
			}
			if tag != "CHCD" && length > 0 && length < 4096 {
				data := make([]byte, length)
				if n, _ := r.ReadAt(data, int64(off)+16); n == int(length) {
					if tr, ok := parseCHDTrackMeta(string(bytes.TrimRight(data, "\x00"))); ok {
						info.Tracks = append(info.Tracks, tr)
					}
				}
			}
		case "DVD ":
			info.Kind = "dvd"
		case "GDDD":
			if info.Kind == "unknown" {
				info.Kind = "hd"
			}
		}
		off = next
	}
}

// parseCHDTrackMeta parses "TRACK:1 TYPE:MODE2_RAW SUBTYPE:NONE FRAMES:1000 ...".
func parseCHDTrackMeta(s string) (CHDTrack, bool) {
	var t CHDTrack
	ok := false
	for _, field := range strings.Fields(s) {
		k, v, found := strings.Cut(field, ":")
		if !found {
			continue
		}
		switch k {
		case "TRACK":
			fmt.Sscanf(v, "%d", &t.Number)
			ok = true
		case "TYPE":
			t.Type = v
		case "FRAMES":
			fmt.Sscanf(v, "%d", &t.Frames)
		}
	}
	return t, ok
}

func fourCC(v uint32) string {
	b := []byte{byte(v >> 24), byte(v >> 16), byte(v >> 8), byte(v)}
	return string(b)
}

func legacyCodec(v uint32) string {
	switch v {
	case 0:
		return "none"
	case 1:
		return "zlib"
	case 2:
		return "zlib+"
	case 3:
		return "avhuff"
	}
	return fmt.Sprintf("codec%d", v)
}

func allZero(b []byte) bool {
	for _, x := range b {
		if x != 0 {
			return false
		}
	}
	return true
}

// CHDIssue is one finding about a CHD for a given console.
type CHDIssue struct {
	Level string `json:"level"` // error | warn
	Code  string `json:"code"`
	Text  string `json:"text"`
}

// CheckCHDForConsole lists problems that stop a CHD from loading on that console's usual emulators.
// console is a short code (psx, ps2, psp, saturn, segacd, dc, pce, ...); empty means unknown.
func CheckCHDForConsole(info *CHDInfo, console string) []CHDIssue {
	var out []CHDIssue
	add := func(level, code, text string) { out = append(out, CHDIssue{level, code, text}) }
	if info == nil {
		return out
	}
	if info.Truncated {
		add("error", "chd_truncated", "CHD обрезан: данные выходят за конец файла / CHD is truncated: data runs past the end of the file")
	}
	if info.Version < 5 {
		add("warn", "chd_old_version", fmt.Sprintf("CHD v%d: старый формат, пересоздайте свежим chdman / old format, recreate with a current chdman", info.Version))
	}
	if info.HasParent {
		add("error", "chd_parent", "CHD ссылается на родительский файл и без него не откроется / CHD needs a parent file to open")
	}
	for _, c := range info.Codecs {
		if c == "zstd" || c == "cdzs" {
			add("warn", "chd_zstd", "Сжатие Zstandard ("+c+"): старые ядра (сборки ArkOS для R36S) могут его не знать. Это предположение, не проверено на устройстве / Zstandard ("+c+"): older cores may not support it. Unverified guess")
			break
		}
	}
	c := strings.ToLower(console)
	switch c {
	case "psx", "ps1", "playstation":
		if info.Kind == "dvd" || info.Kind == "hd" {
			add("error", "chd_dvd_for_cd", "CHD сделан как DVD/HDD (createdvd/createhd), а PS1 нужен CD (createcd) / CHD was made as DVD/HDD, PS1 needs a CD CHD (createcd)")
		}
		for _, t := range info.Tracks {
			if t.Number == 1 && t.Type != "MODE2_RAW" && t.Type != "MODE1_RAW" && t.Type != "AUDIO" {
				add("error", "chd_cooked_track", "Дорожка 1 типа "+t.Type+" (без сырых секторов 2352). PCSX ReARMed, основное ядро PS1 на R36S, такой CHD не прочитает. Пересоздайте из .bin/.cue или из ISO через новый конвертер / Track 1 is "+t.Type+" (no raw 2352-byte sectors). PCSX ReARMed cannot read it; recreate from .bin/.cue or from the ISO with the new converter")
			}
		}
	case "ps2", "psp":
		if info.Kind == "cd" && c == "psp" {
			add("error", "chd_cd_for_dvd", "PSP нужен CHD формата DVD (createdvd), а этот сделан как CD / PSP needs a DVD CHD (createdvd), this one is a CD CHD")
		}
	}
	return out
}
