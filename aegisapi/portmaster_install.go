package aegisapi

// Установка порта PortMaster прямо на диск: Go качает архив во временный файл рядом
// с папкой ports/, распаковывает его туда и удаляет. Так крупные порты (сотни МБ и больше)
// не проходят через память окна. Прогресс отдаётся опросом /api/portmaster/install/status.
//
// Installing a PortMaster port straight to disk: Go downloads the archive into a temp file
// next to ports/, unpacks it there and deletes it. Big ports (hundreds of MB and more) never
// pass through the window's memory. Progress is polled via /api/portmaster/install/status.

import (
	"archive/zip"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

var portMasterURLPrefixes = []string{
	"https://github.com/PortsMaster/",
	"https://github.com/PortsMaster-MV/",
	"https://raw.githubusercontent.com/PortsMaster/",
	"https://raw.githubusercontent.com/PortsMaster-MV/",
}

// isPortMasterURL: качаем только с репозиториев PortMaster (основной и MV).
// isPortMasterURL: downloads only from PortMaster repositories (main and MV).
func isPortMasterURL(u string) bool {
	for _, p := range portMasterURLPrefixes {
		if strings.HasPrefix(u, p) {
			return true
		}
	}
	return false
}

func portMasterHTTPClient() *http.Client {
	return &http.Client{Transport: &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		ResponseHeaderTimeout: 60 * time.Second,
		TLSHandshakeTimeout:   20 * time.Second,
	}}
}

type portInstallJob struct {
	mu       sync.Mutex
	Phase    string `json:"phase"` // download | unpack | done | error
	Done     int64  `json:"done"`
	Total    int64  `json:"total"`
	Files    int    `json:"files"`
	Launcher string `json:"launcher"`
	Error    string `json:"error,omitempty"`
}

func (j *portInstallJob) set(f func(j *portInstallJob)) {
	j.mu.Lock()
	f(j)
	j.mu.Unlock()
}

func (j *portInstallJob) snapshot() map[string]any {
	j.mu.Lock()
	defer j.mu.Unlock()
	return map[string]any{
		"phase": j.Phase, "done": j.Done, "total": j.Total,
		"files": j.Files, "launcher": j.Launcher, "error": j.Error,
	}
}

type progressWriter struct {
	w   io.Writer
	job *portInstallJob
}

func (p *progressWriter) Write(b []byte) (int, error) {
	n, err := p.w.Write(b)
	p.job.set(func(j *portInstallJob) { j.Done += int64(n) })
	return n, err
}

// safePortEntryPath: путь записи архива без «..», абсолютных путей и букв дисков,
// с отрезанной обёрткой ports/. "" — запись пропускаем.
// safePortEntryPath: an archive entry path with no "..", absolute paths or drive letters,
// with a ports/ wrapper stripped. "" means skip the entry.
func safePortEntryPath(name string) string {
	n := strings.ReplaceAll(name, "\\", "/")
	if strings.HasPrefix(n, "/") || (len(n) >= 2 && n[1] == ':') {
		return ""
	}
	segs := []string{}
	for _, s := range strings.Split(n, "/") {
		if s == "" || s == "." {
			continue
		}
		if s == ".." {
			return ""
		}
		segs = append(segs, s)
	}
	if len(segs) > 1 && strings.EqualFold(segs[0], "ports") {
		segs = segs[1:]
	}
	return strings.Join(segs, "/")
}

var nonAlnum = regexp.MustCompile(`[^a-z0-9]`)

// pickLauncher: .sh в корне архива; если их несколько, тот, что совпадает со slug.
// pickLauncher: a .sh at the archive root; with several, the one matching the slug.
func pickLauncher(rootSh []string, slug string) string {
	if len(rootSh) == 0 {
		return ""
	}
	sort.Strings(rootSh)
	want := nonAlnum.ReplaceAllString(strings.ToLower(slug), "")
	for _, s := range rootSh {
		if nonAlnum.ReplaceAllString(strings.ToLower(strings.TrimSuffix(s, path.Ext(s))), "") == want {
			return s
		}
	}
	return rootSh[0]
}

// unpackPortArchive распаковывает zip в portsDir. Скриптам .sh ставит права на запуск.
// unpackPortArchive unpacks a zip into portsDir. Gives .sh scripts the execute bit.
func unpackPortArchive(zipPath, portsDir, slug string, onEntry func(i, total int)) (int, string, error) {
	zr, err := zip.OpenReader(zipPath)
	if err != nil {
		return 0, "", fmt.Errorf("zip-invalid: %w", err)
	}
	defer zr.Close()
	files := 0
	var rootSh []string
	total := len(zr.File)
	for i, f := range zr.File {
		rel := safePortEntryPath(f.Name)
		if rel != "" {
			dst := filepath.Join(portsDir, filepath.FromSlash(rel))
			if f.FileInfo().IsDir() || strings.HasSuffix(f.Name, "/") {
				if err := os.MkdirAll(dst, 0o755); err != nil {
					return files, "", err
				}
			} else {
				if err := writeZipEntry(f, dst); err != nil {
					return files, "", fmt.Errorf("%s: %w", rel, err)
				}
				files++
				if !strings.Contains(rel, "/") && strings.EqualFold(path.Ext(rel), ".sh") {
					rootSh = append(rootSh, rel)
				}
			}
		}
		if onEntry != nil {
			onEntry(i+1, total)
		}
	}
	return files, pickLauncher(rootSh, slug), nil
}

func writeZipEntry(f *zip.File, dst string) error {
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}
	rc, err := f.Open()
	if err != nil {
		return err
	}
	defer rc.Close()
	mode := os.FileMode(0o644)
	if strings.EqualFold(filepath.Ext(dst), ".sh") || f.Mode()&0o111 != 0 {
		mode = 0o755
	}
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, rc); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}

func runPortInstall(job *portInstallJob, client *http.Client, srcURL, portsDir, slug string) {
	fail := func(err error) {
		job.set(func(j *portInstallJob) { j.Phase = "error"; j.Error = err.Error() })
	}
	if err := os.MkdirAll(portsDir, 0o755); err != nil {
		fail(err)
		return
	}
	tmp, err := os.CreateTemp(portsDir, ".aegis-port-*.zip.part")
	if err != nil {
		fail(err)
		return
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)

	resp, err := client.Get(srcURL)
	if err != nil {
		tmp.Close()
		fail(err)
		return
	}
	if resp.StatusCode != http.StatusOK {
		resp.Body.Close()
		tmp.Close()
		fail(fmt.Errorf("PortMaster: HTTP %d", resp.StatusCode))
		return
	}
	job.set(func(j *portInstallJob) { j.Total = resp.ContentLength })
	_, copyErr := io.Copy(&progressWriter{w: tmp, job: job}, resp.Body)
	resp.Body.Close()
	closeErr := tmp.Close()
	if copyErr != nil {
		fail(copyErr)
		return
	}
	if closeErr != nil {
		fail(closeErr)
		return
	}

	job.set(func(j *portInstallJob) { j.Phase = "unpack"; j.Done = 0; j.Total = 0 })
	files, launcher, err := unpackPortArchive(tmpPath, portsDir, slug, func(i, total int) {
		job.set(func(j *portInstallJob) { j.Done = int64(i); j.Total = int64(total) })
	})
	if err != nil {
		fail(err)
		return
	}
	if files == 0 {
		fail(errors.New("empty-archive"))
		return
	}
	job.set(func(j *portInstallJob) {
		j.Phase = "done"
		j.Files = files
		j.Launcher = launcher
	})
}

// RegisterPortMasterInstallRoutes: POST /api/portmaster/install {url, dest, slug} → {id};
// GET /api/portmaster/install/status?id= → ход установки. dest — папка ports/ внутри папки,
// выбранной пользователем (проверяется по корням VFS), создаётся при необходимости.
// RegisterPortMasterInstallRoutes: POST /api/portmaster/install {url, dest, slug} → {id};
// GET /api/portmaster/install/status?id= → install progress. dest is a ports/ folder inside a
// folder the user picked (checked against the VFS roots), created when missing.
func RegisterPortMasterInstallRoutes(mux *http.ServeMux, touch func(), client *http.Client) {
	if touch == nil {
		touch = func() {}
	}
	if client == nil {
		client = portMasterHTTPClient()
	}
	var (
		mu   sync.Mutex
		jobs = map[string]*portInstallJob{}
		seq  int
	)
	mux.HandleFunc("/api/portmaster/install", func(w http.ResponseWriter, r *http.Request) {
		touch()
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			URL  string `json:"url"`
			Dest string `json:"dest"`
			Slug string `json:"slug"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&req); err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		if !isPortMasterURL(req.URL) {
			http.Error(w, "Invalid PortMaster download URL", http.StatusBadRequest)
			return
		}
		dest, err := ResolveVFSPath(req.Dest)
		if err != nil {
			vfsFSError(w, err)
			return
		}
		job := &portInstallJob{Phase: "download"}
		mu.Lock()
		seq++
		id := strconv.Itoa(seq)
		jobs[id] = job
		mu.Unlock()
		go runPortInstall(job, client, req.URL, dest, req.Slug)
		writeJSONOK(w, map[string]any{"id": id})
	})
	mux.HandleFunc("/api/portmaster/install/status", func(w http.ResponseWriter, r *http.Request) {
		touch()
		id := r.URL.Query().Get("id")
		mu.Lock()
		job := jobs[id]
		mu.Unlock()
		if job == nil {
			http.Error(w, "unknown install job", http.StatusNotFound)
			return
		}
		snap := job.snapshot()
		if p := snap["phase"]; p == "done" || p == "error" {
			mu.Lock()
			delete(jobs, id)
			mu.Unlock()
		}
		writeJSONOK(w, snap)
	})
}
