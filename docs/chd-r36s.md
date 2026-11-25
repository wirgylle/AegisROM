# CHD для R36S и проверка ромов / CHD for R36S and the ROM check

## RU

### Почему CHD из конвертера не открывались на R36S

1. **ISO с секторами по 2048 байт (PS1).** `chdman createcd` пишет такой образ как дорожку `MODE1` без сырых секторов.
   PCSX ReARMed, основное ядро PS1 на R36S (ArkOS/dArkOS), читает из CHD сырые кадры по 2352 байта
   (`libpcsxcore/cdriso.c`, `cdread_chd`) и такой диск не запускает. DuckStation на ПК такой CHD читает, поэтому на компьютере всё работало.
   Подтверждено по исходникам PCSX ReARMed и по `chdman info`; на самом R36S не проверялось.
2. **.bin без .cue, .img, .ccd, .mdf.** chdman понимает только `.cue`, `.gdi`, `.toc`, `.nrg`, `.iso`. Остальное он читает
   как текстовый `.toc`, находит 0 дорожек и бесконечно крутит `Compressing, -nan%`. Воспроизведено на chdman 0.264.
   В сборке это выглядело как зависание до таймаута.

Причина именно у многодисковых игр (Final Fantasy VII, Digimon World 3) отдельно не найдена: код многодисковой выгрузки
(папка, `(Disc N).chd`, `.m3u`) выглядит правильно. Если исходники этих игр были ISO 2048 или .bin без .cue, это те же причины.
Чтобы узнать точно, прогоните «Проверку ромов» по готовым CHD: она покажет тип дорожки 1.

### Что изменено

- `aegiscore.PrepareCDInput` готовит вход для chdman: `.cue` проверяется (нет трека — понятная ошибка, пути и регистр
  исправляются), `.bin/.img/.iso` получают `.cue`, `.ccd` → `.img`, `.mds` → `.mdf`, 2448 → 2352, а ISO 2048 для PS1
  перестраивается в MODE2/2352 (Form 1, с EDC/ECC).
- Кодеки закреплены: `-c cdlz,cdzl,cdfl` (без Zstandard, который могут не знать старые ядра; это мера предосторожности).
- Готовый CHD читается обратно (`aegiscore.InspectCHD`): пустой или негодный для PS1 CHD — ошибка, а не «готово».
- Замечания конвертера приходят в заголовке `X-Converter-Notes` и пишутся в журнал.
- `POST /api/native/converter/verify` (path, console, deep=1): заголовок и дорожки CHD, `chdman verify`.

ISO 2048 у PS1 сам по себе с потерями: XA-звук и видео (Form 2) в нём не сохранились. Если игра их использует, нужен исходный `.bin/.cue`.

### Проверка ромов (Инструменты)

Файлы на месте и читаются; `.cue/.gdi/.ccd/.mds/.m3u` ссылаются на существующие файлы; размеры кратны секторам;
ZIP/7z/RAR не обрезаны; заголовки NES/GB/GBA/NDS/MD/N64; CHD: обрезан ли, версия, родитель, Zstandard, CD/DVD,
тип дорожки для PS1; многодисковые: каждый диск и нумерация; BIOS по последней проверке раздела Среда → BIOS.
Опция «Полная проверка CHD» запускает `chdman verify` (только окно приложения). Отчёт можно сохранить в `.txt`.

## EN

### Why converted CHDs did not open on the R36S

1. **2048-byte-sector ISO (PS1).** `chdman createcd` stores it as a `MODE1` track without raw sectors. PCSX ReARMed, the main
   PS1 core on R36S (ArkOS/dArkOS), reads raw 2352-byte frames from a CHD (`libpcsxcore/cdriso.c`, `cdread_chd`) and cannot
   boot it. DuckStation on PC reads it, which is why it worked on the computer. Confirmed from the PCSX ReARMed source and
   `chdman info`; not tested on an R36S itself.
2. **.bin without .cue, .img, .ccd, .mdf.** chdman only understands `.cue`, `.gdi`, `.toc`, `.nrg`, `.iso`. Anything else is read as a
   text `.toc`, yields 0 tracks and spins on `Compressing, -nan%` forever. Reproduced with chdman 0.264.

No separate multi-disc cause was found: the multi-disc export (folder, `(Disc N).chd`, `.m3u`) looks right. Run the ROM check
on the finished CHDs to see track 1's type.

### What changed

See the RU list above: `aegiscore.PrepareCDInput`, pinned codecs `cdlz,cdzl,cdfl`, read-back check of the finished CHD,
`X-Converter-Notes`, `POST /api/native/converter/verify`. A PS1 ISO 2048 is lossy by itself (no XA Form 2 audio/video).

### ROM check (Tools)

Files present and readable; `.cue/.gdi/.ccd/.mds/.m3u` targets exist; sizes match sectors; ZIP/7z/RAR not truncated;
NES/GB/GBA/NDS/MD/N64 headers; CHD truncation, version, parent, Zstandard, CD/DVD and PS1 track type; multi-disc numbering;
BIOS from the last Environment → BIOS check. "Full CHD check" runs `chdman verify` (app window only). Report saves as `.txt`.
