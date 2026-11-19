//go:build windows
// +build windows

package main

import (
	"aegisgui/aegiscore"
	"aegisgui/cmd/winsetup"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
	"unicode/utf16"
	"unsafe"
)

// Win32 DLLs and Procedures
var (
	user32   = syscall.NewLazyDLL("user32.dll")
	kernel32 = syscall.NewLazyDLL("kernel32.dll")
	gdi32    = syscall.NewLazyDLL("gdi32.dll")
	comctl32 = syscall.NewLazyDLL("comctl32.dll")
	shell32  = syscall.NewLazyDLL("shell32.dll")
	ole32    = syscall.NewLazyDLL("ole32.dll")
	dwmapi   = syscall.NewLazyDLL("dwmapi.dll")
	uxtheme  = syscall.NewLazyDLL("uxtheme.dll")
	comdlg32 = syscall.NewLazyDLL("comdlg32.dll")

	procRegisterClassExW     = user32.NewProc("RegisterClassExW")
	procCreateWindowExW      = user32.NewProc("CreateWindowExW")
	procDestroyWindow        = user32.NewProc("DestroyWindow")
	procDefWindowProcW       = user32.NewProc("DefWindowProcW")
	procShowWindow           = user32.NewProc("ShowWindow")
	procUpdateWindow         = user32.NewProc("UpdateWindow")
	procGetMessageW          = user32.NewProc("GetMessageW")
	procTranslateMessage     = user32.NewProc("TranslateMessage")
	procDispatchMessageW     = user32.NewProc("DispatchMessageW")
	procPostQuitMessage      = user32.NewProc("PostQuitMessage")
	procSendMessageW         = user32.NewProc("SendMessageW")
	procPostMessageW         = user32.NewProc("PostMessageW")
	procSetWindowTextW       = user32.NewProc("SetWindowTextW")
	procGetWindowTextW       = user32.NewProc("GetWindowTextW")
	procGetWindowTextLengthW = user32.NewProc("GetWindowTextLengthW")
	procEnableWindow         = user32.NewProc("EnableWindow")
	procMessageBoxW          = user32.NewProc("MessageBoxW")
	procLoadCursorW          = user32.NewProc("LoadCursorW")
	procLoadIconW            = user32.NewProc("LoadIconW")
	procGetClientRect        = user32.NewProc("GetClientRect")
	procMoveWindow           = user32.NewProc("MoveWindow")
	procInvalidateRect       = user32.NewProc("InvalidateRect")

	procGetModuleHandleW = kernel32.NewProc("GetModuleHandleW")

	procCreateFontW      = gdi32.NewProc("CreateFontW")
	procCreateSolidBrush = gdi32.NewProc("CreateSolidBrush")
	procSetTextColor     = gdi32.NewProc("SetTextColor")
	procSetBkColor       = gdi32.NewProc("SetBkColor")
	procSetBkMode        = gdi32.NewProc("SetBkMode")

	procInitCommonControlsEx = comctl32.NewProc("InitCommonControlsEx")

	procSHBrowseForFolderW   = shell32.NewProc("SHBrowseForFolderW")
	procSHGetPathFromIDListW = shell32.NewProc("SHGetPathFromIDListW")
	procShellExecuteW        = shell32.NewProc("ShellExecuteW")

	procCoInitializeEx = ole32.NewProc("CoInitializeEx")
	procCoTaskMemFree  = ole32.NewProc("CoTaskMemFree")

	procDwmSetWindowAttribute = dwmapi.NewProc("DwmSetWindowAttribute")
	procSetWindowTheme        = uxtheme.NewProc("SetWindowTheme")
	procGetOpenFileNameW      = comdlg32.NewProc("GetOpenFileNameW")
)

// Win32 Constants
const (
	WS_OVERLAPPEDWINDOW = 0x00CF0000
	WS_POPUP            = 0x80000000
	WS_POPUPWINDOW      = 0x80880000
	WS_CAPTION          = 0x00C00000
	WS_SYSMENU          = 0x00080000
	WS_VISIBLE          = 0x10000000
	WS_CHILD            = 0x40000000
	WS_VSCROLL          = 0x00200000
	WS_TABSTOP          = 0x00010000
	WS_BORDER           = 0x00800000
	WS_EX_CLIENTEDGE    = 0x00000200
	WS_EX_DLGMODALFRAME = 0x00000001
	WS_EX_TOPMOST       = 0x00000008

	ES_AUTOHSCROLL = 0x0080
	ES_AUTOVSCROLL = 0x0040
	ES_MULTILINE   = 0x0004
	ES_READONLY    = 0x0800

	BS_PUSHBUTTON    = 0x00000000
	BS_DEFPUSHBUTTON = 0x00000001
	BS_AUTOCHECKBOX  = 0x00000003

	CBS_DROPDOWNLIST   = 0x0003
	CB_ADDSTRING       = 0x0143
	CB_GETCURSEL       = 0x0147
	CB_SETCURSEL       = 0x014E
	CB_SETDROPPEDWIDTH = 0x0160

	BM_GETCHECK = 0x00F0
	BM_SETCHECK = 0x00F1
	BST_CHECKED = 0x0001

	WM_CREATE          = 0x0001
	WM_DESTROY         = 0x0002
	WM_CLOSE           = 0x0010
	WM_SIZE            = 0x0005
	WM_COMMAND         = 0x0111
	WM_SETFONT         = 0x0030
	WM_SETICON         = 0x0080
	WM_CTLCOLOREDIT    = 0x0133
	WM_CTLCOLORLISTBOX = 0x0134
	WM_CTLCOLORBTN     = 0x0135
	WM_CTLCOLORSTATIC  = 0x0138
	WM_USER            = 0x0400
	WM_APP             = 0x8000

	// Win32 Native Tooltip Constants (tooltips_class32)
	TTS_ALWAYSTIP      = 0x01
	TTS_NOPREFIX       = 0x02
	TTS_BALLOON        = 0x40
	TTF_IDISHWND       = 0x0001
	TTF_SUBCLASS       = 0x0010
	TTM_ACTIVATE       = WM_USER + 1
	TTM_SETDELAYTIME   = WM_USER + 3
	TTM_SETMAXTIPWIDTH = WM_USER + 24
	TTM_ADDTOOLW       = WM_USER + 50
	TTDT_AUTOPOP       = 2
	TTDT_INITIAL       = 3

	WM_APP_SCAN_DONE        = WM_APP + 1
	WM_APP_ORGANIZE_DONE    = WM_APP + 2
	WM_APP_SCRAPE_DONE      = WM_APP + 3
	WM_APP_PROGRESS         = WM_APP + 4
	WM_APP_CLEAN_MEDIA_DONE = WM_APP + 5
	WM_APP_RENAME_0001_DONE = WM_APP + 6
	WM_APP_REPAIR_SD_DONE   = WM_APP + 7

	SW_SHOWDEFAULT = 10
	SW_SHOWNORMAL  = 1
	IDC_ARROW      = 32512

	ICC_LISTVIEW_CLASSES = 0x00000001
	ICC_BAR_CLASSES      = 0x00000004
	ICC_TAB_CLASSES      = 0x00000008
	ICC_PROGRESS_CLASS   = 0x00000020
	ICC_WIN95_CLASSES    = 0x000000FF
	ICC_STANDARD_CLASSES = 0x00004000

	LVS_REPORT                   = 0x0001
	LVS_SHOWSELALWAYS            = 0x0008
	LVS_SINGLESEL                = 0x0004
	LVM_FIRST                    = 0x1000
	LVM_SETBKCOLOR               = LVM_FIRST + 1
	LVM_DELETEALLITEMS           = LVM_FIRST + 9
	LVM_GETITEMSTATE             = LVM_FIRST + 44
	LVM_SETITEMSTATE             = LVM_FIRST + 43
	LVM_SETTEXTCOLOR             = LVM_FIRST + 36
	LVM_SETTEXTBKCOLOR           = LVM_FIRST + 38
	LVM_SETEXTENDEDLISTVIEWSTYLE = LVM_FIRST + 54
	LVM_INSERTITEMW              = LVM_FIRST + 77
	LVM_SETITEMW                 = LVM_FIRST + 76
	LVM_INSERTCOLUMNW            = LVM_FIRST + 97

	LVS_EX_GRIDLINES     = 0x00000001
	LVS_EX_CHECKBOXES    = 0x00000004
	LVS_EX_FULLROWSELECT = 0x00000020
	LVS_EX_INFOTIP       = 0x00000400
	LVS_EX_LABELTIP      = 0x00004000
	LVS_EX_DOUBLEBUFFER  = 0x00010000

	LVCF_FMT            = 0x0001
	LVCF_WIDTH          = 0x0002
	LVCF_TEXT           = 0x0004
	LVCF_SUBITEM        = 0x0008
	LVCFMT_LEFT         = 0x0000
	LVIF_TEXT           = 0x0001
	LVIF_STATE          = 0x0008
	LVIS_STATEIMAGEMASK = 0xF000

	PBM_SETRANGE32 = 0x0406
	PBM_SETPOS     = 0x0402

	EM_SETSEL      = 0x00B1
	EM_SCROLLCARET = 0x00B7

	MB_OK              = 0x00000000
	MB_YESNO           = 0x00000004
	MB_ICONINFORMATION = 0x00000040
	MB_ICONWARNING     = 0x00000030
	MB_ICONERROR       = 0x00000010
	MB_ICONQUESTION    = 0x00000020
	IDYES              = 6

	BIF_RETURNONLYFSDIRS = 0x00000001
	BIF_NEWDIALOGSTYLE   = 0x00000040
	BIF_EDITBOX          = 0x00000010

	// Main Window Control IDs
	ID_EDIT_PATH        = 101
	ID_BTN_BROWSE       = 102
	ID_BTN_EXPLORER     = 103
	ID_CMB_MODE         = 104
	ID_CMB_PRIORITY     = 105
	ID_CHK_AUTO_SCRAPE  = 106
	ID_CHK_DEL_JUNK     = 107
	ID_BTN_SCAN         = 108
	ID_BTN_ORGANIZE     = 109
	ID_BTN_RENAME_0001  = 110
	ID_BTN_SCRAPE       = 111
	ID_BTN_CLEAN_MEDIA  = 112
	ID_BTN_PHANTOM_DIRS = 113
	ID_BTN_UNDO         = 114
	ID_LISTVIEW         = 115
	ID_PROGRESS         = 116
	ID_EDIT_LOG         = 117
	ID_LBL_STATS        = 118
	ID_CHK_SCRAPE_VID   = 119
	ID_BTN_REPAIR_SD    = 120
	ID_BTN_STOP         = 121
	ID_BTN_INSPECT_XML  = 122
	ID_BTN_TAB_LIB      = 123
	ID_BTN_TAB_TOOLS    = 124
	ID_BTN_TAB_BUILDS   = 125
	ID_BTN_TAB_ENV      = 126
	ID_CMB_VIEW_MODE    = 127
	ID_BTN_THEME_TOGGLE = 128

	// Phantom Folders Dialog Control IDs
	ID_PHANTOM_LV         = 201
	ID_PHANTOM_BTN_ALL    = 202
	ID_PHANTOM_BTN_NONE   = 203
	ID_PHANTOM_BTN_DELETE = 204
	ID_PHANTOM_BTN_CLOSE  = 205

	// XML Mappings Inspector Dialog Control IDs
	ID_XML_LV          = 301
	ID_XML_BTN_ALL     = 302
	ID_XML_BTN_NONE    = 303
	ID_XML_BTN_APPLY   = 304
	ID_XML_BTN_CLOSE   = 305
	ID_XML_BTN_BROWSE  = 306
	ID_XML_BTN_MATCHED = 307

	OFN_FILEMUSTEXIST = 0x00001000
	OFN_PATHMUSTEXIST = 0x00000800
	OFN_NOCHANGEDIR   = 0x00000008
	OFN_EXPLORER      = 0x00080000
)

// Win32 Colorrefs (0x00BBGGRR) for Clean Windows 11 Daylight / Fluent Light Theme
const (
	CLR_BG_MAIN      = 0x00F8F5F3 // #F3F5F8 Soft Windows 11 Daylight Gray-Blue
	CLR_BG_SURFACE   = 0x00FFFFFF // #FFFFFF Crisp White Surface
	CLR_BG_INPUT     = 0x00FFFFFF // #FFFFFF Crisp White Input
	CLR_TEXT_PRIMARY = 0x002A2018 // #18202A Deep Readable Slate
	CLR_TEXT_ACCENT  = 0x00D84E1D // #1D4ED8 Royal Blue Accent
)

type WNDCLASSEXW struct {
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

type MSG struct {
	HWnd    uintptr
	Message uint32
	WParam  uintptr
	LParam  uintptr
	Time    uint32
	Pt      struct{ X, Y int32 }
}

type RECT struct {
	Left, Top, Right, Bottom int32
}

type INITCOMMONCONTROLSEX struct {
	DwSize uint32
	DwICC  uint32
}

// Win64 TTTOOLINFOW structure (72 bytes V3 / 64 bytes V2 / 56 bytes V1 on amd64)
type TOOLINFOW struct {
	CbSize     uint32
	UFlags     uint32
	Hwnd       uintptr
	UId        uintptr
	Rect       RECT
	Hinst      uintptr
	LpszText   *uint16
	LParam     uintptr
	LpReserved uintptr
}

type LVCOLUMNW struct {
	Mask       uint32
	Fmt        int32
	Cx         int32
	PszText    *uint16
	CchTextMax int32
	ISubItem   int32
	IImage     int32
	IOrder     int32
}

type LVITEMW struct {
	Mask       uint32
	IItem      int32
	ISubItem   int32
	State      uint32
	StateMask  uint32
	PszText    *uint16
	CchTextMax int32
	IImage     int32
	LParam     uintptr
	IIndent    int32
	IGroupId   int32
	CColumns   uint32
	PuColumns  uintptr
}

type BROWSEINFOW struct {
	HwndOwner      uintptr
	PidlRoot       uintptr
	PszDisplayName *uint16
	LpszTitle      *uint16
	UlFlags        uint32
	Lpfn           uintptr
	LParam         uintptr
	IImage         int32
}

type OPENFILENAMEW struct {
	LStructSize       uint32
	HwndOwner         uintptr
	HInstance         uintptr
	LpstrFilter       *uint16
	LpstrCustomFilter *uint16
	NMaxCustFilter    uint32
	NFilterIndex      uint32
	LpstrFile         *uint16
	NMaxFile          uint32
	LpstrFileTitle    *uint16
	NMaxFileTitle     uint32
	LpstrInitialDir   *uint16
	LpstrTitle        *uint16
	Flags             uint32
	NFileOffset       uint16
	NFileExtension    uint16
	LpstrDefExt       *uint16
	LCustData         uintptr
	LpfnHook          uintptr
	LpTemplateName    *uint16
	PvReserved        uintptr
	DwReserved        uint32
	FlagsEx           uint32
}

type UndoEntry struct {
	FromPath string
	ToPath   string
}

// Global UI & App State
var (
	hMainWnd       uintptr
	hPhantomWnd    uintptr
	hPhantomLV     uintptr
	hXmlWnd        uintptr
	hXmlLV         uintptr
	hXmlInfoLbl    uintptr
	hAppIcon       uintptr
	hTooltip       uintptr
	tooltipStrings []*uint16

	hFontTitle uintptr
	hFontUI    uintptr
	hFontBold  uintptr
	hFontMono  uintptr

	hBrushBgMain  uintptr
	hBrushSurface uintptr
	hBrushInput   uintptr

	hLblTitle    uintptr
	hLblPath     uintptr
	hEditPath    uintptr
	hBtnBrowse   uintptr
	hBtnExplorer uintptr
	hBtnStop     uintptr

	hLblMode       uintptr
	hCmbMode       uintptr
	hLblPriority   uintptr
	hCmbPriority   uintptr
	hChkAutoScrape uintptr
	hChkScrapeVid  uintptr
	hChkDelJunk    uintptr

	hBtnScan        uintptr
	hBtnOrganize    uintptr
	hBtnRename0001  uintptr
	hBtnInspectXML  uintptr
	hBtnScrape      uintptr
	hBtnCleanMedia  uintptr
	hBtnPhantomDirs uintptr
	hBtnRepairSD    uintptr
	hBtnUndo        uintptr

	hBtnTabLib      uintptr
	hBtnTabTools    uintptr
	hBtnTabBuilds   uintptr
	hBtnTabEnv      uintptr
	hCmbViewMode    uintptr
	hBtnThemeToggle uintptr
	isDarkThemeWin  bool

	hProgress uintptr
	hLblStats uintptr
	hListView uintptr
	hEditLog  uintptr

	stateMu              sync.Mutex
	scannedRoms          []aegiscore.RomItem
	phantomFolders       []aegiscore.PhantomFolderItem
	xmlMappingCandidates []aegiscore.XmlMappingCandidate
	undoHistory          []UndoEntry
	isBusy               bool
	cancelRequested      int32
	logHistory           []string
)

func utf16Ptr(s string) *uint16 {
	p, err := syscall.UTF16PtrFromString(s)
	if err != nil {
		p, _ = syscall.UTF16PtrFromString("")
	}
	return p
}

func appendLog(line string) {
	stateMu.Lock()
	ts := time.Now().Format("15:04:05")
	logHistory = append(logHistory, fmt.Sprintf("[%s] %s", ts, line))
	if len(logHistory) > 400 {
		logHistory = logHistory[len(logHistory)-400:]
	}
	fullText := strings.Join(logHistory, "\r\n")
	stateMu.Unlock()

	if hEditLog != 0 {
		procSetWindowTextW.Call(hEditLog, uintptr(unsafe.Pointer(utf16Ptr(fullText))))
		length := len(fullText)
		procSendMessageW.Call(hEditLog, EM_SETSEL, uintptr(length), uintptr(length))
		procSendMessageW.Call(hEditLog, EM_SCROLLCARET, 0, 0)
	}
}

func getWindowText(hwnd uintptr) string {
	ret, _, _ := procGetWindowTextLengthW.Call(hwnd)
	length := int(ret) + 1
	buf := make([]uint16, length)
	procGetWindowTextW.Call(hwnd, uintptr(unsafe.Pointer(&buf[0])), uintptr(length))
	return syscall.UTF16ToString(buf)
}

func setFont(hwnd uintptr, font uintptr) {
	procSendMessageW.Call(hwnd, WM_SETFONT, font, 1)
}

func applyExplorerThemeControl(hwnd uintptr) {
	procSetWindowTheme.Call(hwnd, uintptr(unsafe.Pointer(utf16Ptr("Explorer"))), 0)
}

func applyWin11ModernWindowFrame(hwnd uintptr) {
	dark := int32(0) // Clean Windows 11 Light Frame
	procDwmSetWindowAttribute.Call(hwnd, 20, uintptr(unsafe.Pointer(&dark)), 4)
	round := int32(2) // DWMWCP_ROUND (Windows 11 rounded corners)
	procDwmSetWindowAttribute.Call(hwnd, 33, uintptr(unsafe.Pointer(&round)), 4)
}

// Create native Win32 Tooltip control (tooltips_class32) so hovering over any truncated combobox, button, checkbox, or label pops up full info
func initTooltipManager(hwndParent uintptr) {
	hInst, _, _ := procGetModuleHandleW.Call(0)
	hTooltip, _, _ = procCreateWindowExW.Call(
		WS_EX_TOPMOST,
		uintptr(unsafe.Pointer(utf16Ptr("tooltips_class32"))),
		0,
		WS_POPUP|TTS_ALWAYSTIP|TTS_NOPREFIX,
		0, 0, 0, 0,
		hwndParent, 0, hInst, 0,
	)
	if hTooltip != 0 {
		setFont(hTooltip, hFontUI)
		procSendMessageW.Call(hTooltip, TTM_ACTIVATE, 1, 0)
		procSendMessageW.Call(hTooltip, TTM_SETMAXTIPWIDTH, 0, 650)
		procSendMessageW.Call(hTooltip, TTM_SETDELAYTIME, TTDT_INITIAL, 180)
		procSendMessageW.Call(hTooltip, TTM_SETDELAYTIME, TTDT_AUTOPOP, 25000)
	}
}

func addControlTooltip(hwndParent, hCtrl uintptr, text string) {
	if hTooltip == 0 || hCtrl == 0 {
		return
	}
	ptr := utf16Ptr(text)
	tooltipStrings = append(tooltipStrings, ptr)

	ti := TOOLINFOW{
		CbSize:   uint32(unsafe.Sizeof(TOOLINFOW{})),
		UFlags:   TTF_IDISHWND | TTF_SUBCLASS,
		Hwnd:     hwndParent,
		UId:      hCtrl,
		LpszText: ptr,
	}
	// Try V3 (72 bytes), fallback to V2 (64 bytes) and V1 (56 bytes) for universal Windows 10/11 ComCtl32 support
	ret, _, _ := procSendMessageW.Call(hTooltip, TTM_ADDTOOLW, 0, uintptr(unsafe.Pointer(&ti)))
	if ret == 0 {
		ti.CbSize = 64
		ret, _, _ = procSendMessageW.Call(hTooltip, TTM_ADDTOOLW, 0, uintptr(unsafe.Pointer(&ti)))
	}
	if ret == 0 {
		ti.CbSize = 56
		procSendMessageW.Call(hTooltip, TTM_ADDTOOLW, 0, uintptr(unsafe.Pointer(&ti)))
	}
}

// Strip Windows Mark-of-the-Web (Zone.Identifier) on self so SmartScreen never warns on subsequent launches
func stripSelfZoneIdentifier() {
	exePath, err := os.Executable()
	if err == nil && exePath != "" {
		_ = os.Remove(exePath + ":Zone.Identifier")
	}
}

// buildXmlMappingCandidatesForFolder передаёт ядру снимок текущего списка ромов.
func buildXmlMappingCandidatesForFolder(folder string) []aegiscore.XmlMappingCandidate {
	stateMu.Lock()
	scanned := make([]aegiscore.RomItem, len(scannedRoms))
	copy(scanned, scannedRoms)
	stateMu.Unlock()
	return aegiscore.BuildXMLMappingCandidatesForFolder(folder, scanned)
}

func main() {
	runtime.LockOSThread()
	aegiscore.SetLogger(appendLog)
	stripSelfZoneIdentifier()
	procCoInitializeEx.Call(0, 0x2)

	useClassicWin32 := false
	explicitInstall := false
	explicitUninstall := false
	elevInstall := false
	elevUninstall := false
	elevTarget := defaultProgramFilesInstallDir()
	noPrompt := false
	args := os.Args[1:]
	for i := 0; i < len(args); i++ {
		arg := args[i]
		if strings.EqualFold(arg, "--install") || strings.EqualFold(arg, "/install") {
			explicitInstall = true
		} else if strings.EqualFold(arg, "--uninstall") || strings.EqualFold(arg, "/uninstall") {
			explicitUninstall = true
		} else if strings.EqualFold(arg, "--elevated-install") {
			elevInstall = true
		} else if strings.EqualFold(arg, "--elevated-uninstall") {
			elevUninstall = true
		} else if strings.EqualFold(arg, "--target") && i+1 < len(args) {
			elevTarget = args[i+1]
			i++
		} else if strings.EqualFold(arg, "--no-prompt") {
			noPrompt = true
		} else if strings.EqualFold(arg, "--classic-win32") {
			useClassicWin32 = true
		}
	}

	if elevUninstall {
		if err := winsetup.PerformUninstallAll(); err != nil {
			os.Exit(1)
		}
		os.Exit(0)
	}

	if elevInstall {
		opts := winsetup.InstallOptions{
			TargetDir:        elevTarget,
			CleanupOldCopies: true,
			CreateShortcuts:  true,
			LaunchAfter:      false,
		}
		if _, err := winsetup.PerformInstall(opts, copySelfExePayload, embeddedIconBytes()); err != nil {
			os.Exit(1)
		}
		os.Exit(0)
	}

	if explicitUninstall {
		ans, _, _ := procMessageBoxW.Call(0,
			uintptr(unsafe.Pointer(utf16Ptr("Удалить все установленные копии AegisROM, ярлыки и записи реестра с компьютера?\n(Ваши ромы и базы игр останутся нетронутыми.)"))),
			uintptr(unsafe.Pointer(utf16Ptr("Удаление AegisROM"))),
			MB_YESNO|MB_ICONQUESTION,
		)
		if ans == IDYES {
			_ = uninstallFromDirectory("")
			procMessageBoxW.Call(0, uintptr(unsafe.Pointer(utf16Ptr("🗑 Программа AegisROM успешно удалена с компьютера."))), uintptr(unsafe.Pointer(utf16Ptr("Удаление AegisROM"))), MB_OK|MB_ICONINFORMATION)
		}
		return
	}

	selfExePath, _ := os.Executable()
	isPortableExe := strings.Contains(strings.ToLower(filepath.Base(selfExePath)), "portable")
	if explicitInstall || (!noPrompt && !isPortableExe && !isRunningFromAnyInstalledDir()) {
		shouldLaunch, _ := runNativeGuiInstallerWizard()
		if !shouldLaunch {
			return
		}
	}

	// Terminate any stale older AegisROM.exe instances before binding local port
	winsetup.KillOtherAegisRomProcesses()

	// By default, launch the modern React 19 + Tailwind CSS Desktop App Window (1-to-1 identical to the AI Studio preview!)
	if !useClassicWin32 {
		if runHybridModernDesktopApp() {
			return
		}
	}

	icc := INITCOMMONCONTROLSEX{
		DwSize: uint32(unsafe.Sizeof(INITCOMMONCONTROLSEX{})),
		DwICC:  ICC_LISTVIEW_CLASSES | ICC_BAR_CLASSES | ICC_TAB_CLASSES | ICC_PROGRESS_CLASS | ICC_WIN95_CLASSES | ICC_STANDARD_CLASSES,
	}
	procInitCommonControlsEx.Call(uintptr(unsafe.Pointer(&icc)))

	hInst, _, _ := procGetModuleHandleW.Call(0)
	hCursor, _, _ := procLoadCursorW.Call(0, IDC_ARROW)
	// Load embedded RT_GROUP_ICON ID 1 from rsrc_windows_amd64.syso
	hAppIcon, _, _ = procLoadIconW.Call(hInst, uintptr(1))

	hBrushBgMain, _, _ = procCreateSolidBrush.Call(CLR_BG_MAIN)
	hBrushSurface, _, _ = procCreateSolidBrush.Call(CLR_BG_SURFACE)
	hBrushInput, _, _ = procCreateSolidBrush.Call(CLR_BG_INPUT)

	className := utf16Ptr("AegisROMNativeWin11DarkV4Class")
	wc := WNDCLASSEXW{
		CbSize:        uint32(unsafe.Sizeof(WNDCLASSEXW{})),
		LpfnWndProc:   syscall.NewCallback(wndProc),
		HInstance:     hInst,
		HIcon:         hAppIcon,
		HCursor:       hCursor,
		HbrBackground: hBrushBgMain,
		LpszClassName: className,
		HIconSm:       hAppIcon,
	}
	procRegisterClassExW.Call(uintptr(unsafe.Pointer(&wc)))

	// Register Phantom Folders Modal Dialog Window Class
	phantomClass := utf16Ptr("AegisROMPhantomModalClass")
	wcPhantom := WNDCLASSEXW{
		CbSize:        uint32(unsafe.Sizeof(WNDCLASSEXW{})),
		LpfnWndProc:   syscall.NewCallback(phantomWndProc),
		HInstance:     hInst,
		HIcon:         hAppIcon,
		HCursor:       hCursor,
		HbrBackground: hBrushBgMain,
		LpszClassName: phantomClass,
		HIconSm:       hAppIcon,
	}
	procRegisterClassExW.Call(uintptr(unsafe.Pointer(&wcPhantom)))

	// Register XML Mappings Inspector Modal Dialog Window Class
	xmlClass := utf16Ptr("AegisROMXmlModalClass")
	wcXml := WNDCLASSEXW{
		CbSize:        uint32(unsafe.Sizeof(WNDCLASSEXW{})),
		LpfnWndProc:   syscall.NewCallback(xmlWndProc),
		HInstance:     hInst,
		HIcon:         hAppIcon,
		HCursor:       hCursor,
		HbrBackground: hBrushBgMain,
		LpszClassName: xmlClass,
		HIconSm:       hAppIcon,
	}
	procRegisterClassExW.Call(uintptr(unsafe.Pointer(&wcXml)))

	title := utf16Ptr("AegisROM v"+AEGIS_APP_VERSION+" (Beta) — Инструменты (Переименование XML + Заголовки, Комбайн 1G1R, Скрапер и Ремонт флешки R36S)")
	hwnd, _, _ := procCreateWindowExW.Call(
		0,
		uintptr(unsafe.Pointer(className)),
		uintptr(unsafe.Pointer(title)),
		WS_OVERLAPPEDWINDOW|WS_VISIBLE,
		20, 15, 1460, 920,
		0, 0, hInst, 0,
	)
	hMainWnd = hwnd

	applyWin11ModernWindowFrame(hwnd)
	if hAppIcon != 0 {
		procSendMessageW.Call(hwnd, WM_SETICON, 1, hAppIcon)
		procSendMessageW.Call(hwnd, WM_SETICON, 0, hAppIcon)
	}

	procShowWindow.Call(hwnd, SW_SHOWDEFAULT)
	procUpdateWindow.Call(hwnd)

	var msg MSG
	for {
		ret, _, _ := procGetMessageW.Call(uintptr(unsafe.Pointer(&msg)), 0, 0, 0)
		if int32(ret) <= 0 {
			break
		}
		procTranslateMessage.Call(uintptr(unsafe.Pointer(&msg)))
		procDispatchMessageW.Call(uintptr(unsafe.Pointer(&msg)))
	}
}

func createControls(hwnd uintptr) {
	// Large, comfortable, eye-friendly typography (scaled automatically by Windows 11 GDI Scaling)
	h18 := -18
	h16 := -16
	h15 := -15
	hFontTitle, _, _ = procCreateFontW.Call(
		uintptr(h18), 0, 0, 0, 700, 0, 0, 0,
		1, 0, 0, 5, 0, uintptr(unsafe.Pointer(utf16Ptr("Segoe UI"))),
	)
	hFontUI, _, _ = procCreateFontW.Call(
		uintptr(h16), 0, 0, 0, 400, 0, 0, 0,
		1, 0, 0, 5, 0, uintptr(unsafe.Pointer(utf16Ptr("Segoe UI"))),
	)
	hFontBold, _, _ = procCreateFontW.Call(
		uintptr(h16), 0, 0, 0, 600, 0, 0, 0,
		1, 0, 0, 5, 0, uintptr(unsafe.Pointer(utf16Ptr("Segoe UI"))),
	)
	hFontMono, _, _ = procCreateFontW.Call(
		uintptr(h15), 0, 0, 0, 400, 0, 0, 0,
		1, 0, 0, 5, 0, uintptr(unsafe.Pointer(utf16Ptr("Consolas"))),
	)

	initTooltipManager(hwnd)

	defaultDir, err := os.Getwd()
	if err != nil || defaultDir == "" {
		defaultDir = `C:\`
	}

	const SS_NOTIFY = 0x0100

	// Top v5.0 Navigation Bar: 4 Tabs (1. Библиотека | 2. Инструменты | 3. Сборки | 4. Среда) + 3 View Modes (A/B/C) + Dark Theme Toggle
	hBtnTabLib, _, _ = procCreateWindowExW.Call(
		0, uintptr(unsafe.Pointer(utf16Ptr("BUTTON"))),
		uintptr(unsafe.Pointer(utf16Ptr("1. Библиотека"))),
		WS_CHILD|WS_VISIBLE|WS_TABSTOP|BS_PUSHBUTTON,
		20, 6, 165, 28, hwnd, ID_BTN_TAB_LIB, 0, 0,
	)
	setFont(hBtnTabLib, hFontBold)

	hBtnTabTools, _, _ = procCreateWindowExW.Call(
		0, uintptr(unsafe.Pointer(utf16Ptr("BUTTON"))),
		uintptr(unsafe.Pointer(utf16Ptr("2. Инструменты [Активно]"))),
		WS_CHILD|WS_VISIBLE|WS_TABSTOP|BS_DEFPUSHBUTTON,
		192, 6, 215, 28, hwnd, ID_BTN_TAB_TOOLS, 0, 0,
	)
	setFont(hBtnTabTools, hFontBold)

	hBtnTabBuilds, _, _ = procCreateWindowExW.Call(
		0, uintptr(unsafe.Pointer(utf16Ptr("BUTTON"))),
		uintptr(unsafe.Pointer(utf16Ptr("3. Сборки"))),
		WS_CHILD|WS_VISIBLE|WS_TABSTOP|BS_PUSHBUTTON,
		414, 6, 150, 28, hwnd, ID_BTN_TAB_BUILDS, 0, 0,
	)
	setFont(hBtnTabBuilds, hFontBold)

	hBtnTabEnv, _, _ = procCreateWindowExW.Call(
		0, uintptr(unsafe.Pointer(utf16Ptr("BUTTON"))),
		uintptr(unsafe.Pointer(utf16Ptr("4. Среда (Эмуляторы ★)"))),
		WS_CHILD|WS_VISIBLE|WS_TABSTOP|BS_PUSHBUTTON,
		571, 6, 200, 28, hwnd, ID_BTN_TAB_ENV, 0, 0,
	)
	setFont(hBtnTabEnv, hFontBold)

	hCmbViewMode, _, _ = procCreateWindowExW.Call(
		0, uintptr(unsafe.Pointer(utf16Ptr("COMBOBOX"))),
		0,
		WS_CHILD|WS_VISIBLE|WS_TABSTOP|CBS_DROPDOWNLIST,
		782, 6, 390, 200, hwnd, ID_CMB_VIEW_MODE, 0, 0,
	)
	setFont(hCmbViewMode, hFontUI)
	for _, vm := range []string{
		"Вид A: Презентационный (Окна + Инспектор с обложкой и видео)",
		"Вид B: Компактный (Плотный список + Дерево консолей)",
		"Вид C: Редактор (Таблица сверки с галочками Было -> Стало)",
	} {
		procSendMessageW.Call(hCmbViewMode, CB_ADDSTRING, 0, uintptr(unsafe.Pointer(utf16Ptr(vm))))
	}
	procSendMessageW.Call(hCmbViewMode, CB_SETCURSEL, 0, 0)
	procSendMessageW.Call(hCmbViewMode, CB_SETDROPPEDWIDTH, 520, 0)

	hBtnThemeToggle, _, _ = procCreateWindowExW.Call(
		0, uintptr(unsafe.Pointer(utf16Ptr("BUTTON"))),
		uintptr(unsafe.Pointer(utf16Ptr("🌙 Тёмная тема / ☀ Светлая"))),
		WS_CHILD|WS_VISIBLE|WS_TABSTOP|BS_PUSHBUTTON,
		1182, 6, 238, 28, hwnd, ID_BTN_THEME_TOGGLE, 0, 0,
	)
	setFont(hBtnThemeToggle, hFontBold)

	// Row 1: Path Header & Folder Picker
	hLblPath, _, _ = procCreateWindowExW.Call(
		0, uintptr(unsafe.Pointer(utf16Ptr("STATIC"))),
		uintptr(unsafe.Pointer(utf16Ptr(""))),
		WS_CHILD,
		0, 0, 0, 0, hwnd, 0, 0, 0,
	)
	setFont(hLblPath, hFontTitle)

	hEditPath, _, _ = procCreateWindowExW.Call(
		WS_EX_CLIENTEDGE, uintptr(unsafe.Pointer(utf16Ptr("EDIT"))),
		uintptr(unsafe.Pointer(utf16Ptr(defaultDir))),
		WS_CHILD|WS_VISIBLE|WS_TABSTOP|ES_AUTOHSCROLL,
		20, 38, 960, 34, hwnd, ID_EDIT_PATH, 0, 0,
	)
	setFont(hEditPath, hFontUI)
	addControlTooltip(hwnd, hEditPath, "Путь к вашей флешке R36S (раздел EASYROMS) или отдельной папке консоли (psx, gba, nes, genesis).\r\nСовет: для R36S всегда оставляйте ромы в корневых папках консолей (E:\\psx, E:\\gba).")

	hBtnBrowse, _, _ = procCreateWindowExW.Call(
		0, uintptr(unsafe.Pointer(utf16Ptr("BUTTON"))),
		uintptr(unsafe.Pointer(utf16Ptr("Выбрать папку..."))),
		WS_CHILD|WS_VISIBLE|WS_TABSTOP|BS_PUSHBUTTON,
		840, 37, 175, 36, hwnd, ID_BTN_BROWSE, 0, 0,
	)
	setFont(hBtnBrowse, hFontBold)
	addControlTooltip(hwnd, hBtnBrowse, "Открыть стандартное окно выбора папки на компьютере или SD-карте R36S (EASYROMS).")

	hBtnExplorer, _, _ = procCreateWindowExW.Call(
		0, uintptr(unsafe.Pointer(utf16Ptr("BUTTON"))),
		uintptr(unsafe.Pointer(utf16Ptr("Открыть в Проводнике"))),
		WS_CHILD|WS_VISIBLE|WS_TABSTOP|BS_PUSHBUTTON,
		1023, 37, 200, 36, hwnd, ID_BTN_EXPLORER, 0, 0,
	)
	setFont(hBtnExplorer, hFontUI)
	addControlTooltip(hwnd, hBtnExplorer, "Открыть выбранную папку в Проводнике Windows для проверки файлов.")

	hBtnStop, _, _ = procCreateWindowExW.Call(
		0, uintptr(unsafe.Pointer(utf16Ptr("BUTTON"))),
		uintptr(unsafe.Pointer(utf16Ptr("⏹ СТОП (Остановить)"))),
		WS_CHILD|WS_VISIBLE|WS_TABSTOP|BS_PUSHBUTTON,
		1231, 37, 189, 36, hwnd, ID_BTN_STOP, 0, 0,
	)
	setFont(hBtnStop, hFontBold)
	addControlTooltip(hwnd, hBtnStop, "Кнопка экстренной остановки «⏹ СТОП»: немедленно останавливает сканирование, переименование, сборку или применение XML без зависания программы!")

	// Row 2: Two Wide Comboboxes (50% width each -> 690px each, plus 880px dropdown width so text is NEVER cut off!)
	hLblMode, _, _ = procCreateWindowExW.Call(
		0, uintptr(unsafe.Pointer(utf16Ptr("STATIC"))),
		uintptr(unsafe.Pointer(utf16Ptr("Режим каталогизации (куда складывать лучшие ромы после сверки):"))),
		WS_CHILD|WS_VISIBLE|SS_NOTIFY,
		20, 80, 690, 22, hwnd, 0, 0, 0,
	)
	setFont(hLblMode, hFontBold)

	hCmbMode, _, _ = procCreateWindowExW.Call(
		0, uintptr(unsafe.Pointer(utf16Ptr("COMBOBOX"))),
		0,
		WS_CHILD|WS_VISIBLE|WS_TABSTOP|CBS_DROPDOWNLIST,
		20, 104, 690, 260, hwnd, ID_CMB_MODE, 0, 0,
	)
	setFont(hCmbMode, hFontUI)
	modes := []string{
		"1. Для ПК: Папка Organized -> Поколение (8bit/16bit) -> Консоль -> Ромы + images",
		"2. Для ПК: Корень папки -> Поколение (8bit/16bit) -> Консоль -> Ромы + images",
		"3. Стандарт приставки R36S (EASYROMS): Консоль (gba, psx) -> Все ромы в корне консоли (Рекомендуется для R36S!)",
	}
	for _, m := range modes {
		procSendMessageW.Call(hCmbMode, CB_ADDSTRING, 0, uintptr(unsafe.Pointer(utf16Ptr(m))))
	}
	procSendMessageW.Call(hCmbMode, CB_SETCURSEL, 2, 0)         // Default to R36S EASYROMS safe mode
	procSendMessageW.Call(hCmbMode, CB_SETDROPPEDWIDTH, 920, 0) // Wide dropdown list so full text is always visible!
	addControlTooltip(hwnd, hCmbMode, "Выбор структуры папок при сортировке:\r\n• Вариант 3 (Рекомендуется для флешки R36S EASYROMS): вытаскивает игры из подпапок (top 100, rus) прямо в папку консоли (например E:\\gba или E:\\psx), чтобы приставка R36S видела все игры и монтировала флешку без ошибок!\r\n• Варианты 1 и 2: раскладывают консоли по папкам поколений (1_8bit, 2_16bit) — удобно для хранения коллекции на ПК.")

	hLblPriority, _, _ = procCreateWindowExW.Call(
		0, uintptr(unsafe.Pointer(utf16Ptr("STATIC"))),
		uintptr(unsafe.Pointer(utf16Ptr("Приоритет региона и языка (какую версию игры оставлять при дублях):"))),
		WS_CHILD|WS_VISIBLE|SS_NOTIFY,
		726, 80, 690, 22, hwnd, 0, 0, 0,
	)
	setFont(hLblPriority, hFontBold)

	hCmbPriority, _, _ = procCreateWindowExW.Call(
		0, uintptr(unsafe.Pointer(utf16Ptr("COMBOBOX"))),
		0,
		WS_CHILD|WS_VISIBLE|WS_TABSTOP|CBS_DROPDOWNLIST,
		726, 104, 690, 260, hwnd, ID_CMB_PRIORITY, 0, 0,
	)
	setFont(hCmbPriority, hFontUI)
	priorities := []string{
		"1. Русская версия (RUS) > Английская (USA) > Европа (Europe) > Япония (Japan) [Рекомендуется]",
		"2. Английская версия (USA) > Европа (Europe) > Русская (RUS) > Япония (Japan)",
		"3. Европейская версия (Europe) > Английская (USA) > Русская (RUS) > Япония (Japan)",
		"4. Японский оригинал (Japan) > Английская (USA) > Европа (Europe) > Русская (RUS)",
	}
	for _, p := range priorities {
		procSendMessageW.Call(hCmbPriority, CB_ADDSTRING, 0, uintptr(unsafe.Pointer(utf16Ptr(p))))
	}
	procSendMessageW.Call(hCmbPriority, CB_SETCURSEL, 0, 0)
	procSendMessageW.Call(hCmbPriority, CB_SETDROPPEDWIDTH, 860, 0)
	addControlTooltip(hwnd, hCmbPriority, "Приоритет выбора лучшего рома при обнаружении дублей в разных подпапках (например в корне gba, top 100 и rus):\r\nЕсли выбран пункт 1, программа всегда отдаст приоритет русской версии [RUS], а если её нет — американской (USA).")

	// Row 3: Three Full-Width Checkboxes in their own clean row (y = 142) so text is never clipped
	hChkAutoScrape, _, _ = procCreateWindowExW.Call(
		0, uintptr(unsafe.Pointer(utf16Ptr("BUTTON"))),
		uintptr(unsafe.Pointer(utf16Ptr("Авто-скрапинг обложек R36S сразу после сортировки"))),
		WS_CHILD|WS_VISIBLE|WS_TABSTOP|BS_AUTOCHECKBOX,
		20, 142, 460, 26, hwnd, ID_CHK_AUTO_SCRAPE, 0, 0,
	)
	setFont(hChkAutoScrape, hFontUI)
	procSendMessageW.Call(hChkAutoScrape, BM_SETCHECK, BST_CHECKED, 0)
	addControlTooltip(hwnd, hChkAutoScrape, "Если включено, сразу после сборки ромов (кнопка 2) автоматически запустится скрапер обложек, баннеров и gamelist.xml для R36S.")

	hChkScrapeVid, _, _ = procCreateWindowExW.Call(
		0, uintptr(unsafe.Pointer(utf16Ptr("BUTTON"))),
		uintptr(unsafe.Pointer(utf16Ptr("Скачивать короткие видео-превью (.mp4) для игр R36S"))),
		WS_CHILD|WS_VISIBLE|WS_TABSTOP|BS_AUTOCHECKBOX,
		490, 142, 460, 26, hwnd, ID_CHK_SCRAPE_VID, 0, 0,
	)
	setFont(hChkScrapeVid, hFontUI)
	procSendMessageW.Call(hChkScrapeVid, BM_SETCHECK, BST_CHECKED, 0)
	addControlTooltip(hwnd, hChkScrapeVid, "Если включено, скрапер также ищет и скачивает короткие геймплейные видеоролики (.mp4) в папку videos/ для предпросмотра на R36S (ArkOS / DarkOS).")

	hChkDelJunk, _, _ = procCreateWindowExW.Call(
		0, uintptr(unsafe.Pointer(utf16Ptr("BUTTON"))),
		uintptr(unsafe.Pointer(utf16Ptr("Удалять дубли навсегда (иначе в карантин _Duplicates_1G1R)"))),
		WS_CHILD|WS_VISIBLE|WS_TABSTOP|BS_AUTOCHECKBOX,
		960, 142, 460, 26, hwnd, ID_CHK_DEL_JUNK, 0, 0,
	)
	setFont(hChkDelJunk, hFontUI)
	addControlTooltip(hwnd, hChkDelJunk, "Если отмечено — найденные дубликаты ромов удаляются с флешки сразу.\r\nЕсли снято — дубли переносятся в резервную папку _Duplicates_1G1R (откуда их можно вернуть кнопкой Откат).")

	// Row 4 (Action Row 1): Unified Rename & XML Picker without duplicate buttons (Height = 44px, y = 176)
	hBtnScan, _, _ = procCreateWindowExW.Call(
		0, uintptr(unsafe.Pointer(utf16Ptr("BUTTON"))),
		uintptr(unsafe.Pointer(utf16Ptr("1. Сканировать папку и подпапки"))),
		WS_CHILD|WS_VISIBLE|WS_TABSTOP|BS_DEFPUSHBUTTON,
		20, 176, 340, 44, hwnd, ID_BTN_SCAN, 0, 0,
	)
	setFont(hBtnScan, hFontBold)
	addControlTooltip(hwnd, hBtnScan, "Кнопка 1: Просканировать выбранную папку и все подпапки.\r\nГлубокая сверка v5.0: автоматически очищает ложный тег (World) у файлов вроде 000001 (World).chd, сверяет номер с gamelist.xml и читает внутренний бинарный заголовок диска.")

	hBtnOrganize, _, _ = procCreateWindowExW.Call(
		0, uintptr(unsafe.Pointer(utf16Ptr("BUTTON"))),
		uintptr(unsafe.Pointer(utf16Ptr("2. Комбайн: Собрать без дублей (1G1R)"))),
		WS_CHILD|WS_VISIBLE|WS_TABSTOP|BS_PUSHBUTTON,
		370, 176, 340, 44, hwnd, ID_BTN_ORGANIZE, 0, 0,
	)
	setFont(hBtnOrganize, hFontBold)
	procEnableWindow.Call(hBtnOrganize, 0)
	addControlTooltip(hwnd, hBtnOrganize, "Кнопка 2 (Комбайн 1G1R): Извлекает ромы из вложенных подпапок (top 100, rus и др.), сравнивает версии и оставляет в основном каталоге консоли 1 лучший вариант каждой игры по выбранному приоритету языка (RUS > USA > EUR > JP).")

	hBtnRename0001, _, _ = procCreateWindowExW.Call(
		0, uintptr(unsafe.Pointer(utf16Ptr("BUTTON"))),
		uintptr(unsafe.Pointer(utf16Ptr("3. Переименование ромов (XML + Заголовки)"))),
		WS_CHILD|WS_VISIBLE|WS_TABSTOP|BS_PUSHBUTTON,
		720, 176, 340, 44, hwnd, ID_BTN_RENAME_0001, 0, 0,
	)
	setFont(hBtnRename0001, hFontBold)
	addControlTooltip(hwnd, hBtnRename0001, "Кнопка 3 (ЕДИНЫЙ МОДУЛЬ ПЕРЕИМЕНОВАНИЯ v5.0): Открывает окно сопоставления ваших реальных ромов на диске (включая 000001.chd и 000001 (World).chd!) с файлом gamelist.xml и бинарными заголовками.\r\nПозволяет выбрать любой .XML файл с диска, отметить игры галочками и переименовать ромы + картинки без лишней приписки (World)!")

	hBtnInspectXML, _, _ = procCreateWindowExW.Call(
		0, uintptr(unsafe.Pointer(utf16Ptr("BUTTON"))),
		uintptr(unsafe.Pointer(utf16Ptr("📂 Выбрать свой .XML файл с диска..."))),
		WS_CHILD|WS_VISIBLE|WS_TABSTOP|BS_PUSHBUTTON,
		1070, 176, 350, 44, hwnd, ID_BTN_INSPECT_XML, 0, 0,
	)
	setFont(hBtnInspectXML, hFontBold)
	addControlTooltip(hwnd, hBtnInspectXML, "Открыть стандартное окно выбора файла Windows и указать любой ваш файл gamelist.xml на компьютере или SD-флешке для сопоставления с ромами в папке.")

	// Row 5 (Action Row 2): Scraper, Orphan Media, Phantom Dirs, Repair R36S SD Card & Undo (Height = 42px, y = 228)
	hBtnScrape, _, _ = procCreateWindowExW.Call(
		0, uintptr(unsafe.Pointer(utf16Ptr("BUTTON"))),
		uintptr(unsafe.Pointer(utf16Ptr("4. Скрапер R36S (Обложки + Видео)"))),
		WS_CHILD|WS_VISIBLE|WS_TABSTOP|BS_PUSHBUTTON,
		20, 228, 305, 42, hwnd, ID_BTN_SCRAPE, 0, 0,
	)
	setFont(hBtnScrape, hFontBold)
	procEnableWindow.Call(hBtnScrape, 0)
	addControlTooltip(hwnd, hBtnScrape, "Кнопка 4: Скачивает обложки (images/), баннеры (marquees/), короткие видеоролики (videos/) и формирует правильный gamelist.xml для приставки R36S (ArkOS / DarkOS).")

	hBtnCleanMedia, _, _ = procCreateWindowExW.Call(
		0, uintptr(unsafe.Pointer(utf16Ptr("BUTTON"))),
		uintptr(unsafe.Pointer(utf16Ptr("5. Удалить лишние картинки/видео"))),
		WS_CHILD|WS_VISIBLE|WS_TABSTOP|BS_PUSHBUTTON,
		333, 228, 305, 42, hwnd, ID_BTN_CLEAN_MEDIA, 0, 0,
	)
	setFont(hBtnCleanMedia, hFontBold)
	addControlTooltip(hwnd, hBtnCleanMedia, "Кнопка 5: Сканирует папки images, marquees и videos по каждому рому. Если самого рома в папке больше нет (удален дубль), удаляет лишние картинки и видео.")

	hBtnPhantomDirs, _, _ = procCreateWindowExW.Call(
		0, uintptr(unsafe.Pointer(utf16Ptr("BUTTON"))),
		uintptr(unsafe.Pointer(utf16Ptr("6. Фантомные папки (download_images)..."))),
		WS_CHILD|WS_VISIBLE|WS_TABSTOP|BS_PUSHBUTTON,
		646, 228, 325, 42, hwnd, ID_BTN_PHANTOM_DIRS, 0, 0,
	)
	setFont(hBtnPhantomDirs, hFontBold)
	addControlTooltip(hwnd, hBtnPhantomDirs, "Кнопка 6: Находит в каталогах ромов фантомные папки (например download_images, boxart, media), спасает из них недостающие картинки в верную папку «images» и позволяет отметить галочками лишние папки для удаления.\r\nСистемные папки R36S (bios, tools, themes, ports) защищены от удаления!")

	hBtnRepairSD, _, _ = procCreateWindowExW.Call(
		0, uintptr(unsafe.Pointer(utf16Ptr("BUTTON"))),
		uintptr(unsafe.Pointer(utf16Ptr("7. Починить флешку R36S (Монтирование)"))),
		WS_CHILD|WS_VISIBLE|WS_TABSTOP|BS_PUSHBUTTON,
		979, 228, 315, 42, hwnd, ID_BTN_REPAIR_SD, 0, 0,
	)
	setFont(hBtnRepairSD, hFontBold)
	addControlTooltip(hwnd, hBtnRepairSD, "Кнопка 7 (Спасение флешки R36S EASYROMS, если она перестала монтироваться на приставке):\r\n1. Возвращает ромы из вложенных папок Organized/ и Поколений обратно в корневые папки консолей (gba, psx, nes и т.д.).\r\n2. Восстанавливает удаленные системные папки R36S (bios, tools, ports, themes, launchimages, nes, psx, gba и др.), без которых ArkOS/DarkOS не монтирует флешку.\r\n3. Запускает проверку файловой системы (chkdsk /f) для снятия флага ошибки диска (Dirty Bit) после записи в Windows.")

	hBtnUndo, _, _ = procCreateWindowExW.Call(
		0, uintptr(unsafe.Pointer(utf16Ptr("BUTTON"))),
		uintptr(unsafe.Pointer(utf16Ptr("Откат (Undo)"))),
		WS_CHILD|WS_VISIBLE|WS_TABSTOP|BS_PUSHBUTTON,
		1302, 228, 118, 42, hwnd, ID_BTN_UNDO, 0, 0,
	)
	setFont(hBtnUndo, hFontUI)
	procEnableWindow.Call(hBtnUndo, 0)
	addControlTooltip(hwnd, hBtnUndo, "Отменить последнюю операцию перемещения или переименования ромов и вернуть файлы на прежние места.")

	// Row 6: Progress Bar & Clear Status Banner (y = 278)
	hProgress, _, _ = procCreateWindowExW.Call(
		0, uintptr(unsafe.Pointer(utf16Ptr("msctls_progress32"))),
		0,
		WS_CHILD|WS_VISIBLE,
		20, 278, 280, 22, hwnd, ID_PROGRESS, 0, 0,
	)

	hLblStats, _, _ = procCreateWindowExW.Call(
		0, uintptr(unsafe.Pointer(utf16Ptr("STATIC"))),
		uintptr(unsafe.Pointer(utf16Ptr("Наведите курсор на любую кнопку, список или ячейку таблицы для всплывающей подсказки. Если флешка не монтируется — нажмите кнопку 7."))),
		WS_CHILD|WS_VISIBLE|SS_NOTIFY,
		312, 278, 1108, 24, hwnd, ID_LBL_STATS, 0, 0,
	)
	setFont(hLblStats, hFontBold)
	addControlTooltip(hwnd, hLblStats, "Строка состояния операции. Подсказка: в R36S верный каталог для картинок — «images», а «download_images» можно удалить кнопкой 6.")

	// Row 7: Crisp White Windows 11 Explorer ListView Table with Hover Cell Tooltips (LVS_EX_LABELTIP | LVS_EX_INFOTIP)
	hListView, _, _ = procCreateWindowExW.Call(
		WS_EX_CLIENTEDGE, uintptr(unsafe.Pointer(utf16Ptr("SysListView32"))),
		0,
		WS_CHILD|WS_VISIBLE|WS_TABSTOP|LVS_REPORT|LVS_SHOWSELALWAYS|LVS_SINGLESEL,
		20, 308, 1400, 380, hwnd, ID_LISTVIEW, 0, 0,
	)
	setFont(hListView, hFontUI)
	applyExplorerThemeControl(hListView)
	extStyle := uintptr(LVS_EX_FULLROWSELECT | LVS_EX_DOUBLEBUFFER | LVS_EX_INFOTIP | LVS_EX_LABELTIP)
	procSendMessageW.Call(hListView, LVM_SETEXTENDEDLISTVIEWSTYLE, extStyle, extStyle)
	procSendMessageW.Call(hListView, LVM_SETBKCOLOR, 0, CLR_BG_SURFACE)
	procSendMessageW.Call(hListView, LVM_SETTEXTBKCOLOR, 0, CLR_BG_SURFACE)
	procSendMessageW.Call(hListView, LVM_SETTEXTCOLOR, 0, CLR_TEXT_PRIMARY)

	columns := []struct {
		Title string
		Width int32
	}{
		{"Статус сверки", 185},
		{"Поколение / Консоль", 190},
		{"Откуда (Подпапка)", 150},
		{"Исходный файл (Номер / Имя)", 215},
		{"Реальное имя из рома / базы", 250},
		{"Новое чистое имя файла", 250},
		{"Регион", 85},
		{"Медиа R36S", 150},
	}
	for i, col := range columns {
		lvc := LVCOLUMNW{
			Mask:     LVCF_FMT | LVCF_WIDTH | LVCF_TEXT | LVCF_SUBITEM,
			Fmt:      LVCFMT_LEFT,
			Cx:       col.Width,
			PszText:  utf16Ptr(col.Title),
			ISubItem: int32(i),
		}
		procSendMessageW.Call(hListView, LVM_INSERTCOLUMNW, uintptr(i), uintptr(unsafe.Pointer(&lvc)))
	}

	// Row 8: Clean Readable Log Box
	hEditLog, _, _ = procCreateWindowExW.Call(
		WS_EX_CLIENTEDGE, uintptr(unsafe.Pointer(utf16Ptr("EDIT"))),
		0,
		WS_CHILD|WS_VISIBLE|WS_VSCROLL|ES_MULTILINE|ES_AUTOVSCROLL|ES_READONLY,
		20, 698, 1400, 150, hwnd, ID_EDIT_LOG, 0, 0,
	)
	setFont(hEditLog, hFontMono)

	appendLog("AegisROM v"+AEGIS_APP_VERSION+" (Beta) готов к работе. Все инструменты переименования объединены в кнопку «3. Переименование ромов (XML + Заголовки)».")
	appendLog("• ГЛУБОКАЯ СВЕРКА 000001 (World).chd: программа автоматически очищает ложный тег (World) у переименованных файлов, сверяет чистый номер 000001 с выбранным вами файлом gamelist.xml и бинарным заголовком диска, и переименовывает без приписки (World)!")
	appendLog("• КНОПКА «⏹ СТОП»: мгновенно останавливает любую операцию и сразу разблокирует все кнопки интерфейса без перезапуска программы.")
}

func resizeControls(hwnd uintptr) {
	var rc RECT
	procGetClientRect.Call(hwnd, uintptr(unsafe.Pointer(&rc)))
	w := rc.Right - rc.Left
	h := rc.Bottom - rc.Top
	if w < 760 || h < 520 {
		return
	}

	margin := int32(20)
	contentW := w - margin*2
	gap := int32(10)

	// Top Navigation Row: 4 Tabs + View Mode (A/B/C) + Theme Toggle
	procMoveWindow.Call(hBtnTabLib, uintptr(margin), 6, 165, 28, 1)
	procMoveWindow.Call(hBtnTabTools, uintptr(margin+172), 6, 215, 28, 1)
	procMoveWindow.Call(hBtnTabBuilds, uintptr(margin+394), 6, 150, 28, 1)
	procMoveWindow.Call(hBtnTabEnv, uintptr(margin+551), 6, 200, 28, 1)
	themeBtnW := int32(238)
	viewCmbW := contentW - 760 - themeBtnW - gap
	if viewCmbW < 220 {
		viewCmbW = 220
	}
	procMoveWindow.Call(hCmbViewMode, uintptr(margin+760), 6, uintptr(viewCmbW), 200, 1)
	procMoveWindow.Call(hBtnThemeToggle, uintptr(margin+contentW-themeBtnW), 6, uintptr(themeBtnW), 28, 1)

	// Row 1: Edit + Browse + Explorer + STOP
	btnStopW := int32(190)
	btnExplorerW := int32(195)
	btnBrowseW := int32(175)
	editW := contentW - btnBrowseW - btnExplorerW - btnStopW - gap*3
	if editW > 200 {
		procMoveWindow.Call(hEditPath, uintptr(margin), 38, uintptr(editW), 34, 1)
		procMoveWindow.Call(hBtnBrowse, uintptr(margin+editW+gap), 37, uintptr(btnBrowseW), 36, 1)
		procMoveWindow.Call(hBtnExplorer, uintptr(margin+editW+gap+btnBrowseW+gap), 37, uintptr(btnExplorerW), 36, 1)
		procMoveWindow.Call(hBtnStop, uintptr(margin+editW+gap+btnBrowseW+gap+btnExplorerW+gap), 37, uintptr(btnStopW), 36, 1)
	}

	// Row 2: Two Wide Comboboxes (50% / 50% width so text is never truncated!)
	cmbW := (contentW - gap*2) / 2
	rightCmbX := margin + cmbW + gap*2
	rightCmbW := contentW - cmbW - gap*2
	procMoveWindow.Call(hLblMode, uintptr(margin), 80, uintptr(cmbW), 22, 1)
	procMoveWindow.Call(hCmbMode, uintptr(margin), 104, uintptr(cmbW), 260, 1)
	procMoveWindow.Call(hLblPriority, uintptr(rightCmbX), 80, uintptr(rightCmbW), 22, 1)
	procMoveWindow.Call(hCmbPriority, uintptr(rightCmbX), 104, uintptr(rightCmbW), 260, 1)

	// Row 3: Three Full-Width Checkboxes (33% width each)
	chkW := (contentW - gap*2) / 3
	procMoveWindow.Call(hChkAutoScrape, uintptr(margin), 142, uintptr(chkW), 26, 1)
	procMoveWindow.Call(hChkScrapeVid, uintptr(margin+chkW+gap), 142, uintptr(chkW), 26, 1)
	procMoveWindow.Call(hChkDelJunk, uintptr(margin+(chkW+gap)*2), 142, uintptr(contentW-(chkW+gap)*2), 26, 1)

	// Row 4 (Action Row 1): 4 equal-width large buttons (Scan, Organize, Rename0001, InspectXML)
	btnRow1W := (contentW - gap*3) / 4
	procMoveWindow.Call(hBtnScan, uintptr(margin), 176, uintptr(btnRow1W), 44, 1)
	procMoveWindow.Call(hBtnOrganize, uintptr(margin+btnRow1W+gap), 176, uintptr(btnRow1W), 44, 1)
	procMoveWindow.Call(hBtnRename0001, uintptr(margin+(btnRow1W+gap)*2), 176, uintptr(btnRow1W), 44, 1)
	procMoveWindow.Call(hBtnInspectXML, uintptr(margin+(btnRow1W+gap)*3), 176, uintptr(contentW-(btnRow1W+gap)*3), 44, 1)

	// Row 5 (Action Row 2): 4 buttons (Scrape, CleanMedia, PhantomDirs, RepairSD) + Undo button
	undoW := int32(120)
	remW := contentW - undoW - gap*4
	btnRow2W := remW / 4
	procMoveWindow.Call(hBtnScrape, uintptr(margin), 228, uintptr(btnRow2W), 42, 1)
	procMoveWindow.Call(hBtnCleanMedia, uintptr(margin+btnRow2W+gap), 228, uintptr(btnRow2W), 42, 1)
	procMoveWindow.Call(hBtnPhantomDirs, uintptr(margin+(btnRow2W+gap)*2), 228, uintptr(btnRow2W), 42, 1)
	procMoveWindow.Call(hBtnRepairSD, uintptr(margin+(btnRow2W+gap)*3), 228, uintptr(remW-btnRow2W*3), 42, 1)
	procMoveWindow.Call(hBtnUndo, uintptr(margin+contentW-undoW), 228, uintptr(undoW), 42, 1)

	// Row 6: Progress + Stats label
	procMoveWindow.Call(hProgress, uintptr(margin), 278, 280, 22, 1)
	procMoveWindow.Call(hLblStats, 312, 278, uintptr(w-332), 24, 1)

	// Row 7 & 8: ListView Table & Log Box
	logH := int32(145)
	lvTop := int32(308)
	lvH := h - lvTop - logH - 26
	if lvH < 140 {
		lvH = 140
	}
	procMoveWindow.Call(hListView, uintptr(margin), uintptr(lvTop), uintptr(contentW), uintptr(lvH), 1)
	procMoveWindow.Call(hEditLog, uintptr(margin), uintptr(lvTop+lvH+10), uintptr(contentW), uintptr(logH), 1)
	procInvalidateRect.Call(hwnd, 0, 1)
}

func browseForFolder(hwnd uintptr) {
	displayName := make([]uint16, 260)
	bi := BROWSEINFOW{
		HwndOwner:      hwnd,
		PszDisplayName: &displayName[0],
		LpszTitle:      utf16Ptr("Выберите корневую папку EASYROMS или папку консоли (например psx, ps1, gba):"),
		UlFlags:        BIF_RETURNONLYFSDIRS | BIF_NEWDIALOGSTYLE | BIF_EDITBOX,
	}
	pidl, _, _ := procSHBrowseForFolderW.Call(uintptr(unsafe.Pointer(&bi)))
	if pidl != 0 {
		pathBuf := make([]uint16, 260)
		ok, _, _ := procSHGetPathFromIDListW.Call(pidl, uintptr(unsafe.Pointer(&pathBuf[0])))
		procCoTaskMemFree.Call(pidl)
		if ok != 0 {
			selected := syscall.UTF16ToString(pathBuf)
			procSetWindowTextW.Call(hEditPath, uintptr(unsafe.Pointer(utf16Ptr(selected))))
			appendLog("Выбрана папка: " + selected)
		}
	}
}

func openInExplorer() {
	folder := strings.TrimSpace(getWindowText(hEditPath))
	if folder == "" {
		return
	}
	procShellExecuteW.Call(
		0,
		uintptr(unsafe.Pointer(utf16Ptr("open"))),
		uintptr(unsafe.Pointer(utf16Ptr(folder))),
		0, 0, SW_SHOWNORMAL,
	)
}

func getSelectedRegionPriority() []string {
	idx, _, _ := procSendMessageW.Call(hCmbPriority, CB_GETCURSEL, 0, 0)
	switch idx {
	case 1:
		return []string{"USA", "Europe", "Russia", "Japan", "World"}
	case 2:
		return []string{"Europe", "USA", "Russia", "Japan", "World"}
	case 3:
		return []string{"Japan", "USA", "Europe", "Russia", "World"}
	default:
		return []string{"Russia", "USA", "Europe", "Japan", "World"}
	}
}

// ============================================================================
// CONSOLE DETECTION & DEDUPLICATION ENGINE
// ============================================================================

func startScan(hwnd uintptr) {
	stateMu.Lock()
	if isBusy {
		stateMu.Unlock()
		return
	}
	isBusy = true
	stateMu.Unlock()
	atomic.StoreInt32(&cancelRequested, 0)

	rootFolder := strings.TrimSpace(getWindowText(hEditPath))
	if rootFolder == "" {
		stateMu.Lock()
		isBusy = false
		stateMu.Unlock()
		procMessageBoxW.Call(hwnd, uintptr(unsafe.Pointer(utf16Ptr("Укажите путь к папке для сканирования."))), uintptr(unsafe.Pointer(utf16Ptr("AegisROM"))), MB_OK|MB_ICONWARNING)
		return
	}

	info, err := os.Stat(rootFolder)
	if err != nil || !info.IsDir() {
		stateMu.Lock()
		isBusy = false
		stateMu.Unlock()
		procMessageBoxW.Call(hwnd, uintptr(unsafe.Pointer(utf16Ptr("Указанная папка не существует или недоступна:\n"+rootFolder))), uintptr(unsafe.Pointer(utf16Ptr("Ошибка пути"))), MB_OK|MB_ICONERROR)
		return
	}

	aegiscore.ResetScanCaches()

	priority := getSelectedRegionPriority()

	procEnableWindow.Call(hBtnScan, 0)
	procEnableWindow.Call(hBtnOrganize, 0)
	procEnableWindow.Call(hBtnRename0001, 0)
	procEnableWindow.Call(hBtnScrape, 0)
	procEnableWindow.Call(hBtnCleanMedia, 0)
	procEnableWindow.Call(hBtnPhantomDirs, 0)
	procEnableWindow.Call(hBtnRepairSD, 0)
	procSendMessageW.Call(hListView, LVM_DELETEALLITEMS, 0, 0)
	procSendMessageW.Call(hProgress, PBM_SETRANGE32, 0, 100)
	procSendMessageW.Call(hProgress, PBM_SETPOS, 5, 0)
	procSetWindowTextW.Call(hLblStats, uintptr(unsafe.Pointer(utf16Ptr("Сканирование папок, поиск порядковых номеров (1, 2, 3... / 0001...) и чтение реальных имен из ромов..."))))

	appendLog("====================================================================")
	appendLog("Начато глубокое сканирование и декодирование заголовков ромов: " + rootFolder)

	go func() {
		startTime := time.Now()
		var candidatePaths []string

		_ = filepath.Walk(rootFolder, func(p string, fi os.FileInfo, walkErr error) error {
			if walkErr != nil {
				if os.IsPermission(walkErr) {
					return filepath.SkipDir
				}
				return nil
			}
			if fi.IsDir() {
				name := fi.Name()
				lower := strings.ToLower(name)
				if strings.HasPrefix(name, ".") ||
					name == "$RECYCLE.BIN" ||
					name == "System Volume Information" ||
					name == "_Duplicates_1G1R" ||
					name == "_BadDumps_Junk" ||
					lower == "images" ||
					lower == "download_images" ||
					lower == "downloaded_images" ||
					lower == "marquees" ||
					lower == "banners" ||
					lower == "videos" {
					return filepath.SkipDir
				}
				return nil
			}

			ext := strings.ToLower(filepath.Ext(p))
			if _, ok := aegiscore.ExtToDefaultConsole[ext]; ok || ext == ".zip" {
				candidatePaths = append(candidatePaths, p)
			}
			return nil
		})

		// First pass: detect sequential numbered ROM series in each folder (excluding 007 James Bond games!)
		aegiscore.BuildSequentialNumberedCache(candidatePaths)

		totalCandidates := len(candidatePaths)
		appendLog(fmt.Sprintf("Найдено ромов: %d. Анализ порядковых номеров (исключая 007), чтение заголовков ромов и сверка дублей...", totalCandidates))

		jobsCh := make(chan string, totalCandidates+1)
		resultsCh := make(chan aegiscore.RomItem, totalCandidates+1)

		var wg sync.WaitGroup
		for w := 0; w < 8; w++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				for p := range jobsCh {
					if atomic.LoadInt32(&cancelRequested) != 0 {
						continue
					}
					if item, ok := aegiscore.InspectRomFile(rootFolder, p); ok {
						resultsCh <- item
					}
				}
			}()
		}

		for _, cp := range candidatePaths {
			jobsCh <- cp
		}
		close(jobsCh)

		go func() {
			wg.Wait()
			close(resultsCh)
		}()

		var results []aegiscore.RomItem
		processed := 0
		for item := range resultsCh {
			results = append(results, item)
			processed++
			if totalCandidates > 0 && processed%5 == 0 {
				pct := int((float64(processed) / float64(totalCandidates)) * 90.0)
				procPostMessageW.Call(hwnd, WM_APP_PROGRESS, uintptr(pct), 0)
			}
		}

		sort.Slice(results, func(i, j int) bool {
			if results[i].Generation != results[j].Generation {
				return results[i].Generation < results[j].Generation
			}
			if results[i].ConsoleCode != results[j].ConsoleCode {
				return results[i].ConsoleCode < results[j].ConsoleCode
			}
			if results[i].ComparisonKey != results[j].ComparisonKey {
				return results[i].ComparisonKey < results[j].ComparisonKey
			}
			return results[i].FileName < results[j].FileName
		})

		results = aegiscore.DeduplicateAcrossSubfolders(results, priority)

		stateMu.Lock()
		scannedRoms = results
		stateMu.Unlock()

		elapsed := time.Since(startTime).Round(time.Millisecond)
		appendLog(fmt.Sprintf("Сканирование завершено за %v. Проверено ромов: %d.", elapsed, len(results)))

		procPostMessageW.Call(hwnd, WM_APP_SCAN_DONE, 0, 0)
	}()
}

func populateListView() {
	procSendMessageW.Call(hListView, LVM_DELETEALLITEMS, 0, 0)

	stateMu.Lock()
	items := make([]aegiscore.RomItem, len(scannedRoms))
	copy(items, scannedRoms)
	stateMu.Unlock()

	var cleanCount, cloneCount, numberedCount int
	var reclaimBytes int64

	for i, r := range items {
		statusLabel := "✔ Оставить 1G1R"
		if r.Status == "duplicate_clone" {
			statusLabel = "⇄ Убрать дубль"
			cloneCount++
			reclaimBytes += r.FileSize
		} else if r.Status == "junk_bad_dump" {
			statusLabel = "✖ Мусор [b]"
			reclaimBytes += r.FileSize
		} else {
			if r.IsNumberedFile {
				statusLabel = "★ Порядковый №"
				numberedCount++
			}
			cleanCount++
		}

		lvi := LVITEMW{
			Mask:    LVIF_TEXT,
			IItem:   int32(i),
			PszText: utf16Ptr(statusLabel),
		}
		procSendMessageW.Call(hListView, LVM_INSERTITEMW, 0, uintptr(unsafe.Pointer(&lvi)))

		genAndConsole := fmt.Sprintf("%s \\ %s", strings.Split(r.Generation, " ")[0], strings.ToUpper(r.ConsoleCode))
		regLabel := r.Region
		if r.IsRussian {
			regLabel = "RUS"
		}

		subItems := []string{
			genAndConsole,
			r.SourceSubfolder,
			r.FileName,
			r.ExtractedTitle,
			r.CanonicalName,
			regLabel,
			r.MediaStatus,
		}
		for subIdx, text := range subItems {
			sub := LVITEMW{
				Mask:     LVIF_TEXT,
				IItem:    int32(i),
				ISubItem: int32(subIdx + 1),
				PszText:  utf16Ptr(text),
			}
			procSendMessageW.Call(hListView, LVM_SETITEMW, 0, uintptr(unsafe.Pointer(&sub)))
		}
	}

	summary := fmt.Sprintf(
		"Всего: %d | Уникальных 1G1R: %d | Порядковых номеров (1, 2, 000001... кроме 007): %d | Дублей: %d | Освободится: %s",
		len(items), cleanCount, numberedCount, cloneCount, aegiscore.FormatBytes(reclaimBytes),
	)
	procSetWindowTextW.Call(hLblStats, uintptr(unsafe.Pointer(utf16Ptr(summary))))
	procSendMessageW.Call(hProgress, PBM_SETPOS, 100, 0)

	procEnableWindow.Call(hBtnScan, 1)
	procEnableWindow.Call(hBtnCleanMedia, 1)
	procEnableWindow.Call(hBtnPhantomDirs, 1)
	procEnableWindow.Call(hBtnRepairSD, 1)
	if len(items) > 0 {
		procEnableWindow.Call(hBtnOrganize, 1)
		procEnableWindow.Call(hBtnRename0001, 1)
		procEnableWindow.Call(hBtnScrape, 1)
	}
}

// ============================================================================
// BUTTON 3: RENAME SEQUENTIAL NUMBERED ROMS (1, 2, 3... / 01, 02... / 000001... -> Real Extracted Game Name)
// With explicit 007 (James Bond) exception so it NEVER loops, plus automatic PSX gamelist.xml & image recovery!
// ============================================================================

func startRenameNumberedRoms(hwnd uintptr) {
	stateMu.Lock()
	if isBusy || len(scannedRoms) == 0 {
		stateMu.Unlock()
		return
	}
	isBusy = true
	items := make([]aegiscore.RomItem, len(scannedRoms))
	copy(items, scannedRoms)
	stateMu.Unlock()
	atomic.StoreInt32(&cancelRequested, 0)

	procEnableWindow.Call(hBtnScan, 0)
	procEnableWindow.Call(hBtnOrganize, 0)
	procEnableWindow.Call(hBtnRename0001, 0)
	procEnableWindow.Call(hBtnScrape, 0)
	procEnableWindow.Call(hBtnCleanMedia, 0)
	procEnableWindow.Call(hBtnPhantomDirs, 0)
	procEnableWindow.Call(hBtnRepairSD, 0)
	procSendMessageW.Call(hProgress, PBM_SETPOS, 15, 0)

	appendLog("====================================================================")
	appendLog("Переименование ромов с порядковыми номерами (000001..000634) в реальные названия (с защитой от одинаковых имен и кнопкой СТОП)...")

	go func() {
		var undoBatch []UndoEntry
		renamedCount := 0

		// Check if there are specifically flagged sequential numbered ROMs in the scan
		hasNumberedRoms := false
		for _, it := range items {
			if it.IsNumberedFile {
				hasNumberedRoms = true
				break
			}
		}

		// Preload Libretro index for consoles present so abbreviated internal headers (like "TEKKEN3") expand to full titles
		uniqueConsoles := make(map[string]bool)
		for _, it := range items {
			if !hasNumberedRoms || it.IsNumberedFile {
				uniqueConsoles[it.ConsoleCode] = true
			}
		}
		for cCode := range uniqueConsoles {
			if atomic.LoadInt32(&cancelRequested) != 0 {
				break
			}
			if meta, ok := aegiscore.ConsoleCatalog[cCode]; ok {
				_ = aegiscore.GetOrLoadLibretroIndex(meta.LibretroSystem)
			}
		}

		usedNamesPerDir := make(map[string]map[string]bool)
		for _, it := range items {
			d := filepath.Dir(it.FilePath)
			if usedNamesPerDir[d] == nil {
				usedNamesPerDir[d] = make(map[string]bool)
			}
			usedNamesPerDir[d][strings.ToLower(it.FileName)] = true
		}

		for idx := range items {
			if atomic.LoadInt32(&cancelRequested) != 0 {
				appendLog(fmt.Sprintf("⏹ ОСТАНОВЛЕНО ПОЛЬЗОВАТЕЛЕМ («СТОП»). Переименовано файлов до остановки: %d.", renamedCount))
				break
			}
			r := &items[idx]
			if _, err := os.Stat(r.FilePath); err != nil {
				continue
			}

			// Explicit 007 James Bond exception: if the file on disk is already named as a 007 game, skip it so it NEVER loops!
			if aegiscore.IsJamesBond007Game(r.FileName) {
				appendLog(fmt.Sprintf("[ИСКЛЮЧЕНИЕ 007] Пропущена игра про агента 007 (защита от зацикливания): %s", r.FileName))
				r.IsNumberedFile = false
				continue
			}

			// If the folder has sequential numbered ROMs, only rename the numbered ROMs!
			if hasNumberedRoms && !r.IsNumberedFile {
				continue
			}

			// Re-attempt lookup in custom XML, embedded factory XML map (using core number key for "000001 (World).chd"), or binary extraction
			if aegiscore.IsPureNumberOrGenericTitle(r.CleanTitle) {
				oldBaseLow := strings.ToLower(strings.TrimSuffix(r.FileName, filepath.Ext(r.FileName)))
				coreKey := aegiscore.ExtractCoreNumberKey(r.FileName)
				resolvedTitle := aegiscore.GamelistTitleForFile(r.FilePath)
				if resolvedTitle == "" {
					resolvedTitle = aegiscore.FactoryR36SNumberMap[oldBaseLow]
				}
				if resolvedTitle == "" && coreKey != "" {
					resolvedTitle = aegiscore.FactoryR36SNumberMap[coreKey]
				}
				if resolvedTitle == "" {
					resolvedTitle = aegiscore.ExtractInternalBinaryRomTitle(r.FilePath, r.Extension, r.ConsoleCode)
				}
				if resolvedTitle != "" && !aegiscore.IsPureNumberOrGenericTitle(resolvedTitle) {
					r.ExtractedTitle = resolvedTitle
					r.CleanTitle = aegiscore.ExtractCleanTitle(resolvedTitle)
					r.ComparisonKey = aegiscore.BuildComparisonKey(r.CleanTitle)
					r.Region = aegiscore.ParseRegion(resolvedTitle, r.IsRussian)
					if r.IsRussian {
						r.CanonicalName = fmt.Sprintf("%s (RUS)%s", r.CleanTitle, r.Extension)
					} else if r.Region != "World" {
						r.CanonicalName = fmt.Sprintf("%s (%s)%s", r.CleanTitle, r.Region, r.Extension)
					} else {
						r.CanonicalName = fmt.Sprintf("%s%s", r.CleanTitle, r.Extension)
					}
				}
			}

			// Only expand via Libretro index if we already have a non-numeric title!
			if !aegiscore.IsPureNumberOrGenericTitle(r.CleanTitle) && aegiscore.CountLettersInString(r.CleanTitle) >= 2 {
				meta := aegiscore.ConsoleCatalog[r.ConsoleCode]
				if matched := aegiscore.FindBestLibretroMatch(meta.LibretroSystem, r.CleanTitle, r.ComparisonKey, r.Region); matched != "" {
					expanded := aegiscore.ExtractCleanTitle(matched)
					if expanded != "" && !aegiscore.IsPureNumberOrGenericTitle(expanded) && aegiscore.CountLettersInString(expanded) >= 2 {
						r.CleanTitle = expanded
						r.ExtractedTitle = expanded
						if r.IsRussian {
							r.CanonicalName = fmt.Sprintf("%s (RUS)%s", expanded, r.Extension)
						} else if r.Region != "World" {
							r.CanonicalName = fmt.Sprintf("%s (%s)%s", expanded, r.Region, r.Extension)
						} else {
							r.CanonicalName = fmt.Sprintf("%s%s", expanded, r.Extension)
						}
					}
				}
			}

			safeNewName := aegiscore.SanitizeFileName(r.CanonicalName)
			newBaseCheck := strings.TrimSuffix(strings.ToLower(safeNewName), filepath.Ext(safeNewName))
			newBaseNoTags := strings.TrimSpace(aegiscore.TagStripRegex.ReplaceAllString(newBaseCheck, ""))
			if strings.EqualFold(r.FileName, safeNewName) || aegiscore.IsPureNumberOrGenericTitle(newBaseNoTags) || aegiscore.CountLettersInString(newBaseNoTags) < 2 {
				continue
			}

			romDir := filepath.Dir(r.FilePath)
			if usedNamesPerDir[romDir] == nil {
				usedNamesPerDir[romDir] = make(map[string]bool)
			}
			oldBase := strings.TrimSuffix(r.FileName, filepath.Ext(r.FileName))
			newBase := strings.TrimSuffix(safeNewName, filepath.Ext(safeNewName))
			targetPath := filepath.Join(romDir, safeNewName)

			// Prevent duplicate game titles from colliding by appending [000593]
			_, statErr := os.Stat(targetPath)
			if (statErr == nil && !strings.EqualFold(r.FilePath, targetPath)) || (usedNamesPerDir[romDir][strings.ToLower(safeNewName)] && !strings.EqualFold(r.FileName, safeNewName)) {
				safeNewName = aegiscore.SanitizeFileName(fmt.Sprintf("%s [%s]%s", newBase, oldBase, filepath.Ext(safeNewName)))
				targetPath = filepath.Join(romDir, safeNewName)
				newBase = strings.TrimSuffix(safeNewName, filepath.Ext(safeNewName))
			}
			usedNamesPerDir[romDir][strings.ToLower(safeNewName)] = true

			if err := os.Rename(r.FilePath, targetPath); err == nil {
				undoBatch = append(undoBatch, UndoEntry{FromPath: targetPath, ToPath: r.FilePath})
				// Also rename companion .bin if this was a .cue, or .cue if this was a .bin, and sync companion RomItem!
				compOldPath, compNewPath := aegiscore.RenameCompanionCueBin(romDir, oldBase, newBase, r.Extension)
				if compOldPath != "" && compNewPath != "" {
					undoBatch = append(undoBatch, UndoEntry{FromPath: compNewPath, ToPath: compOldPath})
					for cIdx := range items {
						if strings.EqualFold(items[cIdx].FilePath, compOldPath) {
							items[cIdx].FilePath = compNewPath
							items[cIdx].FileName = filepath.Base(compNewPath)
							items[cIdx].CleanTitle = r.CleanTitle
							items[cIdx].ExtractedTitle = r.ExtractedTitle
							items[cIdx].CanonicalName = filepath.Base(compNewPath)
							items[cIdx].IsNumberedFile = false
						}
					}
				}
				// Also rename existing images, marquees, and videos from 000001.png / 000001-image.png -> RealName-image.png!
				aegiscore.RelocateExistingMediaForRom(romDir, romDir, oldBase, newBase)

				appendLog(fmt.Sprintf("[НОМЕР -> ИМЯ] %s  ==>  %s", r.FileName, filepath.Base(targetPath)))
				r.FilePath = targetPath
				r.FileName = filepath.Base(targetPath)
				r.IsNumberedFile = false
				renamedCount++
			}
		}

		// Update MediaStatus for all items and write gamelist.xml for ALL ROMs in each console folder
		// so that every ROM on disk has its real name and verified existing image/thumbnail path!
		byDir := make(map[string][]aegiscore.RomItem)
		for idx := range items {
			it := &items[idx]
			if _, err := os.Stat(it.FilePath); err != nil {
				continue
			}
			romDir := filepath.Dir(it.FilePath)
			baseNoExt := strings.TrimSuffix(it.FileName, filepath.Ext(it.FileName))
			imgRel, _, _, vidRel := aegiscore.ResolveExistingMediaPathsForRom(romDir, baseNoExt, it.CleanTitle)
			if imgRel != "" && vidRel != "" {
				it.MediaStatus = "✔ Картинка + Видео"
			} else if imgRel != "" {
				it.MediaStatus = "✔ Картинка"
			}
			byDir[romDir] = append(byDir[romDir], *it)
		}
		for consoleDir, dirRoms := range byDir {
			aegiscore.WriteArkOSGamelistXML(consoleDir, dirRoms)
			appendLog(fmt.Sprintf("[ПРИВЯЗКА GAMELIST.XML] Восстановлены имена и пути к существующим картинкам в: %s (%d файлов)", consoleDir, len(dirRoms)))
		}

		stateMu.Lock()
		scannedRoms = items
		if len(undoBatch) > 0 {
			undoHistory = undoBatch
		}
		stateMu.Unlock()

		procPostMessageW.Call(hwnd, WM_APP_RENAME_0001_DONE, uintptr(renamedCount), 0)
	}()
}

// ============================================================================
// BUTTON 6: INTERACTIVE PHANTOM / UNUSED FOLDERS FINDER & CHECKBOX CLEANER
// Protects all R36S (ArkOS / DarkOS) system & console folders so SD card mounting never breaks!
// ============================================================================

func openPhantomFoldersDialog(hwnd uintptr) {
	rootFolder := strings.TrimSpace(getWindowText(hEditPath))
	if rootFolder == "" {
		return
	}

	found := aegiscore.ScanForPhantomFolders(rootFolder)
	stateMu.Lock()
	phantomFolders = found
	stateMu.Unlock()

	if len(found) == 0 {
		procMessageBoxW.Call(
			hwnd,
			uintptr(unsafe.Pointer(utf16Ptr("В выбранном каталоге не найдено фантомных или лишних папок!\n\nПояснение для R36S (ArkOS / DarkOS):\n• Верные папки: images, marquees, videos\n• Системные папки R36S (bios, tools, ports, themes и др.) защищены\n• Лишние папки (download_images, boxart, пустые подпапки) отсутствуют."))),
			uintptr(unsafe.Pointer(utf16Ptr("Проверка фантомных папок — Чисто!"))),
			MB_OK|MB_ICONINFORMATION,
		)
		return
	}

	if hPhantomWnd != 0 {
		procDestroyWindow.Call(hPhantomWnd)
		hPhantomWnd = 0
	}

	hInst, _, _ := procGetModuleHandleW.Call(0)
	dlgTitle := utf16Ptr("Найденные фантомные и лишние папки (наведите курсор на строку для полного текста)")
	hDlg, _, _ := procCreateWindowExW.Call(
		WS_EX_DLGMODALFRAME,
		uintptr(unsafe.Pointer(utf16Ptr("AegisROMPhantomModalClass"))),
		uintptr(unsafe.Pointer(dlgTitle)),
		WS_POPUPWINDOW|WS_CAPTION|WS_SYSMENU|WS_VISIBLE,
		120, 90, 1060, 620,
		hwnd, 0, hInst, 0,
	)
	hPhantomWnd = hDlg
	applyWin11ModernWindowFrame(hDlg)
	if hAppIcon != 0 {
		procSendMessageW.Call(hDlg, WM_SETICON, 1, hAppIcon)
		procSendMessageW.Call(hDlg, WM_SETICON, 0, hAppIcon)
	}
}

func createPhantomDialogControls(hDlg uintptr) {
	hInfo, _, _ := procCreateWindowExW.Call(
		0, uintptr(unsafe.Pointer(utf16Ptr("STATIC"))),
		uintptr(unsafe.Pointer(utf16Ptr("ПАМЯТКА R36S (ArkOS / DarkOS): Верный каталог картинок — «images» (плюс «marquees» и «videos»). Папки «download_images», «downloaded_images», «boxart» и пустые подпапки не нужны — перед их удалением программа автоматически перенесет недостающие картинки в правильную папку «images»! Системные папки R36S защищены."))),
		WS_CHILD|WS_VISIBLE,
		20, 14, 1000, 48, hDlg, 0, 0, 0,
	)
	setFont(hInfo, hFontBold)

	hPhantomLV, _, _ = procCreateWindowExW.Call(
		WS_EX_CLIENTEDGE, uintptr(unsafe.Pointer(utf16Ptr("SysListView32"))),
		0,
		WS_CHILD|WS_VISIBLE|WS_TABSTOP|LVS_REPORT|LVS_SHOWSELALWAYS,
		20, 68, 1000, 430, hDlg, ID_PHANTOM_LV, 0, 0,
	)
	setFont(hPhantomLV, hFontUI)
	applyExplorerThemeControl(hPhantomLV)
	extStyle := uintptr(LVS_EX_FULLROWSELECT | LVS_EX_CHECKBOXES | LVS_EX_DOUBLEBUFFER | LVS_EX_INFOTIP | LVS_EX_LABELTIP)
	procSendMessageW.Call(hPhantomLV, LVM_SETEXTENDEDLISTVIEWSTYLE, extStyle, extStyle)
	procSendMessageW.Call(hPhantomLV, LVM_SETBKCOLOR, 0, CLR_BG_SURFACE)
	procSendMessageW.Call(hPhantomLV, LVM_SETTEXTBKCOLOR, 0, CLR_BG_SURFACE)
	procSendMessageW.Call(hPhantomLV, LVM_SETTEXTCOLOR, 0, CLR_TEXT_PRIMARY)

	cols := []struct {
		Title string
		Width int32
	}{
		{"Удалить? / Путь к фантомной папке", 300},
		{"Имя папки", 155},
		{"Почему папка лишняя / Описание", 380},
		{"Файлов", 75},
		{"Размер", 85},
	}
	for i, c := range cols {
		lvc := LVCOLUMNW{
			Mask:     LVCF_FMT | LVCF_WIDTH | LVCF_TEXT | LVCF_SUBITEM,
			Fmt:      LVCFMT_LEFT,
			Cx:       c.Width,
			PszText:  utf16Ptr(c.Title),
			ISubItem: int32(i),
		}
		procSendMessageW.Call(hPhantomLV, LVM_INSERTCOLUMNW, uintptr(i), uintptr(unsafe.Pointer(&lvc)))
	}

	stateMu.Lock()
	list := make([]aegiscore.PhantomFolderItem, len(phantomFolders))
	copy(list, phantomFolders)
	stateMu.Unlock()

	for i, pf := range list {
		lvi := LVITEMW{
			Mask:    LVIF_TEXT,
			IItem:   int32(i),
			PszText: utf16Ptr(pf.RelativePath),
		}
		procSendMessageW.Call(hPhantomLV, LVM_INSERTITEMW, 0, uintptr(unsafe.Pointer(&lvi)))

		subs := []string{
			pf.FolderName,
			pf.Reason,
			fmt.Sprintf("%d", pf.FileCount),
			aegiscore.FormatBytes(pf.TotalBytes),
		}
		for sIdx, txt := range subs {
			sub := LVITEMW{
				Mask:     LVIF_TEXT,
				IItem:    int32(i),
				ISubItem: int32(sIdx + 1),
				PszText:  utf16Ptr(txt),
			}
			procSendMessageW.Call(hPhantomLV, LVM_SETITEMW, 0, uintptr(unsafe.Pointer(&sub)))
		}

		if pf.DefaultChecked {
			setListViewItemChecked(hPhantomLV, i, true)
		}
	}

	btnAll, _, _ := procCreateWindowExW.Call(
		0, uintptr(unsafe.Pointer(utf16Ptr("BUTTON"))),
		uintptr(unsafe.Pointer(utf16Ptr("Выбрать все"))),
		WS_CHILD|WS_VISIBLE|WS_TABSTOP|BS_PUSHBUTTON,
		20, 512, 160, 42, hDlg, ID_PHANTOM_BTN_ALL, 0, 0,
	)
	setFont(btnAll, hFontBold)

	btnNone, _, _ := procCreateWindowExW.Call(
		0, uintptr(unsafe.Pointer(utf16Ptr("BUTTON"))),
		uintptr(unsafe.Pointer(utf16Ptr("Снять галочки"))),
		WS_CHILD|WS_VISIBLE|WS_TABSTOP|BS_PUSHBUTTON,
		190, 512, 160, 42, hDlg, ID_PHANTOM_BTN_NONE, 0, 0,
	)
	setFont(btnNone, hFontUI)

	btnDel, _, _ := procCreateWindowExW.Call(
		0, uintptr(unsafe.Pointer(utf16Ptr("BUTTON"))),
		uintptr(unsafe.Pointer(utf16Ptr("Спасти нужные картинки в «images» и УДАЛИТЬ выбранные папки"))),
		WS_CHILD|WS_VISIBLE|WS_TABSTOP|BS_DEFPUSHBUTTON,
		362, 512, 510, 42, hDlg, ID_PHANTOM_BTN_DELETE, 0, 0,
	)
	setFont(btnDel, hFontBold)

	btnClose, _, _ := procCreateWindowExW.Call(
		0, uintptr(unsafe.Pointer(utf16Ptr("BUTTON"))),
		uintptr(unsafe.Pointer(utf16Ptr("Закрыть"))),
		WS_CHILD|WS_VISIBLE|WS_TABSTOP|BS_PUSHBUTTON,
		884, 512, 136, 42, hDlg, ID_PHANTOM_BTN_CLOSE, 0, 0,
	)
	setFont(btnClose, hFontUI)
}

func setListViewItemChecked(hLV uintptr, index int, checked bool) {
	stateVal := uint32(1 << 12) // unchecked state image index 1
	if checked {
		stateVal = uint32(2 << 12) // checked state image index 2
	}
	lvi := LVITEMW{
		StateMask: LVIS_STATEIMAGEMASK,
		State:     stateVal,
	}
	procSendMessageW.Call(hLV, LVM_SETITEMSTATE, uintptr(index), uintptr(unsafe.Pointer(&lvi)))
}

func isListViewItemChecked(hLV uintptr, index int) bool {
	ret, _, _ := procSendMessageW.Call(hLV, LVM_GETITEMSTATE, uintptr(index), LVIS_STATEIMAGEMASK)
	return ((uint32(ret) >> 12) - 1) != 0
}

func deleteCheckedPhantomFolders(hDlg uintptr) {
	stateMu.Lock()
	list := make([]aegiscore.PhantomFolderItem, len(phantomFolders))
	copy(list, phantomFolders)
	stateMu.Unlock()

	deletedDirs := 0
	rescuedImages := 0
	var freedBytes int64

	for i, pf := range list {
		if !isListViewItemChecked(hPhantomLV, i) {
			continue
		}

		// If this phantom folder is download_images / downloaded_images / boxart, rescue any missing images into sibling "images" first!
		lower := strings.ToLower(pf.FolderName)
		if lower == "download_images" || lower == "downloaded_images" || lower == "boxart" || lower == "covers" {
			consoleDir := filepath.Dir(pf.FullPath)
			validImagesDir := filepath.Join(consoleDir, "images")
			_ = os.MkdirAll(validImagesDir, 0755)
			if entries, err := os.ReadDir(pf.FullPath); err == nil {
				for _, e := range entries {
					if e.IsDir() {
						continue
					}
					ext := strings.ToLower(filepath.Ext(e.Name()))
					if ext == ".png" || ext == ".jpg" || ext == ".jpeg" {
						dst := filepath.Join(validImagesDir, e.Name())
						if _, statErr := os.Stat(dst); statErr != nil {
							if os.Rename(filepath.Join(pf.FullPath, e.Name()), dst) == nil {
								rescuedImages++
							}
						}
					}
				}
			}
		}

		if err := os.RemoveAll(pf.FullPath); err == nil {
			deletedDirs++
			freedBytes += pf.TotalBytes
			appendLog(fmt.Sprintf("[УДАЛЕНА ФАНТОМНАЯ ПАПКА] %s (%s)", pf.RelativePath, pf.Reason))
		}
	}

	procDestroyWindow.Call(hDlg)
	hPhantomWnd = 0

	msg := fmt.Sprintf(
		"Очистка фантомных папок завершена!\n\nУдалено лишних папок: %d\nСохранено полезных картинок в верную папку «images»: %d\nОсвобождено места: %s",
		deletedDirs, rescuedImages, aegiscore.FormatBytes(freedBytes),
	)
	procMessageBoxW.Call(hMainWnd, uintptr(unsafe.Pointer(utf16Ptr(msg))), uintptr(unsafe.Pointer(utf16Ptr("Фантомные папки удалены"))), MB_OK|MB_ICONINFORMATION)
}

func phantomWndProc(hwnd uintptr, msg uint32, wParam, lParam uintptr) uintptr {
	switch msg {
	case WM_CREATE:
		createPhantomDialogControls(hwnd)
		return 0

	case WM_CTLCOLORSTATIC:
		procSetTextColor.Call(wParam, CLR_TEXT_PRIMARY)
		procSetBkColor.Call(wParam, CLR_BG_MAIN)
		return hBrushBgMain

	case WM_COMMAND:
		id := int(wParam & 0xFFFF)
		switch id {
		case ID_PHANTOM_BTN_ALL:
			stateMu.Lock()
			n := len(phantomFolders)
			stateMu.Unlock()
			for i := 0; i < n; i++ {
				setListViewItemChecked(hPhantomLV, i, true)
			}
		case ID_PHANTOM_BTN_NONE:
			stateMu.Lock()
			n := len(phantomFolders)
			stateMu.Unlock()
			for i := 0; i < n; i++ {
				setListViewItemChecked(hPhantomLV, i, false)
			}
		case ID_PHANTOM_BTN_DELETE:
			deleteCheckedPhantomFolders(hwnd)
		case ID_PHANTOM_BTN_CLOSE:
			procDestroyWindow.Call(hwnd)
			hPhantomWnd = 0
		}
		return 0

	case WM_CLOSE:
		procDestroyWindow.Call(hwnd)
		hPhantomWnd = 0
		return 0
	}

	ret, _, _ := procDefWindowProcW.Call(hwnd, uintptr(msg), wParam, lParam)
	return ret
}

// ============================================================================
// HIERARCHY BUILDER, ORPHANED MEDIA CLEANER & R36S SCRAPER
// ============================================================================

func resolveWinnerTargetDir(selectedRoot string, modeIdx uintptr, r aegiscore.RomItem) string {
	baseRoot := aegiscore.ResolveHierarchyBaseRoot(selectedRoot)
	switch modeIdx {
	case 0:
		return filepath.Join(baseRoot, "Organized", r.Generation, r.ConsoleCode)
	case 1:
		return filepath.Join(baseRoot, r.Generation, r.ConsoleCode)
	default:
		return filepath.Join(baseRoot, r.ConsoleCode)
	}
}

func startOrganize(hwnd uintptr) {
	stateMu.Lock()
	if isBusy || len(scannedRoms) == 0 {
		stateMu.Unlock()
		return
	}
	isBusy = true
	items := make([]aegiscore.RomItem, len(scannedRoms))
	copy(items, scannedRoms)
	stateMu.Unlock()

	rootFolder := strings.TrimSpace(getWindowText(hEditPath))
	modeIdx, _, _ := procSendMessageW.Call(hCmbMode, CB_GETCURSEL, 0, 0)
	delJunkCheck, _, _ := procSendMessageW.Call(hChkDelJunk, BM_GETCHECK, 0, 0)
	autoScrapeCheck, _, _ := procSendMessageW.Call(hChkAutoScrape, BM_GETCHECK, 0, 0)

	deleteDuplicatesAndJunk := delJunkCheck == BST_CHECKED
	autoScrape := autoScrapeCheck == BST_CHECKED

	procEnableWindow.Call(hBtnScan, 0)
	procEnableWindow.Call(hBtnOrganize, 0)
	procEnableWindow.Call(hBtnRename0001, 0)
	procEnableWindow.Call(hBtnScrape, 0)
	procEnableWindow.Call(hBtnCleanMedia, 0)
	procEnableWindow.Call(hBtnPhantomDirs, 0)
	procEnableWindow.Call(hBtnUndo, 0)
	procSendMessageW.Call(hProgress, PBM_SETPOS, 10, 0)

	appendLog("====================================================================")
	appendLog("Извлечение ромов из всех подкаталогов, удаление дублей и построение иерархии Поколение -> Консоль...")

	go func() {
		var undoBatch []UndoEntry
		movedCount := 0
		removedDupsCount := 0
		errorCount := 0
		baseRoot := aegiscore.ResolveHierarchyBaseRoot(rootFolder)

		// PHASE 1: Vacate all duplicates and junk first so root console files never collide with subfolder winners
		for idx := range items {
			r := &items[idx]
			if r.Status == "verified" {
				continue
			}
			if _, err := os.Stat(r.FilePath); err != nil {
				continue
			}

			if deleteDuplicatesAndJunk {
				if err := os.Remove(r.FilePath); err == nil {
					removedDupsCount++
					appendLog(fmt.Sprintf("[УДАЛЕН ДУБЛЬ] %s (%s)", r.FileName, r.SourceSubfolder))
				} else {
					errorCount++
				}
				continue
			}

			var quarantineDir string
			if r.Status == "junk_bad_dump" {
				quarantineDir = filepath.Join(baseRoot, "_BadDumps_Junk", r.ConsoleCode)
			} else {
				quarantineDir = filepath.Join(baseRoot, "_Duplicates_1G1R", r.ConsoleCode)
			}
			_ = os.MkdirAll(quarantineDir, 0755)

			targetPath := filepath.Join(quarantineDir, r.FileName)
			if strings.EqualFold(filepath.Clean(r.FilePath), filepath.Clean(targetPath)) {
				continue
			}
			if _, err := os.Stat(targetPath); err == nil {
				ext := filepath.Ext(r.FileName)
				base := strings.TrimSuffix(r.FileName, ext)
				targetPath = filepath.Join(quarantineDir, fmt.Sprintf("%s_%s%s", base, r.HeaderlessCRC32[:6], ext))
			}

			if err := os.Rename(r.FilePath, targetPath); err == nil {
				removedDupsCount++
				undoBatch = append(undoBatch, UndoEntry{FromPath: targetPath, ToPath: r.FilePath})
				r.FilePath = targetPath
				appendLog(fmt.Sprintf("[УБРАН ДУБЛЬ] %s (%s) -> _Duplicates_1G1R\\%s", r.FileName, r.SourceSubfolder, r.ConsoleCode))
			} else {
				errorCount++
			}
		}

		// PHASE 2: Move winning (1G1R) ROMs into the main console catalog in the hierarchy
		for idx := range items {
			r := &items[idx]
			if r.Status != "verified" {
				continue
			}
			if _, err := os.Stat(r.FilePath); err != nil {
				continue
			}

			targetDir := resolveWinnerTargetDir(rootFolder, modeIdx, *r)
			_ = os.MkdirAll(targetDir, 0755)
			_ = os.MkdirAll(filepath.Join(targetDir, "images"), 0755)
			_ = os.MkdirAll(filepath.Join(targetDir, "marquees"), 0755)
			_ = os.MkdirAll(filepath.Join(targetDir, "videos"), 0755)

			oldRomDir := filepath.Dir(r.FilePath)
			oldBaseNoExt := strings.TrimSuffix(r.FileName, filepath.Ext(r.FileName))

			safeCanonical := aegiscore.SanitizeFileName(r.CanonicalName)
			if strings.EqualFold(filepath.Ext(r.FileName), ".zip") && !strings.EqualFold(filepath.Ext(safeCanonical), ".zip") {
				safeCanonical = strings.TrimSuffix(safeCanonical, filepath.Ext(safeCanonical)) + ".zip"
			}

			targetPath := filepath.Join(targetDir, safeCanonical)
			newBaseNoExt := strings.TrimSuffix(safeCanonical, filepath.Ext(safeCanonical))

			aegiscore.RelocateExistingMediaForRom(oldRomDir, targetDir, oldBaseNoExt, newBaseNoExt)

			if strings.EqualFold(filepath.Clean(r.FilePath), filepath.Clean(targetPath)) {
				continue
			}

			if _, err := os.Stat(targetPath); err == nil {
				dupDir := filepath.Join(baseRoot, "_Duplicates_1G1R", r.ConsoleCode)
				_ = os.MkdirAll(dupDir, 0755)
				displacedPath := filepath.Join(dupDir, "displaced_"+filepath.Base(targetPath))
				_ = os.Rename(targetPath, displacedPath)
			}

			if err := os.Rename(r.FilePath, targetPath); err != nil {
				errorCount++
				appendLog(fmt.Sprintf("[ОШИБКА] %s -> %v", r.FileName, err))
			} else {
				movedCount++
				undoBatch = append(undoBatch, UndoEntry{FromPath: targetPath, ToPath: r.FilePath})
				aegiscore.RenameCompanionCueBin(oldRomDir, oldBaseNoExt, newBaseNoExt, r.Extension)
				r.FilePath = targetPath
				r.FileName = filepath.Base(targetPath)
				relSub, _, _ := aegiscore.AnalyzeSubfolderContext(baseRoot, targetPath)
				r.SourceSubfolder = relSub
				appendLog(fmt.Sprintf("[В ОСНОВНОЙ КАТАЛОГ] %s -> %s", r.FileName, relSub))
			}
		}

		removedDirs := aegiscore.RemoveEmptySubfolders(rootFolder)
		if removedDirs > 0 {
			appendLog(fmt.Sprintf("Очищено опустевших подкаталогов: %d", removedDirs))
		}

		stateMu.Lock()
		scannedRoms = items
		undoHistory = undoBatch
		stateMu.Unlock()

		deletedOrphans, _ := aegiscore.CleanOrphanedMedia(baseRoot)
		if deletedOrphans > 0 {
			appendLog(fmt.Sprintf("Авто-очистка медиа: удалено лишних картинок/баннеров/видео без рома: %d", deletedOrphans))
		}

		if autoScrape {
			appendLog("Автоматический запуск Скрапера R36S (ArkOS / DarkOS)...")
			stateMu.Lock()
			isBusy = false
			stateMu.Unlock()
			runScraperInternal(hwnd)
			return
		}

		procPostMessageW.Call(hwnd, WM_APP_ORGANIZE_DONE, uintptr(movedCount), uintptr(removedDupsCount))
	}()
}

func startCleanOrphanedMedia(hwnd uintptr) {
	stateMu.Lock()
	if isBusy {
		stateMu.Unlock()
		return
	}
	isBusy = true
	stateMu.Unlock()

	rootFolder := strings.TrimSpace(getWindowText(hEditPath))
	if rootFolder == "" {
		stateMu.Lock()
		isBusy = false
		stateMu.Unlock()
		return
	}

	procEnableWindow.Call(hBtnScan, 0)
	procEnableWindow.Call(hBtnOrganize, 0)
	procEnableWindow.Call(hBtnRename0001, 0)
	procEnableWindow.Call(hBtnScrape, 0)
	procEnableWindow.Call(hBtnCleanMedia, 0)
	procEnableWindow.Call(hBtnPhantomDirs, 0)
	procSendMessageW.Call(hProgress, PBM_SETPOS, 20, 0)
	procSetWindowTextW.Call(hLblStats, uintptr(unsafe.Pointer(utf16Ptr("Проверка папок images, marquees, videos и удаление лишних медиафайлов без ромов..."))))

	appendLog("====================================================================")
	appendLog("Запущено сканирование баннеров, картинок и видео по каждому рому...")

	go func() {
		baseRoot := aegiscore.ResolveHierarchyBaseRoot(rootFolder)
		deletedCount, freedBytes := aegiscore.CleanOrphanedMedia(baseRoot)
		if filepath.Clean(baseRoot) != filepath.Clean(rootFolder) {
			d2, b2 := aegiscore.CleanOrphanedMedia(rootFolder)
			deletedCount += d2
			freedBytes += b2
		}

		procPostMessageW.Call(hwnd, WM_APP_CLEAN_MEDIA_DONE, uintptr(deletedCount), uintptr(freedBytes))
	}()
}

func startScrape(hwnd uintptr) {
	stateMu.Lock()
	if isBusy || len(scannedRoms) == 0 {
		stateMu.Unlock()
		return
	}
	stateMu.Unlock()
	go runScraperInternal(hwnd)
}

func runScraperInternal(hwnd uintptr) {
	stateMu.Lock()
	if isBusy {
		stateMu.Unlock()
		return
	}
	isBusy = true
	items := make([]aegiscore.RomItem, len(scannedRoms))
	copy(items, scannedRoms)
	stateMu.Unlock()

	scrapeVidCheck, _, _ := procSendMessageW.Call(hChkScrapeVid, BM_GETCHECK, 0, 0)
	downloadVideos := scrapeVidCheck == BST_CHECKED

	procEnableWindow.Call(hBtnScan, 0)
	procEnableWindow.Call(hBtnOrganize, 0)
	procEnableWindow.Call(hBtnRename0001, 0)
	procEnableWindow.Call(hBtnScrape, 0)
	procEnableWindow.Call(hBtnCleanMedia, 0)
	procEnableWindow.Call(hBtnPhantomDirs, 0)
	procSendMessageW.Call(hProgress, PBM_SETPOS, 5, 0)
	procSetWindowTextW.Call(hLblStats, uintptr(unsafe.Pointer(utf16Ptr("Скрапинг R36S (ArkOS / DarkOS): загрузка обложек, баннеров и коротких видео (.mp4)..."))))

	appendLog("====================================================================")
	appendLog("Запущен Скрапер R36S (ArkOS / DarkOS)...")

	var winnerIndices []int
	for i, it := range items {
		if it.Status == "verified" {
			winnerIndices = append(winnerIndices, i)
		}
	}

	totalWinners := len(winnerIndices)
	if totalWinners == 0 {
		stateMu.Lock()
		isBusy = false
		stateMu.Unlock()
		procPostMessageW.Call(hwnd, WM_APP_SCRAPE_DONE, 0, 0)
		return
	}

	uniqueConsoles := make(map[string]bool)
	for _, idx := range winnerIndices {
		uniqueConsoles[items[idx].ConsoleCode] = true
	}

	for cCode := range uniqueConsoles {
		meta, ok := aegiscore.ConsoleCatalog[cCode]
		if !ok {
			continue
		}
		appendLog(fmt.Sprintf("Загрузка базы имен и баннеров Libretro для %s...", meta.DisplayName))
		_ = aegiscore.GetOrLoadLibretroIndex(meta.LibretroSystem)
		if downloadVideos && meta.ArchiveVideoID != "" {
			appendLog(fmt.Sprintf("Загрузка базы коротких видео (.mp4) R36S для %s...", meta.DisplayName))
			_ = aegiscore.GetOrLoadArchiveVideoIndex(meta.ArchiveVideoID)
		}
	}

	scrapedCount := 0
	videoCount := 0

	for pos, idx := range winnerIndices {
		r := &items[idx]
		meta, ok := aegiscore.ConsoleCatalog[r.ConsoleCode]
		if !ok {
			meta = aegiscore.ConsoleCatalog["nes"]
		}

		romDir := filepath.Dir(r.FilePath)
		imagesDir := filepath.Join(romDir, "images")
		marqueesDir := filepath.Join(romDir, "marquees")
		videosDir := filepath.Join(romDir, "videos")

		_ = os.MkdirAll(imagesDir, 0755)
		_ = os.MkdirAll(marqueesDir, 0755)
		_ = os.MkdirAll(videosDir, 0755)

		matchedLibretroName := aegiscore.FindBestLibretroMatch(meta.LibretroSystem, r.CleanTitle, r.ComparisonKey, r.Region)
		if matchedLibretroName != "" {
			cleanMatchedTitle := aegiscore.ExtractCleanTitle(matchedLibretroName)
			if cleanMatchedTitle != "" && !aegiscore.PureNumberRegex.MatchString(cleanMatchedTitle) {
				r.CleanTitle = cleanMatchedTitle
			}
		}

		romBaseNoExt := strings.TrimSuffix(r.FileName, filepath.Ext(r.FileName))

		imgTarget := filepath.Join(imagesDir, romBaseNoExt+"-image.png")
		thumbTarget := filepath.Join(imagesDir, romBaseNoExt+"-thumb.png")
		marqueeTarget := filepath.Join(marqueesDir, romBaseNoExt+"-marquee.png")
		videoTarget := filepath.Join(videosDir, romBaseNoExt+"-video.mp4")

		// Check if valid media already exists on disk for this ROM
		existingImg, existingThumb, existingMarquee, existingVid := aegiscore.ResolveExistingMediaPathsForRom(romDir, romBaseNoExt, r.CleanTitle)
		gotBoxart := existingImg != ""
		gotMarquee := existingMarquee != ""
		gotVideo := existingVid != ""

		if matchedLibretroName != "" {
			sysEsc := url.PathEscape(meta.LibretroSystem)
			fileEsc := url.PathEscape(matchedLibretroName + ".png")

			boxURL := fmt.Sprintf("https://thumbnails.libretro.com/%s/Named_Boxarts/%s", sysEsc, fileEsc)
			snapURL := fmt.Sprintf("https://thumbnails.libretro.com/%s/Named_Snaps/%s", sysEsc, fileEsc)
			titleURL := fmt.Sprintf("https://thumbnails.libretro.com/%s/Named_Titles/%s", sysEsc, fileEsc)

			if !gotBoxart && aegiscore.DownloadFileHTTP(boxURL, imgTarget, 15*time.Second) {
				gotBoxart = true
			}
			if existingThumb == "" && aegiscore.DownloadFileHTTP(snapURL, thumbTarget, 15*time.Second) {
				if !gotBoxart {
					_ = aegiscore.CopyLocalFile(thumbTarget, imgTarget)
					gotBoxart = true
				}
			} else if gotBoxart && existingThumb == "" {
				if _, err := os.Stat(imgTarget); err == nil {
					_ = aegiscore.CopyLocalFile(imgTarget, thumbTarget)
				}
			}

			if !gotMarquee && aegiscore.DownloadFileHTTP(titleURL, marqueeTarget, 15*time.Second) {
				gotMarquee = true
			}
		}

		if !gotBoxart {
			_ = aegiscore.GenerateFallbackCoverPNG(imgTarget, r.CleanTitle, strings.ToUpper(r.ConsoleCode), r.Region, 400, 400)
			_ = aegiscore.CopyLocalFile(imgTarget, thumbTarget)
			gotBoxart = true
		}
		if !gotMarquee {
			_ = aegiscore.GenerateFallbackCoverPNG(marqueeTarget, r.CleanTitle, strings.ToUpper(r.ConsoleCode), "BANNER", 400, 140)
			gotMarquee = true
		}

		if !gotVideo && downloadVideos && meta.ArchiveVideoID != "" {
			matchedVidFile := aegiscore.FindBestArchiveVideoMatch(meta.ArchiveVideoID, r.CleanTitle, r.ComparisonKey)
			if matchedVidFile != "" {
				vidURL := fmt.Sprintf("https://archive.org/download/%s/%s", meta.ArchiveVideoID, url.PathEscape(matchedVidFile))
				if aegiscore.DownloadFileHTTP(vidURL, videoTarget, 35*time.Second) {
					gotVideo = true
					videoCount++
				}
			}
		}

		if gotBoxart && gotVideo {
			r.MediaStatus = "✔ Картинка + Видео"
		} else if gotBoxart {
			r.MediaStatus = "✔ Картинка"
		}
		scrapedCount++

		appendLog(fmt.Sprintf("[СКРАПЕР R36S] %s -> %s (Видео: %v)", r.FileName, r.CleanTitle, gotVideo))

		pct := int((float64(pos+1) / float64(totalWinners)) * 95.0)
		procPostMessageW.Call(hwnd, WM_APP_PROGRESS, uintptr(pct), 0)
	}

	byDir := make(map[string][]aegiscore.RomItem)
	for _, it := range items {
		d := filepath.Dir(it.FilePath)
		byDir[d] = append(byDir[d], it)
	}

	for consoleDir, dirRoms := range byDir {
		aegiscore.WriteArkOSGamelistXML(consoleDir, dirRoms)
		appendLog(fmt.Sprintf("[GAMELIST.XML] Обновлен список игр R36S в: %s (%d игр)", consoleDir, len(dirRoms)))
	}

	stateMu.Lock()
	scannedRoms = items
	stateMu.Unlock()

	procPostMessageW.Call(hwnd, WM_APP_SCRAPE_DONE, uintptr(scrapedCount), uintptr(videoCount))
}

func executeUndo(hwnd uintptr) {
	stateMu.Lock()
	if isBusy || len(undoHistory) == 0 {
		stateMu.Unlock()
		return
	}
	isBusy = true
	batch := make([]UndoEntry, len(undoHistory))
	copy(batch, undoHistory)
	undoHistory = nil
	stateMu.Unlock()

	appendLog("--------------------------------------------------------------------")
	appendLog(fmt.Sprintf("Откат последней операции (%d файлов)...", len(batch)))

	restored := 0
	for i := len(batch) - 1; i >= 0; i-- {
		u := batch[i]
		_ = os.MkdirAll(filepath.Dir(u.ToPath), 0755)
		if err := os.Rename(u.FromPath, u.ToPath); err == nil {
			restored++
		}
	}

	rootFolder := strings.TrimSpace(getWindowText(hEditPath))
	_ = aegiscore.RemoveEmptySubfolders(rootFolder)

	stateMu.Lock()
	isBusy = false
	stateMu.Unlock()

	procEnableWindow.Call(hBtnUndo, 0)
	appendLog(fmt.Sprintf("Откат завершен. Восстановлено файлов на прежние места: %d.", restored))
	startScan(hwnd)
}

// ============================================================================
// BUTTON 7: REPAIR R36S SD CARD (EASYROMS) MOUNTING, GAMELIST.XML & IMAGES
// Fixes why SD card stopped mounting or lost gamelist.xml bindings on R36S:
// 1. Moves any ROMs & media trapped inside "Organized/<Gen>/<Console>" or "<Gen>/<Console>" back to root "<EASYROMS>/<Console>"
// 2. Restores all required ArkOS/DarkOS system & console folders (bios, tools, ports, themes, nes, gba, psx, etc.)
// 3. Rebuilds broken gamelist.xml bindings so real names (from binary PSX/GBA/SFO headers or backups) and real existing images (.png/.jpg in images/downloaded_images) are restored!
// 4. Launches chkdsk <Drive:> /f to clear the Windows exFAT/FAT32 "Dirty Volume Bit" so Linux mounts the SD card on boot!
// ============================================================================

func startRepairR36SSDCard(hwnd uintptr) {
	stateMu.Lock()
	if isBusy {
		stateMu.Unlock()
		return
	}
	isBusy = true
	stateMu.Unlock()

	rawPath := strings.TrimSpace(getWindowText(hEditPath))
	if rawPath == "" {
		stateMu.Lock()
		isBusy = false
		stateMu.Unlock()
		procMessageBoxW.Call(hwnd, uintptr(unsafe.Pointer(utf16Ptr("Укажите путь к флешке R36S (например E:\\ или E:\\psx) в верхнем поле."))), uintptr(unsafe.Pointer(utf16Ptr("Починка флешки R36S"))), MB_OK|MB_ICONWARNING)
		return
	}

	baseRoot := aegiscore.ResolveHierarchyBaseRoot(rawPath)
	lowerBase := strings.ToLower(filepath.Base(baseRoot))
	if lowerBase == "organized" || strings.HasPrefix(lowerBase, "1_8bit") || strings.HasPrefix(lowerBase, "2_16bit") || strings.HasPrefix(lowerBase, "3_portable") || strings.HasPrefix(lowerBase, "4_32_64bit") {
		baseRoot = filepath.Dir(baseRoot)
	}

	procEnableWindow.Call(hBtnScan, 0)
	procEnableWindow.Call(hBtnOrganize, 0)
	procEnableWindow.Call(hBtnRename0001, 0)
	procEnableWindow.Call(hBtnScrape, 0)
	procEnableWindow.Call(hBtnCleanMedia, 0)
	procEnableWindow.Call(hBtnPhantomDirs, 0)
	procEnableWindow.Call(hBtnRepairSD, 0)
	procSendMessageW.Call(hProgress, PBM_SETPOS, 20, 0)
	procSetWindowTextW.Call(hLblStats, uintptr(unsafe.Pointer(utf16Ptr("Восстановление привязок картинок gamelist.xml, имен PSX и структуры разделов R36S EASYROMS..."))))

	appendLog("====================================================================")
	appendLog("ЗАПУЩЕНО ВОССТАНОВЛЕНИЕ ФЛЕШКИ R36S И ПРИВЯЗОК GAMELIST.XML: " + baseRoot)

	go func() {
		restoredRoms := 0
		createdSysDirs := 0

		// 1. Check if ROMs were moved into Organized/<Generation>/<Console> or <Generation>/<Console> and move them back to <EASYROMS>/<Console>
		wrapperRoots := []string{
			filepath.Join(baseRoot, "Organized"),
			baseRoot,
		}
		for _, wRoot := range wrapperRoots {
			entries, err := os.ReadDir(wRoot)
			if err != nil {
				continue
			}
			for _, genEntry := range entries {
				if !genEntry.IsDir() {
					continue
				}
				gName := strings.ToLower(genEntry.Name())
				if !strings.HasPrefix(gName, "1_8bit") && !strings.HasPrefix(gName, "2_16bit") && !strings.HasPrefix(gName, "3_portable") && !strings.HasPrefix(gName, "4_32_64bit") {
					continue
				}
				genPath := filepath.Join(wRoot, genEntry.Name())
				conEntries, err := os.ReadDir(genPath)
				if err != nil {
					continue
				}
				for _, cEntry := range conEntries {
					if !cEntry.IsDir() {
						continue
					}
					cCode := strings.ToLower(cEntry.Name())
					srcConsoleDir := filepath.Join(genPath, cEntry.Name())
					dstConsoleDir := filepath.Join(baseRoot, cCode)
					_ = os.MkdirAll(dstConsoleDir, 0755)

					itemsInCon, _ := os.ReadDir(srcConsoleDir)
					for _, item := range itemsInCon {
						srcItemPath := filepath.Join(srcConsoleDir, item.Name())
						dstItemPath := filepath.Join(dstConsoleDir, item.Name())
						if item.IsDir() {
							_ = os.MkdirAll(dstItemPath, 0755)
							subFiles, _ := os.ReadDir(srcItemPath)
							for _, sf := range subFiles {
								_ = os.Rename(filepath.Join(srcItemPath, sf.Name()), filepath.Join(dstItemPath, sf.Name()))
							}
							_ = os.Remove(srcItemPath)
						} else {
							if os.Rename(srcItemPath, dstItemPath) == nil {
								restoredRoms++
							}
						}
					}
					_ = os.Remove(srcConsoleDir)
					appendLog(fmt.Sprintf("[ВОЗВРАТ В КОРЕНЬ EASYROMS] %s -> %s", srcConsoleDir, dstConsoleDir))
				}
				_ = os.Remove(genPath)
			}
		}
		_ = os.Remove(filepath.Join(baseRoot, "Organized"))

		// 2. Recreate all mandatory R36S (ArkOS / DarkOS / EmuELEC) system & console folders on EASYROMS
		essentialR36SFolders := []string{
			"bios", "tools", "themes", "ports", "launchimages", "bgmusic", "backup", "saves", "savestates",
			"nes", "famicom", "fds", "snes", "sfc", "gb", "gbc", "gba",
			"genesis", "megadrive", "mastersystem", "gamegear", "sega32x", "segacd",
			"psx", "psp", "nds", "n64", "dreamcast", "saturn",
			"arcade", "fbneo", "mame2003-plus", "neogeo", "cps1", "cps2", "cps3",
			"pcengine", "atari2600", "atari7800", "pico8",
		}
		for _, folderName := range essentialR36SFolders {
			dirPath := filepath.Join(baseRoot, folderName)
			if _, err := os.Stat(dirPath); err != nil {
				if os.MkdirAll(dirPath, 0755) == nil {
					createdSysDirs++
				}
			}
		}
		appendLog(fmt.Sprintf("[СТРУКТУРА R36S] Проверены и восстановлены системные и консольные папки EASYROMS (создано недостающих: %d).", createdSysDirs))

		// 3. Repair gamelist.xml and image bindings in rawPath and in console folders
		repairedBindings := 0
		if filepath.Clean(rawPath) != filepath.Clean(baseRoot) {
			n := aegiscore.RepairGamelistAndMediaBindingsInDir(rawPath)
			if n > 0 {
				repairedBindings += n
				appendLog(fmt.Sprintf("[ВОССТАНОВЛЕНЫ ПРИВЯЗКИ GAMELIST.XML И КАРТИНОК] %s (%d игр)", rawPath, n))
			}
		}
		rootEntries, _ := os.ReadDir(baseRoot)
		for _, re := range rootEntries {
			if !re.IsDir() {
				continue
			}
			cDir := filepath.Join(baseRoot, re.Name())
			if filepath.Clean(cDir) == filepath.Clean(rawPath) {
				continue
			}
			if _, isCon := aegiscore.ConsoleCatalog[strings.ToLower(re.Name())]; isCon {
				if _, err := os.Stat(filepath.Join(cDir, "gamelist.xml")); err == nil {
					n := aegiscore.RepairGamelistAndMediaBindingsInDir(cDir)
					if n > 0 {
						repairedBindings += n
						appendLog(fmt.Sprintf("[ВОССТАНОВЛЕНЫ ПРИВЯЗКИ GAMELIST.XML И КАРТИНОК] %s (%d игр)", cDir, n))
					}
				}
			}
		}
		restoredRoms += repairedBindings

		// 4. Automatically set combobox mode to #3 (Standard R36S EASYROMS) so future sorts stay in root console folders
		procSendMessageW.Call(hCmbMode, CB_SETCURSEL, 2, 0)

		procPostMessageW.Call(hwnd, WM_APP_REPAIR_SD_DONE, uintptr(restoredRoms), uintptr(createdSysDirs))
	}()
}

// Run Windows chkdsk <Drive:> /f to clear the exFAT/FAT32 "Dirty Bit" that prevents Linux (ArkOS/DarkOS) from mounting EASYROMS
func runChkdskOnDrive(hwnd uintptr, path string) {
	vol := filepath.VolumeName(path)
	if len(vol) == 2 && vol[1] == ':' && !strings.EqualFold(vol, "C:") {
		cmdArgs := fmt.Sprintf("/c echo Выполняется проверка файловой системы флешки R36S (%s) и снятие флага Dirty Bit для Linux ArkOS/DarkOS... & chkdsk %s /f & echo. & echo Готово! Теперь безопасно извлеките флешку и вставьте в приставку R36S. & pause", vol, vol)
		procShellExecuteW.Call(
			hwnd,
			uintptr(unsafe.Pointer(utf16Ptr("open"))),
			uintptr(unsafe.Pointer(utf16Ptr("cmd.exe"))),
			uintptr(unsafe.Pointer(utf16Ptr(cmdArgs))),
			0,
			SW_SHOWNORMAL,
		)
	}
}

// ============================================================================
// UNIFIED INTERACTIVE XML & DEEP HEADER MAPPING INSPECTOR (v5.0)
// Matches "000001 (World).chd" and "000001.chd" against custom XML, gamelist.xml & binary headers!
// ============================================================================

func promptSelectXmlFile(hwndOwner uintptr) string {
	fileBuf := make([]uint16, 1024)
	// UTF-16 filter with embedded NULs: "Файлы списков игр XML (*.xml, *.bak)\x00*.xml;*.bak;*.old\x00Все файлы (*.*)\x00*.*\x00\x00"
	filterStr := "Файлы списков игр XML (*.xml;*.bak)\x00*.xml;*.bak;*.old\x00Все файлы (*.*)\x00*.*\x00\x00"
	filterUTF16 := utf16.Encode([]rune(filterStr))

	rootFolder := strings.TrimSpace(getWindowText(hEditPath))
	var initDirPtr *uint16
	if rootFolder != "" {
		initDirPtr = utf16Ptr(rootFolder)
	}

	ofn := OPENFILENAMEW{
		LStructSize:     uint32(unsafe.Sizeof(OPENFILENAMEW{})),
		HwndOwner:       hwndOwner,
		LpstrFilter:     &filterUTF16[0],
		NFilterIndex:    1,
		LpstrFile:       &fileBuf[0],
		NMaxFile:        uint32(len(fileBuf)),
		LpstrInitialDir: initDirPtr,
		LpstrTitle:      utf16Ptr("Выберите файл gamelist.xml для сопоставления и переименования ромов:"),
		Flags:           OFN_FILEMUSTEXIST | OFN_PATHMUSTEXIST | OFN_NOCHANGEDIR | OFN_EXPLORER,
	}

	ret, _, _ := procGetOpenFileNameW.Call(uintptr(unsafe.Pointer(&ofn)))
	if ret != 0 {
		chosen := syscall.UTF16ToString(fileBuf)
		if chosen != "" {
			aegiscore.SetCustomXMLPath(chosen)
			appendLog("📂 Выбран пользовательский XML-файл для сопоставления: " + chosen)
			return chosen
		}
	}
	return ""
}

func populateXmlListView() {
	if hXmlLV == 0 {
		return
	}
	procSendMessageW.Call(hXmlLV, LVM_DELETEALLITEMS, 0, 0)

	stateMu.Lock()
	list := make([]aegiscore.XmlMappingCandidate, len(xmlMappingCandidates))
	copy(list, xmlMappingCandidates)
	stateMu.Unlock()

	matchedCount := 0
	for i, item := range list {
		if item.HasRomOnDisk {
			matchedCount++
		}
		lvi := LVITEMW{
			Mask:    LVIF_TEXT,
			IItem:   int32(i),
			PszText: utf16Ptr(item.OldFileName),
		}
		procSendMessageW.Call(hXmlLV, LVM_INSERTITEMW, 0, uintptr(unsafe.Pointer(&lvi)))

		subs := []string{
			item.CleanTitle,
			item.NewFileName,
			item.SourceLabel,
		}
		for sIdx, txt := range subs {
			sub := LVITEMW{
				Mask:     LVIF_TEXT,
				IItem:    int32(i),
				ISubItem: int32(sIdx + 1),
				PszText:  utf16Ptr(txt),
			}
			procSendMessageW.Call(hXmlLV, LVM_SETITEMW, 0, uintptr(unsafe.Pointer(&sub)))
		}

		if item.DefaultChecked {
			setListViewItemChecked(hXmlLV, i, true)
		}
	}

	if hXmlInfoLbl != 0 {
		xmlSrc := "Встроенная база R36S PSX (630 игр) + Заголовки дисков"
		if customXML := aegiscore.CustomXMLPath(); customXML != "" {
			xmlSrc = "Выбранный файл: " + filepath.Base(customXML)
		}
		infoTxt := fmt.Sprintf("Источник: %s | Сопоставлено с файлами в вашей папке (включая 000001 (World).chd): %d | Всего записей: %d. Без лишних приписок (World)!", xmlSrc, matchedCount, len(list))
		procSetWindowTextW.Call(hXmlInfoLbl, uintptr(unsafe.Pointer(utf16Ptr(infoTxt))))
	}
}

func openXmlInspectorDialog(hwnd uintptr) {
	rootFolder := strings.TrimSpace(getWindowText(hEditPath))
	candidates := buildXmlMappingCandidatesForFolder(rootFolder)

	stateMu.Lock()
	xmlMappingCandidates = candidates
	stateMu.Unlock()

	if hXmlWnd != 0 {
		procDestroyWindow.Call(hXmlWnd)
		hXmlWnd = 0
	}

	hInst, _, _ := procGetModuleHandleW.Call(0)
	dlgTitle := utf16Ptr("Переименование ромов по XML и заголовкам (понимает 000001 (World).chd и 000001.chd) — AegisROM v"+AEGIS_APP_VERSION+" Beta")
	hDlg, _, _ := procCreateWindowExW.Call(
		WS_EX_DLGMODALFRAME,
		uintptr(unsafe.Pointer(utf16Ptr("AegisROMXmlModalClass"))),
		uintptr(unsafe.Pointer(dlgTitle)),
		WS_POPUPWINDOW|WS_CAPTION|WS_SYSMENU|WS_VISIBLE,
		90, 60, 1180, 680,
		hwnd, 0, hInst, 0,
	)
	hXmlWnd = hDlg
	applyWin11ModernWindowFrame(hDlg)
	if hAppIcon != 0 {
		procSendMessageW.Call(hDlg, WM_SETICON, 1, hAppIcon)
		procSendMessageW.Call(hDlg, WM_SETICON, 0, hAppIcon)
	}
}

func createXmlDialogControls(hDlg uintptr) {
	btnBrowseXml, _, _ := procCreateWindowExW.Call(
		0, uintptr(unsafe.Pointer(utf16Ptr("BUTTON"))),
		uintptr(unsafe.Pointer(utf16Ptr("📂 Выбрать свой .XML файл с диска (gamelist.xml)..."))),
		WS_CHILD|WS_VISIBLE|WS_TABSTOP|BS_PUSHBUTTON,
		20, 14, 410, 38, hDlg, ID_XML_BTN_BROWSE, 0, 0,
	)
	setFont(btnBrowseXml, hFontBold)

	hXmlInfoLbl, _, _ = procCreateWindowExW.Call(
		0, uintptr(unsafe.Pointer(utf16Ptr("STATIC"))),
		uintptr(unsafe.Pointer(utf16Ptr("Загрузка сопоставлений..."))),
		WS_CHILD|WS_VISIBLE,
		444, 18, 700, 34, hDlg, 0, 0, 0,
	)
	setFont(hXmlInfoLbl, hFontBold)

	hXmlLV, _, _ = procCreateWindowExW.Call(
		WS_EX_CLIENTEDGE, uintptr(unsafe.Pointer(utf16Ptr("SysListView32"))),
		0,
		WS_CHILD|WS_VISIBLE|WS_TABSTOP|LVS_REPORT|LVS_SHOWSELALWAYS,
		20, 62, 1120, 495, hDlg, ID_XML_LV, 0, 0,
	)
	setFont(hXmlLV, hFontUI)
	applyExplorerThemeControl(hXmlLV)
	extStyle := uintptr(LVS_EX_FULLROWSELECT | LVS_EX_CHECKBOXES | LVS_EX_DOUBLEBUFFER | LVS_EX_INFOTIP | LVS_EX_LABELTIP)
	procSendMessageW.Call(hXmlLV, LVM_SETEXTENDEDLISTVIEWSTYLE, extStyle, extStyle)
	procSendMessageW.Call(hXmlLV, LVM_SETBKCOLOR, 0, CLR_BG_SURFACE)
	procSendMessageW.Call(hXmlLV, LVM_SETTEXTBKCOLOR, 0, CLR_BG_SURFACE)
	procSendMessageW.Call(hXmlLV, LVM_SETTEXTCOLOR, 0, CLR_TEXT_PRIMARY)

	cols := []struct {
		Title string
		Width int32
	}{
		{"Текущий файл на диске / в XML", 250},
		{"Реальное название игры (XML / Заголовок)", 310},
		{"Новое чистое имя файла (без World)", 320},
		{"Статус сверки с папкой", 215},
	}
	for i, c := range cols {
		lvc := LVCOLUMNW{
			Mask:     LVCF_FMT | LVCF_WIDTH | LVCF_TEXT | LVCF_SUBITEM,
			Fmt:      LVCFMT_LEFT,
			Cx:       c.Width,
			PszText:  utf16Ptr(c.Title),
			ISubItem: int32(i),
		}
		procSendMessageW.Call(hXmlLV, LVM_INSERTCOLUMNW, uintptr(i), uintptr(unsafe.Pointer(&lvc)))
	}

	populateXmlListView()

	btnMatched, _, _ := procCreateWindowExW.Call(
		0, uintptr(unsafe.Pointer(utf16Ptr("BUTTON"))),
		uintptr(unsafe.Pointer(utf16Ptr("Отметить найденные в папке"))),
		WS_CHILD|WS_VISIBLE|WS_TABSTOP|BS_PUSHBUTTON,
		20, 570, 225, 44, hDlg, ID_XML_BTN_MATCHED, 0, 0,
	)
	setFont(btnMatched, hFontBold)

	btnAll, _, _ := procCreateWindowExW.Call(
		0, uintptr(unsafe.Pointer(utf16Ptr("BUTTON"))),
		uintptr(unsafe.Pointer(utf16Ptr("Выбрать все"))),
		WS_CHILD|WS_VISIBLE|WS_TABSTOP|BS_PUSHBUTTON,
		253, 570, 130, 44, hDlg, ID_XML_BTN_ALL, 0, 0,
	)
	setFont(btnAll, hFontUI)

	btnNone, _, _ := procCreateWindowExW.Call(
		0, uintptr(unsafe.Pointer(utf16Ptr("BUTTON"))),
		uintptr(unsafe.Pointer(utf16Ptr("Снять галочки"))),
		WS_CHILD|WS_VISIBLE|WS_TABSTOP|BS_PUSHBUTTON,
		391, 570, 135, 44, hDlg, ID_XML_BTN_NONE, 0, 0,
	)
	setFont(btnNone, hFontUI)

	btnApply, _, _ := procCreateWindowExW.Call(
		0, uintptr(unsafe.Pointer(utf16Ptr("BUTTON"))),
		uintptr(unsafe.Pointer(utf16Ptr("Переименовать выбранные (Ромы + Картинки + XML)"))),
		WS_CHILD|WS_VISIBLE|WS_TABSTOP|BS_DEFPUSHBUTTON,
		536, 570, 465, 44, hDlg, ID_XML_BTN_APPLY, 0, 0,
	)
	setFont(btnApply, hFontBold)

	btnClose, _, _ := procCreateWindowExW.Call(
		0, uintptr(unsafe.Pointer(utf16Ptr("BUTTON"))),
		uintptr(unsafe.Pointer(utf16Ptr("Закрыть"))),
		WS_CHILD|WS_VISIBLE|WS_TABSTOP|BS_PUSHBUTTON,
		1010, 570, 130, 44, hDlg, ID_XML_BTN_CLOSE, 0, 0,
	)
	setFont(btnClose, hFontUI)
}

func applyCheckedXmlMappings(hDlg uintptr) {
	stateMu.Lock()
	list := make([]aegiscore.XmlMappingCandidate, len(xmlMappingCandidates))
	copy(list, xmlMappingCandidates)
	stateMu.Unlock()

	rootFolder := strings.TrimSpace(getWindowText(hEditPath))
	if rootFolder == "" {
		procMessageBoxW.Call(hDlg, uintptr(unsafe.Pointer(utf16Ptr("Сначала укажите путь к папке с ромами (например E:\\psx)."))), uintptr(unsafe.Pointer(utf16Ptr("AegisROM v"+AEGIS_APP_VERSION+" Beta"))), MB_OK|MB_ICONWARNING)
		return
	}

	atomic.StoreInt32(&cancelRequested, 0)
	var undoBatch []UndoEntry
	renamedRoms := 0

	for i, m := range list {
		if atomic.LoadInt32(&cancelRequested) != 0 {
			appendLog("⏹ Переименование по XML остановлено пользователем («СТОП»).")
			break
		}
		if !isListViewItemChecked(hXmlLV, i) {
			continue
		}

		oldBase := strings.TrimSuffix(m.OldFileName, filepath.Ext(m.OldFileName))
		coreKey := m.CoreKey
		if coreKey == "" {
			coreKey = aegiscore.ExtractCoreNumberKey(m.OldFileName)
		}
		newBase := strings.TrimSuffix(m.NewFileName, filepath.Ext(m.NewFileName))

		// Locate ROM in rootFolder, rootFolder/psx, or rootFolder/ps1:
		// Matches exact OldFileName ("000001 (World).chd"), "000001.chd", or "000001 (World)" with any PSX extension!
		var romDir string
		var srcPath string
		candidateStems := []string{oldBase}
		if coreKey != "" {
			candidateStems = append(candidateStems, coreKey, coreKey+" (World)", coreKey+" (USA)", coreKey+" (Europe)", coreKey+" (Japan)")
		}
		for _, candDir := range []string{rootFolder, filepath.Join(rootFolder, "psx"), filepath.Join(rootFolder, "ps1")} {
			exactTry := filepath.Join(candDir, m.OldFileName)
			if _, err := os.Stat(exactTry); err == nil {
				romDir = candDir
				srcPath = exactTry
				break
			}
			for _, st := range candidateStems {
				for _, ext := range []string{filepath.Ext(m.OldFileName), ".chd", ".pbp", ".cue", ".bin", ".iso", ".img"} {
					if ext == "" {
						continue
					}
					p := filepath.Join(candDir, st+ext)
					if _, err := os.Stat(p); err == nil {
						romDir = candDir
						srcPath = p
						break
					}
				}
				if srcPath != "" {
					break
				}
			}
			if srcPath != "" {
				break
			}
		}
		if srcPath == "" {
			continue
		}

		actualOldBase := strings.TrimSuffix(filepath.Base(srcPath), filepath.Ext(srcPath))
		actualExt := filepath.Ext(srcPath)
		dstPath := filepath.Join(romDir, newBase+actualExt)
		if _, err := os.Stat(dstPath); err == nil && !strings.EqualFold(srcPath, dstPath) {
			suffixKey := coreKey
			if suffixKey == "" {
				suffixKey = actualOldBase
			}
			dstPath = filepath.Join(romDir, fmt.Sprintf("%s [%s]%s", newBase, suffixKey, actualExt))
			newBase = strings.TrimSuffix(filepath.Base(dstPath), filepath.Ext(dstPath))
		}

		if err := os.Rename(srcPath, dstPath); err == nil {
			undoBatch = append(undoBatch, UndoEntry{FromPath: dstPath, ToPath: srcPath})
			_, _ = aegiscore.RenameCompanionCueBin(romDir, actualOldBase, newBase, actualExt)
			aegiscore.RelocateExistingMediaForRom(romDir, romDir, actualOldBase, newBase)
			if coreKey != "" && !strings.EqualFold(coreKey, actualOldBase) {
				aegiscore.RelocateExistingMediaForRom(romDir, romDir, coreKey, newBase)
			}
			renamedRoms++
			appendLog(fmt.Sprintf("[XML ПЕРЕИМЕНОВАНИЕ] %s  ==>  %s", filepath.Base(srcPath), filepath.Base(dstPath)))
		}
	}

	if renamedRoms > 0 {
		_ = aegiscore.RepairGamelistAndMediaBindingsInDir(rootFolder)
		stateMu.Lock()
		undoHistory = undoBatch
		stateMu.Unlock()
		procEnableWindow.Call(hBtnUndo, 1)
	}

	procDestroyWindow.Call(hDlg)
	hXmlWnd = 0

	msg := fmt.Sprintf("Переименование завершено!\n\nПереименовано ромов (включая очистку ложного тега (World), картинки в images/, -marquee.png, -thumb.png, видео и gamelist.xml): %d", renamedRoms)
	procMessageBoxW.Call(hMainWnd, uintptr(unsafe.Pointer(utf16Ptr(msg))), uintptr(unsafe.Pointer(utf16Ptr("Переименование ромов — AegisROM v"+AEGIS_APP_VERSION+" Beta"))), MB_OK|MB_ICONINFORMATION)
	startScan(hMainWnd)
}

func xmlWndProc(hwnd uintptr, msg uint32, wParam, lParam uintptr) uintptr {
	switch msg {
	case WM_CREATE:
		createXmlDialogControls(hwnd)
		return 0

	case WM_CTLCOLORSTATIC:
		procSetTextColor.Call(wParam, CLR_TEXT_PRIMARY)
		procSetBkColor.Call(wParam, CLR_BG_MAIN)
		return hBrushBgMain

	case WM_COMMAND:
		id := int(wParam & 0xFFFF)
		switch id {
		case ID_XML_BTN_BROWSE:
			if chosen := promptSelectXmlFile(hwnd); chosen != "" {
				rootFolder := strings.TrimSpace(getWindowText(hEditPath))
				cands := buildXmlMappingCandidatesForFolder(rootFolder)
				stateMu.Lock()
				xmlMappingCandidates = cands
				stateMu.Unlock()
				populateXmlListView()
			}
		case ID_XML_BTN_MATCHED:
			stateMu.Lock()
			list := make([]aegiscore.XmlMappingCandidate, len(xmlMappingCandidates))
			copy(list, xmlMappingCandidates)
			stateMu.Unlock()
			for i, item := range list {
				setListViewItemChecked(hXmlLV, i, item.HasRomOnDisk)
			}
		case ID_XML_BTN_ALL:
			stateMu.Lock()
			n := len(xmlMappingCandidates)
			stateMu.Unlock()
			for i := 0; i < n; i++ {
				setListViewItemChecked(hXmlLV, i, true)
			}
		case ID_XML_BTN_NONE:
			stateMu.Lock()
			n := len(xmlMappingCandidates)
			stateMu.Unlock()
			for i := 0; i < n; i++ {
				setListViewItemChecked(hXmlLV, i, false)
			}
		case ID_XML_BTN_APPLY:
			applyCheckedXmlMappings(hwnd)
		case ID_XML_BTN_CLOSE:
			procDestroyWindow.Call(hwnd)
			hXmlWnd = 0
		}
		return 0

	case WM_CLOSE:
		procDestroyWindow.Call(hwnd)
		hXmlWnd = 0
		return 0
	}

	ret, _, _ := procDefWindowProcW.Call(hwnd, uintptr(msg), wParam, lParam)
	return ret
}

// Immediately unlocks isBusy and re-enables all UI buttons when the user presses "⏹ СТОП"
func restoreUIControlsAfterStop() {
	stateMu.Lock()
	isBusy = false
	hasRoms := len(scannedRoms) > 0
	hasUndo := len(undoHistory) > 0
	stateMu.Unlock()

	procEnableWindow.Call(hBtnScan, 1)
	procEnableWindow.Call(hBtnRename0001, 1)
	procEnableWindow.Call(hBtnInspectXML, 1)
	procEnableWindow.Call(hBtnCleanMedia, 1)
	procEnableWindow.Call(hBtnPhantomDirs, 1)
	procEnableWindow.Call(hBtnRepairSD, 1)
	if hasRoms {
		procEnableWindow.Call(hBtnOrganize, 1)
		procEnableWindow.Call(hBtnScrape, 1)
	}
	if hasUndo {
		procEnableWindow.Call(hBtnUndo, 1)
	}
	procSendMessageW.Call(hProgress, PBM_SETPOS, 0, 0)
	procSetWindowTextW.Call(hLblStats, uintptr(unsafe.Pointer(utf16Ptr("⏹ Операция остановлена по кнопке «СТОП». Все кнопки разблокированы и готовы к работе."))))
}

func wndProc(hwnd uintptr, msg uint32, wParam, lParam uintptr) uintptr {
	switch msg {
	case WM_CREATE:
		createControls(hwnd)
		return 0

	case WM_SIZE:
		resizeControls(hwnd)
		return 0

	case WM_CTLCOLORSTATIC:
		procSetTextColor.Call(wParam, CLR_TEXT_PRIMARY)
		procSetBkColor.Call(wParam, CLR_BG_MAIN)
		return hBrushBgMain

	case WM_CTLCOLOREDIT, WM_CTLCOLORLISTBOX:
		procSetTextColor.Call(wParam, CLR_TEXT_PRIMARY)
		procSetBkColor.Call(wParam, CLR_BG_INPUT)
		return hBrushInput

	case WM_COMMAND:
		id := int(wParam & 0xFFFF)
		switch id {
		case ID_BTN_BROWSE:
			browseForFolder(hwnd)
		case ID_BTN_EXPLORER:
			openInExplorer()
		case ID_BTN_STOP:
			atomic.StoreInt32(&cancelRequested, 1)
			restoreUIControlsAfterStop()
			appendLog("⏹ НАЖАТА КНОПКА «СТОП» — процесс немедленно остановлен, все кнопки управления сразу разблокированы!")
		case ID_BTN_SCAN:
			startScan(hwnd)
		case ID_BTN_ORGANIZE:
			startOrganize(hwnd)
		case ID_BTN_RENAME_0001:
			openXmlInspectorDialog(hwnd)
		case ID_BTN_INSPECT_XML:
			if chosen := promptSelectXmlFile(hwnd); chosen != "" {
				openXmlInspectorDialog(hwnd)
			}
		case ID_BTN_SCRAPE:
			startScrape(hwnd)
		case ID_BTN_CLEAN_MEDIA:
			startCleanOrphanedMedia(hwnd)
		case ID_BTN_PHANTOM_DIRS:
			openPhantomFoldersDialog(hwnd)
		case ID_BTN_REPAIR_SD:
			startRepairR36SSDCard(hwnd)
		case ID_BTN_UNDO:
			executeUndo(hwnd)
		case ID_BTN_TAB_LIB:
			procSetWindowTextW.Call(hLblStats, uintptr(unsafe.Pointer(utf16Ptr("📚 Вкладка «1. Библиотека»: Постоянная база ромов AegisDB. Нажмите на игру — справа отображается обложка и короткое видео при наведении."))))
			appendLog("Переключена вкладка: 1. Библиотека (Мастер-база AegisDB + Инспектор игры с обложкой и видео при наведении).")
		case ID_BTN_TAB_TOOLS:
			procSetWindowTextW.Call(hLblStats, uintptr(unsafe.Pointer(utf16Ptr("🛠 Вкладка «2. Инструменты»: Переименование ромов по XML и заголовкам (вкл. 000001 (World).chd), Комбайн 1G1R, Скрапер и Починка флешки."))))
			appendLog("Переключена вкладка: 2. Инструменты (Переименование XML + Заголовки + Комбайн 1G1R).")
		case ID_BTN_TAB_BUILDS:
			procSetWindowTextW.Call(hLblStats, uintptr(unsafe.Pointer(utf16Ptr("📦 Вкладка «3. Сборки»: Подготовка готовых коллекций по фильтрам (консоль, жанр, язык RUS/ENG) для R36S, Anbernic, Miyoo, Steam Deck, PS3, Switch."))))
			appendLog("Переключена вкладка: 3. Сборки (Экспорт коллекций по профилям устройств).")
		case ID_BTN_TAB_ENV:
			procSetWindowTextW.Call(hLblStats, uintptr(unsafe.Pointer(utf16Ptr("🎮 Вкладка «4. Среда»: Каталог эмуляторов и ядер RetroArch ★ (DuckStation, PCSX2, RPCS3, Ryujinx, mGBA) с прямым запуском игр."))))
			appendLog("Переключена вкладка: 4. Среда (Каталог эмуляторов ★ и прямой запуск).")
		case ID_CMB_VIEW_MODE:
			if (wParam>>16)&0xFFFF == 1 { // CBN_SELCHANGE
				idx, _, _ := procSendMessageW.Call(hCmbViewMode, CB_GETCURSEL, 0, 0)
				extStyle := uintptr(LVS_EX_FULLROWSELECT | LVS_EX_DOUBLEBUFFER | LVS_EX_INFOTIP | LVS_EX_LABELTIP)
				if idx == 2 {
					extStyle |= LVS_EX_CHECKBOXES | LVS_EX_GRIDLINES
					appendLog("🎨 Включен Вид C (Редактор): таблица сверки с галочками, сеткой и путями Было -> Стало.")
				} else if idx == 1 {
					appendLog("🎨 Включен Вид B (Компактный): плотный список игр и дерево консолей.")
				} else {
					appendLog("🎨 Включен Вид A (Презентационный): витрина обложек + Инспектор с авто-видео при наведении.")
				}
				procSendMessageW.Call(hListView, LVM_SETEXTENDEDLISTVIEWSTYLE, 0xFFFFFFFF, extStyle)
			}
		case ID_BTN_THEME_TOGGLE:
			isDarkThemeWin = !isDarkThemeWin
			darkFlag := int32(0)
			if isDarkThemeWin {
				darkFlag = 1
				procSendMessageW.Call(hListView, LVM_SETBKCOLOR, 0, 0x0024170F)
				procSendMessageW.Call(hListView, LVM_SETTEXTBKCOLOR, 0, 0x0024170F)
				procSendMessageW.Call(hListView, LVM_SETTEXTCOLOR, 0, 0x00F9F5F1)
				appendLog("🌙 Включена Тёмная тема оформления (Dark Slate Mode).")
			} else {
				procSendMessageW.Call(hListView, LVM_SETBKCOLOR, 0, CLR_BG_SURFACE)
				procSendMessageW.Call(hListView, LVM_SETTEXTBKCOLOR, 0, CLR_BG_SURFACE)
				procSendMessageW.Call(hListView, LVM_SETTEXTCOLOR, 0, CLR_TEXT_PRIMARY)
				appendLog("☀ Включена Светлая дневная тема оформления (Light Mode).")
			}
			procDwmSetWindowAttribute.Call(hwnd, 20, uintptr(unsafe.Pointer(&darkFlag)), 4)
			procInvalidateRect.Call(hwnd, 0, 1)
			procInvalidateRect.Call(hListView, 0, 1)
		}
		return 0

	case WM_APP_PROGRESS:
		procSendMessageW.Call(hProgress, PBM_SETPOS, wParam, 0)
		return 0

	case WM_APP_SCAN_DONE:
		stateMu.Lock()
		isBusy = false
		stateMu.Unlock()
		populateListView()
		return 0

	case WM_APP_ORGANIZE_DONE:
		stateMu.Lock()
		isBusy = false
		hasUndo := len(undoHistory) > 0
		stateMu.Unlock()

		populateListView()
		if hasUndo {
			procEnableWindow.Call(hBtnUndo, 1)
		}
		msgText := fmt.Sprintf("Иерархия успешно создана!\n\nПеренесено лучших ромов в основной каталог: %d\nУбрано дублей из подкаталогов: %d", int(wParam), int(lParam))
		procMessageBoxW.Call(hwnd, uintptr(unsafe.Pointer(utf16Ptr(msgText))), uintptr(unsafe.Pointer(utf16Ptr("Готово — AegisROM v4.3"))), MB_OK|MB_ICONINFORMATION)
		return 0

	case WM_APP_RENAME_0001_DONE:
		stateMu.Lock()
		isBusy = false
		hasUndo := len(undoHistory) > 0
		stateMu.Unlock()

		populateListView()
		if hasUndo {
			procEnableWindow.Call(hBtnUndo, 1)
		}
		msgText := fmt.Sprintf("Переименование ромов с порядковыми номерами (000001, 000002... / 0001... -> Реальные названия) и восстановление привязок картинок завершено!\n\nПереименовано ромов (вместе с .cue/.bin, картинками, видео и gamelist.xml): %d\nПривязки реальных существующих картинок (.png/.jpg) сохранены и проверены.", int(wParam))
		procMessageBoxW.Call(hwnd, uintptr(unsafe.Pointer(utf16Ptr(msgText))), uintptr(unsafe.Pointer(utf16Ptr("Порядковые номера -> Реальные имена — AegisROM v4.3"))), MB_OK|MB_ICONINFORMATION)
		return 0

	case WM_APP_SCRAPE_DONE:
		stateMu.Lock()
		isBusy = false
		hasUndo := len(undoHistory) > 0
		stateMu.Unlock()

		populateListView()
		if hasUndo {
			procEnableWindow.Call(hBtnUndo, 1)
		}
		msgText := fmt.Sprintf("Скрапинг R36S (ArkOS / DarkOS) завершен!\n\nОформлено игр (имена + обложки + баннеры + gamelist.xml): %d\nСкачано коротких видео-превью (.mp4): %d", int(wParam), int(lParam))
		procMessageBoxW.Call(hwnd, uintptr(unsafe.Pointer(utf16Ptr(msgText))), uintptr(unsafe.Pointer(utf16Ptr("R36S Готово — AegisROM v4.3"))), MB_OK|MB_ICONINFORMATION)
		return 0

	case WM_APP_CLEAN_MEDIA_DONE:
		stateMu.Lock()
		isBusy = false
		stateMu.Unlock()

		procEnableWindow.Call(hBtnScan, 1)
		procEnableWindow.Call(hBtnCleanMedia, 1)
		procEnableWindow.Call(hBtnPhantomDirs, 1)
		procEnableWindow.Call(hBtnRepairSD, 1)
		if len(scannedRoms) > 0 {
			procEnableWindow.Call(hBtnOrganize, 1)
			procEnableWindow.Call(hBtnRename0001, 1)
			procEnableWindow.Call(hBtnScrape, 1)
		}
		procSendMessageW.Call(hProgress, PBM_SETPOS, 100, 0)
		summary := fmt.Sprintf("Очистка медиа завершена: удалено лишних картинок/баннеров/видео без рома: %d (освобождено %s).", int(wParam), aegiscore.FormatBytes(int64(lParam)))
		procSetWindowTextW.Call(hLblStats, uintptr(unsafe.Pointer(utf16Ptr(summary))))
		msgText := fmt.Sprintf("Проверка баннеров, картинок и видео завершена!\n\nУдалено лишних (осиротевших) медиафайлов, для которых больше нет рома: %d\nОсвобождено места: %s", int(wParam), aegiscore.FormatBytes(int64(lParam)))
		procMessageBoxW.Call(hwnd, uintptr(unsafe.Pointer(utf16Ptr(msgText))), uintptr(unsafe.Pointer(utf16Ptr("Очистка медиа R36S — AegisROM v4.3"))), MB_OK|MB_ICONINFORMATION)
		return 0

	case WM_APP_REPAIR_SD_DONE:
		stateMu.Lock()
		isBusy = false
		stateMu.Unlock()

		procEnableWindow.Call(hBtnScan, 1)
		procEnableWindow.Call(hBtnCleanMedia, 1)
		procEnableWindow.Call(hBtnPhantomDirs, 1)
		procEnableWindow.Call(hBtnRepairSD, 1)
		procSendMessageW.Call(hProgress, PBM_SETPOS, 100, 0)

		rawPath := strings.TrimSpace(getWindowText(hEditPath))
		vol := filepath.VolumeName(rawPath)
		summary := fmt.Sprintf("Флешка R36S и привязки картинок восстановлены! Обработано игр и привязок: %d | Системных папок: %d", int(wParam), int(lParam))
		procSetWindowTextW.Call(hLblStats, uintptr(unsafe.Pointer(utf16Ptr(summary))))

		msgText := fmt.Sprintf(
			"Привязки картинок gamelist.xml, имена PSX и структура флешки R36S (EASYROMS) успешно восстановлены!\n\n"+
				"• Восстановлено игр и привязок реальных картинок (.png/.jpg в images/downloaded_images) в gamelist.xml: %d\n"+
				"• Проверено обязательных системных папок ArkOS/DarkOS (bios, tools, ports, themes, gba, psx и др.): %d\n\n"+
				"Запустить сейчас проверку диска Windows (chkdsk %s /f), чтобы снять флаг ошибки монтирования (Dirty Bit) для приставки R36S?",
			int(wParam), int(lParam), vol,
		)
		ans, _, _ := procMessageBoxW.Call(
			hwnd,
			uintptr(unsafe.Pointer(utf16Ptr(msgText))),
			uintptr(unsafe.Pointer(utf16Ptr("Починка флешки и привязок R36S — AegisROM v4.3"))),
			MB_YESNO|MB_ICONQUESTION,
		)
		if ans == IDYES {
			runChkdskOnDrive(hwnd, rawPath)
		}
		startScan(hwnd)
		return 0

	case WM_DESTROY:
		procPostQuitMessage.Call(0)
		return 0
	}

	ret, _, _ := procDefWindowProcW.Call(hwnd, uintptr(msg), wParam, lParam)
	return ret
}
