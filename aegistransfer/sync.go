package aegistransfer

import (
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// PartSuffix — недокачанный файл на устройстве / an unfinished file on the device.
const PartSuffix = ".aegis-part"

// MtimeSlack — FAT/exFAT хранят время с точностью до 2 с / FAT/exFAT keep time with 2 s precision.
const MtimeSlack = 2 * time.Second

// Сколько раз переподключаться при обрыве / how many times to reconnect after a drop.
var reconnectDelays = []time.Duration{2 * time.Second, 5 * time.Second, 10 * time.Second}

// Подряд столько ошибок по файлам — остановка (что-то не так целиком).
// This many file errors in a row stop the run (something is wrong overall).
const maxConsecutiveFileErrors = 20

// LocalFile — файл папки сборки / a file of the build folder.
type LocalFile struct {
	Rel     string // путь через "/" / slash path
	Abs     string
	Size    int64
	ModTime time.Time
}

// skipLocal: служебные файлы, которые на приставку не нужны.
// skipLocal: housekeeping files the handheld does not need.
func skipLocal(name string, dir bool) bool {
	low := strings.ToLower(name)
	if dir {
		return strings.HasPrefix(low, ".aegis") || low == "$recycle.bin" || low == "system volume information"
	}
	return low == "thumbs.db" || low == "desktop.ini" || low == ".ds_store" || strings.HasSuffix(low, PartSuffix) ||
		strings.HasPrefix(low, "._")
}

// ScanLocal собирает файлы папки сборки / lists the files of a build folder.
func ScanLocal(root string) ([]LocalFile, error) {
	st, err := os.Stat(root)
	if err != nil || !st.IsDir() {
		if err == nil {
			err = errors.New("not a folder")
		}
		return nil, coded(CodeLocalMissing, err)
	}
	var out []LocalFile
	err = filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if p == root {
			return nil
		}
		if skipLocal(d.Name(), d.IsDir()) {
			if d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if d.IsDir() || !d.Type().IsRegular() {
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(root, p)
		out = append(out, LocalFile{Rel: filepath.ToSlash(rel), Abs: p, Size: info.Size(), ModTime: info.ModTime()})
		return nil
	})
	sort.Slice(out, func(i, j int) bool { return out[i].Rel < out[j].Rel })
	return out, err
}

// NeedsUpload: файла нет, другой размер или локальный новее.
// NeedsUpload: the file is missing, its size differs, or the local one is newer.
func NeedsUpload(local LocalFile, remote RemoteEntry, exists bool) bool {
	if !exists || remote.IsDir {
		return true
	}
	if remote.Size != local.Size {
		return true
	}
	return local.ModTime.After(remote.ModTime.Add(MtimeSlack))
}

// FileError — ошибка по одному файлу / an error for one file.
type FileError struct {
	Path    string `json:"path"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

// Snapshot — состояние заливки для окна / upload state for the UI.
type Snapshot struct {
	ID          string      `json:"id"`
	ProfileID   string      `json:"profileId"`
	ProfileName string      `json:"profileName"`
	LocalDir    string      `json:"localDir"`
	RemoteDir   string      `json:"remoteDir"`
	State       string      `json:"state"` // connecting, planning, uploading, done, failed, cancelled
	Phase       string      `json:"phase,omitempty"`
	Scanned     int         `json:"scanned"`
	TotalFiles  int         `json:"totalFiles"`  // файлов в сборке / files in the build
	ToUpload    int         `json:"toUpload"`    // файлов к заливке / files to upload
	UploadBytes int64       `json:"uploadBytes"` // байт к заливке / bytes to upload
	Uploaded    int         `json:"uploaded"`
	Skipped     int         `json:"skipped"`
	Failed      int         `json:"failed"`
	Resumed     int         `json:"resumed"`
	BytesDone   int64       `json:"bytesDone"`
	Current     string      `json:"current,omitempty"`
	Reconnects  int         `json:"reconnects"`
	FreeBytes   int64       `json:"freeBytes"`
	StartedAt   time.Time   `json:"startedAt"`
	FinishedAt  *time.Time  `json:"finishedAt,omitempty"`
	ErrorCode   string      `json:"errorCode,omitempty"`
	Error       string      `json:"error,omitempty"`
	Errors      []FileError `json:"errors,omitempty"`
}

// Job — одна заливка / one upload run.
type Job struct {
	mu     sync.Mutex
	s      Snapshot
	cancel context.CancelFunc
	done   chan struct{}
}

// Snapshot — копия состояния / a copy of the state.
func (j *Job) Snapshot() Snapshot {
	j.mu.Lock()
	defer j.mu.Unlock()
	s := j.s
	s.Errors = append([]FileError(nil), j.s.Errors...)
	return s
}

// Cancel останавливает заливку / stops the run.
func (j *Job) Cancel() {
	if j.cancel != nil {
		j.cancel()
	}
}

// Done закрывается по окончании / is closed when the run ends.
func (j *Job) Done() <-chan struct{} { return j.done }

// Running — заливка ещё идёт / the run is still going.
func (j *Job) Running() bool {
	select {
	case <-j.done:
		return false
	default:
		return true
	}
}

func (j *Job) set(fn func(s *Snapshot)) {
	j.mu.Lock()
	fn(&j.s)
	j.mu.Unlock()
}

const maxListedErrors = 50

func (j *Job) fileError(rel string, err error) {
	j.set(func(s *Snapshot) {
		s.Failed++
		if len(s.Errors) < maxListedErrors {
			s.Errors = append(s.Errors, FileError{Path: rel, Code: Classify(err), Message: err.Error()})
		}
	})
}

// Dialer открывает новое подключение / opens a new connection.
type Dialer func(ctx context.Context) (Remote, error)

// Start запускает заливку localDir → remoteDir в фоне.
// Start runs the localDir → remoteDir upload in the background.
func Start(parent context.Context, id string, p Profile, localDir string, dial Dialer) *Job {
	ctx, cancel := context.WithCancel(parent)
	j := &Job{cancel: cancel, done: make(chan struct{})}
	j.s = Snapshot{
		ID: id, ProfileID: p.ID, ProfileName: p.Name, LocalDir: localDir, RemoteDir: p.RemoteDir,
		State: "connecting", StartedAt: time.Now(), FreeBytes: -1,
	}
	go func() {
		defer close(j.done)
		defer cancel()
		err := run(ctx, j, localDir, p.RemoteDir, dial)
		now := time.Now()
		j.set(func(s *Snapshot) {
			s.FinishedAt = &now
			s.Current = ""
			switch {
			case err == nil:
				s.State = "done"
			case errors.Is(err, context.Canceled) || ctx.Err() != nil:
				s.State = "cancelled"
				s.ErrorCode = CodeCancelled
			default:
				s.State = "failed"
				s.ErrorCode = Classify(err)
				s.Error = err.Error()
			}
		})
	}()
	return j
}

// conn держит подключение и переподключается при обрыве.
// conn holds the connection and reconnects after a drop.
type conn struct {
	ctx  context.Context
	dial Dialer
	r    Remote
	job  *Job
}

func (c *conn) get() (Remote, error) {
	if c.r != nil {
		return c.r, nil
	}
	r, err := c.dial(c.ctx)
	if err != nil {
		return nil, err
	}
	c.r = r
	return r, nil
}

func (c *conn) drop() {
	if c.r != nil {
		_ = c.r.Close()
		c.r = nil
	}
}

// retry выполняет fn, переподключаясь при обрыве связи.
// retry runs fn, reconnecting after a dropped connection.
func (c *conn) retry(fn func(r Remote) error) error {
	var err error
	for attempt := 0; ; attempt++ {
		if c.ctx.Err() != nil {
			return c.ctx.Err()
		}
		var r Remote
		r, err = c.get()
		if err == nil {
			err = fn(r)
			if err == nil {
				return nil
			}
		}
		if c.ctx.Err() != nil {
			return c.ctx.Err()
		}
		if !isNetworkErr(err) || attempt >= len(reconnectDelays) {
			if isNetworkErr(err) {
				return coded(CodeConnLost, err)
			}
			return err
		}
		c.drop()
		c.job.set(func(s *Snapshot) { s.Reconnects++ })
		select {
		case <-c.ctx.Done():
			return c.ctx.Err()
		case <-time.After(reconnectDelays[attempt]):
		}
	}
}

type plannedFile struct {
	LocalFile
	remote string
	// resumeFrom — сколько байт уже лежит в .aegis-part / bytes already in .aegis-part.
	resumeFrom int64
}

func run(ctx context.Context, j *Job, localDir, remoteDir string, dial Dialer) error {
	files, err := ScanLocal(localDir)
	if err != nil {
		return err
	}
	j.set(func(s *Snapshot) { s.TotalFiles = len(files) })

	c := &conn{ctx: ctx, dial: dial, job: j}
	defer c.drop()
	if _, err := c.get(); err != nil {
		return err
	}

	// Корень папки ромов должен быть: если его нет, скорее всего не та карта или прошивка.
	// The ROM root must exist: if not, it is likely the wrong card or firmware.
	if err := c.retry(func(r Remote) error {
		st, err := r.Stat(remoteDir)
		if err != nil {
			if isNotExist(err) {
				return coded(CodeRemoteMissing, fmt.Errorf("%s: %w", remoteDir, err))
			}
			return err
		}
		if !st.IsDir {
			return coded(CodeRemoteMissing, fmt.Errorf("%s is not a folder", remoteDir))
		}
		return nil
	}); err != nil {
		return err
	}

	// План: одна выборка на папку, а не запрос на каждый файл.
	// Plan: one listing per folder instead of a request per file.
	j.set(func(s *Snapshot) { s.State = "planning" })
	listings := map[string]map[string]RemoteEntry{}
	var plan []plannedFile
	var need int64
	for i, f := range files {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		rdir := path.Join(remoteDir, path.Dir(f.Rel))
		entries, ok := listings[rdir]
		if !ok {
			if err := c.retry(func(r Remote) error {
				var e error
				entries, _, e = r.ReadDir(rdir)
				return e
			}); err != nil {
				return err
			}
			listings[rdir] = entries
		}
		name := path.Base(f.Rel)
		re, exists := entries[name]
		if NeedsUpload(f, re, exists) {
			pf := plannedFile{LocalFile: f, remote: path.Join(remoteDir, f.Rel)}
			// Докачка, только если кусок новее локального файла (иначе он от старой версии).
			// Resume only when the part is newer than the local file (else it is from an old version).
			if part, ok := entries[name+PartSuffix]; ok && !part.IsDir && part.Size > 0 && part.Size < f.Size &&
				part.ModTime.After(f.ModTime) {
				pf.resumeFrom = part.Size
			}
			plan = append(plan, pf)
			need += f.Size - pf.resumeFrom
		}
		j.set(func(s *Snapshot) {
			s.Scanned = i + 1
			s.ToUpload = len(plan)
			s.UploadBytes = need
			s.Skipped = i + 1 - len(plan)
		})
	}

	if len(plan) == 0 {
		return nil
	}

	// Место на устройстве / space on the device.
	var free int64 = -1
	_ = c.retry(func(r Remote) error { free = r.FreeBytes(remoteDir); return nil })
	j.set(func(s *Snapshot) { s.FreeBytes = free })
	if free >= 0 && need > free {
		return coded(CodeNoSpace, fmt.Errorf("need %d bytes, %d free", need, free))
	}

	j.set(func(s *Snapshot) { s.State = "uploading" })
	madeDirs := map[string]bool{}
	consecutive := 0
	for _, pf := range plan {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		j.set(func(s *Snapshot) { s.Current = pf.Rel })
		err := uploadOne(ctx, c, j, pf, madeDirs)
		if err != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			code := Classify(err)
			// Обрыв после всех попыток и нехватка места — дальше нет смысла.
			// A drop after all retries, or no space: no point going on.
			if code == CodeConnLost || code == CodeNoSpace {
				return err
			}
			j.fileError(pf.Rel, err)
			consecutive++
			if consecutive >= maxConsecutiveFileErrors {
				return err
			}
			continue
		}
		consecutive = 0
		j.set(func(s *Snapshot) { s.Uploaded++ })
	}
	j.mu.Lock()
	failed := j.s.Failed
	j.mu.Unlock()
	if failed > 0 {
		return coded(CodeOther, fmt.Errorf("%d files were not uploaded", failed))
	}
	return nil
}

// progressReader считает отправленные байты / counts sent bytes.
type progressReader struct {
	ctx context.Context
	r   io.Reader
	j   *Job
	n   *int64
}

func (p *progressReader) Read(b []byte) (int, error) {
	if err := p.ctx.Err(); err != nil {
		return 0, err
	}
	n, err := p.r.Read(b)
	if n > 0 {
		*p.n += int64(n)
		p.j.set(func(s *Snapshot) { s.BytesDone += int64(n) })
	}
	return n, err
}

func uploadOne(ctx context.Context, c *conn, j *Job, pf plannedFile, madeDirs map[string]bool) error {
	dir := path.Dir(pf.remote)
	part := pf.remote + PartSuffix
	offset := pf.resumeFrom
	if offset > 0 {
		j.set(func(s *Snapshot) { s.Resumed++ })
	}
	// counted — сколько байт этого файла уже учтено в прогрессе.
	// counted is how many bytes of this file are already in the progress.
	var counted int64
	return c.retry(func(r Remote) error {
		if !madeDirs[dir] {
			if err := r.MkdirAll(dir); err != nil {
				return err
			}
			madeDirs[dir] = true
		}
		// После обрыва узнаём, сколько реально дошло. / After a drop, check what actually arrived.
		if offset > 0 {
			if st, err := r.Stat(part); err == nil && !st.IsDir && st.Size <= pf.Size {
				offset = st.Size
			} else {
				offset = 0
			}
			want := max(0, offset-pf.resumeFrom)
			delta := want - counted
			counted = want
			j.set(func(s *Snapshot) { s.BytesDone += delta })
		}
		src, err := os.Open(pf.Abs)
		if err != nil {
			return err
		}
		defer src.Close()
		if offset > 0 {
			if _, err := src.Seek(offset, io.SeekStart); err != nil {
				return err
			}
		}
		dst, err := r.OpenWrite(part, offset)
		if err != nil {
			return err
		}
		var sent int64
		_, err = io.Copy(dst, &progressReader{ctx: ctx, r: src, j: j, n: &sent})
		cerr := dst.Close()
		offset += sent
		counted += sent
		if err == nil {
			err = cerr
		}
		if err != nil {
			return err
		}
		if offset != pf.Size {
			return fmt.Errorf("%s: wrote %d of %d bytes", pf.Rel, offset, pf.Size)
		}
		if err := r.Replace(part, pf.remote); err != nil {
			return err
		}
		// Время как у исходника: следующая заливка поймёт, что файл тот же.
		// Same time as the source, so the next upload sees the file is unchanged.
		_ = r.Chtimes(pf.remote, pf.ModTime)
		return nil
	})
}

// ProbeResult — итог проверки соединения / connection test result.
type ProbeResult struct {
	FreeBytes int64 `json:"freeBytes"`
	Writable  bool  `json:"writable"`
}

// Probe проверяет папку ромов: есть ли она и можно ли в неё писать.
// Probe checks the ROM folder: does it exist and is it writable.
func Probe(r Remote, remoteDir string) (ProbeResult, error) {
	res := ProbeResult{FreeBytes: -1}
	st, err := r.Stat(remoteDir)
	if err != nil {
		if isNotExist(err) {
			return res, coded(CodeRemoteMissing, fmt.Errorf("%s: %w", remoteDir, err))
		}
		return res, err
	}
	if !st.IsDir {
		return res, coded(CodeRemoteMissing, fmt.Errorf("%s is not a folder", remoteDir))
	}
	test := path.Join(remoteDir, ".aegis-write-test"+PartSuffix)
	w, err := r.OpenWrite(test, 0)
	if err != nil {
		return res, err
	}
	_, err = io.WriteString(w, "AegisROM")
	if cerr := w.Close(); err == nil {
		err = cerr
	}
	_ = r.Remove(test)
	if err != nil {
		return res, err
	}
	res.Writable = true
	res.FreeBytes = r.FreeBytes(remoteDir)
	return res, nil
}
