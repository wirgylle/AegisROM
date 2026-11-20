//go:build windows
// +build windows

package main

import (
	"aegisgui/aegisapi"
	"aegisgui/aegiscore"
	"aegisgui/cmd/winsetup"
	"archive/zip"
	"bytes"
	"embed"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
	"unicode/utf16"
	"unsafe"
)

//go:embed all:webdist
var embeddedWebDist embed.FS

func getAegisAppDataDir() string {
	winsetup.MigrateUserConfigs(nil)
	return winsetup.UserDataAppDir()
}

func isRunningFromInstalledDir() bool {
	selfExe, err := os.Executable()
	if err != nil || selfExe == "" {
		return false
	}
	targetExe := filepath.Join(winsetup.DefaultProgramFilesDir(), "AegisROM.exe")
	return strings.EqualFold(filepath.Clean(selfExe), filepath.Clean(targetExe))
}

// Installs AegisROM.exe into Program Files (or target dir) and creates native Windows .lnk shortcuts via COM IShellLinkW (zero PowerShell).
func installDesktopAppShortcuts() (string, error) {
	targetExe, err := installToCustomDirectory(defaultProgramFilesInstallDir())
	if err != nil {
		return "", err
	}
	desk := winsetup.GetKnownFolderPath(winsetup.CSIDL_DESKTOPDIRECTORY)
	if desk != "" {
		return filepath.Join(desk, "AegisROM.lnk"), nil
	}
	return targetExe, nil
}

func findAppBrowserExecutable() string {
	candidates := []string{
		filepath.Join(os.Getenv("ProgramFiles(x86)"), "Microsoft", "Edge", "Application", "msedge.exe"),
		filepath.Join(os.Getenv("ProgramFiles"), "Microsoft", "Edge", "Application", "msedge.exe"),
		filepath.Join(os.Getenv("LocalAppData"), "Microsoft", "Edge", "Application", "msedge.exe"),
		filepath.Join(os.Getenv("ProgramFiles"), "Google", "Chrome", "Application", "chrome.exe"),
		filepath.Join(os.Getenv("ProgramFiles(x86)"), "Google", "Chrome", "Application", "chrome.exe"),
		filepath.Join(os.Getenv("LocalAppData"), "Google", "Chrome", "Application", "chrome.exe"),
	}
	for _, c := range candidates {
		if c != "" {
			if st, err := os.Stat(c); err == nil && !st.IsDir() {
				return c
			}
		}
	}
	if p, err := exec.LookPath("msedge.exe"); err == nil {
		return p
	}
	if p, err := exec.LookPath("chrome.exe"); err == nil {
		return p
	}
	return ""
}

func getAegisToolsDir() string {
	dir := filepath.Join(getAegisAppDataDir(), "tools")
	_ = os.MkdirAll(dir, 0755)
	return dir
}

func findChdmanExecutable() string {
	toolsDir := getAegisToolsDir()
	pathCfg := filepath.Join(toolsDir, "chdman_path.txt")
	if raw, err := os.ReadFile(pathCfg); err == nil {
		p := strings.TrimSpace(string(raw))
		if p != "" {
			if st, err := os.Stat(p); err == nil && !st.IsDir() {
				return p
			}
		}
	}

	selfExe, _ := os.Executable()
	exeDir := ""
	if selfExe != "" {
		exeDir = filepath.Dir(selfExe)
	}

	candidates := []string{
		filepath.Join(toolsDir, "chdman.exe"),
		filepath.Join(getAegisAppDataDir(), "chdman.exe"),
	}
	if exeDir != "" {
		candidates = append(candidates,
			filepath.Join(exeDir, "chdman.exe"),
			filepath.Join(exeDir, "tools", "chdman.exe"),
		)
	}
	candidates = append(candidates,
		filepath.Join(os.Getenv("APPDATA"), "RetroArch", "chdman.exe"),
		`C:\RetroArch-Win64\chdman.exe`,
		`C:\Program Files\MAME\chdman.exe`,
		`C:\MAME\chdman.exe`,
	)
	for _, c := range candidates {
		if c != "" {
			if st, err := os.Stat(c); err == nil && !st.IsDir() {
				return c
			}
		}
	}
	if p, err := exec.LookPath("chdman.exe"); err == nil {
		return p
	}
	return ""
}

func promptSelectChdmanExecutable() (string, error) {
	chosen, err := promptSelectExeOrFile("Укажите файл chdman.exe (из MAME или RetroArch)", "chdman.exe|chdman.exe|Исполняемые файлы (*.exe)|*.exe")
	if err != nil || chosen == "" {
		return "", err
	}
	if st, err := os.Stat(chosen); err != nil || st.IsDir() {
		return "", fmt.Errorf("выбранный файл не найден: %s", chosen)
	}
	toolsDir := getAegisToolsDir()
	dstExe := filepath.Join(toolsDir, "chdman.exe")
	if !strings.EqualFold(filepath.Clean(chosen), filepath.Clean(dstExe)) {
		if srcF, err := os.Open(chosen); err == nil {
			if dstF, err := os.Create(dstExe); err == nil {
				_, _ = io.Copy(dstF, srcF)
				_ = dstF.Close()
				chosen = dstExe
			}
			_ = srcF.Close()
		}
	}
	_ = os.WriteFile(filepath.Join(toolsDir, "chdman_path.txt"), []byte(chosen), 0644)
	return chosen, nil
}

type EmulatorConfigFile struct {
	CustomPaths      map[string]string `json:"customPaths"`
	StarredByConsole map[string]string `json:"starredByConsole"`
}

func loadEmulatorConfig(appDir string) EmulatorConfigFile {
	cfg := EmulatorConfigFile{
		CustomPaths:      map[string]string{},
		StarredByConsole: map[string]string{},
	}
	raw, err := os.ReadFile(filepath.Join(appDir, "emulators_config.json"))
	if err == nil {
		_ = json.Unmarshal(raw, &cfg)
		if cfg.CustomPaths == nil {
			cfg.CustomPaths = map[string]string{}
		}
		if cfg.StarredByConsole == nil {
			cfg.StarredByConsole = map[string]string{}
		}
	}
	return cfg
}

func saveEmulatorConfig(appDir string, cfg EmulatorConfigFile) error {
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(appDir, "emulators_config.json"), data, 0644)
}

func firstExistingFile(paths []string) string {
	for _, p := range paths {
		if p == "" {
			continue
		}
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			return p
		}
	}
	return ""
}

func detectInstalledEmulators(customPaths map[string]string) (map[string]string, []string) {
	localApp := os.Getenv("LOCALAPPDATA")
	appData := os.Getenv("APPDATA")
	progFiles := os.Getenv("ProgramFiles")
	progFiles86 := os.Getenv("ProgramFiles(x86)")
	userProf := os.Getenv("USERPROFILE")

	candidateMap := map[string][]string{
		"retroarch": {
			`C:\RetroArch-Win64\retroarch.exe`,
			`D:\RetroArch-Win64\retroarch.exe`,
			filepath.Join(appData, "RetroArch", "retroarch.exe"),
			filepath.Join(localApp, "Programs", "RetroArch", "retroarch.exe"),
			filepath.Join(progFiles, "RetroArch", "retroarch.exe"),
			filepath.Join(userProf, "RetroArch-Win64", "retroarch.exe"),
		},
		"duckstation_standalone": {
			`C:\Emulators\DuckStation\duckstation-qt-x64-ReleaseLTCG.exe`,
			`C:\Emulators\DuckStation\duckstation-nogui-x64-ReleaseLTCG.exe`,
			filepath.Join(localApp, "DuckStation", "duckstation-qt-x64-ReleaseLTCG.exe"),
			filepath.Join(progFiles, "DuckStation", "duckstation-qt-x64-ReleaseLTCG.exe"),
			filepath.Join(userProf, "DuckStation", "duckstation-qt-x64-ReleaseLTCG.exe"),
		},
		"pcsx2_standalone": {
			`C:\Emulators\PCSX2\pcsx2-qt.exe`,
			filepath.Join(localApp, "Programs", "PCSX2", "pcsx2-qt.exe"),
			filepath.Join(progFiles, "PCSX2", "pcsx2-qt.exe"),
		},
		"mgba_standalone": {
			`C:\Emulators\mGBA\mGBA.exe`,
			filepath.Join(progFiles, "mGBA", "mGBA.exe"),
			filepath.Join(progFiles86, "mGBA", "mGBA.exe"),
		},
		"melonds_standalone": {
			`C:\Emulators\melonDS\melonDS.exe`,
			filepath.Join(progFiles, "melonDS", "melonDS.exe"),
		},
		"ppsspp_standalone": {
			`C:\Emulators\PPSSPP\PPSSPPWindows64.exe`,
			`C:\Emulators\PPSSPP\PPSSPPWindows.exe`,
			filepath.Join(progFiles, "PPSSPP", "PPSSPPWindows64.exe"),
		},
		"dolphin_standalone": {
			`C:\Emulators\Dolphin\Dolphin.exe`,
			filepath.Join(progFiles, "Dolphin", "Dolphin.exe"),
		},
		"rpcs3_standalone": {
			`C:\Emulators\RPCS3\rpcs3.exe`,
			`D:\Emulators\RPCS3\rpcs3.exe`,
		},
		"ryujinx_standalone": {
			`C:\Emulators\Ryujinx\Ryujinx.exe`,
			filepath.Join(localApp, "Programs", "Ryujinx", "Ryujinx.exe"),
		},
		"xemu_standalone": {
			`C:\Emulators\Xemu\xemu.exe`,
			filepath.Join(progFiles, "xemu", "xemu.exe"),
		},
	}

	detected := map[string]string{}
	for key, paths := range candidateMap {
		if customVal, ok := customPaths[key]; ok && customVal != "" {
			if st, err := os.Stat(customVal); err == nil && !st.IsDir() {
				detected[key] = customVal
				continue
			}
		}
		if hit := firstExistingFile(paths); hit != "" {
			detected[key] = hit
		}
	}
	// Also validate any RetroArch-specific or custom emulator IDs saved directly in customPaths
	for k, v := range customPaths {
		if v == "" {
			continue
		}
		if st, err := os.Stat(v); err == nil && !st.IsDir() {
			detected[k] = v
		}
	}

	installedCores := []string{}
	if raExe := detected["retroarch"]; raExe != "" {
		coresDir := filepath.Join(filepath.Dir(raExe), "cores")
		if entries, err := os.ReadDir(coresDir); err == nil {
			for _, ent := range entries {
				if !ent.IsDir() && strings.HasSuffix(strings.ToLower(ent.Name()), ".dll") {
					installedCores = append(installedCores, ent.Name())
				}
			}
		}
	}

	return detected, installedCores
}

func promptSelectExeOrFile(title, filter string) (string, error) {
	fileBuf := make([]uint16, 1024)
	winFilter := strings.ReplaceAll(filter, "|", "\x00") + "\x00\x00"
	filterUTF16 := utf16.Encode([]rune(winFilter))
	ofn := OPENFILENAMEW{
		LStructSize:  uint32(unsafe.Sizeof(OPENFILENAMEW{})),
		LpstrFilter:  &filterUTF16[0],
		NFilterIndex: 1,
		LpstrFile:    &fileBuf[0],
		NMaxFile:     uint32(len(fileBuf)),
		LpstrTitle:   utf16Ptr(title),
		Flags:        OFN_FILEMUSTEXIST | OFN_PATHMUSTEXIST | OFN_NOCHANGEDIR | OFN_EXPLORER,
	}
	ret, _, _ := procGetOpenFileNameW.Call(uintptr(unsafe.Pointer(&ofn)))
	if ret == 0 {
		return "", nil
	}
	return strings.TrimSpace(syscall.UTF16ToString(fileBuf)), nil
}

// Starts the hybrid React 19 + Tailwind CSS UI server and opens a standalone frameless desktop window.
func runHybridModernDesktopApp() bool {
	// Verify embedded index.html exists
	indexBytes, err := embeddedWebDist.ReadFile("webdist/index.html")
	if err != nil || len(indexBytes) == 0 {
		return false
	}

	appDir := getAegisAppDataDir()
	shutdownCh := make(chan struct{}, 1)
	var lastHeartbeatUnix int64 = time.Now().Unix()
	touch := func() { atomic.StoreInt64(&lastHeartbeatUnix, time.Now().Unix()) }
	webAssets, err := fs.Sub(embeddedWebDist, "webdist")
	if err != nil {
		return false
	}

	// If an older instance is still listening on 127.0.0.1:38470, tell it to shut down so we serve the newest build
	// The running instance only accepts the request with its session token, which it saved to appDir.
	client := &http.Client{Timeout: 300 * time.Millisecond}
	if shutdownReq, err := http.NewRequest(http.MethodPost, "http://127.0.0.1:38470/api/native/shutdown", nil); err == nil {
		if prevToken := aegisapi.ReadTokenFile(appDir); prevToken != "" {
			shutdownReq.Header.Set(aegisapi.TokenHeader, prevToken)
		}
		if resp, err := client.Do(shutdownReq); err == nil {
			_ = resp.Body.Close()
			time.Sleep(150 * time.Millisecond)
		}
	}

	// Per-launch session token protecting the local API (see local_api_guard.go).
	apiToken, err := aegisapi.NewToken()
	if err != nil {
		return false
	}

	mux := http.NewServeMux()

	// 1. Native Desktop Host Status
	mux.HandleFunc("/api/native/status", func(w http.ResponseWriter, r *http.Request) {
		atomic.StoreInt64(&lastHeartbeatUnix, time.Now().Unix())
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"nativeDesktop": true,
			"version":       AEGIS_APP_VERSION,
			"architecture":  "Hybrid Go + React 19 + Tailwind CSS v0.5 Beta WebView",
			"appDir":        appDir,
		})
	})

	// 2. Heartbeat & Shutdown endpoints
	mux.HandleFunc("/api/native/heartbeat", func(w http.ResponseWriter, r *http.Request) {
		atomic.StoreInt64(&lastHeartbeatUnix, time.Now().Unix())
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		_, _ = w.Write([]byte(`{"ok":true}`))
	})

	// Разовый перенос настроек из профиля Edge (см. native_window.go).
	// One-time settings move out of the Edge profile (see native_window.go).
	storageMigratedCh := make(chan struct{})
	var storageMigratedOnce sync.Once
	mux.HandleFunc("/api/native/storage-migrated", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_, _ = w.Write([]byte(`{"ok":true}`))
		storageMigratedOnce.Do(func() { close(storageMigratedCh) })
	})

	mux.HandleFunc("/api/native/shutdown", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_, _ = w.Write([]byte(`{"ok":true}`))
		select {
		case shutdownCh <- struct{}{}:
		default:
		}
	})

	// 3. Native Windows Installer (Program Files default, Folder Picker, Version Check, Uninstall)
	mux.HandleFunc("/api/native/installer/status", func(w http.ResponseWriter, r *http.Request) {
		atomic.StoreInt64(&lastHeartbeatUnix, time.Now().Unix())
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		info := getInstalledAppInfo()
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"ok":                true,
			"isInstalled":       info.IsInstalled,
			"installedDir":      info.InstalledDir,
			"installedVersion":  info.InstalledVersion,
			"currentVersion":    info.CurrentVersion,
			"defaultInstallDir": info.DefaultDir,
			"isUpToDate":        info.IsUpToDate,
			"canUpgrade":        info.CanUpgrade,
			"installations":     info.Installations,
		})
	})

	mux.HandleFunc("/api/native/installer/pick-folder", func(w http.ResponseWriter, r *http.Request) {
		atomic.StoreInt64(&lastHeartbeatUnix, time.Now().Unix())
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		var body struct {
			InitialDir string `json:"initialDir"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		chosen, err := promptSelectFolderDialog("Выберите папку установки AegisROM", body.InitialDir)
		if chosen != "" && !strings.EqualFold(filepath.Base(chosen), "AegisROM") {
			chosen = filepath.Join(chosen, "AegisROM")
		}
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"ok":    err == nil && chosen != "",
			"path":  chosen,
			"error": "",
		})
	})

	mux.HandleFunc("/api/native/installer/uninstall", func(w http.ResponseWriter, r *http.Request) {
		atomic.StoreInt64(&lastHeartbeatUnix, time.Now().Unix())
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		var body struct {
			InstallDir string `json:"installDir"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		err := uninstallFromDirectory(body.InstallDir)
		errMsg := ""
		if err != nil {
			errMsg = err.Error()
		}
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"ok":    err == nil,
			"error": errMsg,
		})
	})

	mux.HandleFunc("/api/native/install-desktop", func(w http.ResponseWriter, r *http.Request) {
		atomic.StoreInt64(&lastHeartbeatUnix, time.Now().Unix())
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		var body struct {
			InstallDir string `json:"installDir"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		targetDir := strings.TrimSpace(body.InstallDir)
		if targetDir == "" {
			targetDir = defaultProgramFilesInstallDir()
		}
		exePath, err := installToCustomDirectory(targetDir)
		errMsg := ""
		if err != nil {
			errMsg = err.Error()
		}
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"ok":          err == nil,
			"installPath": targetDir,
			"exePath":     exePath,
			"version":     AEGIS_APP_VERSION,
			"error":       errMsg,
		})
	})

	// 3a. Native Filesystem Folder Picker & Zero-Prompt Local Media Hydration for Opened DB Files
	mux.HandleFunc("/api/native/fs/pick-dir", func(w http.ResponseWriter, r *http.Request) {
		atomic.StoreInt64(&lastHeartbeatUnix, time.Now().Unix())
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		var body struct {
			Title      string `json:"title"`
			InitialDir string `json:"initialDir"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		title := body.Title
		if title == "" {
			title = "Выберите папку библиотеки AegisROM"
		}
		chosen, err := promptSelectFolderDialog(title, body.InitialDir)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"ok":   err == nil && chosen != "",
			"path": chosen,
		})
	})

	mux.HandleFunc("/api/native/fs/resolve-media", func(w http.ResponseWriter, r *http.Request) {
		atomic.StoreInt64(&lastHeartbeatUnix, time.Now().Unix())
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		var req struct {
			LibraryPath string `json:"libraryPath"`
			Items       []struct {
				ID           string `json:"id"`
				Title        string `json:"title"`
				CleanFile    string `json:"cleanFile"`
				OldFile      string `json:"oldFile"`
				RelativePath string `json:"relativePath"`
			} `json:"items"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"ok": false, "results": []interface{}{}})
			return
		}
		rootDir := strings.TrimSpace(req.LibraryPath)
		imageIndex := map[string]string{}
		videoIndex := map[string]string{}
		if rootDir != "" {
			if st, err := os.Stat(rootDir); err == nil && st.IsDir() {
				depth := 0
				baseSep := strings.Count(filepath.Clean(rootDir), string(filepath.Separator))
				_ = filepath.WalkDir(rootDir, func(p string, d os.DirEntry, walkErr error) error {
					if walkErr != nil {
						return nil
					}
					depth = strings.Count(filepath.Clean(p), string(filepath.Separator)) - baseSep
					if d.IsDir() && depth > 4 {
						return filepath.SkipDir
					}
					if d.IsDir() {
						return nil
					}
					ext := strings.ToLower(filepath.Ext(d.Name()))
					base := strings.TrimSuffix(strings.ToLower(d.Name()), ext)
					for _, suf := range []string{"-image", "-thumb", "-boxart", "-snap", "-marquee", "-banner", "-video"} {
						base = strings.TrimSuffix(base, suf)
					}
					if ext == ".png" || ext == ".jpg" || ext == ".jpeg" || ext == ".webp" {
						if _, ok := imageIndex[base]; !ok {
							imageIndex[base] = p
						}
					} else if ext == ".mp4" || ext == ".webm" {
						if _, ok := videoIndex[base]; !ok {
							videoIndex[base] = p
						}
					}
					return nil
				})
			}
		}

		results := make([]map[string]string, 0, len(req.Items))
		for _, it := range req.Items {
			keys := []string{}
			for _, cand := range []string{it.CleanFile, it.OldFile, it.Title} {
				if cand == "" {
					continue
				}
				base := strings.TrimSuffix(strings.ToLower(filepath.Base(cand)), strings.ToLower(filepath.Ext(cand)))
				keys = append(keys, base)
			}
			imgHit := ""
			vidHit := ""
			for _, k := range keys {
				if p, ok := imageIndex[k]; ok && imgHit == "" {
					imgHit = "/api/native/fs/media?path=" + url.QueryEscape(p)
				}
				if p, ok := videoIndex[k]; ok && vidHit == "" {
					vidHit = "/api/native/fs/media?path=" + url.QueryEscape(p)
				}
			}
			results = append(results, map[string]string{
				"id":        it.ID,
				"boxArtUrl": imgHit,
				"videoUrl":  vidHit,
			})
		}
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "results": results})
	})

	mux.HandleFunc("/api/native/fs/media", func(w http.ResponseWriter, r *http.Request) {
		atomic.StoreInt64(&lastHeartbeatUnix, time.Now().Unix())
		filePath := r.URL.Query().Get("path")
		ext := strings.ToLower(filepath.Ext(filePath))
		if filePath == "" || (ext != ".png" && ext != ".jpg" && ext != ".jpeg" && ext != ".webp" && ext != ".mp4" && ext != ".webm") {
			http.Error(w, "Invalid media path", http.StatusBadRequest)
			return
		}
		http.ServeFile(w, r, filePath)
	})

	// Быстрый тест: файл рома для встроенного WASM-эмулятора (aegisapi/quicktest.go).
	aegisapi.RegisterQuickTestRoutes(mux, touch)
	// Сохранения встроенного запуска рядом с ромом (aegisapi/saves.go).
	aegisapi.RegisterSaveRoutes(mux, touch)

	// 3b. Native Disc Converter Status & chdman.exe Execution (Multi-track BIN+CUE / ISO <-> CHD)
	mux.HandleFunc("/api/native/converter/status", func(w http.ResponseWriter, r *http.Request) {
		atomic.StoreInt64(&lastHeartbeatUnix, time.Now().Unix())
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		chdmanPath := findChdmanExecutable()
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"ok":              true,
			"chdmanAvailable": chdmanPath != "",
			"chdmanPath":      chdmanPath,
			"toolsDir":        getAegisToolsDir(),
		})
	})

	mux.HandleFunc("/api/native/converter/select-chdman", func(w http.ResponseWriter, r *http.Request) {
		atomic.StoreInt64(&lastHeartbeatUnix, time.Now().Unix())
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		chosen, err := promptSelectChdmanExecutable()
		chdmanPath := findChdmanExecutable()
		errMsg := ""
		if err != nil {
			errMsg = err.Error()
		}
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"ok":              err == nil && chosen != "",
			"chdmanAvailable": chdmanPath != "",
			"chdmanPath":      chdmanPath,
			"error":           errMsg,
		})
	})

	mux.HandleFunc("/api/native/converter/chd", func(w http.ResponseWriter, r *http.Request) {
		atomic.StoreInt64(&lastHeartbeatUnix, time.Now().Unix())
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		chdmanExe := findChdmanExecutable()
		if chdmanExe == "" {
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			w.WriteHeader(http.StatusPreconditionFailed)
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"ok":    false,
				"error": "chdman.exe не найден. Укажите путь к chdman.exe (из пакета MAME / RetroArch) в разделе «Сборки и Конвертер».",
			})
			return
		}

		if err := r.ParseMultipartForm(64 << 20); err != nil {
			http.Error(w, "Ошибка разбора входных файлов: "+err.Error(), http.StatusBadRequest)
			return
		}
		defer func() {
			if r.MultipartForm != nil {
				_ = r.MultipartForm.RemoveAll()
			}
		}()

		targetExt := strings.ToLower(strings.TrimSpace(r.FormValue("targetExt")))
		baseName := strings.TrimSpace(r.FormValue("baseName"))
		if baseName == "" {
			baseName = "Converted_Game"
		}

		tmpDir, err := os.MkdirTemp("", "aegisrom_chd_*")
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer os.RemoveAll(tmpDir)

		saveFormFile := func(src io.Reader, filename string) (string, error) {
			safeBase := filepath.Base(strings.ReplaceAll(filename, `\`, `/`))
			dstPath := filepath.Join(tmpDir, safeBase)
			// Большие файлы из окна с файлами через Go приходят ссылкой на путь (aegisapi.VFSUploadMarker).
			// Large files from the Go-files window arrive as a path reference (aegisapi.VFSUploadMarker).
			head := make([]byte, 8193)
			n, _ := io.ReadFull(src, head)
			if handled, err := aegisapi.MaterializeVFSUpload(head[:n], dstPath); handled {
				return dstPath, err
			}
			src = io.MultiReader(bytes.NewReader(head[:n]), src)
			outF, err := os.Create(dstPath)
			if err != nil {
				return "", err
			}
			_, copyErr := io.Copy(outF, src)
			closeErr := outF.Close()
			if copyErr != nil {
				return "", copyErr
			}
			return dstPath, closeErr
		}

		entryFH, entryHeader, err := r.FormFile("entryFile")
		if err != nil {
			http.Error(w, "Не передан entryFile: "+err.Error(), http.StatusBadRequest)
			return
		}
		entryPath, err := saveFormFile(entryFH, entryHeader.Filename)
		_ = entryFH.Close()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		if r.MultipartForm != nil && r.MultipartForm.File["companionFiles"] != nil {
			for _, cfHdr := range r.MultipartForm.File["companionFiles"] {
				cf, err := cfHdr.Open()
				if err != nil {
					continue
				}
				_, _ = saveFormFile(cf, cfHdr.Filename)
				_ = cf.Close()
			}
		}

		if targetExt == ".chd" {
			chdInputPath := entryPath
			lowEntry := strings.ToLower(entryPath)
			// Alcohol .mds+.mdf or standalone .mdf/.img: normalize to .cue + .bin first so chdman.exe always succeeds!
			if strings.HasSuffix(lowEntry, ".mds") || strings.HasSuffix(lowEntry, ".mdf") || strings.HasSuffix(lowEntry, ".img") {
				rawPayload := entryPath
				if strings.HasSuffix(lowEntry, ".mds") {
					// Locate the .mdf file uploaded in tmpDir
					if entries, rErr := os.ReadDir(tmpDir); rErr == nil {
						for _, ent := range entries {
							if strings.HasSuffix(strings.ToLower(ent.Name()), ".mdf") {
								rawPayload = filepath.Join(tmpDir, ent.Name())
								break
							}
						}
					}
				}
				if strings.HasSuffix(lowEntry, ".mds") || strings.HasSuffix(lowEntry, ".mdf") || strings.HasSuffix(lowEntry, ".img") {
					normCue := filepath.Join(tmpDir, baseName+"_norm.cue")
					normBin := filepath.Join(tmpDir, baseName+"_norm.bin")
					if nErr := aegiscore.NormalizeDiscImageToCueAndBin(rawPayload, normCue, normBin); nErr == nil {
						chdInputPath = normCue
					}
				}
			}

			outChd := filepath.Join(tmpDir, baseName+".chd")
			cmd := exec.Command(chdmanExe, "createcd", "-f", "-i", chdInputPath, "-o", outChd)
			cmd.Dir = tmpDir
			cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
			cmdOut, runErr := cmd.CombinedOutput()
			if runErr != nil {
				http.Error(w, "chdman createcd error: "+runErr.Error()+"\n"+string(cmdOut), http.StatusInternalServerError)
				return
			}
			outF, err := os.Open(outChd)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			defer outF.Close()
			w.Header().Set("Content-Type", "application/octet-stream")
			w.Header().Set("X-Output-Mode", "single")
			w.Header().Set("X-Output-Filename", url.PathEscape(baseName+".chd"))
			_, _ = io.Copy(w, outF)
			return
		}

		if targetExt == ".iso" {
			tmpCue := filepath.Join(tmpDir, baseName+"_tmp.cue")
			tmpBin := filepath.Join(tmpDir, baseName+"_tmp.bin")
			outIso := filepath.Join(tmpDir, baseName+".iso")

			cmd := exec.Command(chdmanExe, "extractcd", "-f", "-i", entryPath, "-o", tmpCue, "-ob", tmpBin)
			cmd.Dir = tmpDir
			cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
			cmdOut, runErr := cmd.CombinedOutput()
			if runErr != nil {
				http.Error(w, "chdman extractcd error: "+runErr.Error()+"\n"+string(cmdOut), http.StatusInternalServerError)
				return
			}
			if err := aegiscore.StripBin2352ToISO(tmpBin, outIso); err != nil {
				http.Error(w, "strip bin->iso error: "+err.Error(), http.StatusInternalServerError)
				return
			}
			outF, err := os.Open(outIso)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			defer outF.Close()
			w.Header().Set("Content-Type", "application/octet-stream")
			w.Header().Set("X-Output-Mode", "single")
			w.Header().Set("X-Output-Filename", url.PathEscape(baseName+".iso"))
			_, _ = io.Copy(w, outF)
			return
		}

		if targetExt == ".bin+.cue" {
			outCue := filepath.Join(tmpDir, baseName+".cue")
			outBin := filepath.Join(tmpDir, baseName+".bin")
			cmd := exec.Command(chdmanExe, "extractcd", "-f", "-i", entryPath, "-o", outCue, "-ob", outBin)
			cmd.Dir = tmpDir
			cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
			cmdOut, runErr := cmd.CombinedOutput()
			if runErr != nil {
				http.Error(w, "chdman extractcd error: "+runErr.Error()+"\n"+string(cmdOut), http.StatusInternalServerError)
				return
			}

			w.Header().Set("Content-Type", "application/zip")
			w.Header().Set("X-Output-Mode", "zip-store")
			zw := zip.NewWriter(w)
			for _, fName := range []string{baseName + ".cue", baseName + ".bin"} {
				fullP := filepath.Join(tmpDir, fName)
				if st, err := os.Stat(fullP); err == nil && !st.IsDir() {
					hdr, _ := zip.FileInfoHeader(st)
					hdr.Name = fName
					hdr.Method = zip.Store
					entryW, err := zw.CreateHeader(hdr)
					if err == nil {
						if rf, err := os.Open(fullP); err == nil {
							_, _ = io.Copy(entryW, rf)
							_ = rf.Close()
						}
					}
				}
			}
			_ = zw.Close()
			return
		}

		http.Error(w, "Неподдерживаемый целевой формат для chdman: "+targetExt, http.StatusBadRequest)
	})

	// 3c. Native PC Emulator Detection, Exe Browser, Config Sync & Real Game Launcher ("4. Среда")
	mux.HandleFunc("/api/native/emulators/status", func(w http.ResponseWriter, r *http.Request) {
		atomic.StoreInt64(&lastHeartbeatUnix, time.Now().Unix())
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		cfg := loadEmulatorConfig(appDir)
		detected, cores := detectInstalledEmulators(cfg.CustomPaths)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"ok":               true,
			"detectedPaths":    detected,
			"customPaths":      cfg.CustomPaths,
			"installedCores":   cores,
			"starredByConsole": cfg.StarredByConsole,
		})
	})

	mux.HandleFunc("/api/native/emulators/browse", func(w http.ResponseWriter, r *http.Request) {
		atomic.StoreInt64(&lastHeartbeatUnix, time.Now().Unix())
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		var req struct {
			EmulatorID   string `json:"emulatorId"`
			EmulatorName string `json:"emulatorName"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		chosen, err := promptSelectExeOrFile(
			"Укажите EXE эмулятора: "+req.EmulatorName,
			"Исполняемые файлы (*.exe)|*.exe|Все файлы (*.*)|*.*",
		)
		if err != nil || chosen == "" {
			errMsg := ""
			if err != nil {
				errMsg = err.Error()
			}
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"ok":    false,
				"error": errMsg,
			})
			return
		}
		cfg := loadEmulatorConfig(appDir)
		if req.EmulatorID != "" {
			cfg.CustomPaths[req.EmulatorID] = chosen
			_ = saveEmulatorConfig(appDir, cfg)
		}
		detected, cores := detectInstalledEmulators(cfg.CustomPaths)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"ok":             true,
			"emulatorId":     req.EmulatorID,
			"exePath":        chosen,
			"detectedPaths":  detected,
			"customPaths":    cfg.CustomPaths,
			"installedCores": cores,
		})
	})

	mux.HandleFunc("/api/native/emulators/save-config", func(w http.ResponseWriter, r *http.Request) {
		atomic.StoreInt64(&lastHeartbeatUnix, time.Now().Unix())
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		var req EmulatorConfigFile
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if req.CustomPaths == nil {
			req.CustomPaths = map[string]string{}
		}
		if req.StarredByConsole == nil {
			req.StarredByConsole = map[string]string{}
		}
		_ = saveEmulatorConfig(appDir, req)
		detected, cores := detectInstalledEmulators(req.CustomPaths)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"ok":               true,
			"detectedPaths":    detected,
			"customPaths":      req.CustomPaths,
			"installedCores":   cores,
			"starredByConsole": req.StarredByConsole,
		})
	})

	mux.HandleFunc("/api/native/emulators/launch", func(w http.ResponseWriter, r *http.Request) {
		atomic.StoreInt64(&lastHeartbeatUnix, time.Now().Unix())
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		var req struct {
			ConsoleCode  string `json:"consoleCode"`
			EmulatorID   string `json:"emulatorId"`
			ExePath      string `json:"exePath"`
			CoreFile     string `json:"coreFile"`
			RomFileName  string `json:"romFileName"`
			RelativePath string `json:"relativePath"`
			LibraryPath  string `json:"libraryPath"`
			SdCardPath   string `json:"sdCardPath"`
			IsRetroArch  bool   `json:"isRetroArch"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		cfg := loadEmulatorConfig(appDir)
		detected, _ := detectInstalledEmulators(cfg.CustomPaths)

		resolvedExe := req.ExePath
		if resolvedExe == "" || func() bool { st, e := os.Stat(resolvedExe); return e != nil || st.IsDir() }() {
			if req.EmulatorID != "" && detected[req.EmulatorID] != "" {
				resolvedExe = detected[req.EmulatorID]
			} else if req.IsRetroArch && detected["retroarch"] != "" {
				resolvedExe = detected["retroarch"]
			}
		}
		if resolvedExe == "" || func() bool { st, e := os.Stat(resolvedExe); return e != nil || st.IsDir() }() {
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"ok":    false,
				"error": "EXE эмулятора не найден на этом ПК. Укажите путь к эмулятору во вкладке «4. Среда».",
			})
			return
		}

		// Try to locate the real ROM file on local filesystem
		candidates := aegisapi.RomPathCandidates(req.ConsoleCode, req.RomFileName, req.RelativePath, req.LibraryPath, req.SdCardPath)
		resolvedRom := firstExistingFile(candidates)
		if resolvedRom == "" {
			// Prompt user once to pick the ROM file on disk if it wasn't resolved automatically
			pickedRom, _ := promptSelectExeOrFile(
				"Укажите файл игры для запуска: "+req.RomFileName,
				"Образы игр и ROM (*.chd;*.cue;*.iso;*.img;*.bin;*.nes;*.sfc;*.smc;*.md;*.gba;*.z64;*.zip)|*.chd;*.cue;*.iso;*.img;*.bin;*.nes;*.sfc;*.smc;*.md;*.gba;*.z64;*.zip|Все файлы (*.*)|*.*",
			)
			resolvedRom = pickedRom
		}
		if resolvedRom == "" {
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"ok":    false,
				"error": "Файл игры не выбран или не найден на диске для прямого запуска.",
			})
			return
		}

		var args []string
		exeLow := strings.ToLower(filepath.Base(resolvedExe))
		if req.IsRetroArch || strings.Contains(exeLow, "retroarch") {
			corePath := req.CoreFile
			if corePath != "" && !filepath.IsAbs(corePath) {
				corePath = filepath.Join(filepath.Dir(resolvedExe), "cores", req.CoreFile)
			}
			if corePath != "" {
				if st, err := os.Stat(corePath); err == nil && !st.IsDir() {
					args = append(args, "-L", corePath)
				}
			}
			args = append(args, resolvedRom)
		} else if strings.Contains(exeLow, "duckstation") {
			args = []string{"-batch", "-fullscreen", "--", resolvedRom}
		} else if strings.Contains(exeLow, "pcsx2") {
			args = []string{"-fullscreen", "-batch", "--", resolvedRom}
		} else if strings.Contains(exeLow, "dolphin") {
			args = []string{"-b", "-e", resolvedRom}
		} else if strings.Contains(exeLow, "rpcs3") {
			args = []string{"--no-gui", resolvedRom}
		} else if strings.Contains(exeLow, "xemu") {
			args = []string{"-full-screen", "-dvd_path", resolvedRom}
		} else if strings.Contains(exeLow, "mgba") || strings.Contains(exeLow, "ryujinx") {
			args = []string{"-f", resolvedRom}
		} else {
			args = []string{resolvedRom}
		}

		cmd := exec.Command(resolvedExe, args...)
		cmd.Dir = filepath.Dir(resolvedExe)
		if err := cmd.Start(); err != nil {
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"ok":    false,
				"error": "Не удалось запустить процесс: " + err.Error(),
			})
			return
		}
		go func() { _ = cmd.Wait() }()

		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"ok":          true,
			"pid":         cmd.Process.Pid,
			"exePath":     resolvedExe,
			"romPath":     resolvedRom,
			"commandLine": fmt.Sprintf("\"%s\" %s", resolvedExe, strings.Join(args, " ")),
		})
	})

	// 4–5. Библиотека, сборки, PortMaster и скрапер: общие для всех оболочек (aegisapi).
	aegisapi.RegisterLibraryRoutes(mux, appDir, touch)
	aegisapi.RegisterStorageRoutes(mux, appDir, touch)
	aegisapi.RegisterVFSRoutes(mux, appDir, touch, aegisapi.VFSOptions{
		PickFolder:   func(title string) (string, error) { return promptSelectFolderDialog(title, "") },
		PreferNative: useNativeWindow(appDir),
	})

	// 6. Serve Embedded React 19 + Tailwind CSS SPA directly from memory with explicit anti-cache MIME headers
	mux.Handle("/", aegisapi.SPAHandler(webAssets, indexBytes, touch))

	// Bind local port (try 38470 first, or any free port if busy)
	ln, err := net.Listen("tcp", "127.0.0.1:38470")
	if err != nil {
		ln, err = net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			return false
		}
	}
	appURL := fmt.Sprintf("http://%s/?v=%s", ln.Addr().String(), AEGIS_APP_VERSION)

	_, listenPort, err := net.SplitHostPort(ln.Addr().String())
	if err != nil {
		_ = ln.Close()
		return false
	}
	aegisapi.WriteTokenFile(appDir, apiToken)

	srv := &http.Server{Handler: aegisapi.NewGuard(mux, apiToken, listenPort)}
	go func() {
		_ = srv.Serve(ln)
	}()

	// Wait until our HTTP server is 100% live and responding 200 OK before opening the window!
	readyClient := &http.Client{Timeout: 200 * time.Millisecond}
	for i := 0; i < 40; i++ {
		readyReq, reqErr := http.NewRequest(http.MethodGet, fmt.Sprintf("http://%s/api/native/status", ln.Addr().String()), nil)
		if reqErr != nil {
			break
		}
		readyReq.Header.Set(aegisapi.TokenHeader, apiToken)
		if resp, err := readyClient.Do(readyReq); err == nil {
			_ = resp.Body.Close()
			if resp.StatusCode == 200 {
				break
			}
		}
		time.Sleep(25 * time.Millisecond)
	}

	// Нативное окно Wails, если включено; при ошибке ниже откроется Edge.
	// Native Wails window when enabled; on error Edge opens below.
	if useNativeWindow(appDir) {
		if needsLegacyStorageMigration(appDir) {
			migrateLegacyBrowserStorage(appDir, appURL, storageMigratedCh)
		}
		if err := runNativeWindow(mux, appDir); err == nil {
			_ = srv.Close()
			return true
		}
	}

	// Open standalone frameless desktop application window (--app=...)
	launchedWindow := false
	browserExe := findAppBrowserExecutable()
	if browserExe != "" {
		profileDir := filepath.Join(appDir, appBrowserProfileDirName)
		_ = os.MkdirAll(profileDir, 0755)
		prepareAppBrowserProfile(profileDir)

		cmd := exec.Command(browserExe, appBrowserArgs(appURL, profileDir)...)
		if err := cmd.Start(); err == nil {
			launchedWindow = true
			go func() {
				_ = cmd.Wait()
			}()
		}
	}

	if !launchedWindow {
		procShellExecuteW.Call(
			0,
			uintptr(unsafe.Pointer(utf16Ptr("open"))),
			uintptr(unsafe.Pointer(utf16Ptr(appURL))),
			0,
			0,
			SW_SHOWNORMAL,
		)
	}

	// Keep the local server alive while the user works in the app window.
	// Automatically shuts down if /api/native/shutdown is called (e.g. by a newer launch)
	// or after 2 hours of complete inactivity.
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-shutdownCh:
			_ = ln.Close()
			return true
		case <-ticker.C:
			idleSec := time.Now().Unix() - atomic.LoadInt64(&lastHeartbeatUnix)
			if idleSec > 7200 {
				_ = ln.Close()
				return true
			}
		}
	}
}
