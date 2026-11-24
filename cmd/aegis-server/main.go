// aegis-server — кроссплатформенный HTTP API AegisROM поверх ядра (Windows, Linux, macOS).
//
// Отдаёт собранный React UI (dist/) и общее API: /api/db/*, PortMaster, скрапер.
// Нативные функции десктопа (/api/native/*: диалоги, запуск эмуляторов, chdman)
// есть только в AegisROM.exe.
//
// Разработка: `npm run dev:api` (этот сервер) + `npm run dev` (Vite с прокси /api).
// Без Vite: `npm run build && go run ./cmd/aegis-server`, затем открыть адрес из лога.
package main

import (
	"errors"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"aegisgui/aegisapi"
	"aegisgui/aegistransfer"
)

func defaultDataDir() string {
	if dir, err := os.UserConfigDir(); err == nil {
		return filepath.Join(dir, "AegisROM-server")
	}
	return ".aegis-data"
}

func main() {
	addr := flag.String("addr", "127.0.0.1:38471", "адрес сервера (только loopback)")
	distDir := flag.String("dist", "dist", "папка собранного фронтенда (vite build)")
	dataDir := flag.String("data", defaultDataDir(), "папка базы, сборок и кэша")
	devPickDir := flag.String("dev-pick-dir", "", "для тестов: папка, которую «выбирает» диалог /api/native/vfs/pick (включает файлы через Go во фронтенде)")
	devSecrets := flag.Bool("dev-memory-secrets", false, "для тестов: пароли устройств в памяти вместо хранилища ключей ОС")
	flag.Parse()

	if err := run(*addr, *distDir, *dataDir, *devPickDir, *devSecrets); err != nil {
		log.Fatal(err)
	}
}

func run(addr, distDir, dataDir, devPickDir string, devSecrets bool) error {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return fmt.Errorf("неверный -addr: %w", err)
	}
	if ip := net.ParseIP(host); host != "localhost" && (ip == nil || !ip.IsLoopback()) {
		// Guard пускает только Host 127.0.0.1/localhost; режим NAS/Docker — отдельная задача.
		return errors.New("-addr должен быть loopback (127.0.0.1 или localhost)")
	}
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return err
	}

	mux := http.NewServeMux()
	aegisapi.RegisterLibraryRoutes(mux, dataDir, nil)
	aegisapi.RegisterStorageRoutes(mux, dataDir, nil)
	// Диалогов у сервера нет; -dev-pick-dir подменяет диалог в тестах.
	// The server has no dialogs; -dev-pick-dir stands in for one in tests.
	vfsOpts := aegisapi.VFSOptions{}
	if devPickDir != "" {
		vfsOpts.PreferNative = true
		vfsOpts.PickFolder = func(string) (string, error) { return filepath.Abs(devPickDir) }
	}
	aegisapi.RegisterVFSRoutes(mux, dataDir, nil, vfsOpts)
	// Запуск в окне и сохранения рядом с ромом (как в aegis-gui).
	aegisapi.RegisterQuickTestRoutes(mux, nil)
	aegisapi.RegisterSaveRoutes(mux, nil)
	// Заливка по Wi-Fi (SFTP, SMB). / Wi-Fi upload (SFTP, SMB).
	transferOpts := aegisapi.TransferOptions{}
	if devSecrets {
		transferOpts.Secrets = &aegistransfer.MemorySecrets{}
	}
	aegisapi.RegisterTransferRoutes(mux, dataDir, nil, transferOpts)

	if index, err := os.ReadFile(filepath.Join(distDir, "index.html")); err == nil {
		mux.Handle("/", aegisapi.SPAHandler(os.DirFS(distDir), index, nil))
	} else {
		log.Printf("фронтенд не найден в %s (%v): работает только /api. Для UI: npm run build или npm run dev", distDir, err)
	}

	token, err := aegisapi.NewToken()
	if err != nil {
		return err
	}
	ln, err := net.Listen("tcp", net.JoinHostPort(host, port))
	if err != nil {
		return err
	}
	// Vite dev-прокси читает токен из этого файла и подставляет его в запросы /api.
	aegisapi.WriteTokenFile(dataDir, token)

	_, listenPort, _ := net.SplitHostPort(ln.Addr().String())
	srv := &http.Server{
		Handler:           aegisapi.NewGuard(mux, token, listenPort),
		ReadHeaderTimeout: 10 * time.Second,
	}
	log.Printf("AegisROM server: http://127.0.0.1:%s/ (данные: %s)", listenPort, dataDir)
	return srv.Serve(ln)
}
