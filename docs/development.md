# Разработка

## Требования

- Node.js 22 и npm
- Go 1.26+ (нужен для нативных `.exe` под Windows и для `aegis-scanner`)
- Python 3 (используется `scripts/release-win.mjs` для упаковки `.zip`)

## Установка зависимостей

```bash
npm ci
```

`package-lock.json` закоммичен, `npm ci` ставит ровно те версии, что в нём. Новую зависимость добавляйте через `npm install <пакет>` и коммитьте обновлённый lock-файл вместе с `package.json`.

## Режим разработки (Vite + Go API)

Бэкенд один — Go. В двух терминалах:

```bash
npm run dev:api   # Go API (cmd/aegis-server) на 127.0.0.1:38471, данные в .aegis-data/
npm run dev       # Vite на http://localhost:3000 с горячей перезагрузкой, /api проксируется в Go
```

API защищён токеном (как в AegisROM.exe). `aegis-server` пишет его в `.aegis-data/native-api.token`, Vite-прокси подставляет его в запросы и отклоняет запросы с чужим `Origin`. Папка `.aegis-data/` в `.gitignore`.

Без Vite: `npm run build && npm start` — Go-сервер отдаёт `dist/` и API, адрес будет в логе.

В браузерном режиме нет нативных функций десктопа (`/api/native/*`: диалоги выбора папок, запуск эмуляторов, chdman) — они есть только в `AegisROM.exe`.

## Проверки (то же, что делает CI)

```bash
npm run lint      # tsc --noEmit
npm run build     # vite build -> dist/

# Go: фронтенд в cmd/aegis-gui/webdist и payload Setup'а — генерируемые файлы.
# Для проверки без полной сборки нужен только placeholder payload:
printf 'placeholder' > cmd/aegis-setup/payload/AegisROM.exe.gz
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go vet -unsafeptr=false ./...
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -o /dev/null ./...
go test ./...
GOOS=darwin GOARCH=arm64 go build -o /dev/null ./aegiscore ./aegisapi ./cmd/aegis-server
(cd cmd/aegis-scanner && go vet ./... && go build -o /dev/null .)
```

`-unsafeptr=false`: вызовы COM vtable в `cmd/winsetup/winapi.go` дают ложные срабатывания этой проверки.

## Локальная сборка Windows-дистрибутивов

```bash
npm run release:win
```

Скрипт `scripts/release-win.mjs`:

1. Собирает фронтенд (`vite build`) и копирует `dist/` в `cmd/aegis-gui/webdist/` (без `.exe`/`.zip`, чтобы бинарники не вшивались в приложение).
2. Генерирует иконки и манифест Windows (`cmd/gen-rsrc`). Это перезаписывает `.syso` и иконки в `public/` — если вы их не меняли, откатите: `git checkout -- cmd/aegis-gui/rsrc_windows_amd64.syso cmd/aegis-setup/rsrc_windows_amd64.syso cmd/aegis-setup/payload/favicon.ico public/favicon.ico public/aegisrom-icon.png public/downloads/version.json`.
3. Кросс-компилирует `aegis-scanner-win11-x64.exe`, `AegisROM.exe`, `AegisROM-Portable-Win11-x64.exe` (`-H=windowsgui`).
4. Сжимает `AegisROM.exe` в `cmd/aegis-setup/payload/AegisROM.exe.gz` и собирает `AegisROM-Setup-v<версия>-Win11-x64.exe`.
5. Упаковывает `AegisROM-v<версия>-Win11-x64.zip` и обновляет `public/downloads/version.json`.

Результат — в `public/downloads/`. Бинарники в git не коммитятся (см. `.gitignore`), их публикует GitHub Actions в Releases — см. [releasing.md](releasing.md).
