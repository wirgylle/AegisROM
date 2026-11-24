//go:build darwin

// aegis-mac — AegisROM для macOS: окно Wails (WKWebView) поверх общего Go API.
// aegis-mac — AegisROM for macOS: a Wails window (WKWebView) over the shared Go API.
//
// RU: Сервер по TCP не поднимается: запросы страницы идут в http.ServeMux
// напрямую через обработчик ассетов Wails. Данные лежат в
// ~/Library/Application Support/AegisROM. Сборка .app и .dmg — scripts/release-mac.sh.
//
// EN: No TCP server: page requests go straight to the http.ServeMux through the
// Wails asset handler. Data lives in ~/Library/Application Support/AegisROM.
// The .app and .dmg are built by scripts/release-mac.sh.
package main

import (
	"embed"
	"encoding/json"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"runtime"

	"aegisgui/aegisapi"
	"aegisgui/aegisdesktop"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed all:webdist
var embeddedWebDist embed.FS

// appVersion is set by scripts/release-mac.sh (-ldflags -X main.appVersion=...).
var appVersion = "dev"

func appDataDir() string {
	base, err := os.UserConfigDir() // ~/Library/Application Support
	if err != nil {
		home, _ := os.UserHomeDir()
		base = filepath.Join(home, "Library", "Application Support")
	}
	dir := filepath.Join(base, "AegisROM")
	_ = os.MkdirAll(dir, 0o755)
	return dir
}

// wailsDialogs implements aegisdesktop.Dialogs with NSOpenPanel through Wails.
type wailsDialogs struct{ app *application.App }

func (d wailsDialogs) PickFolder(title, initialDir string) (string, error) {
	dlg := d.app.Dialog.OpenFile().
		CanChooseDirectories(true).
		CanChooseFiles(false).
		CanCreateDirectories(true).
		SetTitle(title).
		SetMessage(title)
	if initialDir != "" {
		dlg.SetDirectory(initialDir)
	}
	return dlg.PromptForSingleSelection()
}

func (d wailsDialogs) PickFile(title string, filters []aegisdesktop.FileFilter) (string, error) {
	// RU: .app — это папка-пакет; без TreatsFilePackagesAsDirectories панель
	// даёт выбрать её как файл, что и нужно для эмуляторов.
	// EN: A .app is a package folder; without TreatsFilePackagesAsDirectories the
	// panel lets it be picked as a file, which is what emulators need.
	dlg := d.app.Dialog.OpenFile().
		CanChooseFiles(true).
		CanChooseDirectories(false).
		SetTitle(title).
		SetMessage(title)
	for _, f := range filters {
		dlg.AddFilter(f.Name, f.Patterns)
	}
	return dlg.PromptForSingleSelection()
}

func main() {
	webAssets, err := fs.Sub(embeddedWebDist, "webdist")
	if err != nil {
		log.Fatal(err)
	}
	indexBytes, err := fs.ReadFile(webAssets, "index.html")
	if err != nil || len(indexBytes) == 0 {
		log.Fatal("AegisROM: frontend is not embedded (run scripts/release-mac.sh)")
	}
	appDir := appDataDir()

	mux := http.NewServeMux()
	app := application.New(application.Options{
		Name:        "AegisROM",
		Description: "AegisROM",
		Assets: application.AssetOptions{
			Handler:        mux,
			DisableLogging: true,
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})
	dialogs := wailsDialogs{app: app}

	mux.HandleFunc("/api/native/status", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"nativeDesktop": true,
			"platform":      "darwin",
			"arch":          runtime.GOARCH,
			"version":       appVersion,
			"architecture":  "Go + React, Wails WKWebView (macOS)",
			"appDir":        appDir,
		})
	})
	mux.HandleFunc("/api/native/heartbeat", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_, _ = w.Write([]byte(`{"ok":true}`))
	})

	aegisapi.RegisterLibraryRoutes(mux, appDir, nil)
	aegisapi.RegisterStorageRoutes(mux, appDir, nil)
	// WKWebView has no File System Access API: folders always go through Go.
	aegisapi.RegisterVFSRoutes(mux, appDir, nil, aegisapi.VFSOptions{
		PickFolder:   func(title string) (string, error) { return dialogs.PickFolder(title, "") },
		PreferNative: true,
	})
	aegisapi.RegisterQuickTestRoutes(mux, nil)
	aegisapi.RegisterSaveRoutes(mux, nil)
	registerTransfer(mux, appDir)
	aegisdesktop.RegisterRoutes(mux, aegisdesktop.Options{
		AppDir:   appDir,
		Dialogs:  dialogs,
		Platform: aegisdesktop.Current(),
	})
	mux.Handle("/", aegisapi.SPAHandler(webAssets, indexBytes, nil))

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:     "AegisROM " + appVersion,
		Width:     1440,
		Height:    900,
		MinWidth:  960,
		MinHeight: 600,
		URL:       "/?v=" + appVersion,
	})
	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
