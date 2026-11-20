# Сохранения рядом с ромом / Saves next to the ROM

[Русский](#русский) · [English](#english)

## Русский

Первый шаг менеджера сохранений (0.6.0, план — [plan-0.6.0.md](plan-0.6.0.md)). Работает в десктоп-версии (окно Edge и окно Wails): там есть локальный Go API, который знает, где лежит ром.

### Что происходит
- При «Запуске» игры в окне программа ищет рядом с ромом файл `<имя рома>.srm` и загружает его в эмулятор. Игра перезапускается один раз, чтобы увидеть сохранение с самого начала.
- Пока игра идёт, SRAM (сохранения самой игры, у PS1 — карта памяти) пишется в `<имя рома>.srm` каждые 30 секунд и при закрытии окна запуска. Если содержимое не изменилось, файл не трогается.
- Кнопки плеера «Сохранить состояние» и «Загрузить состояние» работают с файлом `<имя рома>.state` рядом с ромом. «Экспорт файла сохранения» тоже пишет `.srm` на диск.
- Перед перезаписью прежний файл копируется в `<папка рома>/.aegis-saves/<имя рома>/<дата-время>.srm` (или `.state`). Хранятся 10 последних версий каждого вида.

Пример:

```text
snes/
├── Chrono Trigger (USA).sfc
├── Chrono Trigger (USA).srm
├── Chrono Trigger (USA).state
└── .aegis-saves/
    └── Chrono Trigger (USA)/
        ├── 20261120-131830.srm
        └── 20261120-125512.srm
```

Имена такие же, как у RetroArch, когда он хранит сохранения в папке игры. Для образов `.cue` сохранение называется по `.cue`.

### Совместимость
- `.srm` — тот же формат, что у RetroArch с тем же ядром: его можно унести на приставку.
- `.state` — снимок ядра EmulatorJS (это ядра libretro). RetroArch откроет его только с той же версией ядра, поэтому переносить состояния на приставку не обещаем.

### Без десктоп-версии
В браузере без Go API сохранения остаются в профиле браузера, как раньше (подпись внизу окна запуска об этом говорит).

### Для разработчиков
- Go: `aegisapi/saves.go` — `GET/PUT /api/native/saves?kind=srm|state&<поля рома>`, `GET /api/native/saves/list`. Поля рома те же, что у `/api/native/fs/rom`. Размер до 64 МБ. Тесты: `go test ./aegisapi/`.
- Плеер: `public/quicktest/player.js` (сообщения `aegis-qt-save`, `aegis-qt-need-state`, `aegis-qt-state`, `aegis-qt-flush`).
- Окно: `src/components/QuickTestModal.tsx`, утилиты `src/utils/romSaves.ts`.

## English

First step of the save manager (0.6.0, plan: [plan-0.6.0.md](plan-0.6.0.md)). Works in the desktop app (Edge window and Wails window), where the local Go API knows where the ROM lives.

### What happens
- When you press Play, the app looks for `<rom name>.srm` next to the ROM and loads it into the emulator. The game resets once so it sees the save from boot.
- While playing, SRAM (the game's own saves; for PS1 the memory card) is written to `<rom name>.srm` every 30 seconds and when you close the Play window. Unchanged content is not rewritten.
- The player's Save State and Load State buttons use `<rom name>.state` next to the ROM. Export Save File also writes `.srm` to disk.
- Before an overwrite the previous file is copied to `<rom folder>/.aegis-saves/<rom name>/<date-time>.srm` (or `.state`). The 10 newest versions of each kind are kept.

Names match RetroArch when it keeps saves in the content folder. For `.cue` images the save is named after the `.cue`.

### Compatibility
- `.srm` has the same format as RetroArch with the same core, so it can go to a handheld.
- `.state` is an EmulatorJS core snapshot (libretro cores). RetroArch opens it only with the same core version, so we do not promise moving states to a handheld.

### Without the desktop app
In a browser without the Go API, saves stay in the browser profile as before (the note at the bottom of the Play window says so).

### For developers
- Go: `aegisapi/saves.go` — `GET/PUT /api/native/saves?kind=srm|state&<rom fields>`, `GET /api/native/saves/list`. ROM fields are the same as for `/api/native/fs/rom`. Up to 64 MB. Tests: `go test ./aegisapi/`.
- Player: `public/quicktest/player.js` (messages `aegis-qt-save`, `aegis-qt-need-state`, `aegis-qt-state`, `aegis-qt-flush`).
- Window: `src/components/QuickTestModal.tsx`, helpers `src/utils/romSaves.ts`.
