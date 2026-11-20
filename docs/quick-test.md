# Запуск игры в окне / Play in the app window

[Русский](#русский) · [English](#english)

## Русский

Кнопка **«Запуск»** в карточке игры запускает ром прямо в окне AegisROM встроенным эмулятором на WebAssembly. Это основной способ запуска для систем из таблицы ниже. Внешний эмулятор из раздела «Среда» остаётся запасным вариантом: ссылка «Во внешнем эмуляторе» под кнопкой. Для систем без встроенного ядра главная кнопка сразу запускает внешний эмулятор.

### Какие системы

| Система | Ядро | Лицензия ядра | BIOS |
|---|---|---|---|
| NES / Famicom / Dendy | FCEUmm | GPL-2.0 | не нужен |
| SNES / Super Famicom | Snes9x | своя, только некоммерческое использование | не нужен |
| Mega Drive / Genesis, Master System, Game Gear | Genesis Plus GX | своя, только некоммерческое использование | не нужен |
| Game Boy / Game Boy Color | Gambatte | GPL-2.0 | не нужен |
| Game Boy Advance | mGBA | MPL-2.0 | необязателен (есть встроенная замена) |
| PC Engine / TurboGrafx-16 (HuCard) | Beetle PCE | GPL-2.0 | не нужен |
| PlayStation | PCSX ReARMed | GPL-2.0 | необязателен (есть встроенная замена HLE) |
| Sega CD / Mega-CD | Genesis Plus GX | своя, только некоммерческое использование | **нужен** (`bios_CD_U/E/J.bin` по региону игры) |
| PC Engine CD / TurboGrafx-CD | Beetle PCE | GPL-2.0 | **нужен** (`syscard3.pce`), образ только CHD |
| Atari 2600 | Stella 2014 | GPL-2.0 | не нужен |

Плеер: [EmulatorJS](https://github.com/EmulatorJS/EmulatorJS) 4.2.3, GPL-3.0. Исходники ядер: репозитории `EmulatorJS/<ядро>` на GitHub.

Для каких консолей теста пока нет: Saturn, Dreamcast, PS2, N64, NDS и всё новее. N64, NDS и PSP тяжёлые и требуют потоков WebAssembly.

### BIOS

BIOS берётся из раздела «Среда → BIOS»: только файлы, проверенные по MD5 (`getVerifiedBiosFiles` в `src/utils/biosScan.ts`). Доступ к папке BIOS запрашивается по клику на «Запуск». Для Sega CD выбирается BIOS под регион игры. Если консоли BIOS обязателен, а проверенного нет, окно запуска объясняет это и ведёт в раздел BIOS. Для PS1 и GBA BIOS необязателен, но если он есть, запуск берёт его.

EmulatorJS 4.2.3 не принимает BIOS как `File`, поэтому `player.js` упаковывает его в zip без сжатия: при распаковке ядро получает файл с правильным именем.

### Откуда берётся файл игры

1. Если библиотека отсканирована в этой сессии, файл уже в памяти приложения.
2. В десктоп-версии (Edge-окно и окно Wails) файл читает локальный Go API: `GET /api/native/fs/rom`. Путь ищется так же, как при запуске внешнего эмулятора. Отдаются только образы игр до 1 ГБ. Для `.cue` отдаётся первый трек, звуковые CD-дорожки при этом не играют.
3. Если файл не найден, окно предлагает выбрать его вручную.

Файл никуда не загружается. Плеер работает в отдельной странице `public/quicktest/player.html`, её CSP запрещает любые сетевые запросы, кроме адреса самого приложения. Проверку обновлений EmulatorJS на `cdn.emulatorjs.org` мы вырезаем при сборке.

Ограничения: многодорожечный BIN/CUE лучше сконвертировать в CHD (Инструменты → Конвертер). В десктоп-версии сохранения (SRAM) и состояния пишутся файлами `.srm` и `.state` рядом с ромом, см. [saves.md](saves.md). Без Go API (браузер) они остаются в IndexedDB профиля и пропадут при его очистке. Настройки плеера хранятся в localStorage.

### Сборка

Ядра не лежат в git. `scripts/fetch-emulatorjs.mjs` скачивает из npm пакеты `@emulatorjs/*@4.2.3`, сверяет sha512 с закреплёнными в скрипте значениями и раскладывает в `public/emulatorjs/` (около 18 МБ). Скрипт запускается сам перед `npm run dev`, `npm run build` и в `npm run release:win`, повторный запуск берёт файлы из `.cache/emulatorjs/`. Вручную: `npm run fetch:emulatorjs`.

Чтобы добавить ядро: дописать пакет и его `dist.integrity` (`npm view @emulatorjs/core-<имя>@4.2.3 dist.integrity`) в скрипт, консоль и расширения в `src/utils/quickTest.ts`, расширения в `aegisapi/quicktest.go`, строку в таблицу выше.

## English

The **Play** button in the game card runs the ROM right inside the AegisROM window with a built-in WebAssembly emulator. It is the main way to launch games for the systems in the table below. The external emulator from the Environment section stays as a fallback: the "In external emulator" link under the button. For systems without a built-in core the main button launches the external emulator directly.

### Supported systems

| System | Core | Core license | BIOS |
|---|---|---|---|
| NES / Famicom / Dendy | FCEUmm | GPL-2.0 | not needed |
| SNES / Super Famicom | Snes9x | own, non-commercial use only | not needed |
| Mega Drive / Genesis, Master System, Game Gear | Genesis Plus GX | own, non-commercial use only | not needed |
| Game Boy / Game Boy Color | Gambatte | GPL-2.0 | not needed |
| Game Boy Advance | mGBA | MPL-2.0 | optional (built-in replacement) |
| PC Engine / TurboGrafx-16 (HuCard) | Beetle PCE | GPL-2.0 | not needed |
| PlayStation | PCSX ReARMed | GPL-2.0 | optional (built-in HLE BIOS) |
| Sega CD / Mega-CD | Genesis Plus GX | own, non-commercial use only | **required** (`bios_CD_U/E/J.bin` by game region) |
| PC Engine CD / TurboGrafx-CD | Beetle PCE | GPL-2.0 | **required** (`syscard3.pce`), CHD images only |
| Atari 2600 | Stella 2014 | GPL-2.0 | not needed |

Player: [EmulatorJS](https://github.com/EmulatorJS/EmulatorJS) 4.2.3, GPL-3.0. Core sources: the `EmulatorJS/<core>` repositories on GitHub.

Not covered yet: Saturn, Dreamcast, PS2, N64, NDS and newer. N64, NDS and PSP are heavy and need WebAssembly threads.

### BIOS

The BIOS comes from Environment → BIOS: only files verified by MD5 (`getVerifiedBiosFiles` in `src/utils/biosScan.ts`). Access to the BIOS folder is requested on the Play click. For Sega CD the BIOS matching the game region is picked. If a console requires a BIOS and no verified one exists, the player window explains it and links to the BIOS section. For PS1 and GBA the BIOS is optional but used when present.

EmulatorJS 4.2.3 does not accept a BIOS as a `File`, so `player.js` wraps it in an uncompressed zip; on extraction the core gets the file under its proper name.

### Where the game file comes from

1. If the library was scanned in this session, the file is already in memory.
2. In the desktop app (Edge window and Wails window) the local Go API reads it: `GET /api/native/fs/rom`. The path is resolved the same way as for an external emulator launch. Only game images up to 1 GB are served. For `.cue` the first track is served; CD audio tracks do not play.
3. If the file is not found, the window asks to pick it manually.

The file is never uploaded. The player runs in a separate page, `public/quicktest/player.html`, whose CSP blocks all network requests except to the app itself. The EmulatorJS update check against `cdn.emulatorjs.org` is stripped at build time.

Limits: convert multi-track BIN/CUE to CHD (Tools → Converter). In the desktop app saves (SRAM) and states are written as `.srm` and `.state` files next to the ROM, see [saves.md](saves.md). Without the Go API (browser) they stay in the profile's IndexedDB and are lost if it is cleared. Player settings live in localStorage.

### Build

The cores are not in git. `scripts/fetch-emulatorjs.mjs` downloads `@emulatorjs/*@4.2.3` from npm, checks sha512 against the values pinned in the script and lays them out in `public/emulatorjs/` (about 18 MB). It runs automatically before `npm run dev`, `npm run build` and in `npm run release:win`; repeated runs use `.cache/emulatorjs/`. Manually: `npm run fetch:emulatorjs`.

To add a core: add the package and its `dist.integrity` (`npm view @emulatorjs/core-<name>@4.2.3 dist.integrity`) to the script, the console and extensions to `src/utils/quickTest.ts`, the extensions to `aegisapi/quicktest.go`, and a row to the table above.
