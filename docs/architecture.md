# Архитектура

```text
├── aegiscore/            # Ядро (aegis-core): логика без привязки к ОС, с юнит-тестами
│   ├── catalog.go                # Каталог консолей, расширения, база серийников PS1
│   ├── titles.go                 # Названия из заголовков (PS1/CHD/PBP, SNES, GBA, N64, NDS...), регионы
│   ├── scan.go                   # Разбор рома, CRC/MD5, 1G1R-скоринг, дедупликация
│   ├── gamelist.go               # gamelist.xml: устойчивый разбор, запись, сопоставление 000001 -> название
│   ├── media.go                  # Медиа, обложки, «фантомные» папки
│   ├── scraper.go                # Индексы Libretro thumbnails / Archive.org, скачивание
│   └── disc.go                   # Образы дисков: BIN 2352 -> ISO, MDF/IMG -> CUE+BIN
├── aegisapi/             # HTTP-слой без привязки к ОС: guard локального API, /api/db/*, PortMaster, скрапер, раздача UI
├── cmd/
│   ├── aegis-server/     # Кроссплатформенный Go-сервер: aegisapi + dist/ (dev и будущий Docker/NAS)
│   ├── aegis-gui/        # Нативное Windows-приложение: Win32 окно + локальный HTTP API + встроенный фронтенд
│   │   ├── main.go                   # Классический Win32 GUI (заморожен), вызывает aegiscore
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
└── .github/workflows/    # CI и релизы
```

## Ядро и оболочки

Целевая схема: вся логика живёт в `aegiscore` (без `syscall`/Win32, собирается под windows/linux/darwin). Оболочки только вызывают ядро:

- `cmd/aegis-gui` — классический Win32 GUI (`--classic-win32`, заморожен, не портируется) и гибридный режим: локальный HTTP API + React UI.
- `cmd/aegis-server` — HTTP API поверх ядра (`aegisapi`), отдаёт React UI. Пока слушает только loopback.
- Дальше: десктоп через Wails, Docker/NAS.

Новую логику пишите в `aegiscore` с тестом, а не в `cmd/`. Ядро не трогает UI: журнал передаётся через `aegiscore.SetLogger`, выбранный пользователем gamelist.xml — через `aegiscore.SetCustomXMLPath`.

## Два режима запуска

- **Браузер / dev**: `npm run dev:api` (Go, `cmd/aegis-server`) + `npm run dev` (Vite, прокси `/api` в Go). Бэкенд один — Go.
- **Desktop (Windows)**: `AegisROM.exe` поднимает локальный HTTP API на `127.0.0.1` и открывает фронтенд из `webdist` в окне Edge/Chrome `--app`.

## Известный технический долг

- `src/App.tsx` — монолит на несколько тысяч строк; `cmd/aegis-gui/main.go` после выноса ядра ~3.4k строк Win32-кода.
- Исходник сканера продублирован: `cmd/aegis-scanner/main.go`, `public/downloads/aegis-scanner.go` (из него собирается релизный `.exe` и он отдаётся на скачивание), `src/data/goScannerSource.ts`.
- Тесты есть у `aegiscore`, `aegisapi` и `cmd/aegis-server`; у фронтенда тестов нет.
- Файловые операции (скан, переименование, экспорт сборок) фронтенд делает сам через File System Access API (`showDirectoryPicker`, `createWritable`, `removeEntry`): ~150 мест в `src/App.tsx`, ~45 в `SmartBuildsAndConverterTab.tsx`, `utils/persistentHandles.ts`. Это работает только в Chromium и не работает в Docker/NAS-режиме. Перенос в Go API — шаг 4.
