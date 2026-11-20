package aegisapi

import (
	"aegisgui/aegiscore/dat"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Автозагрузка DAT из libretro-database (github.com/libretro/libretro-database, папка metadat/).
// Там лежат DAT No-Intro (картриджи) и Redump (диски) в формате clrmamepro, с CRC/MD5/SHA1
// и серийниками дисков. Имена систем совпадают с именами Libretro в CONSOLE_CATALOG.
//
// Auto-download of DATs from libretro-database (metadat/): No-Intro (cartridges) and Redump
// (discs) in clrmamepro format with CRC/MD5/SHA1 and disc serials. System names match the
// Libretro names used in CONSOLE_CATALOG.

// libretroDatBase можно подменить в тестах. / Overridable in tests.
var libretroDatBase = "https://raw.githubusercontent.com/libretro/libretro-database/master/metadat"

// libretroDatSets: какие наборы есть для системы (проверено 2026-11-20). Только эти имена
// можно скачать — произвольные пути из запроса не принимаем.
// libretroDatSets: which sets exist per system (checked 2026-11-20). Only these names are
// downloadable — arbitrary paths from the request are rejected.
var libretroDatSets = map[string][]string{
	"Atari - 2600":                                   {"no-intro"},
	"Atari - 7800":                                   {"no-intro"},
	"Atari - Lynx":                                   {"no-intro"},
	"NEC - PC Engine - TurboGrafx 16":                {"no-intro"},
	"NEC - PC Engine CD - TurboGrafx-CD":             {"redump"},
	"Nintendo - Family Computer Disk System":         {"no-intro"},
	"Nintendo - Game Boy":                            {"no-intro"},
	"Nintendo - Game Boy Color":                      {"no-intro"},
	"Nintendo - Game Boy Advance":                    {"no-intro"},
	"Nintendo - Nintendo 64":                         {"no-intro"},
	"Nintendo - Nintendo DS":                         {"no-intro"},
	"Nintendo - Nintendo Entertainment System":       {"no-intro"},
	"Nintendo - Super Nintendo Entertainment System": {"no-intro"},
	"Nintendo - GameCube":                            {"redump"},
	"Nintendo - Wii":                                 {"redump"},
	"Sega - 32X":                                     {"no-intro"},
	"Sega - Game Gear":                               {"no-intro"},
	"Sega - Master System - Mark III":                {"no-intro"},
	"Sega - Mega Drive - Genesis":                    {"no-intro"},
	"Sega - Mega-CD - Sega CD":                       {"redump"},
	"Sega - Saturn":                                  {"redump"},
	"Sega - Dreamcast":                               {"redump"},
	"Sony - PlayStation":                             {"redump"},
	"Sony - PlayStation 2":                           {"redump"},
	"Sony - PlayStation 3":                           {"redump"},
	"Sony - PlayStation Portable":                    {"no-intro", "redump"},
	"Microsoft - Xbox":                               {"redump"},
}

// LibretroDatFileName — имя файла в папке dats. Слово no-intro/redump в имени нужно,
// чтобы detectSource правильно пометил источник.
// LibretroDatFileName is the stored file name; the set name lets detectSource tag the source.
func LibretroDatFileName(set, system string) string {
	return fmt.Sprintf("libretro %s - %s.dat", set, system)
}

type libretroFetchResult struct {
	System string `json:"system"`
	Set    string `json:"set,omitempty"`
	File   string `json:"file,omitempty"`
	Games  int    `json:"games,omitempty"`
	Reason string `json:"reason,omitempty"`
}

// fetchLibretroDat качает один DAT во временный файл, проверяет парсером и только потом
// кладёт на место. Уже скачанный файл не трогаем, если force=false.
// fetchLibretroDat downloads one DAT to a temp file, validates it and only then moves it in.
func fetchLibretroDat(client *http.Client, dir, set, system string, force bool) libretroFetchResult {
	res := libretroFetchResult{System: system, Set: set, File: LibretroDatFileName(set, system)}
	dest := filepath.Join(dir, res.File)
	if !force {
		if _, err := os.Stat(dest); err == nil {
			res.Reason = "уже есть / already present"
			return res
		}
	}
	src := fmt.Sprintf("%s/%s/%s.dat", libretroDatBase, set, url.PathEscape(system))
	resp, err := client.Get(src)
	if err != nil {
		res.Reason = err.Error()
		return res
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		res.Reason = fmt.Sprintf("HTTP %d", resp.StatusCode)
		return res
	}
	tmp, err := os.CreateTemp(dir, ".libretro-*.dat")
	if err != nil {
		res.Reason = err.Error()
		return res
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)
	_, err = io.Copy(tmp, io.LimitReader(resp.Body, maxDatUpload))
	tmp.Close()
	if err != nil {
		res.Reason = err.Error()
		return res
	}
	_, games, err := dat.ParseFile(tmpPath)
	if err != nil {
		res.Reason = "файл не похож на DAT / not a DAT file: " + err.Error()
		return res
	}
	for _, g := range games {
		res.Games += len(g)
	}
	if res.Games == 0 {
		res.Reason = "DAT пустой / empty DAT"
		return res
	}
	if err := os.Rename(tmpPath, dest); err != nil {
		res.Reason = err.Error()
		return res
	}
	return res
}

// libretroFetchAll качает DAT для перечисленных систем. Системы без набора в libretroDatSets
// возвращаются в failed с причиной.
// libretroFetchAll downloads DATs for the given systems; unknown systems are reported as failed.
func libretroFetchAll(dir string, systems []string, force bool) (fetched, skipped, failed []libretroFetchResult) {
	client := &http.Client{Timeout: 3 * time.Minute}
	seen := map[string]bool{}
	for _, raw := range systems {
		system := strings.TrimSpace(raw)
		if system == "" || seen[system] {
			continue
		}
		seen[system] = true
		sets, ok := libretroDatSets[system]
		if !ok {
			failed = append(failed, libretroFetchResult{System: system, Reason: "в libretro-database нет DAT для этой системы / no DAT for this system in libretro-database"})
			continue
		}
		for _, set := range sets {
			r := fetchLibretroDat(client, dir, set, system, force)
			switch {
			case r.Reason == "":
				fetched = append(fetched, r)
			case strings.HasPrefix(r.Reason, "уже есть"):
				skipped = append(skipped, r)
			default:
				failed = append(failed, r)
			}
		}
	}
	return
}
