# Названия по хешу: DAT No-Intro и Redump / Titles by hash: No-Intro and Redump DATs

[Русский](#русский) · [English](#english)

## Русский

AegisROM находит настоящее название игры по хешу файла в DAT-файлах. Это надёжнее поиска по имени: ром `000123.nes` с правильным CRC32 получит имя `Super Mario Bros. (World)`, даже если имя файла ничего не говорит.

### Где взять DAT

Проще всего: «Инструменты» → «DAT-файлы» → **«Скачать DAT для моих консолей»**. AegisROM сам скачает DAT No-Intro (картриджи) и Redump (диски) из [libretro-database](https://github.com/libretro/libretro-database/tree/master/metadat) для консолей, которые есть в библиотеке. «Онлайн-переименование» делает то же самое автоматически, если для какой-то консоли DAT нет. Повторно уже скачанные DAT не качаются.

Вручную:

| Что | Где | Формат |
|---|---|---|
| Картриджи (NES, SNES, GB/GBA, Mega Drive, N64…) | [datomatic.no-intro.org](https://datomatic.no-intro.org) → Download → Standard DAT | `.dat` (Logiqx XML) или `.zip` |
| Диски (PS1, PS2, PSP, Sega CD, Saturn, Dreamcast…) | [redump.org/downloads](http://redump.org/downloads/) → Datfile | `.zip` с `.dat` |
| Готовый набор с серийниками | [libretro-database/metadat](https://github.com/libretro/libretro-database/tree/master/metadat) (`no-intro/`, `redump/`) | clrmamepro `.dat` |

Для NES берите DAT No-Intro любой версии (Headered или Headerless): AegisROM считает хеш и с заголовком iNES, и без него. То же для SNES с копирным заголовком 512 байт, FDS, Lynx и Atari 7800.

### Как добавить

«Инструменты» → блок «DAT-файлы» → «Добавить DAT». Можно выбрать несколько файлов сразу, `.dat`, `.xml` или `.zip`. Файлы копируются в папку `dats/` рядом с базой программы, путь виден в том же блоке. Можно положить файлы в эту папку вручную (в том числе в подпапки) и нажать «Перечитать».

### Как работает

0. Если для консоли нет DAT, он скачивается из libretro-database.
1. «Онлайн-переименование» сначала считает хеш каждого рома и ищет его во всех загруженных DAT.
2. Порядок сверки: SHA1 → MD5 → CRC32 + размер → CRC32 без заголовка → серийник диска.
3. Если совпадений несколько, выигрывает DAT той же системы.
4. Что не нашлось в DAT, ищется по названию в индексе Libretro. Нечитаемые названия (номер вместо имени, «кракозябры» от неверной кодировки) по имени не ищутся: нечёткий поиск по ним давал чужую игру. Такие ромы опознаются только по хешу.
4a. Не нашлось нигде — имя файла остаётся как есть, причина видна в карточке.
5. В карточке игры в поле «Источник названия» видно «DAT No-Intro (по хешу)» или «DAT Redump (по хешу)». Если не нашлось, там же причина.

### Что и как хешируется

| Файл | Как сверяется |
|---|---|
| Картридж до 64 МБ | CRC32 + SHA1 всего файла, плюс CRC32 без заголовка |
| `.zip` с ромом | CRC32 и размер самого большого файла из оглавления архива, без распаковки |
| `.cue` / `.gdi` + `.bin` | CRC32 первого трека (`Track 1`), плюс серийник из `SYSTEM.CNF` |
| `.iso` / `.bin` до 1 ГБ | CRC32 всего файла и серийник |
| `.iso` больше 1 ГБ (PS2 DVD) | только серийник из `SYSTEM.CNF` |
| `.pbp` | серийник `DISC_ID` из `PARAM.SFO` |
| `.chd`, `.cso`, `.rvz`, `.7z` | не сверяются: файл сжат, его хеш не совпадает с хешами Redump |

Сверка по серийнику работает, только если в DAT есть серийники. В DAT с redump.org их может не быть, в DAT libretro-database они есть.

Хеш считается локально, файлы никуда не отправляются. Большие образы читаются целиком, поэтому первая сверка дисков идёт заметно дольше картриджей.

## English

AegisROM finds a game's real title by the file hash in DAT files. This is more reliable than a name search: a ROM called `000123.nes` with the right CRC32 becomes `Super Mario Bros. (World)` no matter what the file is called.

### Where to get DATs

Easiest: Tools → "DAT files" → **"Download DATs for my consoles"**. AegisROM downloads No-Intro (cartridge) and Redump (disc) DATs from [libretro-database](https://github.com/libretro/libretro-database/tree/master/metadat) for the consoles in your library. "Online rename" does the same automatically when a console has no DAT. DATs already downloaded are not fetched again.

By hand:

| What | Where | Format |
|---|---|---|
| Cartridges (NES, SNES, GB/GBA, Mega Drive, N64…) | [datomatic.no-intro.org](https://datomatic.no-intro.org) → Download → Standard DAT | `.dat` (Logiqx XML) or `.zip` |
| Discs (PS1, PS2, PSP, Sega CD, Saturn, Dreamcast…) | [redump.org/downloads](http://redump.org/downloads/) → Datfile | `.zip` with a `.dat` |
| Ready set with serials | [libretro-database/metadat](https://github.com/libretro/libretro-database/tree/master/metadat) (`no-intro/`, `redump/`) | clrmamepro `.dat` |

For NES either No-Intro variant works (Headered or Headerless): AegisROM hashes the file both with and without the iNES header. Same for SNES with a 512-byte copier header, FDS, Lynx and Atari 7800.

### How to add

Tools → "DAT files" block → "Add DAT". You can pick several `.dat`, `.xml` or `.zip` files at once. They are copied into the `dats/` folder next to the app database; the path is shown in the same block. You can also drop files into that folder by hand (subfolders work too) and press "Reload".

### How it works

0. When a console has no DAT, it is downloaded from libretro-database.
1. "Online rename" first hashes every ROM and looks it up in all loaded DATs.
2. Match order: SHA1 → MD5 → CRC32 + size → headerless CRC32 → disc serial.
3. When several entries match, the DAT for the same system wins.
4. Whatever is not in the DATs is searched by name in the Libretro index. Unreadable titles (a number instead of a name, garbled text from a wrong encoding) are not searched by name: a fuzzy search on them returned a wrong game. Such ROMs are identified by hash only.
4a. Nothing found anywhere — the file name stays as is, and the reason is shown in the game card.
5. The game card's "Title source" shows "No-Intro DAT (hash match)" or "Redump DAT (hash match)". When nothing matched, the reason is shown there.

### What gets hashed

| File | How it is matched |
|---|---|
| Cartridge up to 64 MB | CRC32 + SHA1 of the whole file, plus headerless CRC32 |
| `.zip` with a ROM | CRC32 and size of the largest file from the archive directory, no unpacking |
| `.cue` / `.gdi` + `.bin` | CRC32 of the first track (`Track 1`), plus the serial from `SYSTEM.CNF` |
| `.iso` / `.bin` up to 1 GB | CRC32 of the whole file and the serial |
| `.iso` over 1 GB (PS2 DVD) | serial from `SYSTEM.CNF` only |
| `.pbp` | `DISC_ID` serial from `PARAM.SFO` |
| `.chd`, `.cso`, `.rvz`, `.7z` | not matched: the file is compressed, so its hash differs from Redump's |

Serial matching only works when the DAT has serials. redump.org DATs may not include them; libretro-database DATs do.

Hashing is local, no files leave the computer. Large images are read in full, so the first disc check takes noticeably longer than cartridges.

### API

| Route | Purpose |
|---|---|
| `GET /api/dat/status` | loaded DATs and the folder path |
| `POST /api/dat/reload` | reread the folder |
| `POST /api/dat/import?name=<file>` | store a DAT/ZIP from the request body (validated first) and reload |
| `POST /api/dat/fetch-libretro` | `{"systems":["Sony - PlayStation"],"force":false}` → download DATs from libretro-database (allow-list of systems, validated before storing) and reload; `{fetched, skipped, failed, status}` |
| `POST /api/dat/lookup` | `{"items":[{id, system, size, crc32, headerlessCrc32, headerlessSize, sha1, md5, serial}]}` → `{"results":[{id, matched, name, source, datName, matchedBy, reason}]}` |

Code: `aegiscore/dat` (parser and index), `aegisapi/dat.go` (routes), `aegisapi/dat_libretro.go` (libretro-database download), `src/utils/datHashLookup.ts` (hashing in the browser), `src/components/DatFilesPanel.tsx`.
