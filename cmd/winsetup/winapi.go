//go:build windows
// +build windows

package winsetup

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	"unsafe"
)

var (
	user32   = syscall.NewLazyDLL("user32.dll")
	kernel32 = syscall.NewLazyDLL("kernel32.dll")
	gdi32    = syscall.NewLazyDLL("gdi32.dll")
	comctl32 = syscall.NewLazyDLL("comctl32.dll")
	shell32  = syscall.NewLazyDLL("shell32.dll")
	ole32    = syscall.NewLazyDLL("ole32.dll")
	advapi32 = syscall.NewLazyDLL("advapi32.dll")
	dwmapi   = syscall.NewLazyDLL("dwmapi.dll")

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
	procSetWindowTextW       = user32.NewProc("SetWindowTextW")
	procGetWindowTextW       = user32.NewProc("GetWindowTextW")
	procGetWindowTextLengthW = user32.NewProc("GetWindowTextLengthW")
	procEnableWindow         = user32.NewProc("EnableWindow")
	procMessageBoxW          = user32.NewProc("MessageBoxW")
	procLoadCursorW          = user32.NewProc("LoadCursorW")
	procLoadIconW            = user32.NewProc("LoadIconW")
	procGetSystemMetrics     = user32.NewProc("GetSystemMetrics")
	procSetForegroundWindow  = user32.NewProc("SetForegroundWindow")

	procGetModuleHandleW         = kernel32.NewProc("GetModuleHandleW")
	procCreateToolhelp32Snapshot = kernel32.NewProc("CreateToolhelp32Snapshot")
	procProcess32FirstW          = kernel32.NewProc("Process32FirstW")
	procProcess32NextW           = kernel32.NewProc("Process32NextW")
	procOpenProcess              = kernel32.NewProc("OpenProcess")
	procTerminateProcess         = kernel32.NewProc("TerminateProcess")
	procWaitForSingleObject      = kernel32.NewProc("WaitForSingleObject")
	procGetExitCodeProcess       = kernel32.NewProc("GetExitCodeProcess")
	procCloseHandle              = kernel32.NewProc("CloseHandle")

	procCreateFontW       = gdi32.NewProc("CreateFontW")
	procCreateSolidBrush  = gdi32.NewProc("CreateSolidBrush")
	procDeleteObject      = gdi32.NewProc("DeleteObject")
	procSetTextColor      = gdi32.NewProc("SetTextColor")
	procSetBkMode         = gdi32.NewProc("SetBkMode")
	procSetBkColor        = gdi32.NewProc("SetBkColor")

	procInitCommonControlsEx = comctl32.NewProc("InitCommonControlsEx")

	procSHGetFolderPathW     = shell32.NewProc("SHGetFolderPathW")
	procSHBrowseForFolderW   = shell32.NewProc("SHBrowseForFolderW")
	procSHGetPathFromIDListW = shell32.NewProc("SHGetPathFromIDListW")
	procShellExecuteExW      = shell32.NewProc("ShellExecuteExW")
	procIsUserAnAdmin        = shell32.NewProc("IsUserAnAdmin")

	procCoInitializeEx   = ole32.NewProc("CoInitializeEx")
	procCoUninitialize   = ole32.NewProc("CoUninitialize")
	procCoCreateInstance = ole32.NewProc("CoCreateInstance")
	procCoTaskMemFree    = ole32.NewProc("CoTaskMemFree")

	procRegOpenKeyExW    = advapi32.NewProc("RegOpenKeyExW")
	procRegCreateKeyExW  = advapi32.NewProc("RegCreateKeyExW")
	procRegQueryValueExW = advapi32.NewProc("RegQueryValueExW")
	procRegSetValueExW   = advapi32.NewProc("RegSetValueExW")
	procRegDeleteTreeW   = advapi32.NewProc("RegDeleteTreeW")
	procRegEnumKeyExW    = advapi32.NewProc("RegEnumKeyExW")
	procRegCloseKey      = advapi32.NewProc("RegCloseKey")

	procDwmSetWindowAttribute = dwmapi.NewProc("DwmSetWindowAttribute")
)

const (
	HKEY_CURRENT_USER  = uintptr(0x80000001)
	HKEY_LOCAL_MACHINE = uintptr(0x80000002)

	KEY_READ        = 0x20019
	KEY_WRITE       = 0x20006
	KEY_ALL_ACCESS  = 0xF003F
	KEY_WOW64_64KEY = 0x0100
	KEY_WOW64_32KEY = 0x0200

	REG_SZ    = 1
	REG_DWORD = 4

	CSIDL_PROGRAMS              = 0x0002
	CSIDL_DESKTOPDIRECTORY      = 0x0010
	CSIDL_COMMON_PROGRAMS       = 0x0017
	CSIDL_COMMON_DESKTOPDIR     = 0x0019
	CSIDL_APPDATA               = 0x001a
	CSIDL_LOCAL_APPDATA         = 0x001c
	CSIDL_PROGRAM_FILES         = 0x0026
	CSIDL_PROGRAM_FILESX86      = 0x002a

	TH32CS_SNAPPROCESS = 0x00000002
	PROCESS_TERMINATE  = 0x0001
	SYNCHRONIZE        = 0x00100000
	INFINITE           = 0xFFFFFFFF

	SEE_MASK_NOCLOSEPROCESS = 0x00000040
	SW_HIDE                 = 0
	SW_SHOWNORMAL           = 1

	MB_OK              = 0x00000000
	MB_YESNO           = 0x00000004
	MB_ICONERROR       = 0x00000010
	MB_ICONQUESTION    = 0x00000020
	MB_ICONWARNING     = 0x00000030
	MB_ICONINFORMATION = 0x00000040
	IDYES              = 6
)

type guid struct {
	Data1 uint32
	Data2 uint16
	Data3 uint16
	Data4 [8]byte
}

var (
	clsidShellLink = guid{0x00021401, 0x0000, 0x0000, [8]byte{0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46}}
	iidIShellLinkW = guid{0x000214F9, 0x0000, 0x0000, [8]byte{0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46}}
	iidIPersistFile = guid{0x0000010B, 0x0000, 0x0000, [8]byte{0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46}}
)

type processEntry32W struct {
	DwSize              uint32
	CntUsage            uint32
	Th32ProcessID       uint32
	Th32DefaultHeapID   uintptr
	Th32ModuleID        uint32
	CntThreads          uint32
	Th32ParentProcessID uint32
	PcPriClassBase      int32
	DwFlags             uint32
	SzExeFile           [260]uint16
}

type shellExecuteInfoW struct {
	CbSize       uint32
	FMask        uint32
	Hwnd         uintptr
	LpVerb       *uint16
	LpFile       *uint16
	LpParameters *uint16
	LpDirectory  *uint16
	NShow        int32
	HInstApp     uintptr
	LpIDList     uintptr
	LpClass      *uint16
	HkeyClass    uintptr
	DwHotKey     uint32
	HIcon        uintptr
	HProcess     uintptr
}

type browseInfoW struct {
	HwndOwner      uintptr
	PidlRoot       uintptr
	PszDisplayName *uint16
	LpszTitle      *uint16
	UlFlags        uint32
	Lpfn           uintptr
	LParam         uintptr
	IImage         int32
}

func UTF16Ptr(s string) *uint16 {
	p, _ := syscall.UTF16PtrFromString(s)
	return p
}

func IsRunningAsAdmin() bool {
	r, _, _ := procIsUserAnAdmin.Call()
	return r != 0
}

func MessageBox(hwnd uintptr, text, title string, flags uint32) int {
	r, _, _ := procMessageBoxW.Call(hwnd, uintptr(unsafe.Pointer(UTF16Ptr(text))), uintptr(unsafe.Pointer(UTF16Ptr(title))), uintptr(flags))
	return int(r)
}

func GetKnownFolderPath(csidl int32) string {
	var buf [32768]uint16
	r, _, _ := procSHGetFolderPathW.Call(0, uintptr(csidl), 0, 0, uintptr(unsafe.Pointer(&buf[0])))
	if r != 0 {
		return ""
	}
	return strings.TrimSpace(syscall.UTF16ToString(buf[:]))
}

func BrowseForFolder(hwnd uintptr, title string) string {
	var disp [260]uint16
	bi := browseInfoW{
		HwndOwner:      hwnd,
		PszDisplayName: &disp[0],
		LpszTitle:      UTF16Ptr(title),
		UlFlags:        0x00000001 | 0x00000040 | 0x00000010, // BIF_RETURNONLYFSDIRS | BIF_NEWDIALOGSTYLE | BIF_EDITBOX
	}
	pidl, _, _ := procSHBrowseForFolderW.Call(uintptr(unsafe.Pointer(&bi)))
	if pidl == 0 {
		return ""
	}
	defer procCoTaskMemFree.Call(pidl)
	var out [32768]uint16
	ok, _, _ := procSHGetPathFromIDListW.Call(pidl, uintptr(unsafe.Pointer(&out[0])))
	if ok == 0 {
		return ""
	}
	return strings.TrimSpace(syscall.UTF16ToString(out[:]))
}

func RunElevatedAndWait(exePath, args, workDir string) (uint32, error) {
	sei := shellExecuteInfoW{
		FMask:        SEE_MASK_NOCLOSEPROCESS,
		LpVerb:       UTF16Ptr("runas"),
		LpFile:       UTF16Ptr(exePath),
		LpParameters: UTF16Ptr(args),
		LpDirectory:  UTF16Ptr(workDir),
		NShow:        SW_HIDE,
	}
	sei.CbSize = uint32(unsafe.Sizeof(sei))
	ok, _, err := procShellExecuteExW.Call(uintptr(unsafe.Pointer(&sei)))
	if ok == 0 {
		return 1, fmt.Errorf("запрос прав администратора (UAC) отменён или недоступен: %v", err)
	}
	if sei.HProcess != 0 {
		defer procCloseHandle.Call(sei.HProcess)
		procWaitForSingleObject.Call(sei.HProcess, INFINITE)
		var code uint32
		procGetExitCodeProcess.Call(sei.HProcess, uintptr(unsafe.Pointer(&code)))
		return code, nil
	}
	return 0, nil
}

// KillOtherAegisRomProcesses terminates any other running AegisROM app process (preserving setup EXE itself).
func KillOtherAegisRomProcesses() int {
	selfPid := uint32(os.Getpid())
	snap, _, _ := procCreateToolhelp32Snapshot.Call(TH32CS_SNAPPROCESS, 0)
	if snap == 0 || snap == ^uintptr(0) {
		return 0
	}
	defer procCloseHandle.Call(snap)

	var pe processEntry32W
	pe.DwSize = uint32(unsafe.Sizeof(pe))
	r, _, _ := procProcess32FirstW.Call(snap, uintptr(unsafe.Pointer(&pe)))
	killed := 0
	for r != 0 {
		exeName := strings.ToLower(syscall.UTF16ToString(pe.SzExeFile[:]))
		if pe.Th32ProcessID != selfPid && pe.Th32ProcessID != 0 {
			isTarget := exeName == "aegisrom.exe" || strings.HasPrefix(exeName, "aegisrom-portable")
			if isTarget {
				hProc, _, _ := procOpenProcess.Call(PROCESS_TERMINATE|SYNCHRONIZE, 0, uintptr(pe.Th32ProcessID))
				if hProc != 0 {
					procTerminateProcess.Call(hProc, 0)
					procWaitForSingleObject.Call(hProc, 2500)
					procCloseHandle.Call(hProc)
					killed++
				}
			}
		}
		pe.DwSize = uint32(unsafe.Sizeof(pe))
		r, _, _ = procProcess32NextW.Call(snap, uintptr(unsafe.Pointer(&pe)))
	}
	if killed > 0 {
		time.Sleep(250 * time.Millisecond)
	}
	return killed
}

// Pure Win32 Registry Helpers

func ReadRegString(root uintptr, subKey, valName string, wow64Flags uint32) (string, bool) {
	var hKey uintptr
	rc, _, _ := procRegOpenKeyExW.Call(root, uintptr(unsafe.Pointer(UTF16Ptr(subKey))), 0, uintptr(KEY_READ|wow64Flags), uintptr(unsafe.Pointer(&hKey)))
	if rc != 0 {
		return "", false
	}
	defer procRegCloseKey.Call(hKey)

	var regType uint32
	var cbData uint32
	rc, _, _ = procRegQueryValueExW.Call(hKey, uintptr(unsafe.Pointer(UTF16Ptr(valName))), 0, uintptr(unsafe.Pointer(&regType)), 0, uintptr(unsafe.Pointer(&cbData)))
	if rc != 0 || cbData < 2 {
		return "", false
	}
	buf := make([]uint16, cbData/2+2)
	rc, _, _ = procRegQueryValueExW.Call(hKey, uintptr(unsafe.Pointer(UTF16Ptr(valName))), 0, uintptr(unsafe.Pointer(&regType)), uintptr(unsafe.Pointer(&buf[0])), uintptr(unsafe.Pointer(&cbData)))
	if rc != 0 {
		return "", false
	}
	return strings.TrimSpace(syscall.UTF16ToString(buf)), true
}

func EnumRegSubkeys(root uintptr, subKey string, wow64Flags uint32) []string {
	var hKey uintptr
	rc, _, _ := procRegOpenKeyExW.Call(root, uintptr(unsafe.Pointer(UTF16Ptr(subKey))), 0, uintptr(KEY_READ|wow64Flags), uintptr(unsafe.Pointer(&hKey)))
	if rc != 0 {
		return nil
	}
	defer procRegCloseKey.Call(hKey)

	var out []string
	var idx uint32
	for {
		var nameBuf [260]uint16
		cch := uint32(len(nameBuf))
		rc, _, _ = procRegEnumKeyExW.Call(hKey, uintptr(idx), uintptr(unsafe.Pointer(&nameBuf[0])), uintptr(unsafe.Pointer(&cch)), 0, 0, 0, 0)
		if rc != 0 {
			break
		}
		out = append(out, syscall.UTF16ToString(nameBuf[:cch]))
		idx++
	}
	return out
}

func WriteRegString(root uintptr, subKey, valName, val string) error {
	var hKey uintptr
	rc, _, _ := procRegCreateKeyExW.Call(root, uintptr(unsafe.Pointer(UTF16Ptr(subKey))), 0, 0, 0, uintptr(KEY_WRITE|KEY_WOW64_64KEY), 0, uintptr(unsafe.Pointer(&hKey)), 0)
	if rc != 0 {
		return fmt.Errorf("RegCreateKeyExW failed (%d)", rc)
	}
	defer procRegCloseKey.Call(hKey)
	u16, _ := syscall.UTF16FromString(val)
	cb := uint32(len(u16) * 2)
	rc, _, _ = procRegSetValueExW.Call(hKey, uintptr(unsafe.Pointer(UTF16Ptr(valName))), 0, REG_SZ, uintptr(unsafe.Pointer(&u16[0])), uintptr(cb))
	if rc != 0 {
		return fmt.Errorf("RegSetValueExW failed (%d)", rc)
	}
	return nil
}

func WriteRegDWord(root uintptr, subKey, valName string, val uint32) error {
	var hKey uintptr
	rc, _, _ := procRegCreateKeyExW.Call(root, uintptr(unsafe.Pointer(UTF16Ptr(subKey))), 0, 0, 0, uintptr(KEY_WRITE|KEY_WOW64_64KEY), 0, uintptr(unsafe.Pointer(&hKey)), 0)
	if rc != 0 {
		return fmt.Errorf("RegCreateKeyExW failed (%d)", rc)
	}
	defer procRegCloseKey.Call(hKey)
	v := val
	rc, _, _ = procRegSetValueExW.Call(hKey, uintptr(unsafe.Pointer(UTF16Ptr(valName))), 0, REG_DWORD, uintptr(unsafe.Pointer(&v)), 4)
	if rc != 0 {
		return fmt.Errorf("RegSetValueExW failed (%d)", rc)
	}
	return nil
}

func DeleteRegTree(root uintptr, subKey string) {
	procRegDeleteTreeW.Call(root, uintptr(unsafe.Pointer(UTF16Ptr(subKey))))
}

// Pure COM IShellLinkW / IPersistFile Helpers (zero PowerShell / zero VBS)

func comVtableCall(obj uintptr, slot uintptr, args ...uintptr) uintptr {
	vtbl := *(*uintptr)(unsafe.Pointer(obj))
	fn := *(*uintptr)(unsafe.Pointer(vtbl + slot*unsafe.Sizeof(uintptr(0))))
	fullArgs := append([]uintptr{obj}, args...)
	r, _, _ := syscall.SyscallN(fn, fullArgs...)
	return r
}

func CreateWindowsShortcut(lnkPath, targetExe, args, workDir, iconPath, desc string) error {
	procCoInitializeEx.Call(0, 0x2)
	var psl uintptr
	hr, _, _ := procCoCreateInstance.Call(
		uintptr(unsafe.Pointer(&clsidShellLink)),
		0,
		1, // CLSCTX_INPROC_SERVER
		uintptr(unsafe.Pointer(&iidIShellLinkW)),
		uintptr(unsafe.Pointer(&psl)),
	)
	if hr != 0 || psl == 0 {
		return fmt.Errorf("CoCreateInstance ShellLink failed (0x%x)", hr)
	}
	defer comVtableCall(psl, 2) // IUnknown::Release

	comVtableCall(psl, 20, uintptr(unsafe.Pointer(UTF16Ptr(targetExe)))) // SetPath
	if args != "" {
		comVtableCall(psl, 11, uintptr(unsafe.Pointer(UTF16Ptr(args)))) // SetArguments
	}
	if workDir != "" {
		comVtableCall(psl, 9, uintptr(unsafe.Pointer(UTF16Ptr(workDir)))) // SetWorkingDirectory
	}
	if desc != "" {
		comVtableCall(psl, 7, uintptr(unsafe.Pointer(UTF16Ptr(desc)))) // SetDescription
	}
	if iconPath != "" {
		comVtableCall(psl, 17, uintptr(unsafe.Pointer(UTF16Ptr(iconPath))), 0) // SetIconLocation
	}

	var ppf uintptr
	hr = comVtableCall(psl, 0, uintptr(unsafe.Pointer(&iidIPersistFile)), uintptr(unsafe.Pointer(&ppf))) // QueryInterface
	if hr != 0 || ppf == 0 {
		return fmt.Errorf("QueryInterface IPersistFile failed (0x%x)", hr)
	}
	defer comVtableCall(ppf, 2) // Release

	_ = os.MkdirAll(filepath.Dir(lnkPath), 0755)
	hr = comVtableCall(ppf, 6, uintptr(unsafe.Pointer(UTF16Ptr(lnkPath))), 1) // Save(..., TRUE)
	if hr != 0 {
		return fmt.Errorf("IPersistFile::Save failed (0x%x)", hr)
	}
	return nil
}

func ReadWindowsShortcutTarget(lnkPath string) string {
	procCoInitializeEx.Call(0, 0x2)
	var psl uintptr
	hr, _, _ := procCoCreateInstance.Call(
		uintptr(unsafe.Pointer(&clsidShellLink)),
		0,
		1,
		uintptr(unsafe.Pointer(&iidIShellLinkW)),
		uintptr(unsafe.Pointer(&psl)),
	)
	if hr != 0 || psl == 0 {
		return ""
	}
	defer comVtableCall(psl, 2)

	var ppf uintptr
	hr = comVtableCall(psl, 0, uintptr(unsafe.Pointer(&iidIPersistFile)), uintptr(unsafe.Pointer(&ppf)))
	if hr != 0 || ppf == 0 {
		return ""
	}
	defer comVtableCall(ppf, 2)

	hr = comVtableCall(ppf, 5, uintptr(unsafe.Pointer(UTF16Ptr(lnkPath))), 0) // Load(STGM_READ)
	if hr != 0 {
		return ""
	}
	var pathBuf [1024]uint16
	hr = comVtableCall(psl, 3, uintptr(unsafe.Pointer(&pathBuf[0])), uintptr(len(pathBuf)), 0, 0) // GetPath
	if hr != 0 {
		return ""
	}
	return strings.TrimSpace(syscall.UTF16ToString(pathBuf[:]))
}
