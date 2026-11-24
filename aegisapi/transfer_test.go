package aegisapi

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"aegisgui/aegistransfer"
)

func transferCall(t *testing.T, h http.Handler, method, url string, body any) map[string]any {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(method, url, &buf))
	var out map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("%s %s: %d %s", method, url, rec.Code, rec.Body.String())
	}
	return out
}

func TestTransferRoutes(t *testing.T) {
	data, device, build := t.TempDir(), t.TempDir(), t.TempDir()
	if err := os.MkdirAll(filepath.Join(device, "roms"), 0o755); err != nil {
		t.Fatal(err)
	}
	writeFile(t, filepath.Join(build, "nes", "a.nes"), 1000)
	writeFile(t, filepath.Join(build, "snes", "b.sfc"), 2000)

	const fp = "SHA256:testkey"
	dials := 0
	mux := http.NewServeMux()
	RegisterVFSRoutes(mux, data, nil, VFSOptions{PickFolder: func(string) (string, error) { return build, nil }})
	RegisterTransferRoutes(mux, data, nil, TransferOptions{
		Secrets: &aegistransfer.MemorySecrets{},
		Dial: func(ctx context.Context, p aegistransfer.Profile, pw, trust string) (aegistransfer.Remote, error) {
			dials++
			if pw != "s3cret" {
				return nil, &aegistransfer.CodedError{Code: aegistransfer.CodeAuth}
			}
			if p.HostKey != fp && trust != fp {
				return nil, &aegistransfer.HostKeyError{Fingerprint: fp}
			}
			return aegistransfer.DirRemote{Root: device}, nil
		},
	})

	if out := transferCall(t, mux, "GET", "/api/native/transfer/presets", nil); len(out["presets"].([]any)) == 0 {
		t.Fatal("no presets")
	}

	// Профиль без пароля / profile without password.
	out := transferCall(t, mux, "POST", "/api/native/transfer/profiles", map[string]any{
		"profile": map[string]any{"name": "R36S", "protocol": "sftp", "host": "192.168.1.50", "user": "ark", "auth": "password", "remoteDir": "/roms"},
	})
	prof := out["profile"].(map[string]any)
	id := prof["id"].(string)
	if prof["hasPassword"] != false {
		t.Fatalf("%v", out)
	}
	if out := transferCall(t, mux, "POST", "/api/native/transfer/test", map[string]any{"id": id}); out["code"] != aegistransfer.CodeNeedPassword {
		t.Fatalf("no password: %v", out)
	}
	// Пароль сохранён: ключ устройства неизвестен. / Password saved: unknown device key.
	transferCall(t, mux, "POST", "/api/native/transfer/profiles", map[string]any{"profile": prof, "password": "s3cret"})
	out = transferCall(t, mux, "POST", "/api/native/transfer/test", map[string]any{"id": id})
	if out["code"] != aegistransfer.CodeHostKeyUnknown || out["fingerprint"] != fp {
		t.Fatalf("unknown key: %v", out)
	}
	// Без подтверждения ключа заливка не начинается. / No upload before the key is confirmed.
	if out := transferCall(t, mux, "POST", "/api/native/transfer/start", map[string]any{"id": id, "localPath": build}); out["code"] != aegistransfer.CodeHostKeyUnknown {
		t.Fatalf("start before trust: %v", out)
	}
	out = transferCall(t, mux, "POST", "/api/native/transfer/test", map[string]any{"id": id, "trustHostKey": fp})
	if out["ok"] != true || out["writable"] != true {
		t.Fatalf("trusted: %v", out)
	}
	list := transferCall(t, mux, "GET", "/api/native/transfer/profiles", nil)["profiles"].([]any)
	if list[0].(map[string]any)["hostKey"] != fp || list[0].(map[string]any)["hasPassword"] != true {
		t.Fatalf("profile after trust: %v", list)
	}

	// Папка вне выбранных — отказ. / A folder outside the picked ones is refused.
	if out := transferCall(t, mux, "POST", "/api/native/transfer/start", map[string]any{"id": id, "localPath": build}); out["code"] != aegistransfer.CodeLocalMissing {
		t.Fatalf("unpicked folder: %v", out)
	}
	transferCall(t, mux, "POST", "/api/native/vfs/pick", map[string]any{})
	out = transferCall(t, mux, "POST", "/api/native/transfer/start", map[string]any{"id": id, "localPath": build})
	if out["ok"] != true {
		t.Fatalf("start: %v", out)
	}
	deadline := time.Now().Add(10 * time.Second)
	var job map[string]any
	for time.Now().Before(deadline) {
		job = transferCall(t, mux, "GET", "/api/native/transfer/status", nil)["job"].(map[string]any)
		if job["state"] == "done" || job["state"] == "failed" {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if job["state"] != "done" || job["uploaded"].(float64) != 2 {
		t.Fatalf("job: %v", job)
	}
	if st, err := os.Stat(filepath.Join(device, "roms", "snes", "b.sfc")); err != nil || st.Size() != 2000 {
		t.Fatalf("uploaded file: %v", err)
	}
	list = transferCall(t, mux, "GET", "/api/native/transfer/profiles", nil)["profiles"].([]any)
	if list[0].(map[string]any)["localDir"] != build {
		t.Fatalf("local dir not remembered: %v", list[0])
	}

	raw, _ := os.ReadFile(filepath.Join(data, "transfer-profiles.json"))
	if bytes.Contains(raw, []byte("s3cret")) {
		t.Fatalf("password in profile file: %s", raw)
	}

	transferCall(t, mux, "DELETE", "/api/native/transfer/profiles?id="+id, nil)
	if list := transferCall(t, mux, "GET", "/api/native/transfer/profiles", nil)["profiles"].([]any); len(list) != 0 {
		t.Fatalf("not deleted: %v", list)
	}
}
