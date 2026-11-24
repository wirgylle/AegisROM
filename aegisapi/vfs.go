package aegisapi

// Файлы через Go вместо File System Access API / Files via Go instead of the File System Access API.
//
// RU: В WKWebView (macOS) и WebKitGTK нет File System Access API, а в Edge и
// WebView2 разрешения на папки нужно подтверждать после каждого перезапуска.
// Здесь фронтенд работает с файлами по абсолютным путям через Go. Доступ есть
// только внутри «корней»: папок, которые пользователь сам выбрал в нативном
// диалоге (/api/native/vfs/pick). Корни хранятся в dataDir/vfs-roots.json.
// Фронтенд оборачивает это API в объекты с интерфейсом
// FileSystemDirectoryHandle/FileSystemFileHandle (src/utils/nativeFs.ts).
//
// EN: WKWebView (macOS) and WebKitGTK have no File System Access API, and Edge
// and WebView2 make the user confirm folder permissions after every restart.
// Here the frontend works with files by absolute path through Go. Access is
// limited to "roots": folders the user picked in a native dialog
// (/api/native/vfs/pick). Roots are kept in dataDir/vfs-roots.json. The
// frontend wraps this API in objects that implement
// FileSystemDirectoryHandle/FileSystemFileHandle (src/utils/nativeFs.ts).

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"
)

// VFSUploadMarker prefixes a tiny multipart part that stands for a file the
// frontend could not upload as bytes (too large); see MaterializeVFSUpload.
const VFSUploadMarker = "AEGIS-VFS-PATH:"

// VFSOptions configures RegisterVFSRoutes.
type VFSOptions struct {
	// PickFolder opens a native folder dialog; nil means picking is unsupported.
	PickFolder func(title string) (string, error)
	// PreferNative tells the frontend to use this API even where the browser has
	// its own File System Access API (the native window does this).
	PreferNative bool
}

type vfsRoots struct {
	mu    sync.RWMutex
	file  string
	paths []string
}

var activeVFSRoots *vfsRoots

func loadVFSRoots(dataDir string) *vfsRoots {
	r := &vfsRoots{file: filepath.Join(dataDir, "vfs-roots.json")}
	if raw, err := os.ReadFile(r.file); err == nil {
		_ = json.Unmarshal(raw, &r.paths)
	}
	return r
}

func (r *vfsRoots) add(p string) error {
	p = filepath.Clean(p)
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, existing := range r.paths {
		if samePath(existing, p) {
			return nil
		}
	}
	r.paths = append(r.paths, p)
	raw, _ := json.MarshalIndent(r.paths, "", "  ")
	return writeFileAtomic(filepath.Dir(r.file), r.file, raw)
}

func (r *vfsRoots) list() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return append([]string(nil), r.paths...)
}

func samePath(a, b string) bool {
	if runtime.GOOS == "windows" {
		return strings.EqualFold(a, b)
	}
	return a == b
}

// resolve cleans p and checks that it lies inside one of the roots.
func (r *vfsRoots) resolve(p string) (string, error) {
	if p == "" || strings.ContainsRune(p, 0) {
		return "", errVFSDenied
	}
	p = filepath.Clean(filepath.FromSlash(p))
	if !filepath.IsAbs(p) {
		return "", errVFSDenied
	}
	for _, root := range r.list() {
		rel, err := filepath.Rel(root, p)
		if err != nil {
			continue
		}
		if runtime.GOOS == "windows" && !strings.EqualFold(filepath.VolumeName(root), filepath.VolumeName(p)) {
			continue
		}
		if rel == "." || (rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))) {
			return p, nil
		}
	}
	return "", errVFSDenied
}

var errVFSDenied = errors.New("path outside the folders picked by the user")

// ResolveVFSPath checks p against the roots of the running server.
func ResolveVFSPath(p string) (string, error) {
	if activeVFSRoots == nil {
		return "", errVFSDenied
	}
	return activeVFSRoots.resolve(p)
}

// MaterializeVFSUpload: if head is a VFSUploadMarker part, it places the real
// file at dst (hard link, or copy if linking fails) and returns true.
func MaterializeVFSUpload(head []byte, dst string) (bool, error) {
	if len(head) > 8192 || !bytes.HasPrefix(head, []byte(VFSUploadMarker)) {
		return false, nil
	}
	src, err := ResolveVFSPath(strings.TrimSpace(string(head[len(VFSUploadMarker):])))
	if err != nil {
		return true, err
	}
	if err := os.Link(src, dst); err == nil {
		return true, nil
	}
	in, err := os.Open(src)
	if err != nil {
		return true, err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return true, err
	}
	_, copyErr := io.Copy(out, in)
	closeErr := out.Close()
	if copyErr != nil {
		return true, copyErr
	}
	return true, closeErr
}

type vfsEntry struct {
	Name  string `json:"name"`
	Kind  string `json:"kind"`
	Size  int64  `json:"size"`
	Mtime int64  `json:"mtime"`
}

func entryFromInfo(name string, info os.FileInfo) vfsEntry {
	e := vfsEntry{Name: name, Kind: "file", Size: info.Size(), Mtime: info.ModTime().UnixMilli()}
	if info.IsDir() {
		e.Kind = "directory"
		e.Size = 0
	}
	return e
}

// vfsError answers with a DOMException name the frontend rethrows as is.
func vfsError(w http.ResponseWriter, status int, name string, err error) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	msg := name
	if err != nil {
		msg = err.Error()
	}
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": false, "error": name, "message": msg})
}

func vfsFSError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, errVFSDenied):
		vfsError(w, http.StatusForbidden, "NotAllowedError", err)
	case errors.Is(err, os.ErrNotExist):
		vfsError(w, http.StatusNotFound, "NotFoundError", err)
	case errors.Is(err, os.ErrExist):
		vfsError(w, http.StatusConflict, "InvalidModificationError", err)
	default:
		vfsError(w, http.StatusInternalServerError, "UnknownError", err)
	}
}

func writeJSONOK(w http.ResponseWriter, v map[string]any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	if v == nil {
		v = map[string]any{}
	}
	v["ok"] = true
	_ = json.NewEncoder(w).Encode(v)
}

// RegisterVFSRoutes adds /api/native/vfs/* to mux.
func RegisterVFSRoutes(mux *http.ServeMux, dataDir string, touch func(), opts VFSOptions) {
	if touch == nil {
		touch = func() {}
	}
	roots := loadVFSRoots(dataDir)
	activeVFSRoots = roots

	resolveQuery := func(w http.ResponseWriter, r *http.Request, key string) (string, bool) {
		p, err := roots.resolve(r.URL.Query().Get(key))
		if err != nil {
			vfsFSError(w, err)
			return "", false
		}
		return p, true
	}
	requirePost := func(w http.ResponseWriter, r *http.Request) bool {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return false
		}
		return true
	}

	mux.HandleFunc("/api/native/vfs/roots", func(w http.ResponseWriter, r *http.Request) {
		touch()
		writeJSONOK(w, map[string]any{
			"roots":        roots.list(),
			"canPick":      opts.PickFolder != nil,
			"preferNative": opts.PreferNative,
			"separator":    string(filepath.Separator),
		})
	})

	mux.HandleFunc("/api/native/vfs/pick", func(w http.ResponseWriter, r *http.Request) {
		touch()
		if !requirePost(w, r) {
			return
		}
		if opts.PickFolder == nil {
			vfsError(w, http.StatusNotImplemented, "NotSupportedError", nil)
			return
		}
		var body struct {
			Title string `json:"title"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		title := body.Title
		if title == "" {
			title = "AegisROM"
		}
		chosen, err := opts.PickFolder(title)
		if err != nil || strings.TrimSpace(chosen) == "" {
			vfsError(w, http.StatusOK, "AbortError", err)
			return
		}
		chosen = filepath.Clean(chosen)
		if st, err := os.Stat(chosen); err != nil || !st.IsDir() {
			vfsError(w, http.StatusOK, "NotFoundError", err)
			return
		}
		if err := roots.add(chosen); err != nil {
			vfsFSError(w, err)
			return
		}
		writeJSONOK(w, map[string]any{"path": chosen, "name": filepath.Base(chosen)})
	})

	mux.HandleFunc("/api/native/vfs/stat", func(w http.ResponseWriter, r *http.Request) {
		touch()
		p, ok := resolveQuery(w, r, "path")
		if !ok {
			return
		}
		info, err := os.Stat(p)
		if err != nil {
			vfsFSError(w, err)
			return
		}
		e := entryFromInfo(filepath.Base(p), info)
		writeJSONOK(w, map[string]any{"entry": e})
	})

	mux.HandleFunc("/api/native/vfs/list", func(w http.ResponseWriter, r *http.Request) {
		touch()
		p, ok := resolveQuery(w, r, "path")
		if !ok {
			return
		}
		dirEntries, err := os.ReadDir(p)
		if err != nil {
			vfsFSError(w, err)
			return
		}
		out := make([]vfsEntry, 0, len(dirEntries))
		for _, de := range dirEntries {
			info, err := de.Info()
			if err != nil {
				continue
			}
			// Follow symlinks so a linked folder lists as a folder.
			if info.Mode()&os.ModeSymlink != 0 {
				if target, err := os.Stat(filepath.Join(p, de.Name())); err == nil {
					info = target
				} else {
					continue
				}
			}
			out = append(out, entryFromInfo(de.Name(), info))
		}
		sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
		writeJSONOK(w, map[string]any{"entries": out})
	})

	mux.HandleFunc("/api/native/vfs/read", func(w http.ResponseWriter, r *http.Request) {
		touch()
		p, ok := resolveQuery(w, r, "path")
		if !ok {
			return
		}
		f, err := os.Open(p)
		if err != nil {
			vfsFSError(w, err)
			return
		}
		defer f.Close()
		info, err := f.Stat()
		if err != nil || info.IsDir() {
			vfsError(w, http.StatusBadRequest, "TypeMismatchError", err)
			return
		}
		// Только безопасные типы: HTML или SVG из папки пользователя не должны
		// исполняться в origin приложения. / Safe types only: HTML or SVG from a
		// user folder must never run in the app's origin.
		w.Header().Set("Content-Type", vfsContentType(p))
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Content-Security-Policy", "sandbox; default-src 'none'")
		w.Header().Set("Cache-Control", "no-store")
		// ServeContent handles Range, which slices of large ROMs and <video> rely on.
		http.ServeContent(w, r, "", info.ModTime(), f)
	})

	mux.HandleFunc("/api/native/vfs/write", func(w http.ResponseWriter, r *http.Request) {
		touch()
		if r.Method != http.MethodPut && r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		p, ok := resolveQuery(w, r, "path")
		if !ok {
			return
		}
		if st, err := os.Stat(p); err == nil && st.IsDir() {
			vfsError(w, http.StatusConflict, "TypeMismatchError", nil)
			return
		}
		dir := filepath.Dir(p)
		tmp, err := os.CreateTemp(dir, ".aegis-write-*")
		if err != nil {
			vfsFSError(w, err)
			return
		}
		tmpName := tmp.Name()
		_, copyErr := io.Copy(tmp, r.Body)
		closeErr := tmp.Close()
		if copyErr != nil || closeErr != nil {
			_ = os.Remove(tmpName)
			vfsFSError(w, errors.Join(copyErr, closeErr))
			return
		}
		if err := os.Rename(tmpName, p); err != nil {
			_ = os.Remove(tmpName)
			vfsFSError(w, err)
			return
		}
		info, _ := os.Stat(p)
		writeJSONOK(w, map[string]any{"entry": entryFromInfo(filepath.Base(p), info)})
	})

	mux.HandleFunc("/api/native/vfs/mkdir", func(w http.ResponseWriter, r *http.Request) {
		touch()
		if !requirePost(w, r) {
			return
		}
		p, ok := resolveQuery(w, r, "path")
		if !ok {
			return
		}
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			vfsError(w, http.StatusConflict, "TypeMismatchError", nil)
			return
		}
		if err := os.MkdirAll(p, 0o755); err != nil {
			vfsFSError(w, err)
			return
		}
		writeJSONOK(w, nil)
	})

	mux.HandleFunc("/api/native/vfs/remove", func(w http.ResponseWriter, r *http.Request) {
		touch()
		if !requirePost(w, r) {
			return
		}
		p, ok := resolveQuery(w, r, "path")
		if !ok {
			return
		}
		for _, root := range roots.list() {
			if samePath(root, p) {
				vfsError(w, http.StatusForbidden, "NotAllowedError", errors.New("refusing to remove a picked folder itself"))
				return
			}
		}
		st, err := os.Stat(p)
		if err != nil {
			vfsFSError(w, err)
			return
		}
		if st.IsDir() && r.URL.Query().Get("recursive") == "1" {
			err = os.RemoveAll(p)
		} else {
			err = os.Remove(p)
			if err != nil && st.IsDir() {
				vfsError(w, http.StatusConflict, "InvalidModificationError", err)
				return
			}
		}
		if err != nil {
			vfsFSError(w, err)
			return
		}
		writeJSONOK(w, nil)
	})

	mux.HandleFunc("/api/native/vfs/move", func(w http.ResponseWriter, r *http.Request) {
		touch()
		if !requirePost(w, r) {
			return
		}
		from, ok := resolveQuery(w, r, "from")
		if !ok {
			return
		}
		to, ok := resolveQuery(w, r, "to")
		if !ok {
			return
		}
		if err := movePath(from, to); err != nil {
			vfsFSError(w, err)
			return
		}
		writeJSONOK(w, nil)
	})

	mux.HandleFunc("/api/native/vfs/copy", func(w http.ResponseWriter, r *http.Request) {
		touch()
		if !requirePost(w, r) {
			return
		}
		from, ok := resolveQuery(w, r, "from")
		if !ok {
			return
		}
		to, ok := resolveQuery(w, r, "to")
		if !ok {
			return
		}
		// skipSame=1: файл того же размера уже на месте, повторная сборка его не копирует.
		// skipSame=1: a same-size file is already there, so a repeated build skips it.
		if r.URL.Query().Get("skipSame") == "1" {
			src, serr := os.Stat(from)
			dst, derr := os.Stat(to)
			if serr == nil && derr == nil && !src.IsDir() && !dst.IsDir() && src.Size() == dst.Size() {
				writeJSONOK(w, map[string]any{"skipped": true})
				return
			}
		}
		if err := os.MkdirAll(filepath.Dir(to), 0o755); err != nil {
			vfsFSError(w, err)
			return
		}
		if err := copyFile(from, to); err != nil {
			vfsFSError(w, err)
			return
		}
		writeJSONOK(w, nil)
	})
}

// copyBufSize: на Windows io.Copy между файлами идёт буфером 32 КБ, крупный буфер быстрее.
// copyBufSize: on Windows io.Copy between files uses a 32 KB buffer; a large one is faster.
const copyBufSize = 1 << 20

func copyContents(dst *os.File, src *os.File) error {
	if runtime.GOOS != "windows" {
		// Linux/macOS: ReadFrom использует copy_file_range/sendfile. / uses copy_file_range/sendfile.
		_, err := io.Copy(dst, src)
		return err
	}
	buf := make([]byte, copyBufSize)
	_, err := io.CopyBuffer(struct{ io.Writer }{dst}, struct{ io.Reader }{src}, buf)
	return err
}

// movePath renames, falling back to copy + delete across volumes.
func movePath(from, to string) error {
	if err := os.Rename(from, to); err == nil {
		return nil
	}
	st, err := os.Stat(from)
	if err != nil {
		return err
	}
	if st.IsDir() {
		return errors.New("moving a folder across disks is not supported")
	}
	if err := copyFile(from, to); err != nil {
		return err
	}
	return os.Remove(from)
}

func copyFile(from, to string) error {
	in, err := os.Open(from)
	if err != nil {
		return err
	}
	defer in.Close()
	st, err := in.Stat()
	if err != nil {
		return err
	}
	if st.IsDir() {
		return errors.New("copying folders is not supported")
	}
	tmp, err := os.CreateTemp(filepath.Dir(to), ".aegis-copy-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	if err := copyContents(tmp, in); err != nil {
		_ = tmp.Close()
		_ = os.Remove(tmpName)
		return err
	}
	if err := tmp.Close(); err != nil {
		_ = os.Remove(tmpName)
		return err
	}
	_ = os.Chtimes(tmpName, time.Now(), st.ModTime())
	if err := os.Rename(tmpName, to); err != nil {
		_ = os.Remove(tmpName)
		return err
	}
	return nil
}

func vfsContentType(p string) string {
	switch strings.ToLower(filepath.Ext(p)) {
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".webp":
		return "image/webp"
	case ".gif":
		return "image/gif"
	case ".bmp":
		return "image/bmp"
	case ".mp4", ".m4v":
		return "video/mp4"
	case ".webm":
		return "video/webm"
	case ".mkv":
		return "video/x-matroska"
	case ".mp3":
		return "audio/mpeg"
	case ".ogg":
		return "audio/ogg"
	default:
		return "application/octet-stream"
	}
}
