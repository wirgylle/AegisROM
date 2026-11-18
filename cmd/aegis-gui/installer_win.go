//go:build windows
// +build windows

package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"aegisgui/cmd/winsetup"
)

const AEGIS_APP_VERSION = winsetup.AppVersion

type InstalledAppInfo struct {
	IsInstalled      bool                         `json:"isInstalled"`
	InstalledDir     string                       `json:"installedDir"`
	InstalledVersion string                       `json:"installedVersion"`
	CurrentVersion   string                       `json:"currentVersion"`
	DefaultDir       string                       `json:"defaultInstallDir"`
	IsUpToDate       bool                         `json:"isUpToDate"`
	CanUpgrade       bool                         `json:"canUpgrade"`
	IsLegacyPreBeta  bool                         `json:"isLegacyPreBeta"`
	Installations    []winsetup.FoundInstallation `json:"installations"`
}

func defaultProgramFilesInstallDir() string {
	return winsetup.DefaultProgramFilesDir()
}

func getInstalledAppInfo() InstalledAppInfo {
	rep := winsetup.DiscoverAllInstallations()
	info := InstalledAppInfo{
		IsInstalled:      rep.HasAny,
		InstalledDir:     rep.PrimaryDir,
		InstalledVersion: rep.PrimaryVersion,
		CurrentVersion:   winsetup.AppVersion,
		DefaultDir:       rep.DefaultInstallDir,
		IsUpToDate:       rep.HasUpToDate && !rep.HasOldCopies,
		CanUpgrade:       rep.HasOldCopies,
		IsLegacyPreBeta:  rep.HasLegacyPreBeta,
		Installations:    rep.Installations,
	}
	if !rep.HasAny {
		info.InstalledDir = ""
		info.InstalledVersion = ""
	}
	return info
}

func isRunningFromAnyInstalledDir() bool {
	selfExe, err := os.Executable()
	if err != nil || selfExe == "" {
		return false
	}
	cleanSelf := filepath.Clean(selfExe)
	rep := winsetup.DiscoverAllInstallations()
	for _, inst := range rep.Installations {
		if strings.EqualFold(cleanSelf, filepath.Join(inst.Dir, "AegisROM.exe")) {
			return true
		}
	}
	pfTarget := filepath.Join(defaultProgramFilesInstallDir(), "AegisROM.exe")
	if strings.EqualFold(cleanSelf, pfTarget) {
		return true
	}
	return isRunningFromInstalledDir()
}

func promptSelectFolderDialog(title, initialDir string) (string, error) {
	chosen := winsetup.BrowseForFolder(0, title)
	return chosen, nil
}

func copySelfExePayload(destExe string) error {
	selfExe, err := os.Executable()
	if err != nil || selfExe == "" {
		return fmt.Errorf("не удалось определить путь текущего EXE")
	}
	return winsetup.CopyFileContents(selfExe, destExe)
}

func embeddedIconBytes() []byte {
	icoBytes, _ := embeddedWebDist.ReadFile("webdist/favicon.ico")
	return icoBytes
}

func installToCustomDirectory(targetDir string) (string, error) {
	if strings.TrimSpace(targetDir) == "" {
		targetDir = defaultProgramFilesInstallDir()
	}
	targetDir = filepath.Clean(targetDir)

	opts := winsetup.InstallOptions{
		TargetDir:        targetDir,
		CleanupOldCopies: true,
		CreateShortcuts:  true,
		LaunchAfter:      false,
	}
	rep := winsetup.DiscoverAllInstallations()
	var oldDirs []string
	for _, inst := range rep.Installations {
		oldDirs = append(oldDirs, inst.Dir)
	}

	needElev := !winsetup.IsRunningAsAdmin()
	if needElev {
		// Probe write access before requesting UAC
		_ = os.MkdirAll(targetDir, 0755)
		probe := filepath.Join(targetDir, fmt.Sprintf(".aegis_probe_%d", os.Getpid()))
		if wErr := os.WriteFile(probe, []byte("1"), 0644); wErr == nil {
			_ = os.Remove(probe)
			needElev = false
			for _, od := range oldDirs {
				if strings.Contains(strings.ToLower(od), `\program files`) {
					needElev = true
					break
				}
			}
		}
	}

	if needElev {
		selfExe, _ := os.Executable()
		args := fmt.Sprintf(`--elevated-install --target "%s"`, targetDir)
		code, err := winsetup.RunElevatedAndWait(selfExe, args, filepath.Dir(selfExe))
		if err != nil {
			return "", err
		}
		if code != 0 {
			return "", fmt.Errorf("установка завершилась с кодом %d", code)
		}
		return filepath.Join(targetDir, "AegisROM.exe"), nil
	}

	return winsetup.PerformInstall(opts, copySelfExePayload, embeddedIconBytes())
}

func uninstallFromDirectory(targetDir string) error {
	if !winsetup.IsRunningAsAdmin() {
		selfExe, _ := os.Executable()
		code, err := winsetup.RunElevatedAndWait(selfExe, "--elevated-uninstall", filepath.Dir(selfExe))
		if err != nil {
			return err
		}
		if code != 0 {
			return fmt.Errorf("удаление завершилось с кодом %d", code)
		}
		return nil
	}
	return winsetup.PerformUninstallAll()
}

func runNativeGuiInstallerWizard() (launchApp bool, installedExePath string) {
	res := winsetup.ShowNativeSetupWindow(copySelfExePayload, embeddedIconBytes())
	if res.Installed {
		// ShowNativeSetupWindow already launches res.InstalledExe if res.LaunchAfter == true
		return false, res.InstalledExe
	}
	if res.Uninstalled {
		return false, ""
	}
	return false, ""
}
