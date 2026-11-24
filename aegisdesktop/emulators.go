package aegisdesktop

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
)

// EmulatorConfig is appDir/emulators_config.json (same format as the Windows build).
type EmulatorConfig struct {
	CustomPaths      map[string]string `json:"customPaths"`
	StarredByConsole map[string]string `json:"starredByConsole"`
}

func (c *EmulatorConfig) normalize() {
	if c.CustomPaths == nil {
		c.CustomPaths = map[string]string{}
	}
	if c.StarredByConsole == nil {
		c.StarredByConsole = map[string]string{}
	}
}

// LoadEmulatorConfig reads the config; a missing or broken file gives an empty one.
func LoadEmulatorConfig(appDir string) EmulatorConfig {
	var cfg EmulatorConfig
	if raw, err := os.ReadFile(filepath.Join(appDir, "emulators_config.json")); err == nil {
		_ = json.Unmarshal(raw, &cfg)
	}
	cfg.normalize()
	return cfg
}

// SaveEmulatorConfig writes the config.
func SaveEmulatorConfig(appDir string, cfg EmulatorConfig) error {
	cfg.normalize()
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(appDir, "emulators_config.json"), data, 0o644)
}

// DetectEmulators returns emulator paths (custom paths first, then the platform
// table) and the RetroArch cores found. Paths may be .app bundles.
func (p Platform) DetectEmulators(customPaths map[string]string) (map[string]string, []string) {
	detected := map[string]string{}
	for id, cands := range p.Emulators {
		if c := customPaths[id]; c != "" && IsLaunchable(c) {
			detected[id] = c
			continue
		}
		if hit := firstMatch(cands); hit != "" {
			detected[id] = hit
		}
	}
	for id, c := range customPaths {
		if c != "" && IsLaunchable(c) {
			detected[id] = c
		}
	}
	cores := []string{}
	if ra := detected["retroarch"]; ra != "" {
		cores = p.InstalledCores(ra)
	}
	return detected, cores
}

// LaunchArgs builds the command line for an emulator. emuPath may be a .app bundle;
// the name check uses the bundle or file name. isRetroArch forces RetroArch mode.
func (p Platform) LaunchArgs(emuPath, coreFile, romPath string, isRetroArch bool) []string {
	low := strings.ToLower(filepath.Base(emuPath))
	switch {
	case isRetroArch || strings.Contains(low, "retroarch"):
		args := []string{}
		if core := p.ResolveCore(emuPath, coreFile); core != "" {
			args = append(args, "-L", core)
		}
		return append(args, romPath)
	case strings.Contains(low, "duckstation"):
		return []string{"-batch", "-fullscreen", "--", romPath}
	case strings.Contains(low, "pcsx2"):
		return []string{"-fullscreen", "-batch", "--", romPath}
	case strings.Contains(low, "dolphin"):
		return []string{"-b", "-e", romPath}
	case strings.Contains(low, "rpcs3"):
		return []string{"--no-gui", romPath}
	case strings.Contains(low, "xemu"):
		return []string{"-full-screen", "-dvd_path", romPath}
	case strings.Contains(low, "mgba"), strings.Contains(low, "ryujinx"):
		return []string{"-f", romPath}
	}
	return []string{romPath}
}
