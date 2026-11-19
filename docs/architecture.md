# Архитектура

```text
├── cmd/
│   ├── aegis-gui/        # Нативное Windows-приложение: Win32 окно + локальный HTTP API + встроенный фронтенд
│   │   ├── main.go                   # Win32 GUI и логика
│   │   ├── hybrid_webview_server.go  # Локальный файловый API (127.0.0.1) и раздача фронтенда
│   │   └── webdist/                  # Генерируется: копия dist/ для //go:embed (в git только .gitkeep)
│   ├── aegis-setup/      # Однофайловый установщик Setup.exe
│   │   └── payload/                  # AegisROM.exe.gz генерируется, favicon.ico в git
│   ├── aegis-scanner/    # CLI-сканер (отдельный Go-модуль, собирается под Windows/Linux/macOS)
│   ├── winsetup/         # Поиск старых копий в реестре/AppData, миграция БД, деинсталляция
│   └── gen-rsrc/         # Генератор .syso ресурсов, иконок и манифеста Windows 11
├── public/
│   └── downloads/        # Сюда кладёт результат release:win (в git только aegis-scanner.go и version.json)
├── scripts/
│   └── release-win.mjs   # Сборка Windows-дистрибутивов (npm run release:win)
├── src/                  # Фронтенд: React 19 + Vite + Tailwind 4
│   ├── components/       # Экраны и модальные окна
│   ├── i18n/             # Локализации (9 языков)
│   ├── utils/            # Multi-Disc (.m3u), конструктор имён, детектор заглушек, PortMaster и др.
│   ├── version.ts        # Версия приложения и имена релизных файлов
│   └── App.tsx           # Главный контроллер состояния
├── server.ts             # Express dev-сервер + прокси скраппера (Libretro/Archive.org/PortMaster)
└── .github/workflows/    # CI и релизы
```

## Два режима запуска

- **Браузер / dev**: `npm run dev` → Express (`server.ts`) отдаёт фронтенд через Vite и API.
- **Desktop (Windows)**: `AegisROM.exe` поднимает локальный HTTP API на `127.0.0.1` и открывает фронтенд из `webdist` в окне Edge/Chrome `--app`.

## Известный технический долг

- `src/App.tsx` и `cmd/aegis-gui/main.go` — монолиты по несколько тысяч строк.
- Исходник сканера продублирован: `cmd/aegis-scanner/main.go`, `public/downloads/aegis-scanner.go` (из него собирается релизный `.exe` и он отдаётся на скачивание), `src/data/goScannerSource.ts`.
- Тестов пока нет.
