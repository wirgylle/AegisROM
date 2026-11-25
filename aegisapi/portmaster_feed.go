package aegisapi

// Разбор каталога PortMaster (ports.json из PortsMaster/PortMaster-Info).
// Каталог живой и меняет форму полей: attr.avail был объектом, стал массивом
// строк "устройство:прошивка"; runtime бывает строкой или массивом. Поэтому
// списочные поля принимают любую форму, а каждая запись разбирается отдельно:
// одна странная запись пропускается, а не роняет весь каталог.
//
// Parsing of the PortMaster catalog (ports.json). The live feed changes field
// shapes (attr.avail went from object to array of "device:firmware" strings,
// runtime may be string or array), so list fields accept any shape and each
// entry is decoded on its own: a malformed entry is skipped instead of failing
// the whole catalog.

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/url"
	"sort"
	"strings"
)

// pmStrList принимает строку, массив (строк или чисел), объект (берутся ключи)
// или null. / Accepts a string, an array, an object (its keys) or null.
type pmStrList []string

func (l *pmStrList) UnmarshalJSON(b []byte) error {
	*l = nil
	b = bytes.TrimSpace(b)
	if len(b) == 0 || bytes.Equal(b, []byte("null")) {
		return nil
	}
	var v interface{}
	if err := json.Unmarshal(b, &v); err != nil {
		return err
	}
	switch t := v.(type) {
	case string:
		if t != "" {
			*l = pmStrList{t}
		}
	case []interface{}:
		for _, x := range t {
			if s := pmScalarString(x); s != "" {
				*l = append(*l, s)
			}
		}
	case map[string]interface{}:
		keys := make([]string, 0, len(t))
		for k := range t {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		*l = pmStrList(keys)
	default:
		if s := pmScalarString(t); s != "" {
			*l = pmStrList{s}
		}
	}
	return nil
}

// pmString принимает строку, число, bool или null. / Lenient string.
type pmString string

func (s *pmString) UnmarshalJSON(b []byte) error {
	var v interface{}
	if err := json.Unmarshal(b, &v); err != nil {
		return err
	}
	switch t := v.(type) {
	case []interface{}:
		if len(t) > 0 {
			*s = pmString(pmScalarString(t[0]))
		} else {
			*s = ""
		}
	default:
		*s = pmString(pmScalarString(t))
	}
	return nil
}

// pmBool принимает bool, число, строку ("true"/"1"/"yes") или null.
type pmBool bool

func (p *pmBool) UnmarshalJSON(b []byte) error {
	var v interface{}
	if err := json.Unmarshal(b, &v); err != nil {
		return err
	}
	switch t := v.(type) {
	case bool:
		*p = pmBool(t)
	case float64:
		*p = t != 0
	case string:
		s := strings.ToLower(strings.TrimSpace(t))
		*p = s == "true" || s == "1" || s == "yes" || s == "y"
	default:
		*p = false
	}
	return nil
}

// pmInt принимает число, строку с числом или null.
type pmInt int64

func (p *pmInt) UnmarshalJSON(b []byte) error {
	var v interface{}
	if err := json.Unmarshal(b, &v); err != nil {
		return err
	}
	switch t := v.(type) {
	case float64:
		*p = pmInt(t)
	case string:
		var n int64
		if _, err := fmt.Sscan(strings.TrimSpace(t), &n); err == nil {
			*p = pmInt(n)
		} else {
			*p = 0
		}
	default:
		*p = 0
	}
	return nil
}

func pmScalarString(x interface{}) string {
	switch t := x.(type) {
	case string:
		return t
	case float64:
		return fmt.Sprintf("%v", t)
	case bool:
		if t {
			return "true"
		}
		return "false"
	}
	return ""
}

type pmFeedEntry struct {
	Name  pmString  `json:"name"`
	Items pmStrList `json:"items"`
	Attr  struct {
		Title   pmString  `json:"title"`
		Desc    pmString  `json:"desc"`
		Genres  pmStrList `json:"genres"`
		Rtr     pmBool    `json:"rtr"`
		Porter  pmStrList `json:"porter"`
		Runtime pmStrList `json:"runtime"`
		Reqs    pmStrList `json:"reqs"`
		Inst    pmString  `json:"inst"`
		InstMd  pmString  `json:"inst_md"`
		Avail   pmStrList `json:"avail"`
		Image   struct {
			Covers     pmStrList `json:"covers"`
			Screenshot pmString  `json:"screenshot"`
		} `json:"image"`
	} `json:"attr"`
	Source struct {
		URL         pmString `json:"url"`
		Size        pmInt    `json:"size"`
		DateUpdated pmString `json:"date_updated"`
		MD5         pmString `json:"md5"`
	} `json:"source"`
}

type pmItem struct {
	ID                      string   `json:"id"`
	Slug                    string   `json:"slug"`
	Title                   string   `json:"title"`
	Desc                    string   `json:"desc"`
	Genres                  []string `json:"genres"`
	ReadyToRun              bool     `json:"readyToRun"`
	Porter                  []string `json:"porter"`
	Runtime                 []string `json:"runtime"`
	Requirements            []string `json:"requirements"`
	InstructionsRaw         string   `json:"instructionsRaw"`
	InstructionsMd          string   `json:"instructionsMd"`
	RequiredDataTargetPath  string   `json:"requiredDataTargetPath"`
	RequiredDataHint        string   `json:"requiredDataHint"`
	Items                   []string `json:"items"`
	AvailDevices            []string `json:"availDevices"`
	SupportedConsolesPretty []string `json:"supportedConsolesPretty"`
	CoverUrl                string   `json:"coverUrl"`
	ScreenshotUrl           string   `json:"screenshotUrl"`
	DownloadUrl             string   `json:"downloadUrl"`
	SizeBytes               int64    `json:"sizeBytes"`
	DateUpdated             string   `json:"dateUpdated"`
	MD5                     string   `json:"md5"`
}

// pmAvailDevices превращает "r36s:ALL" в "r36s", без повторов.
// Turns "r36s:ALL" into "r36s", deduplicated, order kept.
func pmAvailDevices(raw []string) []string {
	out := make([]string, 0, len(raw))
	seen := make(map[string]bool, len(raw))
	for _, a := range raw {
		d := strings.TrimSpace(a)
		if i := strings.Index(d, ":"); i >= 0 {
			d = strings.TrimSpace(d[:i])
		}
		if d == "" || seen[d] {
			continue
		}
		seen[d] = true
		out = append(out, d)
	}
	return out
}

func pmNonNil(l pmStrList) []string {
	if l == nil {
		return []string{}
	}
	return []string(l)
}

// parsePortMasterFeed разбирает ports.json. skipped — число записей, которые
// не удалось разобрать. / Parses ports.json; skipped counts undecodable entries.
func parsePortMasterFeed(r io.Reader) (games []pmItem, skipped int, err error) {
	var top struct {
		Ports map[string]json.RawMessage `json:"ports"`
	}
	if err := json.NewDecoder(r).Decode(&top); err != nil {
		return nil, 0, fmt.Errorf("portmaster catalog: %w", err)
	}
	if top.Ports == nil {
		return nil, 0, fmt.Errorf("portmaster catalog: no \"ports\" object")
	}
	keys := make([]string, 0, len(top.Ports))
	for k := range top.Ports {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	games = make([]pmItem, 0, len(keys))
	for _, key := range keys {
		var entry pmFeedEntry
		if err := json.Unmarshal(top.Ports[key], &entry); err != nil {
			skipped++
			continue
		}
		slug := strings.TrimSuffix(string(entry.Name), ".zip")
		if slug == "" {
			slug = strings.TrimSuffix(key, ".zip")
		}
		title := string(entry.Attr.Title)
		if title == "" {
			title = slug
		}
		base := "https://raw.githubusercontent.com/PortsMaster/PortMaster-New/main/ports/" + url.PathEscape(slug) + "/"
		shotUrl := ""
		if s := string(entry.Attr.Image.Screenshot); s != "" {
			shotUrl = base + url.PathEscape(s)
		}
		coverUrl := shotUrl
		if len(entry.Attr.Image.Covers) > 0 && entry.Attr.Image.Covers[0] != "" {
			coverUrl = base + url.PathEscape(entry.Attr.Image.Covers[0])
		}
		games = append(games, pmItem{
			ID:                      key,
			Slug:                    slug,
			Title:                   title,
			Desc:                    string(entry.Attr.Desc),
			Genres:                  pmNonNil(entry.Attr.Genres),
			ReadyToRun:              bool(entry.Attr.Rtr),
			Porter:                  pmNonNil(entry.Attr.Porter),
			Runtime:                 pmNonNil(entry.Attr.Runtime),
			Requirements:            pmNonNil(entry.Attr.Reqs),
			InstructionsRaw:         string(entry.Attr.Inst),
			InstructionsMd:          string(entry.Attr.InstMd),
			RequiredDataTargetPath:  "ports/" + slug,
			RequiredDataHint:        "Поместите файлы игры в папку ports/" + slug + "/",
			Items:                   pmNonNil(entry.Items),
			AvailDevices:            pmAvailDevices(entry.Attr.Avail),
			SupportedConsolesPretty: []string{"R36S (ArkOS)", "Anbernic (MuOS/Knulli)", "ROCKNIX"},
			CoverUrl:                coverUrl,
			ScreenshotUrl:           shotUrl,
			DownloadUrl:             string(entry.Source.URL),
			SizeBytes:               int64(entry.Source.Size),
			DateUpdated:             string(entry.Source.DateUpdated),
			MD5:                     string(entry.Source.MD5),
		})
	}
	return games, skipped, nil
}
