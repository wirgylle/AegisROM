package aegisdesktop

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// Platform holds per-OS paths: where emulators, RetroArch cores and chdman usually live.
type Platform struct {
	// Name is runtime.GOOS of the table ("darwin", "linux").
	Name string
	// Emulators maps an emulator id (same ids as the Windows build and the UI) to
	// candidate paths. A candidate may be a glob (e.g. "/Applications/PCSX2*.app").
	Emulators map[string][]string
	// CoreDirs lists RetroArch core folders for a detected RetroArch path.
	CoreDirs func(retroArchPath string) []string
	// CoreExt is the native core extension (".dylib", ".so").
	CoreExt string
	// Chdman lists chdman candidates besides the tools folder and PATH.
	Chdman []string
	// ExtraPath is appended to PATH lookups: apps started from Finder get a bare
	// PATH without Homebrew.
	ExtraPath []string
}

// appCandidates builds "<dir>/<name>" for every app folder and bundle name.
func appCandidates(dirs []string, names ...string) []string {
	out := make([]string, 0, len(dirs)*len(names))
	for _, n := range names {
		for _, d := range dirs {
			out = append(out, filepath.Join(d, n))
		}
	}
	return out
}

// DarwinPlatform is the macOS table. home is the user's home folder.
// RU: Эмуляторы на macOS — бандлы .app в /Applications и ~/Applications
// (и в подпапке Emulators). Ядра RetroArch — .dylib в
// ~/Library/Application Support/RetroArch/cores. chdman — из Homebrew
// (brew install rom-tools) или указанный вручную.
// EN: On macOS emulators are .app bundles in /Applications and ~/Applications
// (and an Emulators subfolder). RetroArch cores are .dylib files in
// ~/Library/Application Support/RetroArch/cores. chdman comes from Homebrew
// (brew install rom-tools) or is picked by hand.
func DarwinPlatform(home string) Platform {
	dirs := []string{"/Applications", "/Applications/Emulators"}
	if home != "" {
		dirs = append(dirs, filepath.Join(home, "Applications"), filepath.Join(home, "Applications", "Emulators"))
	}
	raSupport := ""
	if home != "" {
		raSupport = filepath.Join(home, "Library", "Application Support", "RetroArch")
	}
	return Platform{
		Name: "darwin",
		Emulators: map[string][]string{
			"retroarch":              appCandidates(dirs, "RetroArch.app"),
			"duckstation_standalone": appCandidates(dirs, "DuckStation.app"),
			"pcsx2_standalone":       appCandidates(dirs, "PCSX2.app", "PCSX2*.app"),
			"mgba_standalone":        appCandidates(dirs, "mGBA.app"),
			"melonds_standalone":     appCandidates(dirs, "melonDS.app"),
			"ppsspp_standalone":      appCandidates(dirs, "PPSSPPSDL.app", "PPSSPP.app"),
			"dolphin_standalone":     appCandidates(dirs, "Dolphin.app"),
			"rpcs3_standalone":       appCandidates(dirs, "RPCS3.app", "rpcs3.app"),
			"ryujinx_standalone":     appCandidates(dirs, "Ryujinx.app"),
			"xemu_standalone":        appCandidates(dirs, "xemu.app"),
		},
		CoreDirs: func(ra string) []string {
			out := []string{}
			if raSupport != "" {
				out = append(out, filepath.Join(raSupport, "cores"))
			}
			if IsAppBundle(ra) {
				out = append(out, filepath.Join(ra, "Contents", "Resources", "cores"))
			}
			return out
		},
		CoreExt:   ".dylib",
		Chdman:    []string{"/opt/homebrew/bin/chdman", "/usr/local/bin/chdman"},
		ExtraPath: []string{"/opt/homebrew/bin", "/usr/local/bin"},
	}
}

// LinuxPlatform is the Linux table (no Linux release yet; used by aegis-server and tests).
func LinuxPlatform(home string) Platform {
	bins := []string{"/usr/bin", "/usr/local/bin"}
	if home != "" {
		bins = append(bins, filepath.Join(home, ".local", "bin"))
	}
	cand := func(names ...string) []string { return appCandidates(bins, names...) }
	return Platform{
		Name: "linux",
		Emulators: map[string][]string{
			"retroarch":              cand("retroarch"),
			"duckstation_standalone": cand("duckstation-qt", "DuckStation*.AppImage"),
			"pcsx2_standalone":       cand("pcsx2-qt", "PCSX2*.AppImage"),
			"mgba_standalone":        cand("mgba-qt", "mgba"),
			"melonds_standalone":     cand("melonDS"),
			"ppsspp_standalone":      cand("PPSSPPSDL", "ppsspp"),
			"dolphin_standalone":     cand("dolphin-emu"),
			"rpcs3_standalone":       cand("rpcs3", "rpcs3*.AppImage"),
			"ryujinx_standalone":     cand("Ryujinx", "ryujinx"),
			"xemu_standalone":        cand("xemu"),
		},
		CoreDirs: func(string) []string {
			out := []string{"/usr/lib/libretro", "/usr/lib/x86_64-linux-gnu/libretro"}
			if home != "" {
				out = append([]string{filepath.Join(home, ".config", "retroarch", "cores")}, out...)
			}
			return out
		},
		CoreExt: ".so",
		Chdman:  []string{"/usr/bin/chdman", "/usr/local/bin/chdman"},
	}
}

// firstMatch returns the first launchable candidate, expanding globs.
func firstMatch(candidates []string) string {
	for _, c := range candidates {
		if c == "" {
			continue
		}
		if strings.ContainsAny(c, "*?[") {
			matches, _ := filepath.Glob(c)
			sort.Strings(matches)
			for _, m := range matches {
				if IsLaunchable(m) {
					return m
				}
			}
			continue
		}
		if IsLaunchable(c) {
			return c
		}
	}
	return ""
}

// NativeCoreName maps a core file name from the UI catalog (Windows names such as
// "snes9x_libretro.dll") to this platform's extension.
func (p Platform) NativeCoreName(core string) string {
	base := filepath.Base(core)
	ext := filepath.Ext(base)
	switch strings.ToLower(ext) {
	case ".dll", ".dylib", ".so":
		return strings.TrimSuffix(base, ext) + p.CoreExt
	}
	return base
}

// ResolveCore finds a core file for RetroArch: an absolute path as is, otherwise
// the native name in the core folders. Returns "" when nothing is found.
func (p Platform) ResolveCore(retroArchPath, core string) string {
	if core == "" {
		return ""
	}
	if filepath.IsAbs(core) {
		if isRegularFile(core) {
			return core
		}
		return ""
	}
	name := p.NativeCoreName(core)
	for _, dir := range p.CoreDirs(retroArchPath) {
		if c := filepath.Join(dir, name); isRegularFile(c) {
			return c
		}
	}
	return ""
}

// InstalledCores lists cores found for RetroArch. Names are reported with the
// ".dll" extension because the UI catalog compares against Windows core names.
func (p Platform) InstalledCores(retroArchPath string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, dir := range p.CoreDirs(retroArchPath) {
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		for _, e := range entries {
			if e.IsDir() || !strings.EqualFold(filepath.Ext(e.Name()), p.CoreExt) {
				continue
			}
			name := strings.TrimSuffix(e.Name(), filepath.Ext(e.Name())) + ".dll"
			if !seen[strings.ToLower(name)] {
				seen[strings.ToLower(name)] = true
				out = append(out, name)
			}
		}
	}
	sort.Strings(out)
	return out
}
