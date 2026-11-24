package aegistransfer

// Preset — заготовка профиля для прошивки из плана 0.6.0 (docs/plan-0.6.0.md, задачи 5 и 6).
// Значения взяты из документации прошивок и на устройствах не проверены: пользователь
// может поправить любое поле. Пароль в заготовку не входит.
//
// Preset is a profile template for a firmware from the 0.6.0 plan (tasks 5 and 6).
// Values come from firmware docs and were not checked on devices; every field can be
// edited. Passwords are never part of a preset.
type Preset struct {
	ID        string   `json:"id"`
	Label     string   `json:"label"`
	Protocol  Protocol `json:"protocol"`
	User      string   `json:"user,omitempty"`
	Auth      string   `json:"auth"`
	Share     string   `json:"share,omitempty"`
	RemoteDir string   `json:"remoteDir"`
	// AltRemoteDirs — другие типичные папки (вторая карта и т.п.).
	// AltRemoteDirs are other usual folders (second card etc.).
	AltRemoteDirs []string `json:"altRemoteDirs,omitempty"`
}

// Presets — список заготовок / the preset list.
func Presets() []Preset {
	return []Preset{
		{ID: "arkos", Label: "R36S / ArkOS (SFTP)", Protocol: ProtoSFTP, User: "ark", Auth: AuthPassword, RemoteDir: "/roms", AltRemoteDirs: []string{"/roms2"}},
		{ID: "muos", Label: "Anbernic / muOS (SFTP)", Protocol: ProtoSFTP, User: "root", Auth: AuthPassword, RemoteDir: "/mnt/mmc/ROMS", AltRemoteDirs: []string{"/mnt/sdcard/ROMS"}},
		{ID: "knulli", Label: "Anbernic / Knulli (SFTP)", Protocol: ProtoSFTP, User: "root", Auth: AuthPassword, RemoteDir: "/userdata/roms"},
		{ID: "trimui", Label: "TrimUI (SFTP)", Protocol: ProtoSFTP, Auth: AuthPassword, RemoteDir: "/mnt/SDCARD/Roms"},
		{ID: "steamdeck", Label: "Steam Deck / EmuDeck (SFTP)", Protocol: ProtoSFTP, User: "deck", Auth: AuthPassword, RemoteDir: "/home/deck/Emulation/roms", AltRemoteDirs: []string{"/run/media/mmcblk0p1/Emulation/roms"}},
		{ID: "batocera-smb", Label: "Batocera / Knulli (SMB)", Protocol: ProtoSMB, Auth: AuthGuest, Share: "share", RemoteDir: "roms"},
		{ID: "onion-smb", Label: "Miyoo / Onion (SMB)", Protocol: ProtoSMB, Auth: AuthPassword, RemoteDir: "Roms"},
	}
}
