package aegisapi

// Результат chdman сразу в папку сборки / chdman output straight into the build folder.
//
// RU: Раньше готовый .chd/.iso/.bin отдавался странице целиком, страница держала его в памяти
// (ArrayBuffer на сотни МБ или гигабайты) и отправляла обратно в Go для записи. Если в запросе
// есть outDir (путь внутри выбранных пользователем папок), файлы переносятся туда на диске
// (rename, на другой диск — копия во временный файл и rename), а в ответ уходит только JSON.
//
// EN: The finished .chd/.iso/.bin used to be sent to the page whole; the page held it in memory
// (an ArrayBuffer of hundreds of MB or gigabytes) and sent it back to Go to be written. When the
// request has outDir (a path inside the folders the user picked), the files are moved there on disk
// (rename; across disks a copy to a temp file plus rename) and only JSON is returned.

import (
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// ConverterOutDir returns the checked outDir form value, or "" when it is not set.
func ConverterOutDir(r *http.Request) (string, error) {
	raw := strings.TrimSpace(r.FormValue("outDir"))
	if raw == "" {
		return "", nil
	}
	p, err := ResolveVFSPath(raw)
	if err != nil {
		return "", err
	}
	st, err := os.Stat(p)
	if err != nil {
		return "", err
	}
	if !st.IsDir() {
		return "", errors.New("outDir is not a folder")
	}
	return p, nil
}

// DeliverConverterOutputs moves the named files from tmpDir into outDir and returns the names
// that were delivered. A missing optional file is skipped; a failed move is an error.
func DeliverConverterOutputs(tmpDir, outDir string, names []string) ([]string, error) {
	done := make([]string, 0, len(names))
	for _, name := range names {
		base := filepath.Base(name)
		src := filepath.Join(tmpDir, base)
		if st, err := os.Stat(src); err != nil || st.IsDir() {
			continue
		}
		if err := movePath(src, filepath.Join(outDir, base)); err != nil {
			return done, err
		}
		done = append(done, base)
	}
	if len(done) == 0 {
		return nil, errors.New("converter produced no output files")
	}
	return done, nil
}

// SendConverterOutputs delivers the files to outDir and writes the JSON answer.
func SendConverterOutputs(w http.ResponseWriter, tmpDir, outDir string, names []string) {
	files, err := DeliverConverterOutputs(tmpDir, outDir, names)
	if err != nil {
		http.Error(w, "write to build folder: "+err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("X-Output-Mode", "disk")
	writeJSONOK(w, map[string]any{"mode": "disk", "files": files})
}
