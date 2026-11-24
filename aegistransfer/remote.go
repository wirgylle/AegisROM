package aegistransfer

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"path"
	"strconv"
	"time"

	"github.com/hirochachacha/go-smb2"
	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
)

// RemoteEntry — файл на устройстве / a file on the device.
type RemoteEntry struct {
	Size    int64
	ModTime time.Time
	IsDir   bool
}

// Remote — файловая система устройства. Пути через "/", от корня SFTP или от общей папки SMB.
// Remote is the device file system. Paths use "/", from the SFTP root or the SMB share.
type Remote interface {
	// ReadDir: содержимое папки; exists=false, если папки нет.
	// ReadDir lists a folder; exists=false when there is no such folder.
	ReadDir(dir string) (entries map[string]RemoteEntry, exists bool, err error)
	Stat(p string) (RemoteEntry, error)
	MkdirAll(dir string) error
	// OpenWrite открывает файл для записи с offset (0 — с нуля, файл обрезается).
	// OpenWrite opens a file for writing at offset (0 truncates).
	OpenWrite(p string, offset int64) (io.WriteCloser, error)
	// Replace переименовывает from в to, заменяя to / renames from to to, replacing to.
	Replace(from, to string) error
	Remove(p string) error
	Chtimes(p string, mtime time.Time) error
	// FreeBytes: свободное место; -1, если узнать нельзя / free space; -1 if unknown.
	FreeBytes(dir string) int64
	Close() error
}

// DialTimeout — сколько ждать ответа устройства / how long to wait for the device.
const DialTimeout = 8 * time.Second

// HostKeyError — ключ устройства неизвестен или изменился.
// HostKeyError: the device key is unknown or changed.
type HostKeyError struct {
	Fingerprint string
	Changed     bool
}

func (e *HostKeyError) Error() string {
	if e.Changed {
		return "device SSH key changed: " + e.Fingerprint
	}
	return "unknown device SSH key: " + e.Fingerprint
}

// Fingerprint — SHA256-отпечаток ключа как у ssh-keygen -l / SHA256 key fingerprint like ssh-keygen -l.
func Fingerprint(k ssh.PublicKey) string {
	sum := sha256.Sum256(k.Marshal())
	return "SHA256:" + base64.RawStdEncoding.EncodeToString(sum[:])
}

// Dial подключается к устройству. trustKey — отпечаток, который пользователь только что подтвердил.
// Dial connects to the device. trustKey is a fingerprint the user has just confirmed.
func Dial(ctx context.Context, p Profile, password, trustKey string) (Remote, error) {
	addr := net.JoinHostPort(p.Host, strconv.Itoa(p.EffectivePort()))
	d := net.Dialer{Timeout: DialTimeout}
	conn, err := d.DialContext(ctx, "tcp", addr)
	if err != nil {
		return nil, err
	}
	// Рукопожатие и вход тоже ограничены по времени. / Handshake and login are time-limited too.
	_ = conn.SetDeadline(time.Now().Add(2 * DialTimeout))
	var r Remote
	switch p.Protocol {
	case ProtoSFTP:
		r, err = dialSFTP(conn, addr, p, password, trustKey)
	case ProtoSMB:
		r, err = dialSMB(ctx, conn, p, password)
	default:
		err = fmt.Errorf("unknown protocol %q", p.Protocol)
	}
	if err != nil {
		conn.Close()
		return nil, err
	}
	_ = conn.SetDeadline(time.Time{})
	return r, nil
}

// ---------- SFTP ----------

type sftpRemote struct {
	ssh *ssh.Client
	c   *sftp.Client
}

func sshAuth(p Profile, password string) ([]ssh.AuthMethod, error) {
	if p.Auth == AuthKey {
		pem, err := os.ReadFile(p.KeyPath)
		if err != nil {
			return nil, fmt.Errorf("ssh key: %w", err)
		}
		signer, err := ssh.ParsePrivateKey(pem)
		var missing *ssh.PassphraseMissingError
		if errors.As(err, &missing) {
			if password == "" {
				return nil, errors.New("ssh key: the key needs a passphrase (save it as the password)")
			}
			signer, err = ssh.ParsePrivateKeyWithPassphrase(pem, []byte(password))
		}
		if err != nil {
			return nil, fmt.Errorf("ssh key: %w", err)
		}
		return []ssh.AuthMethod{ssh.PublicKeys(signer)}, nil
	}
	// Некоторые прошивки принимают пароль только через keyboard-interactive.
	// Some firmwares accept the password only via keyboard-interactive.
	kbd := ssh.KeyboardInteractive(func(_, _ string, questions []string, _ []bool) ([]string, error) {
		answers := make([]string, len(questions))
		for i := range answers {
			answers[i] = password
		}
		return answers, nil
	})
	return []ssh.AuthMethod{ssh.Password(password), kbd}, nil
}

func dialSFTP(conn net.Conn, addr string, p Profile, password, trustKey string) (Remote, error) {
	auth, err := sshAuth(p, password)
	if err != nil {
		return nil, err
	}
	cfg := &ssh.ClientConfig{
		User:    p.User,
		Auth:    auth,
		Timeout: DialTimeout,
		HostKeyCallback: func(_ string, _ net.Addr, key ssh.PublicKey) error {
			fp := Fingerprint(key)
			switch {
			case p.HostKey != "" && fp == p.HostKey:
				return nil
			case trustKey != "" && fp == trustKey:
				return nil
			case p.HostKey != "":
				return &HostKeyError{Fingerprint: fp, Changed: true}
			default:
				return &HostKeyError{Fingerprint: fp}
			}
		},
	}
	c, chans, reqs, err := ssh.NewClientConn(conn, addr, cfg)
	if err != nil {
		return nil, err
	}
	client := ssh.NewClient(c, chans, reqs)
	sc, err := sftp.NewClient(client, sftp.UseConcurrentWrites(true), sftp.MaxConcurrentRequestsPerFile(32))
	if err != nil {
		client.Close()
		return nil, fmt.Errorf("sftp subsystem: %w", err)
	}
	return &sftpRemote{ssh: client, c: sc}, nil
}

func (r *sftpRemote) ReadDir(dir string) (map[string]RemoteEntry, bool, error) {
	list, err := r.c.ReadDir(dir)
	if err != nil {
		if isNotExist(err) {
			return map[string]RemoteEntry{}, false, nil
		}
		return nil, false, err
	}
	out := make(map[string]RemoteEntry, len(list))
	for _, fi := range list {
		out[fi.Name()] = RemoteEntry{Size: fi.Size(), ModTime: fi.ModTime(), IsDir: fi.IsDir()}
	}
	return out, true, nil
}

func (r *sftpRemote) Stat(p string) (RemoteEntry, error) {
	fi, err := r.c.Stat(p)
	if err != nil {
		return RemoteEntry{}, err
	}
	return RemoteEntry{Size: fi.Size(), ModTime: fi.ModTime(), IsDir: fi.IsDir()}, nil
}

func (r *sftpRemote) MkdirAll(dir string) error { return r.c.MkdirAll(dir) }

func (r *sftpRemote) OpenWrite(p string, offset int64) (io.WriteCloser, error) {
	if offset <= 0 {
		return r.c.OpenFile(p, os.O_WRONLY|os.O_CREATE|os.O_TRUNC)
	}
	f, err := r.c.OpenFile(p, os.O_WRONLY)
	if err != nil {
		return nil, err
	}
	if _, err := f.Seek(offset, io.SeekStart); err != nil {
		f.Close()
		return nil, err
	}
	return f, nil
}

func (r *sftpRemote) Replace(from, to string) error {
	if err := r.c.PosixRename(from, to); err == nil {
		return nil
	}
	// Сервер без posix-rename: удалить старый файл и переименовать.
	// Server without posix-rename: remove the old file and rename.
	if err := r.c.Remove(to); err != nil && !isNotExist(err) {
		return err
	}
	return r.c.Rename(from, to)
}

func (r *sftpRemote) Remove(p string) error { return r.c.Remove(p) }

func (r *sftpRemote) Chtimes(p string, mtime time.Time) error { return r.c.Chtimes(p, mtime, mtime) }

func (r *sftpRemote) FreeBytes(dir string) int64 {
	st, err := r.c.StatVFS(dir)
	if err != nil || st == nil {
		return -1
	}
	return int64(st.FreeSpace())
}

func (r *sftpRemote) Close() error {
	r.c.Close()
	return r.ssh.Close()
}

// ---------- SMB ----------

type smbRemote struct {
	conn    net.Conn
	session *smb2.Session
	share   *smb2.Share
}

func dialSMB(ctx context.Context, conn net.Conn, p Profile, password string) (Remote, error) {
	user := p.User
	if p.Auth == AuthGuest {
		// Samba с "map to guest = bad user" пускает любого незнакомого как гостя.
		// Samba with "map to guest = bad user" lets any unknown user in as a guest.
		if user == "" {
			user = "guest"
		}
		password = ""
	}
	d := &smb2.Dialer{Initiator: &smb2.NTLMInitiator{User: user, Password: password}}
	s, err := d.DialContext(ctx, conn)
	if err != nil {
		return nil, err
	}
	sh, err := s.Mount(p.Share)
	if err != nil {
		_ = s.Logoff()
		return nil, err
	}
	return &smbRemote{conn: conn, session: s, share: sh}, nil
}

func smbPath(p string) string {
	p = path.Clean("/" + p)
	if p == "/" {
		return ""
	}
	return p[1:]
}

func (r *smbRemote) ReadDir(dir string) (map[string]RemoteEntry, bool, error) {
	list, err := r.share.ReadDir(smbPath(dir))
	if err != nil {
		if isNotExist(err) {
			return map[string]RemoteEntry{}, false, nil
		}
		return nil, false, err
	}
	out := make(map[string]RemoteEntry, len(list))
	for _, fi := range list {
		out[fi.Name()] = RemoteEntry{Size: fi.Size(), ModTime: fi.ModTime(), IsDir: fi.IsDir()}
	}
	return out, true, nil
}

func (r *smbRemote) Stat(p string) (RemoteEntry, error) {
	fi, err := r.share.Stat(smbPath(p))
	if err != nil {
		return RemoteEntry{}, err
	}
	return RemoteEntry{Size: fi.Size(), ModTime: fi.ModTime(), IsDir: fi.IsDir()}, nil
}

func (r *smbRemote) MkdirAll(dir string) error {
	p := smbPath(dir)
	if p == "" {
		return nil
	}
	return r.share.MkdirAll(p, 0o755)
}

func (r *smbRemote) OpenWrite(p string, offset int64) (io.WriteCloser, error) {
	if offset <= 0 {
		return r.share.OpenFile(smbPath(p), os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o644)
	}
	f, err := r.share.OpenFile(smbPath(p), os.O_WRONLY, 0o644)
	if err != nil {
		return nil, err
	}
	if _, err := f.Seek(offset, io.SeekStart); err != nil {
		f.Close()
		return nil, err
	}
	return f, nil
}

func (r *smbRemote) Replace(from, to string) error {
	// SMB не заменяет существующий файл при переименовании. / SMB rename does not replace.
	if err := r.share.Remove(smbPath(to)); err != nil && !isNotExist(err) {
		return err
	}
	return r.share.Rename(smbPath(from), smbPath(to))
}

func (r *smbRemote) Remove(p string) error { return r.share.Remove(smbPath(p)) }

func (r *smbRemote) Chtimes(p string, mtime time.Time) error {
	return r.share.Chtimes(smbPath(p), mtime, mtime)
}

func (r *smbRemote) FreeBytes(dir string) int64 {
	fi, err := r.share.Statfs(smbPath(dir))
	if err != nil || fi == nil {
		return -1
	}
	// Счёт в единицах размещения: байт в секторе × секторов в единице.
	// Counted in allocation units: bytes per sector × sectors per unit.
	return int64(fi.AvailableBlockCount() * fi.BlockSize() * fi.FragmentSize())
}

func (r *smbRemote) Close() error {
	_ = r.share.Umount()
	_ = r.session.Logoff()
	return r.conn.Close()
}
