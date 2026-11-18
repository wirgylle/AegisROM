//go:build windows
// +build windows

package main

import (
	"aegisgui/cmd/winsetup"
	"archive/zip"
	"bytes"
	"compress/flate"
	"crypto/md5"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"hash/crc32"
	"image"
	"image/color"
	"image/png"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
	"unicode"
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

	procRegisterClassExW        = user32.NewProc("RegisterClassExW")
	procCreateWindowExW         = user32.NewProc("CreateWindowExW")
	procDestroyWindow           = user32.NewProc("DestroyWindow")
	procDefWindowProcW          = user32.NewProc("DefWindowProcW")
	procShowWindow              = user32.NewProc("ShowWindow")
	procUpdateWindow            = user32.NewProc("UpdateWindow")
	procGetMessageW             = user32.NewProc("GetMessageW")
	procTranslateMessage        = user32.NewProc("TranslateMessage")
	procDispatchMessageW        = user32.NewProc("DispatchMessageW")
	procPostQuitMessage         = user32.NewProc("PostQuitMessage")
	procSendMessageW            = user32.NewProc("SendMessageW")
	procPostMessageW            = user32.NewProc("PostMessageW")
	procSetWindowTextW          = user32.NewProc("SetWindowTextW")
	procGetWindowTextW          = user32.NewProc("GetWindowTextW")
	procGetWindowTextLengthW    = user32.NewProc("GetWindowTextLengthW")
	procEnableWindow            = user32.NewProc("EnableWindow")
	procMessageBoxW             = user32.NewProc("MessageBoxW")
	procLoadCursorW             = user32.NewProc("LoadCursorW")
	procLoadIconW               = user32.NewProc("LoadIconW")
	procGetClientRect           = user32.NewProc("GetClientRect")
	procMoveWindow              = user32.NewProc("MoveWindow")
	procInvalidateRect          = user32.NewProc("InvalidateRect")

	procGetModuleHandleW        = kernel32.NewProc("GetModuleHandleW")

	procCreateFontW             = gdi32.NewProc("CreateFontW")
	procCreateSolidBrush        = gdi32.NewProc("CreateSolidBrush")
	procSetTextColor            = gdi32.NewProc("SetTextColor")
	procSetBkColor              = gdi32.NewProc("SetBkColor")
	procSetBkMode               = gdi32.NewProc("SetBkMode")

	procInitCommonControlsEx    = comctl32.NewProc("InitCommonControlsEx")

	procSHBrowseForFolderW      = shell32.NewProc("SHBrowseForFolderW")
	procSHGetPathFromIDListW    = shell32.NewProc("SHGetPathFromIDListW")
	procShellExecuteW           = shell32.NewProc("ShellExecuteW")

	procCoInitializeEx          = ole32.NewProc("CoInitializeEx")
	procCoTaskMemFree           = ole32.NewProc("CoTaskMemFree")

	procDwmSetWindowAttribute   = dwmapi.NewProc("DwmSetWindowAttribute")
	procSetWindowTheme          = uxtheme.NewProc("SetWindowTheme")
	procGetOpenFileNameW        = comdlg32.NewProc("GetOpenFileNameW")
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
	TTS_ALWAYSTIP       = 0x01
	TTS_NOPREFIX        = 0x02
	TTS_BALLOON         = 0x40
	TTF_IDISHWND        = 0x0001
	TTF_SUBCLASS        = 0x0010
	TTM_ACTIVATE        = WM_USER + 1
	TTM_SETDELAYTIME    = WM_USER + 3
	TTM_SETMAXTIPWIDTH  = WM_USER + 24
	TTM_ADDTOOLW        = WM_USER + 50
	TTDT_AUTOPOP        = 2
	TTDT_INITIAL        = 3

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

type ConsoleMeta struct {
	Code             string
	DisplayName      string
	GenerationFolder string
	LibretroSystem   string
	ArchiveVideoID   string
}

var consoleCatalog = map[string]ConsoleMeta{
	"nes": {
		Code:             "nes",
		DisplayName:      "Nintendo NES / Dendy",
		GenerationFolder: "1_8bit (NES, Famicom, MasterSystem, Atari)",
		LibretroSystem:   "Nintendo - Nintendo Entertainment System",
		ArchiveVideoID:   "nessnaps",
	},
	"famicom": {
		Code:             "famicom",
		DisplayName:      "Nintendo Famicom",
		GenerationFolder: "1_8bit (NES, Famicom, MasterSystem, Atari)",
		LibretroSystem:   "Nintendo - Nintendo Entertainment System",
		ArchiveVideoID:   "NintendoFamicomVideoSnaps",
	},
	"fds": {
		Code:             "fds",
		DisplayName:      "Famicom Disk System",
		GenerationFolder: "1_8bit (NES, Famicom, MasterSystem, Atari)",
		LibretroSystem:   "Nintendo - Family Computer Disk System",
		ArchiveVideoID:   "nessnaps",
	},
	"mastersystem": {
		Code:             "mastersystem",
		DisplayName:      "Sega Master System",
		GenerationFolder: "1_8bit (NES, Famicom, MasterSystem, Atari)",
		LibretroSystem:   "Sega - Master System - Mark III",
		ArchiveVideoID:   "mastersystemsnaps",
	},
	"atari2600": {
		Code:             "atari2600",
		DisplayName:      "Atari 2600",
		GenerationFolder: "1_8bit (NES, Famicom, MasterSystem, Atari)",
		LibretroSystem:   "Atari - 2600",
		ArchiveVideoID:   "atari7800snaps",
	},
	"atari7800": {
		Code:             "atari7800",
		DisplayName:      "Atari 7800",
		GenerationFolder: "1_8bit (NES, Famicom, MasterSystem, Atari)",
		LibretroSystem:   "Atari - 7800",
		ArchiveVideoID:   "atari7800snaps",
	},
	"snes": {
		Code:             "snes",
		DisplayName:      "Super Nintendo (SNES / SFC)",
		GenerationFolder: "2_16bit (SNES, MegaDrive, PCEngine, Arcade)",
		LibretroSystem:   "Nintendo - Super Nintendo Entertainment System",
		ArchiveVideoID:   "snapssnaps",
	},
	"genesis": {
		Code:             "genesis",
		DisplayName:      "Sega Mega Drive / Genesis",
		GenerationFolder: "2_16bit (SNES, MegaDrive, PCEngine, Arcade)",
		LibretroSystem:   "Sega - Mega Drive - Genesis",
		ArchiveVideoID:   "genesissnaps",
	},
	"pcengine": {
		Code:             "pcengine",
		DisplayName:      "NEC PC Engine / TurboGrafx-16",
		GenerationFolder: "2_16bit (SNES, MegaDrive, PCEngine, Arcade)",
		LibretroSystem:   "NEC - PC Engine - TurboGrafx 16",
		ArchiveVideoID:   "pcenginesnaps",
	},
	"sega32x": {
		Code:             "sega32x",
		DisplayName:      "Sega 32X",
		GenerationFolder: "2_16bit (SNES, MegaDrive, PCEngine, Arcade)",
		LibretroSystem:   "Sega - 32X",
		ArchiveVideoID:   "32xsnaps",
	},
	"arcade": {
		Code:             "arcade",
		DisplayName:      "Arcade / FBNeo / NeoGeo",
		GenerationFolder: "2_16bit (SNES, MegaDrive, PCEngine, Arcade)",
		LibretroSystem:   "FBNeo - Arcade Games",
		ArchiveVideoID:   "neogeosnaps_202302",
	},
	"gb": {
		Code:             "gb",
		DisplayName:      "Nintendo Game Boy",
		GenerationFolder: "3_Portable (GB, GBC, GBA, NDS, PSP, GameGear)",
		LibretroSystem:   "Nintendo - Game Boy",
		ArchiveVideoID:   "gbcsnaps",
	},
	"gbc": {
		Code:             "gbc",
		DisplayName:      "Nintendo Game Boy Color",
		GenerationFolder: "3_Portable (GB, GBC, GBA, NDS, PSP, GameGear)",
		LibretroSystem:   "Nintendo - Game Boy Color",
		ArchiveVideoID:   "gbcsnaps",
	},
	"gba": {
		Code:             "gba",
		DisplayName:      "Nintendo Game Boy Advance",
		GenerationFolder: "3_Portable (GB, GBC, GBA, NDS, PSP, GameGear)",
		LibretroSystem:   "Nintendo - Game Boy Advance",
		ArchiveVideoID:   "gbasnaps",
	},
	"nds": {
		Code:             "nds",
		DisplayName:      "Nintendo DS",
		GenerationFolder: "3_Portable (GB, GBC, GBA, NDS, PSP, GameGear)",
		LibretroSystem:   "Nintendo - Nintendo DS",
		ArchiveVideoID:   "gbasnaps",
	},
	"psp": {
		Code:             "psp",
		DisplayName:      "Sony PlayStation Portable (PSP)",
		GenerationFolder: "3_Portable (GB, GBC, GBA, NDS, PSP, GameGear)",
		LibretroSystem:   "Sony - PlayStation Portable",
		ArchiveVideoID:   "SonyPSPVideoSnaps",
	},
	"gamegear": {
		Code:             "gamegear",
		DisplayName:      "Sega Game Gear",
		GenerationFolder: "3_Portable (GB, GBC, GBA, NDS, PSP, GameGear)",
		LibretroSystem:   "Sega - Game Gear",
		ArchiveVideoID:   "gamegearsnaps",
	},
	"lynx": {
		Code:             "lynx",
		DisplayName:      "Atari Lynx",
		GenerationFolder: "3_Portable (GB, GBC, GBA, NDS, PSP, GameGear)",
		LibretroSystem:   "Atari - Lynx",
		ArchiveVideoID:   "atari7800snaps",
	},
	"psx": {
		Code:             "psx",
		DisplayName:      "Sony PlayStation 1",
		GenerationFolder: "4_32_64bit_3D (PlayStation 1, Nintendo 64)",
		LibretroSystem:   "Sony - PlayStation",
		ArchiveVideoID:   "SonyPlaystationVideoSnaps",
	},
	"n64": {
		Code:             "n64",
		DisplayName:      "Nintendo 64",
		GenerationFolder: "4_32_64bit_3D (PlayStation 1, Nintendo 64)",
		LibretroSystem:   "Nintendo - Nintendo 64",
		ArchiveVideoID:   "n64snaps",
	},
}

var extToDefaultConsole = map[string]string{
	".sfc": "snes", ".smc": "snes", ".fig": "snes", ".swc": "snes",
	".nes": "nes", ".unf": "nes",
	".fds": "fds",
	".md":  "genesis", ".gen": "genesis", ".smd": "genesis", ".bin": "genesis",
	".32x": "sega32x",
	".sms": "mastersystem",
	".gg":  "gamegear",
	".gba": "gba", ".agb": "gba",
	".gb":  "gb",
	".gbc": "gbc",
	".z64": "n64", ".n64": "n64", ".v64": "n64",
	".nds": "nds",
	".iso": "psx", ".cue": "psx", ".chd": "psx", ".img": "psx", ".mdf": "psx", ".pbp": "psx", ".m3u": "psx", ".ccd": "psx",
	".cso": "psp",
	".pce": "pcengine", ".sgx": "pcengine",
	".a26": "atari2600",
	".a78": "atari7800",
	".lnx": "lynx",
}

// Built-in PlayStation 1 Serial Database for instant offline recognition of numbered 000001/000002/0001 PS1 discs
var ps1SerialToTitle = map[string]string{
	// Resident Evil / Dino Crisis / Silent Hill / Survival Horror
	"SLUS00170": "Resident Evil (USA)",
	"SLUS00551": "Resident Evil - Director's Cut (USA)",
	"SLUS00747": "Resident Evil - Director's Cut DualShock (USA)",
	"SLUS00748": "Resident Evil 2 (USA) (Disc 1)",
	"SLUS00756": "Resident Evil 2 (USA) (Disc 2)",
	"SLUS00922": "Resident Evil 3 - Nemesis (USA)",
	"SLUS01045": "Resident Evil Survivor (USA)",
	"SLES00200": "Resident Evil (Europe)",
	"SLES00969": "Resident Evil - Director's Cut (Europe)",
	"SLES00972": "Resident Evil 2 (Europe) (Disc 1)",
	"SLES10972": "Resident Evil 2 (Europe) (Disc 2)",
	"SLES02529": "Resident Evil 3 - Nemesis (Europe)",
	"SLPS00222": "Biohazard (Japan)",
	"SLPS01222": "Biohazard 2 (Japan)",
	"SLPS02300": "Biohazard 3 - Last Escape (Japan)",
	"SLUS00707": "Silent Hill (USA)",
	"SLUS00776": "Silent Hill (USA)",
	"SLES01514": "Silent Hill (Europe)",
	"SLPM86192": "Silent Hill (Japan)",
	"SLUS00920": "Dino Crisis (USA)",
	"SLUS01279": "Dino Crisis 2 (USA)",
	"SLES02207": "Dino Crisis (Europe)",
	"SLES03221": "Dino Crisis 2 (Europe)",
	"SLPS02180": "Dino Crisis (Japan)",
	"SLPM86627": "Dino Crisis 2 (Japan)",
	"SLUS00662": "Parasite Eve (USA) (Disc 1)",
	"SLUS00668": "Parasite Eve (USA) (Disc 2)",
	"SLUS01042": "Parasite Eve II (USA) (Disc 1)",
	"SLUS01055": "Parasite Eve II (USA) (Disc 2)",
	"SLES02558": "Parasite Eve II (Europe) (Disc 1)",
	"SLES12558": "Parasite Eve II (Europe) (Disc 2)",
	"SLUS01201": "Alone in the Dark - The New Nightmare (USA) (Disc 1)",
	"SLUS01377": "Alone in the Dark - The New Nightmare (USA) (Disc 2)",
	"SLES02801": "Alone in the Dark - The New Nightmare (Europe)",
	"SLUS00124": "Alone in the Dark - One-Eyed Jack's Revenge (USA)",
	"SLUS00442": "Clock Tower (USA)",
	"SLUS00695": "Clock Tower II - The Struggle Within (USA)",
	"SLUS01128": "Countdown Vampires (USA)",
	"SLUS01064": "Galerians (USA)",
	"SLUS00956": "Fear Effect (USA)",
	"SLUS01266": "Fear Effect 2 - Retro Helix (USA)",
	"SLUS00654": "Nightmare Creatures (USA)",
	"SLUS01112": "Nightmare Creatures II (USA)",
	"SLUS01334": "Martian Gothic - Unification (USA)",
	"SLUS01324": "Evil Dead - Hail to the King (USA)",

	// Tekken / Mortal Kombat / Street Fighter / Fighting
	"SLUS00006": "Tekken (USA)",
	"SLUS00213": "Tekken 2 (USA)",
	"SLUS00402": "Tekken 3 (USA)",
	"SCES00005": "Tekken (Europe)",
	"SCES00255": "Tekken 2 (Europe)",
	"SCES01237": "Tekken 3 (Europe)",
	"SLPS00001": "Tekken (Japan)",
	"SLPS00300": "Tekken 2 (Japan)",
	"SLPS01300": "Tekken 3 (Japan)",
	"SLUS00079": "Mortal Kombat 3 (USA)",
	"SLUS00330": "Mortal Kombat Trilogy (USA)",
	"SLUS00605": "Mortal Kombat 4 (USA)",
	"SLUS00476": "Mortal Kombat Mythologies - Sub-Zero (USA)",
	"SLUS00824": "Mortal Kombat - Special Forces (USA)",
	"SLES00060": "Mortal Kombat 3 (Europe)",
	"SLES00529": "Mortal Kombat Trilogy (Europe)",
	"SLES01342": "Mortal Kombat 4 (Europe)",
	"SLUS00197": "Street Fighter Alpha - Warriors' Dreams (USA)",
	"SLUS00258": "Street Fighter Alpha 2 (USA)",
	"SLUS00821": "Street Fighter Alpha 3 (USA)",
	"SLUS00548": "Street Fighter EX Plus Alpha (USA)",
	"SLUS01105": "Street Fighter EX2 Plus (USA)",
	"SLUS00423": "Street Fighter Collection (USA)",
	"SLUS00800": "Marvel Super Heroes vs. Street Fighter (USA)",
	"SLUS01059": "Marvel vs. Capcom - Clash of Super Heroes (USA)",
	"SLUS00263": "Marvel Super Heroes (USA)",
	"SLUS00627": "X-Men vs. Street Fighter (USA)",
	"SLUS00047": "X-Men - Children of the Atom (USA)",
	"SLUS00786": "X-Men - Mutant Academy (USA)",
	"SLUS01382": "X-Men - Mutant Academy 2 (USA)",
	"SLUS00414": "Soul Blade (USA)",
	"SCES00577": "Soul Blade (Europe)",
	"SLUS00606": "Dead or Alive (USA)",
	"SLES01258": "Dead or Alive (Europe)",
	"SLUS00665": "Bloody Roar (USA)",
	"SCUS94424": "Bloody Roar II (USA)",
	"SLES01925": "Bloody Roar II (Europe)",
	"SLUS00694": "Rival Schools - United by Fate (USA)",
	"SLUS00765": "Bushido Blade 2 (USA)",
	"SCUS94180": "Bushido Blade (USA)",
	"SLUS00018": "Battle Arena Toshinden (USA)",
	"SLUS00220": "Battle Arena Toshinden 2 (USA)",
	"SLUS00483": "Battle Arena Toshinden 3 (USA)",
	"SLUS00733": "Guilty Gear (USA)",
	"SLUS00559": "Gundam Battle Assault (USA)",
	"SLUS01418": "Gundam Battle Assault 2 (USA)",
	"SLUS00816": "WWF Attitude (USA)",
	"SLUS00868": "WWF War Zone (USA)",
	"SLUS00927": "WWF SmackDown! (USA)",
	"SLUS01234": "WWF SmackDown! 2 - Know Your Role (USA)",
	"SLES02619": "WWF SmackDown! (Europe)",
	"SLES03252": "WWF SmackDown! 2 - Know Your Role (Europe)",
	"SLUS00914": "WCW Mayhem (USA)",
	"SLUS00718": "WCW Nitro (USA)",
	"SLUS01092": "Capcom vs. SNK Pro (USA)",
	"SLUS00682": "King of Fighters '95, The (USA)",
	"SLUS00832": "King of Fighters '99, The (USA)",
	"SLUS01153": "Dragon Ball GT - Final Bout (USA)",
	"SLUS01493": "Dragon Ball Z - Ultimate Battle 22 (USA)",
	"SLUS00711": "Ehrgeiz - God Bless the Ring (USA)",
	"SCUS94240": "Cardinal Syn (USA)",
	"SLUS00692": "Wu-Tang - Shaolin Style (USA)",
	"SLUS00789": "Thrill Kill (USA)",

	// Crash Bandicoot / Spyro / Platformers
	"SCUS94900": "Crash Bandicoot (USA)",
	"SCUS94154": "Crash Bandicoot 2 - Cortex Strikes Back (USA)",
	"SCUS94244": "Crash Bandicoot - Warped (USA)",
	"SCUS94426": "Crash Team Racing (USA)",
	"SCUS94571": "Crash Bash (USA)",
	"SCES00344": "Crash Bandicoot (Europe)",
	"SCES00967": "Crash Bandicoot 2 - Cortex Strikes Back (Europe)",
	"SCES01420": "Crash Bandicoot 3 - Warped (Europe)",
	"SCES02105": "Crash Team Racing (Europe)",
	"SCES02834": "Crash Bash (Europe)",
	"SCPS10031": "Crash Bandicoot (Japan)",
	"SCPS10047": "Crash Bandicoot 2 (Japan)",
	"SCPS10073": "Crash Bandicoot 3 (Japan)",
	"SCPS10118": "Crash Bandicoot Racing (Japan)",
	"SCUS94228": "Spyro the Dragon (USA)",
	"SCUS94425": "Spyro 2 - Ripto's Rage! (USA)",
	"SCUS94467": "Spyro - Year of the Dragon (USA)",
	"SCES01438": "Spyro the Dragon (Europe)",
	"SCES02104": "Spyro 2 - Gateway to Glimmer (Europe)",
	"SCES02835": "Spyro - Year of the Dragon (Europe)",
	"SLUS00005": "Rayman (USA)",
	"SLUS01235": "Rayman 2 - The Great Escape (USA)",
	"SLUS01265": "Rayman Brain Games (USA)",
	"SLUS01354": "Rayman Rush (USA)",
	"SLES00049": "Rayman (Europe)",
	"SLES02908": "Rayman 2 - The Great Escape (Europe)",
	"SLUS00349": "Croc - Legend of the Gobbos (USA)",
	"SLUS00634": "Croc 2 (USA)",
	"SLES00593": "Croc - Legend of the Gobbos (Europe)",
	"SLES02088": "Croc 2 (Europe)",
	"SLUS00592": "Gex - Enter the Gecko (USA)",
	"SLUS00806": "Gex 3 - Deep Cover Gecko (USA)",
	"SLUS00042": "Gex (USA)",
	"SCUS94227": "MediEvil (USA)",
	"SCUS94564": "MediEvil II (USA)",
	"SCES00311": "MediEvil (Europe)",
	"SCES02544": "MediEvil 2 (Europe)",
	"SCUS94190": "Oddworld - Abe's Oddysee (USA)",
	"SLUS00710": "Oddworld - Abe's Exoddus (USA)",
	"SLES00839": "Oddworld - Abe's Oddysee (Europe)",
	"SLES01480": "Oddworld - Abe's Exoddus (Europe)",
	"SCUS94409": "Ape Escape (USA)",
	"SCES01564": "Ape Escape (Europe)",
	"SCUS94103": "Jumping Flash! (USA)",
	"SCUS94109": "Jumping Flash! 2 (USA)",
	"SCUS94608": "Tomba! (USA)",
	"SCUS94454": "Tomba! 2 - The Evil Swine Return (USA)",
	"SLUS00530": "Klonoa - Door to Phantomile (USA)",
	"SLUS00456": "Pandemonium! (USA)",
	"SLUS00576": "Pandemonium 2 (USA)",
	"SLUS00670": "Heart of Darkness (USA)",
	"SLUS00585": "Skullmonkeys (USA)",
	"SLUS00714": "Bugs Bunny - Lost in Time (USA)",
	"SLUS01176": "Bugs Bunny & Taz - Time Busters (USA)",
	"SLUS01148": "Sheep, Dog 'n' Wolf (USA)",
	"SLUS00884": "Tarzan (USA)",
	"SLUS00611": "Hercules (USA)",
	"SLES00898": "Disney's Hercules (Europe)",
	"SLUS00991": "Toy Story 2 - Buzz Lightyear to the Rescue! (USA)",
	"SLUS01206": "Aladdin in Nasira's Revenge (USA)",
	"SLUS01156": "Emperor's New Groove, The (USA)",
	"SLUS01396": "Monsters, Inc. - Scream Team (USA)",
	"SLUS01451": "Lilo & Stitch (USA)",
	"SLUS00888": "A Bug's Life (USA)",
	"SLUS01070": "102 Dalmatians - Puppies to the Rescue (USA)",
	"SLUS00766": "Pac-Man World (USA)",
	"SLUS01061": "Mega Man X4 (USA)",
	"SLUS01213": "Mega Man X5 (USA)",
	"SLUS01395": "Mega Man X6 (USA)",
	"SLUS00561": "Mega Man X4 (USA)",
	"SLUS00451": "Mega Man 8 (USA)",
	"SLUS00603": "Mega Man Legends (USA)",
	"SLUS01140": "Mega Man Legends 2 (USA)",

	// Castlevania / Metal Gear / Action-Adventure / Stealth / Tomb Raider
	"SLUS00067": "Castlevania - Symphony of the Night (USA)",
	"SLES00524": "Castlevania - Symphony of the Night (Europe)",
	"SLPM86023": "Akumajou Dracula X - Gekka no Yasoukyoku (Japan)",
	"SLUS01384": "Castlevania Chronicles (USA)",
	"SLUS00594": "Metal Gear Solid (USA) (Disc 1)",
	"SLUS00776_2": "Metal Gear Solid (USA) (Disc 2)",
	"SLUS00957": "Metal Gear Solid - VR Missions (USA)",
	"SLES01370": "Metal Gear Solid (Europe) (Disc 1)",
	"SLES11370": "Metal Gear Solid (Europe) (Disc 2)",
	"SLPM86114": "Metal Gear Solid (Japan)",
	"SLUS00339": "Tomb Raider (USA)",
	"SLUS00437": "Tomb Raider II (USA)",
	"SLUS00691": "Tomb Raider III - Adventures of Lara Croft (USA)",
	"SLUS00885": "Tomb Raider - The Last Revelation (USA)",
	"SLUS01311": "Tomb Raider Chronicles (USA)",
	"SLES00024": "Tomb Raider (Europe)",
	"SLES00718": "Tomb Raider II (Europe)",
	"SLES01649": "Tomb Raider III (Europe)",
	"SLES02238": "Tomb Raider - The Last Revelation (Europe)",
	"SLES03331": "Tomb Raider Chronicles (Europe)",
	"SCUS94423": "Syphon Filter (USA)",
	"SCUS94451": "Syphon Filter 2 (USA) (Disc 1)",
	"SCUS94492": "Syphon Filter 2 (USA) (Disc 2)",
	"SCUS94640": "Syphon Filter 3 (USA)",
	"SCES01910": "Syphon Filter (Europe)",
	"SCES02608": "Syphon Filter 2 (Europe)",
	"SCES03697": "Syphon Filter 3 (Europe)",
	"SLUS00708": "Legacy of Kain - Soul Reaver (USA)",
	"SLES01301": "Legacy of Kain - Soul Reaver (Europe)",
	"SLUS00027": "Blood Omen - Legacy of Kain (USA)",
	"SLUS00664": "Tenchu - Stealth Assassins (USA)",
	"SLUS00706": "Tenchu - Stealth Assassins (USA)",
	"SLUS00939": "Tenchu 2 - Birth of the Stealth Assassins (USA)",
	"SLES01395": "Tenchu - Stealth Assassins (Europe)",
	"SLES02899": "Tenchu 2 - Birth of the Stealth Assassins (Europe)",
	"SLUS01115": "Spider-Man (USA)",
	"SLUS01378": "Spider-Man 2 - Enter Electro (USA)",
	"SLES02886": "Spider-Man (Europe)",
	"SLES03623": "Spider-Man 2 - Enter Electro (Europe)",
	"SLUS00453": "Fighting Force (USA)",
	"SLUS00934": "Fighting Force 2 (USA)",
	"SLES00704": "Fighting Force (Europe)",
	"SLUS01098": "Jackie Chan Stuntmaster (USA)",
	"SLES01444": "Jackie Chan Stuntmaster (Europe)",
	"SLUS00739": "Pepsiman (Japan)",
	"SLPS01762": "Pepsiman (Japan)",
	"SLUS01182": "Blade (USA)",
	"SLUS00642": "Apocalypse (USA)",
	"SCUS94555": "C-12 - Final Resistance (USA)",
	"SLUS00974": "Urban Chaos (USA)",

	// James Bond 007 (Protected against 007 loop!)
	"SLUS00975": "007 - Tomorrow Never Dies (USA)",
	"SLUS01272": "007 - The World Is Not Enough (USA)",
	"SLUS01268": "007 Racing (USA)",
	"SLES02275": "007 - Tomorrow Never Dies (Europe)",
	"SLES03134": "007 - The World Is Not Enough (Europe)",
	"SLES03249": "007 Racing (Europe)",

	// Gran Turismo / Need for Speed / Driver / Twisted Metal / Racing & Vehicular Combat
	"SCUS94194": "Gran Turismo (USA)",
	"SCUS94455": "Gran Turismo 2 (USA) (Arcade Mode)",
	"SCUS94488": "Gran Turismo 2 (USA) (Simulation Mode)",
	"SCES00984": "Gran Turismo (Europe)",
	"SCES02380": "Gran Turismo 2 (Europe)",
	"SCPS10045": "Gran Turismo (Japan)",
	"SCPS10116": "Gran Turismo 2 (Japan)",
	"SLUS00204": "Need for Speed, The (USA)",
	"SLUS00276": "Need for Speed II (USA)",
	"SLUS00619": "Need for Speed III - Hot Pursuit (USA)",
	"SLUS00826": "Need for Speed - High Stakes (USA)",
	"SLUS01104": "Need for Speed - Porsche Unleashed (USA)",
	"SLUS00590": "Need for Speed - V-Rally (USA)",
	"SLUS01003": "Need for Speed - V-Rally 2 (USA)",
	"SLES01156": "Need for Speed III - Hot Pursuit (Europe)",
	"SLES01729": "Need for Speed - Road Challenge (Europe)",
	"SLES02559": "Need for Speed - Porsche 2000 (Europe)",
	"SLUS00797": "Driver - You Are the Wheelman (USA)",
	"SLUS01161": "Driver 2 (USA) (Disc 1)",
	"SLUS01318": "Driver 2 (USA) (Disc 2)",
	"SLES01816": "Driver (Europe)",
	"SLES02993": "Driver 2 (Europe)",
	"SCUS94301": "Twisted Metal (USA)",
	"SCUS94304": "Twisted Metal 2 (USA)",
	"SCUS94249": "Twisted Metal III (USA)",
	"SCUS94560": "Twisted Metal 4 (USA)",
	"SCUS94642": "Twisted Metal - Small Brawl (USA)",
	"SCES00061": "Twisted Metal (Europe)",
	"SCES00466": "Twisted Metal 2 (Europe)",
	"SLUS00510": "Vigilante 8 (USA)",
	"SLUS01040": "Vigilante 8 - 2nd Offense (USA)",
	"SLES01215": "Vigilante 8 (Europe)",
	"SLES02165": "Vigilante 8 - 2nd Offense (Europe)",
	"SLUS00865": "Rogue Trip - Vacation 2012 (USA)",
	"SLUS00038": "Road Rash (USA)",
	"SLUS00525": "Road Rash 3D (USA)",
	"SLUS00969": "Road Rash - Jailbreak (USA)",
	"SLES00138": "Road Rash (Europe)",
	"SLES01157": "Road Rash 3D (Europe)",
	"SLUS00001": "Ridge Racer (USA)",
	"SLUS00214": "Ridge Racer Revolution (USA)",
	"SLUS00403": "Rage Racer (USA)",
	"SLUS00790": "R4 - Ridge Racer Type 4 (USA)",
	"SCES00001": "Ridge Racer (Europe)",
	"SCES01706": "Ridge Racer Type 4 (Europe)",
	"SLUS00643": "Colin McRae Rally (USA)",
	"SLUS01222": "Colin McRae Rally 2.0 (USA)",
	"SLES00477": "Colin McRae Rally (Europe)",
	"SLES02605": "Colin McRae Rally 2.0 (Europe)",
	"SCUS94903": "WipEout (USA)",
	"SCUS94351": "WipEout XL (USA)",
	"SLUS00867": "WipEout 3 (USA)",
	"SCES00010": "WipEout (Europe)",
	"SCES00327": "WipEout 2097 (Europe)",
	"SCES01909": "WipEout 3 (Europe)",
	"SLUS00757": "Test Drive 5 (USA)",
	"SLUS00948": "Test Drive 6 (USA)",
	"SLUS00918": "Sled Storm (USA)",
	"SCUS94196": "Jet Moto (USA)",
	"SCUS94167": "Jet Moto 2 (USA)",
	"SCUS94293": "Jet Moto 3 (USA)",
	"SLUS00637": "NASCAR Rumble (USA)",
	"SLUS00907": "Re-Volt (USA)",
	"SLUS01019": "Destruction Derby Raw (USA)",
	"SCUS94302": "Destruction Derby (USA)",
	"SCUS94350": "Destruction Derby 2 (USA)",
	"SLUS00760": "Carmageddon (Europe)",
	"SLES01960": "Carmageddon (Europe)",
	"SLUS01237": "Hot Wheels Turbo Racing (USA)",
	"SLUS01195": "Looney Tunes Racing (USA)",
	"SLUS01095": "Woody Woodpecker Racing (USA)",
	"SLUS00805": "South Park Rally (USA)",
	"SLUS01142": "Walt Disney World Quest - Magical Racing Tour (USA)",
	"SLUS00999": "Speed Punks (USA)",
	"SCES02546": "Speed Freaks (Europe)",
	"SLUS01381": "Smuggler's Run (USA)",
	"SLUS01391": "Italian Job, The (USA)",

	// Final Fantasy / Diablo / RPGs / Strategy
	"SCUS94163": "Final Fantasy VII (USA) (Disc 1)",
	"SCUS94164": "Final Fantasy VII (USA) (Disc 2)",
	"SCUS94165": "Final Fantasy VII (USA) (Disc 3)",
	"SLUS00892": "Final Fantasy VIII (USA) (Disc 1)",
	"SLUS00908": "Final Fantasy VIII (USA) (Disc 2)",
	"SLUS00909": "Final Fantasy VIII (USA) (Disc 3)",
	"SLUS00910": "Final Fantasy VIII (USA) (Disc 4)",
	"SLUS01251": "Final Fantasy IX (USA) (Disc 1)",
	"SLUS01295": "Final Fantasy IX (USA) (Disc 2)",
	"SLUS01296": "Final Fantasy IX (USA) (Disc 3)",
	"SLUS01297": "Final Fantasy IX (USA) (Disc 4)",
	"SCUS94221": "Final Fantasy Tactics (USA)",
	"SLUS00877": "Final Fantasy Anthology (USA)",
	"SLUS01360": "Final Fantasy Chronicles - Chrono Trigger (USA)",
	"SLUS01363": "Final Fantasy Origins (USA)",
	"SCES00867": "Final Fantasy VII (Europe)",
	"SCES02080": "Final Fantasy VIII (Europe)",
	"SLES02965": "Final Fantasy IX (Europe)",
	"SLUS01041": "Chrono Cross (USA) (Disc 1)",
	"SLUS01080": "Chrono Cross (USA) (Disc 2)",
	"SCUS94568": "Legend of Dragoon, The (USA) (Disc 1)",
	"SCUS94584": "Legend of Dragoon, The (USA) (Disc 2)",
	"SCUS94585": "Legend of Dragoon, The (USA) (Disc 3)",
	"SCUS94586": "Legend of Dragoon, The (USA) (Disc 4)",
	"SLUS00664_X": "Xenogears (USA) (Disc 1)",
	"SLUS00669": "Xenogears (USA) (Disc 2)",
	"SLUS00958": "Vagrant Story (USA)",
	"SLES02754": "Vagrant Story (Europe)",
	"SLUS00397": "Diablo (USA)",
	"SLES01159": "Diablo (Europe)",
	"SLUS00597": "Suikoden (USA)",
	"SLUS00958_S": "Suikoden II (USA)",
	"SLUS00944": "Suikoden II (USA)",
	"SLUS00422": "Breath of Fire III (USA)",
	"SLUS01324_B": "Breath of Fire IV (USA)",
	"SLUS01175": "Breath of Fire IV (USA)",
	"SCUS94192": "Wild Arms (USA)",
	"SCUS94484": "Wild Arms 2 (USA)",
	"SLUS00924": "Grandia (USA)",
	"SLUS01158": "Legend of Mana (USA)",
	"SLUS01013": "Valkyrie Profile (USA)",
	"SLUS00782": "Star Ocean - The Second Story (USA)",
	"SLUS00626": "Tales of Destiny (USA)",
	"SLUS01355": "Tales of Eternia (USA)",
	"SLUS00732": "Brave Fencer Musashi (USA)",
	"SLUS01032": "Threads of Fate (USA)",
	"SLUS01011": "Front Mission 3 (USA)",
	"SLUS01230": "Persona 2 - Eternal Punishment (USA)",
	"SCUS94254": "Alundra (USA)",
	"SLUS01017": "Alundra 2 (USA)",
	"SLUS00447": "Castlevania / Vandal Hearts (USA)",
	"SLUS00940": "Vandal Hearts II (USA)",
	"SLUS00297": "Command & Conquer - Red Alert (USA)",
	"SLUS00667": "Command & Conquer - Red Alert - Retaliation (USA)",
	"SLUS00379": "Command & Conquer (USA)",
	"SLUS00764": "Warcraft II - The Dark Saga (USA)",
	"SLUS00686": "Dune 2000 (USA)",
	"SLES01085": "Dune 2000 (Europe)",
	"SLUS00856": "Warzone 2100 (USA)",
	"SLUS00909_W": "Worms Armageddon (USA)",
	"SLUS00889": "Worms Armageddon (USA)",
	"SLUS01438": "Worms World Party (USA)",
	"SLES01990": "Worms Armageddon (Europe)",
	"SLUS00779": "Hogs of War (USA)",
	"SLES01041": "Hogs of War (Europe)",
	"SLUS00656": "KKND Krossfire (USA)",
	"SLUS00519": "Theme Hospital (USA)",
	"SLUS00988": "SimCity 2000 (USA)",
	"SLUS00845": "Yu-Gi-Oh! Forbidden Memories (USA)",
	"SLES03947": "Yu-Gi-Oh! Forbidden Memories (Europe)",
	"SLUS01036": "Digimon World (USA)",
	"SLUS01193": "Digimon World 2 (USA)",
	"SLUS01436": "Digimon World 3 (USA)",
	"SLUS01319": "Digimon Rumble Arena (USA)",
	"SLUS01118": "Monster Rancher 2 (USA)",
	"SLUS00825": "Harvest Moon - Back to Nature (USA)",

	// Medal of Honor / Quake / Doom / GTA / Shooters & Arcade Action
	"SLUS00879": "Medal of Honor (USA)",
	"SLUS01270": "Medal of Honor - Underground (USA)",
	"SLES02470": "Medal of Honor (Europe)",
	"SLES03106": "Medal of Honor - Underground (Europe)",
	"SLUS00589": "Quake II (USA)",
	"SLES01534": "Quake II (Europe)",
	"SLUS00077": "Doom (USA)",
	"SLUS00331": "Final Doom (USA)",
	"SLES00132": "Doom (Europe)",
	"SLUS00628": "Duke Nukem - Time to Kill (USA)",
	"SLUS01072": "Duke Nukem - Land of the Babes (USA)",
	"SLUS00539": "Duke Nukem - Total Meltdown (USA)",
	"SLUS00106": "Grand Theft Auto (USA)",
	"SLUS00789_G": "Grand Theft Auto 2 (USA)",
	"SLUS00784": "Grand Theft Auto 2 (USA)",
	"SLUS00846": "Grand Theft Auto - Mission Pack #1 - London 1969 (USA)",
	"SLES00032": "Grand Theft Auto (Europe)",
	"SLES01404": "Grand Theft Auto 2 (Europe)",
	"SLUS00065": "Alien Trilogy (USA)",
	"SLUS01223": "Alien Resurrection (USA)",
	"SLES02913": "Alien Resurrection (Europe)",
	"SLUS00601": "Delta Force - Urban Warfare (USA)",
	"SLUS01429": "Delta Force - Urban Warfare (USA)",
	"SLUS00912": "Rainbow Six (USA)",
	"SLUS01263": "Rainbow Six - Lone Wolf (USA)",
	"SLUS00836": "Army Men 3D (USA)",
	"SLUS00873": "Army Men - Air Attack (USA)",
	"SLUS01190": "Army Men - Air Attack 2 (USA)",
	"SLUS00976": "Army Men - Sarge's Heroes (USA)",
	"SLUS01229": "Army Men - Sarge's Heroes 2 (USA)",
	"SLUS01218": "Metal Slug X (USA)",
	"SLES02987": "Metal Slug X (Europe)",
	"SLPS00950": "Metal Slug (Japan)",
	"SLUS00317": "Contra - Legacy of War (USA)",
	"SLUS01336": "C - The Contra Adventure (USA)",
	"SLUS00593": "Einhander (USA)",
	"SLUS00887": "R-Type Delta (USA)",
	"SLUS00650": "G-Darius (USA)",
	"SLUS00517": "Time Crisis (USA)",
	"SLUS01264": "Time Crisis - Project Titan (USA)",
	"SLUS00657": "Point Blank (USA)",
	"SLUS00488": "MDK (USA)",
	"SLUS00527": "Future Cop - L.A.P.D. (USA)",
	"SLUS00745": "Silent Bomber (USA)",
	"SLUS00674": "Omega Boost (USA)",
	"SCUS94448": "Omega Boost (USA)",
	"SLUS00435": "Nuclear Strike (USA)",
	"SLUS00284": "Soviet Strike (USA)",
	"SLUS00450": "Ace Combat 2 (USA)",
	"SLUS00972": "Ace Combat 3 - Electrosphere (USA)",

	// Tony Hawk / Sports / Extreme Sports
	"SLUS00861": "Tony Hawk's Pro Skater (USA)",
	"SLUS01066": "Tony Hawk's Pro Skater 2 (USA)",
	"SLUS01419": "Tony Hawk's Pro Skater 3 (USA)",
	"SLUS01485": "Tony Hawk's Pro Skater 4 (USA)",
	"SLES02055": "Tony Hawk's Skateboarding (Europe)",
	"SLES02908_T": "Tony Hawk's Pro Skater 2 (Europe)",
	"SLES02909": "Tony Hawk's Pro Skater 2 (Europe)",
	"SLES03645": "Tony Hawk's Pro Skater 3 (Europe)",
	"SLUS01134": "Matt Hoffman's Pro BMX (USA)",
	"SLUS01122": "Dave Mirra Freestyle BMX (USA)",
	"SLUS00426": "Cool Boarders 2 (USA)",
	"SLUS00698": "Cool Boarders 3 (USA)",
	"SLUS00989": "Cool Boarders 4 (USA)",
	"SCUS94356": "Cool Boarders (USA)",
	"SLUS01012": " Grind Session (USA)",
	"SLUS01053": "ISS Pro Evolution (USA)",
	"SLES02095": "ISS Pro Evolution (Europe)",
	"SLES03321": "ISS Pro Evolution 2 (Europe)",
	"SLPM86538": "World Soccer Jikkyou Winning Eleven 4 (Japan)",
	"SLPM87056": "World Soccer Winning Eleven 2002 (Japan)",
	"SLUS00964": "FIFA 2000 (USA)",
	"SLUS01262": "FIFA 2001 (USA)",
	"SLUS01408": "FIFA Soccer 2002 (USA)",
	"SLUS01504": "FIFA Soccer 2003 (USA)",
	"SLUS01549": "FIFA Soccer 2004 (USA)",
	"SLUS01585": "FIFA Soccer 2005 (USA)",
	"SLUS00919": "NBA Live 2000 (USA)",
	"SLUS01271": "NBA Live 2001 (USA)",
	"SLUS01416": "NBA Live 2002 (USA)",
	"SLUS01494": "NBA Live 2003 (USA)",
	"SLUS00965": "NHL 2000 (USA)",
	"SLUS01261": "NHL 2001 (USA)",
	"SLUS01071": "Knockout Kings 2000 (USA)",
	"SLUS01269": "Knockout Kings 2001 (USA)",
}

type RomItem struct {
	FilePath         string
	SourceSubfolder  string
	FileName         string
	ExtractedTitle   string // Real title extracted from inside ROM binary or gamelist.xml
	CleanTitle       string
	ComparisonKey    string
	CanonicalName    string
	Extension        string
	ConsoleCode      string
	Generation       string
	FileSize         int64
	CRC32            string
	HeaderlessCRC32  string
	MD5              string
	Region           string
	IsRussian        bool
	IsFromTopFolder  bool
	IsNumberedFile   bool // e.g., 000001.pbp, 000002.chd, 0001.bin
	Revision         string
	Status           string // "verified", "duplicate_clone", "junk_bad_dump"
	Is1G1RWinner     bool
	Reason           string
	MediaStatus      string
}

type PhantomFolderItem struct {
	FullPath       string
	RelativePath   string
	FolderName     string
	Reason         string
	FileCount      int
	TotalBytes     int64
	HasUsefulMedia bool
	DefaultChecked bool
}

type UndoEntry struct {
	FromPath string
	ToPath   string
}

type GameListXML struct {
	XMLName xml.Name       `xml:"gameList"`
	Games   []GameEntryXML `xml:"game"`
}

type GameEntryXML struct {
	Path        string `xml:"path"`
	Name        string `xml:"name"`
	Desc        string `xml:"desc"`
	Image       string `xml:"image,omitempty"`
	Thumbnail   string `xml:"thumbnail,omitempty"`
	Marquee     string `xml:"marquee,omitempty"`
	Video       string `xml:"video,omitempty"`
	Rating      string `xml:"rating,omitempty"`
	ReleaseDate string `xml:"releasedate,omitempty"`
	Developer   string `xml:"developer,omitempty"`
	Publisher   string `xml:"publisher,omitempty"`
	Genre       string `xml:"genre,omitempty"`
	Region      string `xml:"region,omitempty"`
}

var (
	regionRegex       = regexp.MustCompile(`(?i)\((USA|Europe|Japan|World|Russia|Rus|Ru|Germany|France|Spain|Italy|Australia|Asia|Korea|Brazil|China|En,Fr,De|En,Ja|U|E|J|W|UE|JU)\)`)
	rusTagRegex       = regexp.MustCompile(`(?i)(\[rus\]|\(rus\)|\(ru\)|\[r-rus\]|\[russian\]|\(russian\)|_rus\b|\.rus\b|\brus\b|рус)`)
	revisionRegex     = regexp.MustCompile(`(?i)\((Rev\s*[0-9A-Z]+|v[0-9]+\.[0-9]+|Alt\s*[0-9]*)\)`)
	junkRegex         = regexp.MustCompile(`(?i)\[(b[0-9]*|h[0-9]*|t[0-9]*|p[0-9]*|o[0-9]*)\]|\((Pirate|Bootleg|Corrupt|Bad)\)`)
	tagStripRegex     = regexp.MustCompile(`\[.*?\]|\(.*?\)`)
	leadingNumRegex   = regexp.MustCompile(`^[\s\[\(#]*0*(\d{1,10})[\s\])\._-]+`)
	pureNumberRegex   = regexp.MustCompile(`^(?:game[_-]?|rom[_-]?|track[_-]?|psx[_-]?|ps1[_-]?)?0*(\d{1,10})(?:[_-]?[1-4a-d])?$`)
	seqPrefixNumRegex = regexp.MustCompile(`^[\s\[\(#]*0*(\d{1,10})(?:[\s\])\._-]+|$)`)
	ps1SerialRegex    = regexp.MustCompile(`(?i)(SLUS|SCUS|SLES|SCES|SLPS|SCPS|SLPM|SIPS|ESPM|PAPX|PBPX|SCPM|LSP)[_\-\s\.]*(\d{3})[\.\_\-]?(\d{2})`)
	hrefPngRegex      = regexp.MustCompile(`href="([^"]+\.png)"`)
	xmlGameBlockRegex = regexp.MustCompile(`(?is)<game\b[^>]*>(.*?)</game>`)
)

type XmlMappingCandidate struct {
	OldFileName    string
	CoreKey        string
	CleanTitle     string
	NewFileName    string
	HasRomOnDisk   bool
	HasImage       bool
	HasVideo       bool
	DefaultChecked bool
	SourceLabel    string
}

// Global UI & App State
var (
	hMainWnd              uintptr
	hPhantomWnd           uintptr
	hPhantomLV            uintptr
	hXmlWnd               uintptr
	hXmlLV                uintptr
	hXmlInfoLbl           uintptr
	selectedCustomXmlPath string
	hAppIcon              uintptr
	hTooltip              uintptr
	tooltipStrings        []*uint16

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
	scannedRoms          []RomItem
	phantomFolders       []PhantomFolderItem
	xmlMappingCandidates []XmlMappingCandidate
	undoHistory          []UndoEntry
	isBusy               bool
	cancelRequested      int32
	logHistory           []string

	// Cache gamelist.xml mappings per folder (dirPath -> map[lowercaseFileName]GameTitle)
	gamelistTitleCache = make(map[string]map[string]string)
	// Cache full gamelist.xml entries per folder (dirPath -> map[lowercaseKey]GameEntryXML)
	gamelistEntryCache = make(map[string]map[string]GameEntryXML)
	// Cache detected sequential numbers per folder (dirPath -> map[lowercaseFileName]bool)
	seqNumberedDirCache = make(map[string]map[string]bool)
	libretroIndexCache  = make(map[string][]libretroEntry)
	archiveVideoCache   = make(map[string][]archiveVideoEntry)
	cacheMu             sync.Mutex
)

type libretroEntry struct {
	FileName string
	NormKey  string
	Tokens   map[string]bool
}

type archiveVideoEntry struct {
	FileName string
	NormKey  string
	Tokens   map[string]bool
}

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

func formatBytes(b int64) string {
	if b < 1024 {
		return fmt.Sprintf("%d Б", b)
	}
	if b < 1024*1024 {
		return fmt.Sprintf("%.1f КБ", float64(b)/1024.0)
	}
	return fmt.Sprintf("%.2f МБ", float64(b)/(1024.0*1024.0))
}

// Strip Windows Mark-of-the-Web (Zone.Identifier) on self so SmartScreen never warns on subsequent launches
func stripSelfZoneIdentifier() {
	exePath, err := os.Executable()
	if err == nil && exePath != "" {
		_ = os.Remove(exePath + ":Zone.Identifier")
	}
}

func main() {
	runtime.LockOSThread()
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

	// By default, launch the modern React 19 + Tailwind CSS v0.5.4 Beta Desktop App Window (1-to-1 identical to the AI Studio preview!)
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

	title := utf16Ptr("AegisROM v0.5.4 (Beta) — Инструменты (Переименование XML + Заголовки, Комбайн 1G1R, Скрапер и Ремонт флешки R36S)")
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

	appendLog("AegisROM v0.5.4 (Beta) готов к работе. Все инструменты переименования объединены в кнопку «3. Переименование ромов (XML + Заголовки)».")
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
// REAL ROM INTERNAL HEADER & GAMELIST.XML TITLE EXTRACTOR (000001 / 0001 -> Real Name)
// ============================================================================

func decodeXMLEntities(s string) string {
	s = strings.ReplaceAll(s, "&amp;", "&")
	s = strings.ReplaceAll(s, "&apos;", "'")
	s = strings.ReplaceAll(s, "&#39;", "'")
	s = strings.ReplaceAll(s, "&quot;", "\"")
	s = strings.ReplaceAll(s, "&lt;", "<")
	s = strings.ReplaceAll(s, "&gt;", ">")
	return strings.TrimSpace(s)
}

func extractXMLTagValue(block, tag string) string {
	openTag := "<" + strings.ToLower(tag) + ">"
	closeTag := "</" + strings.ToLower(tag) + ">"
	lowerBlock := strings.ToLower(block)
	startIdx := strings.Index(lowerBlock, openTag)
	if startIdx == -1 {
		return ""
	}
	valStart := startIdx + len(openTag)
	endIdx := strings.Index(lowerBlock[valStart:], closeTag)
	if endIdx == -1 {
		return ""
	}
	return decodeXMLEntities(block[valStart : valStart+endIdx])
}

func isPureNumberOrGenericTitle(s string) bool {
	trimmed := strings.TrimSpace(s)
	if trimmed == "" {
		return true
	}
	noTags := strings.TrimSpace(tagStripRegex.ReplaceAllString(trimmed, ""))
	lower := strings.ToLower(noTags)
	if lower == "007" {
		return false
	}
	if pureNumberRegex.MatchString(lower) {
		return true
	}
	switch lower {
	case "playstation", "psx", "ps1", "cd-rom", "cdrom", "game", "rom", "untitled", "unknown", "new", "track", "track01", "data":
		return true
	}
	return false
}

func normalizePS1Serial(raw string) string {
	m := ps1SerialRegex.FindStringSubmatch(raw)
	if len(m) == 4 {
		return strings.ToUpper(m[1] + m[2] + m[3])
	}
	return ""
}

// Fault-tolerant gamelist.xml parser that NEVER fails on unescaped '&' or malformed XML in factory R36S cards,
// checks backup files (gamelist_factory_backup.xml, gamelist.xml.bak, etc.), and auto-creates a factory backup!
func loadGamelistMapsForDir(dir string) (map[string]string, map[string]GameEntryXML) {
	cacheMu.Lock()
	titleMap, tLoaded := gamelistTitleCache[dir]
	entryMap, eLoaded := gamelistEntryCache[dir]
	cacheMu.Unlock()

	if tLoaded && eLoaded {
		return titleMap, entryMap
	}

	titleMap = make(map[string]string)
	entryMap = make(map[string]GameEntryXML)

	// Candidate gamelist files in priority order (check factory backups first so if gamelist.xml was overwritten with 000001, backups win!)
	candidateFiles := []string{
		filepath.Join(dir, "gamelist_factory_backup.xml"),
		filepath.Join(dir, "gamelist.xml.bak"),
		filepath.Join(dir, "gamelist.bak"),
		filepath.Join(dir, "gamelist_backup.xml"),
		filepath.Join(dir, "gamelist.old"),
		filepath.Join(dir, "gamelist.xml"),
	}
	// Also check parent directory if ROMs are inside a subfolder of a console folder
	parentDir := filepath.Dir(dir)
	if parentDir != dir {
		candidateFiles = append(candidateFiles,
			filepath.Join(parentDir, "gamelist_factory_backup.xml"),
			filepath.Join(parentDir, "gamelist.xml.bak"),
			filepath.Join(parentDir, "gamelist.xml"),
		)
	}

	realNamesFoundInPrimary := 0
	primaryGlPath := filepath.Join(dir, "gamelist.xml")
	backupGlPath := filepath.Join(dir, "gamelist_factory_backup.xml")

	for _, glPath := range candidateFiles {
		data, err := os.ReadFile(glPath)
		if err != nil || len(data) == 0 {
			continue
		}
		blocks := xmlGameBlockRegex.FindAllStringSubmatch(string(data), -1)
		for _, b := range blocks {
			if len(b) < 2 {
				continue
			}
			body := b[1]
			rawPath := extractXMLTagValue(body, "path")
			rawName := extractXMLTagValue(body, "name")
			if rawPath == "" {
				continue
			}

			cleanP := strings.ToLower(filepath.Base(strings.ReplaceAll(rawPath, "\\", "/")))
			noExt := strings.TrimSuffix(cleanP, filepath.Ext(cleanP))

			entry := GameEntryXML{
				Path:        rawPath,
				Name:        rawName,
				Desc:        extractXMLTagValue(body, "desc"),
				Image:       extractXMLTagValue(body, "image"),
				Thumbnail:   extractXMLTagValue(body, "thumbnail"),
				Marquee:     extractXMLTagValue(body, "marquee"),
				Video:       extractXMLTagValue(body, "video"),
				Rating:      extractXMLTagValue(body, "rating"),
				ReleaseDate: extractXMLTagValue(body, "releasedate"),
				Developer:   extractXMLTagValue(body, "developer"),
				Publisher:   extractXMLTagValue(body, "publisher"),
				Genre:       extractXMLTagValue(body, "genre"),
				Region:      extractXMLTagValue(body, "region"),
			}

			if _, exists := entryMap[cleanP]; !exists {
				entryMap[cleanP] = entry
			}
			if _, exists := entryMap[noExt]; !exists {
				entryMap[noExt] = entry
			}
			coreK := extractCoreNumberKey(cleanP)
			if coreK != "" {
				if _, exists := entryMap[coreK]; !exists {
					entryMap[coreK] = entry
				}
			}

			// Strip leading index numbers from gamelist <name> like "000001. Tekken 3", EXCEPT 007 James Bond games!
			cleanN := stripLeadingIndexExcept007(strings.TrimSpace(rawName))
			// Only accept cleanN as a real title if it is NOT a pure number like "000001"!
			if cleanP != "" && cleanN != "" && !isPureNumberOrGenericTitle(cleanN) {
				if _, exists := titleMap[cleanP]; !exists {
					titleMap[cleanP] = cleanN
				}
				if _, exists := titleMap[noExt]; !exists {
					titleMap[noExt] = cleanN
				}
				if coreK != "" {
					if _, exists := titleMap[coreK]; !exists {
						titleMap[coreK] = cleanN
					}
				}
				if strings.EqualFold(glPath, primaryGlPath) {
					realNamesFoundInPrimary++
				}
			}
		}
	}

	// If primary gamelist.xml has real factory titles and we haven't backed it up yet, save gamelist_factory_backup.xml!
	if realNamesFoundInPrimary > 0 {
		if _, err := os.Stat(backupGlPath); err != nil {
			if origBytes, rErr := os.ReadFile(primaryGlPath); rErr == nil {
				_ = os.WriteFile(backupGlPath, origBytes, 0644)
			}
		}
	}

	cacheMu.Lock()
	gamelistTitleCache[dir] = titleMap
	gamelistEntryCache[dir] = entryMap
	cacheMu.Unlock()

	return titleMap, entryMap
}

// Extracts normalized numeric key from filenames like "000001 (World).chd" -> "000001", "1 (USA).pbp" -> "000001"
func extractCoreNumberKey(fileNameOrStem string) string {
	base := strings.TrimSpace(strings.TrimSuffix(filepath.Base(fileNameOrStem), filepath.Ext(fileNameOrStem)))
	noTags := strings.TrimSpace(tagStripRegex.ReplaceAllString(base, ""))
	lower := strings.ToLower(noTags)
	if pm := pureNumberRegex.FindStringSubmatch(lower); len(pm) >= 2 {
		if n, err := strconv.Atoi(pm[1]); err == nil && n >= 0 && n <= 999999 {
			return fmt.Sprintf("%06d", n)
		}
		return lower
	}
	return lower
}

func getGamelistTitleForFile(romPath string) string {
	dir := filepath.Dir(romPath)
	fileNameLower := strings.ToLower(filepath.Base(romPath))
	baseNoExtLower := strings.ToLower(strings.TrimSuffix(filepath.Base(romPath), filepath.Ext(romPath)))
	coreKey := extractCoreNumberKey(romPath)

	// If user selected a custom XML file, check it first!
	if selectedCustomXmlPath != "" {
		customTMap, _ := parseSingleXmlFileMaps(selectedCustomXmlPath)
		if title, ok := customTMap[fileNameLower]; ok && title != "" && !isPureNumberOrGenericTitle(title) {
			return title
		}
		if title, ok := customTMap[baseNoExtLower]; ok && title != "" && !isPureNumberOrGenericTitle(title) {
			return title
		}
		if coreKey != "" {
			if title, ok := customTMap[coreKey]; ok && title != "" && !isPureNumberOrGenericTitle(title) {
				return title
			}
		}
	}

	titleMap, _ := loadGamelistMapsForDir(dir)

	if title, ok := titleMap[fileNameLower]; ok && title != "" && !isPureNumberOrGenericTitle(title) {
		return title
	}
	if title, ok := titleMap[baseNoExtLower]; ok && title != "" && !isPureNumberOrGenericTitle(title) {
		return title
	}
	if coreKey != "" {
		if title, ok := titleMap[coreKey]; ok && title != "" && !isPureNumberOrGenericTitle(title) {
			return title
		}
	}
	// Fallback to embedded R36S factory gamelist.xml map (630 numbered PSX games 000001..000634)
	if factoryTitle, ok := factoryR36sNumberMap[baseNoExtLower]; ok && factoryTitle != "" {
		return factoryTitle
	}
	if coreKey != "" {
		if factoryTitle, ok := factoryR36sNumberMap[coreKey]; ok && factoryTitle != "" {
			return factoryTitle
		}
	}
	return ""
}

// Extract real internal game title directly from binary ROM headers:
// Supports PS1/PSP .PBP (PARAM.SFO + PSISOIMG), PS1 .CHD (deflate hunk decompression),
// PS1 .BIN/.ISO/.IMG/.MDF/.CUE/.M3U (ISO9660 Root Directory LBA + SYSTEM.CNF + 350+ Serial DB + PS1 Memory Card Save Header),
// GBA (0xA0), GB/GBC (0x134), SNES (0x7FC0/0xFFC0), Genesis (0x150), N64 (0x20), NDS (0x68 UTF-16 Banner).
func extractInternalBinaryRomTitle(romPath, ext, consoleCode string) string {
	f, err := os.Open(romPath)
	if err != nil {
		return ""
	}
	defer f.Close()

	// 1. Check PS1 / PSP EBOOT.PBP (PARAM.SFO header + PSISOIMG0000 TOC/DiscID)
	if ext == ".pbp" {
		hdr := make([]byte, 0x28)
		if _, err := io.ReadFull(f, hdr); err == nil && string(hdr[0:4]) == "\x00PBP" {
			sfoOffset := binary.LittleEndian.Uint32(hdr[0x08:0x0C])
			dataOffset := binary.LittleEndian.Uint32(hdr[0x0C:0x10])
			psarOffset := binary.LittleEndian.Uint32(hdr[0x24:0x28])

			var sfoTitle, sfoDiscID string
			if sfoOffset > 0 && dataOffset > sfoOffset && (dataOffset-sfoOffset) < 65536 {
				sfoBuf := make([]byte, dataOffset-sfoOffset)
				if _, err := f.ReadAt(sfoBuf, int64(sfoOffset)); err == nil {
					sfoTitle, sfoDiscID = parseParamSFO(sfoBuf)
				}
			}

			// Check if DISC_ID or PSAR header maps to a known PS1 game
			serialKey := normalizePS1Serial(sfoDiscID)
			if serialKey == "" {
				serialKey = normalizePS1Serial(sfoTitle)
			}
			if serialKey == "" && psarOffset > 0 {
				psarBuf := make([]byte, 2048)
				if n, _ := f.ReadAt(psarBuf, int64(psarOffset)); n > 0 {
					if m := ps1SerialRegex.FindSubmatch(psarBuf[:n]); len(m) == 4 {
						serialKey = strings.ToUpper(string(m[1]) + string(m[2]) + string(m[3]))
					}
				}
			}

			if serialKey != "" {
				if mapped, ok := ps1SerialToTitle[serialKey]; ok {
					return mapped
				}
			}

			// If PARAM.SFO TITLE is a real game title (NOT a number like "000001" and NOT a raw serial), use it!
			if sfoTitle != "" && !isPureNumberOrGenericTitle(sfoTitle) && normalizePS1Serial(sfoTitle) == "" {
				cleaned := cleanInternalHeaderString(sfoTitle)
				if len(cleaned) >= 3 && !isPureNumberOrGenericTitle(cleaned) {
					return cleaned
				}
			}

			// Scan first 1 MB of PSAR stream inside PBP for PS1 Serial or Memory Card Title
			if psarOffset > 0 {
				psarScan := make([]byte, 1024*1024)
				if n, _ := f.ReadAt(psarScan, int64(psarOffset)); n > 0 {
					if t := extractPS1TitleFromRawBytes(psarScan[:n]); t != "" {
						return t
					}
				}
			}
		}
	}

	// 2. Check PlayStation 1 (.chd, .bin, .iso, .img, .mdf, .cue, .m3u, .ccd)
	if consoleCode == "psx" || ext == ".iso" || ext == ".bin" || ext == ".img" || ext == ".mdf" || ext == ".chd" || ext == ".cue" || ext == ".m3u" || ext == ".ccd" {
		if ext == ".chd" {
			if chdTitle := extractPS1TitleFromCHD(f); chdTitle != "" {
				return chdTitle
			}
		}

		targetFile := f
		if ext == ".cue" || ext == ".m3u" || ext == ".ccd" {
			textBytes, _ := os.ReadFile(romPath)
			textStr := string(textBytes)
			// Check if .cue or .m3u contains a PS1 serial or a real filename inside FILE "..."
			if m := ps1SerialRegex.FindStringSubmatch(textStr); len(m) == 4 {
				serialKey := strings.ToUpper(m[1] + m[2] + m[3])
				if knownTitle, ok := ps1SerialToTitle[serialKey]; ok {
					return knownTitle
				}
			}
			// Find companion .bin / .img / .iso / .chd / .pbp in the same directory
			romDir := filepath.Dir(romPath)
			baseNoExt := strings.TrimSuffix(filepath.Base(romPath), filepath.Ext(romPath))
			for _, compExt := range []string{".bin", ".BIN", ".img", ".IMG", ".iso", ".ISO", ".chd", ".CHD", ".pbp", ".PBP"} {
				compPath := filepath.Join(romDir, baseNoExt+compExt)
				if bf, err := os.Open(compPath); err == nil {
					defer bf.Close()
					if strings.EqualFold(compExt, ".chd") {
						if chdTitle := extractPS1TitleFromCHD(bf); chdTitle != "" {
							return chdTitle
						}
					}
					targetFile = bf
					break
				}
			}
		}

		if discTitle := extractPS1TitleFromDiscFile(targetFile); discTitle != "" {
			return discTitle
		}

		// Fallback: check if any existing image/video in images/ or videos/ starts with this number and has a title attached
		if mediaTitle := extractTitleFromCompanionMediaFile(romPath); mediaTitle != "" {
			return mediaTitle
		}
	}

	// 3. Game Boy Advance (.gba) -> offset 0xA0 (12 bytes ASCII)
	if ext == ".gba" || consoleCode == "gba" {
		buf := make([]byte, 16)
		if _, err := f.ReadAt(buf, 0xA0); err == nil {
			title := cleanInternalHeaderString(string(buf[:12]))
			if len(title) >= 3 && !isPureNumberOrGenericTitle(title) {
				return title
			}
		}
	}

	// 4. Game Boy / Game Boy Color (.gb, .gbc) -> offset 0x134 (15 bytes ASCII)
	if ext == ".gb" || ext == ".gbc" || consoleCode == "gb" || consoleCode == "gbc" {
		buf := make([]byte, 15)
		if _, err := f.ReadAt(buf, 0x0134); err == nil {
			title := cleanInternalHeaderString(string(buf))
			if len(title) >= 3 && !isPureNumberOrGenericTitle(title) {
				return title
			}
		}
	}

	// 5. Super Nintendo (.sfc, .smc) -> LoROM 0x7FC0 or HiROM 0xFFC0 (21 bytes ASCII)
	if ext == ".sfc" || ext == ".smc" || consoleCode == "snes" {
		fi, err := f.Stat()
		if err == nil {
			skip := int64(0)
			if fi.Size()%1024 == 512 {
				skip = 512
			}
			for _, off := range []int64{0x7FC0 + skip, 0xFFC0 + skip} {
				buf := make([]byte, 21)
				if _, err := f.ReadAt(buf, off); err == nil {
					if isPrintableASCII(buf) {
						title := cleanInternalHeaderString(string(buf))
						if len(title) >= 3 && !isPureNumberOrGenericTitle(title) {
							return title
						}
					}
				}
			}
		}
	}

	// 6. Sega Mega Drive / Genesis (.md, .gen, .bin) -> 0x150 (48 bytes Overseas Title) or 0x120
	if ext == ".md" || ext == ".gen" || ext == ".smd" || consoleCode == "genesis" {
		sig := make([]byte, 16)
		if _, err := f.ReadAt(sig, 0x100); err == nil && strings.Contains(string(sig), "SEGA") {
			for _, off := range []int64{0x150, 0x120} {
				buf := make([]byte, 48)
				if _, err := f.ReadAt(buf, off); err == nil {
					title := cleanInternalHeaderString(string(buf))
					if len(title) >= 3 && !isPureNumberOrGenericTitle(title) {
						return title
					}
				}
			}
		}
	}

	// 7. Nintendo 64 (.z64, .n64, .v64) -> 0x20 (20 bytes ASCII)
	if ext == ".z64" || ext == ".n64" || ext == ".v64" || consoleCode == "n64" {
		buf := make([]byte, 20)
		if _, err := f.ReadAt(buf, 0x20); err == nil && isPrintableASCII(buf) {
			title := cleanInternalHeaderString(string(buf))
			if len(title) >= 3 && !isPureNumberOrGenericTitle(title) {
				return title
			}
		}
	}

	// 8. Nintendo DS (.nds) -> Banner Offset at 0x68 (uint32 LE), English UTF-16LE title at banner + 0x240
	if ext == ".nds" || consoleCode == "nds" {
		ptrBuf := make([]byte, 4)
		if _, err := f.ReadAt(ptrBuf, 0x68); err == nil {
			bannerOff := int64(binary.LittleEndian.Uint32(ptrBuf))
			if bannerOff > 0 {
				utf16Buf := make([]byte, 256)
				if _, err := f.ReadAt(utf16Buf, bannerOff+0x240); err == nil {
					u16s := make([]uint16, 128)
					for i := 0; i < 128; i++ {
						u16s[i] = binary.LittleEndian.Uint16(utf16Buf[i*2 : i*2+2])
						if u16s[i] == 0 {
							u16s = u16s[:i]
							break
						}
					}
					decoded := strings.ReplaceAll(string(utf16.Decode(u16s)), "\n", " - ")
					title := cleanInternalHeaderString(decoded)
					if len(title) >= 3 && !isPureNumberOrGenericTitle(title) {
						return title
					}
				}
			}
		}
	}

	return ""
}

// Extract PS1 game title from .BIN / .ISO / .IMG / .MDF disc image by following ISO9660 Root Directory LBA -> SYSTEM.CNF & Boot EXE
func extractPS1TitleFromDiscFile(f *os.File) string {
	// Read first 256 KB to locate ISO9660 Primary Volume Descriptor ("\x01CD001")
	headChunk := make([]byte, 256*1024)
	n, _ := f.ReadAt(headChunk, 0)
	if n <= 0 {
		return ""
	}
	headChunk = headChunk[:n]

	var volID string
	idx := bytes.Index(headChunk, []byte("\x01CD001"))
	if idx != -1 && idx+190 <= len(headChunk) {
		volID = strings.TrimSpace(string(bytes.Trim(headChunk[idx+40:idx+72], "\x00 ")))

		// Determine sector size (2352 for raw BIN/IMG/MDF vs 2048 for ISO)
		sectorSize := int64(2048)
		if idx > 34000 {
			sectorSize = 2352
		}

		// ISO9660 Root Directory Record is at offset 156 of Primary Volume Descriptor; Extent LBA is at 156+2 = 158 (uint32 LE)
		rootLBA := int64(binary.LittleEndian.Uint32(headChunk[idx+158 : idx+162]))
		if rootLBA >= 16 && rootLBA < 450000 {
			rootDirBuf := make([]byte, 64*1024)
			rn, _ := f.ReadAt(rootDirBuf, rootLBA*sectorSize)
			if rn > 0 {
				rootDirBuf = rootDirBuf[:rn]
				// 1. Check if the Root Directory entries contain SYSTEM.CNF or a PS1 Serial executable name (SLUS_xxx.xx;1)
				if sysIdx := bytes.Index(bytes.ToUpper(rootDirBuf), []byte("SYSTEM.CNF")); sysIdx >= 33 {
					sysLBA := int64(binary.LittleEndian.Uint32(rootDirBuf[sysIdx-31 : sysIdx-27]))
					if sysLBA >= 16 && sysLBA < 450000 {
						sysBuf := make([]byte, 4096)
						if sn, _ := f.ReadAt(sysBuf, sysLBA*sectorSize); sn > 0 {
							if m := ps1SerialRegex.FindSubmatch(sysBuf[:sn]); len(m) == 4 {
								serialKey := strings.ToUpper(string(m[1]) + string(m[2]) + string(m[3]))
								if known, ok := ps1SerialToTitle[serialKey]; ok {
									return known
								}
							}
						}
					}
				}

				// 2. Scan Root Directory for any PS1 Serial filename (SLUS_xxx.xx, SCUS_xxx.xx, SLES_xxx.xx, etc.)
				if m := ps1SerialRegex.FindSubmatchIndex(rootDirBuf); len(m) >= 8 {
					prefix := string(rootDirBuf[m[2]:m[3]])
					part1 := string(rootDirBuf[m[4]:m[5]])
					part2 := string(rootDirBuf[m[6]:m[7]])
					serialKey := strings.ToUpper(prefix + part1 + part2)
					if known, ok := ps1SerialToTitle[serialKey]; ok {
						return known
					}
					// If serial is not in our static dictionary, jump to the Boot Executable's LBA to read its PS1 Memory Card Save Header!
					if m[0] >= 33 {
						exeLBA := int64(binary.LittleEndian.Uint32(rootDirBuf[m[0]-31 : m[0]-27]))
						if exeLBA >= 16 && exeLBA < 450000 {
							exeBuf := make([]byte, 512*1024)
							if en, _ := f.ReadAt(exeBuf, exeLBA*sectorSize); en > 0 {
								if mcTitle := extractPS1MemoryCardTitle(exeBuf[:en]); mcTitle != "" {
									return mcTitle
								}
							}
						}
					}
				}
			}
		}
	}

	// Scan up to the first 6 MB of the disc image for PS1 Serial or PS1 Memory Card Save Header Title
	const chunkSize = 1024 * 1024
	buf := make([]byte, chunkSize)
	var fallbackMemCardTitle string
	for off := int64(0); off < 6*chunkSize; off += chunkSize {
		rn, _ := f.ReadAt(buf, off)
		if rn <= 0 {
			break
		}
		slice := buf[:rn]
		if m := ps1SerialRegex.FindSubmatch(slice); len(m) == 4 {
			serialKey := strings.ToUpper(string(m[1]) + string(m[2]) + string(m[3]))
			if known, ok := ps1SerialToTitle[serialKey]; ok {
				return known
			}
		}
		if fallbackMemCardTitle == "" {
			fallbackMemCardTitle = extractPS1MemoryCardTitle(slice)
		}
	}

	if fallbackMemCardTitle != "" {
		return fallbackMemCardTitle
	}

	if volID != "" && len(volID) >= 3 && !isPureNumberOrGenericTitle(volID) && normalizePS1Serial(volID) == "" {
		return cleanInternalHeaderString(volID)
	}

	return ""
}

// Decompress first hunks of MAME Compressed Hunks of Data (.CHD v5) to extract PS1 Serial, Memory Card Title, or ISO9660 Volume ID
func extractPS1TitleFromCHD(f *os.File) string {
	hdr := make([]byte, 124)
	if _, err := f.ReadAt(hdr, 0); err != nil || string(hdr[0:8]) != "MComprHD" {
		return ""
	}
	version := binary.BigEndian.Uint32(hdr[12:16])
	if version == 5 {
		hunkBytes := binary.BigEndian.Uint32(hdr[56:60])
		unitBytes := binary.BigEndian.Uint32(hdr[60:64])
		mapOffset := int64(binary.BigEndian.Uint64(hdr[40:48]))
		if hunkBytes > 0 && hunkBytes <= 256*1024 && mapOffset > 0 {
			frames := int(hunkBytes) / 2448
			if unitBytes > 0 {
				frames = int(hunkBytes) / int(unitBytes)
			}
			if frames <= 0 {
				frames = 8
			}
			eccBytes := (frames + 7) / 8
			compLenBytes := 2
			if hunkBytes >= 65536 {
				compLenBytes = 3
			}
			cdzlHdrLen := compLenBytes + eccBytes

			const maxHunksToScan = 48
			mapBuf := make([]byte, maxHunksToScan*12)
			if mn, _ := f.ReadAt(mapBuf, mapOffset); mn >= 12 {
				var decompStream bytes.Buffer
				numHunks := mn / 12
				for h := 0; h < numHunks; h++ {
					entry := mapBuf[h*12 : (h+1)*12]
					compType := entry[0]
					compLen := int(entry[1])<<16 | int(entry[2])<<8 | int(entry[3])
					blockOff := int64(entry[4])<<40 | int64(entry[5])<<32 | int64(entry[6])<<24 | int64(entry[7])<<16 | int64(entry[8])<<8 | int64(entry[9])
					if compLen <= 4 || compLen > 256*1024 || blockOff <= 0 {
						continue
					}
					cBuf := make([]byte, compLen)
					if cn, _ := f.ReadAt(cBuf, blockOff); cn == compLen {
						if compType == 4 {
							decompStream.Write(cBuf)
						} else if compType <= 3 {
							// Try cdzl deflate offset first, then fallback offsets
							for _, skip := range []int{cdzlHdrLen, 3, 4, 2, 0} {
								if skip >= len(cBuf) {
									continue
								}
								fr := flate.NewReader(bytes.NewReader(cBuf[skip:]))
								out, _ := io.ReadAll(io.LimitReader(fr, int64(hunkBytes)))
								_ = fr.Close()
								if len(out) >= 2048 {
									decompStream.Write(out)
									break
								}
							}
						}
					}
					if decompStream.Len() >= 512*1024 {
						break
					}
				}
				if decompStream.Len() > 0 {
					if t := extractPS1TitleFromRawBytes(decompStream.Bytes()); t != "" {
						return t
					}
				}
			}
		}
	}

	// Fallback raw scan on first 2 MB of CHD
	raw := make([]byte, 2*1024*1024)
	if n, _ := f.ReadAt(raw, 0); n > 0 {
		if t := extractPS1TitleFromRawBytes(raw[:n]); t != "" {
			return t
		}
	}
	return ""
}

func extractPS1TitleFromRawBytes(data []byte) string {
	if m := ps1SerialRegex.FindSubmatch(data); len(m) == 4 {
		serialKey := strings.ToUpper(string(m[1]) + string(m[2]) + string(m[3]))
		if known, ok := ps1SerialToTitle[serialKey]; ok {
			return known
		}
	}
	if mc := extractPS1MemoryCardTitle(data); mc != "" {
		return mc
	}
	if idx := bytes.Index(data, []byte("\x01CD001")); idx != -1 && idx+72 <= len(data) {
		volID := strings.TrimSpace(string(bytes.Trim(data[idx+40:idx+72], "\x00 ")))
		if len(volID) >= 3 && !isPureNumberOrGenericTitle(volID) && normalizePS1Serial(volID) == "" {
			return cleanInternalHeaderString(volID)
		}
	}
	return ""
}

// Extract official game title from Sony PS1 Memory Card 128-byte Save Header ("SC" + 0x11/0x12/0x13 + Shift-JIS/ASCII Title)
func extractPS1MemoryCardTitle(data []byte) string {
	for i := 0; i+96 <= len(data); i++ {
		if data[i] != 'S' || data[i+1] != 'C' {
			continue
		}
		iconFlag := data[i+2]
		blockCnt := data[i+3]
		if (iconFlag != 0x11 && iconFlag != 0x12 && iconFlag != 0x13) || blockCnt < 1 || blockCnt > 15 {
			continue
		}
		// Check reserved zero bytes at offset 68..79 to confirm genuine PS1 Memory Card header
		zeroes := 0
		for z := 68; z < 80; z++ {
			if data[i+z] == 0 {
				zeroes++
			}
		}
		if zeroes < 8 {
			continue
		}

		titleBytes := data[i+4 : i+68]
		decoded := decodePS1ShiftJISOrASCII(titleBytes)
		cleaned := cleanInternalHeaderString(decoded)
		if len(cleaned) >= 4 && !isPureNumberOrGenericTitle(cleaned) && normalizePS1Serial(cleaned) == "" {
			return cleaned
		}
	}
	return ""
}

func decodePS1ShiftJISOrASCII(b []byte) string {
	var out strings.Builder
	for i := 0; i < len(b); i++ {
		c := b[i]
		if c == 0 {
			break
		}
		// Shift-JIS 2-byte full-width ASCII characters (0x81 / 0x82)
		if (c == 0x81 || c == 0x82) && i+1 < len(b) {
			c2 := b[i+1]
			i++
			if c == 0x81 {
				switch c2 {
				case 0x40:
					out.WriteByte(' ')
				case 0x44:
					out.WriteByte('.')
				case 0x46:
					out.WriteByte(':')
				case 0x49:
					out.WriteByte('!')
				case 0x5B, 0x7C:
					out.WriteByte('-')
				case 0x5E:
					out.WriteByte('/')
				case 0x66:
					out.WriteByte('\'')
				case 0x95:
					out.WriteByte('&')
				default:
					out.WriteByte(' ')
				}
			} else if c == 0x82 {
				if c2 >= 0x4F && c2 <= 0x58 {
					out.WriteByte('0' + (c2 - 0x4F))
				} else if c2 >= 0x60 && c2 <= 0x79 {
					out.WriteByte('A' + (c2 - 0x60))
				} else if c2 >= 0x81 && c2 <= 0x9A {
					out.WriteByte('a' + (c2 - 0x81))
				}
			}
			continue
		}
		if c >= 32 && c <= 126 {
			out.WriteByte(c)
		} else {
			break
		}
	}
	return strings.TrimSpace(out.String())
}

// Check if any media file in images/ or videos/ starts with the ROM's number and has a real title attached (e.g. "000001 - Tekken 3.png")
func extractTitleFromCompanionMediaFile(romPath string) string {
	romDir := filepath.Dir(romPath)
	baseNoExt := strings.ToLower(strings.TrimSuffix(filepath.Base(romPath), filepath.Ext(romPath)))
	if !pureNumberRegex.MatchString(baseNoExt) {
		return ""
	}
	for _, sub := range []string{"images", "downloaded_images", "download_images", "boxart", "videos"} {
		mDir := filepath.Join(romDir, sub)
		entries, err := os.ReadDir(mDir)
		if err != nil {
			continue
		}
		for _, e := range entries {
			if e.IsDir() {
				continue
			}
			nameNoExt := strings.TrimSuffix(e.Name(), filepath.Ext(e.Name()))
			lower := strings.ToLower(nameNoExt)
			for _, sfx := range []string{"-image", "-thumb", "-boxart", "-snap", "-marquee", "-video"} {
				if strings.HasSuffix(lower, sfx) {
					nameNoExt = nameNoExt[:len(nameNoExt)-len(sfx)]
					lower = strings.ToLower(nameNoExt)
					break
				}
			}
			if strings.HasPrefix(lower, baseNoExt) && len(nameNoExt) > len(baseNoExt)+2 {
				stripped := stripLeadingIndexExcept007(nameNoExt)
				if stripped != "" && !isPureNumberOrGenericTitle(stripped) {
					return stripped
				}
			}
		}
	}
	return ""
}

// Parse Sony PARAM.SFO binary table (inside PS1/PSP .PBP files) to extract TITLE and DISC_ID
func parseParamSFO(sfo []byte) (title string, discID string) {
	if len(sfo) < 20 || string(sfo[0:4]) != "\x00PSF" {
		return "", ""
	}
	keyTableStart := binary.LittleEndian.Uint32(sfo[0x08:0x0C])
	dataTableStart := binary.LittleEndian.Uint32(sfo[0x0C:0x10])
	numEntries := binary.LittleEndian.Uint32(sfo[0x10:0x14])
	if numEntries > 256 || int(keyTableStart) >= len(sfo) || int(dataTableStart) >= len(sfo) {
		return "", ""
	}

	for i := uint32(0); i < numEntries; i++ {
		entryOff := 20 + i*16
		if int(entryOff+16) > len(sfo) {
			break
		}
		keyOff := uint32(binary.LittleEndian.Uint16(sfo[entryOff : entryOff+2]))
		dataLen := binary.LittleEndian.Uint32(sfo[entryOff+4 : entryOff+8])
		dataOff := binary.LittleEndian.Uint32(sfo[entryOff+12 : entryOff+16])

		absKey := keyTableStart + keyOff
		absData := dataTableStart + dataOff
		if int(absKey) >= len(sfo) || int(absData+dataLen) > len(sfo) {
			continue
		}

		// Read null-terminated key name
		keyEnd := absKey
		for int(keyEnd) < len(sfo) && sfo[keyEnd] != 0 {
			keyEnd++
		}
		keyName := string(sfo[absKey:keyEnd])
		val := strings.TrimRight(string(sfo[absData:absData+dataLen]), "\x00 ")

		if keyName == "TITLE" && val != "" {
			title = val
		} else if keyName == "DISC_ID" && val != "" {
			discID = val
		}
	}
	return title, discID
}

func isPrintableASCII(b []byte) bool {
	printable := 0
	for _, c := range b {
		if c == 0 {
			break
		}
		if c >= 32 && c <= 126 {
			printable++
		} else {
			return false
		}
	}
	return printable >= 3
}

func cleanInternalHeaderString(raw string) string {
	var b strings.Builder
	for _, r := range raw {
		if r >= 32 && r != 127 {
			b.WriteRune(r)
		}
	}
	s := strings.TrimSpace(b.String())
	s = strings.ReplaceAll(s, "_", " ")
	fields := strings.Fields(s)
	s = strings.Join(fields, " ")
	// Convert ALL-CAPS internal cartridge headers (like "SUPER MARIO WORLD") to Title Case
	if s == strings.ToUpper(s) && len(s) > 4 {
		words := strings.Fields(strings.ToLower(s))
		for i, w := range words {
			if w == "ii" || w == "iii" || w == "iv" || w == "vi" || w == "vii" || w == "viii" {
				words[i] = strings.ToUpper(w)
			} else if len(w) > 0 {
				runes := []rune(w)
				runes[0] = unicode.ToUpper(runes[0])
				words[i] = string(runes)
			}
		}
		return strings.Join(words, " ")
	}
	return s
}

// Explicit exception for Agent 007 (James Bond) games so "007" is never stripped or caught in an endless rename loop!
func isJamesBond007Game(text string) bool {
	lower := strings.ToLower(strings.TrimSpace(text))
	if lower == "" {
		return false
	}
	bondKeywords := []string{
		"james bond", "agent 007", "goldeneye", "tomorrow never dies",
		"world is not enough", "nightfire", "agent under fire",
		"everything or nothing", "from russia with love", "007 racing",
		"goldfinger", "licence to kill", "license to kill", "live and let die",
		"view to a kill", "spy who loved me", "octopussy", "moonraker",
		"quantum of solace", "blood stone", "007: ", "007 - ", "007 (",
		"007 [", "007_", "duel 007", "007 duel",
	}
	for _, kw := range bondKeywords {
		if strings.Contains(lower, kw) {
			return true
		}
	}
	return false
}

func countLettersInString(s string) int {
	cnt := 0
	for _, r := range s {
		if unicode.IsLetter(r) {
			cnt++
		}
	}
	return cnt
}

// Strip leading catalog index numbers (e.g. "001 - Super Mario", "02. Contra"), EXCEPT when the number is "007"
// OR when stripping the number would leave no real alphabetic title (preventing "000001 (World)" -> "(World)" bug)!
func stripLeadingIndexExcept007(s string) string {
	if isJamesBond007Game(s) {
		return s
	}
	for i := 0; i < 2; i++ {
		m := leadingNumRegex.FindStringSubmatchIndex(s)
		if len(m) >= 4 {
			numStr := s[m[2]:m[3]]
			if numStr == "007" {
				// Preserve "007" prefix for Agent 007 games!
				break
			}
			remainder := strings.TrimSpace(s[m[1]:])
			remWithoutTags := strings.TrimSpace(tagStripRegex.ReplaceAllString(remainder, ""))
			if countLettersInString(remWithoutTags) < 2 {
				// Do NOT strip the number if there is no alphabetic title after it!
				break
			}
			s = remainder
		} else {
			break
		}
	}
	return s
}

// Scan each folder for sequential numbered ROM filenames (1, 2, 3... / 01, 02... / 001, 002... / 0001, 0002...)
// while excluding 007 James Bond games so they never loop.
func buildSequentialNumberedCache(candidatePaths []string) {
	byDir := make(map[string][]string)
	for _, p := range candidatePaths {
		dir := filepath.Dir(p)
		byDir[dir] = append(byDir[dir], filepath.Base(p))
	}

	newCache := make(map[string]map[string]bool)

	for dir, files := range byDir {
		dirFlags := make(map[string]bool)
		type numFile struct {
			lowerName string
			num       int
			isPure    bool
		}
		var parsed []numFile
		numSet := make(map[int]bool)

		for _, fn := range files {
			if isJamesBond007Game(fn) {
				continue
			}
			ext := filepath.Ext(fn)
			base := strings.TrimSpace(strings.TrimSuffix(fn, ext))
			// Also strip region tags like "0001 (USA)" -> "0001" to check if the core name is just a number
			baseWithoutTags := strings.TrimSpace(tagStripRegex.ReplaceAllString(base, ""))
			lowerBase := strings.ToLower(baseWithoutTags)

			if pm := pureNumberRegex.FindStringSubmatch(lowerBase); len(pm) >= 2 {
				if n, err := strconv.Atoi(pm[1]); err == nil {
					// If the file is literally named "007 (USA).nes" (already has region tag and is 007), don't treat as raw number
					if lowerBase == "007" && base != baseWithoutTags {
						continue
					}
					parsed = append(parsed, numFile{lowerName: strings.ToLower(fn), num: n, isPure: true})
					numSet[n] = true
					continue
				}
			}
		}

		// A file in this folder is considered a numbered ROM if:
		// 1. It is part of a sequence of numbers in the same folder (e.g., n-1, n+1, n-2, n+2 exist in the folder, or >= 2 numbered ROMs in folder)
		// 2. Or it is a pure number (like 0001.pbp, 01.bin) and not "007" standalone
		hasSequenceInFolder := len(parsed) >= 2
		for _, pf := range parsed {
			isAdjacent := numSet[pf.num-1] || numSet[pf.num+1] || numSet[pf.num-2] || numSet[pf.num+2]
			if pf.num == 7 && !hasSequenceInFolder && !isAdjacent {
				// Standalone "007" without other sequential numbers in the folder -> treat as Agent 007!
				continue
			}
			if pf.isPure || isAdjacent || hasSequenceInFolder {
				dirFlags[pf.lowerName] = true
			}
		}

		newCache[dir] = dirFlags
	}

	cacheMu.Lock()
	seqNumberedDirCache = newCache
	cacheMu.Unlock()
}

func isNumberedRomFile(fullPath, fileName, extractedTitle string) bool {
	// Never mark as an unrenamed numbered ROM if the file is already named as a James Bond 007 title!
	if isJamesBond007Game(fileName) {
		return false
	}
	ext := filepath.Ext(fileName)
	base := strings.TrimSpace(strings.TrimSuffix(fileName, ext))
	baseWithoutTags := strings.TrimSpace(tagStripRegex.ReplaceAllString(base, ""))
	lowerBase := strings.ToLower(baseWithoutTags)

	// If the filename is "007" (or "007 (USA)") and the internal ROM header is ALSO a 007 Bond game,
	// and the filename already contains tags or "007", prevent re-renaming loop!
	if lowerBase == "007" && isJamesBond007Game(extractedTitle) && base != "007" && base != "0007" {
		return false
	}

	dir := filepath.Dir(fullPath)
	cacheMu.Lock()
	dirMap, ok := seqNumberedDirCache[dir]
	cacheMu.Unlock()
	if ok {
		if dirMap[strings.ToLower(fileName)] {
			return true
		}
	}

	if lowerBase == "007" {
		return false
	}
	return pureNumberRegex.MatchString(lowerBase)
}

func isNumberedRomFileName(fileName string) bool {
	if isJamesBond007Game(fileName) {
		return false
	}
	base := strings.TrimSuffix(fileName, filepath.Ext(fileName))
	baseWithoutTags := strings.TrimSpace(tagStripRegex.ReplaceAllString(base, ""))
	lower := strings.ToLower(baseWithoutTags)
	if lower == "007" {
		return false
	}
	return pureNumberRegex.MatchString(lower)
}

// ============================================================================
// CONSOLE DETECTION & DEDUPLICATION ENGINE
// ============================================================================

func detectConsoleCode(fullPath, ext string) string {
	lowerPath := strings.ToLower(filepath.ToSlash(fullPath))
	parts := strings.Split(lowerPath, "/")

	for i := len(parts) - 2; i >= 0; i-- {
		seg := parts[i]
		switch seg {
		case "famicom", "fc":
			if ext == ".nes" || ext == ".unf" || ext == ".zip" {
				return "famicom"
			}
		case "fds", "famicom disk system":
			return "fds"
		case "nes", "dendy":
			if ext == ".nes" || ext == ".unf" || ext == ".zip" {
				return "nes"
			}
		case "snes", "sfc", "superfamicom", "super nintendo":
			return "snes"
		case "gba", "game boy advance", "gameboy advance":
			return "gba"
		case "gbc", "game boy color", "gameboy color":
			return "gbc"
		case "gb", "game boy", "gameboy":
			return "gb"
		case "megadrive", "genesis", "md", "sega megadrive", "sega genesis":
			return "genesis"
		case "mastersystem", "sms":
			return "mastersystem"
		case "gamegear", "gg":
			return "gamegear"
		case "sega32x", "32x":
			return "sega32x"
		case "pcengine", "pce", "turbografx", "tg16":
			return "pcengine"
		case "psx", "ps1", "playstation":
			return "psx"
		case "psp":
			return "psp"
		case "nds", "ds":
			return "nds"
		case "n64", "nintendo64":
			return "n64"
		case "arcade", "mame", "fbneo", "neogeo", "cps", "cps1", "cps2", "cps3":
			return "arcade"
		}
	}

	if code, ok := extToDefaultConsole[ext]; ok {
		return code
	}
	return "arcade"
}

func analyzeSubfolderContext(rootFolder, fullPath string) (relSubfolder string, isRusFolder bool, isTopFolder bool) {
	rel, err := filepath.Rel(rootFolder, filepath.Dir(fullPath))
	if err != nil || rel == "." {
		rel = "(Корень)"
	}
	relSubfolder = rel

	lowerRel := strings.ToLower(rel)
	if strings.Contains(lowerRel, "rus") || strings.Contains(lowerRel, "рус") || strings.Contains(lowerRel, "perevod") || strings.Contains(lowerRel, "перевод") {
		isRusFolder = true
	}
	if strings.Contains(lowerRel, "top") || strings.Contains(lowerRel, "best") || strings.Contains(lowerRel, "лучш") || strings.Contains(lowerRel, "hit") || strings.Contains(lowerRel, "100") {
		isTopFolder = true
	}
	return
}

func buildComparisonKey(cleanTitle string) string {
	s := strings.ToLower(cleanTitle)
	s = stripLeadingIndexExcept007(s)

	romanPairs := []struct{ rom, dig string }{
		{" viii ", " 8 "}, {" vii ", " 7 "}, {" vi ", " 6 "},
		{" iv ", " 4 "}, {" iii ", " 3 "}, {" ii ", " 2 "},
	}
	s = " " + s + " "
	for _, rp := range romanPairs {
		s = strings.ReplaceAll(s, rp.rom, rp.dig)
	}

	words := strings.FieldsFunc(s, func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r)
	})

	noiseWords := map[string]bool{
		"the": true, "and": true, "version": true, "edition": true,
		"rus": true, "russian": true, "ru": true, "eng": true, "english": true,
		"usa": true, "eur": true, "europe": true, "japan": true, "jpn": true, "world": true,
		"rev": true, "v1": true, "v2": true, "top": true, "top100": true,
		"рус": true, "русская": true, "версия": true, "перевод": true,
	}

	var kept []string
	for _, w := range words {
		if noiseWords[w] {
			continue
		}
		kept = append(kept, w)
	}

	res := strings.Join(kept, "")
	if res == "" {
		return strings.ReplaceAll(strings.ToLower(cleanTitle), " ", "")
	}
	return res
}

func extractCleanTitle(fileName string) string {
	ext := filepath.Ext(fileName)
	rawBase := strings.TrimSpace(strings.TrimSuffix(fileName, ext))

	// First strip region/bracket tags like "(World)" or "(USA)" BEFORE checking if it's a pure number!
	withoutTags := strings.TrimSpace(tagStripRegex.ReplaceAllString(rawBase, " "))
	if pureNumberRegex.MatchString(strings.ToLower(withoutTags)) {
		return withoutTags
	}

	base := stripLeadingIndexExcept007( withoutTags )
	base = strings.ReplaceAll(base, "_", " ")
	base = strings.ReplaceAll(base, ".", " ")

	tokens := strings.Fields(base)
	var filtered []string
	for _, t := range tokens {
		up := strings.ToUpper(t)
		if up == "USA" || up == "EUR" || up == "EUROPE" || up == "JAPAN" || up == "JPN" ||
			up == "WORLD" || up == "RUS" || up == "RUSSIAN" || up == "RU" ||
			up == "V1" || up == "V1.0" || up == "V1.1" || up == "TOP100" ||
			up == "РУС" || up == "РУССКАЯ" || up == "ВЕРСИЯ" {
			continue
		}
		filtered = append(filtered, t)
	}
	candidate := strings.Join(filtered, " ")
	if len(filtered) == 0 || countLettersInString(candidate) < 2 {
		if withoutTags != "" {
			return withoutTags
		}
		return rawBase
	}
	return candidate
}

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

	cacheMu.Lock()
	gamelistTitleCache = make(map[string]map[string]string)
	gamelistEntryCache = make(map[string]map[string]GameEntryXML)
	seqNumberedDirCache = make(map[string]map[string]bool)
	cacheMu.Unlock()

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
			if _, ok := extToDefaultConsole[ext]; ok || ext == ".zip" {
				candidatePaths = append(candidatePaths, p)
			}
			return nil
		})

		// First pass: detect sequential numbered ROM series in each folder (excluding 007 James Bond games!)
		buildSequentialNumberedCache(candidatePaths)

		totalCandidates := len(candidatePaths)
		appendLog(fmt.Sprintf("Найдено ромов: %d. Анализ порядковых номеров (исключая 007), чтение заголовков ромов и сверка дублей...", totalCandidates))

		jobsCh := make(chan string, totalCandidates+1)
		resultsCh := make(chan RomItem, totalCandidates+1)

		var wg sync.WaitGroup
		for w := 0; w < 8; w++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				for p := range jobsCh {
					if atomic.LoadInt32(&cancelRequested) != 0 {
						continue
					}
					if item, ok := inspectRomFile(rootFolder, p); ok {
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

		var results []RomItem
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

		results = deduplicateAcrossSubfolders(results, priority)

		stateMu.Lock()
		scannedRoms = results
		stateMu.Unlock()

		elapsed := time.Since(startTime).Round(time.Millisecond)
		appendLog(fmt.Sprintf("Сканирование завершено за %v. Проверено ромов: %d.", elapsed, len(results)))

		procPostMessageW.Call(hwnd, WM_APP_SCAN_DONE, 0, 0)
	}()
}

func inspectRomFile(rootFolder, path string) (RomItem, bool) {
	fi, err := os.Stat(path)
	if err != nil {
		return RomItem{}, false
	}

	ext := strings.ToLower(filepath.Ext(path))
	crcTable := crc32.MakeTable(crc32.IEEE)

	if ext == ".zip" {
		zr, err := zip.OpenReader(path)
		if err != nil {
			return RomItem{}, false
		}
		defer zr.Close()

		for _, zf := range zr.File {
			if zf.FileInfo().IsDir() {
				continue
			}
			innerExt := strings.ToLower(filepath.Ext(zf.Name))
			if _, ok := extToDefaultConsole[innerExt]; !ok {
				continue
			}

			rc, err := zf.Open()
			if err != nil {
				continue
			}
			data, err := io.ReadAll(rc)
			rc.Close()
			if err != nil {
				continue
			}

			crcHex := fmt.Sprintf("%08X", crc32.Checksum(data, crcTable))
			skip := detectHeaderSkip(innerExt, data)
			hdrCrcHex := crcHex
			if skip > 0 && len(data) > skip {
				hdrCrcHex = fmt.Sprintf("%08X", crc32.Checksum(data[skip:], crcTable))
			}
			md5Sum := md5.Sum(data)
			consoleCode := detectConsoleCode(path, innerExt)

			return buildRomItem(rootFolder, path, fi.Name(), fi.Size(), ".zip", consoleCode, crcHex, hdrCrcHex, hex.EncodeToString(md5Sum[:])), true
		}
		return RomItem{}, false
	}

	if _, ok := extToDefaultConsole[ext]; !ok {
		return RomItem{}, false
	}

	// For huge CD/ISO/PBP/CHD files (> 32 MB), hash the first 16 MB for fast CRC32 without stalling the disk
	var crcHex, hdrCrcHex, md5Hex string
	if fi.Size() > 32*1024*1024 {
		f, err := os.Open(path)
		if err != nil {
			return RomItem{}, false
		}
		buf := make([]byte, 4*1024*1024)
		n, _ := f.Read(buf)
		f.Close()
		crcHex = fmt.Sprintf("%08X", crc32.Checksum(buf[:n], crcTable))
		hdrCrcHex = crcHex
		md5Sum := md5.Sum(buf[:n])
		md5Hex = hex.EncodeToString(md5Sum[:])
	} else {
		data, err := os.ReadFile(path)
		if err != nil {
			return RomItem{}, false
		}
		crcHex = fmt.Sprintf("%08X", crc32.Checksum(data, crcTable))
		skip := detectHeaderSkip(ext, data)
		hdrCrcHex = crcHex
		if skip > 0 && len(data) > skip {
			hdrCrcHex = fmt.Sprintf("%08X", crc32.Checksum(data[skip:], crcTable))
		}
		md5Sum := md5.Sum(data)
		md5Hex = hex.EncodeToString(md5Sum[:])
	}

	consoleCode := detectConsoleCode(path, ext)
	return buildRomItem(rootFolder, path, fi.Name(), fi.Size(), ext, consoleCode, crcHex, hdrCrcHex, md5Hex), true
}

func detectHeaderSkip(ext string, data []byte) int {
	if ext == ".nes" && len(data) >= 16 && string(data[:4]) == "NES\x1a" {
		return 16
	}
	if (ext == ".smc" || ext == ".sfc") && len(data)%1024 == 512 && len(data) > 512 {
		return 512
	}
	return 0
}

func buildRomItem(rootFolder, fullPath, fileName string, size int64, ext, consoleCode, crcHex, hdrCrcHex, md5Hex string) RomItem {
	relSub, isRusFolder, isTopFolder := analyzeSubfolderContext(rootFolder, fullPath)
	isRusFile := rusTagRegex.MatchString(fileName) || isRusFolder

	// Extract real game title from gamelist.xml OR internal binary ROM header (e.g. for 1.pbp, 02.bin, 0001.pbp, etc.)
	gamelistTitle := getGamelistTitleForFile(fullPath)
	internalHdrTitle := extractInternalBinaryRomTitle(fullPath, ext, consoleCode)

	extractedTitle := ""
	if gamelistTitle != "" {
		extractedTitle = gamelistTitle
	} else if internalHdrTitle != "" {
		extractedTitle = internalHdrTitle
	}

	isNumbered := isNumberedRomFile(fullPath, fileName, extractedTitle)

	cleanTitle := extractCleanTitle(fileName)
	if (isNumbered || len(cleanTitle) <= 3) && extractedTitle != "" {
		cleanTitle = extractCleanTitle(extractedTitle)
	}
	if extractedTitle == "" {
		extractedTitle = cleanTitle
	}

	if rusTagRegex.MatchString(extractedTitle) {
		isRusFile = true
	}

	region := parseRegion(fileName+" "+extractedTitle, isRusFile)
	revision := parseRevision(fileName)
	compKey := buildComparisonKey(cleanTitle)
	isJunk := junkRegex.MatchString(fileName)

	meta, ok := consoleCatalog[consoleCode]
	if !ok {
		meta = consoleCatalog["nes"]
	}

	canonExt := ext
	if ext == ".smc" {
		canonExt = ".sfc"
	} else if ext == ".gen" || ext == ".smd" {
		canonExt = ".md"
	}

	// CRITICAL FIX v5.0: Never append a fake "(World)" tag when region is unknown/World,
	// and if CleanTitle is still a pure number, keep original fileName!
	canonicalName := fileName
	if !isPureNumberOrGenericTitle(cleanTitle) && countLettersInString(cleanTitle) >= 2 {
		if isRusFile {
			canonicalName = fmt.Sprintf("%s (RUS)%s", cleanTitle, canonExt)
		} else if revision != "" && region != "World" {
			canonicalName = fmt.Sprintf("%s (%s) (%s)%s", cleanTitle, region, revision, canonExt)
		} else if region != "World" {
			canonicalName = fmt.Sprintf("%s (%s)%s", cleanTitle, region, canonExt)
		} else {
			canonicalName = fmt.Sprintf("%s%s", cleanTitle, canonExt)
		}
	}

	romDir := filepath.Dir(fullPath)
	baseNoExt := strings.TrimSuffix(fileName, filepath.Ext(fileName))
	imgRel, _, _, vidRel := resolveExistingMediaPathsForRom(romDir, baseNoExt, cleanTitle)

	mediaStatus := "Нет медиа"
	hasImg := imgRel != ""
	hasVid := vidRel != ""
	if hasImg && hasVid {
		mediaStatus = "✔ Картинка + Видео"
	} else if hasImg {
		mediaStatus = "✔ Картинка"
	}

	status := "verified"
	reason := "Оставить 1G1R"
	if isJunk {
		status = "junk_bad_dump"
		reason = "Битый дамп [b]"
	} else if isNumbered && !isPureNumberOrGenericTitle(cleanTitle) {
		reason = "Порядковый № -> " + cleanTitle
	} else if isNumbered {
		reason = "Порядковый № (требуется парсинг)"
	}

	return RomItem{
		FilePath:        fullPath,
		SourceSubfolder: relSub,
		FileName:        fileName,
		ExtractedTitle:  extractedTitle,
		CleanTitle:      cleanTitle,
		ComparisonKey:   compKey,
		CanonicalName:   canonicalName,
		Extension:       ext,
		ConsoleCode:     consoleCode,
		Generation:      meta.GenerationFolder,
		FileSize:        size,
		CRC32:           crcHex,
		HeaderlessCRC32: hdrCrcHex,
		MD5:             md5Hex,
		Region:          region,
		IsRussian:       isRusFile,
		IsFromTopFolder: isTopFolder,
		IsNumberedFile:  isNumbered,
		Revision:        revision,
		Status:          status,
		Is1G1RWinner:    !isJunk,
		Reason:          reason,
		MediaStatus:     mediaStatus,
	}
}

func parseRegion(name string, isRus bool) string {
	if isRus {
		return "Russia"
	}
	m := regionRegex.FindStringSubmatch(name)
	if len(m) > 1 {
		r := strings.ToUpper(m[1])
		switch r {
		case "U", "US", "USA", "UE", "JU":
			return "USA"
		case "E", "EUR", "EUROPE", "EN,FR,DE":
			return "Europe"
		case "J", "JPN", "JAPAN", "EN,JA":
			return "Japan"
		case "W", "WORLD":
			return "World"
		case "RUSSIA", "RUS", "RU":
			return "Russia"
		default:
			return m[1]
		}
	}
	lower := strings.ToLower(name)
	if strings.Contains(lower, "usa") {
		return "USA"
	}
	if strings.Contains(lower, "eur") || strings.Contains(lower, "pal") {
		return "Europe"
	}
	if strings.Contains(lower, "jap") || strings.Contains(lower, "jpn") {
		return "Japan"
	}
	return "World"
}

func parseRevision(name string) string {
	m := revisionRegex.FindStringSubmatch(name)
	if len(m) > 1 {
		return m[1]
	}
	return ""
}

// Check if two files in the same folder are companion files of the same CD game (e.g., 000001.cue + 000001.bin)
func areCompanionDiscFiles(a, b RomItem) bool {
	if !strings.EqualFold(filepath.Dir(a.FilePath), filepath.Dir(b.FilePath)) {
		return false
	}
	baseA := strings.ToLower(strings.TrimSuffix(a.FileName, filepath.Ext(a.FileName)))
	baseB := strings.ToLower(strings.TrimSuffix(b.FileName, filepath.Ext(b.FileName)))
	if baseA != baseB {
		return false
	}
	return !strings.EqualFold(a.Extension, b.Extension)
}

func deduplicateAcrossSubfolders(items []RomItem, priority []string) []RomItem {
	seenHash := make(map[string]int)
	for i := range items {
		if items[i].Status == "junk_bad_dump" {
			continue
		}
		hKey := items[i].ConsoleCode + "::crc::" + items[i].HeaderlessCRC32
		if firstIdx, exists := seenHash[hKey]; exists {
			if areCompanionDiscFiles(items[i], items[firstIdx]) {
				continue
			}
			if scoreRomCandidate(items[i], priority) > scoreRomCandidate(items[firstIdx], priority) {
				items[firstIdx].Status = "duplicate_clone"
				items[firstIdx].Is1G1RWinner = false
				items[firstIdx].Reason = fmt.Sprintf("Дубль по CRC32 (оставлен из %s)", items[i].SourceSubfolder)
				seenHash[hKey] = i
			} else {
				items[i].Status = "duplicate_clone"
				items[i].Is1G1RWinner = false
				items[i].Reason = fmt.Sprintf("Дубль по CRC32 (оставлен из %s)", items[firstIdx].SourceSubfolder)
			}
		} else {
			seenHash[hKey] = i
		}
	}

	groups := make(map[string][]int)
	for i, it := range items {
		if it.Status == "verified" {
			// Do not group unparsed numbered files together by title if their title is still a pure number!
			if isPureNumberOrGenericTitle(it.CleanTitle) {
				continue
			}
			gKey := it.ConsoleCode + "::title::" + it.ComparisonKey
			groups[gKey] = append(groups[gKey], i)
		}
	}

	for _, idxs := range groups {
		if len(idxs) <= 1 {
			continue
		}
		bestIdx := idxs[0]
		bestScore := scoreRomCandidate(items[bestIdx], priority)
		for _, idx := range idxs[1:] {
			sc := scoreRomCandidate(items[idx], priority)
			if sc > bestScore {
				bestScore = sc
				bestIdx = idx
			}
		}
		winner := items[bestIdx]
		for _, idx := range idxs {
			if idx == bestIdx || areCompanionDiscFiles(items[idx], winner) {
				items[idx].Is1G1RWinner = true
				items[idx].Status = "verified"
				if idx == bestIdx {
					items[idx].Reason = fmt.Sprintf("Лучший из %d папок (%s)", len(idxs), winner.Region)
				}
			} else {
				items[idx].Is1G1RWinner = false
				items[idx].Status = "duplicate_clone"
				items[idx].Reason = fmt.Sprintf("Дубль из [%s]", items[idx].SourceSubfolder)
			}
		}
	}

	byConsole := make(map[string][]int)
	for i, it := range items {
		if it.Status == "verified" && !isPureNumberOrGenericTitle(it.CleanTitle) {
			byConsole[it.ConsoleCode] = append(byConsole[it.ConsoleCode], i)
		}
	}

	for _, idxs := range byConsole {
		for a := 0; a < len(idxs); a++ {
			idxA := idxs[a]
			if items[idxA].Status != "verified" {
				continue
			}
			for b := a + 1; b < len(idxs); b++ {
				idxB := idxs[b]
				if items[idxB].Status != "verified" {
					continue
				}
				if areCompanionDiscFiles(items[idxA], items[idxB]) {
					continue
				}
				if areTitlesSameGame(items[idxA].CleanTitle, items[idxB].CleanTitle, items[idxA].ComparisonKey, items[idxB].ComparisonKey) {
					if scoreRomCandidate(items[idxB], priority) > scoreRomCandidate(items[idxA], priority) {
						items[idxA].Status = "duplicate_clone"
						items[idxA].Is1G1RWinner = false
						items[idxA].Reason = fmt.Sprintf("Повтор (оставлен %s)", items[idxB].FileName)
						break
					} else {
						items[idxB].Status = "duplicate_clone"
						items[idxB].Is1G1RWinner = false
						items[idxB].Reason = fmt.Sprintf("Повтор (оставлен %s)", items[idxA].FileName)
					}
				}
			}
		}
	}

	return items
}

func areTitlesSameGame(titleA, titleB, keyA, keyB string) bool {
	if keyA == keyB {
		return true
	}
	if strings.EqualFold(strings.TrimSpace(titleA), strings.TrimSpace(titleB)) {
		return true
	}
	toksA := tokenizeNormalized(titleA)
	toksB := tokenizeNormalized(titleB)
	if len(toksA) < 2 || len(toksB) < 2 {
		return false
	}
	common := 0
	for t := range toksA {
		if toksB[t] {
			common++
		}
	}
	union := len(toksA) + len(toksB) - common
	if union == 0 {
		return false
	}
	return float64(common)/float64(union) >= 0.85
}

func scoreRomCandidate(r RomItem, priority []string) int {
	score := 0
	for i, reg := range priority {
		if strings.EqualFold(r.Region, reg) {
			score += (len(priority) - i) * 100
			break
		}
	}
	if r.IsRussian && len(priority) > 0 && strings.EqualFold(priority[0], "Russia") {
		score += 60
	}
	if r.Revision != "" {
		score += 15
	}
	if r.IsFromTopFolder {
		score += 10
	}
	if r.Extension != ".zip" {
		score += 5
	}
	return score
}

func populateListView() {
	procSendMessageW.Call(hListView, LVM_DELETEALLITEMS, 0, 0)

	stateMu.Lock()
	items := make([]RomItem, len(scannedRoms))
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
		len(items), cleanCount, numberedCount, cloneCount, formatBytes(reclaimBytes),
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
	items := make([]RomItem, len(scannedRoms))
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
			if meta, ok := consoleCatalog[cCode]; ok {
				_ = getOrLoadLibretroIndex(meta.LibretroSystem)
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
			if isJamesBond007Game(r.FileName) {
				appendLog(fmt.Sprintf("[ИСКЛЮЧЕНИЕ 007] Пропущена игра про агента 007 (защита от зацикливания): %s", r.FileName))
				r.IsNumberedFile = false
				continue
			}

			// If the folder has sequential numbered ROMs, only rename the numbered ROMs!
			if hasNumberedRoms && !r.IsNumberedFile {
				continue
			}

			// Re-attempt lookup in custom XML, embedded factory XML map (using core number key for "000001 (World).chd"), or binary extraction
			if isPureNumberOrGenericTitle(r.CleanTitle) {
				oldBaseLow := strings.ToLower(strings.TrimSuffix(r.FileName, filepath.Ext(r.FileName)))
				coreKey := extractCoreNumberKey(r.FileName)
				resolvedTitle := getGamelistTitleForFile(r.FilePath)
				if resolvedTitle == "" {
					resolvedTitle = factoryR36sNumberMap[oldBaseLow]
				}
				if resolvedTitle == "" && coreKey != "" {
					resolvedTitle = factoryR36sNumberMap[coreKey]
				}
				if resolvedTitle == "" {
					resolvedTitle = extractInternalBinaryRomTitle(r.FilePath, r.Extension, r.ConsoleCode)
				}
				if resolvedTitle != "" && !isPureNumberOrGenericTitle(resolvedTitle) {
					r.ExtractedTitle = resolvedTitle
					r.CleanTitle = extractCleanTitle(resolvedTitle)
					r.ComparisonKey = buildComparisonKey(r.CleanTitle)
					r.Region = parseRegion(resolvedTitle, r.IsRussian)
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
			if !isPureNumberOrGenericTitle(r.CleanTitle) && countLettersInString(r.CleanTitle) >= 2 {
				meta := consoleCatalog[r.ConsoleCode]
				if matched := findBestLibretroMatch(meta.LibretroSystem, r.CleanTitle, r.ComparisonKey, r.Region); matched != "" {
					expanded := extractCleanTitle(matched)
					if expanded != "" && !isPureNumberOrGenericTitle(expanded) && countLettersInString(expanded) >= 2 {
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

			safeNewName := sanitizeFileName(r.CanonicalName)
			newBaseCheck := strings.TrimSuffix(strings.ToLower(safeNewName), filepath.Ext(safeNewName))
			newBaseNoTags := strings.TrimSpace(tagStripRegex.ReplaceAllString(newBaseCheck, ""))
			if strings.EqualFold(r.FileName, safeNewName) || isPureNumberOrGenericTitle(newBaseNoTags) || countLettersInString(newBaseNoTags) < 2 {
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
				safeNewName = sanitizeFileName(fmt.Sprintf("%s [%s]%s", newBase, oldBase, filepath.Ext(safeNewName)))
				targetPath = filepath.Join(romDir, safeNewName)
				newBase = strings.TrimSuffix(safeNewName, filepath.Ext(safeNewName))
			}
			usedNamesPerDir[romDir][strings.ToLower(safeNewName)] = true

			if err := os.Rename(r.FilePath, targetPath); err == nil {
				undoBatch = append(undoBatch, UndoEntry{FromPath: targetPath, ToPath: r.FilePath})
				// Also rename companion .bin if this was a .cue, or .cue if this was a .bin, and sync companion RomItem!
				compOldPath, compNewPath := renameCompanionCueBin(romDir, oldBase, newBase, r.Extension)
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
				relocateExistingMediaForRom(romDir, romDir, oldBase, newBase)

				appendLog(fmt.Sprintf("[НОМЕР -> ИМЯ] %s  ==>  %s", r.FileName, filepath.Base(targetPath)))
				r.FilePath = targetPath
				r.FileName = filepath.Base(targetPath)
				r.IsNumberedFile = false
				renamedCount++
			}
		}

		// Update MediaStatus for all items and write gamelist.xml for ALL ROMs in each console folder
		// so that every ROM on disk has its real name and verified existing image/thumbnail path!
		byDir := make(map[string][]RomItem)
		for idx := range items {
			it := &items[idx]
			if _, err := os.Stat(it.FilePath); err != nil {
				continue
			}
			romDir := filepath.Dir(it.FilePath)
			baseNoExt := strings.TrimSuffix(it.FileName, filepath.Ext(it.FileName))
			imgRel, _, _, vidRel := resolveExistingMediaPathsForRom(romDir, baseNoExt, it.CleanTitle)
			if imgRel != "" && vidRel != "" {
				it.MediaStatus = "✔ Картинка + Видео"
			} else if imgRel != "" {
				it.MediaStatus = "✔ Картинка"
			}
			byDir[romDir] = append(byDir[romDir], *it)
		}
		for consoleDir, dirRoms := range byDir {
			writeArkOSGamelistXML(consoleDir, dirRoms)
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

func renameCompanionCueBin(romDir, oldBase, newBase, ext string) (oldCompanionPath string, newCompanionPath string) {
	if strings.EqualFold(ext, ".bin") {
		oldCue := filepath.Join(romDir, oldBase+".cue")
		newCue := filepath.Join(romDir, newBase+".cue")
		if cueData, err := os.ReadFile(oldCue); err == nil {
			updatedCue := strings.ReplaceAll(string(cueData), oldBase+".bin", newBase+".bin")
			updatedCue = strings.ReplaceAll(updatedCue, oldBase+".BIN", newBase+".bin")
			_ = os.WriteFile(newCue, []byte(updatedCue), 0644)
			if !strings.EqualFold(oldCue, newCue) {
				_ = os.Remove(oldCue)
			}
			return oldCue, newCue
		}
	} else if strings.EqualFold(ext, ".cue") {
		oldBin := filepath.Join(romDir, oldBase+".bin")
		newBin := filepath.Join(romDir, newBase+".bin")
		if _, err := os.Stat(oldBin); err == nil {
			_ = os.Rename(oldBin, newBin)
			newCue := filepath.Join(romDir, newBase+".cue")
			if cueData, err := os.ReadFile(newCue); err == nil {
				updatedCue := strings.ReplaceAll(string(cueData), oldBase+".bin", newBase+".bin")
				updatedCue = strings.ReplaceAll(updatedCue, oldBase+".BIN", newBase+".bin")
				_ = os.WriteFile(newCue, []byte(updatedCue), 0644)
			}
			return oldBin, newBin
		}
	}
	return "", ""
}

// ============================================================================
// BUTTON 6: INTERACTIVE PHANTOM / UNUSED FOLDERS FINDER & CHECKBOX CLEANER
// Protects all R36S (ArkOS / DarkOS) system & console folders so SD card mounting never breaks!
// ============================================================================

var standardMediaDirs = map[string]bool{
	"images":   true,
	"marquees": true,
	"videos":   true,
}

// Critical R36S (ArkOS / DarkOS / EmuELEC) system & console folders on EASYROMS that MUST NEVER be deleted!
var protectedR36SDirs = map[string]bool{
	"bios": true, "tools": true, "themes": true, "ports": true,
	"launchimages": true, "bgmusic": true, "retroarch": true,
	"saves": true, "savestates": true, "backup": true, "backups": true,
	"anbernic": true, "arkos": true, "darkos": true, "emuelec": true,
	"system": true, "config": true, "cheats": true, "overlays": true,
	"shaders": true, "bezels": true, "music": true, "movies": true,
	"kodi": true, "scummvm": true, "dos": true, "pico8": true, "pico-8": true,
	"tic80": true, "openbor": true, "easyrpg": true, "solarushd": true,
	"nes": true, "famicom": true, "fc": true, "fds": true,
	"snes": true, "sfc": true, "superfamicom": true,
	"gb": true, "gbc": true, "gba": true, "nds": true, "n64": true,
	"virtualboy": true, "gamegear": true, "gg": true,
	"mastersystem": true, "sms": true, "genesis": true, "megadrive": true, "md": true,
	"segacd": true, "mega-cd": true, "sega32x": true, "32x": true,
	"saturn": true, "dreamcast": true, "dc": true,
	"psx": true, "ps1": true, "psp": true,
	"atari2600": true, "atari5200": true, "atari7800": true, "lynx": true, "jaguar": true,
	"pcengine": true, "pce": true, "pcenginecd": true, "tg16": true, "supergrafx": true,
	"neogeo": true, "neogeocd": true, "ngp": true, "ngpc": true,
	"wonderswan": true, "wonderswancolor": true,
	"arcade": true, "fbneo": true, "mame": true, "mame2003": true, "mame2003-plus": true,
	"cps1": true, "cps2": true, "cps3": true,
	"amiga": true, "c64": true, "msx": true, "msx2": true,
	"vectrex": true, "coleco": true, "intellivision": true, "zxspectrum": true,
}

var knownPhantomDirReasons = map[string]string{
	"download_images":   "Фантомный дубликат (верный каталог R36S — «images», этот не нужен)",
	"downloaded_images": "Фантомный каталог старого скрепера (верный каталог — «images»)",
	"downloaded_media":  "Лишний каталог стороннего скрепера (не используется ArkOS/DarkOS)",
	"media":             "Нестандартная папка (ArkOS/DarkOS берет обложки из «images»)",
	"boxart":            "Дублирующая папка обложек (верная папка — «images»)",
	"boxarts":           "Дублирующая папка обложек (верная папка — «images»)",
	"snap":              "Старая папка скриншотов (не используется в gamelist.xml)",
	"snaps":             "Старая папка скриншотов (не используется в gamelist.xml)",
	"wheel":             "Старая папка логотипов (в R36S используется «marquees»)",
	"wheels":            "Старая папка логотипов (в R36S используется «marquees»)",
	"banners":           "Нестандартная папка баннеров (в R36S используется «marquees»)",
	"mix":               "Временная папка миксов скрепера (не нужна)",
	"manuals":           "Папка PDF-мануалов (занимает место на флешке)",
	"covers":            "Нестандартная папка обложек (верная папка — «images»)",
	"screenshots":       "Лишняя папка скриншотов (верная папка — «images»)",
	"temp":              "Временная папка",
	"tmp":               "Временная папка",
	"top 100":           "Вложенная подпапка ромов (ромы должны быть в основном каталоге)",
	"top100":            "Вложенная подпапка ромов (ромы должны быть в основном каталоге)",
	"rus":               "Вложенная подпапка ромов (ромы должны быть в основном каталоге)",
}

func scanForPhantomFolders(rootFolder string) []PhantomFolderItem {
	var found []PhantomFolderItem

	_ = filepath.Walk(rootFolder, func(p string, fi os.FileInfo, err error) error {
		if err != nil || !fi.IsDir() {
			return nil
		}
		if filepath.Clean(p) == filepath.Clean(rootFolder) {
			return nil
		}

		name := fi.Name()
		lower := strings.ToLower(name)

		if strings.HasPrefix(name, ".") || name == "$RECYCLE.BIN" || name == "System Volume Information" {
			return filepath.SkipDir
		}

		// Skip the 3 official valid R36S media directories!
		if standardMediaDirs[lower] {
			return filepath.SkipDir
		}

		// Never touch protected R36S system or console directories (bios, tools, ports, themes, gba, psx, etc.)!
		if protectedR36SDirs[lower] {
			return nil
		}
		if _, isConsole := consoleCatalog[lower]; isConsole {
			return nil
		}
		if lower == "organized" || strings.HasPrefix(lower, "1_8bit") || strings.HasPrefix(lower, "2_16bit") || strings.HasPrefix(lower, "3_portable") || strings.HasPrefix(lower, "4_32_64bit") {
			return nil
		}

		// Calculate files & bytes inside this candidate subfolder
		fileCount := 0
		var totalBytes int64
		hasRom := false
		hasMedia := false

		entries, readErr := os.ReadDir(p)
		if readErr == nil {
			for _, e := range entries {
				if !e.IsDir() {
					fileCount++
					if info, sErr := e.Info(); sErr == nil {
						totalBytes += info.Size()
					}
					ext := strings.ToLower(filepath.Ext(e.Name()))
					if _, ok := extToDefaultConsole[ext]; ok || ext == ".zip" {
						hasRom = true
					}
					if ext == ".png" || ext == ".jpg" || ext == ".mp4" {
						hasMedia = true
					}
				}
			}
		}

		rel, relErr := filepath.Rel(rootFolder, p)
		if relErr != nil {
			rel = p
		}

		if reason, isKnownPhantom := knownPhantomDirReasons[lower]; isKnownPhantom {
			found = append(found, PhantomFolderItem{
				FullPath:       p,
				RelativePath:   rel,
				FolderName:     name,
				Reason:         reason,
				FileCount:      fileCount,
				TotalBytes:     totalBytes,
				HasUsefulMedia: hasMedia,
				DefaultChecked: !hasRom, // Auto-check if no unextracted ROMs inside
			})
			return filepath.SkipDir
		}

		if lower == "_duplicates_1g1r" || lower == "_baddumps_junk" {
			found = append(found, PhantomFolderItem{
				FullPath:       p,
				RelativePath:   rel,
				FolderName:     name,
				Reason:         "Карантин отсеянных дубликатов и битых ромов (можно очистить)",
				FileCount:      fileCount,
				TotalBytes:     totalBytes,
				HasUsefulMedia: false,
				DefaultChecked: true,
			})
			return filepath.SkipDir
		}

		// Only flag empty folders if they are subfolders inside a console directory and NOT root EASYROMS folders
		parentBase := strings.ToLower(filepath.Base(filepath.Dir(p)))
		_, parentIsConsole := consoleCatalog[parentBase]
		if len(entries) == 0 && parentIsConsole && !protectedR36SDirs[lower] {
			found = append(found, PhantomFolderItem{
				FullPath:       p,
				RelativePath:   rel,
				FolderName:     name,
				Reason:         "Пустая вложенная подпапка (0 файлов)",
				FileCount:      0,
				TotalBytes:     0,
				HasUsefulMedia: false,
				DefaultChecked: true,
			})
			return filepath.SkipDir
		}

		// Any other non-standard subfolder inside a console folder
		if parentIsConsole {
			reason := "Нестандартная подпапка внутри каталога консоли"
			if hasRom {
				reason = "Подпапка с ромами (нажмите кнопку 2, чтобы вытащить ромы в корень консоли)"
			}
			found = append(found, PhantomFolderItem{
				FullPath:       p,
				RelativePath:   rel,
				FolderName:     name,
				Reason:         reason,
				FileCount:      fileCount,
				TotalBytes:     totalBytes,
				HasUsefulMedia: hasMedia,
				DefaultChecked: !hasRom,
			})
			return filepath.SkipDir
		}

		return nil
	})

	return found
}

func openPhantomFoldersDialog(hwnd uintptr) {
	rootFolder := strings.TrimSpace(getWindowText(hEditPath))
	if rootFolder == "" {
		return
	}

	found := scanForPhantomFolders(rootFolder)
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
	list := make([]PhantomFolderItem, len(phantomFolders))
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
			formatBytes(pf.TotalBytes),
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
	list := make([]PhantomFolderItem, len(phantomFolders))
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
		deletedDirs, rescuedImages, formatBytes(freedBytes),
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

func resolveHierarchyBaseRoot(selectedRoot string) string {
	baseName := strings.ToLower(filepath.Base(filepath.Clean(selectedRoot)))
	if _, isConsoleDir := consoleCatalog[baseName]; isConsoleDir {
		return filepath.Dir(filepath.Clean(selectedRoot))
	}
	return filepath.Clean(selectedRoot)
}

func resolveWinnerTargetDir(selectedRoot string, modeIdx uintptr, r RomItem) string {
	baseRoot := resolveHierarchyBaseRoot(selectedRoot)
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
	items := make([]RomItem, len(scannedRoms))
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
		baseRoot := resolveHierarchyBaseRoot(rootFolder)

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

			safeCanonical := sanitizeFileName(r.CanonicalName)
			if strings.EqualFold(filepath.Ext(r.FileName), ".zip") && !strings.EqualFold(filepath.Ext(safeCanonical), ".zip") {
				safeCanonical = strings.TrimSuffix(safeCanonical, filepath.Ext(safeCanonical)) + ".zip"
			}

			targetPath := filepath.Join(targetDir, safeCanonical)
			newBaseNoExt := strings.TrimSuffix(safeCanonical, filepath.Ext(safeCanonical))

			relocateExistingMediaForRom(oldRomDir, targetDir, oldBaseNoExt, newBaseNoExt)

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
				renameCompanionCueBin(oldRomDir, oldBaseNoExt, newBaseNoExt, r.Extension)
				r.FilePath = targetPath
				r.FileName = filepath.Base(targetPath)
				relSub, _, _ := analyzeSubfolderContext(baseRoot, targetPath)
				r.SourceSubfolder = relSub
				appendLog(fmt.Sprintf("[В ОСНОВНОЙ КАТАЛОГ] %s -> %s", r.FileName, relSub))
			}
		}

		removedDirs := removeEmptySubfolders(rootFolder)
		if removedDirs > 0 {
			appendLog(fmt.Sprintf("Очищено опустевших подкаталогов: %d", removedDirs))
		}

		stateMu.Lock()
		scannedRoms = items
		undoHistory = undoBatch
		stateMu.Unlock()

		deletedOrphans, _ := cleanOrphanedMediaInternal(baseRoot)
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

// Resolve actual existing media files on disk for a ROM so gamelist.xml NEVER points to non-existent -image.png/-thumb.png files!
func resolveExistingMediaPathsForRom(consoleDir, baseNoExt, cleanTitle string) (imgRel, thumbRel, marqueeRel, videoRel string) {
	if consoleDir == "" {
		return "", "", "", ""
	}

	checkRelFile := func(rel string) string {
		rel = strings.TrimSpace(rel)
		if rel == "" {
			return ""
		}
		cleanRel := strings.TrimPrefix(strings.ReplaceAll(rel, "\\", "/"), "./")
		cleanRel = strings.TrimPrefix(cleanRel, "/")
		fullPath := filepath.Join(consoleDir, filepath.FromSlash(cleanRel))
		if fi, err := os.Stat(fullPath); err == nil && !fi.IsDir() && fi.Size() > 0 {
			return "./" + cleanRel
		}
		return ""
	}

	// 1. Check if gamelist.xml (or backup) already has valid existing paths for this ROM
	_, entryMap := loadGamelistMapsForDir(consoleDir)
	for _, keyCandidate := range []string{strings.ToLower(baseNoExt), strings.ToLower(cleanTitle), strings.ToLower(sanitizeFileName(cleanTitle))} {
		if keyCandidate == "" {
			continue
		}
		if ge, ok := entryMap[keyCandidate]; ok {
			if imgRel == "" {
				imgRel = checkRelFile(ge.Image)
			}
			if thumbRel == "" {
				thumbRel = checkRelFile(ge.Thumbnail)
			}
			if marqueeRel == "" {
				marqueeRel = checkRelFile(ge.Marquee)
			}
			if videoRel == "" {
				videoRel = checkRelFile(ge.Video)
			}
		}
	}

	// 2. Probe candidate base names (current ROM base, sanitized title, stripped numeric prefix)
	var candidateBases []string
	seenBase := make(map[string]bool)
	addCandidate := func(b string) {
		b = strings.TrimSpace(b)
		if b == "" {
			return
		}
		low := strings.ToLower(b)
		if !seenBase[low] {
			seenBase[low] = true
			candidateBases = append(candidateBases, b)
		}
	}
	addCandidate(baseNoExt)
	if cleanTitle != "" {
		addCandidate(sanitizeFileName(cleanTitle))
		addCandidate(cleanTitle)
	}

	imgDirs := []string{"images", "downloaded_images", "download_images", "boxart", "snap", "covers"}
	imgSuffixes := []string{"-image.png", ".png", "-image.jpg", ".jpg", ".jpeg", "-boxart.png", "-boxart.jpg", "-snap.png", "-thumb.png", "-thumb.jpg"}
	thumbSuffixes := []string{"-thumb.png", "-thumb.jpg", "-image.png", ".png", ".jpg", ".jpeg", "-snap.png"}

	if imgRel == "" {
		for _, b := range candidateBases {
			for _, d := range imgDirs {
				for _, sfx := range imgSuffixes {
					if found := checkRelFile(d + "/" + b + sfx); found != "" {
						imgRel = found
						break
					}
				}
				if imgRel != "" {
					break
				}
			}
			if imgRel != "" {
				break
			}
		}
	}

	if thumbRel == "" {
		for _, b := range candidateBases {
			for _, d := range imgDirs {
				for _, sfx := range thumbSuffixes {
					if found := checkRelFile(d + "/" + b + sfx); found != "" {
						thumbRel = found
						break
					}
				}
				if thumbRel != "" {
					break
				}
			}
			if thumbRel != "" {
				break
			}
		}
	}
	// Fallback: if image exists on disk, use it as thumbnail too so R36S grid/boxart view never shows an empty image!
	if thumbRel == "" && imgRel != "" {
		thumbRel = imgRel
	}
	if imgRel == "" && thumbRel != "" {
		imgRel = thumbRel
	}

	marqueeDirs := []string{"marquees", "banners", "wheels", "images", "downloaded_images"}
	marqueeSuffixes := []string{"-marquee.png", "-marquee.jpg", "-banner.png", "-wheel.png", ".png", ".jpg"}
	if marqueeRel == "" {
		for _, b := range candidateBases {
			for _, d := range marqueeDirs {
				for _, sfx := range marqueeSuffixes {
					// Avoid picking normal boxart in "images/" as marquee unless it has -marquee/-banner/-wheel suffix
					if (d == "images" || d == "downloaded_images") && (sfx == ".png" || sfx == ".jpg") {
						continue
					}
					if found := checkRelFile(d + "/" + b + sfx); found != "" {
						marqueeRel = found
						break
					}
				}
				if marqueeRel != "" {
					break
				}
			}
			if marqueeRel != "" {
				break
			}
		}
	}

	videoDirs := []string{"videos", "snap", "images"}
	videoSuffixes := []string{"-video.mp4", ".mp4"}
	if videoRel == "" {
		for _, b := range candidateBases {
			for _, d := range videoDirs {
				for _, sfx := range videoSuffixes {
					if found := checkRelFile(d + "/" + b + sfx); found != "" {
						videoRel = found
						break
					}
				}
				if videoRel != "" {
					break
				}
			}
			if videoRel != "" {
				break
			}
		}
	}

	return imgRel, thumbRel, marqueeRel, videoRel
}

// Relocate & rename media from both standard ("images") and phantom ("download_images", "downloaded_images", "boxart") folders
// while preserving image file extensions (.png / .jpg) and keeping both plain and -image/-thumb names for 100% R36S compatibility!
func relocateExistingMediaForRom(oldRomDir, newRomDir, oldBase, newBase string) {
	mediaSpecs := []struct {
		srcSubDir string
		dstSubDir string
		suffix    string
	}{
		{"images", "images", "-image.png"},
		{"images", "images", "-thumb.png"},
		{"images", "images", "-marquee.png"},
		{"images", "images", "-image.jpg"},
		{"images", "images", "-thumb.jpg"},
		{"images", "images", "-marquee.jpg"},
		{"images", "images", ".png"},
		{"images", "images", ".bmp"},
		{"images", "images", ".jpg"},
		{"images", "images", ".jpeg"},
		{"downloaded_images", "images", "-image.png"},
		{"downloaded_images", "images", "-thumb.png"},
		{"downloaded_images", "images", ".png"},
		{"downloaded_images", "images", ".jpg"},
		{"downloaded_images", "images", ".jpeg"},
		{"download_images", "images", "-image.png"},
		{"download_images", "images", ".png"},
		{"download_images", "images", ".jpg"},
		{"boxart", "images", ".png"},
		{"boxart", "images", ".jpg"},
		{"snap", "images", ".png"},
		{"snap", "images", ".jpg"},
		{"marquees", "marquees", "-marquee.png"},
		{"marquees", "marquees", ".png"},
		{"marquees", "marquees", ".jpg"},
		{"wheels", "marquees", ".png"},
		{"videos", "videos", "-video.mp4"},
		{"videos", "videos", ".mp4"},
		{"snap", "videos", ".mp4"},
	}

	// Also rename companion .srm save file if present
	oldSrm := filepath.Join(oldRomDir, oldBase+".srm")
	newSrm := filepath.Join(newRomDir, newBase+".srm")
	if _, err := os.Stat(oldSrm); err == nil && !strings.EqualFold(oldSrm, newSrm) {
		_ = os.Rename(oldSrm, newSrm)
	}

	for _, ms := range mediaSpecs {
		src := filepath.Join(oldRomDir, ms.srcSubDir, oldBase+ms.suffix)
		if fi, err := os.Stat(src); err == nil && !fi.IsDir() {
			ext := filepath.Ext(ms.suffix)
			dstSuffix := ms.suffix
			if (ms.suffix == ".png" || ms.suffix == ".bmp" || ms.suffix == ".jpg" || ms.suffix == ".jpeg") && ms.dstSubDir == "images" {
				dstSuffix = "-image" + ext
			} else if (ms.suffix == ".png" || ms.suffix == ".jpg") && ms.dstSubDir == "marquees" {
				dstSuffix = "-marquee" + ext
			} else if ms.suffix == ".mp4" {
				dstSuffix = "-video.mp4"
			}
			targetDir := filepath.Join(newRomDir, ms.dstSubDir)
			_ = os.MkdirAll(targetDir, 0755)
			dst := filepath.Join(targetDir, newBase+dstSuffix)
			if !strings.EqualFold(filepath.Clean(src), filepath.Clean(dst)) {
				_ = os.Rename(src, dst)
			}
			// Also ensure plain name (e.g. images/<newBase>.png) and -thumb exist so any R36S theme finds the picture
			if ms.dstSubDir == "images" && dstSuffix != "-marquee"+ext {
				plainDst := filepath.Join(targetDir, newBase+ext)
				if _, err := os.Stat(plainDst); err != nil {
					_ = copyLocalFile(dst, plainDst)
				}
				thumbDst := filepath.Join(targetDir, newBase+"-thumb"+ext)
				if _, err := os.Stat(thumbDst); err != nil {
					_ = copyLocalFile(dst, thumbDst)
				}
			}
		}
	}
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
		baseRoot := resolveHierarchyBaseRoot(rootFolder)
		deletedCount, freedBytes := cleanOrphanedMediaInternal(baseRoot)
		if filepath.Clean(baseRoot) != filepath.Clean(rootFolder) {
			d2, b2 := cleanOrphanedMediaInternal(rootFolder)
			deletedCount += d2
			freedBytes += b2
		}

		procPostMessageW.Call(hwnd, WM_APP_CLEAN_MEDIA_DONE, uintptr(deletedCount), uintptr(freedBytes))
	}()
}

func cleanOrphanedMediaInternal(searchRoot string) (deletedFiles int, freedBytes int64) {
	mediaFolderNames := map[string]bool{
		"images":            true,
		"download_images":   true,
		"downloaded_images": true,
		"marquees":          true,
		"banners":           true,
		"videos":            true,
		"snap":              true,
		"boxart":            true,
		"wheels":            true,
	}

	var mediaDirs []string
	_ = filepath.Walk(searchRoot, func(p string, fi os.FileInfo, err error) error {
		if err != nil || !fi.IsDir() {
			return nil
		}
		name := fi.Name()
		if name == "_Duplicates_1G1R" || name == "_BadDumps_Junk" {
			return filepath.SkipDir
		}
		if mediaFolderNames[strings.ToLower(name)] {
			mediaDirs = append(mediaDirs, p)
			return filepath.SkipDir
		}
		return nil
	})

	mediaSuffixes := []string{
		"-image", "-thumb", "-marquee", "-video", "-banner", "-boxart", "-snap", "-wheel", "-fanart",
	}

	for _, mDir := range mediaDirs {
		consoleDir := filepath.Dir(mDir)

		activeRomBases := make(map[string]string)
		activeRomNorms := make(map[string]string)

		dirEntries, err := os.ReadDir(consoleDir)
		if err != nil {
			continue
		}
		for _, de := range dirEntries {
			if de.IsDir() {
				continue
			}
			ext := strings.ToLower(filepath.Ext(de.Name()))
			if _, isRom := extToDefaultConsole[ext]; isRom || ext == ".zip" {
				base := strings.TrimSuffix(de.Name(), filepath.Ext(de.Name()))
				activeRomBases[strings.ToLower(base)] = base
				norm := buildComparisonKey(extractCleanTitle(de.Name()))
				if norm != "" {
					activeRomNorms[norm] = base
				}
			}
		}

		mFiles, err := os.ReadDir(mDir)
		if err != nil {
			continue
		}
		for _, mf := range mFiles {
			if mf.IsDir() {
				continue
			}
			mPath := filepath.Join(mDir, mf.Name())
			mExt := strings.ToLower(filepath.Ext(mf.Name()))
			if mExt != ".png" && mExt != ".jpg" && mExt != ".jpeg" && mExt != ".mp4" && mExt != ".avi" && mExt != ".mkv" && mExt != ".gif" {
				continue
			}

			baseNoExt := strings.TrimSuffix(mf.Name(), filepath.Ext(mf.Name()))
			strippedBase := baseNoExt
			matchedSuffix := ""
			for _, sfx := range mediaSuffixes {
				if strings.HasSuffix(strings.ToLower(strippedBase), sfx) {
					strippedBase = strippedBase[:len(strippedBase)-len(sfx)]
					matchedSuffix = sfx
					break
				}
			}

			if _, exists := activeRomBases[strings.ToLower(strippedBase)]; exists {
				continue
			}

			mediaNorm := buildComparisonKey(extractCleanTitle(strippedBase))
			if targetRomBase, exists := activeRomNorms[mediaNorm]; exists && mediaNorm != "" {
				newMediaName := targetRomBase + matchedSuffix + mExt
				newMediaPath := filepath.Join(mDir, newMediaName)
				if _, statErr := os.Stat(newMediaPath); statErr != nil {
					_ = os.Rename(mPath, newMediaPath)
					appendLog(fmt.Sprintf("[ПРИВЯЗАНО МЕДИА] %s -> %s", mf.Name(), newMediaName))
					continue
				}
			}

			var fSize int64
			if fi, statErr := mf.Info(); statErr == nil {
				fSize = fi.Size()
			}
			if err := os.Remove(mPath); err == nil {
				deletedFiles++
				freedBytes += fSize
				appendLog(fmt.Sprintf("[УДАЛЕНО ЛИШНЕЕ МЕДИА] %s\\%s (ром отсутствует)", filepath.Base(mDir), mf.Name()))
			}
		}
	}

	return deletedFiles, freedBytes
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
	items := make([]RomItem, len(scannedRoms))
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
		meta, ok := consoleCatalog[cCode]
		if !ok {
			continue
		}
		appendLog(fmt.Sprintf("Загрузка базы имен и баннеров Libretro для %s...", meta.DisplayName))
		_ = getOrLoadLibretroIndex(meta.LibretroSystem)
		if downloadVideos && meta.ArchiveVideoID != "" {
			appendLog(fmt.Sprintf("Загрузка базы коротких видео (.mp4) R36S для %s...", meta.DisplayName))
			_ = getOrLoadArchiveVideoIndex(meta.ArchiveVideoID)
		}
	}

	scrapedCount := 0
	videoCount := 0

	for pos, idx := range winnerIndices {
		r := &items[idx]
		meta, ok := consoleCatalog[r.ConsoleCode]
		if !ok {
			meta = consoleCatalog["nes"]
		}

		romDir := filepath.Dir(r.FilePath)
		imagesDir := filepath.Join(romDir, "images")
		marqueesDir := filepath.Join(romDir, "marquees")
		videosDir := filepath.Join(romDir, "videos")

		_ = os.MkdirAll(imagesDir, 0755)
		_ = os.MkdirAll(marqueesDir, 0755)
		_ = os.MkdirAll(videosDir, 0755)

		matchedLibretroName := findBestLibretroMatch(meta.LibretroSystem, r.CleanTitle, r.ComparisonKey, r.Region)
		if matchedLibretroName != "" {
			cleanMatchedTitle := extractCleanTitle(matchedLibretroName)
			if cleanMatchedTitle != "" && !pureNumberRegex.MatchString(cleanMatchedTitle) {
				r.CleanTitle = cleanMatchedTitle
			}
		}

		romBaseNoExt := strings.TrimSuffix(r.FileName, filepath.Ext(r.FileName))

		imgTarget := filepath.Join(imagesDir, romBaseNoExt+"-image.png")
		thumbTarget := filepath.Join(imagesDir, romBaseNoExt+"-thumb.png")
		marqueeTarget := filepath.Join(marqueesDir, romBaseNoExt+"-marquee.png")
		videoTarget := filepath.Join(videosDir, romBaseNoExt+"-video.mp4")

		// Check if valid media already exists on disk for this ROM
		existingImg, existingThumb, existingMarquee, existingVid := resolveExistingMediaPathsForRom(romDir, romBaseNoExt, r.CleanTitle)
		gotBoxart := existingImg != ""
		gotMarquee := existingMarquee != ""
		gotVideo := existingVid != ""

		if matchedLibretroName != "" {
			sysEsc := url.PathEscape(meta.LibretroSystem)
			fileEsc := url.PathEscape(matchedLibretroName + ".png")

			boxURL := fmt.Sprintf("https://thumbnails.libretro.com/%s/Named_Boxarts/%s", sysEsc, fileEsc)
			snapURL := fmt.Sprintf("https://thumbnails.libretro.com/%s/Named_Snaps/%s", sysEsc, fileEsc)
			titleURL := fmt.Sprintf("https://thumbnails.libretro.com/%s/Named_Titles/%s", sysEsc, fileEsc)

			if !gotBoxart && downloadFileHTTP(boxURL, imgTarget, 15*time.Second) {
				gotBoxart = true
			}
			if existingThumb == "" && downloadFileHTTP(snapURL, thumbTarget, 15*time.Second) {
				if !gotBoxart {
					_ = copyLocalFile(thumbTarget, imgTarget)
					gotBoxart = true
				}
			} else if gotBoxart && existingThumb == "" {
				if _, err := os.Stat(imgTarget); err == nil {
					_ = copyLocalFile(imgTarget, thumbTarget)
				}
			}

			if !gotMarquee && downloadFileHTTP(titleURL, marqueeTarget, 15*time.Second) {
				gotMarquee = true
			}
		}

		if !gotBoxart {
			_ = generateFallbackCoverPNG(imgTarget, r.CleanTitle, strings.ToUpper(r.ConsoleCode), r.Region, 400, 400)
			_ = copyLocalFile(imgTarget, thumbTarget)
			gotBoxart = true
		}
		if !gotMarquee {
			_ = generateFallbackCoverPNG(marqueeTarget, r.CleanTitle, strings.ToUpper(r.ConsoleCode), "BANNER", 400, 140)
			gotMarquee = true
		}

		if !gotVideo && downloadVideos && meta.ArchiveVideoID != "" {
			matchedVidFile := findBestArchiveVideoMatch(meta.ArchiveVideoID, r.CleanTitle, r.ComparisonKey)
			if matchedVidFile != "" {
				vidURL := fmt.Sprintf("https://archive.org/download/%s/%s", meta.ArchiveVideoID, url.PathEscape(matchedVidFile))
				if downloadFileHTTP(vidURL, videoTarget, 35*time.Second) {
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

	byDir := make(map[string][]RomItem)
	for _, it := range items {
		d := filepath.Dir(it.FilePath)
		byDir[d] = append(byDir[d], it)
	}

	for consoleDir, dirRoms := range byDir {
		writeArkOSGamelistXML(consoleDir, dirRoms)
		appendLog(fmt.Sprintf("[GAMELIST.XML] Обновлен список игр R36S в: %s (%d игр)", consoleDir, len(dirRoms)))
	}

	stateMu.Lock()
	scannedRoms = items
	stateMu.Unlock()

	procPostMessageW.Call(hwnd, WM_APP_SCRAPE_DONE, uintptr(scrapedCount), uintptr(videoCount))
}

func writeArkOSGamelistXML(consoleDir string, roms []RomItem) {
	// 1. Always preserve a backup of the original factory gamelist.xml before modifying it!
	origGamelistPath := filepath.Join(consoleDir, "gamelist.xml")
	backupGamelistPath := filepath.Join(consoleDir, "gamelist_factory_backup.xml")
	if _, err := os.Stat(backupGamelistPath); err != nil {
		if origBytes, readErr := os.ReadFile(origGamelistPath); readErr == nil && len(origBytes) > 32 {
			_ = os.WriteFile(backupGamelistPath, origBytes, 0644)
		}
	}

	titleMap, existingEntries := loadGamelistMapsForDir(consoleDir)

	// Deduplicate by lowercase FileName and skip raw companion .bin tracks if a .cue/.m3u exists for the same base
	cueBases := make(map[string]bool)
	for _, r := range roms {
		ext := strings.ToLower(filepath.Ext(r.FileName))
		if ext == ".cue" || ext == ".m3u" || ext == ".ccd" {
			base := strings.ToLower(strings.TrimSuffix(r.FileName, filepath.Ext(r.FileName)))
			cueBases[base] = true
		}
	}

	seenFiles := make(map[string]bool)
	var gl GameListXML

	for _, r := range roms {
		if _, err := os.Stat(r.FilePath); err != nil {
			continue
		}
		lowFile := strings.ToLower(r.FileName)
		if seenFiles[lowFile] {
			continue
		}
		ext := strings.ToLower(filepath.Ext(r.FileName))
		baseNoExt := strings.TrimSuffix(r.FileName, filepath.Ext(r.FileName))
		if (ext == ".bin" || ext == ".img" || ext == ".sub") && cueBases[strings.ToLower(baseNoExt)] {
			continue
		}
		seenFiles[lowFile] = true

		displayName := strings.TrimSpace(r.CleanTitle)
		// Never write a raw number like "000001" over a real title from gamelist or binary header!
		if displayName == "" || pureNumberRegex.MatchString(displayName) {
			if savedTitle, ok := titleMap[strings.ToLower(baseNoExt)]; ok && savedTitle != "" && !pureNumberRegex.MatchString(savedTitle) {
				displayName = savedTitle
			} else if hdrTitle := extractInternalBinaryRomTitle(r.FilePath, ext, r.ConsoleCode); hdrTitle != "" && !pureNumberRegex.MatchString(hdrTitle) {
				displayName = hdrTitle
			} else if displayName == "" {
				displayName = baseNoExt
			}
		}

		if r.IsRussian && !strings.Contains(strings.ToUpper(displayName), "[RUS]") {
			displayName += " [RUS]"
		}

		meta := consoleCatalog[r.ConsoleCode]
		desc := fmt.Sprintf(
			"Игра: %s | Консоль: %s (%s) | Регион: %s | CRC32: %s.",
			displayName, meta.DisplayName, r.Generation, r.Region, r.HeaderlessCRC32,
		)
		rating := "0.9"
		genre := meta.DisplayName

		if prev, ok := existingEntries[strings.ToLower(baseNoExt)]; ok {
			if strings.TrimSpace(prev.Desc) != "" && !strings.Contains(prev.Desc, "Подготовлено AegisROM") {
				desc = prev.Desc
			}
			if strings.TrimSpace(prev.Rating) != "" {
				rating = prev.Rating
			}
			if strings.TrimSpace(prev.Genre) != "" {
				genre = prev.Genre
			}
		}

		// Resolve actual existing media files on disk so we NEVER write broken -image.png/-thumb.png paths!
		imgRel, thumbRel, marqueeRel, videoRel := resolveExistingMediaPathsForRom(consoleDir, baseNoExt, displayName)

		entry := GameEntryXML{
			Path:      "./" + r.FileName,
			Name:      displayName,
			Desc:      desc,
			Image:     imgRel,
			Thumbnail: thumbRel,
			Marquee:   marqueeRel,
			Video:     videoRel,
			Rating:    rating,
			Genre:     genre,
			Region:    r.Region,
		}

		gl.Games = append(gl.Games, entry)
	}

	// Also preserve any existing entries in gamelist.xml for files in consoleDir that weren't in roms slice
	for _, prev := range existingEntries {
		cleanP := strings.TrimPrefix(strings.ReplaceAll(strings.TrimSpace(prev.Path), "\\", "/"), "./")
		cleanP = strings.TrimPrefix(cleanP, "/")
		fName := filepath.Base(cleanP)
		if fName == "" || fName == "." || seenFiles[strings.ToLower(fName)] {
			continue
		}
		fullP := filepath.Join(consoleDir, fName)
		if _, err := os.Stat(fullP); err != nil {
			continue
		}
		seenFiles[strings.ToLower(fName)] = true
		baseNoExt := strings.TrimSuffix(fName, filepath.Ext(fName))
		fExt := strings.ToLower(filepath.Ext(fName))
		cCode := detectConsoleCode(fullP, fExt)

		name := strings.TrimSpace(prev.Name)
		if name == "" || pureNumberRegex.MatchString(name) {
			if hdr := extractInternalBinaryRomTitle(fullP, fExt, cCode); hdr != "" && !pureNumberRegex.MatchString(hdr) {
				name = hdr
			} else if name == "" {
				name = baseNoExt
			}
		}
		imgRel, thumbRel, marqueeRel, videoRel := resolveExistingMediaPathsForRom(consoleDir, baseNoExt, name)
		prev.Path = "./" + fName
		prev.Name = name
		if imgRel != "" {
			prev.Image = imgRel
		}
		if thumbRel != "" {
			prev.Thumbnail = thumbRel
		}
		if marqueeRel != "" {
			prev.Marquee = marqueeRel
		}
		if videoRel != "" {
			prev.Video = videoRel
		}
		gl.Games = append(gl.Games, prev)
	}

	// Clear gamelist cache for this dir so subsequent scans read the updated XML
	cacheMu.Lock()
	delete(gamelistTitleCache, filepath.Clean(consoleDir))
	delete(gamelistEntryCache, filepath.Clean(consoleDir))
	cacheMu.Unlock()

	xmlBytes, err := xml.MarshalIndent(gl, "", "  ")
	if err == nil {
		fullXML := append([]byte(xml.Header), xmlBytes...)
		_ = os.WriteFile(origGamelistPath, fullXML, 0644)
	}
}

func tokenizeNormalized(s string) map[string]bool {
	res := make(map[string]bool)
	var cur strings.Builder
	for _, r := range strings.ToLower(s) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			cur.WriteRune(r)
		} else if cur.Len() > 0 {
			tok := cur.String()
			if len(tok) > 1 && tok != "the" && tok != "and" && tok != "version" {
				res[tok] = true
			}
			cur.Reset()
		}
	}
	if cur.Len() > 0 {
		tok := cur.String()
		if len(tok) > 1 && tok != "the" && tok != "and" && tok != "version" {
			res[tok] = true
		}
	}
	return res
}

func getOrLoadLibretroIndex(libretroSystem string) []libretroEntry {
	cacheMu.Lock()
	if cached, ok := libretroIndexCache[libretroSystem]; ok {
		cacheMu.Unlock()
		return cached
	}
	cacheMu.Unlock()

	indexURL := fmt.Sprintf("https://thumbnails.libretro.com/%s/Named_Boxarts/", url.PathEscape(libretroSystem))
	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Get(indexURL)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil
	}

	matches := hrefPngRegex.FindAllStringSubmatch(string(body), -1)
	var entries []libretroEntry
	for _, m := range matches {
		if len(m) < 2 {
			continue
		}
		decoded, err := url.QueryUnescape(m[1])
		if err != nil {
			continue
		}
		noExt := strings.TrimSuffix(decoded, ".png")
		clean := extractCleanTitle(noExt)
		entries = append(entries, libretroEntry{
			FileName: noExt,
			NormKey:  buildComparisonKey(clean),
			Tokens:   tokenizeNormalized(clean),
		})
	}

	cacheMu.Lock()
	libretroIndexCache[libretroSystem] = entries
	cacheMu.Unlock()
	return entries
}

func findBestLibretroMatch(libretroSystem, cleanTitle, compKey, preferredRegion string) string {
	entries := getOrLoadLibretroIndex(libretroSystem)
	if len(entries) == 0 {
		return fmt.Sprintf("%s (%s)", cleanTitle, preferredRegion)
	}

	var exactCandidates []string
	for _, e := range entries {
		if e.NormKey == compKey {
			exactCandidates = append(exactCandidates, e.FileName)
		}
	}
	if len(exactCandidates) > 0 {
		for _, c := range exactCandidates {
			if strings.Contains(strings.ToLower(c), strings.ToLower(preferredRegion)) {
				return c
			}
		}
		for _, c := range exactCandidates {
			if strings.Contains(c, "(USA") || strings.Contains(c, "(World") {
				return c
			}
		}
		return exactCandidates[0]
	}

	targetTokens := tokenizeNormalized(cleanTitle)
	if len(targetTokens) == 0 {
		return ""
	}

	bestName := ""
	bestScore := 0.0

	for _, e := range entries {
		if len(e.Tokens) == 0 {
			continue
		}
		common := 0
		for t := range targetTokens {
			if e.Tokens[t] {
				common++
			}
		}
		if common == 0 {
			continue
		}
		union := len(targetTokens) + len(e.Tokens) - common
		score := float64(common) / float64(union)
		if strings.Contains(e.FileName, "(USA") {
			score += 0.05
		}
		if score > bestScore {
			bestScore = score
			bestName = e.FileName
		}
	}

	if bestScore >= 0.55 {
		return bestName
	}
	return ""
}

func getOrLoadArchiveVideoIndex(archiveID string) []archiveVideoEntry {
	cacheMu.Lock()
	if cached, ok := archiveVideoCache[archiveID]; ok {
		cacheMu.Unlock()
		return cached
	}
	cacheMu.Unlock()

	metaURL := fmt.Sprintf("https://archive.org/metadata/%s/files", archiveID)
	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Get(metaURL)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()

	var payload struct {
		Result []struct {
			Name string `json:"name"`
		} `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil
	}

	var entries []archiveVideoEntry
	for _, f := range payload.Result {
		if !strings.HasSuffix(strings.ToLower(f.Name), ".mp4") || strings.HasSuffix(strings.ToLower(f.Name), ".ia.mp4") {
			continue
		}
		clean := extractCleanTitle(f.Name)
		entries = append(entries, archiveVideoEntry{
			FileName: f.Name,
			NormKey:  buildComparisonKey(clean),
			Tokens:   tokenizeNormalized(clean),
		})
	}

	cacheMu.Lock()
	archiveVideoCache[archiveID] = entries
	cacheMu.Unlock()
	return entries
}

func findBestArchiveVideoMatch(archiveID, cleanTitle, compKey string) string {
	entries := getOrLoadArchiveVideoIndex(archiveID)
	if len(entries) == 0 {
		return ""
	}

	for _, e := range entries {
		if e.NormKey == compKey {
			return e.FileName
		}
	}

	targetTokens := tokenizeNormalized(cleanTitle)
	if len(targetTokens) == 0 {
		return ""
	}

	bestFile := ""
	bestScore := 0.0
	for _, e := range entries {
		if len(e.Tokens) == 0 {
			continue
		}
		common := 0
		for t := range targetTokens {
			if e.Tokens[t] {
				common++
			}
		}
		if common == 0 {
			continue
		}
		union := len(targetTokens) + len(e.Tokens) - common
		score := float64(common) / float64(union)
		if score > bestScore {
			bestScore = score
			bestFile = e.FileName
		}
	}

	if bestScore >= 0.55 {
		return bestFile
	}
	return ""
}

func downloadFileHTTP(rawURL, destPath string, timeout time.Duration) bool {
	if fi, err := os.Stat(destPath); err == nil && fi.Size() > 256 {
		return true
	}
	client := &http.Client{Timeout: timeout}
	resp, err := client.Get(rawURL)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return false
	}
	out, err := os.Create(destPath)
	if err != nil {
		return false
	}
	written, err := io.Copy(out, resp.Body)
	out.Close()
	if err != nil || written < 256 {
		_ = os.Remove(destPath)
		return false
	}
	return true
}

func copyLocalFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, in)
	return err
}

func generateFallbackCoverPNG(destPath, title, consoleName, badge string, width, height int) error {
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			border := x < 6 || x >= width-6 || y < 6 || y >= height-6
			if border {
				img.Set(x, y, color.RGBA{R: 16, G: 185, B: 129, A: 255})
			} else if y < 44 {
				img.Set(x, y, color.RGBA{R: 30, G: 41, B: 59, A: 255})
			} else {
				r := uint8(15 + (y*20)/height)
				g := uint8(23 + (x*20)/width)
				b := uint8(42 + (y*35)/height)
				img.Set(x, y, color.RGBA{R: r, G: g, B: b, A: 255})
			}
		}
	}
	f, err := os.Create(destPath)
	if err != nil {
		return err
	}
	defer f.Close()
	return png.Encode(f, img)
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
	_ = removeEmptySubfolders(rootFolder)

	stateMu.Lock()
	isBusy = false
	stateMu.Unlock()

	procEnableWindow.Call(hBtnUndo, 0)
	appendLog(fmt.Sprintf("Откат завершен. Восстановлено файлов на прежние места: %d.", restored))
	startScan(hwnd)
}

func removeEmptySubfolders(root string) int {
	removed := 0
	var dirs []string
	_ = filepath.Walk(root, func(p string, fi os.FileInfo, err error) error {
		if err == nil && fi.IsDir() && filepath.Clean(p) != filepath.Clean(root) {
			base := strings.ToLower(fi.Name())
			// NEVER delete R36S media folders or R36S system/console directories!
			if standardMediaDirs[base] || protectedR36SDirs[base] {
				return nil
			}
			if _, isConsole := consoleCatalog[base]; isConsole {
				return nil
			}
			dirs = append(dirs, p)
		}
		return nil
	})
	sort.Slice(dirs, func(i, j int) bool {
		return len(dirs[i]) > len(dirs[j])
	})
	for _, d := range dirs {
		entries, err := os.ReadDir(d)
		if err == nil && len(entries) == 0 {
			if os.Remove(d) == nil {
				removed++
			}
		}
	}
	return removed
}

// Repair broken gamelist.xml bindings and restore empty pictures/names in a console folder
func repairGamelistAndMediaBindingsInDir(consoleDir string) int {
	entries, err := os.ReadDir(consoleDir)
	if err != nil {
		return 0
	}
	var romsInDir []RomItem
	for _, de := range entries {
		if de.IsDir() {
			continue
		}
		ext := strings.ToLower(filepath.Ext(de.Name()))
		if _, ok := extToDefaultConsole[ext]; ok || ext == ".zip" {
			fPath := filepath.Join(consoleDir, de.Name())
			fi, err := de.Info()
			if err != nil || fi.Size() == 0 {
				continue
			}
			item, ok := inspectRomFile(consoleDir, fPath)
			if ok {
				romsInDir = append(romsInDir, item)
			}
		}
	}
	if len(romsInDir) == 0 {
		return 0
	}
	writeArkOSGamelistXML(consoleDir, romsInDir)
	return len(romsInDir)
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

	baseRoot := resolveHierarchyBaseRoot(rawPath)
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
			n := repairGamelistAndMediaBindingsInDir(rawPath)
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
			if _, isCon := consoleCatalog[strings.ToLower(re.Name())]; isCon {
				if _, err := os.Stat(filepath.Join(cDir, "gamelist.xml")); err == nil {
					n := repairGamelistAndMediaBindingsInDir(cDir)
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

func sanitizeFileName(name string) string {
	invalid := []string{"<", ">", ":", "\"", "/", "\\", "|", "?", "*"}
	res := name
	for _, ch := range invalid {
		res = strings.ReplaceAll(res, ch, "_")
	}
	return strings.TrimSpace(res)
}

// ============================================================================
// UNIFIED INTERACTIVE XML & DEEP HEADER MAPPING INSPECTOR (v5.0)
// Matches "000001 (World).chd" and "000001.chd" against custom XML, gamelist.xml & binary headers!
// ============================================================================

func parseSingleXmlFileMaps(xmlPath string) (map[string]string, map[string]GameEntryXML) {
	tMap := make(map[string]string)
	eMap := make(map[string]GameEntryXML)
	data, err := os.ReadFile(xmlPath)
	if err != nil || len(data) == 0 {
		return tMap, eMap
	}
	blocks := xmlGameBlockRegex.FindAllStringSubmatch(string(data), -1)
	for _, b := range blocks {
		if len(b) < 2 {
			continue
		}
		body := b[1]
		rawPath := extractXMLTagValue(body, "path")
		rawName := extractXMLTagValue(body, "name")
		if rawPath == "" {
			continue
		}
		cleanP := strings.ToLower(filepath.Base(strings.ReplaceAll(rawPath, "\\", "/")))
		noExt := strings.TrimSuffix(cleanP, filepath.Ext(cleanP))
		coreK := extractCoreNumberKey(cleanP)

		entry := GameEntryXML{
			Path:      rawPath,
			Name:      rawName,
			Image:     extractXMLTagValue(body, "image"),
			Thumbnail: extractXMLTagValue(body, "thumbnail"),
			Marquee:   extractXMLTagValue(body, "marquee"),
			Video:     extractXMLTagValue(body, "video"),
			Genre:     extractXMLTagValue(body, "genre"),
		}
		eMap[cleanP] = entry
		eMap[noExt] = entry
		if coreK != "" {
			eMap[coreK] = entry
		}

		cleanN := stripLeadingIndexExcept007(strings.TrimSpace(rawName))
		if cleanN != "" && !isPureNumberOrGenericTitle(cleanN) {
			tMap[cleanP] = cleanN
			tMap[noExt] = cleanN
			if coreK != "" {
				tMap[coreK] = cleanN
			}
		}
	}
	return tMap, eMap
}

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
			selectedCustomXmlPath = chosen
			appendLog("📂 Выбран пользовательский XML-файл для сопоставления: " + chosen)
			return chosen
		}
	}
	return ""
}

func buildXmlMappingCandidatesForFolder(folder string) []XmlMappingCandidate {
	// Index real ROM files on disk in folder, folder/psx, folder/ps1, and scannedRoms
	// by their normalized core number key (so "000001 (World).chd" maps to "000001"!)
	type diskRomInfo struct {
		fileName       string
		fullPath       string
		coreKey        string
		extractedTitle string
	}
	diskByCore := make(map[string]diskRomInfo)
	diskByLower := make(map[string]diskRomInfo)

	stateMu.Lock()
	localScanned := make([]RomItem, len(scannedRoms))
	copy(localScanned, scannedRoms)
	stateMu.Unlock()

	for _, r := range localScanned {
		ck := extractCoreNumberKey(r.FileName)
		info := diskRomInfo{
			fileName:       r.FileName,
			fullPath:       r.FilePath,
			coreKey:        ck,
			extractedTitle: r.ExtractedTitle,
		}
		diskByLower[strings.ToLower(r.FileName)] = info
		diskByLower[strings.ToLower(strings.TrimSuffix(r.FileName, filepath.Ext(r.FileName)))] = info
		if ck != "" {
			diskByCore[ck] = info
		}
	}

	// Also directly scan disk in folder, folder/psx, folder/ps1 so even if user hasn't clicked "1. Scan", we find "000001 (World).chd"!
	for _, candDir := range []string{folder, filepath.Join(folder, "psx"), filepath.Join(folder, "ps1")} {
		if candDir == "" {
			continue
		}
		entries, err := os.ReadDir(candDir)
		if err != nil {
			continue
		}
		for _, e := range entries {
			if e.IsDir() {
				continue
			}
			ext := strings.ToLower(filepath.Ext(e.Name()))
			if _, ok := extToDefaultConsole[ext]; !ok && ext != ".zip" {
				continue
			}
			ck := extractCoreNumberKey(e.Name())
			low := strings.ToLower(e.Name())
			if _, exists := diskByLower[low]; !exists {
				info := diskRomInfo{
					fileName: e.Name(),
					fullPath: filepath.Join(candDir, e.Name()),
					coreKey:  ck,
				}
				diskByLower[low] = info
				diskByLower[strings.TrimSuffix(low, ext)] = info
				if ck != "" {
					if _, cExists := diskByCore[ck]; !cExists {
						diskByCore[ck] = info
					}
				}
			}
		}
	}

	titleMap, entryMap := loadGamelistMapsForDir(folder)
	if selectedCustomXmlPath != "" {
		cTMap, cEMap := parseSingleXmlFileMaps(selectedCustomXmlPath)
		for k, v := range cTMap {
			titleMap[k] = v
		}
		for k, v := range cEMap {
			entryMap[k] = v
		}
	}

	type rawPair struct {
		diskFileName string
		coreKey      string
		title        string
		hasOnDisk    bool
		hasImg       bool
		hasVid       bool
		sourceLabel  string
	}
	var pairs []rawPair
	seenCore := make(map[string]bool)

	// 1. Collect from custom XML or folder's gamelist.xml if present
	for k, ge := range entryMap {
		if strings.Contains(k, ".") {
			fName := filepath.Base(strings.ReplaceAll(strings.TrimSpace(ge.Path), "\\", "/"))
			ext := strings.ToLower(filepath.Ext(fName))
			if ext == ".srm" || strings.Contains(strings.ToLower(ge.Name), "zzz(notgame)") {
				continue
			}
			ck := extractCoreNumberKey(fName)
			if ck == "" {
				ck = strings.ToLower(strings.TrimSuffix(fName, filepath.Ext(fName)))
			}
			if seenCore[ck] {
				continue
			}
			t := titleMap[ck]
			if t == "" {
				t = titleMap[strings.ToLower(fName)]
			}
			if t == "" {
				t = factoryR36sNumberMap[ck]
			}
			if t == "" || isPureNumberOrGenericTitle(t) {
				continue
			}
			seenCore[ck] = true

			actualName := fName
			hasDisk := false
			if dInfo, ok := diskByCore[ck]; ok {
				actualName = dInfo.fileName
				hasDisk = true
			} else if dInfo, ok := diskByLower[strings.ToLower(fName)]; ok {
				actualName = dInfo.fileName
				hasDisk = true
			}

			srcLbl := "В базе XML"
			if hasDisk {
				srcLbl = "✔ Найден в папке (XML)"
			}
			pairs = append(pairs, rawPair{
				diskFileName: actualName,
				coreKey:      ck,
				title:        t,
				hasOnDisk:    hasDisk,
				hasImg:       ge.Image != "" || ge.Thumbnail != "",
				hasVid:       ge.Video != "",
				sourceLabel:  srcLbl,
			})
		}
	}

	// 2. Also include embedded R36S factory XML mappings (630 numbered PSX games 000001..000634)
	var keys []string
	for k := range factoryR36sNumberMap {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		if seenCore[k] {
			continue
		}
		t := factoryR36sNumberMap[k]
		actualName := k + ".chd"
		hasDisk := false
		if dInfo, ok := diskByCore[k]; ok {
			actualName = dInfo.fileName
			hasDisk = true
		}
		seenCore[k] = true
		srcLbl := "В базе XML (630 игр)"
		if hasDisk {
			srcLbl = "✔ Найден в папке (000001/World)"
		}
		pairs = append(pairs, rawPair{
			diskFileName: actualName,
			coreKey:      k,
			title:        t,
			hasOnDisk:    hasDisk,
			hasImg:       true,
			hasVid:       true,
			sourceLabel:  srcLbl,
		})
	}

	// 3. Also include any numbered ROMs on disk resolved via deep binary header inspection!
	for ck, dInfo := range diskByCore {
		if seenCore[ck] {
			continue
		}
		hdrTitle := dInfo.extractedTitle
		if hdrTitle == "" || isPureNumberOrGenericTitle(hdrTitle) {
			ext := strings.ToLower(filepath.Ext(dInfo.fullPath))
			hdrTitle = extractInternalBinaryRomTitle(dInfo.fullPath, ext, detectConsoleCode(dInfo.fullPath, ext))
		}
		if hdrTitle != "" && !isPureNumberOrGenericTitle(hdrTitle) && countLettersInString(hdrTitle) >= 2 {
			seenCore[ck] = true
			pairs = append(pairs, rawPair{
				diskFileName: dInfo.fileName,
				coreKey:      ck,
				title:        hdrTitle,
				hasOnDisk:    true,
				hasImg:       false,
				hasVid:       false,
				sourceLabel:  "✔ Заголовок диска (Deep Header)",
			})
		}
	}

	// Sort so ROMs actually found in the user's folder appear at the very top!
	sort.Slice(pairs, func(i, j int) bool {
		if pairs[i].hasOnDisk != pairs[j].hasOnDisk {
			return pairs[i].hasOnDisk
		}
		return pairs[i].diskFileName < pairs[j].diskFileName
	})

	anyMatchedOnDisk := false
	for _, p := range pairs {
		if p.hasOnDisk {
			anyMatchedOnDisk = true
			break
		}
	}

	// Count duplicate titles so we disambiguate with [000593]
	titleCounts := make(map[string]int)
	for _, p := range pairs {
		cleanT := strings.TrimSpace(strings.ReplaceAll(p.title, "(World)", ""))
		safeBase := strings.ToLower(sanitizeFileName(cleanT))
		titleCounts[safeBase]++
	}
	titleSeen := make(map[string]int)

	var result []XmlMappingCandidate
	for _, p := range pairs {
		ext := filepath.Ext(p.diskFileName)
		if ext == "" {
			ext = ".chd"
		}
		cleanT := strings.TrimSpace(strings.ReplaceAll(p.title, "(World)", ""))
		safeBase := sanitizeFileName(cleanT)
		lowSafe := strings.ToLower(safeBase)
		titleSeen[lowSafe]++
		if titleCounts[lowSafe] > 1 && titleSeen[lowSafe] > 1 {
			safeBase = sanitizeFileName(fmt.Sprintf("%s [%s]", safeBase, p.coreKey))
		}
		newFile := safeBase + ext

		defaultChk := true
		if anyMatchedOnDisk {
			defaultChk = p.hasOnDisk
		}

		result = append(result, XmlMappingCandidate{
			OldFileName:    p.diskFileName,
			CoreKey:        p.coreKey,
			CleanTitle:     cleanT,
			NewFileName:    newFile,
			HasRomOnDisk:   p.hasOnDisk,
			HasImage:       p.hasImg,
			HasVideo:       p.hasVid,
			DefaultChecked: defaultChk,
			SourceLabel:    p.sourceLabel,
		})
	}
	return result
}

func populateXmlListView() {
	if hXmlLV == 0 {
		return
	}
	procSendMessageW.Call(hXmlLV, LVM_DELETEALLITEMS, 0, 0)

	stateMu.Lock()
	list := make([]XmlMappingCandidate, len(xmlMappingCandidates))
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
		if selectedCustomXmlPath != "" {
			xmlSrc = "Выбранный файл: " + filepath.Base(selectedCustomXmlPath)
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
	dlgTitle := utf16Ptr("Переименование ромов по XML и заголовкам (понимает 000001 (World).chd и 000001.chd) — AegisROM v0.5.4 Beta")
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
		uintptr(unsafe.Pointer(utf16Ptr("📂 Выбрать свой .XML файл с диска (gamelist.xml)...")),
		),
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
	list := make([]XmlMappingCandidate, len(xmlMappingCandidates))
	copy(list, xmlMappingCandidates)
	stateMu.Unlock()

	rootFolder := strings.TrimSpace(getWindowText(hEditPath))
	if rootFolder == "" {
		procMessageBoxW.Call(hDlg, uintptr(unsafe.Pointer(utf16Ptr("Сначала укажите путь к папке с ромами (например E:\\psx)."))), uintptr(unsafe.Pointer(utf16Ptr("AegisROM v0.5.4 Beta"))), MB_OK|MB_ICONWARNING)
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
			coreKey = extractCoreNumberKey(m.OldFileName)
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
			_, _ = renameCompanionCueBin(romDir, actualOldBase, newBase, actualExt)
			relocateExistingMediaForRom(romDir, romDir, actualOldBase, newBase)
			if coreKey != "" && !strings.EqualFold(coreKey, actualOldBase) {
				relocateExistingMediaForRom(romDir, romDir, coreKey, newBase)
			}
			renamedRoms++
			appendLog(fmt.Sprintf("[XML ПЕРЕИМЕНОВАНИЕ] %s  ==>  %s", filepath.Base(srcPath), filepath.Base(dstPath)))
		}
	}

	if renamedRoms > 0 {
		_ = repairGamelistAndMediaBindingsInDir(rootFolder)
		stateMu.Lock()
		undoHistory = undoBatch
		stateMu.Unlock()
		procEnableWindow.Call(hBtnUndo, 1)
	}

	procDestroyWindow.Call(hDlg)
	hXmlWnd = 0

	msg := fmt.Sprintf("Переименование завершено!\n\nПереименовано ромов (включая очистку ложного тега (World), картинки в images/, -marquee.png, -thumb.png, видео и gamelist.xml): %d", renamedRoms)
	procMessageBoxW.Call(hMainWnd, uintptr(unsafe.Pointer(utf16Ptr(msg))), uintptr(unsafe.Pointer(utf16Ptr("Переименование ромов — AegisROM v0.5.4 Beta"))), MB_OK|MB_ICONINFORMATION)
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
			list := make([]XmlMappingCandidate, len(xmlMappingCandidates))
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
		summary := fmt.Sprintf("Очистка медиа завершена: удалено лишних картинок/баннеров/видео без рома: %d (освобождено %s).", int(wParam), formatBytes(int64(lParam)))
		procSetWindowTextW.Call(hLblStats, uintptr(unsafe.Pointer(utf16Ptr(summary))))
		msgText := fmt.Sprintf("Проверка баннеров, картинок и видео завершена!\n\nУдалено лишних (осиротевших) медиафайлов, для которых больше нет рома: %d\nОсвобождено места: %s", int(wParam), formatBytes(int64(lParam)))
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
