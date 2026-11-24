package aegistransfer

import (
	"context"
	"errors"
	"io"
	"io/fs"
	"net"
	"strings"
	"syscall"

	"github.com/hirochachacha/go-smb2"
	"github.com/pkg/sftp"
)

// Коды ошибок для окна (тексты в src/i18n/wifiStrings.ts).
// Error codes for the UI (texts in src/i18n/wifiStrings.ts).
const (
	CodeUnreachable    = "unreachable"   // устройство не отвечает / device does not answer
	CodeRefused        = "refused"       // порт закрыт / port closed
	CodeBadHost        = "bad_host"      // имя не найдено / name not resolved
	CodeAuth           = "auth_failed"   // логин или пароль / login or password
	CodeNeedPassword   = "need_password" // пароль не сохранён / no stored password
	CodeHostKeyUnknown = "host_key_unknown"
	CodeHostKeyChanged = "host_key_changed"
	CodeShareMissing   = "share_missing"   // нет общей папки SMB / no such SMB share
	CodeRemoteMissing  = "remote_missing"  // нет папки ромов / no ROM folder
	CodeNotFound       = "not_found"       // нет файла или папки / no such file or folder
	CodePermission     = "permission"      // нет прав / no permission
	CodeNoSpace        = "no_space"        // нет места / out of space
	CodeConnLost       = "connection_lost" // связь оборвалась / connection dropped
	CodeKeyring        = "keyring"         // нет хранилища паролей ОС / no OS password store
	CodeKeyFile        = "key_file"        // проблема с SSH-ключом / SSH key problem
	CodeLocalMissing   = "local_missing"   // нет папки сборки / no build folder
	CodeCancelled      = "cancelled"
	CodeBusy           = "busy" // уже идёт заливка / an upload is already running
	CodeOther          = "error"
)

// CodedError — ошибка с кодом для окна / an error with a UI code.
type CodedError struct {
	Code string
	Err  error
}

func (e *CodedError) Error() string {
	if e.Err == nil {
		return e.Code
	}
	return e.Err.Error()
}

func (e *CodedError) Unwrap() error { return e.Err }

func coded(code string, err error) error { return &CodedError{Code: code, Err: err} }

// NTSTATUS коды SMB / SMB NTSTATUS codes.
const (
	ntAccessDenied     = 0xC0000022
	ntLogonFailure     = 0xC000006D
	ntAccountRestrict  = 0xC000006E
	ntWrongPassword    = 0xC000006A
	ntNoSuchUser       = 0xC0000064
	ntBadNetworkName   = 0xC00000CC
	ntDiskFull         = 0xC000007F
	ntNameNotFound     = 0xC0000034
	ntPathNotFound     = 0xC000003A
	ntNetworkNameGone  = 0xC00000C9
	ntConnectionReset  = 0xC000020D
	ntConnectionAborts = 0xC0000241
)

// Classify возвращает код ошибки для окна / returns the UI code of an error.
func Classify(err error) string {
	if err == nil {
		return ""
	}
	var ce *CodedError
	if errors.As(err, &ce) {
		return ce.Code
	}
	if errors.Is(err, context.Canceled) {
		return CodeCancelled
	}
	if errors.Is(err, ErrNoKeyring) {
		return CodeKeyring
	}
	var hk *HostKeyError
	if errors.As(err, &hk) {
		if hk.Changed {
			return CodeHostKeyChanged
		}
		return CodeHostKeyUnknown
	}
	var re *smb2.ResponseError
	if errors.As(err, &re) {
		switch re.Code {
		case ntLogonFailure, ntWrongPassword, ntNoSuchUser, ntAccountRestrict:
			return CodeAuth
		case ntBadNetworkName:
			return CodeShareMissing
		case ntAccessDenied:
			return CodePermission
		case ntDiskFull:
			return CodeNoSpace
		case ntNameNotFound, ntPathNotFound:
			return CodeNotFound
		case ntNetworkNameGone, ntConnectionReset, ntConnectionAborts:
			return CodeConnLost
		}
	}
	var dnsErr *net.DNSError
	if errors.As(err, &dnsErr) {
		return CodeBadHost
	}
	if errors.Is(err, syscall.ECONNREFUSED) {
		return CodeRefused
	}
	if errors.Is(err, syscall.ENOSPC) {
		return CodeNoSpace
	}
	if errors.Is(err, fs.ErrPermission) {
		return CodePermission
	}
	if isNotExist(err) {
		return CodeNotFound
	}
	msg := strings.ToLower(err.Error())
	switch {
	case strings.Contains(msg, "unable to authenticate"), strings.Contains(msg, "no supported methods remain"):
		return CodeAuth
	case strings.HasPrefix(msg, "ssh key:"):
		return CodeKeyFile
	case strings.Contains(msg, "connection refused"):
		return CodeRefused
	case strings.Contains(msg, "no space left"), strings.Contains(msg, "disk full"), strings.Contains(msg, "quota"):
		return CodeNoSpace
	case strings.Contains(msg, "permission denied"), strings.Contains(msg, "access denied"):
		return CodePermission
	}
	if isNetworkErr(err) {
		var op *net.OpError
		if errors.As(err, &op) && op.Op == "dial" {
			return CodeUnreachable
		}
		return CodeConnLost
	}
	return CodeOther
}

func isNotExist(err error) bool {
	if errors.Is(err, fs.ErrNotExist) {
		return true
	}
	var se *sftp.StatusError
	if errors.As(err, &se) && se.FxCode() == sftp.ErrSSHFxNoSuchFile {
		return true
	}
	var re *smb2.ResponseError
	if errors.As(err, &re) && (re.Code == ntNameNotFound || re.Code == ntPathNotFound) {
		return true
	}
	return false
}

// isNetworkErr — обрыв связи, после которого стоит переподключиться.
// isNetworkErr: a dropped connection worth reconnecting after.
func isNetworkErr(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) || errors.Is(err, net.ErrClosed) ||
		errors.Is(err, sftp.ErrSSHFxConnectionLost) || errors.Is(err, syscall.ECONNRESET) ||
		errors.Is(err, syscall.EPIPE) || errors.Is(err, syscall.ETIMEDOUT) || errors.Is(err, syscall.EHOSTUNREACH) ||
		errors.Is(err, syscall.ENETUNREACH) {
		return true
	}
	var ne net.Error
	if errors.As(err, &ne) {
		return true
	}
	var re *smb2.ResponseError
	if errors.As(err, &re) {
		return re.Code == ntNetworkNameGone || re.Code == ntConnectionReset || re.Code == ntConnectionAborts
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "connection reset") || strings.Contains(msg, "broken pipe") ||
		strings.Contains(msg, "connection lost") || strings.Contains(msg, "use of closed network connection")
}
