package aegisapi

// Заливка сборки на приставку по Wi-Fi (SFTP, SMB, WebDAV) / Uploading a build to a handheld over Wi-Fi.
//
// RU: Профили устройств лежат в dataDir/transfer-profiles.json, пароли — в хранилище ключей
// ОС. Папка сборки должна быть внутри папок, выбранных пользователем (/api/native/vfs/pick).
// Одновременно идёт одна заливка; окно спрашивает её состояние раз в полсекунды.
//
// EN: Device profiles live in dataDir/transfer-profiles.json, passwords in the OS keychain.
// The build folder must be inside folders the user picked (/api/native/vfs/pick). One upload
// runs at a time; the window polls its state twice a second.

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"sync"
	"time"

	"aegisgui/aegistransfer"
)

// TransferOptions настраивает RegisterTransferRoutes.
type TransferOptions struct {
	// Secrets — хранилище паролей; nil — хранилище ключей ОС.
	// Secrets is the password store; nil means the OS keychain.
	Secrets aegistransfer.Secrets
	// Dial — подключение (в тестах подменяется); nil — aegistransfer.Dial.
	// Dial connects (replaced in tests); nil means aegistransfer.Dial.
	Dial func(ctx context.Context, p aegistransfer.Profile, password, trustKey string) (aegistransfer.Remote, error)
}

type transferAPI struct {
	store *aegistransfer.Store
	dial  func(ctx context.Context, p aegistransfer.Profile, password, trustKey string) (aegistransfer.Remote, error)

	mu    sync.Mutex
	job   *aegistransfer.Job
	jobNo int
}

func transferFail(w http.ResponseWriter, status int, code string, err error) {
	msg := code
	if err != nil {
		msg = err.Error()
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": false, "code": code, "message": msg})
}

func transferErr(w http.ResponseWriter, err error) {
	transferFail(w, http.StatusOK, aegistransfer.Classify(err), err)
}

// RegisterTransferRoutes добавляет /api/native/transfer/*.
func RegisterTransferRoutes(mux *http.ServeMux, dataDir string, touch func(), opts TransferOptions) {
	if touch == nil {
		touch = func() {}
	}
	secrets := opts.Secrets
	if secrets == nil {
		secrets = aegistransfer.OSKeyring{}
	}
	api := &transferAPI{store: aegistransfer.NewStore(dataDir, secrets), dial: opts.Dial}
	if api.dial == nil {
		api.dial = aegistransfer.Dial
	}
	post := func(w http.ResponseWriter, r *http.Request) bool {
		touch()
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return false
		}
		return true
	}

	mux.HandleFunc("/api/native/transfer/presets", func(w http.ResponseWriter, r *http.Request) {
		touch()
		writeJSONOK(w, map[string]any{"presets": aegistransfer.Presets()})
	})

	mux.HandleFunc("/api/native/transfer/profiles", func(w http.ResponseWriter, r *http.Request) {
		touch()
		switch r.Method {
		case http.MethodGet:
			list, err := api.store.List()
			if err != nil {
				transferErr(w, err)
				return
			}
			writeJSONOK(w, map[string]any{"profiles": list})
		case http.MethodPost:
			var in aegistransfer.SaveInput
			if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&in); err != nil {
				transferFail(w, http.StatusBadRequest, "invalid", err)
				return
			}
			p, err := api.store.Save(in)
			if err != nil {
				code := aegistransfer.Classify(err)
				if code == aegistransfer.CodeOther {
					code = "invalid"
				}
				transferFail(w, http.StatusOK, code, err)
				return
			}
			writeJSONOK(w, map[string]any{"profile": p})
		case http.MethodDelete:
			if err := api.store.Delete(r.URL.Query().Get("id")); err != nil {
				transferErr(w, err)
				return
			}
			writeJSONOK(w, map[string]any{})
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Проверка соединения: вход, папка ромов, запись. trustHostKey — подтверждённый отпечаток.
	// Connection test: login, ROM folder, write. trustHostKey is a confirmed fingerprint.
	mux.HandleFunc("/api/native/transfer/test", func(w http.ResponseWriter, r *http.Request) {
		if !post(w, r) {
			return
		}
		var body struct {
			ID           string `json:"id"`
			TrustHostKey string `json:"trustHostKey"`
		}
		_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&body)
		p, ok := api.store.Get(body.ID)
		if !ok {
			transferFail(w, http.StatusNotFound, "no_profile", nil)
			return
		}
		pw, err := api.password(p)
		if err != nil {
			transferErr(w, err)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
		defer cancel()
		started := time.Now()
		rem, err := api.dial(ctx, p, pw, body.TrustHostKey)
		if err != nil {
			var hk *aegistransfer.HostKeyError
			if errors.As(err, &hk) {
				w.Header().Set("Content-Type", "application/json; charset=utf-8")
				_ = json.NewEncoder(w).Encode(map[string]any{
					"ok": false, "code": aegistransfer.Classify(err), "message": err.Error(),
					"fingerprint": hk.Fingerprint, "previous": p.HostKey,
				})
				return
			}
			transferErr(w, err)
			return
		}
		defer rem.Close()
		if body.TrustHostKey != "" && body.TrustHostKey != p.HostKey {
			if err := api.store.SetHostKey(p.ID, body.TrustHostKey); err != nil {
				transferErr(w, err)
				return
			}
		}
		res, err := aegistransfer.Probe(rem, p.RemoteDir)
		if err != nil {
			transferErr(w, err)
			return
		}
		writeJSONOK(w, map[string]any{"freeBytes": res.FreeBytes, "writable": res.Writable,
			"ms": time.Since(started).Milliseconds()})
	})

	mux.HandleFunc("/api/native/transfer/start", func(w http.ResponseWriter, r *http.Request) {
		if !post(w, r) {
			return
		}
		var body struct {
			ID        string `json:"id"`
			LocalPath string `json:"localPath"`
			// SyncSaves: сверить сохранения по .aegis-saves-map.json сборки.
			// SyncSaves: reconcile saves using the build's .aegis-saves-map.json.
			SyncSaves bool `json:"syncSaves"`
		}
		_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 8192)).Decode(&body)
		p, ok := api.store.Get(body.ID)
		if !ok {
			transferFail(w, http.StatusNotFound, "no_profile", nil)
			return
		}
		if p.Protocol == aegistransfer.ProtoSFTP && p.HostKey == "" {
			transferFail(w, http.StatusOK, aegistransfer.CodeHostKeyUnknown, errors.New("test the connection first"))
			return
		}
		local, err := ResolveVFSPath(body.LocalPath)
		if err != nil {
			transferFail(w, http.StatusOK, aegistransfer.CodeLocalMissing, err)
			return
		}
		pw, err := api.password(p)
		if err != nil {
			transferErr(w, err)
			return
		}
		api.mu.Lock()
		defer api.mu.Unlock()
		if api.job != nil && api.job.Running() {
			transferFail(w, http.StatusOK, aegistransfer.CodeBusy, nil)
			return
		}
		var links []aegistransfer.SaveLink
		if body.SyncSaves {
			// Папки библиотеки — только из выбранных пользователем. / Library folders: user-picked only.
			entries, _ := aegistransfer.FindSaveMap(local)
			links = aegistransfer.LinksForUpload(local, entries, ResolveVFSPath)
		}
		_ = api.store.SetLocalDir(p.ID, local)
		api.jobNo++
		dial := func(ctx context.Context) (aegistransfer.Remote, error) { return api.dial(ctx, p, pw, "") }
		api.job = aegistransfer.Start(context.Background(), strconv.Itoa(api.jobNo), p, local, dial, links...)
		writeJSONOK(w, map[string]any{"job": api.job.Snapshot(), "saveLinks": len(links)})
	})

	mux.HandleFunc("/api/native/transfer/status", func(w http.ResponseWriter, r *http.Request) {
		touch()
		api.mu.Lock()
		job := api.job
		api.mu.Unlock()
		if job == nil {
			writeJSONOK(w, map[string]any{"job": nil})
			return
		}
		writeJSONOK(w, map[string]any{"job": job.Snapshot()})
	})

	mux.HandleFunc("/api/native/transfer/cancel", func(w http.ResponseWriter, r *http.Request) {
		if !post(w, r) {
			return
		}
		api.mu.Lock()
		job := api.job
		api.mu.Unlock()
		if job != nil {
			job.Cancel()
		}
		writeJSONOK(w, map[string]any{})
	})
}

// password — пароль профиля, если он нужен для входа / the profile password when login needs it.
func (a *transferAPI) password(p aegistransfer.Profile) (string, error) {
	if p.Auth == aegistransfer.AuthGuest {
		return "", nil
	}
	pw, err := a.store.Password(p.ID)
	if err != nil {
		return "", err
	}
	if pw == "" && p.Auth == aegistransfer.AuthPassword {
		return "", &aegistransfer.CodedError{Code: aegistransfer.CodeNeedPassword, Err: errors.New("no saved password")}
	}
	return pw, nil
}
