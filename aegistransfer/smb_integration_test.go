package aegistransfer

import (
	"bytes"
	"context"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"testing"
	"time"
)

// Проверка на настоящем Samba. Запуск / Run against a real Samba:
//
//	AEGIS_SMB_TEST=127.0.0.1:4450 AEGIS_SMB_GUEST_DIR=/path/of/[share] \
//	AEGIS_SMB_USER=onion AEGIS_SMB_PASS=onionpw go test ./aegistransfer -run SMB
//
// Ожидается общая папка "share" с гостевым входом и папкой roms, и папка "priv"
// с папкой Roms для пользователя AEGIS_SMB_USER.
// Expects a guest share "share" with a roms folder, and a "priv" share with a Roms
// folder for AEGIS_SMB_USER.
func smbTestProfile(t *testing.T) Profile {
	addr := os.Getenv("AEGIS_SMB_TEST")
	if addr == "" {
		t.Skip("AEGIS_SMB_TEST not set")
	}
	host, port, _ := net.SplitHostPort(addr)
	n, _ := strconv.Atoi(port)
	return Profile{ID: "smb", Name: "smb", Protocol: ProtoSMB, Host: host, Port: n, Auth: AuthGuest, Share: "share", RemoteDir: "roms"}
}

func TestSMBGuestSync(t *testing.T) {
	p := smbTestProfile(t)
	shareDir := os.Getenv("AEGIS_SMB_GUEST_DIR")
	local := t.TempDir()
	old := time.Now().Add(-time.Hour).Truncate(time.Second)
	big := bytes.Repeat([]byte("smb"), 1<<20)
	writeAt(t, filepath.Join(local, "nes", "Contra (USA).nes"), []byte("contra"), old)
	writeAt(t, filepath.Join(local, "psx", "Disc.chd"), big, old)
	dial := func(ctx context.Context) (Remote, error) { return Dial(ctx, p, "", "") }

	r, err := Dial(context.Background(), p, "", "")
	if err != nil {
		t.Fatal(err)
	}
	if res, err := Probe(r, p.RemoteDir); err != nil || !res.Writable {
		t.Fatalf("probe %+v %v", res, err)
	}
	r.Close()

	s := waitJob(t, Start(context.Background(), "1", p, local, dial))
	if s.State != "done" || s.Uploaded != 2 {
		t.Fatalf("first: %+v", s)
	}
	if shareDir != "" {
		got, _ := os.ReadFile(filepath.Join(shareDir, "roms", "psx", "Disc.chd"))
		if !bytes.Equal(got, big) {
			t.Fatal("big file differs on the share")
		}
	}
	s = waitJob(t, Start(context.Background(), "2", p, local, dial))
	if s.State != "done" || s.Uploaded != 0 || s.Skipped != 2 {
		t.Fatalf("second: %+v", s)
	}
	writeAt(t, filepath.Join(local, "nes", "Contra (USA).nes"), []byte("contra-ru!"), time.Now())
	s = waitJob(t, Start(context.Background(), "3", p, local, dial))
	if s.State != "done" || s.Uploaded != 1 {
		t.Fatalf("third: %+v", s)
	}

	bad := p
	bad.Share = "nope"
	if _, err := Dial(context.Background(), bad, "", ""); Classify(err) != CodeShareMissing {
		t.Fatalf("missing share: %v (%s)", err, Classify(err))
	}
}

func TestSMBPassword(t *testing.T) {
	p := smbTestProfile(t)
	user, pass := os.Getenv("AEGIS_SMB_USER"), os.Getenv("AEGIS_SMB_PASS")
	if user == "" {
		t.Skip("AEGIS_SMB_USER not set")
	}
	p.Auth, p.User, p.Share, p.RemoteDir = AuthPassword, user, "priv", "Roms"
	if _, err := Dial(context.Background(), p, "wrong-"+pass, ""); Classify(err) != CodeAuth {
		t.Fatalf("wrong password: %v (%s)", err, Classify(err))
	}
	r, err := Dial(context.Background(), p, pass, "")
	if err != nil {
		t.Fatal(err)
	}
	defer r.Close()
	if _, err := Probe(r, "Missing"); Classify(err) != CodeRemoteMissing {
		t.Fatalf("missing folder: %v", err)
	}
	if res, err := Probe(r, p.RemoteDir); err != nil || !res.Writable {
		t.Fatalf("probe %+v %v", res, err)
	}
}
