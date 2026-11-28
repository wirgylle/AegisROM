# Починка флешки / SD card repair

Инструменты → Флешка / Папка → «Ремонт флешки под разные приставки».
Tools → Flash Drive / Folder → "Multi-Console Flash Drive Repair".

## RU

### Что делает

1. Вы выбираете папку флешки (корень раздела, см. таблицу) и прошивку.
2. Кнопка «Проверить флешку и показать, что восстановить» строит план:
   - **Будет создано**: системные папки, которых нет. По умолчанию включены.
   - **Папки консолей**: недостающие папки систем. По умолчанию выключены (прошивка скрывает пустые системы, а лишние папки вы могли удалить сами).
   - **Нужно ваше внимание**: части прошивки с содержимым, которых нет (их не создаём, даём ссылку), и пустая папка тем.
   - **Старые шаги** (по умолчанию выключены): вынуть ромы из служебных папок `organized`, `1_8bit`… и удалить эти папки; удалить мусор Windows. Это единственные шаги с удалением, и они работают только по галочке.
3. «Создать папок: N» создаёт только недостающие папки. Существующие файлы и папки не трогаются. Если на месте папки лежит файл с тем же именем, пункт пропускается.
4. Без выбранной папки план не проверяется, но можно скачать `.cmd` для Windows, который делает то же самое (`if not exist … mkdir …`). В `.cmd` больше нет `chkdsk` и `del`.

Имена сравниваются без учёта регистра (FAT/exFAT его не различают): `BIOS` засчитывается как `bios`.

Очистка «фантомных» папок теперь никогда не предлагает удалить системные папки любой прошивки из этих профилей (`themes`, `tools`, `.tmp_update`, `MUOS`, `theme-customizations` и т.д.).

### Почему это важно (пример dArkOS)

dArkOS при сборке образа делает `/etc/emulationstation/themes` ссылкой на `/roms/themes`, а `/roms/tools` монтирует как `/opt/system/Tools` (меню Options → Tools). Туда же кладётся ThemeMaster, через который качаются темы. Если папки `themes` нет или она пустая, пропадают все темы; если нет `tools`, пропадает всё меню Tools вместе с ThemeMaster и PortMaster. Источник: [finishing_touches.sh](https://github.com/christianhaitian/dArkOS/blob/master/finishing_touches.sh).

### Профили

Код: `src/utils/sdLayout.ts`, тесты: `src/utils/sdLayout.test.ts`, тексты: `src/i18n/sdRepairStrings.ts`, окно: `src/components/SdRepairPlanModal.tsx`.

| Прошивка | Корень | Системные папки | Проверка частей прошивки | Папки консолей | Источник |
|---|---|---|---|---|---|
| ArkOS | EASYROMS | `bios`, `tools`, `themes`, `bgmusic`, `launchimages`, `backup` | пустые `themes` | 120 «Rom Folder» из вики | [FAQ](https://github.com/christianhaitian/arkos/wiki/Frequently-Asked-Questions---RG351MP), [Emulators and Ports](https://github.com/christianhaitian/arkos/wiki/ArkOS-Emulators-and-Ports-information) |
| dArkOS | EASYROMS | как ArkOS + `shutdownimages` | `tools/ThemeMaster.sh`, `tools/ThemeMaster`, пустые `themes` | `game_systems.txt` | [finishing_touches.sh](https://github.com/christianhaitian/dArkOS/blob/master/finishing_touches.sh), [game_systems.txt](https://github.com/christianhaitian/dArkOS/blob/master/game_systems.txt) |
| muOS | ROMS на SD1 | `MUOS/bios`, `ROMS` | — | — | [addcontent](https://muos.dev/help/addcontent) |
| KNULLI | SHARE | `roms`, `bios`, `saves`, `screenshots`, `themes`, `theme-customizations`, `music`, `cheats`, `decorations`, `system` | — | — | [Game storage](https://knulli.org/play/add-games/game-storage/) |
| Batocera | SHARE | `roms`, `bios`, `saves`, `screenshots`, `themes`, `music`, `splash`, `system` | `system/batocera.conf` | — | [notable files](https://wiki.batocera.org/notable_files), [storage manager](https://wiki.batocera.org/storage_manager) |
| ROCKNIX | карта с играми | `roms`, `roms/bios`, `roms/music` | — | — | [Add games](https://rocknix.org/play/add-games/), [FAQ](https://rocknix.org/faqs/) |
| AmberELEC | раздел с играми | `roms`, `roms/update` | — | — | [Transferring files](https://amberelec.org/guides/transferring-files) |
| EmuELEC | storage | `roms`, `roms/ports`, `roms/BGM` | — | — | [FAQ](https://github.com/EmuELEC/EmuELEC/wiki/Common-Questions---FAQ) |
| Onion OS | корень SD | `BIOS`, `Roms`, `Saves/CurrentProfile/saves`, `Saves/CurrentProfile/states`, `Themes` | `.tmp_update`, `RetroArch` | — | [Fresh install](https://onionui.github.io/docs/installation/fresh), [FAQ](https://onionui.github.io/docs/faq) |
| spruceOS | корень SD | `BIOS`, `Roms`, `Themes` | `.tmp_update`, пустые `Themes` | 14 папок из таблицы ROM FOLDER CHART | [wiki](https://github.com/spruceUI/spruceOS/wiki/11.-Adding-Games) |
| CrossMix OS | корень SD | `BIOS`, `Roms`, `Imgs` | — | `PSP`, `PANASONIC`, `PICO` | [Installation](https://github.com/cizia64/CrossMix-OS/wiki/Installation) |
| MinUI | корень SD | `Bios`, `Roms`, `Saves`, `Bios/FC`, `Bios/GB`, `Bios/GBA`, `Bios/GBC`, `Bios/MD`, `Bios/PS` | — | — | [README.txt](https://github.com/shauninman/MinUI/blob/main/skeleton/BASE/README.txt) |

### Скачивание тем

В плане есть кнопка «Скачать темы» (и в предупреждении о пустой папке тем). Она есть только у прошивок с подтверждённым источником:

| Прошивка | Каталог | Что качается | Куда | Источник |
|---|---|---|---|---|
| ArkOS, dArkOS | [Emulationstation OGA Theme Gallery](https://github.com/Jetup13/Emulationstation-OGA-Theme-Gallery): тот же README, что читает ThemeMaster на устройстве | архив репозитория автора темы (`codeload.github.com/<автор>/<репо>/zip/HEAD`) | `themes/<репо>/` | ThemeMaster (`UpdateGalleryDB`), галерея |
| Onion OS | [OnionUI/Themes](https://github.com/OnionUI/Themes), раздел Originals (постранично) | готовый zip из `release/` | `Themes/` как в архиве («Extract the downloaded theme to the Themes folder») | README OnionUI/Themes |

- Галерея OGA отмечает, на каком экране тема проверена. По умолчанию фильтр 640x480 (R36S): сначала «работает», потом «не проверена», «нет» скрыто.
- Каталог и архивы качает Go (`/api/themes/catalog`, `/api/themes/download`, `aegisapi/themes.go`): у архивов GitHub нет CORS. Адреса строго ограничены: два каталога, `codeload.github.com/<a>/<b>/zip/HEAD` и `raw.githubusercontent.com/OnionUI/Themes/main/release/*.zip`.
- Распаковка в окне (`src/utils/themeCatalog.ts`). Тема ставится только в новые папки: если хоть одна папка темы уже есть (без учёта регистра), ничего не пишется. Пак Onion из нескольких тем ставится каждой темой в свою папку. Пути с `..` и абсолютные пропускаются.
- Превью грузятся напрямую с raw.githubusercontent.com / user-images.githubusercontent.com.
- Лицензии: AegisROM темы не хранит и не распространяет, а качает с репозиториев авторов, как ThemeMaster. Условия у каждой темы свои (ссылка на страницу темы в карточке).
- Не включено: KNULLI и Batocera (у них свой загрузчик тем на устройстве, источник списка не проверял), muOS (путь установки тем в доках не сходится), spruceOS, CrossMix, ROCKNIX и EmuELEC (темы не на разделе с играми).
- Проверка: каталог OGA и Onion загружаются, тема Onion (пак из 3 тем) скачана и распакована в OPFS-папку. Скачивание тем OGA проверено юнит-тестом и запросом к codeload (200, zip); в моём контейнере codeload закрыт прокси, поэтому полный прогон в окне для OGA не делал.

### Что не подтвердилось и не включено

- **Файлы с шаблонным содержимым.** Ни для одной прошивки не нашлось файла, содержимое которого известно и не зависит от версии. Поэтому файлы не создаются, только проверяются (ThemeMaster, `batocera.conf`) со ссылкой, где их взять.
- **ArkOS:** папки `saves` и `savestates` (были в старом профиле). По FAQ сохранения лежат рядом с ромом (`/roms/gba`). Убраны. `themes` для старого ArkOS взят по dArkOS (его продолжение) и словам пользователя: в вики ArkOS это место прямо не описано.
- **muOS:** `MUOS/save/file`, `MUOS/save/state`, `MUOS/info/catalogue`, `MUOS/theme` есть только в черновике страницы структуры 2024 года, а страница тем называет другой путь. Не включены. Список папок консолей muOS не документирован.
- **KNULLI, Batocera, ROCKNIX, AmberELEC, EmuELEC:** имена папок систем в доках не перечислены полностью; прошивки создают их сами. Не включены.
- **ROCKNIX, EmuELEC:** темы лежат в `/storage/.emulationstation/themes`, это не раздел с играми. Не проверяются.
- **ROCKNIX:** путь `~/roms/rocknix/theme-customizations/…` не уточнён (что такое `~`). Не включён.
- **AmberELEC, EmuELEC:** путь BIOS в прочитанных страницах не подтверждён. Не включён.
- **CrossMix:** папки `Data`, `Best` упомянуты без объяснения. Остальные имена папок консолей не подтверждены (были в старом профиле: `FC`, `SFC`, `GB`…). Убраны.
- **Onion:** папки консолей и `Imgs` в прочитанных страницах не перечислены. Не включены.
- **GarlicOS, RetroDeck** упоминались в README, но профилей у них не было и нет.

### Скриншоты

`npm run dev:api` (после `vite build`), затем `AEGIS_URL=http://127.0.0.1:38471/ node scripts/sd-repair-screenshots.cjs docs/screenshots ru` (и `en`). Для каталога тем нужен Go API и интернет. Флешку изображает папка OPFS с частью раскладки dArkOS.

## EN

### What it does

1. Pick the card folder (the partition root, see the table) and the firmware.
2. "Check the card and show what to restore" builds a plan:
   - **Will be created**: missing system folders, on by default.
   - **Console folders**: missing system folders for consoles, off by default.
   - **Needs your attention**: missing firmware parts that have real content (never created, a link is shown) and an empty themes folder.
   - **Old repair steps**, off by default: move ROMs out of `organized`, `1_8bit`… and remove those folders; remove Windows junk. These are the only steps that delete anything, and only when ticked.
3. "Create N folders" creates only missing folders. Existing files and folders are left alone; if a file with the same name is in the way, the item is skipped.
4. With no folder selected nothing is checked, but a Windows `.cmd` with the same `mkdir` steps can be downloaded. The `.cmd` no longer runs `chkdsk` or `del`.

Names are compared case-insensitively (FAT/exFAT ignore case). The phantom-folder cleanup never offers to delete a system folder of any firmware from these profiles.

### Theme downloads

The plan has a "Download themes" button for firmwares with a confirmed source: ArkOS/dArkOS use the Emulationstation OGA Theme Gallery (the README ThemeMaster reads; a theme is the author's repository archive, installed into `themes/<repo>/`, filtered by screen, 640x480 for R36S by default); Onion uses the official OnionUI/Themes repository (packaged zips extracted into `Themes/` as is, a pack installs each theme in its own folder). Go fetches the catalogs and archives from a strict URL list (`aegisapi/themes.go`); unpacking happens in the window (`src/utils/themeCatalog.ts`). A theme goes only into new folders: if any of its folders exists, nothing is written. AegisROM does not host themes; each theme keeps its author's terms.

### Profiles

See the table above. Everything listed is backed by the linked official docs or firmware sources. Unconfirmed paths are listed in the section above and are left out on purpose. No template files are written: no firmware documents a file whose content is fixed and version-independent.
