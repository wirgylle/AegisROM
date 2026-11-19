package aegiscore

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

func FormatBytes(b int64) string {
	if b < 1024 {
		return fmt.Sprintf("%d Б", b)
	}
	if b < 1024*1024 {
		return fmt.Sprintf("%.1f КБ", float64(b)/1024.0)
	}
	return fmt.Sprintf("%.2f МБ", float64(b)/(1024.0*1024.0))
}

func ResolveHierarchyBaseRoot(selectedRoot string) string {
	baseName := strings.ToLower(filepath.Base(filepath.Clean(selectedRoot)))
	if _, isConsoleDir := ConsoleCatalog[baseName]; isConsoleDir {
		return filepath.Dir(filepath.Clean(selectedRoot))
	}
	return filepath.Clean(selectedRoot)
}

func CopyLocalFile(src, dst string) error {
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

func RemoveEmptySubfolders(root string) int {
	removed := 0
	var dirs []string
	_ = filepath.Walk(root, func(p string, fi os.FileInfo, err error) error {
		if err == nil && fi.IsDir() && filepath.Clean(p) != filepath.Clean(root) {
			base := strings.ToLower(fi.Name())
			// NEVER delete R36S media folders or R36S system/console directories!
			if standardMediaDirs[base] || protectedR36SDirs[base] {
				return nil
			}
			if _, isConsole := ConsoleCatalog[base]; isConsole {
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

func SanitizeFileName(name string) string {
	invalid := []string{"<", ">", ":", "\"", "/", "\\", "|", "?", "*"}
	res := name
	for _, ch := range invalid {
		res = strings.ReplaceAll(res, ch, "_")
	}
	return strings.TrimSpace(res)
}
