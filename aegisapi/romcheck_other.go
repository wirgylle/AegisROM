//go:build !windows

package aegisapi

import (
	"os/exec"
	"path/filepath"
	"runtime"
)

// moveToTrash: корзины без Windows здесь нет, страница удалит файл сама.
// moveToTrash: no recycle bin outside Windows here; the page deletes the file itself.
func moveToTrash(paths []string) error {
	return errTrashUnsupported
}

// revealInFileManager opens the file's folder (macOS selects the file).
func revealInFileManager(path string, isDir bool) error {
	var cmd *exec.Cmd
	switch {
	case runtime.GOOS == "darwin" && !isDir:
		cmd = exec.Command("open", "-R", path)
	case runtime.GOOS == "darwin":
		cmd = exec.Command("open", path)
	default:
		dir := path
		if !isDir {
			dir = filepath.Dir(path)
		}
		cmd = exec.Command("xdg-open", dir)
	}
	if err := cmd.Start(); err != nil {
		return err
	}
	go func() { _ = cmd.Wait() }()
	return nil
}
