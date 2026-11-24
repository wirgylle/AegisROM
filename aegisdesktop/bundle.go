package aegisdesktop

import (
	"encoding/xml"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// IsAppBundle reports whether p is a macOS application bundle (a folder named *.app).
func IsAppBundle(p string) bool {
	if !strings.EqualFold(filepath.Ext(p), ".app") {
		return false
	}
	st, err := os.Stat(p)
	return err == nil && st.IsDir()
}

// BundleExecutable returns the binary inside a .app bundle that should be run.
// RU: Берёт CFBundleExecutable из Contents/Info.plist (XML), иначе файл в
// Contents/MacOS с именем бандла, иначе первый исполняемый файл там же.
// EN: Uses CFBundleExecutable from Contents/Info.plist (XML), then a file in
// Contents/MacOS named like the bundle, then the first executable there.
func BundleExecutable(bundle string) string {
	macosDir := filepath.Join(bundle, "Contents", "MacOS")
	if name := plistBundleExecutable(filepath.Join(bundle, "Contents", "Info.plist")); name != "" {
		if p := filepath.Join(macosDir, filepath.Base(name)); isRegularFile(p) {
			return p
		}
	}
	entries, err := os.ReadDir(macosDir)
	if err != nil {
		return ""
	}
	want := strings.TrimSuffix(filepath.Base(bundle), filepath.Ext(bundle))
	first := ""
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		info, err := e.Info()
		if err != nil || info.Mode()&0o111 == 0 {
			continue
		}
		if strings.EqualFold(e.Name(), want) {
			return filepath.Join(macosDir, e.Name())
		}
		if first == "" {
			first = filepath.Join(macosDir, e.Name())
		}
	}
	return first
}

// plistBundleExecutable reads CFBundleExecutable from an XML Info.plist.
// Binary plists return "" and the caller falls back to Contents/MacOS.
func plistBundleExecutable(plistPath string) string {
	f, err := os.Open(plistPath)
	if err != nil {
		return ""
	}
	defer f.Close()
	dec := xml.NewDecoder(io.LimitReader(f, 1<<20))
	nextIsExec := false
	for {
		tok, err := dec.Token()
		if err != nil {
			return ""
		}
		se, ok := tok.(xml.StartElement)
		if !ok {
			continue
		}
		var text string
		if se.Name.Local == "key" || se.Name.Local == "string" {
			if err := dec.DecodeElement(&text, &se); err != nil {
				return ""
			}
		}
		switch {
		case se.Name.Local == "key":
			nextIsExec = strings.TrimSpace(text) == "CFBundleExecutable"
		case nextIsExec && se.Name.Local == "string":
			return strings.TrimSpace(text)
		default:
			nextIsExec = false
		}
	}
}

func isRegularFile(p string) bool {
	st, err := os.Stat(p)
	return err == nil && !st.IsDir()
}

// IsLaunchable reports whether p can be run: a regular file or a .app bundle with a binary inside.
func IsLaunchable(p string) bool {
	if p == "" {
		return false
	}
	if IsAppBundle(p) {
		return BundleExecutable(p) != ""
	}
	return isRegularFile(p)
}

// ExecutablePath maps a .app bundle to its binary; other paths are returned unchanged.
func ExecutablePath(p string) string {
	if IsAppBundle(p) {
		return BundleExecutable(p)
	}
	return p
}
