# Нативное окно и macOS / Native window and macOS

[RU](#ru) · [EN](#en)

<a id="ru"></a>
## RU

### Зачем

Сейчас `AegisROM.exe` поднимает локальный сервер и открывает UI в Edge или Chrome в режиме `--app`. Отсюда три проблемы:

- окно зависит от установленного браузера (на macOS Edge обычно нет);
- настройки и базы библиотек лежат в профиле браузера (localStorage, IndexedDB), а доступ к папкам держится на разрешениях File System Access API, которые после перезапуска нужно подтверждать заново;
- File System Access API нет в WebKit, то есть в окне macOS он не заработает.

### Выбор: Wails v3

| Вариант | Итог |
|---|---|
| **Wails v3** (Go + системный WebView: WebView2 на Windows, WKWebView на macOS, WebKitGTK на Linux) | **Выбран.** Бэкенд уже на Go: тот же `http.ServeMux` подключается как обработчик ассетов окна, без TCP-порта. Нативные диалоги, меню и трей на трёх ОС. v3.1.0 вышел стабильным. |
| Wails v2 | Стабилен, но одно окно и меньше API. Новых функций в v2 не будет. |
| Tauri | Бэкенд на Rust: пришлось бы переписывать или держать Go отдельным процессом. |
| Electron | Свой Chromium в каждой сборке: +100 МБ и больше памяти. File System Access API там есть, но это лечит симптом. |
| Оставить Edge/Chrome `--app` | Нет на macOS без Chrome, настройки привязаны к профилю браузера. |

Цена Wails v3: он требует Go 1.26 (сейчас в CI 1.23), а на macOS и Linux нужна сборка с CGO на своей ОС. Windows-сборка из Linux работает без CGO.

### Главное архитектурное изменение

Всё, что сейчас держит браузер, переезжает в Go:

1. **Настройки и базы** — в `appDir/storage/*.json` (этап 1, этот PR).
2. **Доступ к папкам** — абсолютные пути вместо handle'ов браузера. Фронтенд продолжит работать с теми же интерфейсами `FileSystemDirectoryHandle`/`FileSystemFileHandle`, но их реализует прослойка поверх Go API (`/api/native/fs/*`). Так не нужно переписывать ~200 мест в UI, а разрешения браузера больше не нужны. Go разрешает операции только внутри папок, выбранных пользователем через нативный диалог.

### Этапы

Каждый этап — отдельный PR в `dev`, после проверки он уходит в `main` релизом.

| # | Этап | Что входит | Проверка |
|---|---|---|---|
| 1 | Настройки на диске | `/api/native/storage`, зеркалирование localStorage и базы библиотек из IndexedDB на диск, восстановление в пустом окне. Работает уже в текущем окне Edge. | Тесты Go, Playwright: данные из «старого» профиля появляются в новом |
| 2 | Окно Wails на Windows | `AegisROM.exe` открывает своё окно (WebView2) вместо Edge. API идёт через обработчик ассетов Wails. Разовый перенос из старого профиля Edge, если этап 1 не успел выгрузить данные: запуск Edge со служебной страницей экспорта. Ключ `--legacy-window` оставляет старый режим на один релиз. | Ручная проверка на Windows 11: все вкладки, сохранённые настройки, папки |
| 3 | Файлы через Go | Прослойка `FileSystem*Handle` поверх `/api/native/fs/*`, папки хранятся как пути, медиа через `/fs/media` без разрешений. Нативные диалоги через Wails вместо Win32. | Скан, сортировка, 1G1R, экспорт сборки на Windows |
| 4 | Разделение по ОС | Код Win32 (установщик, ярлыки, диалоги) за build-тегами, общий код без `//go:build windows`. Пути данных по ОС (`%APPDATA%`, `~/Library/Application Support`). | `go vet` под windows и darwin в CI |
| 5 | Эмуляторы на macOS | Поиск `.app` в `/Applications` и `~/Applications`, запуск бинарника внутри бандла с теми же аргументами. RetroArch: ядра `.dylib` из `~/Library/Application Support/RetroArch/cores`. OpenEmu: только «открыть в OpenEmu», он импортирует игру в свою библиотеку, запуска конкретной игры из командной строки у него нет. | На Mac |
| 6 | Сборка `.dmg` | Job на `macos-latest` в release-workflow: `darwin/universal` (Intel + Apple Silicon), ad-hoc подпись `codesign -s -`, `.dmg` через `hdiutil`. Без аккаунта Apple. В README — как открыть неподписанное приложение. | Запуск `.dmg` на Mac |
| 7 | PortMaster через WSL (отдельно) | Вместо `--classic-win32`: установка WSL-дистрибутива и нативного PortMaster внутри. **Риск:** большинство портов PortMaster собраны под ARM64 и KMS/DRM приставок; на x86-ПК в WSL их, скорее всего, придётся гонять через эмуляцию (box64/qemu-user). Сначала прототип на 2–3 портах, потом решение. | Прототип |

### Своё окно (этап 2)

С 0.6.2 `AegisROM.exe` по умолчанию открывает своё окно (WebView2). Edge остаётся запасным вариантом и включается сам:

- нет WebView2 Runtime (в Windows 11 он есть всегда);
- окно не загрузило страницу за 30 секунд: в том же запуске открывается Edge;
- прошлый запуск своего окна оборвался до загрузки страницы (в папке данных остался файл `native-window-pending`).

В двух последних случаях Edge запоминается (файл `use-legacy-window` со словом `auto`). Переключить вручную: «Настройки» → «Общие» → «Окно приложения», действует со следующего запуска. Ключи: `--legacy-window` — Edge на этот запуск, `--native-window` — своё окно, даже если выбран Edge. Папка данных — `%APPDATA%\AegisROM` (путь виден в `/api/native/status` → `appDir`), профиль окна — `<appDir>\WebView2`. При первом запуске, если на диске ещё нет настроек, на несколько секунд за экраном открывается старое окно Edge и выгружает их. Доступ к папкам из Edge не переносится: в своём окне папки выбираются один раз заново, дальше они запоминаются как пути.

Медиа в своём окне ищет Go (`/api/native/fs/resolve-media`, `aegisapi/localmedia.go`): картинки по видам (боксарт, скриншот, титул, баннер) по тем же правилам, что у Библиотеки, для всех строк базы за один обход папки.

### Файлы через Go (этап 3)

`aegisapi/vfs.go` даёт `/api/native/vfs/*`: `pick`, `roots`, `list`, `stat`, `read` (с Range), `write`, `mkdir`, `remove`, `move`, `copy`. `copy` сам создаёт папку назначения, а с `skipSame=1` не трогает файл того же размера (так сборка копирует ромы и медиа на диске, не пропуская байты через страницу). Пути принимаются только внутри папок, выбранных в нативном диалоге (`appDir/vfs-roots.json`), удалить саму выбранную папку нельзя. `read` отдаёт только медиа-типы, с `nosniff` и `CSP sandbox`.

`src/utils/nativeFs.ts` подменяет `showDirectoryPicker` и возвращает объекты с интерфейсом `FileSystemDirectoryHandle`/`FileSystemFileHandle`. Файлы до 32 МБ приходят как настоящий `File`, крупнее — как `LazyFile` (чтение кусками по Range). Для `LazyFile` `URL.createObjectURL` выдаёт адрес `read`, а `FormData` передаёт ссылку на путь, и Go кладёт сам файл (для chdman). Handle'ы сохраняются в IndexedDB как пути и восстанавливаются после перезапуска без запросов разрешений.

Включается в своём окне (по умолчанию на Windows) и там, где у WebView нет `showDirectoryPicker` (macOS). В окне Edge остаётся API браузера. Для тестов: `aegis-server -dev-pick-dir <папка>`.

### Gatekeeper без подписи

Без аккаунта Apple Developer macOS помечает скачанное приложение как непроверенное. Обход для README:

- macOS 14 и старше: правый клик по `AegisROM.app` → «Открыть» → «Открыть».
- macOS 15 и новее: запустить один раз, затем «Системные настройки» → «Конфиденциальность и безопасность» → «Всё равно открыть».
- Или в Терминале: `xattr -dr com.apple.quarantine /Applications/AegisROM.app`.

### Статус этапов 4–6

Этапы 4–6 сделаны отдельным приложением `cmd/aegis-mac` и пакетом `aegisdesktop/`: Windows-код (`cmd/aegis-gui`) не тронут. Сборка `.dmg` идёт в release-workflow (job `build-macos`). Подробно, включая что проверено, — [macos.md](macos.md).

### Что нужно от владельца

- Mac для проверки этапов 5–6. Без него эти этапы собираются в CI, но запуск не проверен.

---

<a id="en"></a>
## EN

### Why

Today `AegisROM.exe` starts a local server and opens the UI in Edge or Chrome `--app` mode. That causes three problems:

- the window depends on an installed browser (macOS usually has no Edge);
- settings and library databases live in the browser profile (localStorage, IndexedDB), and folder access relies on File System Access API permissions that must be confirmed again after every restart;
- WebKit has no File System Access API, so it would not work in a macOS window at all.

### Choice: Wails v3

| Option | Verdict |
|---|---|
| **Wails v3** (Go + system WebView: WebView2 on Windows, WKWebView on macOS, WebKitGTK on Linux) | **Chosen.** The backend is already Go: the same `http.ServeMux` plugs in as the window's asset handler, with no TCP port. Native dialogs, menus and tray on all three OSes. v3.1.0 is a stable release. |
| Wails v2 | Stable, but single window and a smaller API. No new features land in v2. |
| Tauri | Rust backend: Go would have to be rewritten or run as a separate process. |
| Electron | Bundles its own Chromium: +100 MB and more RAM. It has the File System Access API, but that treats the symptom. |
| Keep Edge/Chrome `--app` | Not on macOS without Chrome, settings tied to the browser profile. |

The cost of Wails v3: it needs Go 1.26 (CI uses 1.23 today), and macOS and Linux builds need CGO on their own OS. The Windows build cross-compiles from Linux without CGO.

### The main architectural change

Everything the browser holds today moves into Go:

1. **Settings and databases** go to `appDir/storage/*.json` (stage 1, this PR).
2. **Folder access** uses absolute paths instead of browser handles. The frontend keeps using the same `FileSystemDirectoryHandle`/`FileSystemFileHandle` interfaces, implemented by a shim over the Go API (`/api/native/fs/*`). That avoids rewriting ~200 call sites in the UI, and browser permissions are no longer needed. Go allows operations only inside folders the user picked in a native dialog.

### Stages

Each stage is a separate PR into `dev`; after testing it ships to `main` in a release.

| # | Stage | Scope | Verification |
|---|---|---|---|
| 1 | Settings on disk | `/api/native/storage`, mirroring localStorage and the IndexedDB library vault to disk, restoring into an empty window. Already works in the current Edge window. | Go tests, Playwright: data from an "old" profile shows up in a new one |
| 2 | Wails window on Windows | `AegisROM.exe` opens its own window (WebView2) instead of Edge. The API goes through the Wails asset handler. One-time move from the old Edge profile if stage 1 had no chance to upload: launch Edge with an internal export page. `--legacy-window` keeps the old mode for one release. | Manual check on Windows 11: all tabs, saved settings, folders |
| 3 | Files through Go | `FileSystem*Handle` shim over `/api/native/fs/*`, folders stored as paths, media via `/fs/media` without permissions. Native dialogs via Wails instead of Win32. | Scan, sorting, 1G1R, build export on Windows |
| 4 | Split by OS | Win32 code (installer, shortcuts, dialogs) behind build tags, shared code without `//go:build windows`. Per-OS data paths (`%APPDATA%`, `~/Library/Application Support`). | `go vet` for windows and darwin in CI |
| 5 | Emulators on macOS | Look up `.app` bundles in `/Applications` and `~/Applications`, run the binary inside the bundle with the same arguments. RetroArch: `.dylib` cores from `~/Library/Application Support/RetroArch/cores`. OpenEmu: "open in OpenEmu" only; it imports the game into its own library and has no command line to start a specific game. | On a Mac |
| 6 | `.dmg` build | A `macos-latest` job in the release workflow: `darwin/universal` (Intel + Apple Silicon), ad-hoc signature `codesign -s -`, `.dmg` via `hdiutil`. No Apple account. README explains how to open an unsigned app. | Opening the `.dmg` on a Mac |
| 7 | PortMaster via WSL (separate) | Instead of `--classic-win32`: install a WSL distro and native PortMaster inside it. **Risk:** most PortMaster ports are built for ARM64 and the handhelds' KMS/DRM; on an x86 PC in WSL they will most likely need emulation (box64/qemu-user). Prototype on 2–3 ports first, then decide. | Prototype |

### Native window (stage 2)

Since 0.6.2 `AegisROM.exe` opens its own window (WebView2) by default. Edge stays as the fallback and switches on by itself when:

- the WebView2 Runtime is missing (Windows 11 always has it);
- the window did not load the page within 30 seconds: Edge opens in the same launch;
- the previous native start died before the page loaded (a `native-window-pending` file was left in the data folder).

In the last two cases Edge is remembered (a `use-legacy-window` file containing `auto`). To switch by hand: Settings → General → App window, applied from the next start. Switches: `--legacy-window` uses Edge for this launch, `--native-window` forces the native window even when Edge is selected. The data folder is `%APPDATA%\AegisROM` (`/api/native/status` → `appDir` shows the path); the window profile lives in `<appDir>\WebView2`. On first launch, if no settings are on disk yet, the old Edge window opens off-screen for a few seconds and uploads them. Folder access does not carry over from Edge: in the native window folders are picked once more, then remembered as paths.

In the native window Go finds the media (`/api/native/fs/resolve-media`, `aegisapi/localmedia.go`): images by kind (box art, screenshot, title, banner) with the same rules as the Library, for every database row in one folder walk.

### Files via Go (stage 3)

`aegisapi/vfs.go` serves `/api/native/vfs/*`: `pick`, `roots`, `list`, `stat`, `read` (with Range), `write`, `mkdir`, `remove`, `move`, `copy`. `copy` creates the target folder itself, and with `skipSame=1` it leaves a same-size file alone (builds copy ROMs and media on disk this way, without sending bytes through the page). Paths are accepted only inside folders picked in the native dialog (`appDir/vfs-roots.json`); a picked folder itself cannot be removed. `read` serves media types only, with `nosniff` and `CSP sandbox`.

`src/utils/nativeFs.ts` replaces `showDirectoryPicker` and returns objects implementing `FileSystemDirectoryHandle`/`FileSystemFileHandle`. Files up to 32 MB come back as a real `File`, larger ones as a `LazyFile` (read in Range chunks). For a `LazyFile`, `URL.createObjectURL` returns the `read` URL, and `FormData` sends a path reference that Go replaces with the file itself (for chdman). Handles are stored in IndexedDB as paths and come back after a restart without permission prompts.

Enabled in the native window (the Windows default) and wherever the WebView has no `showDirectoryPicker` (macOS). The Edge window keeps the browser API. For tests: `aegis-server -dev-pick-dir <folder>`.

### Gatekeeper without signing

Without an Apple Developer account macOS flags a downloaded app as unverified. Workaround for the README:

- macOS 14 and older: right-click `AegisROM.app` → Open → Open.
- macOS 15 and newer: launch once, then System Settings → Privacy & Security → Open Anyway.
- Or in Terminal: `xattr -dr com.apple.quarantine /Applications/AegisROM.app`.

### Status of stages 4–6

Stages 4–6 are a separate app, `cmd/aegis-mac`, plus the `aegisdesktop/` package; the Windows code (`cmd/aegis-gui`) is untouched. The `.dmg` is built by the release workflow (`build-macos` job). Details, including what is verified: [macos.md](macos.md).

### Needed from the owner

- A Mac to verify stages 5–6. Without one these stages build in CI, but launching is untested.
