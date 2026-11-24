package aegisdesktop

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// ToolsDir is appDir/tools (created on demand).
func ToolsDir(appDir string) string {
	dir := filepath.Join(appDir, "tools")
	_ = os.MkdirAll(dir, 0o755)
	return dir
}

// FindChdman looks for chdman: the path saved by the picker, the tools folder,
// the platform list (Homebrew), then PATH plus ExtraPath.
func (p Platform) FindChdman(appDir string) string {
	tools := ToolsDir(appDir)
	if raw, err := os.ReadFile(filepath.Join(tools, "chdman_path.txt")); err == nil {
		if c := strings.TrimSpace(string(raw)); c != "" && isRegularFile(c) {
			return c
		}
	}
	cands := []string{filepath.Join(tools, "chdman")}
	if self, err := os.Executable(); err == nil {
		cands = append(cands, filepath.Join(filepath.Dir(self), "chdman"))
	}
	cands = append(cands, p.Chdman...)
	for _, d := range p.ExtraPath {
		cands = append(cands, filepath.Join(d, "chdman"))
	}
	for _, c := range cands {
		if isRegularFile(c) {
			return c
		}
	}
	if c, err := exec.LookPath("chdman"); err == nil {
		return c
	}
	return ""
}

// SaveChdmanPath remembers a chdman picked by hand. The file is not copied:
// Homebrew's chdman needs its libraries next to it.
func SaveChdmanPath(appDir, path string) error {
	return os.WriteFile(filepath.Join(ToolsDir(appDir), "chdman_path.txt"), []byte(path), 0o644)
}
