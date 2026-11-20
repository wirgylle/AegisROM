# План 0.6.0 / 0.6.0 plan

[Русский](#русский) · [English](#english)

## Русский

Цель 0.6.0: сохранения игр живут файлами и не теряются при переименовании, а сборка заливается на приставку по Wi-Fi. Общий роудмап: [ROADMAP.md](ROADMAP.md).

### Перед стартом
- Довести хвосты 0.5.x (режим «Редактор» с ручной правкой, «Серии» отдельно от «Коллекций», переименование FFVIII), выпустить их релизом и перевести `dev` на `0.6.0-dev`. Это отдельные задачи, план 0.6.0 от них не зависит.

### Задачи по порядку

| # | Задача | Зависит от | Статус |
|---|---|---|---|
| 1 | **Сохранения, шаг 1.** Встроенный «Запуск» пишет `.srm` и `.state` рядом с ромом, прошлые версии в `.aegis-saves/`. См. [saves.md](saves.md). | — | этот PR |
| 2 | **Кнопка «Угостить разработчика кофе»** в шапке и раздел в README. Адрес — константа `SUPPORT_URL` в `src/version.ts`, пока пустая (кнопка скрыта). | URL от Valentin | этот PR |
| 3 | **Сохранения, шаг 2.** При переименовании рома, 1G1R и замене версии (JP → RU) сохранения переименовываются вместе с ромом, перед этим копия в историю. | 1 | — |
| 4 | **Сохранения, шаг 3.** Блок «Сохранения» в карточке игры: текущие файлы, история, восстановить, экспорт и импорт. Скан находит `.srm/.sav/.state` и карты памяти (`.mcr/.mcd`, PS2 `.ps2`) в библиотеке и папках эмуляторов из «Среды». | 1 | — |
| 5 | **Wi-Fi, шаг 1: SFTP.** Профили устройств (R36S/ArkOS, Anbernic/muOS и Knulli, TrimUI, Steam Deck): адрес, логин, папка ромов по прошивке. Заливка сборки по разнице размера и времени, докачка, прогресс. | — | — |
| 6 | **Wi-Fi, шаг 2: SMB и WebDAV** (Batocera/Knulli, Miyoo с Onion и другие прошивки без SSH). | 5 | — |
| 7 | **Сохранения со сборкой.** При выгрузке сборки сохранения едут на устройство, при следующей выгрузке забираются обратно; конфликт решается по времени с копией обеих версий. | 3, 5 | — |
| 8 | Скриншоты, README EN/RU, релиз 0.6.0. | все | — |

**Параллельно можно:** 3 и 5 (разные части кода: переименование во фронте и новый Go-пакет для передачи). 4 — параллельно с 5 и 6. 7 — только после 3 и 5.

### Риски
- **Сохранения только в десктопе.** Запись на диск идёт через локальный Go API. В браузерной версии без него сохранения остаются в профиле браузера, как раньше.
- **Переименование живёт в двух местах** (TS во фронте и Go в `aegiscore`). Шаг 3 надо делать в обоих, иначе часть путей потеряет сохранения.
- **Совместимость состояний.** `.srm` у EmulatorJS и RetroArch одинаковый. `.state` — снимок того же ядра libretro, RetroArch на приставке откроет его только с той же версией ядра. Гарантировать это нельзя, поэтому в README обещаем только `.srm`.
- **Потеря до 30 секунд.** SRAM пишется каждые 30 с и при закрытии окна запуска. Если программа упадёт, последние секунды пропадут.
- **Пароли устройств.** Хранить их нельзя в открытом виде в настройках. Нужна связка ключей ОС (Windows Credential Manager, macOS Keychain) или вход по SSH-ключу.
- **Разные прошивки — разные пути.** Профили устройств нужно проверить на реальных приставках, у нас их нет. Нужна помощь Valentin с тестом на R36S.
- **Не проверено на Windows.** Шаг 1 проверен в Chromium (Playwright) на тестовом NES-роме, в окне Edge и Wails под Windows — нет.

## English

Goal of 0.6.0: game saves live as files and survive renames, and a build can be pushed to a handheld over Wi-Fi. Overall roadmap: [ROADMAP.md](ROADMAP.md).

### Before we start
- Finish the 0.5.x leftovers (Editor view with manual editing, Series apart from Collections, the FFVIII rename), release them and move `dev` to `0.6.0-dev`. Separate tasks; this plan does not depend on them.

### Tasks in order

| # | Task | Depends on | Status |
|---|---|---|---|
| 1 | **Saves, step 1.** The built-in Play writes `.srm` and `.state` next to the ROM, older versions go to `.aegis-saves/`. See [saves.md](saves.md). | — | this PR |
| 2 | **"Buy the developer a coffee" button** in the header and a README section. The URL is `SUPPORT_URL` in `src/version.ts`, empty for now (button hidden). | URL from Valentin | this PR |
| 3 | **Saves, step 2.** Renaming a ROM, 1G1R and replacing a version (JP → RU) rename its saves too, with a copy into history first. | 1 | — |
| 4 | **Saves, step 3.** A Saves block in the game card: current files, history, restore, export and import. The scan finds `.srm/.sav/.state` and memory cards (`.mcr/.mcd`, PS2 `.ps2`) in the library and in emulator folders from Environment. | 1 | — |
| 5 | **Wi-Fi, step 1: SFTP.** Device profiles (R36S/ArkOS, Anbernic/muOS and Knulli, TrimUI, Steam Deck): address, login, ROM folder per firmware. Upload a build by size/time difference, resume, progress. | — | — |
| 6 | **Wi-Fi, step 2: SMB and WebDAV** (Batocera/Knulli, Miyoo with Onion and other firmwares without SSH). | 5 | — |
| 7 | **Saves with builds.** Saves travel to the device with the build and come back on the next upload; conflicts are resolved by time, keeping both versions. | 3, 5 | — |
| 8 | Screenshots, README EN/RU, 0.6.0 release. | all | — |

**In parallel:** 3 and 5 (different code: frontend renaming vs a new Go transfer package). 4 alongside 5 and 6. 7 only after 3 and 5.

### Risks
- **Saves on disk need the desktop app.** Writes go through the local Go API; the browser version keeps saves in the browser profile as before.
- **Renaming lives in two places** (TS frontend and Go `aegiscore`). Step 3 must cover both or some paths lose saves.
- **State compatibility.** `.srm` is the same in EmulatorJS and RetroArch. `.state` is a snapshot of the same libretro core; RetroArch on a handheld opens it only with the same core version. We cannot guarantee that, so README promises `.srm` only.
- **Up to 30 seconds lost.** SRAM is written every 30 s and when the Play window closes; a crash loses the last seconds.
- **Device passwords** must not sit in plain settings: OS keychain (Windows Credential Manager, macOS Keychain) or SSH keys.
- **Firmwares differ in paths.** Device profiles need testing on real handhelds, which we do not have; Valentin's R36S is the first test device.
- **Not checked on Windows.** Step 1 was tested in Chromium (Playwright) on a test NES ROM, not in the Edge or Wails window on Windows.
