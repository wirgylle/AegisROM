package aegistransfer

import (
	"bytes"
	"context"
	"crypto/md5"
	"encoding/hex"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"golang.org/x/net/webdav"
)

// ---------- тестовый WebDAV-сервер / test WebDAV server ----------

type davServer struct {
	root   string
	prof   Profile
	puts   atomic.Int64
	chunks atomic.Int64 // PUT без длины / PUTs without a length
}

func md5s(s string) string {
	sum := md5.Sum([]byte(s))
	return hex.EncodeToString(sum[:])
}

// digestParams разбирает Authorization: Digest (независимо от клиента).
// digestParams parses Authorization: Digest (independently of the client code).
func digestParams(h string) map[string]string {
	out := map[string]string{}
	for _, part := range strings.Split(strings.TrimPrefix(h, "Digest "), ", ") {
		k, v, ok := strings.Cut(part, "=")
		if ok {
			out[k] = strings.Trim(v, `"`)
		}
	}
	return out
}

// startDAV: auth "" — без входа, "basic" или "digest". prefix — путь, под которым висит сервер.
// startDAV: auth "" means no login, "basic" or "digest". prefix is the path the server sits under.
func startDAV(t *testing.T, auth, user, pass, prefix string) *davServer {
	t.Helper()
	ds := &davServer{root: t.TempDir()}
	h := &webdav.Handler{Prefix: prefix, FileSystem: webdav.Dir(ds.root), LockSystem: webdav.NewMemLS()}
	const realm, nonce = "aegis", "abc123"
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch auth {
		case "basic":
			u, p, ok := r.BasicAuth()
			if !ok || u != user || p != pass {
				w.Header().Set("WWW-Authenticate", `Basic realm="aegis"`)
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
		case "digest":
			d := digestParams(r.Header.Get("Authorization"))
			ha1 := md5s(user + ":" + realm + ":" + pass)
			ha2 := md5s(r.Method + ":" + d["uri"])
			want := md5s(ha1 + ":" + nonce + ":" + d["nc"] + ":" + d["cnonce"] + ":auth:" + ha2)
			if d["username"] != user || d["uri"] != r.URL.RequestURI() || d["response"] != want {
				w.Header().Set("WWW-Authenticate", fmt.Sprintf(`Digest realm="%s", nonce="%s", qop="auth", algorithm=MD5`, realm, nonce))
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
		}
		if r.Method == http.MethodPut {
			ds.puts.Add(1)
			if r.ContentLength < 0 {
				ds.chunks.Add(1)
			}
		}
		h.ServeHTTP(w, r)
	}))
	t.Cleanup(srv.Close)
	host, port, _ := net.SplitHostPort(strings.TrimPrefix(srv.URL, "http://"))
	pn, _ := strconv.Atoi(port)
	a := AuthPassword
	if auth == "" {
		a = AuthGuest
	}
	ds.prof = Profile{ID: "dav", Name: "dav", Protocol: ProtoWebDAV, Host: host, Port: pn, User: user, Auth: a,
		RemoteDir: prefix + "/roms"}
	if err := ds.prof.Validate(); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(ds.root, "roms"), 0o755); err != nil {
		t.Fatal(err)
	}
	return ds
}

func davDialer(p Profile, pass string) Dialer {
	return func(ctx context.Context) (Remote, error) { return Dial(ctx, p, pass, "") }
}

func TestWebDAVSyncSkipsUnchangedAndUploadsChanged(t *testing.T) {
	for _, auth := range []string{"", "basic", "digest"} {
		t.Run("auth="+auth, func(t *testing.T) {
			ds := startDAV(t, auth, "ark", "p@ss word", "/dav")
			local := t.TempDir()
			old := time.Now().Add(-time.Hour).Truncate(time.Second)
			big := bytes.Repeat([]byte("x"), 3<<20)
			writeAt(t, filepath.Join(local, "snes", "Big Game (USA).sfc"), big, old)
			writeAt(t, filepath.Join(local, "nes", "a#b%c.nes"), []byte("nes"), old)
			writeAt(t, filepath.Join(local, "nes", "media", "images", "a.png"), []byte("png"), old)
			writeAt(t, filepath.Join(local, ".aegis-saves-map.json"), []byte("{}"), old)

			s := waitJob(t, Start(context.Background(), "1", ds.prof, local, davDialer(ds.prof, "p@ss word")))
			if s.State != "done" || s.Uploaded != 3 || s.Skipped != 0 || s.BytesDone != int64(len(big)+6) {
				t.Fatalf("first run: %+v", s)
			}
			if ds.chunks.Load() != 0 {
				t.Fatalf("%d PUTs without Content-Length", ds.chunks.Load())
			}
			got, _ := os.ReadFile(filepath.Join(ds.root, "roms", "snes", "Big Game (USA).sfc"))
			if !bytes.Equal(got, big) {
				t.Fatal("big file differs")
			}
			if _, err := os.Stat(filepath.Join(ds.root, "roms", "nes", "a#b%c.nes")); err != nil {
				t.Fatalf("escaped name: %v", err)
			}
			if _, err := os.Stat(filepath.Join(ds.root, "roms", SaveMapFile)); err == nil {
				t.Fatal("links file must stay local")
			}
			if parts, _ := filepath.Glob(filepath.Join(ds.root, "roms", "*", "*"+PartSuffix)); len(parts) > 0 {
				t.Fatalf("parts left: %v", parts)
			}

			// Повтор: всё пропускается. / Rerun: everything is skipped.
			puts := ds.puts.Load()
			s = waitJob(t, Start(context.Background(), "2", ds.prof, local, davDialer(ds.prof, "p@ss word")))
			if s.State != "done" || s.Uploaded != 0 || s.Skipped != 3 || ds.puts.Load() != puts {
				t.Fatalf("rerun: %+v", s)
			}
			// Изменённый файл едет снова. / A changed file goes again.
			writeAt(t, filepath.Join(local, "nes", "a#b%c.nes"), []byte("nes v2"), time.Now().Add(time.Minute))
			s = waitJob(t, Start(context.Background(), "3", ds.prof, local, davDialer(ds.prof, "p@ss word")))
			if s.State != "done" || s.Uploaded != 1 {
				t.Fatalf("changed: %+v", s)
			}
		})
	}
}

func TestWebDAVProbeAndErrors(t *testing.T) {
	ds := startDAV(t, "digest", "ark", "secret", "")
	r, err := Dial(context.Background(), ds.prof, "secret", "")
	if err != nil {
		t.Fatal(err)
	}
	res, err := Probe(r, ds.prof.RemoteDir)
	r.Close()
	if err != nil || !res.Writable {
		t.Fatalf("probe: %+v %v", res, err)
	}
	if left, _ := filepath.Glob(filepath.Join(ds.root, "roms", ".aegis-write-test*")); len(left) > 0 {
		t.Fatalf("probe left %v", left)
	}

	if _, err := Dial(context.Background(), ds.prof, "wrong", ""); Classify(err) != CodeAuth {
		t.Fatalf("wrong password: %v (%s)", err, Classify(err))
	}

	missing := ds.prof
	missing.RemoteDir = "/nope"
	r, err = Dial(context.Background(), missing, "secret", "")
	if err != nil {
		t.Fatalf("dial to a missing folder must log in: %v", err)
	}
	if _, err := Probe(r, missing.RemoteDir); Classify(err) != CodeRemoteMissing {
		t.Fatalf("missing folder: %v (%s)", err, Classify(err))
	}
	r.Close()

	// Закрытый порт. / Closed port.
	l, _ := net.Listen("tcp", "127.0.0.1:0")
	port := l.Addr().(*net.TCPAddr).Port
	l.Close()
	closed := ds.prof
	closed.Port = port
	if _, err := Dial(context.Background(), closed, "secret", ""); Classify(err) != CodeRefused {
		t.Fatalf("closed port: %v (%s)", err, Classify(err))
	}

	// Не WebDAV: обычный веб-сервер. / Not WebDAV: a plain web server.
	plain := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "nope", http.StatusMethodNotAllowed)
	}))
	defer plain.Close()
	_, pp, _ := net.SplitHostPort(strings.TrimPrefix(plain.URL, "http://"))
	np := ds.prof
	np.Port, _ = strconv.Atoi(pp)
	if _, err := Dial(context.Background(), np, "secret", ""); err == nil {
		t.Fatal("plain web server accepted as WebDAV")
	}
}

func TestParseDigest(t *testing.T) {
	d := parseDigest(`Digest realm="a, b", nonce="n1", qop="auth,auth-int", opaque="o", algorithm=MD5`)
	if d == nil || d.realm != "a, b" || d.nonce != "n1" || d.qop != "auth,auth-int" || d.opaque != "o" || d.algorithm != "MD5" {
		t.Fatalf("%+v", d)
	}
	if parseDigest(`Basic realm="x"`) != nil {
		t.Fatal("basic parsed as digest")
	}
}

func TestWebDAVProfileValidate(t *testing.T) {
	p := Profile{Protocol: ProtoWebDAV, Host: "192.168.1.9", Auth: AuthGuest, RemoteDir: `dav\roms\`, Share: "x", TLS: true}
	if err := p.Validate(); err != nil {
		t.Fatal(err)
	}
	if p.RemoteDir != "/dav/roms" || p.Share != "" || p.EffectivePort() != 443 {
		t.Fatalf("%+v", p)
	}
	p.TLS = false
	if p.EffectivePort() != 80 {
		t.Fatal("http port")
	}
	if err := (&Profile{Protocol: ProtoWebDAV, Host: "h", Auth: AuthPassword, RemoteDir: "/"}).Validate(); err == nil {
		t.Fatal("password without login accepted")
	}
	if err := (&Profile{Protocol: ProtoWebDAV, Host: "h", Auth: AuthKey, KeyPath: "k", RemoteDir: "/"}).Validate(); err == nil {
		t.Fatal("ssh key for webdav accepted")
	}
	sp := Profile{Protocol: ProtoSFTP, Host: "h", User: "u", Auth: AuthPassword, RemoteDir: "/roms", TLS: true}
	if err := sp.Validate(); err != nil || sp.TLS {
		t.Fatalf("tls must be dropped for sftp: %+v %v", sp, err)
	}
}
