//go:build windows

package main

// Своё окно (Wails v3 + WebView2) вместо Edge/Chrome --app.
// Native window (Wails v3 + WebView2) instead of Edge/Chrome --app.
//
// RU: С 0.6.2 своё окно открывается по умолчанию. Edge остаётся запасным вариантом:
//   - ключ `--legacy-window` или файл appDir/use-legacy-window (Настройки → Окно приложения);
//   - нет WebView2 Runtime;
//   - окно не загрузило страницу за nativeWindowLoadTimeout (сразу открывается Edge);
//   - прошлый запуск своего окна оборвался до загрузки страницы (файл native-window-pending
//     остался на диске): Edge включается сам и запоминается, вернуть окно можно в Настройках.
// `--native-window` включает своё окно, даже если выше выбран Edge.
//
// EN: Since 0.6.2 the native window is the default. Edge stays as the fallback:
//   - `--legacy-window` or the appDir/use-legacy-window file (Settings → App window);
//   - no WebView2 Runtime;
//   - the window did not load the page within nativeWindowLoadTimeout (Edge opens right away);
//   - the previous native start died before the page loaded (native-window-pending was left on
//     disk): Edge is switched on and remembered; Settings bring the window back.
// `--native-window` forces the native window over all of the above.

import (
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"golang.org/x/sys/windows/registry"
)

const (
	legacyWindowMarkerFile  = "use-legacy-window"
	nativeWindowPendingFile = "native-window-pending"
	nativeWindowLoadTimeout = 30 * time.Second
	// Значения в файле use-legacy-window. / Values in the use-legacy-window file.
	legacyReasonUser = "user"
	legacyReasonAuto = "auto"
)

// Ключи командной строки. / Command-line switches.
var nativeWindowFlag, legacyWindowFlag bool

// nativeWindowActive: страница сейчас открыта в своём окне (для preferNative у VFS).
// nativeWindowActive: the page is in the native window now (drives VFS preferNative).
var nativeWindowActive atomic.Bool

// Причина выбора режима для /api/native/window-mode. / Why the mode was chosen.
var windowModeReason atomic.Value

func fileExists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}

// webView2Installed: WebView2 Runtime есть в системе (ключи EdgeUpdate, как в документации Microsoft).
// webView2Installed: the WebView2 Runtime is installed (EdgeUpdate keys, per Microsoft docs).
func webView2Installed() bool {
	const client = `Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}`
	keys := []struct {
		root registry.Key
		path string
	}{
		{registry.LOCAL_MACHINE, `SOFTWARE\WOW6432Node\` + client},
		{registry.LOCAL_MACHINE, `SOFTWARE\` + client},
		{registry.CURRENT_USER, `Software\` + client},
	}
	for _, k := range keys {
		key, err := registry.OpenKey(k.root, k.path, registry.QUERY_VALUE)
		if err != nil {
			continue
		}
		pv, _, err := key.GetStringValue("pv")
		key.Close()
		if err == nil && pv != "" && pv != "0.0.0.0" {
			return true
		}
	}
	return false
}

func legacyMarkerReason(appDir string) string {
	raw, err := os.ReadFile(filepath.Join(appDir, legacyWindowMarkerFile))
	if err != nil {
		return ""
	}
	if strings.TrimSpace(string(raw)) == legacyReasonAuto {
		return legacyReasonAuto
	}
	return legacyReasonUser
}

func setLegacyMarker(appDir, reason string) {
	_ = os.MkdirAll(appDir, 0o755)
	_ = os.WriteFile(filepath.Join(appDir, legacyWindowMarkerFile), []byte(reason), 0o644)
}

// decideNativeWindow решает, открывать ли своё окно, и запоминает причину.
// decideNativeWindow picks the window and records why.
func decideNativeWindow(appDir string) bool {
	native, reason := decideNativeWindowReason(appDir)
	windowModeReason.Store(reason)
	return native
}

func decideNativeWindowReason(appDir string) (bool, string) {
	pending := filepath.Join(appDir, nativeWindowPendingFile)
	if legacyWindowFlag {
		return false, "flag"
	}
	if !webView2Installed() {
		return false, "no-webview2"
	}
	if nativeWindowFlag {
		_ = os.Remove(pending)
		return true, "flag"
	}
	if r := legacyMarkerReason(appDir); r != "" {
		return false, r
	}
	if fileExists(pending) {
		// Прошлый запуск не дошёл до загрузки страницы. / The last start never loaded the page.
		_ = os.Remove(pending)
		setLegacyMarker(appDir, legacyReasonAuto)
		return false, legacyReasonAuto
	}
	return true, "default"
}

// registerWindowModeRoutes: GET — текущий режим, POST {"mode":"native"|"edge"} — режим со следующего запуска.
// registerWindowModeRoutes: GET returns the mode, POST {"mode":"native"|"edge"} sets it from the next start.
func registerWindowModeRoutes(mux *http.ServeMux, appDir string) {
	mux.HandleFunc("/api/native/window-mode", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		if r.Method == http.MethodPost {
			var body struct {
				Mode string `json:"mode"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil || (body.Mode != "native" && body.Mode != "edge") {
				http.Error(w, "bad mode", http.StatusBadRequest)
				return
			}
			if body.Mode == "edge" {
				setLegacyMarker(appDir, legacyReasonUser)
			} else {
				_ = os.Remove(filepath.Join(appDir, legacyWindowMarkerFile))
				_ = os.Remove(filepath.Join(appDir, nativeWindowPendingFile))
			}
		}
		current := "edge"
		if nativeWindowActive.Load() {
			current = "native"
		}
		next := "native"
		if legacyMarkerReason(appDir) != "" {
			next = "edge"
		}
		reason, _ := windowModeReason.Load().(string)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"ok":         true,
			"current":    current,
			"next":       next,
			"reason":     reason,
			"webview2":   webView2Installed(),
			"forcedEdge": legacyWindowFlag,
		})
	})
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

// runNativeWindow открывает своё окно и ждёт его закрытия. Запросы страницы идут прямо в handler
// через сервер ассетов Wails, без TCP, поэтому guard не участвует.
// loaded=false: окно так и не запросило страницу (нет WebView2, сбой, таймаут) — тогда нужен Edge.
// quit закрывает окно (новый запуск AegisROM просит старый завершиться).
//
// runNativeWindow opens the native window and blocks until it closes. Page requests go straight
// to handler through the Wails asset server, without TCP, so the guard is not involved.
// loaded=false: the window never requested the page (no WebView2, crash, timeout): open Edge.
// quit closes the window (a newer AegisROM launch asks the old one to exit).
func runNativeWindow(handler http.Handler, appDir string, quit <-chan struct{}) (loaded bool, err error) {
	pending := filepath.Join(appDir, nativeWindowPendingFile)
	_ = os.MkdirAll(appDir, 0o755)
	_ = os.WriteFile(pending, []byte(time.Now().Format(time.RFC3339)), 0o644)

	loadedCh := make(chan struct{})
	var loadedOnce sync.Once
	wrapped := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		loadedOnce.Do(func() {
			close(loadedCh)
			_ = os.Remove(pending)
		})
		handler.ServeHTTP(w, r)
	})

	nativeWindowActive.Store(true)
	app := application.New(application.Options{
		Name:        "AegisROM",
		Description: "AegisROM",
		Assets: application.AssetOptions{
			Handler:        wrapped,
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

	done := make(chan struct{})
	go func() {
		select {
		case <-loadedCh:
		case <-done:
			return
		case <-time.After(nativeWindowLoadTimeout):
			app.Quit()
			return
		}
		select {
		case <-quit:
			app.Quit()
		case <-done:
		}
	}()
	err = app.Run()
	close(done)

	select {
	case <-loadedCh:
		return true, err
	default:
	}
	// Окно не загрузило страницу: дальше Edge, и он же со следующего запуска.
	// The window never loaded the page: Edge now and from the next start.
	nativeWindowActive.Store(false)
	_ = os.Remove(pending)
	setLegacyMarker(appDir, legacyReasonAuto)
	windowModeReason.Store(legacyReasonAuto)
	return false, err
}
