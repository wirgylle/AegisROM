package aegistransfer

import (
	"errors"
	"sync"

	"github.com/zalando/go-keyring"
)

// Пароли устройств живут в хранилище ключей ОС: Windows Credential Manager,
// macOS Keychain, Secret Service (GNOME Keyring, KWallet) в Linux.
// Device passwords live in the OS keychain: Windows Credential Manager, macOS
// Keychain, Secret Service (GNOME Keyring, KWallet) on Linux.

// KeyringService — имя записей в хранилище ОС / entry name in the OS store.
const KeyringService = "AegisROM device"

var (
	// ErrNoKeyring — хранилища паролей ОС нет (например, Linux без Secret Service).
	// ErrNoKeyring: no OS password store (e.g. Linux without Secret Service).
	ErrNoKeyring = errors.New("OS password store is not available")
	// ErrSecretNotFound — пароль не сохранён / no stored password.
	ErrSecretNotFound = errors.New("password not stored")
)

// Secrets — хранилище паролей профилей / profile password store.
type Secrets interface {
	Get(id string) (string, error)
	Set(id, password string) error
	Delete(id string) error
}

// OSKeyring — хранилище ключей ОС / the OS keychain.
type OSKeyring struct{}

func keyringErr(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, keyring.ErrNotFound) {
		return ErrSecretNotFound
	}
	return errors.Join(ErrNoKeyring, err)
}

func account(id string) string { return "transfer:" + id }

func (OSKeyring) Get(id string) (string, error) {
	pw, err := keyring.Get(KeyringService, account(id))
	return pw, keyringErr(err)
}

func (OSKeyring) Set(id, password string) error {
	return keyringErr(keyring.Set(KeyringService, account(id), password))
}

func (OSKeyring) Delete(id string) error {
	err := keyringErr(keyring.Delete(KeyringService, account(id)))
	if errors.Is(err, ErrSecretNotFound) {
		return nil
	}
	return err
}

// MemorySecrets — пароли в памяти, только для тестов / in-memory passwords, tests only.
type MemorySecrets struct {
	mu sync.Mutex
	m  map[string]string
}

func (m *MemorySecrets) Get(id string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if pw, ok := m.m[id]; ok {
		return pw, nil
	}
	return "", ErrSecretNotFound
}

func (m *MemorySecrets) Set(id, password string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.m == nil {
		m.m = map[string]string{}
	}
	m.m[id] = password
	return nil
}

func (m *MemorySecrets) Delete(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.m, id)
	return nil
}
