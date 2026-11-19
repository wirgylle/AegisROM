// Package dat читает DAT-файлы No-Intro, Redump и других групп (форматы Logiqx XML
// и clrmamepro) и ищет по ним название игры по хешу (CRC32 + размер, SHA1, MD5)
// или по серийному номеру диска.
//
// Package dat reads No-Intro, Redump and other DAT files (Logiqx XML and
// clrmamepro formats) and looks up a game name by hash (CRC32 + size, SHA1,
// MD5) or by disc serial.
package dat

import (
	"archive/zip"
	"bufio"
	"bytes"
	"encoding/xml"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// Source — группа, выпустившая DAT. / Group that published the DAT.
type Source string

const (
	SourceNoIntro Source = "no-intro"
	SourceRedump  Source = "redump"
	SourceTOSEC   Source = "tosec"
	SourceOther   Source = "other"
)

// Info описывает один загруженный DAT. / Describes one loaded DAT.
type Info struct {
	File        string `json:"file"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Version     string `json:"version,omitempty"`
	Homepage    string `json:"homepage,omitempty"`
	URL         string `json:"url,omitempty"`
	Source      Source `json:"source"`
	// System — имя системы без суффиксов вроде "(Headered)", в нижнем регистре.
	// System name without suffixes like "(Headered)", lowercased.
	System string `json:"system"`
	Games  int    `json:"games"`
	Roms   int    `json:"roms"`
	Error  string `json:"error,omitempty"`
}

// Rom — один файл игры в DAT. / One file of a game in a DAT.
type Rom struct {
	Name    string
	Size    int64
	CRC32   string // 8 hex, верхний регистр / uppercase
	MD5     string // нижний регистр / lowercase
	SHA1    string // нижний регистр / lowercase
	BadDump bool
}

// Game — игра (набор файлов) в DAT. / A game (set of files) in a DAT.
type Game struct {
	Name    string
	Serials []string
	Roms    []Rom
	Dat     *Info
}

// ParseFile читает DAT с диска. ZIP-архив может содержать несколько DAT.
// ParseFile reads a DAT from disk. A ZIP archive may hold several DATs.
func ParseFile(path string) ([]*Info, [][]*Game, error) {
	if strings.EqualFold(filepath.Ext(path), ".zip") {
		return parseZip(path)
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, nil, err
	}
	defer f.Close()
	info, games, err := Parse(f, filepath.Base(path))
	if err != nil {
		return nil, nil, err
	}
	return []*Info{info}, [][]*Game{games}, nil
}

func parseZip(path string) ([]*Info, [][]*Game, error) {
	zr, err := zip.OpenReader(path)
	if err != nil {
		return nil, nil, err
	}
	defer zr.Close()
	var infos []*Info
	var all [][]*Game
	for _, zf := range zr.File {
		ext := strings.ToLower(filepath.Ext(zf.Name))
		if ext != ".dat" && ext != ".xml" {
			continue
		}
		rc, err := zf.Open()
		if err != nil {
			continue
		}
		info, games, perr := Parse(rc, filepath.Base(path)+"/"+filepath.Base(zf.Name))
		rc.Close()
		if perr != nil {
			continue
		}
		infos = append(infos, info)
		all = append(all, games)
	}
	if len(infos) == 0 {
		return nil, nil, fmt.Errorf("в архиве нет DAT-файлов / no DAT files in archive")
	}
	return infos, all, nil
}

// Parse определяет формат по первым байтам и разбирает DAT.
// fileName нужен для подписи и для определения группы по имени файла.
// Parse sniffs the format and parses the DAT. fileName is used as a label
// and as a hint for the publishing group.
func Parse(r io.Reader, fileName string) (*Info, []*Game, error) {
	br := bufio.NewReaderSize(r, 64*1024)
	head, _ := br.Peek(4096)
	trimmed := bytes.TrimLeft(head, "\xef\xbb\xbf \t\r\n")
	var (
		info  *Info
		games []*Game
		err   error
	)
	if len(trimmed) > 0 && trimmed[0] == '<' {
		info, games, err = parseLogiqx(br)
	} else {
		info, games, err = parseClrMamePro(br)
	}
	if err != nil {
		return nil, nil, err
	}
	info.File = fileName
	info.Source = detectSource(info, fileName)
	info.System = NormalizeSystem(info.Name)
	info.Games = len(games)
	for _, g := range games {
		g.Dat = info
		info.Roms += len(g.Roms)
	}
	if len(games) == 0 {
		return nil, nil, fmt.Errorf("в DAT нет игр с хешами / DAT has no games with hashes")
	}
	return info, games, nil
}

// --- Logiqx XML ---

type xmlRom struct {
	Name   string `xml:"name,attr"`
	Size   string `xml:"size,attr"`
	CRC    string `xml:"crc,attr"`
	MD5    string `xml:"md5,attr"`
	SHA1   string `xml:"sha1,attr"`
	Status string `xml:"status,attr"`
	Serial string `xml:"serial,attr"`
}

type xmlGame struct {
	Name    string   `xml:"name,attr"`
	Serials []string `xml:"serial"`
	Roms    []xmlRom `xml:"rom"`
}

type xmlHeader struct {
	Name        string `xml:"name"`
	Description string `xml:"description"`
	Version     string `xml:"version"`
	Homepage    string `xml:"homepage"`
	URL         string `xml:"url"`
}

func parseLogiqx(r io.Reader) (*Info, []*Game, error) {
	dec := xml.NewDecoder(r)
	dec.Strict = false
	dec.AutoClose = xml.HTMLAutoClose
	dec.Entity = xml.HTMLEntity
	info := &Info{}
	var games []*Game
	for {
		tok, err := dec.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			if len(games) > 0 {
				break // обрезанный файл: берём что успели / truncated file: keep what we got
			}
			return nil, nil, fmt.Errorf("XML: %w", err)
		}
		se, ok := tok.(xml.StartElement)
		if !ok {
			continue
		}
		switch se.Name.Local {
		case "header":
			var h xmlHeader
			if err := dec.DecodeElement(&h, &se); err == nil {
				info.Name = strings.TrimSpace(h.Name)
				info.Description = strings.TrimSpace(h.Description)
				info.Version = strings.TrimSpace(h.Version)
				info.Homepage = strings.TrimSpace(h.Homepage)
				info.URL = strings.TrimSpace(h.URL)
			}
		case "game", "machine", "software":
			var xg xmlGame
			if err := dec.DecodeElement(&xg, &se); err != nil {
				continue
			}
			g := &Game{Name: strings.TrimSpace(xg.Name)}
			for _, s := range xg.Serials {
				g.Serials = append(g.Serials, splitSerials(s)...)
			}
			for _, xr := range xg.Roms {
				rom, ok := makeRom(xr.Name, xr.Size, xr.CRC, xr.MD5, xr.SHA1, xr.Status)
				if !ok {
					continue
				}
				g.Roms = append(g.Roms, rom)
				if xr.Serial != "" {
					g.Serials = append(g.Serials, splitSerials(xr.Serial)...)
				}
			}
			if g.Name != "" && (len(g.Roms) > 0 || len(g.Serials) > 0) {
				games = append(games, g)
			}
		}
	}
	return info, games, nil
}

// --- clrmamepro ---

// cmpNode — список пар «ключ значение»; значение — строка или вложенный блок.
// cmpNode is a list of key/value pairs; a value is a string or a nested block.
type cmpPair struct {
	Key   string
	Value string
	Block []cmpPair
}

func parseClrMamePro(r io.Reader) (*Info, []*Game, error) {
	tz := &cmpTokenizer{r: bufio.NewReader(r)}
	info := &Info{}
	var games []*Game
	for {
		key, ok := tz.next()
		if !ok {
			break
		}
		if key.kind != tokWord {
			continue
		}
		open, ok := tz.next()
		if !ok {
			break
		}
		if open.kind != tokOpen {
			continue
		}
		block := tz.readBlock()
		switch strings.ToLower(key.text) {
		case "clrmamepro":
			for _, p := range block {
				switch strings.ToLower(p.Key) {
				case "name":
					info.Name = p.Value
				case "description":
					info.Description = p.Value
				case "version":
					info.Version = p.Value
				case "homepage":
					info.Homepage = p.Value
				case "url":
					info.URL = p.Value
				}
			}
		case "game", "machine", "resource":
			g := &Game{}
			for _, p := range block {
				switch strings.ToLower(p.Key) {
				case "name":
					g.Name = p.Value
				case "serial":
					g.Serials = append(g.Serials, splitSerials(p.Value)...)
				case "rom", "disk":
					var name, size, crc, md5, sha1, status, serial string
					for _, rp := range p.Block {
						switch strings.ToLower(rp.Key) {
						case "name":
							name = rp.Value
						case "size":
							size = rp.Value
						case "crc":
							crc = rp.Value
						case "md5":
							md5 = rp.Value
						case "sha1":
							sha1 = rp.Value
						case "flags", "status":
							status = rp.Value
						case "serial":
							serial = rp.Value
						}
					}
					if rom, ok := makeRom(name, size, crc, md5, sha1, status); ok {
						g.Roms = append(g.Roms, rom)
					}
					if serial != "" {
						g.Serials = append(g.Serials, splitSerials(serial)...)
					}
				}
			}
			if g.Name != "" && (len(g.Roms) > 0 || len(g.Serials) > 0) {
				games = append(games, g)
			}
		}
	}
	if info.Name == "" && len(games) == 0 {
		return nil, nil, fmt.Errorf("не похоже на DAT / does not look like a DAT")
	}
	return info, games, nil
}

type tokKind int

const (
	tokWord tokKind = iota
	tokOpen
	tokClose
)

type cmpToken struct {
	kind tokKind
	text string
}

type cmpTokenizer struct {
	r *bufio.Reader
}

func (t *cmpTokenizer) next() (cmpToken, bool) {
	for {
		c, err := t.r.ReadByte()
		if err != nil {
			return cmpToken{}, false
		}
		switch {
		case c == ' ' || c == '\t' || c == '\r' || c == '\n':
			continue
		case c == '(':
			return cmpToken{kind: tokOpen}, true
		case c == ')':
			return cmpToken{kind: tokClose}, true
		case c == '"':
			var sb strings.Builder
			for {
				c2, err := t.r.ReadByte()
				if err != nil || c2 == '"' {
					break
				}
				if c2 == '\\' {
					if c3, err := t.r.ReadByte(); err == nil {
						sb.WriteByte(c3)
					}
					continue
				}
				sb.WriteByte(c2)
			}
			return cmpToken{kind: tokWord, text: sb.String()}, true
		default:
			var sb strings.Builder
			sb.WriteByte(c)
			for {
				c2, err := t.r.ReadByte()
				if err != nil {
					break
				}
				if c2 == ' ' || c2 == '\t' || c2 == '\r' || c2 == '\n' || c2 == '(' || c2 == ')' {
					_ = t.r.UnreadByte()
					break
				}
				sb.WriteByte(c2)
			}
			return cmpToken{kind: tokWord, text: sb.String()}, true
		}
	}
}

// readBlock читает пары до закрывающей скобки. / Reads pairs up to the closing paren.
func (t *cmpTokenizer) readBlock() []cmpPair {
	var out []cmpPair
	for {
		k, ok := t.next()
		if !ok || k.kind == tokClose {
			return out
		}
		if k.kind != tokWord {
			continue
		}
		v, ok := t.next()
		if !ok {
			return out
		}
		switch v.kind {
		case tokOpen:
			out = append(out, cmpPair{Key: k.text, Block: t.readBlock()})
		case tokClose:
			out = append(out, cmpPair{Key: k.text})
			return out
		default:
			out = append(out, cmpPair{Key: k.text, Value: v.text})
		}
	}
}

// --- общие помощники / shared helpers ---

func makeRom(name, size, crc, md5, sha1, status string) (Rom, bool) {
	crc = strings.ToUpper(strings.TrimSpace(crc))
	md5 = strings.ToLower(strings.TrimSpace(md5))
	sha1 = strings.ToLower(strings.TrimSpace(sha1))
	if len(crc) != 8 {
		crc = ""
	}
	if len(md5) != 32 {
		md5 = ""
	}
	if len(sha1) != 40 {
		sha1 = ""
	}
	if crc == "" && md5 == "" && sha1 == "" {
		return Rom{}, false
	}
	n, _ := strconv.ParseInt(strings.TrimSpace(size), 10, 64)
	st := strings.ToLower(status)
	return Rom{
		Name:    strings.TrimSpace(name),
		Size:    n,
		CRC32:   crc,
		MD5:     md5,
		SHA1:    sha1,
		BadDump: strings.Contains(st, "baddump") || strings.Contains(st, "nodump"),
	}, true
}

func splitSerials(s string) []string {
	var out []string
	for _, part := range strings.FieldsFunc(s, func(r rune) bool { return r == ',' || r == ';' || r == '/' }) {
		if n := NormalizeSerial(part); n != "" {
			out = append(out, n)
		}
	}
	return out
}

// NormalizeSerial приводит серийник к виду без разделителей: "SLUS-005.94" → "SLUS00594".
// NormalizeSerial strips separators from a serial: "SLUS-005.94" → "SLUS00594".
func NormalizeSerial(s string) string {
	var sb strings.Builder
	for _, r := range strings.ToUpper(s) {
		if (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			sb.WriteRune(r)
		}
	}
	if sb.Len() < 5 {
		return ""
	}
	return sb.String()
}

// NormalizeSystem убирает из имени системы суффиксы в скобках и приводит к нижнему регистру:
// "Nintendo - Nintendo Entertainment System (Headered) (Parent-Clone)" → "nintendo - nintendo entertainment system".
// NormalizeSystem drops parenthesised suffixes and lowercases the system name.
func NormalizeSystem(name string) string {
	s := name
	for {
		i := strings.LastIndex(s, "(")
		if i <= 0 || !strings.HasSuffix(strings.TrimSpace(s), ")") {
			break
		}
		s = strings.TrimSpace(s[:i])
	}
	return strings.ToLower(strings.TrimSpace(s))
}

func detectSource(info *Info, fileName string) Source {
	hay := strings.ToLower(info.Homepage + " " + info.URL + " " + info.Description + " " + info.Name)
	file := strings.ToLower(fileName)
	switch {
	case strings.Contains(hay, "no-intro") || strings.Contains(hay, "nointro"):
		return SourceNoIntro
	case strings.Contains(hay, "redump"):
		return SourceRedump
	case strings.Contains(hay, "tosec"):
		return SourceTOSEC
	case strings.Contains(file, "no-intro") || strings.Contains(file, "nointro"):
		return SourceNoIntro
	case strings.Contains(file, "redump"):
		return SourceRedump
	case strings.Contains(file, "tosec"):
		return SourceTOSEC
	}
	return SourceOther
}
