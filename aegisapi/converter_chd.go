package aegisapi

// Создание CHD и проверка готового CHD / Creating a CHD and checking a finished one.
//
// RU: Общий код для Windows (cmd/aegis-gui) и macOS (aegisdesktop). Вход готовит
// aegiscore.PrepareCDInput, кодеки закреплены (cdlz,cdzl,cdfl), после chdman результат читается
// обратно и проверяется: для PS1 дорожка 1 должна быть с сырыми секторами, иначе CHD не открыть
// на R36S. Подробности в docs/chd-r36s.md.
//
// EN: Shared by Windows (cmd/aegis-gui) and macOS (aegisdesktop). aegiscore.PrepareCDInput prepares
// the input, codecs are pinned (cdlz,cdzl,cdfl), and after chdman the result is read back and checked:
// for PS1 track 1 must have raw sectors, or the CHD will not open on an R36S. See docs/chd-r36s.md.

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"aegisgui/aegiscore"
)

// CreateCDCHD runs chdman createcd on a prepared input and checks the output.
// prep (optional) adjusts the command, e.g. to hide the console window on Windows.
func CreateCDCHD(ctx context.Context, chdman, entry, tmpDir, baseName, console string, prep func(*exec.Cmd)) (string, []string, error) {
	input, notes, err := aegiscore.PrepareCDInput(entry, tmpDir, baseName, console)
	if err != nil {
		return "", notes, err
	}
	out := filepath.Join(tmpDir, baseName+".chd")
	cmd := exec.CommandContext(ctx, chdman, aegiscore.ChdmanCreateCDArgs(input, out)...)
	cmd.Dir = tmpDir
	if prep != nil {
		prep(cmd)
	}
	if b, err := cmd.CombinedOutput(); err != nil {
		return "", notes, errors.New("chdman createcd error: " + err.Error() + "\n" + tailString(string(b), 4000))
	}
	info, err := aegiscore.InspectCHD(out)
	if err != nil {
		return "", notes, errors.New("готовый CHD не читается / the finished CHD cannot be read: " + err.Error())
	}
	if len(info.Tracks) == 0 || info.LogicalBytes == 0 {
		return "", notes, errors.New("chdman создал пустой CHD (0 дорожек) / chdman produced an empty CHD (0 tracks)")
	}
	for _, is := range aegiscore.CheckCHDForConsole(info, console) {
		if is.Level == "error" {
			return "", notes, errors.New(is.Text)
		}
		notes = append(notes, is.Text)
	}
	return out, notes, nil
}

// SetConverterNotes passes notes to the page in a header (URL-escaped, joined by " | ").
func SetConverterNotes(w http.ResponseWriter, notes []string) {
	if len(notes) == 0 {
		return
	}
	w.Header().Set("X-Converter-Notes", url.PathEscape(strings.Join(notes, " | ")))
}

func tailString(s string, n int) string {
	// chdman пишет прогресс через \r: оставляем только конец. / chdman prints progress with \r: keep the end.
	if i := strings.LastIndex(s, "\r"); i >= 0 && i < len(s)-1 {
		s = s[i+1:]
	}
	if len(s) > n {
		return s[len(s)-n:]
	}
	return s
}

// HandleChdVerify answers POST /api/native/converter/verify with path=<file> [&console=psx] [&deep=1].
// It reads the CHD header and metadata; deep=1 also runs "chdman verify" (reads every hunk, slow).
func HandleChdVerify(w http.ResponseWriter, r *http.Request, chdman string, prep func(*exec.Cmd)) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var p string
	if raw := strings.TrimSpace(r.FormValue("path")); raw != "" {
		var err error
		if p, err = ResolveVFSPath(raw); err != nil {
			http.Error(w, err.Error(), http.StatusForbidden)
			return
		}
	} else {
		// Окно браузера (Edge): пути к файлу нет, страница присылает сам CHD.
		// Browser window (Edge): there is no file path, the page sends the CHD itself.
		up, err := saveUploadedCHD(r)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		defer os.RemoveAll(filepath.Dir(up))
		p = up
	}
	if st, err := os.Stat(p); err != nil || st.IsDir() {
		http.Error(w, "file not found", http.StatusNotFound)
		return
	}
	res := map[string]any{}
	info, err := aegiscore.InspectCHD(p)
	if err != nil {
		res["error"] = err.Error()
		writeJSONOK(w, res)
		return
	}
	res["info"] = info
	res["issues"] = aegiscore.CheckCHDForConsole(info, r.FormValue("console"))
	if r.FormValue("deep") == "1" {
		if chdman == "" {
			res["deep"] = map[string]any{"ran": false, "error": "chdman not found"}
		} else {
			ctx, cancel := context.WithTimeout(r.Context(), 30*time.Minute)
			defer cancel()
			cmd := exec.CommandContext(ctx, chdman, "verify", "-i", p)
			if prep != nil {
				prep(cmd)
			}
			b, vErr := cmd.CombinedOutput()
			deep := map[string]any{"ran": true, "ok": vErr == nil, "output": tailString(string(b), 2000)}
			if vErr != nil {
				deep["error"] = vErr.Error()
			}
			res["deep"] = deep
		}
	}
	writeJSONOK(w, res)
}

// saveUploadedCHD copies the multipart "file" part into a temp folder and returns its path.
func saveUploadedCHD(r *http.Request) (string, error) {
	if r.MultipartForm == nil {
		return "", errors.New("no path and no file")
	}
	fhs := r.MultipartForm.File["file"]
	if len(fhs) == 0 {
		return "", errors.New("no path and no file")
	}
	in, err := fhs[0].Open()
	if err != nil {
		return "", err
	}
	defer in.Close()
	dir, err := os.MkdirTemp("", "aegis-chd-verify-")
	if err != nil {
		return "", err
	}
	out := filepath.Join(dir, "upload.chd")
	f, err := os.Create(out)
	if err != nil {
		os.RemoveAll(dir)
		return "", err
	}
	_, cErr := io.Copy(f, in)
	if err := f.Close(); cErr == nil {
		cErr = err
	}
	if cErr != nil {
		os.RemoveAll(dir)
		return "", cErr
	}
	return out, nil
}
