package dat

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// Query — что известно о роме. Пустые поля не участвуют в поиске.
// Query is what is known about a ROM. Empty fields are not used.
type Query struct {
	ID string `json:"id"`
	// System — имя системы как в Libretro/No-Intro ("Sony - PlayStation"), только для выбора
	// при нескольких совпадениях. / System name, only used to break ties.
	System string `json:"system,omitempty"`
	Size   int64  `json:"size,omitempty"`
	CRC32  string `json:"crc32,omitempty"`
	// HeaderlessCRC32 и HeaderlessSize — хеш без заголовка (iNES, копир SNES).
	// Hash without the copier/iNES header.
	HeaderlessCRC32 string `json:"headerlessCrc32,omitempty"`
	HeaderlessSize  int64  `json:"headerlessSize,omitempty"`
	SHA1            string `json:"sha1,omitempty"`
	MD5             string `json:"md5,omitempty"`
	Serial          string `json:"serial,omitempty"`
}

// Match — найденная игра. / A found game.
type Match struct {
	ID        string `json:"id"`
	Matched   bool   `json:"matched"`
	Name      string `json:"name,omitempty"`
	RomName   string `json:"romName,omitempty"`
	Source    Source `json:"source,omitempty"`
	DatName   string `json:"datName,omitempty"`
	DatFile   string `json:"datFile,omitempty"`
	MatchedBy string `json:"matchedBy,omitempty"` // sha1 | md5 | crc32 | crc32-headerless | serial
	BadDump   bool   `json:"badDump,omitempty"`
	// Reason — почему не найдено (пусто при совпадении). / Why nothing matched.
	Reason string `json:"reason,omitempty"`
}

type entry struct {
	game *Game
	rom  *Rom
}

// Status — что загружено. / What is loaded.
type Status struct {
	Dir      string    `json:"dir"`
	Dats     []*Info   `json:"dats"`
	Games    int       `json:"games"`
	Roms     int       `json:"roms"`
	LoadedAt time.Time `json:"loadedAt"`
}

// Index — индекс по всем DAT из папки. Безопасен для параллельного чтения.
// Index over every DAT in a folder. Safe for concurrent reads.
type Index struct {
	mu       sync.RWMutex
	status   Status
	byCRC    map[string][]entry
	bySHA1   map[string][]entry
	byMD5    map[string][]entry
	bySerial map[string][]*Game
}

// NewIndex создаёт пустой индекс. / Creates an empty index.
func NewIndex() *Index {
	ix := &Index{}
	ix.reset("")
	return ix
}

func (ix *Index) reset(dir string) {
	ix.status = Status{Dir: dir, Dats: []*Info{}}
	ix.byCRC = map[string][]entry{}
	ix.bySHA1 = map[string][]entry{}
	ix.byMD5 = map[string][]entry{}
	ix.bySerial = map[string][]*Game{}
}

// Add добавляет игры одного DAT в индекс. / Adds one DAT's games to the index.
func (ix *Index) Add(info *Info, games []*Game) {
	ix.mu.Lock()
	defer ix.mu.Unlock()
	ix.add(info, games)
}

func (ix *Index) add(info *Info, games []*Game) {
	ix.status.Dats = append(ix.status.Dats, info)
	ix.status.Games += len(games)
	for _, g := range games {
		g.Dat = info
		for i := range g.Roms {
			r := &g.Roms[i]
			ix.status.Roms++
			e := entry{game: g, rom: r}
			if r.CRC32 != "" {
				ix.byCRC[r.CRC32] = append(ix.byCRC[r.CRC32], e)
			}
			if r.SHA1 != "" {
				ix.bySHA1[r.SHA1] = append(ix.bySHA1[r.SHA1], e)
			}
			if r.MD5 != "" {
				ix.byMD5[r.MD5] = append(ix.byMD5[r.MD5], e)
			}
		}
		for _, s := range g.Serials {
			ix.bySerial[s] = append(ix.bySerial[s], g)
		}
	}
}

// LoadDir перечитывает все *.dat, *.xml и *.zip из папки и её подпапок первого уровня.
// Ошибки отдельных файлов попадают в Status.Dats[i].Error, а не прерывают загрузку.
// LoadDir rereads every *.dat, *.xml and *.zip in dir and one level of subfolders.
// Per-file errors land in Status.Dats[i].Error instead of aborting the load.
func (ix *Index) LoadDir(dir string) Status {
	var files []string
	collect := func(d string) {
		entries, err := os.ReadDir(d)
		if err != nil {
			return
		}
		for _, e := range entries {
			if e.IsDir() {
				continue
			}
			switch strings.ToLower(filepath.Ext(e.Name())) {
			case ".dat", ".xml", ".zip":
				files = append(files, filepath.Join(d, e.Name()))
			}
		}
	}
	collect(dir)
	if entries, err := os.ReadDir(dir); err == nil {
		for _, e := range entries {
			if e.IsDir() {
				collect(filepath.Join(dir, e.Name()))
			}
		}
	}
	sort.Strings(files)

	type parsed struct {
		infos []*Info
		games [][]*Game
		err   error
		path  string
	}
	results := make([]parsed, len(files))
	var wg sync.WaitGroup
	sem := make(chan struct{}, 4)
	for i, p := range files {
		wg.Add(1)
		go func(i int, p string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			infos, games, err := ParseFile(p)
			results[i] = parsed{infos: infos, games: games, err: err, path: p}
		}(i, p)
	}
	wg.Wait()

	ix.mu.Lock()
	defer ix.mu.Unlock()
	ix.reset(dir)
	for _, r := range results {
		if r.err != nil {
			rel, _ := filepath.Rel(dir, r.path)
			ix.status.Dats = append(ix.status.Dats, &Info{File: filepath.ToSlash(rel), Error: r.err.Error()})
			continue
		}
		for i, info := range r.infos {
			if rel, err := filepath.Rel(dir, r.path); err == nil && !strings.Contains(info.File, "/") {
				info.File = filepath.ToSlash(rel)
			}
			ix.add(info, r.games[i])
		}
	}
	ix.status.LoadedAt = time.Now()
	return ix.snapshot()
}

// Status возвращает копию сведений о загруженных DAT. / Returns a copy of the load status.
func (ix *Index) Status() Status {
	ix.mu.RLock()
	defer ix.mu.RUnlock()
	return ix.snapshot()
}

func (ix *Index) snapshot() Status {
	s := ix.status
	s.Dats = append([]*Info(nil), ix.status.Dats...)
	return s
}

// Empty — true, если ни одного DAT не загружено. / True when no DAT is loaded.
func (ix *Index) Empty() bool {
	ix.mu.RLock()
	defer ix.mu.RUnlock()
	return ix.status.Games == 0
}

// Lookup ищет игру. Порядок: SHA1, MD5, CRC32+размер, CRC32 без заголовка, серийник.
// При нескольких кандидатах выигрывает DAT той же системы, затем не bad dump.
// Lookup finds a game. Order: SHA1, MD5, CRC32+size, headerless CRC32, serial.
// Among several candidates the DAT of the same system wins, then a good dump.
func (ix *Index) Lookup(q Query) Match {
	ix.mu.RLock()
	defer ix.mu.RUnlock()
	sys := NormalizeSystem(q.System)
	res := Match{ID: q.ID}

	if ix.status.Games == 0 {
		res.Reason = "DAT-файлы не загружены / no DAT files loaded"
		return res
	}

	try := func(cands []entry, by string, size int64) bool {
		if len(cands) == 0 {
			return false
		}
		var filtered []entry
		for _, e := range cands {
			if size > 0 && e.rom.Size > 0 && e.rom.Size != size {
				continue
			}
			filtered = append(filtered, e)
		}
		if best, ok := pickEntry(filtered, sys); ok {
			res.Matched = true
			res.Name = best.game.Name
			res.RomName = best.rom.Name
			res.Source = best.game.Dat.Source
			res.DatName = best.game.Dat.Name
			res.DatFile = best.game.Dat.File
			res.MatchedBy = by
			res.BadDump = best.rom.BadDump
			return true
		}
		return false
	}

	if sha := strings.ToLower(strings.TrimSpace(q.SHA1)); len(sha) == 40 && try(ix.bySHA1[sha], "sha1", 0) {
		return res
	}
	if md := strings.ToLower(strings.TrimSpace(q.MD5)); len(md) == 32 && try(ix.byMD5[md], "md5", 0) {
		return res
	}
	if crc := strings.ToUpper(strings.TrimSpace(q.CRC32)); len(crc) == 8 && try(ix.byCRC[crc], "crc32", q.Size) {
		return res
	}
	if crc := strings.ToUpper(strings.TrimSpace(q.HeaderlessCRC32)); len(crc) == 8 && !strings.EqualFold(crc, q.CRC32) {
		size := q.HeaderlessSize
		if try(ix.byCRC[crc], "crc32-headerless", size) {
			return res
		}
	}
	if s := NormalizeSerial(q.Serial); s != "" {
		if g, ok := pickGame(ix.bySerial[s], sys); ok {
			res.Matched = true
			res.Name = g.Name
			res.Source = g.Dat.Source
			res.DatName = g.Dat.Name
			res.DatFile = g.Dat.File
			res.MatchedBy = "serial"
			return res
		}
	}

	switch {
	case q.CRC32 == "" && q.SHA1 == "" && q.MD5 == "" && q.Serial == "":
		res.Reason = "нет хеша и серийника для сверки / no hash or serial to compare"
	case sys != "" && !ix.hasSystem(sys):
		res.Reason = "нет DAT для системы / no DAT for system: " + q.System
	default:
		res.Reason = "хеша нет в загруженных DAT / hash not found in loaded DATs"
	}
	return res
}

func (ix *Index) hasSystem(sys string) bool {
	for _, d := range ix.status.Dats {
		if d.System == sys {
			return true
		}
	}
	return false
}

func rank(g *Game, bad bool, sys string) int {
	score := 0
	if sys != "" && g.Dat.System == sys {
		score += 4
	}
	if !bad {
		score += 2
	}
	if g.Dat.Source == SourceNoIntro || g.Dat.Source == SourceRedump {
		score++
	}
	return score
}

func pickEntry(cands []entry, sys string) (entry, bool) {
	if len(cands) == 0 {
		return entry{}, false
	}
	best, bestScore := cands[0], -1
	for _, e := range cands {
		if s := rank(e.game, e.rom.BadDump, sys); s > bestScore {
			best, bestScore = e, s
		}
	}
	return best, true
}

func pickGame(cands []*Game, sys string) (*Game, bool) {
	if len(cands) == 0 {
		return nil, false
	}
	best, bestScore := cands[0], -1
	for _, g := range cands {
		if s := rank(g, false, sys); s > bestScore {
			best, bestScore = g, s
		}
	}
	return best, true
}
