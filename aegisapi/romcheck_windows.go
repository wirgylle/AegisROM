//go:build windows

package aegisapi

import (
	"errors"
	"os/exec"
	"syscall"
	"unicode/utf16"
	"unsafe"
)

var (
	shell32Romcheck      = syscall.NewLazyDLL("shell32.dll")
	procSHFileOperationW = shell32Romcheck.NewProc("SHFileOperationW")
)

// SHFILEOPSTRUCTW (amd64 layout matches Go's natural alignment).
type shFileOpStruct struct {
	hwnd                  uintptr
	wFunc                 uint32
	pFrom                 *uint16
	pTo                   *uint16
	fFlags                uint16
	fAnyOperationsAborted int32
	hNameMappings         uintptr
	lpszProgressTitle     *uint16
}

const (
	foDelete          = 0x0003
	fofSilent         = 0x0004
	fofNoConfirmation = 0x0010
	fofAllowUndo      = 0x0040
	fofNoErrorUI      = 0x0400
)

// moveToTrash sends files to the Recycle Bin in one shell operation.
func moveToTrash(paths []string) error {
	if len(paths) == 0 {
		return nil
	}
	var buf []uint16
	for _, p := range paths {
		buf = append(buf, utf16.Encode([]rune(p))...)
		buf = append(buf, 0)
	}
	buf = append(buf, 0) // список кончается двумя нулями / the list ends with a double NUL
	op := shFileOpStruct{
		wFunc:  foDelete,
		pFrom:  &buf[0],
		fFlags: fofAllowUndo | fofNoConfirmation | fofSilent | fofNoErrorUI,
	}
	r, _, _ := procSHFileOperationW.Call(uintptr(unsafe.Pointer(&op)))
	if r != 0 {
		return errors.New("SHFileOperation failed")
	}
	if op.fAnyOperationsAborted != 0 {
		return errors.New("deleting was cancelled")
	}
	return nil
}

// revealInFileManager opens Explorer with the file selected (or the folder itself).
func revealInFileManager(path string, isDir bool) error {
	cmd := exec.Command("explorer.exe")
	if isDir {
		cmd.SysProcAttr = &syscall.SysProcAttr{CmdLine: `explorer.exe "` + path + `"`}
	} else {
		cmd.SysProcAttr = &syscall.SysProcAttr{CmdLine: `explorer.exe /select,"` + path + `"`}
	}
	// explorer.exe часто выходит с кодом 1 даже при успехе. / explorer.exe often exits with 1 on success.
	if err := cmd.Start(); err != nil {
		return err
	}
	go func() { _ = cmd.Wait() }()
	return nil
}
