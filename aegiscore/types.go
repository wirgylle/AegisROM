package aegiscore

import (
	"encoding/xml"
	"regexp"
	"sync"
)

type RomItem struct {
	FilePath        string
	SourceSubfolder string
	FileName        string
	ExtractedTitle  string // Real title extracted from inside ROM binary or gamelist.xml
	CleanTitle      string
	ComparisonKey   string
	CanonicalName   string
	Extension       string
	ConsoleCode     string
	Generation      string
	FileSize        int64
	CRC32           string
	HeaderlessCRC32 string
	MD5             string
	Region          string
	IsRussian       bool
	IsFromTopFolder bool
	IsNumberedFile  bool // e.g., 000001.pbp, 000002.chd, 0001.bin
	Revision        string
	Status          string // "verified", "duplicate_clone", "junk_bad_dump"
	Is1G1RWinner    bool
	Reason          string
	MediaStatus     string
}

type PhantomFolderItem struct {
	FullPath       string
	RelativePath   string
	FolderName     string
	Reason         string
	FileCount      int
	TotalBytes     int64
	HasUsefulMedia bool
	DefaultChecked bool
}

type GameListXML struct {
	XMLName xml.Name       `xml:"gameList"`
	Games   []GameEntryXML `xml:"game"`
}

type GameEntryXML struct {
	Path        string `xml:"path"`
	Name        string `xml:"name"`
	Desc        string `xml:"desc"`
	Image       string `xml:"image,omitempty"`
	Thumbnail   string `xml:"thumbnail,omitempty"`
	Marquee     string `xml:"marquee,omitempty"`
	Video       string `xml:"video,omitempty"`
	Rating      string `xml:"rating,omitempty"`
	ReleaseDate string `xml:"releasedate,omitempty"`
	Developer   string `xml:"developer,omitempty"`
	Publisher   string `xml:"publisher,omitempty"`
	Genre       string `xml:"genre,omitempty"`
	Region      string `xml:"region,omitempty"`
}

var (
	regionRegex       = regexp.MustCompile(`(?i)\((USA|Europe|Japan|World|Russia|Rus|Ru|Germany|France|Spain|Italy|Australia|Asia|Korea|Brazil|China|En,Fr,De|En,Ja|U|E|J|W|UE|JU)\)`)
	rusTagRegex       = regexp.MustCompile(`(?i)(\[rus\]|\(rus\)|\(ru\)|\[r-rus\]|\[russian\]|\(russian\)|_rus\b|\.rus\b|\brus\b|рус)`)
	revisionRegex     = regexp.MustCompile(`(?i)\((Rev\s*[0-9A-Z]+|v[0-9]+\.[0-9]+|Alt\s*[0-9]*)\)`)
	junkRegex         = regexp.MustCompile(`(?i)\[(b[0-9]*|h[0-9]*|t[0-9]*|p[0-9]*|o[0-9]*)\]|\((Pirate|Bootleg|Corrupt|Bad)\)`)
	TagStripRegex     = regexp.MustCompile(`\[.*?\]|\(.*?\)`)
	leadingNumRegex   = regexp.MustCompile(`^[\s\[\(#]*0*(\d{1,10})[\s\])\._-]+`)
	PureNumberRegex   = regexp.MustCompile(`^(?:game[_-]?|rom[_-]?|track[_-]?|psx[_-]?|ps1[_-]?)?0*(\d{1,10})(?:[_-]?[1-4a-d])?$`)
	seqPrefixNumRegex = regexp.MustCompile(`^[\s\[\(#]*0*(\d{1,10})(?:[\s\])\._-]+|$)`)
	ps1SerialRegex    = regexp.MustCompile(`(?i)(SLUS|SCUS|SLES|SCES|SLPS|SCPS|SLPM|SIPS|ESPM|PAPX|PBPX|SCPM|LSP)[_\-\s\.]*(\d{3})[\.\_\-]?(\d{2})`)
	hrefPngRegex      = regexp.MustCompile(`href="([^"]+\.png)"`)
	xmlGameBlockRegex = regexp.MustCompile(`(?is)<game\b[^>]*>(.*?)</game>`)
)

type XmlMappingCandidate struct {
	OldFileName    string
	CoreKey        string
	CleanTitle     string
	NewFileName    string
	HasRomOnDisk   bool
	HasImage       bool
	HasVideo       bool
	DefaultChecked bool
	SourceLabel    string
}

var (
	// Cache gamelist.xml mappings per folder (dirPath -> map[lowercaseFileName]GameTitle)
	gamelistTitleCache = make(map[string]map[string]string)
	// Cache full gamelist.xml entries per folder (dirPath -> map[lowercaseKey]GameEntryXML)
	gamelistEntryCache = make(map[string]map[string]GameEntryXML)
	// Cache detected sequential numbers per folder (dirPath -> map[lowercaseFileName]bool)
	seqNumberedDirCache = make(map[string]map[string]bool)
	libretroIndexCache  = make(map[string][]libretroEntry)
	archiveVideoCache   = make(map[string][]archiveVideoEntry)
	cacheMu             sync.Mutex
)

type libretroEntry struct {
	FileName string
	NormKey  string
	Tokens   map[string]bool
}

type archiveVideoEntry struct {
	FileName string
	NormKey  string
	Tokens   map[string]bool
}
