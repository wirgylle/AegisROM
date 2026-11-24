# AegisROM для macOS / AegisROM for macOS

[RU](#ru) · [EN](#en)

<a id="ru"></a>
## RU

**Статус: тестовая версия.** Собирается в CI на `macos-14`, на настоящем Mac пока никто не запускал. Всё, что ниже помечено «не проверено», проверено только сборкой и тестами Go.

### Что внутри

- Один `.dmg` для Intel и Apple Silicon (universal-бинарник, `lipo`), macOS 11 и новее.
- Окно Wails v3 на системном WKWebView. Браузер не нужен, сервер по TCP не поднимается: страница обращается к Go напрямую.
- Подпись ad-hoc (`codesign -s -`) без аккаунта Apple Developer, без нотаризации.
- Код: `cmd/aegis-mac` (окно и маршруты), `aegisdesktop/` (эмуляторы, chdman, медиа — общий код без cgo, с тестами), сборка — `scripts/release-mac.sh` (`npm run release:mac`).

### Установка

1. Скачать `AegisROM-v<версия>-macOS-universal.dmg` из [Releases](https://github.com/wirgylle/AegisROM/releases) (dev-сборки — верхний Pre-release).
2. Открыть `.dmg`, перетащить `AegisROM` в «Программы».
3. Первый запуск. Приложение не подписано сертификатом Apple, поэтому macOS его остановит:
   - macOS 14 и старше: правый клик по AegisROM → «Открыть» → «Открыть».
   - macOS 15 и новее: запустить один раз, затем «Системные настройки» → «Конфиденциальность и безопасность» → «Всё равно открыть».
   - Или в Терминале: `xattr -dr com.apple.quarantine /Applications/AegisROM.app`.

### Что чем заменено на macOS

| Функция | Windows | macOS |
|---|---|---|
| Окно | Edge/Chrome `--app` или Wails + WebView2 | Wails + WKWebView |
| Данные и настройки | `%APPDATA%\AegisROM` | `~/Library/Application Support/AegisROM` |
| Доступ к папкам | File System Access API или Go | Только через Go (`/api/native/vfs/*`), папки выбираются в системном окне Finder |
| Пароли устройств Wi-Fi | Диспетчер учётных данных | Связка ключей (Keychain), запись «AegisROM device» |
| Эмуляторы | `.exe` в Program Files и т. п. | `.app` в `/Applications`, `~/Applications` и их подпапке `Emulators` |
| Ядра RetroArch | `cores\*.dll` рядом с `retroarch.exe` | `~/Library/Application Support/RetroArch/cores/*.dylib` |
| chdman | `chdman.exe` | `brew install rom-tools` (ищется в `/opt/homebrew/bin` и `/usr/local/bin`) или выбрать файл вручную |
| Сохранения эмуляторов | папки эмулятора, `Документы` | плюс `~/Library/Application Support/{RetroArch,DuckStation,PCSX2}` |
| Установщик, ярлыки | `Setup.exe` | не нужен: перетащить в «Программы» |

Эмуляторы, которые ищутся сами: RetroArch, DuckStation, PCSX2, mGBA, melonDS, PPSSPP, Dolphin, RPCS3, Ryujinx, xemu. Другой путь можно выбрать в «Среде»: в окне выбора бандл `.app` выбирается как файл. Запускается бинарник внутри бандла (`Contents/MacOS/…`, имя из `Info.plist`) с теми же аргументами, что и на Windows. Запустить можно только найденный или выбранный в «Среде» эмулятор: произвольный путь из запроса не принимается.

OpenEmu не поддерживается: у него нет запуска конкретной игры из командной строки.

### Что проверено, а что нет

| Что | Проверено |
|---|---|
| Сборка arm64 + amd64 с cgo, `lipo`, `.app`, ad-hoc подпись, `.dmg` (`hdiutil verify`) | CI на `macos-14` |
| `go vet` и `go test` пакетов `aegisdesktop`, `aegisapi`, `aegiscore`, `aegistransfer` на macOS | CI на `macos-14` |
| Поиск `.app`, `Info.plist`, ядра `.dylib`, аргументы запуска, отказ запускать чужой путь, chdman, медиа | тесты Go (Linux и macOS) |
| Окно открывается, страница грузится, POST-запросы и Range (видео, большие файлы) через WKWebView | **не проверено** |
| Системное окно выбора папки и файла | **не проверено** |
| Связка ключей для паролей Wi-Fi | **не проверено** |
| Запуск эмуляторов, chdman из Homebrew | **не проверено** |
| Быстрый тест (EmulatorJS, WASM) в WKWebView | **не проверено** |
| Gatekeeper на macOS 15 | **не проверено** |

### Известные ограничения

- Настройки с Windows не переносятся сами. Можно выгрузить данные игр (CSV/XML) или скопировать папку `storage` из `%APPDATA%\AegisROM` в `~/Library/Application Support/AegisROM`.
- В интерфейсе местами остались слова «exe» и `.dll` в названиях ядер (сопоставление идёт по имени ядра, на Mac ищется `.dylib`).
- Запасные `.cmd`-скрипты (для браузерной версии без доступа к папкам) — только для Windows. В окне на Mac они не нужны: файлы обрабатывает Go.
- Обновления: без автообновления, новую версию нужно скачать заново.
- Подпись и нотаризация Apple Developer ID не делаются (нет аккаунта). Если аккаунт появится, в `scripts/release-mac.sh` меняется только шаг подписи плюс `notarytool`.

---

<a id="en"></a>
## EN

**Status: test version.** Built in CI on `macos-14`; nobody has run it on a real Mac yet. Everything marked "not verified" below is checked by the build and Go tests only.

### What's inside

- One `.dmg` for Intel and Apple Silicon (universal binary via `lipo`), macOS 11 or newer.
- A Wails v3 window on the system WKWebView. No browser needed and no TCP server: the page talks to Go directly.
- Ad-hoc signature (`codesign -s -`) without an Apple Developer account, no notarization.
- Code: `cmd/aegis-mac` (window and routes), `aegisdesktop/` (emulators, chdman, media — shared code without cgo, with tests); build: `scripts/release-mac.sh` (`npm run release:mac`).

### Installing

1. Download `AegisROM-v<version>-macOS-universal.dmg` from [Releases](https://github.com/wirgylle/AegisROM/releases) (dev builds: the top Pre-release).
2. Open the `.dmg` and drag `AegisROM` to Applications.
3. First launch. The app is not signed with an Apple certificate, so macOS blocks it:
   - macOS 14 and older: right-click AegisROM → Open → Open.
   - macOS 15 and newer: launch once, then System Settings → Privacy & Security → Open Anyway.
   - Or in Terminal: `xattr -dr com.apple.quarantine /Applications/AegisROM.app`.

### What replaces what on macOS

| Feature | Windows | macOS |
|---|---|---|
| Window | Edge/Chrome `--app` or Wails + WebView2 | Wails + WKWebView |
| Data and settings | `%APPDATA%\AegisROM` | `~/Library/Application Support/AegisROM` |
| Folder access | File System Access API or Go | Go only (`/api/native/vfs/*`); folders are picked in the Finder dialog |
| Wi-Fi device passwords | Credential Manager | Keychain, entry "AegisROM device" |
| Emulators | `.exe` in Program Files etc. | `.app` in `/Applications`, `~/Applications` and their `Emulators` subfolder |
| RetroArch cores | `cores\*.dll` next to `retroarch.exe` | `~/Library/Application Support/RetroArch/cores/*.dylib` |
| chdman | `chdman.exe` | `brew install rom-tools` (looked up in `/opt/homebrew/bin` and `/usr/local/bin`) or pick the file |
| Emulator saves | emulator folders, Documents | plus `~/Library/Application Support/{RetroArch,DuckStation,PCSX2}` |
| Installer, shortcuts | `Setup.exe` | not needed: drag to Applications |

Emulators found automatically: RetroArch, DuckStation, PCSX2, mGBA, melonDS, PPSSPP, Dolphin, RPCS3, Ryujinx, xemu. Another path can be set in Environment; the picker accepts a `.app` bundle as a file. The binary inside the bundle (`Contents/MacOS/…`, name from `Info.plist`) runs with the same arguments as on Windows. Only a detected or Environment-picked emulator can run: an arbitrary path from the request is rejected.

OpenEmu is not supported: it cannot start a specific game from the command line.

### Verified and not verified

| What | Verified |
|---|---|
| arm64 + amd64 cgo build, `lipo`, `.app`, ad-hoc signature, `.dmg` (`hdiutil verify`) | CI on `macos-14` |
| `go vet` and `go test` of `aegisdesktop`, `aegisapi`, `aegiscore`, `aegistransfer` on macOS | CI on `macos-14` |
| `.app` lookup, `Info.plist`, `.dylib` cores, launch arguments, refusing foreign paths, chdman, media | Go tests (Linux and macOS) |
| Window opens, page loads, POST and Range requests (video, large files) through WKWebView | **not verified** |
| Native folder and file pickers | **not verified** |
| Keychain for Wi-Fi passwords | **not verified** |
| Launching emulators, chdman from Homebrew | **not verified** |
| Quick test (EmulatorJS, WASM) in WKWebView | **not verified** |
| Gatekeeper on macOS 15 | **not verified** |

### Known limitations

- Settings don't move over from Windows by themselves. Export game data (CSV/XML) or copy the `storage` folder from `%APPDATA%\AegisROM` to `~/Library/Application Support/AegisROM`.
- Some UI text still says "exe" and shows `.dll` core names (matching is by core name; on a Mac the `.dylib` is looked up).
- Fallback `.cmd` scripts (for the browser version without folder access) are Windows-only. The Mac window doesn't need them: Go handles the files.
- Updates: no auto-update; download the new version again.
- No Apple Developer ID signing or notarization (no account). With an account, only the signing step in `scripts/release-mac.sh` changes, plus `notarytool`.
