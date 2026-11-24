# Данные игр: выгрузка и загрузка / Game data: export and import

**RU.** Инструменты → Библиотека → «Данные игр: таблица или XML».

- **Выгрузить данные** открывает окно области (вся библиотека, консоли, битность, папки, игры) и выбор формата: CSV (разделитель `;`, UTF-8 с BOM, открывается в Excel/LibreOffice/Google Таблицах) или XML (`<aegisromGames><game>…</game></aegisromGames>`).
- Колонки: `key, console, platform, file, crc32, serial, size, bitness, title, region, genre, year, developer, publisher, players, rating, desc, age_auto, hack, translation_lang`. Названия колонок не переводятся: по ним идёт загрузка.
- **Загрузить данные** читает CSV/TSV/XML, а также чужой `gamelist.xml` (ES, ES-DE, Skraper). Игра ищется по `key`, затем по `console` + `crc32`, затем по имени файла (`file`/`path`). Если имя файла подходит к нескольким играм и консоли нет, строка пропускается.
- Перед применением показывается предпросмотр: сколько найдено, что не найдено, какие поля и у каких игр меняются (было → стало), можно снять игры или поля.
- Меняются только `title, region, genre, year, developer, publisher, players, rating, desc`. Изменения записываются как ручные правки Редактора (`utils/manualEdits.ts`): скан и скраппер их не затирают, весь импорт отменяется одним шагом. Пустая ячейка ничего не меняет.
- `age_auto` — оценка по названию и жанру, не хранится, только для чтения. Страны и языка игры в модели данных нет; `translation_lang` — язык перевода у хаков.

**EN.** Tools → Library → "Game data: table or XML".

- **Export data** opens the scope window and a format choice: CSV (`;`, UTF-8 with BOM) or XML.
- **Import data** reads CSV/TSV/XML and a foreign `gamelist.xml` (ES, ES-DE, Skraper). Games are matched by `key`, then `console` + `crc32`, then file name. A preview lists every change (old → new) before anything is applied.
- Only `title, region, genre, year, developer, publisher, players, rating, desc` are imported, as Editor manual edits: rescans and the scraper keep them, and the whole import undoes in one step. Empty cells change nothing.
- `age_auto` is an estimate from title and genre and is read-only. The data model has no country or game language; `translation_lang` is the translation language of hacks.
