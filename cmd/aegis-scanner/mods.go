package main

// Хаки, переводы и пропатченные ромы — как во фронтенде (src/utils/romHacks.ts) и в aegiscore/mods.go.
// Сканер — отдельный модуль без aegiscore, поэтому правила продублированы здесь.
// Hacks, translations and patched ROMs, as in the frontend (src/utils/romHacks.ts) and aegiscore/mods.go.
// The scanner is a separate module without aegiscore, so the rules are duplicated here.

import (
	"path/filepath"
	"regexp"
	"strings"
)

const hackRomsDir = "hackroms"

var (
	modTranslationRe = regexp.MustCompile(`(?i)\[T[+-][A-Za-z]{2,3}[^\]]*\]|[(\[][^)\]]*\btranslat(?:ed|ion)\b[^)\]]*[)\]]`)
	modHackRe        = regexp.MustCompile(`\[h(\d*[A-Za-z]?\d*)?(?:[\s_]+[^\]]*)?\]|(?i:[(\[][^)\]]*\bhack(?:ed)?\b[^)\]]*[)\]])`)
	modFixRe         = regexp.MustCompile(`\[f\d*(?:[\s_]+[^\]]*)?\]|(?i:[(\[](fixed|fix)[)\]])`)
	modTrainerRe     = regexp.MustCompile(`\[t\d*(?:[\s_]+[^\]]*)?\]|(?i:[(\[](trainer|trained)[)\]])`)
	modPatchedRe     = regexp.MustCompile(`(?i)[(\[](patched|patch)[)\]]`)
)

func inHackFolder(path string) bool {
	for _, seg := range strings.Split(filepath.ToSlash(filepath.Dir(path)), "/") {
		if strings.EqualFold(seg, hackRomsDir) {
			return true
		}
	}
	return false
}

// detectModKind: "" — оригинал, иначе translation / hack / fix / trainer / patched.
// detectModKind: "" for an original, otherwise translation / hack / fix / trainer / patched.
func detectModKind(fileName, path string) string {
	base := strings.TrimSuffix(fileName, filepath.Ext(fileName))
	kind := ""
	if modTranslationRe.MatchString(base) {
		kind = "translation"
	}
	if modHackRe.MatchString(base) {
		kind = "hack"
	}
	if kind == "" {
		switch {
		case modFixRe.MatchString(base):
			kind = "fix"
		case modTrainerRe.MatchString(base):
			kind = "trainer"
		case modPatchedRe.MatchString(base):
			kind = "patched"
		}
	}
	if kind == "" && path != "" && inHackFolder(path) {
		kind = "patched"
	}
	return kind
}
