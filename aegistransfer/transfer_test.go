package aegistransfer

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"errors"
	"io"
	"net"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"sync/atomic"
	"testing"
	"time"

	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
)

// ---------- тестовый SFTP-сервер / test SFTP server ----------

type testServer struct {
	addr string
	fp   string
	ln   net.Listener
}

func startSFTP(t *testing.T, user, pass string) *testServer {
	t.Helper()
	_, priv, _ := ed25519.GenerateKey(rand.Reader)
	signer, err := ssh.NewSignerFromKey(priv)
	if err != nil {
		t.Fatal(err)
	}
	cfg := &ssh.ServerConfig{
		PasswordCallback: func(c ssh.ConnMetadata, p []byte) (*ssh.Permissions, error) {
			if c.User() == user && string(p) == pass {
				return nil, nil
			}
			return nil, errors.New("denied")
		},
	}
	cfg.AddHostKey(signer)
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ln.Close() })
	go func() {
		for {
			nc, err := ln.Accept()
			if err != nil {
				return
			}
			go serveSSH(nc, cfg)
		}
	}()
	return &testServer{addr: ln.Addr().String(), fp: Fingerprint(signer.PublicKey()), ln: ln}
}

func serveSSH(nc net.Conn, cfg *ssh.ServerConfig) {
	_, chans, reqs, err := ssh.NewServerConn(nc, cfg)
	if err != nil {
		nc.Close()
		return
	}
	go ssh.DiscardRequests(reqs)
	for nch := range chans {
		if nch.ChannelType() != "session" {
			_ = nch.Reject(ssh.UnknownChannelType, "no")
			continue
		}
		ch, in, err := nch.Accept()
		if err != nil {
			continue
		}
		go func() {
			for req := range in {
				ok := req.Type == "subsystem" && len(req.Payload) > 4 && string(req.Payload[4:]) == "sftp"
				_ = req.Reply(ok, nil)
				if ok {
					srv, err := sftp.NewServer(ch)
					if err == nil {
						_ = srv.Serve()
					}
					ch.Close()
					return
				}
			}
		}()
	}
}

func (s *testServer) profile(remoteDir string) Profile {
	host, port, _ := net.SplitHostPort(s.addr)
	n, _ := strconv.Atoi(port)
	return Profile{ID: "t", Name: "test", Protocol: ProtoSFTP, Host: host, Port: n, User: "ark",
		Auth: AuthPassword, RemoteDir: filepath.ToSlash(remoteDir), HostKey: s.fp}
}

func writeAt(t *testing.T, p string, data []byte, mtime time.Time) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, data, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(p, mtime, mtime); err != nil {
		t.Fatal(err)
	}
}

func waitJob(t *testing.T, j *Job) Snapshot {
	t.Helper()
	select {
	case <-j.Done():
	case <-time.After(30 * time.Second):
		t.Fatal("upload did not finish")
	}
	return j.Snapshot()
}

func sftpDialer(p Profile, pass string) Dialer {
	return func(ctx context.Context) (Remote, error) { return Dial(ctx, p, pass, "") }
}

func TestSFTPSyncSkipsUnchangedAndUploadsChanged(t *testing.T) {
	srv := startSFTP(t, "ark", "ark")
	local, remote := t.TempDir(), t.TempDir()
	old := time.Now().Add(-time.Hour).Truncate(time.Second)
	big := bytes.Repeat([]byte("x"), 3<<20)
	writeAt(t, filepath.Join(local, "nes", "Contra (USA).nes"), []byte("contra"), old)
	writeAt(t, filepath.Join(local, "psx", "FF7", "FF7 (Disc 1).chd"), big, old)
	writeAt(t, filepath.Join(local, "nes", "images", "Contra (USA)-image.png"), []byte("png"), old)
	writeAt(t, filepath.Join(local, "Thumbs.db"), []byte("junk"), old)
	writeAt(t, filepath.Join(local, ".aegis-saves", "x.srm"), []byte("junk"), old)

	p := srv.profile(remote)
	s := waitJob(t, Start(context.Background(), "1", p, local, sftpDialer(p, "ark")))
	if s.State != "done" || s.Uploaded != 3 || s.Skipped != 0 || s.TotalFiles != 3 {
		t.Fatalf("first run: %+v", s)
	}
	if s.BytesDone != s.UploadBytes || s.UploadBytes != int64(len(big)+6+3) {
		t.Fatalf("bytes: done %d of %d", s.BytesDone, s.UploadBytes)
	}
	got, _ := os.ReadFile(filepath.Join(remote, "psx", "FF7", "FF7 (Disc 1).chd"))
	if !bytes.Equal(got, big) {
		t.Fatal("big file differs")
	}
	if _, err := os.Stat(filepath.Join(remote, "Thumbs.db")); err == nil {
		t.Fatal("Thumbs.db was uploaded")
	}
	st, _ := os.Stat(filepath.Join(remote, "nes", "Contra (USA).nes"))
	if !st.ModTime().Equal(old) {
		t.Fatalf("mtime not kept: %v vs %v", st.ModTime(), old)
	}

	// Повтор: всё на месте. / Again: everything is there.
	s = waitJob(t, Start(context.Background(), "2", p, local, sftpDialer(p, "ark")))
	if s.State != "done" || s.Uploaded != 0 || s.Skipped != 3 {
		t.Fatalf("second run: %+v", s)
	}

	// Изменили один ром. / One ROM changed.
	writeAt(t, filepath.Join(local, "nes", "Contra (USA).nes"), []byte("contra-ru"), time.Now())
	s = waitJob(t, Start(context.Background(), "3", p, local, sftpDialer(p, "ark")))
	if s.State != "done" || s.Uploaded != 1 || s.Skipped != 2 {
		t.Fatalf("third run: %+v", s)
	}
	got, _ = os.ReadFile(filepath.Join(remote, "nes", "Contra (USA).nes"))
	if string(got) != "contra-ru" {
		t.Fatalf("changed file = %q", got)
	}
	if _, err := os.Stat(filepath.Join(remote, "nes", "Contra (USA).nes"+PartSuffix)); err == nil {
		t.Fatal("part file left behind")
	}
}

func TestSFTPResumesPart(t *testing.T) {
	srv := startSFTP(t, "ark", "ark")
	local, remote := t.TempDir(), t.TempDir()
	data := make([]byte, 1<<20)
	_, _ = rand.Read(data)
	old := time.Now().Add(-time.Hour)
	writeAt(t, filepath.Join(local, "gba", "game.gba"), data, old)
	// Половина уже на устройстве после обрыва. / Half is already on the device after a drop.
	writeAt(t, filepath.Join(remote, "gba", "game.gba"+PartSuffix), data[:400000], time.Now())

	p := srv.profile(remote)
	s := waitJob(t, Start(context.Background(), "1", p, local, sftpDialer(p, "ark")))
	if s.State != "done" || s.Resumed != 1 || s.UploadBytes != int64(len(data)-400000) || s.BytesDone != s.UploadBytes {
		t.Fatalf("resume: %+v", s)
	}
	got, _ := os.ReadFile(filepath.Join(remote, "gba", "game.gba"))
	if !bytes.Equal(got, data) {
		t.Fatal("resumed file differs")
	}
}

func TestSFTPStalePartIsNotResumed(t *testing.T) {
	srv := startSFTP(t, "ark", "ark")
	local, remote := t.TempDir(), t.TempDir()
	writeAt(t, filepath.Join(local, "a.bin"), []byte("new-content"), time.Now())
	// Кусок от старой версии файла (старше локального). / A part from an old version (older than local).
	writeAt(t, filepath.Join(remote, "a.bin"+PartSuffix), []byte("old"), time.Now().Add(-time.Hour))
	p := srv.profile(remote)
	s := waitJob(t, Start(context.Background(), "1", p, local, sftpDialer(p, "ark")))
	if s.State != "done" || s.Resumed != 0 {
		t.Fatalf("%+v", s)
	}
	got, _ := os.ReadFile(filepath.Join(remote, "a.bin"))
	if string(got) != "new-content" {
		t.Fatalf("got %q", got)
	}
}

func TestSFTPErrors(t *testing.T) {
	srv := startSFTP(t, "ark", "ark")
	remote := t.TempDir()
	ctx := context.Background()

	p := srv.profile(remote)
	if _, err := Dial(ctx, p, "wrong", ""); Classify(err) != CodeAuth {
		t.Fatalf("wrong password: %v (%s)", err, Classify(err))
	}

	unknown := p
	unknown.HostKey = ""
	_, err := Dial(ctx, unknown, "ark", "")
	var hk *HostKeyError
	if !errors.As(err, &hk) || hk.Changed || hk.Fingerprint != srv.fp || Classify(err) != CodeHostKeyUnknown {
		t.Fatalf("unknown key: %v", err)
	}
	r, err := Dial(ctx, unknown, "ark", srv.fp)
	if err != nil {
		t.Fatalf("trusted key: %v", err)
	}
	res, err := Probe(r, p.RemoteDir)
	r.Close()
	if err != nil || !res.Writable {
		t.Fatalf("probe: %+v %v", res, err)
	}

	changed := p
	changed.HostKey = "SHA256:somethingelse"
	if _, err := Dial(ctx, changed, "ark", ""); Classify(err) != CodeHostKeyChanged {
		t.Fatalf("changed key: %v", err)
	}

	missing := p
	missing.RemoteDir = path.Join(p.RemoteDir, "nope")
	r, _ = Dial(ctx, missing, "ark", "")
	if _, err := Probe(r, missing.RemoteDir); Classify(err) != CodeRemoteMissing {
		t.Fatalf("missing dir: %v", err)
	}
	r.Close()
	local := t.TempDir()
	writeAt(t, filepath.Join(local, "x"), []byte("x"), time.Now())
	s := waitJob(t, Start(ctx, "m", missing, local, sftpDialer(missing, "ark")))
	if s.State != "failed" || s.ErrorCode != CodeRemoteMissing {
		t.Fatalf("missing dir run: %+v", s)
	}

	// Закрытый порт. / Closed port.
	ln, _ := net.Listen("tcp", "127.0.0.1:0")
	closed := ln.Addr().String()
	ln.Close()
	h, port, _ := net.SplitHostPort(closed)
	cp := p
	cp.Host = h
	cp.Port, _ = strconv.Atoi(port)
	if _, err := Dial(ctx, cp, "ark", ""); Classify(err) != CodeRefused {
		t.Fatalf("closed port: %v (%s)", err, Classify(err))
	}
}

// ---------- обрыв связи / connection drop ----------

// flakyRemote — локальная папка, запись в которую обрывается после limit байт.
// flakyRemote is a local folder whose writes break after limit bytes.
type flakyRemote struct {
	DirRemote
	limit *int64
}

type flakyWriter struct {
	w     io.WriteCloser
	limit *int64
}

func (w *flakyWriter) Write(b []byte) (int, error) {
	left := atomic.LoadInt64(w.limit)
	if left <= 0 {
		return 0, io.ErrUnexpectedEOF
	}
	if int64(len(b)) > left {
		n, _ := w.w.Write(b[:left])
		atomic.StoreInt64(w.limit, 0)
		return n, io.ErrUnexpectedEOF
	}
	atomic.AddInt64(w.limit, -int64(len(b)))
	return w.w.Write(b)
}
func (w *flakyWriter) Close() error { return w.w.Close() }

func (f *flakyRemote) OpenWrite(p string, offset int64) (io.WriteCloser, error) {
	w, err := f.DirRemote.OpenWrite(p, offset)
	if err != nil {
		return nil, err
	}
	return &flakyWriter{w: w, limit: f.limit}, nil
}

func TestReconnectResumesAfterDrop(t *testing.T) {
	saved := reconnectDelays
	reconnectDelays = []time.Duration{time.Millisecond, time.Millisecond, time.Millisecond}
	defer func() { reconnectDelays = saved }()

	local, remote := t.TempDir(), t.TempDir()
	data := make([]byte, 300000)
	_, _ = rand.Read(data)
	writeAt(t, filepath.Join(local, "snes", "game.sfc"), data, time.Now().Add(-time.Hour))

	dials := 0
	dial := func(ctx context.Context) (Remote, error) {
		dials++
		limit := int64(100000) // каждое подключение пропускает 100 КБ / each connection lets 100 KB through
		return &flakyRemote{DirRemote: DirRemote{Root: remote}, limit: &limit}, nil
	}
	s := waitJob(t, Start(context.Background(), "1", Profile{RemoteDir: "/"}, local, dial))
	if s.State != "done" || s.Reconnects < 2 || s.BytesDone != int64(len(data)) {
		t.Fatalf("%+v (dials %d)", s, dials)
	}
	got, _ := os.ReadFile(filepath.Join(remote, "snes", "game.sfc"))
	if !bytes.Equal(got, data) {
		t.Fatal("file differs after reconnects")
	}
}

func TestCancel(t *testing.T) {
	local := t.TempDir()
	writeAt(t, filepath.Join(local, "a"), []byte("a"), time.Now())
	block := make(chan struct{})
	dial := func(ctx context.Context) (Remote, error) {
		<-ctx.Done()
		close(block)
		return nil, ctx.Err()
	}
	j := Start(context.Background(), "1", Profile{RemoteDir: "/"}, local, dial)
	j.Cancel()
	s := waitJob(t, j)
	<-block
	if s.State != "cancelled" {
		t.Fatalf("%+v", s)
	}
}

// ---------- профили / profiles ----------

func TestStoreProfiles(t *testing.T) {
	sec := &MemorySecrets{}
	st := NewStore(t.TempDir(), sec)
	pw := "s3cret-Pw"
	p, err := st.Save(SaveInput{Profile: Profile{Name: "R36S", Protocol: ProtoSFTP, Host: "192.168.1.50", User: "ark",
		Auth: AuthPassword, RemoteDir: "/roms/"}, Password: &pw})
	if err != nil {
		t.Fatal(err)
	}
	if p.ID == "" || !p.HasPassword || p.RemoteDir != "/roms" {
		t.Fatalf("saved %+v", p)
	}
	raw, _ := os.ReadFile(st.file)
	if bytes.Contains(raw, []byte(pw)) {
		t.Fatal("password leaked into the JSON")
	}
	if bytes.Contains(raw, []byte("hasPassword\": true")) {
		t.Fatal("hasPassword stored")
	}
	if err := st.SetHostKey(p.ID, "SHA256:abc"); err != nil {
		t.Fatal(err)
	}
	// Тот же адрес: отпечаток остаётся. / Same address: fingerprint stays.
	p.Name = "R36S kid"
	p, _ = st.Save(SaveInput{Profile: p})
	if p.HostKey != "SHA256:abc" || !p.HasPassword {
		t.Fatalf("after rename %+v", p)
	}
	// Другой адрес: отпечаток сбрасывается. / New address: fingerprint is reset.
	p.Host = "192.168.1.51"
	p, _ = st.Save(SaveInput{Profile: p})
	if p.HostKey != "" {
		t.Fatalf("host key kept after address change: %+v", p)
	}
	p, _ = st.Save(SaveInput{Profile: p, ClearPassword: true})
	if p.HasPassword {
		t.Fatal("password not cleared")
	}
	if err := st.Delete(p.ID); err != nil {
		t.Fatal(err)
	}
	if list, _ := st.List(); len(list) != 0 {
		t.Fatalf("left %v", list)
	}

	bad := []Profile{
		{Protocol: "ftp", Host: "h", Auth: AuthPassword, RemoteDir: "/r", User: "u"},
		{Protocol: ProtoSFTP, Host: "", Auth: AuthPassword, RemoteDir: "/r", User: "u"},
		{Protocol: ProtoSFTP, Host: "h", Auth: AuthPassword, RemoteDir: "roms", User: "u"},
		{Protocol: ProtoSFTP, Host: "h", Auth: AuthGuest, RemoteDir: "/r", User: "u"},
		{Protocol: ProtoSMB, Host: "h", Auth: AuthGuest, RemoteDir: "roms"},
	}
	for i, b := range bad {
		if _, err := st.Save(SaveInput{Profile: b}); err == nil {
			t.Fatalf("bad profile %d accepted", i)
		}
	}
	smb, err := st.Save(SaveInput{Profile: Profile{Protocol: ProtoSMB, Host: "BATOCERA", Auth: AuthGuest, Share: "\\share\\", RemoteDir: "/roms/"}})
	if err != nil || smb.Share != "share" || smb.RemoteDir != "roms" || smb.EffectivePort() != 445 {
		t.Fatalf("smb %+v %v", smb, err)
	}
}

func TestNeedsUpload(t *testing.T) {
	now := time.Now()
	l := LocalFile{Size: 10, ModTime: now}
	cases := []struct {
		r      RemoteEntry
		exists bool
		want   bool
	}{
		{RemoteEntry{}, false, true},
		{RemoteEntry{Size: 9, ModTime: now}, true, true},
		{RemoteEntry{Size: 10, ModTime: now.Add(-time.Second)}, true, false}, // FAT 2 s
		{RemoteEntry{Size: 10, ModTime: now.Add(-time.Minute)}, true, true},
		{RemoteEntry{Size: 10, ModTime: now.Add(time.Hour)}, true, false},
	}
	for i, c := range cases {
		if got := NeedsUpload(l, c.r, c.exists); got != c.want {
			t.Fatalf("case %d: got %v", i, got)
		}
	}
}

func TestClassifyDNS(t *testing.T) {
	err := &net.OpError{Op: "dial", Err: &net.DNSError{Err: "no such host", Name: "r36s.local"}}
	if Classify(err) != CodeBadHost {
		t.Fatal(Classify(err))
	}
	if Classify(&net.OpError{Op: "dial", Err: os.ErrDeadlineExceeded}) != CodeUnreachable {
		t.Fatal("timeout")
	}
}
