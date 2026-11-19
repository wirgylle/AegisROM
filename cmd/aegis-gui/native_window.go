//go:build windows

package main

// Нативное окно (Wails v3 + WebView2) вместо Edge/Chrome --app.
// Native window (Wails v3 + WebView2) instead of Edge/Chrome --app.
//
// RU: Пока это опция: `AegisROM.exe --native-window` или пустой файл
// appDir/use-native-window. По умолчанию остаётся окно Edge, пока этап 1
// (настройки на диске, docs/desktop-shell.md) не выйдет в релиз. Если Wails
// не смог открыть окно (например, нет WebView2 Runtime), открывается Edge.
//
// EN: Opt-in for now: `AegisROM.exe --native-window` or an empty file
// appDir/use-native-window. The Edge window stays the default until stage 1
// (settings on disk, docs/desktop-shell.md) has shipped. If Wails cannot open
// a window (e.g. no WebView2 Runtime), Edge opens instead.

import (
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

const nativeWindowMarkerFile = "use-native-window"

// nativeWindowRequested is set by --native-window and cleared by --legacy-window.
var nativeWindowFlag, legacyWindowFlag bool

func useNativeWindow(appDir string) bool {
	if legacyWindowFlag {
		return false
	}
	if nativeWindowFlag {
		return true
	}
	_, err := os.Stat(filepath.Join(appDir, nativeWindowMarkerFile))
	return err == nil
}

// needsLegacyStorageMigration: the disk store is empty, but an Edge profile
// from an earlier version exists, so settings still live only in that profile.
func needsLegacyStorageMigration(appDir string) bool {
	if entries, err := os.ReadDir(filepath.Join(appDir, "storage")); err == nil {
		for _, e := range entries {
			if !e.IsDir() && strings.HasSuffix(e.Name(), ".json") {
				return false
			}
		}
	}
	st, err := os.Stat(filepath.Join(appDir, appBrowserProfileDirName, "Default"))
	return err == nil && st.IsDir()
}

// migrateLegacyBrowserStorage opens the old Edge window once with
// ?aegis-migrate=1. The page uploads localStorage and IndexedDB to
// /api/native/storage (src/main.tsx), reports to /api/native/storage-migrated
// and closes. Returns once the page reported or after the timeout.
func migrateLegacyBrowserStorage(appDir, appURL string, done <-chan struct{}) {
	browserExe := findAppBrowserExecutable()
	if browserExe == "" {
		return
	}
	profileDir := filepath.Join(appDir, appBrowserProfileDirName)
	prepareAppBrowserProfile(profileDir)
	migrateURL := appURL + "&aegis-migrate=1"
	cmd := exec.Command(browserExe, append(appBrowserArgs(migrateURL, profileDir), "--window-position=-32000,-32000", "--window-size=400,300")...)
	if err := cmd.Start(); err != nil {
		return
	}
	select {
	case <-done:
		time.Sleep(300 * time.Millisecond)
	case <-time.After(45 * time.Second):
	}
	if cmd.Process != nil {
		_ = cmd.Process.Kill()
	}
	go func() { _ = cmd.Wait() }()
}

// runNativeWindow blocks until the window is closed. API requests from the
// page go straight to handler through the Wails asset server, without TCP,
// so the loopback guard is not involved.
func runNativeWindow(handler http.Handler, appDir string) error {
	app := application.New(application.Options{
		Name:        "AegisROM",
		Description: "AegisROM",
		Assets: application.AssetOptions{
			Handler:        handler,
			DisableLogging: true,
		},
		Windows: application.WindowsOptions{
			WebviewUserDataPath: filepath.Join(appDir, "WebView2"),
		},
	})
	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:     "AegisROM " + AEGIS_APP_VERSION,
		Width:     1440,
		Height:    900,
		MinWidth:  960,
		MinHeight: 600,
		URL:       "/?v=" + AEGIS_APP_VERSION,
	})
	return app.Run()
}
