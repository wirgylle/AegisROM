// Package aegistransfer заливает папку сборки на приставку по сети (SFTP, SMB, WebDAV).
//
// RU: Сборка сначала выгружается в обычную папку на диске (существующий механизм),
// затем эта папка зеркалится в папку ромов на устройстве. Заливаются только новые
// и изменённые файлы (по размеру и времени), оборванная заливка докачивается с места
// обрыва. Пароли лежат в хранилище ключей ОС, а не в профиле.
//
// EN: A build is first exported into a regular folder on disk (the existing
// mechanism), then that folder is mirrored into the ROM folder on the device.
// Only new and changed files are uploaded (by size and time), an interrupted
// upload resumes where it stopped. Passwords live in the OS keychain, not in the
// profile.
package aegistransfer

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path"
	"path/filepath"
	"strings"
	"sync"
)

// Protocol — способ подключения / connection protocol.
type Protocol string

const (
	ProtoSFTP Protocol = "sftp"
	ProtoSMB  Protocol = "smb"
	// ProtoWebDAV — HTTP(S) WebDAV: RemoteDir — путь в URL, Share не нужен.
	// ProtoWebDAV is HTTP(S) WebDAV: RemoteDir is the URL path, no Share.
	ProtoWebDAV Protocol = "webdav"
)

// Auth — способ входа / how to log in.
const (
	AuthPassword = "password"
	AuthKey      = "key"   // SSH-ключ / SSH key file (SFTP only)
	AuthGuest    = "guest" // гостевой вход / guest access (SMB, WebDAV)
)

// Profile — одно устройство / one device.
type Profile struct {
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	Preset   string   `json:"preset,omitempty"`
	Protocol Protocol `json:"protocol"`
	Host     string   `json:"host"`
	Port     int      `json:"port,omitempty"`
	User     string   `json:"user,omitempty"`
	Auth     string   `json:"auth"`
	// KeyPath — приватный SSH-ключ; пароль из хранилища тогда служит фразой ключа.
	// KeyPath is a private SSH key; the stored password is then its passphrase.
	KeyPath string `json:"keyPath,omitempty"`
	// Share — имя общей папки SMB / SMB share name.
	Share string `json:"share,omitempty"`
	// RemoteDir — папка ромов на устройстве (для SMB внутри общей папки).
	// RemoteDir is the ROM folder on the device (inside the share for SMB).
	RemoteDir string `json:"remoteDir"`
	// HostKey — отпечаток SSH-ключа устройства, подтверждённый пользователем.
	// HostKey is the device's SSH key fingerprint the user confirmed.
	HostKey string `json:"hostKey,omitempty"`
	// LocalDir — последняя папка сборки, которую заливали на это устройство.
	// LocalDir is the last build folder uploaded to this device.
	LocalDir string `json:"localDir,omitempty"`
	// TLS — WebDAV по https / WebDAV over https.
	TLS bool `json:"tls,omitempty"`

	HasPassword bool `json:"hasPassword"`
}

// DefaultPort — порт по умолчанию / default port.
func (p Profile) DefaultPort() int {
	switch p.Protocol {
	case ProtoSMB:
		return 445
	case ProtoWebDAV:
		if p.TLS {
			return 443
		}
		return 80
	}
	return 22
}

// EffectivePort — порт из профиля или по умолчанию / profile port or the default.
func (p Profile) EffectivePort() int {
	if p.Port > 0 && p.Port < 65536 {
		return p.Port
	}
	return p.DefaultPort()
}

// Validate проверяет поля / checks the fields.
func (p *Profile) Validate() error {
	p.Name = strings.TrimSpace(p.Name)
	p.Host = strings.TrimSpace(p.Host)
	p.User = strings.TrimSpace(p.User)
	p.Share = strings.Trim(strings.TrimSpace(p.Share), `/\`)
	p.RemoteDir = strings.TrimSpace(strings.ReplaceAll(p.RemoteDir, `\`, "/"))
	p.KeyPath = strings.TrimSpace(p.KeyPath)
	switch p.Protocol {
	case ProtoSFTP, ProtoSMB, ProtoWebDAV:
	default:
		return errors.New("protocol must be sftp, smb or webdav")
	}
	if p.Host == "" || strings.ContainsAny(p.Host, " /\\@") {
		return errors.New("host is empty or invalid")
	}
	if p.Port < 0 || p.Port > 65535 {
		return errors.New("port is out of range")
	}
	switch p.Auth {
	case AuthPassword:
	case AuthKey:
		if p.Protocol != ProtoSFTP || p.KeyPath == "" {
			return errors.New("an SSH key needs SFTP and a key file")
		}
	case AuthGuest:
		if p.Protocol == ProtoSFTP {
			return errors.New("guest access is for SMB and WebDAV only")
		}
	default:
		return errors.New("auth must be password, key or guest")
	}
	if p.Protocol != ProtoWebDAV {
		p.TLS = false
	}
	switch p.Protocol {
	case ProtoWebDAV:
		if p.Auth == AuthPassword && p.User == "" {
			return errors.New("WebDAV with a password needs a login")
		}
		if p.RemoteDir == "" {
			p.RemoteDir = "/"
		}
		if !strings.HasPrefix(p.RemoteDir, "/") {
			p.RemoteDir = "/" + p.RemoteDir
		}
		p.RemoteDir = path.Clean(p.RemoteDir)
		p.Share = ""
		p.KeyPath = ""
		p.HostKey = ""
	case ProtoSFTP:
		if p.User == "" {
			return errors.New("SFTP needs a login")
		}
		if p.RemoteDir == "" || !strings.HasPrefix(p.RemoteDir, "/") {
			return errors.New("the ROM folder on the device must start with /")
		}
		p.RemoteDir = path.Clean(p.RemoteDir)
		p.Share = ""
	default:
		if p.Share == "" {
			return errors.New("SMB needs a share name")
		}
		p.RemoteDir = strings.Trim(path.Clean("/"+p.RemoteDir), "/")
		p.KeyPath = ""
		p.HostKey = ""
	}
	if p.Name == "" {
		p.Name = p.Host
	}
	return nil
}

// sameEndpoint: тот же адрес и протокол (иначе отпечаток ключа сбрасывается).
// sameEndpoint: same address and protocol (otherwise the key fingerprint is reset).
func sameEndpoint(a, b Profile) bool {
	return a.Protocol == b.Protocol && strings.EqualFold(a.Host, b.Host) && a.EffectivePort() == b.EffectivePort() &&
		a.TLS == b.TLS
}

func newID() string {
	var b [8]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}

// Store хранит профили в JSON без паролей / keeps profiles in JSON without passwords.
type Store struct {
	mu      sync.Mutex
	file    string
	secrets Secrets
}

// NewStore — профили в dataDir/transfer-profiles.json.
func NewStore(dataDir string, secrets Secrets) *Store {
	return &Store{file: filepath.Join(dataDir, "transfer-profiles.json"), secrets: secrets}
}

func (s *Store) load() ([]Profile, error) {
	raw, err := os.ReadFile(s.file)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var list []Profile
	if err := json.Unmarshal(raw, &list); err != nil {
		return nil, err
	}
	return list, nil
}

func (s *Store) save(list []Profile) error {
	for i := range list {
		list[i].HasPassword = false
	}
	raw, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(s.file), 0o755); err != nil {
		return err
	}
	tmp := s.file + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.file)
}

func (s *Store) withPasswordFlag(p Profile) Profile {
	p.HasPassword = false
	if s.secrets != nil {
		if pw, err := s.secrets.Get(p.ID); err == nil && pw != "" {
			p.HasPassword = true
		}
	}
	return p
}

// List — все профили / all profiles.
func (s *Store) List() ([]Profile, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	list, err := s.load()
	if err != nil {
		return nil, err
	}
	out := make([]Profile, 0, len(list))
	for _, p := range list {
		out = append(out, s.withPasswordFlag(p))
	}
	return out, nil
}

// Get — профиль по id / profile by id.
func (s *Store) Get(id string) (Profile, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	list, _ := s.load()
	for _, p := range list {
		if p.ID == id {
			return s.withPasswordFlag(p), true
		}
	}
	return Profile{}, false
}

// Password — пароль профиля из хранилища ОС ("" если нет).
// Password returns the profile's password from the OS store ("" if none).
func (s *Store) Password(id string) (string, error) {
	if s.secrets == nil {
		return "", ErrNoKeyring
	}
	pw, err := s.secrets.Get(id)
	if errors.Is(err, ErrSecretNotFound) {
		return "", nil
	}
	return pw, err
}

// SaveInput — что приходит из окна профиля / what the profile form sends.
type SaveInput struct {
	Profile Profile `json:"profile"`
	// Password: nil — не менять; "" вместе с ClearPassword — удалить.
	// Password: nil keeps the stored one; ClearPassword removes it.
	Password      *string `json:"password,omitempty"`
	ClearPassword bool    `json:"clearPassword,omitempty"`
}

// Save создаёт или обновляет профиль / creates or updates a profile.
func (s *Store) Save(in SaveInput) (Profile, error) {
	p := in.Profile
	if err := p.Validate(); err != nil {
		return Profile{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	list, err := s.load()
	if err != nil {
		return Profile{}, err
	}
	idx := -1
	if p.ID != "" {
		for i := range list {
			if list[i].ID == p.ID {
				idx = i
				break
			}
		}
	}
	if idx < 0 {
		p.ID = newID()
		p.HostKey = ""
	} else {
		prev := list[idx]
		// Отпечаток меняет только проверка соединения. / Only a connection test changes the fingerprint.
		p.HostKey = prev.HostKey
		if !sameEndpoint(prev, p) || p.Protocol != ProtoSFTP {
			p.HostKey = ""
		}
		if p.LocalDir == "" {
			p.LocalDir = prev.LocalDir
		}
	}
	if in.Password != nil && *in.Password != "" {
		if s.secrets == nil {
			return Profile{}, ErrNoKeyring
		}
		if err := s.secrets.Set(p.ID, *in.Password); err != nil {
			return Profile{}, err
		}
	} else if in.ClearPassword && s.secrets != nil {
		_ = s.secrets.Delete(p.ID)
	}
	if idx < 0 {
		list = append(list, p)
	} else {
		list[idx] = p
	}
	if err := s.save(list); err != nil {
		return Profile{}, err
	}
	return s.withPasswordFlag(p), nil
}

// update меняет сохранённый профиль под замком / changes a stored profile under the lock.
func (s *Store) update(id string, fn func(p *Profile)) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	list, err := s.load()
	if err != nil {
		return err
	}
	for i := range list {
		if list[i].ID == id {
			fn(&list[i])
			return s.save(list)
		}
	}
	return os.ErrNotExist
}

// SetHostKey запоминает подтверждённый отпечаток / stores the confirmed fingerprint.
func (s *Store) SetHostKey(id, fp string) error {
	return s.update(id, func(p *Profile) { p.HostKey = fp })
}

// SetLocalDir запоминает папку сборки / remembers the build folder.
func (s *Store) SetLocalDir(id, dir string) error {
	return s.update(id, func(p *Profile) { p.LocalDir = dir })
}

// Delete удаляет профиль и его пароль / removes a profile and its password.
func (s *Store) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	list, err := s.load()
	if err != nil {
		return err
	}
	out := list[:0]
	for _, p := range list {
		if p.ID != id {
			out = append(out, p)
		}
	}
	if s.secrets != nil {
		_ = s.secrets.Delete(id)
	}
	return s.save(out)
}
