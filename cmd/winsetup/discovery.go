//go:build windows
// +build windows

package winsetup

import (
	"bytes"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// AppVersion: базовая версия из package.json; dev-сборки CI подменяют её через -ldflags -X (0.5.6-dev+коммит).
// AppVersion: base version from package.json; CI dev builds override it via -ldflags -X (0.5.6-dev+commit).
var AppVersion = "0.5.6"

type FoundInstallation struct {
	Dir              string `json:"dir"`
	ExePath          string `json:"exePath"`
	Version          string `json:"version"`
	Source           string `json:"source"`
	IsCurrentVersion bool   `json:"isCurrentVersion"`
	IsLegacyPreBeta  bool   `json:"isLegacyPreBeta"`
	CanUpgrade       bool   `json:"canUpgrade"`
}

type DiscoveryReport struct {
	Installations       []FoundInstallation `json:"installations"`
	PrimaryDir          string              `json:"primaryDir"`
	PrimaryVersion      string              `json:"primaryVersion"`
	DefaultInstallDir   string              `json:"defaultInstallDir"`
	HasAny              bool                `json:"hasAny"`
	HasUpToDate         bool                `json:"hasUpToDate"`
	HasOldCopies        bool                `json:"hasOldCopies"`
	HasLegacyPreBeta    bool                `json:"hasLegacyPreBeta"`
	SummaryLines        []string            `json:"summaryLines"`
}

func DefaultProgramFilesDir() string {
	pf := GetKnownFolderPath(CSIDL_PROGRAM_FILES)
	if pf == "" {
		pf = os.Getenv("ProgramFiles")
	}
	if pf == "" {
		pf = `C:\Program Files`
	}
	return filepath.Join(pf, "AegisROM")
}

func UserDataAppDir() string {
	appData := GetKnownFolderPath(CSIDL_APPDATA)
	if appData == "" {
		appData = os.Getenv("APPDATA")
	}
	if appData == "" {
		home, _ := os.UserHomeDir()
		if home != "" {
			appData = filepath.Join(home, "AppData", "Roaming")
		}
	}
	if appData == "" {
		exe, _ := os.Executable()
		return filepath.Dir(exe)
	}
	dir := filepath.Join(appData, "AegisROM")
	_ = os.MkdirAll(dir, 0755)
	return dir
}

func ParseSemverParts(s string) [3]int {
	s = strings.TrimPrefix(strings.TrimSpace(strings.ToLower(s)), "v")
	parts := strings.Split(s, ".")
	var out [3]int
	for i := 0; i < len(parts) && i < 3; i++ {
		numStr := ""
		for _, ch := range parts[i] {
			if ch >= '0' && ch <= '9' {
				numStr += string(ch)
			} else {
				break
			}
		}
		if numStr != "" {
			out[i], _ = strconv.Atoi(numStr)
		}
	}
	return out
}

func IsLegacyPreBeta(v string) bool {
	if v == "" {
		return false
	}
	p := ParseSemverParts(v)
	return p[0] >= 1 // pre-beta versions 1.0, 4.x, 5.0 are all legacy compared to 0.5.x Beta!
}

func CompareSemver(installed, target string) int {
	pa := ParseSemverParts(installed)
	pb := ParseSemverParts(target)
	aLegacy := pa[0] >= 1
	bLegacy := pb[0] >= 1
	if aLegacy && !bLegacy {
		return -1
	}
	if !aLegacy && bLegacy {
		return 1
	}
	for i := 0; i < 3; i++ {
		if pa[i] < pb[i] {
			return -1
		}
		if pa[i] > pb[i] {
			return 1
		}
	}
	return 0
}

// DetectVersionFromExe scans version.txt and embedded EXE markers on disk so even unregistered copies in AppData\Local show their exact version.
func DetectVersionFromExe(exePath string, regHintVersion string) string {
	dir := filepath.Dir(exePath)
	if raw, err := os.ReadFile(filepath.Join(dir, "version.txt")); err == nil {
		v := strings.TrimSpace(strings.TrimPrefix(string(raw), "\xEF\xBB\xBF"))
		if v != "" {
			return v
		}
	}
	if f, err := os.Open(exePath); err == nil {
		defer f.Close()
		// Read EXE in chunks (up to 16 MB) to inspect embedded title/version markers
		buf := make([]byte, 16*1024*1024)
		n, _ := io.ReadFull(f, buf)
		data := buf[:n]
		// Текущая версия первой: её exe тоже содержит строки-маркеры старых версий ниже.
		// Current version first: its exe also contains the older markers below.
		if bytes.Contains(data, []byte("AegisROM v"+AppVersion+" (Beta)")) {
			return AppVersion
		}
		if bytes.Contains(data, []byte("AegisROM v0.5.5")) {
			return "0.5.5"
		}
		if bytes.Contains(data, []byte("AegisROM v0.5.4")) || bytes.Contains(data, []byte("WebViewProfile_0_5_4")) || bytes.Contains(data, []byte(`"version":"0.5.4"`)) {
			return "0.5.4"
		}
		if bytes.Contains(data, []byte("AegisROM v0.5.3")) || bytes.Contains(data, []byte("WebViewProfile_0_5_3")) || bytes.Contains(data, []byte(`"version":"0.5.3"`)) {
			return "0.5.3"
		}
		if bytes.Contains(data, []byte("AegisROM v0.5.2")) || bytes.Contains(data, []byte("WebViewProfile_0_5_2")) || bytes.Contains(data, []byte(`"version":"0.5.2"`)) {
			return "0.5.2"
		}
		if bytes.Contains(data, []byte("AegisROM v0.5.1")) {
			return "0.5.1"
		}
		if bytes.Contains(data, []byte("AegisROM v5.0")) {
			return "5.0"
		}
		if bytes.Contains(data, []byte("AegisROM v4.3")) {
			return "4.3"
		}
		if bytes.Contains(data, []byte("AegisROM v4.2")) {
			return "4.2"
		}
		if bytes.Contains(data, []byte("AegisROM v4.1")) {
			return "4.1"
		}
		if bytes.Contains(data, []byte("AegisROM v4.0")) {
			return "4.0"
		}
		if bytes.Contains(data, []byte("AegisROM v0.5")) {
			return "0.5.0"
		}
	}
	if strings.TrimSpace(regHintVersion) != "" {
		return strings.TrimSpace(regHintVersion)
	}
	return "0.4.0"
}

func DiscoverAllInstallations() DiscoveryReport {
	report := DiscoveryReport{
		DefaultInstallDir: DefaultProgramFilesDir(),
	}

	selfExe, _ := os.Executable()
	cleanSelfExe := strings.ToLower(filepath.Clean(selfExe))

	seenDirs := map[string]bool{}
	addCandidate := func(dir string, exeName string, source string, regVer string) {
		dir = strings.TrimSpace(dir)
		if dir == "" {
			return
		}
		dir = filepath.Clean(dir)
		key := strings.ToLower(dir)
		if seenDirs[key] {
			return
		}
		var foundExe string
		names := []string{}
		if exeName != "" {
			names = append(names, exeName)
		}
		names = append(names, "AegisROM.exe", "AegisROM-Portable-Win11-x64.exe")
		for _, n := range names {
			cand := filepath.Join(dir, n)
			if strings.EqualFold(filepath.Clean(cand), cleanSelfExe) && strings.Contains(strings.ToLower(n), "setup") {
				continue
			}
			if st, err := os.Stat(cand); err == nil && !st.IsDir() && st.Size() > 100000 {
				foundExe = cand
				break
			}
		}
		if foundExe == "" {
			return
		}
		seenDirs[key] = true
		ver := DetectVersionFromExe(foundExe, regVer)
		cmp := CompareSemver(ver, AppVersion)
		isLegacy := IsLegacyPreBeta(ver)
		item := FoundInstallation{
			Dir:              dir,
			ExePath:          foundExe,
			Version:          ver,
			Source:           source,
			IsCurrentVersion: cmp >= 0 && !isLegacy,
			IsLegacyPreBeta:  isLegacy,
			CanUpgrade:       cmp < 0 || isLegacy,
		}
		report.Installations = append(report.Installations, item)
	}

	// 1. Scan Windows Registry (HKLM 64-bit, HKLM WOW6432Node, HKCU, plus any matching Uninstall key)
	regLocations := []struct {
		root uintptr
		wow  uint32
		label string
	}{
		{HKEY_LOCAL_MACHINE, KEY_WOW64_64KEY, "Реестр HKLM"},
		{HKEY_LOCAL_MACHINE, KEY_WOW64_32KEY, "Реестр HKLM (x86)"},
		{HKEY_CURRENT_USER, 0, "Реестр HKCU"},
	}
	const uninstallRoot = `Software\Microsoft\Windows\CurrentVersion\Uninstall`
	for _, rl := range regLocations {
		for _, subName := range []string{"AegisROM", "AegisROM_is1"} {
			fullSub := uninstallRoot + `\` + subName
			if loc, ok := ReadRegString(rl.root, fullSub, "InstallLocation", rl.wow); ok && loc != "" {
				ver, _ := ReadRegString(rl.root, fullSub, "DisplayVersion", rl.wow)
				addCandidate(loc, "", rl.label, ver)
			}
		}
		for _, subName := range EnumRegSubkeys(rl.root, uninstallRoot, rl.wow) {
			if strings.Contains(strings.ToLower(subName), "aegis") {
				fullSub := uninstallRoot + `\` + subName
				if loc, ok := ReadRegString(rl.root, fullSub, "InstallLocation", rl.wow); ok && loc != "" {
					ver, _ := ReadRegString(rl.root, fullSub, "DisplayVersion", rl.wow)
					addCandidate(loc, "", rl.label, ver)
				}
			}
		}
	}

	// 2. Scan ALL standard Windows install folders (Program Files + ALL AppData\Local / Roaming paths!)
	pf := GetKnownFolderPath(CSIDL_PROGRAM_FILES)
	pf86 := GetKnownFolderPath(CSIDL_PROGRAM_FILESX86)
	localApp := GetKnownFolderPath(CSIDL_LOCAL_APPDATA)
	roamingApp := GetKnownFolderPath(CSIDL_APPDATA)
	userProf := os.Getenv("USERPROFILE")
	sysDrive := os.Getenv("SystemDrive")
	if sysDrive == "" {
		sysDrive = "C:"
	}

	dirChecks := []struct {
		path   string
		source string
	}{
		{DefaultProgramFilesDir(), "Program Files"},
		{filepath.Join(pf, "AegisROM"), "Program Files"},
		{filepath.Join(pf86, "AegisROM"), "Program Files (x86)"},
		{filepath.Join(localApp, "Programs", "AegisROM"), `AppData\Local\Programs`},
		{filepath.Join(localApp, "AegisROM"), `AppData\Local`},
		{filepath.Join(roamingApp, "AegisROM"), `AppData\Roaming`},
		{filepath.Join(roamingApp, "Programs", "AegisROM"), `AppData\Roaming\Programs`},
		{filepath.Join(userProf, "AegisROM"), "Профиль пользователя"},
		{filepath.Join(sysDrive+`\`, "AegisROM"), `Диск ` + sysDrive},
	}
	for _, dc := range dirChecks {
		if dc.path != "" && !strings.HasPrefix(dc.path, string(filepath.Separator)) {
			addCandidate(dc.path, "", dc.source, "")
		}
	}

	// 3. Inspect ALL Desktop / Start Menu shortcuts to uncover ANY custom folder where an old copy was installed!
	for _, folder := range AllShortcutSearchFolders() {
		entries, err := os.ReadDir(folder)
		if err != nil {
			continue
		}
		for _, ent := range entries {
			if !ent.IsDir() && strings.HasSuffix(strings.ToLower(ent.Name()), ".lnk") && strings.Contains(strings.ToLower(ent.Name()), "aegis") {
				target := ReadWindowsShortcutTarget(filepath.Join(folder, ent.Name()))
				if target != "" && strings.HasSuffix(strings.ToLower(target), ".exe") {
					addCandidate(filepath.Dir(target), filepath.Base(target), "Ярлык: "+ent.Name(), "")
				}
			}
		}
	}

	report.HasAny = len(report.Installations) > 0
	for _, inst := range report.Installations {
		if inst.IsCurrentVersion {
			report.HasUpToDate = true
		} else {
			report.HasOldCopies = true
		}
		if inst.IsLegacyPreBeta {
			report.HasLegacyPreBeta = true
		}
		badge := "обновить"
		if inst.IsCurrentVersion {
			badge = "актуальная"
		} else if inst.IsLegacyPreBeta {
			badge = "устаревшая сборка"
		}
		report.SummaryLines = append(report.SummaryLines, fmt.Sprintf("• %s — v%s (%s, %s)", inst.Dir, inst.Version, badge, inst.Source))
		if report.PrimaryDir == "" {
			report.PrimaryDir = inst.Dir
			report.PrimaryVersion = inst.Version
		}
	}
	// Prefer Program Files copy as PrimaryDir if one already exists there, else DefaultProgramFilesDir
	for _, inst := range report.Installations {
		if strings.EqualFold(inst.Dir, report.DefaultInstallDir) {
			report.PrimaryDir = inst.Dir
			report.PrimaryVersion = inst.Version
			break
		}
	}
	if !report.HasAny || report.PrimaryDir == "" {
		report.PrimaryDir = report.DefaultInstallDir
	}
	return report
}

func AllShortcutSearchFolders() []string {
	candidates := []string{
		GetKnownFolderPath(CSIDL_DESKTOPDIRECTORY),
		GetKnownFolderPath(CSIDL_COMMON_DESKTOPDIR),
		GetKnownFolderPath(CSIDL_PROGRAMS),
		GetKnownFolderPath(CSIDL_COMMON_PROGRAMS),
		filepath.Join(GetKnownFolderPath(CSIDL_PROGRAMS), "AegisROM"),
		filepath.Join(GetKnownFolderPath(CSIDL_COMMON_PROGRAMS), "AegisROM"),
	}
	if up := os.Getenv("USERPROFILE"); up != "" {
		candidates = append(candidates,
			filepath.Join(up, "Desktop"),
			filepath.Join(up, "OneDrive", "Desktop"),
			filepath.Join(up, "OneDrive", "Рабочий стол"),
		)
	}
	seen := map[string]bool{}
	var out []string
	for _, c := range candidates {
		if c == "" {
			continue
		}
		clean := filepath.Clean(c)
		k := strings.ToLower(clean)
		if seen[k] {
			continue
		}
		seen[k] = true
		if st, err := os.Stat(clean); err == nil && st.IsDir() {
			out = append(out, clean)
		}
	}
	return out
}
