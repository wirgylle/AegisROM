//go:build windows
// +build windows

package winsetup

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"
)

type InstallOptions struct {
	TargetDir        string
	CleanupOldCopies bool
	CreateShortcuts  bool
	LaunchAfter      bool
}

// MigrateUserConfigs preserves saved ROM DB, Saved Builds, Emulator Configs, and chdman tools into %APPDATA%\AegisROM
// before cleaning up any old installation folders under AppData\Local.
func MigrateUserConfigs(extraDirs []string) {
	dstDir := UserDataAppDir()
	localApp := GetKnownFolderPath(CSIDL_LOCAL_APPDATA)
	searchDirs := []string{}
	if localApp != "" {
		searchDirs = append(searchDirs,
			filepath.Join(localApp, "Programs", "AegisROM"),
			filepath.Join(localApp, "AegisROM"),
		)
	}
	searchDirs = append(searchDirs, extraDirs...)

	dataFiles := []string{
		"aegisrom-v5-db.json",
		"aegisrom-v5-builds.json",
		"emulators_config.json",
		"portmaster-info-cache.json",
	}

	copyIfMissing := func(src, dst string) {
		if _, err := os.Stat(dst); err == nil {
			return
		}
		if data, err := os.ReadFile(src); err == nil && len(data) > 0 {
			_ = os.WriteFile(dst, data, 0644)
		}
	}

	for _, sd := range searchDirs {
		if sd == "" || strings.EqualFold(filepath.Clean(sd), filepath.Clean(dstDir)) {
			continue
		}
		for _, fn := range dataFiles {
			src := filepath.Join(sd, fn)
			if _, err := os.Stat(src); err == nil {
				copyIfMissing(src, filepath.Join(dstDir, fn))
			}
		}
		oldTools := filepath.Join(sd, "tools")
		if st, err := os.Stat(oldTools); err == nil && st.IsDir() {
			newTools := filepath.Join(dstDir, "tools")
			_ = os.MkdirAll(newTools, 0755)
			if ents, err := os.ReadDir(oldTools); err == nil {
				for _, e := range ents {
					if !e.IsDir() {
						copyIfMissing(filepath.Join(oldTools, e.Name()), filepath.Join(newTools, e.Name()))
					}
				}
			}
		}
	}
}

func CleanupAllShortcuts() {
	for _, folder := range AllShortcutSearchFolders() {
		entries, err := os.ReadDir(folder)
		if err != nil {
			continue
		}
		for _, ent := range entries {
			if !ent.IsDir() && strings.HasSuffix(strings.ToLower(ent.Name()), ".lnk") && strings.Contains(strings.ToLower(ent.Name()), "aegis") {
				_ = os.Remove(filepath.Join(folder, ent.Name()))
			}
		}
		// Remove legacy subfolder if empty
		if strings.EqualFold(filepath.Base(folder), "AegisROM") {
			_ = os.Remove(folder)
		}
	}
}

func ClearStaleWebViewCaches(extraDirs []string) {
	dirs := append([]string{UserDataAppDir()}, extraDirs...)
	if localApp := GetKnownFolderPath(CSIDL_LOCAL_APPDATA); localApp != "" {
		dirs = append(dirs,
			filepath.Join(localApp, "Programs", "AegisROM"),
			filepath.Join(localApp, "AegisROM"),
		)
	}
	for _, d := range dirs {
		if d == "" {
			continue
		}
		entries, err := os.ReadDir(d)
		if err != nil {
			continue
		}
		for _, ent := range entries {
			if ent.IsDir() && strings.HasPrefix(strings.ToLower(ent.Name()), "webviewprofile") {
				_ = os.RemoveAll(filepath.Join(d, ent.Name()))
			}
		}
	}
}

func RemoveOldInstallDirectory(dir string, keepDir string) {
	cleanDir := filepath.Clean(dir)
	if strings.EqualFold(cleanDir, filepath.Clean(keepDir)) {
		return
	}
	// Never wipe %APPDATA%\AegisROM user config directory itself unless explicitly uninstalling
	if strings.EqualFold(cleanDir, filepath.Clean(UserDataAppDir())) {
		for _, binName := range []string{"AegisROM.exe", "AegisROM-Portable-Win11-x64.exe", "Uninstall-AegisROM.ps1", "version.txt"} {
			_ = os.Remove(filepath.Join(cleanDir, binName))
		}
		return
	}
	// If inside AppData\Local\Programs\AegisROM or AppData\Local\AegisROM or any other install dir, remove executables/scripts/caches & folder if empty
	for _, f := range []string{
		"AegisROM.exe",
		"AegisROM-Portable-Win11-x64.exe",
		"AegisROM-Setup-v0.5.2-Win11-x64.exe",
		"AegisROM-Setup-v0.5.3-Win11-x64.exe",
		"AegisROM-Setup-v0.5.4-Win11-x64.exe",
		"AegisROM-Setup-v0.5.5-Win11-x64.exe",
		"AegisROM-Setup-v"+AppVersion+"-Win11-x64.exe",
		"Uninstall-AegisROM.ps1",
		"Install-AegisROM.cmd",
		"AegisROM_Setup_GUI.ps1",
		"aegisrom.ico",
		"version.txt",
		"aegisrom-v5-db.json",
		"aegisrom-v5-builds.json",
		"emulators_config.json",
		"portmaster-info-cache.json",
	} {
		_ = os.Remove(filepath.Join(cleanDir, f))
	}
	_ = os.RemoveAll(filepath.Join(cleanDir, "tools"))
	if ents, err := os.ReadDir(cleanDir); err == nil {
		for _, e := range ents {
			if e.IsDir() && strings.HasPrefix(strings.ToLower(e.Name()), "webview") {
				_ = os.RemoveAll(filepath.Join(cleanDir, e.Name()))
			}
		}
	}
	_ = os.Remove(cleanDir) // Succeeds if clean/empty
}

func needsAdminRights(targetDir string, oldDirs []string) bool {
	if IsRunningAsAdmin() {
		return false
	}
	checkDir := func(d string) bool {
		if d == "" {
			return false
		}
		_ = os.MkdirAll(d, 0755)
		probe := filepath.Join(d, fmt.Sprintf(".aegis_perm_test_%d", os.Getpid()))
		if err := os.WriteFile(probe, []byte("1"), 0644); err != nil {
			return true
		}
		_ = os.Remove(probe)
		return false
	}
	if checkDir(targetDir) {
		return true
	}
	for _, od := range oldDirs {
		low := strings.ToLower(od)
		if strings.Contains(low, `\program files`) {
			return true
		}
	}
	return false
}

// PerformInstall executes the pure-Win32 installation directly (no .bat, no .ps1).
func PerformInstall(opts InstallOptions, writeExePayload func(destExe string) error, iconBytes []byte) (string, error) {
	targetDir := strings.TrimSpace(opts.TargetDir)
	if targetDir == "" {
		targetDir = DefaultProgramFilesDir()
	}
	targetDir = filepath.Clean(targetDir)

	KillOtherAegisRomProcesses()
	discovery := DiscoverAllInstallations()

	var oldDirs []string
	for _, inst := range discovery.Installations {
		oldDirs = append(oldDirs, inst.Dir)
	}
	MigrateUserConfigs(oldDirs)
	ClearStaleWebViewCaches(oldDirs)

	if err := os.MkdirAll(targetDir, 0755); err != nil {
		return "", fmt.Errorf("не удалось создать папку %s: %w", targetDir, err)
	}

	destExe := filepath.Join(targetDir, "AegisROM.exe")
	selfExe, _ := os.Executable()
	if !strings.EqualFold(filepath.Clean(selfExe), filepath.Clean(destExe)) {
		if err := writeExePayload(destExe); err != nil {
			return "", fmt.Errorf("не удалось записать %s: %w", destExe, err)
		}
	}
	st, err := os.Stat(destExe)
	if err != nil || st.Size() < 100000 {
		return "", fmt.Errorf("проверка файла %s не пройдена после записи", destExe)
	}

	if len(iconBytes) > 0 {
		_ = os.WriteFile(filepath.Join(targetDir, "aegisrom.ico"), iconBytes, 0644)
	}
	_ = os.WriteFile(filepath.Join(targetDir, "version.txt"), []byte(AppVersion), 0644)

	if opts.CleanupOldCopies {
		for _, od := range oldDirs {
			RemoveOldInstallDirectory(od, targetDir)
		}
	}

	CleanupAllShortcuts()
	if opts.CreateShortcuts {
		iconLoc := destExe
		if _, err := os.Stat(filepath.Join(targetDir, "aegisrom.ico")); err == nil {
			iconLoc = filepath.Join(targetDir, "aegisrom.ico")
		}
		desk := GetKnownFolderPath(CSIDL_DESKTOPDIRECTORY)
		progs := GetKnownFolderPath(CSIDL_PROGRAMS)
		for _, dir := range []string{desk, progs} {
			if dir != "" {
				_ = CreateWindowsShortcut(
					filepath.Join(dir, "AegisROM.lnk"),
					destExe,
					"--no-prompt",
					targetDir,
					iconLoc,
					"AegisROM v"+AppVersion+" (Beta) — Менеджер библиотек ромов, R36S и PortMaster",
				)
			}
		}
	}

	// Clean stale registry entries in all hives, then write unified entry
	const regSub = `Software\Microsoft\Windows\CurrentVersion\Uninstall\AegisROM`
	DeleteRegTree(HKEY_CURRENT_USER, regSub)
	if IsRunningAsAdmin() {
		DeleteRegTree(HKEY_LOCAL_MACHINE, regSub)
	}

	regRoot := HKEY_CURRENT_USER
	if IsRunningAsAdmin() {
		regRoot = HKEY_LOCAL_MACHINE
	}
	_ = WriteRegString(regRoot, regSub, "DisplayName", "AegisROM v"+AppVersion+" (Beta)")
	_ = WriteRegString(regRoot, regSub, "DisplayVersion", AppVersion)
	_ = WriteRegString(regRoot, regSub, "Publisher", "AegisROM Project")
	_ = WriteRegString(regRoot, regSub, "InstallLocation", targetDir)
	_ = WriteRegString(regRoot, regSub, "DisplayIcon", destExe)
	_ = WriteRegString(regRoot, regSub, "UninstallString", fmt.Sprintf(`"%s" --uninstall`, destExe))
	_ = WriteRegDWord(regRoot, regSub, "NoModify", 1)
	_ = WriteRegDWord(regRoot, regSub, "NoRepair", 1)

	return destExe, nil
}

func PerformUninstallAll() error {
	KillOtherAegisRomProcesses()
	discovery := DiscoverAllInstallations()

	CleanupAllShortcuts()
	const regSub = `Software\Microsoft\Windows\CurrentVersion\Uninstall\AegisROM`
	DeleteRegTree(HKEY_CURRENT_USER, regSub)
	DeleteRegTree(HKEY_LOCAL_MACHINE, regSub)

	selfExe, _ := os.Executable()
	selfDir := strings.ToLower(filepath.Clean(filepath.Dir(selfExe)))

	for _, inst := range discovery.Installations {
		if strings.EqualFold(filepath.Clean(inst.Dir), selfDir) {
			// Running from the uninstalled exe itself: delete asynchronously after process exits
			cmd := exec.Command("cmd.exe", "/c", fmt.Sprintf(`ping 127.0.0.1 -n 3 >nul & rmdir /s /q "%s"`, inst.Dir))
			cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
			_ = cmd.Start()
			continue
		}
		RemoveOldInstallDirectory(inst.Dir, "")
		_ = os.RemoveAll(inst.Dir)
	}
	return nil
}

// Pure Win32 Native Setup Window (Zero PowerShell, Zero .bat/.cmd)

const (
	wsOverlappedWindow = 0x00CF0000
	wsVisible          = 0x10000000
	wsChild            = 0x40000000
	wsTabStop          = 0x00010000
	wsBorder           = 0x00800000
	wsVScroll          = 0x00200000
	wsExClientEdge     = 0x00000200
	esAutoHScroll      = 0x0080
	esMultiline        = 0x0004
	esReadOnly         = 0x0800
	bsPushButton       = 0x00000000
	bsDefPushButton    = 0x00000001
	bsAutoCheckBox     = 0x00000003
	bmGetCheck         = 0x00F0
	bmSetCheck         = 0x00F1
	bstChecked         = 0x0001
	wmCreate           = 0x0001
	wmDestroy          = 0x0002
	wmCommand          = 0x0111
	wmSetFont          = 0x0030
	wmSetIcon          = 0x0080
	wmCtlColorStatic   = 0x0138
	wmCtlColorEdit     = 0x0133
	wmClose            = 0x0010
	pbmSetRange32      = 0x0406
	pbmSetPos          = 0x0402

	idEditDir       = 1001
	idBtnBrowse     = 1002
	idChkCleanup    = 1003
	idChkShortcuts  = 1004
	idChkLaunch     = 1005
	idBtnInstall    = 1006
	idBtnUninstall  = 1007
	idBtnCancel     = 1008
	idProgress      = 1009
	idEditReport    = 1010
	idLblStatus     = 1011
)

type wndClassExW struct {
	CbSize        uint32
	Style         uint32
	LpfnWndProc   uintptr
	CbClsExtra    int32
	CbWndExtra    int32
	HInstance     uintptr
	HIcon         uintptr
	HCursor       uintptr
	HbrBackground uintptr
	LpszMenuName  *uint16
	LpszClassName *uint16
	HIconSm       uintptr
}

type winMsg struct {
	HWnd    uintptr
	Message uint32
	WParam  uintptr
	LParam  uintptr
	Time    uint32
	Pt      struct{ X, Y int32 }
}

type initCommonControlsEx struct {
	DwSize uint32
	DwICC  uint32
}

type SetupResult struct {
	Installed      bool
	Uninstalled    bool
	LaunchAfter    bool
	InstalledExe   string
}

func ShowNativeSetupWindow(writeExePayload func(destExe string) error, iconBytes []byte) SetupResult {
	var res SetupResult
	report := DiscoverAllInstallations()

	icc := initCommonControlsEx{
		DwSize: uint32(unsafe.Sizeof(initCommonControlsEx{})),
		DwICC:  0x00000020 | 0x00004000, // ICC_PROGRESS_CLASS | ICC_STANDARD_CLASSES
	}
	procInitCommonControlsEx.Call(uintptr(unsafe.Pointer(&icc)))

	hInst, _, _ := procGetModuleHandleW.Call(0)
	hCursor, _, _ := procLoadCursorW.Call(0, 32512)
	hAppIcon, _, _ := procLoadIconW.Call(hInst, 1)
	hBgBrush, _, _ := procCreateSolidBrush.Call(0x00F8F5F3)
	hWhiteBrush, _, _ := procCreateSolidBrush.Call(0x00FFFFFF)

	hFontTitle, _, _ := procCreateFontW.Call(uintptr(^uint32(20 - 1)), 0, 0, 0, 700, 0, 0, 0, 1, 0, 0, 5, 0, uintptr(unsafe.Pointer(UTF16Ptr("Segoe UI"))))
	hFontBold, _, _ := procCreateFontW.Call(uintptr(^uint32(15 - 1)), 0, 0, 0, 600, 0, 0, 0, 1, 0, 0, 5, 0, uintptr(unsafe.Pointer(UTF16Ptr("Segoe UI"))))
	hFontUI, _, _ := procCreateFontW.Call(uintptr(^uint32(15 - 1)), 0, 0, 0, 400, 0, 0, 0, 1, 0, 0, 5, 0, uintptr(unsafe.Pointer(UTF16Ptr("Segoe UI"))))
	hFontMono, _, _ := procCreateFontW.Call(uintptr(^uint32(13 - 1)), 0, 0, 0, 400, 0, 0, 0, 1, 0, 0, 5, 0, uintptr(unsafe.Pointer(UTF16Ptr("Consolas"))))

	defer func() {
		for _, obj := range []uintptr{hBgBrush, hWhiteBrush, hFontTitle, hFontBold, hFontUI, hFontMono} {
			if obj != 0 {
				procDeleteObject.Call(obj)
			}
		}
	}()

	var (
		hWnd         uintptr
		hEditDir     uintptr
		hChkCleanup  uintptr
		hChkShortcut uintptr
		hChkLaunch   uintptr
		hBtnInstall  uintptr
		hBtnUninst   uintptr
		hProgress    uintptr
		hLblStatus   uintptr
		hEditReport  uintptr
	)

	getCtrlText := func(h uintptr) string {
		n, _, _ := procGetWindowTextLengthW.Call(h)
		buf := make([]uint16, n+2)
		procGetWindowTextW.Call(h, uintptr(unsafe.Pointer(&buf[0])), n+1)
		return strings.TrimSpace(syscall.UTF16ToString(buf))
	}
	isChecked := func(h uintptr) bool {
		r, _, _ := procSendMessageW.Call(h, bmGetCheck, 0, 0)
		return r == bstChecked
	}

	refreshUI := func() {
		report = DiscoverAllInstallations()
		var statusStr string
		var reportBox string
		if !report.HasAny {
			statusStr = "Готово к чистой установке AegisROM v" + AppVersion + " (Beta)"
			reportBox = "Других копий AegisROM на компьютере не обнаружено.\r\nБудет выполнена установка в выбранную папку."
		} else if report.HasUpToDate && !report.HasOldCopies && len(report.Installations) == 1 {
			statusStr = "✔ Установлена актуальная версия v" + AppVersion + " (Beta)"
			reportBox = strings.Join(report.SummaryLines, "\r\n")
		} else {
			statusStr = fmt.Sprintf("🔄 Найдено копий на ПК: %d — требуется обновление / очистка до v%s", len(report.Installations), AppVersion)
			reportBox = strings.Join(report.SummaryLines, "\r\n")
		}
		procSetWindowTextW.Call(hLblStatus, uintptr(unsafe.Pointer(UTF16Ptr(statusStr))))
		procSetWindowTextW.Call(hEditReport, uintptr(unsafe.Pointer(UTF16Ptr(reportBox))))
		procSetWindowTextW.Call(hEditDir, uintptr(unsafe.Pointer(UTF16Ptr(report.PrimaryDir))))
		if report.HasAny {
			procEnableWindow.Call(hBtnUninst, 1)
			if report.HasOldCopies {
				procSetWindowTextW.Call(hBtnInstall, uintptr(unsafe.Pointer(UTF16Ptr("Обновить до v"+AppVersion+" Beta"))))
			} else {
				procSetWindowTextW.Call(hBtnInstall, uintptr(unsafe.Pointer(UTF16Ptr("Переустановить"))))
			}
		} else {
			procEnableWindow.Call(hBtnUninst, 0)
			procSetWindowTextW.Call(hBtnInstall, uintptr(unsafe.Pointer(UTF16Ptr("Установить v"+AppVersion+" Beta"))))
		}
	}

	wndProc := func(hwnd uintptr, msg uint32, wParam, lParam uintptr) uintptr {
		switch msg {
		case wmCtlColorStatic:
			procSetBkMode.Call(wParam, 1)
			if lParam == hEditReport {
				procSetBkColor.Call(wParam, 0x00FFFFFF)
				return hWhiteBrush
			}
			if lParam == hLblStatus {
				procSetTextColor.Call(wParam, 0x00B04010)
			} else {
				procSetTextColor.Call(wParam, 0x002A2018)
			}
			return hBgBrush
		case wmCtlColorEdit:
			procSetBkMode.Call(wParam, 2)
			procSetBkColor.Call(wParam, 0x00FFFFFF)
			procSetTextColor.Call(wParam, 0x001E293B)
			return hWhiteBrush
		case wmCommand:
			cid := uint16(wParam & 0xFFFF)
			switch cid {
			case idBtnBrowse:
				chosen := BrowseForFolder(hwnd, "Выберите папку для установки AegisROM v"+AppVersion)
				if chosen != "" {
					if !strings.EqualFold(filepath.Base(chosen), "AegisROM") {
						chosen = filepath.Join(chosen, "AegisROM")
					}
					procSetWindowTextW.Call(hEditDir, uintptr(unsafe.Pointer(UTF16Ptr(chosen))))
				}
			case idBtnInstall:
				targetDir := getCtrlText(hEditDir)
				if targetDir == "" {
					targetDir = DefaultProgramFilesDir()
				}
				opts := InstallOptions{
					TargetDir:        targetDir,
					CleanupOldCopies: isChecked(hChkCleanup),
					CreateShortcuts:  isChecked(hChkShortcut),
					LaunchAfter:      isChecked(hChkLaunch),
				}
				var oldDirs []string
				for _, inst := range report.Installations {
					oldDirs = append(oldDirs, inst.Dir)
				}
				procSendMessageW.Call(hProgress, pbmSetPos, 25, 0)
				procSetWindowTextW.Call(hLblStatus, uintptr(unsafe.Pointer(UTF16Ptr("⏳ Остановка старых копий и установка файлов..."))))

				var destExe string
				var err error
				if needsAdminRights(opts.TargetDir, oldDirs) {
					selfExe, _ := os.Executable()
					args := fmt.Sprintf(`--elevated-install --target "%s" --cleanup=%v --shortcuts=%v`,
						opts.TargetDir, opts.CleanupOldCopies, opts.CreateShortcuts)
					code, elevErr := RunElevatedAndWait(selfExe, args, filepath.Dir(selfExe))
					if elevErr != nil {
						err = elevErr
					} else if code != 0 {
						err = fmt.Errorf("установка с правами администратора завершилась с кодом %d", code)
					} else {
						destExe = filepath.Join(opts.TargetDir, "AegisROM.exe")
						if st, stErr := os.Stat(destExe); stErr != nil || st.Size() < 100000 {
							err = fmt.Errorf("файл %s не найден после установки", destExe)
						}
					}
				} else {
					destExe, err = PerformInstall(opts, writeExePayload, iconBytes)
				}

				if err != nil {
					procSendMessageW.Call(hProgress, pbmSetPos, 0, 0)
					procSetWindowTextW.Call(hLblStatus, uintptr(unsafe.Pointer(UTF16Ptr("❌ Ошибка установки"))))
					MessageBox(hwnd, "Не удалось завершить установку:\n\n"+err.Error(), "Ошибка установки AegisROM", MB_OK|MB_ICONERROR)
					return 0
				}

				procSendMessageW.Call(hProgress, pbmSetPos, 100, 0)
				res.Installed = true
				res.InstalledExe = destExe
				res.LaunchAfter = opts.LaunchAfter
				MessageBox(hwnd,
					fmt.Sprintf("✔ AegisROM v%s (Beta) успешно установлен!\n\nПапка: %s\nСтарые копии из AppData/других папок очищены: %v",
						AppVersion, opts.TargetDir, map[bool]string{true: "Да", false: "Нет"}[opts.CleanupOldCopies]),
					"Установка завершена", MB_OK|MB_ICONINFORMATION)
				procDestroyWindow.Call(hwnd)
			case idBtnUninstall:
				ans := MessageBox(hwnd,
					"Удалить все найденные копии AegisROM, ярлыки и записи реестра с компьютера?\n(Ваши ромы и сохранённые базы игр останутся нетронутыми.)",
					"Удаление AegisROM", MB_YESNO|MB_ICONQUESTION)
				if ans != IDYES {
					return 0
				}
				var oldDirs []string
				for _, inst := range report.Installations {
					oldDirs = append(oldDirs, inst.Dir)
				}
				var err error
				if needsAdminRights(DefaultProgramFilesDir(), oldDirs) {
					selfExe, _ := os.Executable()
					code, elevErr := RunElevatedAndWait(selfExe, "--elevated-uninstall", filepath.Dir(selfExe))
					if elevErr != nil {
						err = elevErr
					} else if code != 0 {
						err = fmt.Errorf("удаление завершилось с кодом %d", code)
					}
				} else {
					err = PerformUninstallAll()
				}
				if err != nil {
					MessageBox(hwnd, "Ошибка удаления:\n"+err.Error(), "Удаление AegisROM", MB_OK|MB_ICONERROR)
					return 0
				}
				res.Uninstalled = true
				MessageBox(hwnd, "🗑 Все копии AegisROM успешно удалены с компьютера.", "Удаление завершено", MB_OK|MB_ICONINFORMATION)
				refreshUI()
			case idBtnCancel:
				procDestroyWindow.Call(hwnd)
			}
		case wmClose:
			procDestroyWindow.Call(hwnd)
		case wmDestroy:
			procPostQuitMessage.Call(0)
		default:
			r, _, _ := procDefWindowProcW.Call(hwnd, uintptr(msg), wParam, lParam)
			return r
		}
		return 0
	}

	className := UTF16Ptr("AegisROMNativeSetupWindowClass")
	wc := wndClassExW{
		CbSize:        uint32(unsafe.Sizeof(wndClassExW{})),
		LpfnWndProc:   syscall.NewCallback(wndProc),
		HInstance:     hInst,
		HIcon:         hAppIcon,
		HCursor:       hCursor,
		HbrBackground: hBgBrush,
		LpszClassName: className,
		HIconSm:       hAppIcon,
	}
	procRegisterClassExW.Call(uintptr(unsafe.Pointer(&wc)))

	winW, winH := int32(640), int32(475)
	scrW, _, _ := procGetSystemMetrics.Call(0)
	scrH, _, _ := procGetSystemMetrics.Call(1)
	posX := (int32(scrW) - winW) / 2
	posY := (int32(scrH) - winH) / 2
	if posX < 0 {
		posX = 40
	}
	if posY < 0 {
		posY = 40
	}

	// Fixed-size non-resizable dialog window
	style := uintptr(wsOverlappedWindow &^ 0x00040000 &^ 0x00010000) // no WS_THICKFRAME, no WS_MAXIMIZEBOX
	hWnd, _, _ = procCreateWindowExW.Call(
		0,
		uintptr(unsafe.Pointer(className)),
		uintptr(unsafe.Pointer(UTF16Ptr("Мастер установки AegisROM v"+AppVersion+" (Beta)"))),
		style|wsVisible,
		uintptr(posX), uintptr(posY), uintptr(winW), uintptr(winH),
		0, 0, hInst, 0,
	)

	if hAppIcon != 0 {
		procSendMessageW.Call(hWnd, wmSetIcon, 1, hAppIcon)
		procSendMessageW.Call(hWnd, wmSetIcon, 0, hAppIcon)
	}
	// Windows 11 light immersive attribute (safe no-op on Win10)
	darkFalse := uint32(0)
	procDwmSetWindowAttribute.Call(hWnd, 20, uintptr(unsafe.Pointer(&darkFalse)), 4)

	mk := func(cls, text string, st uintptr, ex uintptr, x, y, w, h, id int32, font uintptr) uintptr {
		ctl, _, _ := procCreateWindowExW.Call(
			ex, uintptr(unsafe.Pointer(UTF16Ptr(cls))), uintptr(unsafe.Pointer(UTF16Ptr(text))),
			wsChild|wsVisible|st,
			uintptr(x), uintptr(y), uintptr(w), uintptr(h),
			hWnd, uintptr(id), hInst, 0,
		)
		procSendMessageW.Call(ctl, wmSetFont, font, 1)
		return ctl
	}

	mk("STATIC", "AegisROM v"+AppVersion+" (Beta) — Установщик для Windows 10/11", 0, 0, 20, 16, 585, 26, 0, hFontTitle)
	hLblStatus = mk("STATIC", "Сканирование установленных копий...", 0, 0, 20, 48, 585, 22, idLblStatus, hFontBold)
	mk("STATIC", "Обнаруженные установки (Program Files, AppData\\Local, реестр и ярлыки):", 0, 0, 20, 76, 585, 20, 0, hFontUI)
	hEditReport = mk("EDIT", "", esMultiline|esReadOnly|wsVScroll|wsBorder, wsExClientEdge, 20, 98, 585, 86, idEditReport, hFontMono)

	mk("STATIC", "Папка установки:", 0, 0, 20, 194, 460, 20, 0, hFontUI)
	hEditDir = mk("EDIT", report.PrimaryDir, esAutoHScroll|wsTabStop|wsBorder, wsExClientEdge, 20, 218, 475, 28, idEditDir, hFontUI)
	mk("BUTTON", "Обзор...", bsPushButton|wsTabStop, 0, 505, 217, 100, 30, idBtnBrowse, hFontUI)

	hChkCleanup = mk("BUTTON", "Удалить старые копии из AppData\\Local / других папок и очистить кэш", bsAutoCheckBox|wsTabStop, 0, 20, 258, 585, 24, idChkCleanup, hFontUI)
	hChkShortcut = mk("BUTTON", "Создать ярлыки «AegisROM» на Рабочем столе и в меню «Пуск»", bsAutoCheckBox|wsTabStop, 0, 20, 284, 585, 24, idChkShortcuts, hFontUI)
	hChkLaunch = mk("BUTTON", "Запустить AegisROM v"+AppVersion+" (Beta) после завершения установки", bsAutoCheckBox|wsTabStop, 0, 20, 310, 585, 24, idChkLaunch, hFontUI)

	procSendMessageW.Call(hChkCleanup, bmSetCheck, bstChecked, 0)
	procSendMessageW.Call(hChkShortcut, bmSetCheck, bstChecked, 0)
	procSendMessageW.Call(hChkLaunch, bmSetCheck, bstChecked, 0)

	hProgress = mk("msctls_progress32", "", 0, 0, 20, 344, 585, 18, idProgress, hFontUI)
	procSendMessageW.Call(hProgress, pbmSetRange32, 0, 100)

	hBtnInstall = mk("BUTTON", "Установить v"+AppVersion+" Beta", bsDefPushButton|wsTabStop, 0, 20, 376, 235, 42, idBtnInstall, hFontBold)
	hBtnUninst = mk("BUTTON", "Удалить все копии", bsPushButton|wsTabStop, 0, 265, 376, 190, 42, idBtnUninstall, hFontUI)
	mk("BUTTON", "Закрыть", bsPushButton|wsTabStop, 0, 465, 376, 140, 42, idBtnCancel, hFontUI)

	refreshUI()
	procShowWindow.Call(hWnd, SW_SHOWNORMAL)
	procUpdateWindow.Call(hWnd)
	procSetForegroundWindow.Call(hWnd)

	var msg winMsg
	for {
		ret, _, _ := procGetMessageW.Call(uintptr(unsafe.Pointer(&msg)), 0, 0, 0)
		if int32(ret) <= 0 {
			break
		}
		procTranslateMessage.Call(uintptr(unsafe.Pointer(&msg)))
		procDispatchMessageW.Call(uintptr(unsafe.Pointer(&msg)))
	}

	if res.Installed && res.LaunchAfter && res.InstalledExe != "" {
		cmd := exec.Command(res.InstalledExe, "--no-prompt")
		cmd.Dir = filepath.Dir(res.InstalledExe)
		_ = cmd.Start()
	}
	return res
}

// Helper for elevated CLI workers (--elevated-install ...)
func CopyFileContents(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	_, err = io.Copy(out, in)
	closeErr := out.Close()
	if err != nil {
		return err
	}
	return closeErr
}
