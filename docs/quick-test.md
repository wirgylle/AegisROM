# Быстрый тест игры в окне / Quick test in a window

[Русский](#русский) · [English](#english)

## Русский

Кнопка **«Быстрый тест»** в карточке игры запускает ром прямо в окне AegisROM встроенным эмулятором на WebAssembly. Задача — за пару секунд проверить язык рома, русификатор или рабочий ли образ. Для полноценной игры по-прежнему нужен внешний эмулятор из раздела «Среда».

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
| Atari 2600 | Stella 2014 | GPL-2.0 | не нужен |

Плеер: [EmulatorJS](https://github.com/EmulatorJS/EmulatorJS) 4.2.3, GPL-3.0. Исходники ядер: репозитории `EmulatorJS/<ядро>` на GitHub.

Для каких консолей теста пока нет: Sega CD, PC Engine CD, Saturn, Dreamcast, PS2, N64, NDS и всё новее. Для Sega CD и PC Engine CD нужен BIOS, их добавим вместе с разделом BIOS. N64, NDS и PSP тяжёлые и требуют потоков WebAssembly.

### Откуда берётся файл игры

1. Если библиотека отсканирована в этой сессии, файл уже в памяти приложения.
2. В десктоп-версии (Edge-окно и окно Wails) файл читает локальный Go API: `GET /api/native/fs/rom`. Путь ищется так же, как при запуске внешнего эмулятора. Отдаются только образы игр до 1 ГБ. Для `.cue` отдаётся первый трек, звуковые CD-дорожки в тесте не играют.
3. Если файл не найден, окно предлагает выбрать его вручную.

Файл никуда не загружается. Плеер работает в отдельной странице `public/quicktest/player.html`, её CSP запрещает любые сетевые запросы, кроме адреса самого приложения. Проверку обновлений EmulatorJS на `cdn.emulatorjs.org` мы вырезаем при сборке.

Ограничения: многодорожечный BIN/CUE лучше сконвертировать в CHD (Инструменты → Конвертер). Сохранения и состояния теста хранятся в браузерном профиле окна и с менеджером сохранений пока не связаны.

### Сборка

Ядра не лежат в git. `scripts/fetch-emulatorjs.mjs` скачивает из npm пакеты `@emulatorjs/*@4.2.3`, сверяет sha512 с закреплёнными в скрипте значениями и раскладывает в `public/emulatorjs/` (около 18 МБ). Скрипт запускается сам перед `npm run dev`, `npm run build` и в `npm run release:win`, повторный запуск берёт файлы из `.cache/emulatorjs/`. Вручную: `npm run fetch:emulatorjs`.

Чтобы добавить ядро: дописать пакет и его `dist.integrity` (`npm view @emulatorjs/core-<имя>@4.2.3 dist.integrity`) в скрипт, консоль и расширения в `src/utils/quickTest.ts`, расширения в `aegisapi/quicktest.go`, строку в таблицу выше.

## English

The **Quick test** button in the game card runs the ROM right inside the AegisROM window with a built-in WebAssembly emulator. It is meant for a quick check of the ROM language, a translation patch, or whether the image works at all. For real play use an external emulator from the Environment section.

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
| Atari 2600 | Stella 2014 | GPL-2.0 | not needed |

Player: [EmulatorJS](https://github.com/EmulatorJS/EmulatorJS) 4.2.3, GPL-3.0. Core sources: the `EmulatorJS/<core>` repositories on GitHub.

Not covered yet: Sega CD, PC Engine CD, Saturn, Dreamcast, PS2, N64, NDS and newer. Sega CD and PC Engine CD need a BIOS and will come with the BIOS section. N64, NDS and PSP are heavy and need WebAssembly threads.

### Where the game file comes from

1. If the library was scanned in this session, the file is already in memory.
2. In the desktop app (Edge window and Wails window) the local Go API reads it: `GET /api/native/fs/rom`. The path is resolved the same way as for an external emulator launch. Only game images up to 1 GB are served. For `.cue` the first track is served; CD audio tracks do not play in the test.
3. If the file is not found, the window asks to pick it manually.

The file is never uploaded. The player runs in a separate page, `public/quicktest/player.html`, whose CSP blocks all network requests except to the app itself. The EmulatorJS update check against `cdn.emulatorjs.org` is stripped at build time.

Limits: convert multi-track BIN/CUE to CHD (Tools → Converter). Test saves and states live in the window's browser profile and are not linked to the save manager yet.

### Build

The cores are not in git. `scripts/fetch-emulatorjs.mjs` downloads `@emulatorjs/*@4.2.3` from npm, checks sha512 against the values pinned in the script and lays them out in `public/emulatorjs/` (about 18 MB). It runs automatically before `npm run dev`, `npm run build` and in `npm run release:win`; repeated runs use `.cache/emulatorjs/`. Manually: `npm run fetch:emulatorjs`.

To add a core: add the package and its `dist.integrity` (`npm view @emulatorjs/core-<name>@4.2.3 dist.integrity`) to the script, the console and extensions to `src/utils/quickTest.ts`, the extensions to `aegisapi/quicktest.go`, and a row to the table above.
