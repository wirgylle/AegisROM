package aegisapi

// Действия «Проверки ромов»: показать файл в папке, убрать в корзину, пересобрать CHD.
// ROM check actions: show a file in its folder, move it to the Recycle Bin, rebuild a CHD.
//
// RU: Все пути проходят через ResolveVFSPath, то есть лежат внутри папок, выбранных пользователем
// в своём окне приложения. Удаление идёт в корзину Windows (можно восстановить), на других системах
// маршрут отвечает 501 и страница удаляет файл сама. Пересборка CHD: chdman extractcd/extractdvd во
// временную папку рядом с файлом, затем CreateCDCHD (кодеки без Zstandard, PS1 в MODE2/2352), затем
// новый файл встаёт на место старого, а старый уходит в корзину.
//
// EN: Every path goes through ResolveVFSPath, so it lies inside folders the user picked in the app's
// own window. Deleting moves files to the Windows Recycle Bin (recoverable); on other systems the route
// answers 501 and the page deletes the file itself. CHD rebuild: chdman extractcd/extractdvd into a temp
// folder next to the file, then CreateCDCHD (no Zstandard codecs, PS1 as MODE2/2352), then the new file
// replaces the old one and the old one goes to the Recycle Bin.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"aegisgui/aegiscore"
)

// RomCheckOptions wires the platform parts in.
type RomCheckOptions struct {
	// Chdman returns the chdman path or "".
	Chdman func() string
	// Prep adjusts chdman commands (hide the console window on Windows).
	Prep func(*exec.Cmd)
}

var errTrashUnsupported = errors.New("recycle bin is not available on this system")

func resolveExistingFile(p string) (string, error) {
	abs, err := ResolveVFSPath(strings.TrimSpace(p))
	if err != nil {
		return "", err
	}
	st, err := os.Stat(abs)
	if err != nil {
		return "", err
	}
	if st.IsDir() {
		return "", errors.New("not a file")
	}
	return abs, nil
}

func romCheckJSON(w http.ResponseWriter, status int, v map[string]any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// RegisterRomCheckRoutes adds:
//
//	POST /api/native/romcheck/reveal       {path}            — show the file selected in the file manager
//	POST /api/native/romcheck/trash        {paths: []}       — move files to the Recycle Bin
//	POST /api/native/romcheck/rebuild-chd  {path, console}   — recreate a CD CHD the cores can read
func RegisterRomCheckRoutes(mux *http.ServeMux, touch func(), opts RomCheckOptions) {
	if touch == nil {
		touch = func() {}
	}
	mux.HandleFunc("/api/native/romcheck/reveal", func(w http.ResponseWriter, r *http.Request) {
		touch()
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			Path string `json:"path"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&req); err != nil {
			romCheckJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": err.Error()})
			return
		}
		abs, err := ResolveVFSPath(strings.TrimSpace(req.Path))
		if err != nil {
			romCheckJSON(w, http.StatusForbidden, map[string]any{"ok": false, "error": err.Error()})
			return
		}
		if _, err := os.Stat(abs); err != nil {
			// Файла нет: открываем ближайшую существующую папку. / No file: open the nearest existing folder.
			dir := filepath.Dir(abs)
			for {
				if st, e := os.Stat(dir); e == nil && st.IsDir() {
					break
				}
				next := filepath.Dir(dir)
				if next == dir {
					break
				}
				dir = next
			}
			if _, e := ResolveVFSPath(dir); e != nil {
				romCheckJSON(w, http.StatusNotFound, map[string]any{"ok": false, "error": "not found"})
				return
			}
			if err := revealInFileManager(dir, true); err != nil {
				romCheckJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": err.Error()})
				return
			}
			romCheckJSON(w, http.StatusOK, map[string]any{"ok": true, "folder": dir})
			return
		}
		if err := revealInFileManager(abs, false); err != nil {
			romCheckJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": err.Error()})
			return
		}
		romCheckJSON(w, http.StatusOK, map[string]any{"ok": true})
	})

	mux.HandleFunc("/api/native/romcheck/trash", func(w http.ResponseWriter, r *http.Request) {
		touch()
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			Paths []string `json:"paths"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
			romCheckJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": err.Error()})
			return
		}
		if len(req.Paths) == 0 || len(req.Paths) > 5000 {
			romCheckJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "no paths"})
			return
		}
		var files []string
		for _, p := range req.Paths {
			abs, err := resolveExistingFile(p)
			if err != nil {
				romCheckJSON(w, http.StatusForbidden, map[string]any{"ok": false, "error": fmt.Sprintf("%s: %v", p, err)})
				return
			}
			files = append(files, abs)
		}
		if err := moveToTrash(files); err != nil {
			status := http.StatusInternalServerError
			if errors.Is(err, errTrashUnsupported) {
				status = http.StatusNotImplemented
			}
			romCheckJSON(w, status, map[string]any{"ok": false, "error": err.Error()})
			return
		}
		romCheckJSON(w, http.StatusOK, map[string]any{"ok": true, "trashed": len(files)})
	})

	mux.HandleFunc("/api/native/romcheck/rebuild-chd", func(w http.ResponseWriter, r *http.Request) {
		touch()
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			Path    string `json:"path"`
			Console string `json:"console"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&req); err != nil {
			romCheckJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": err.Error()})
			return
		}
		abs, err := resolveExistingFile(req.Path)
		if err != nil || !strings.EqualFold(filepath.Ext(abs), ".chd") {
			romCheckJSON(w, http.StatusForbidden, map[string]any{"ok": false, "error": "not a CHD inside the library"})
			return
		}
		chdman := ""
		if opts.Chdman != nil {
			chdman = opts.Chdman()
		}
		if chdman == "" {
			romCheckJSON(w, http.StatusPreconditionFailed, map[string]any{"ok": false, "error": "chdman not found", "code": "noChdman"})
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Hour)
		defer cancel()
		notes, err := RebuildCDCHD(ctx, chdman, abs, req.Console, opts.Prep)
		if err != nil {
			romCheckJSON(w, http.StatusOK, map[string]any{"ok": false, "error": err.Error(), "notes": notes})
			return
		}
		romCheckJSON(w, http.StatusOK, map[string]any{"ok": true, "notes": notes})
	})
}

// RebuildCDCHD extracts a CHD and creates it again as a CD CHD with pinned codecs, then puts it in place
// of the original. The original goes to the Recycle Bin where there is one, otherwise it is removed.
func RebuildCDCHD(ctx context.Context, chdman, src, console string, prep func(*exec.Cmd)) ([]string, error) {
	info, err := aegiscore.InspectCHD(src)
	if err != nil {
		return nil, fmt.Errorf("CHD не читается / cannot read the CHD: %w", err)
	}
	if info.HasParent {
		return nil, errors.New("CHD ссылается на родителя, пересобрать нельзя / the CHD needs a parent, cannot rebuild")
	}
	dir := filepath.Dir(src)
	// Временная папка рядом с файлом: тот же диск, замена — простое переименование.
	// A temp folder next to the file: same drive, so replacing is a plain rename.
	tmp, err := os.MkdirTemp(dir, ".aegis-rebuild-")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(tmp)

	run := func(args ...string) error {
		cmd := exec.CommandContext(ctx, chdman, args...)
		cmd.Dir = tmp
		if prep != nil {
			prep(cmd)
		}
		if b, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("chdman %s: %v\n%s", args[0], err, tailString(string(b), 2000))
		}
		return nil
	}

	var entry string
	if info.Kind == "dvd" {
		entry = filepath.Join(tmp, "disc.iso")
		if err := run("extractdvd", "-f", "-i", src, "-o", entry); err != nil {
			return nil, err
		}
	} else if info.Kind == "cd" {
		cue := filepath.Join(tmp, "disc.cue")
		bin := filepath.Join(tmp, "disc.bin")
		if err := run("extractcd", "-f", "-i", src, "-o", cue, "-ob", bin); err != nil {
			return nil, err
		}
		entry = cue
		// Одна дорожка: отдаём сам образ, тогда образ PS1 на 2048 станет MODE2/2352.
		// One track: pass the image itself so a 2048-byte PS1 image becomes MODE2/2352.
		if len(info.Tracks) == 1 {
			entry = bin
		}
	} else {
		return nil, errors.New("пересобрать можно только CD/DVD CHD / only CD and DVD CHDs can be rebuilt")
	}

	out, notes, err := CreateCDCHD(ctx, chdman, entry, tmp, "rebuilt", console, prep)
	if err != nil {
		return notes, err
	}
	old := filepath.Join(tmp, "original.chd")
	if err := os.Rename(src, old); err != nil {
		return notes, err
	}
	if err := os.Rename(out, src); err != nil {
		// Возвращаем старый файл на место. / Put the old file back.
		_ = os.Rename(old, src)
		return notes, err
	}
	if err := moveToTrash([]string{old}); err != nil {
		_ = os.Remove(old)
	}
	return notes, nil
}
