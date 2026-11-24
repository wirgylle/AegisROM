package aegistransfer

import (
	"io"
	"os"
	"path/filepath"
	"time"
)

// DirRemote — локальная папка в роли устройства (тесты, проверка без приставки).
// DirRemote is a local folder acting as the device (tests, checks without a handheld).
type DirRemote struct{ Root string }

func (d DirRemote) abs(p string) string { return filepath.Join(d.Root, filepath.FromSlash(p)) }

func (d DirRemote) ReadDir(dir string) (map[string]RemoteEntry, bool, error) {
	list, err := os.ReadDir(d.abs(dir))
	if os.IsNotExist(err) {
		return map[string]RemoteEntry{}, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	out := make(map[string]RemoteEntry, len(list))
	for _, e := range list {
		fi, err := e.Info()
		if err != nil {
			continue
		}
		out[e.Name()] = RemoteEntry{Size: fi.Size(), ModTime: fi.ModTime(), IsDir: fi.IsDir()}
	}
	return out, true, nil
}

func (d DirRemote) Stat(p string) (RemoteEntry, error) {
	fi, err := os.Stat(d.abs(p))
	if err != nil {
		return RemoteEntry{}, err
	}
	return RemoteEntry{Size: fi.Size(), ModTime: fi.ModTime(), IsDir: fi.IsDir()}, nil
}

func (d DirRemote) MkdirAll(dir string) error { return os.MkdirAll(d.abs(dir), 0o755) }

func (d DirRemote) OpenWrite(p string, offset int64) (io.WriteCloser, error) {
	flag := os.O_WRONLY | os.O_CREATE
	if offset <= 0 {
		flag |= os.O_TRUNC
	}
	f, err := os.OpenFile(d.abs(p), flag, 0o644)
	if err != nil {
		return nil, err
	}
	if offset > 0 {
		if _, err := f.Seek(offset, io.SeekStart); err != nil {
			f.Close()
			return nil, err
		}
	}
	return f, nil
}

func (d DirRemote) Replace(from, to string) error { return os.Rename(d.abs(from), d.abs(to)) }
func (d DirRemote) Remove(p string) error         { return os.Remove(d.abs(p)) }
func (d DirRemote) Chtimes(p string, m time.Time) error {
	return os.Chtimes(d.abs(p), m, m)
}
func (d DirRemote) FreeBytes(string) int64 { return -1 }
func (d DirRemote) Close() error           { return nil }
