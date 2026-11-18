//go:build windows
// +build windows

package main

import (
	"bytes"
	"compress/gzip"
	_ "embed"
	"flag"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"aegisgui/cmd/winsetup"
)

//go:embed payload/AegisROM.exe.gz
var embeddedExeGz []byte

//go:embed payload/favicon.ico
var embeddedIco []byte

func writeEmbeddedAegisExe(destExe string) error {
	gz, err := gzip.NewReader(bytes.NewReader(embeddedExeGz))
	if err != nil {
		return err
	}
	defer gz.Close()

	tmpDest := destExe + ".tmp"
	f, err := os.Create(tmpDest)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(f, gz)
	closeErr := f.Close()
	if copyErr != nil {
		_ = os.Remove(tmpDest)
		return copyErr
	}
	if closeErr != nil {
		_ = os.Remove(tmpDest)
		return closeErr
	}
	_ = os.Remove(destExe)
	return os.Rename(tmpDest, destExe)
}

func main() {
	runtime.LockOSThread()

	// Strip Windows Mark-of-the-Web (Zone.Identifier) on self
	if selfExe, err := os.Executable(); err == nil && selfExe != "" {
		_ = os.Remove(selfExe + ":Zone.Identifier")
	}

	elevInstall := flag.Bool("elevated-install", false, "")
	elevUninstall := flag.Bool("elevated-uninstall", false, "")
	targetDir := flag.String("target", winsetup.DefaultProgramFilesDir(), "")
	cleanupOld := flag.Bool("cleanup", true, "")
	createShortcuts := flag.Bool("shortcuts", true, "")
	flag.Parse()

	if *elevUninstall {
		if err := winsetup.PerformUninstallAll(); err != nil {
			os.Exit(1)
		}
		os.Exit(0)
	}

	if *elevInstall {
		opts := winsetup.InstallOptions{
			TargetDir:        strings.TrimSpace(*targetDir),
			CleanupOldCopies: *cleanupOld,
			CreateShortcuts:  *createShortcuts,
			LaunchAfter:      false,
		}
		if _, err := winsetup.PerformInstall(opts, writeEmbeddedAegisExe, embeddedIco); err != nil {
			winsetup.MessageBox(0, "Ошибка установки:\n"+err.Error(), "AegisROM Setup", winsetup.MB_OK|winsetup.MB_ICONERROR)
			os.Exit(1)
		}
		os.Exit(0)
	}

	// Interactive Pure-Win32 GUI Installer Wizard
	_ = filepath.Clean(*targetDir)
	winsetup.ShowNativeSetupWindow(writeEmbeddedAegisExe, embeddedIco)
}
