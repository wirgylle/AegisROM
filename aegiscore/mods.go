package aegiscore

// Хаки, переводы и пропатченные ромы — так же, как во фронтенде (src/utils/romHacks.ts, detectRomMod).
// Они не битые дампы и не дубли оригинала: в 1G1R по названию не участвуют.
// Hacks, translations and patched ROMs, as in the frontend (src/utils/romHacks.ts, detectRomMod).
// They are neither bad dumps nor duplicates of the original: they skip 1G1R title matching.

import (
	"path/filepath"
	"regexp"
	"strings"
)

const (
	ModOriginal    = ""
	ModTranslation = "translation"
	ModHack        = "hack"
	ModFix         = "fix"
	ModTrainer     = "trainer"
	ModPatched     = "patched"

	HackRomsDir = "hackroms"
)

var (
	modTranslationTag  = regexp.MustCompile(`(?i)\[T[+-][A-Za-z]{2,3}[^\]]*\]`)
	modTranslationWord = regexp.MustCompile(`(?i)[(\[][^)\]]*\btranslat(?:ed|ion)\b[^)\]]*[)\]]`)
	modHackTag         = regexp.MustCompile(`\[h(\d*[A-Za-z]?\d*)?(?:[\s_]+[^\]]*)?\]`)
	modHackWord        = regexp.MustCompile(`(?i)[(\[][^)\]]*\bhack(?:ed)?\b[^)\]]*[)\]]`)
	modFixTag          = regexp.MustCompile(`\[f\d*(?:[\s_]+[^\]]*)?\]`)
	modFixWord         = regexp.MustCompile(`(?i)[(\[](fixed|fix)[)\]]`)
	modTrainerTag      = regexp.MustCompile(`\[t\d*(?:[\s_]+[^\]]*)?\]`)
	modTrainerWord     = regexp.MustCompile(`(?i)[(\[](trainer|trained)[)\]]`)
	modPatchedWord     = regexp.MustCompile(`(?i)[(\[](patched|patch)[)\]]`)
)

// IsInHackFolder: путь проходит через папку hackroms/. / The path goes through a hackroms/ folder.
func IsInHackFolder(path string) bool {
	dir := filepath.ToSlash(filepath.Dir(path))
	for _, seg := range strings.Split(dir, "/") {
		if strings.EqualFold(seg, HackRomsDir) {
			return true
		}
	}
	return false
}

// DetectRomModKind возвращает вид модификации по имени файла и пути ("" — оригинал).
// DetectRomModKind returns the kind of modification from the file name and path ("" = original).
func DetectRomModKind(fileName, path string) string {
	base := strings.TrimSuffix(fileName, filepath.Ext(fileName))
	kind := ModOriginal
	if modTranslationTag.MatchString(base) || modTranslationWord.MatchString(base) {
		kind = ModTranslation
	}
	// Перевод поверх хака — всё равно хак. / A translation on top of a hack is still a hack.
	if modHackTag.MatchString(base) || modHackWord.MatchString(base) {
		kind = ModHack
	}
	if kind == ModOriginal {
		switch {
		case modFixTag.MatchString(base) || modFixWord.MatchString(base):
			kind = ModFix
		case modTrainerTag.MatchString(base) || modTrainerWord.MatchString(base):
			kind = ModTrainer
		case modPatchedWord.MatchString(base):
			kind = ModPatched
		}
	}
	if kind == ModOriginal && path != "" && IsInHackFolder(path) {
		kind = ModPatched
	}
	return kind
}
