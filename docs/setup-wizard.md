# Мастер первоначальной настройки / First-run setup wizard

Пункт роудмапа 0.5.8. Код: `src/components/SetupWizard.tsx` (мастер, панель прогресса, тур), конвейер `runInitialSetupPipeline` в `src/App.tsx`, тексты на 9 языках в `src/i18n/locales/setup.ts`.

Roadmap item 0.5.8. Code: `src/components/SetupWizard.tsx` (wizard, progress panel, tour), the `runInitialSetupPipeline` pipeline in `src/App.tsx`, strings for all 9 languages in `src/i18n/locales/setup.ts`.

## Когда открывается / When it opens

- При первом запуске, если в `localStorage` нет ключа `aegisrom_setup_v1`.
- Старые установки (есть сохранённые папки в IndexedDB или записи БД в `aegisrom_v0_5_db`) мастер не видят: ключ ставится молча.
- Повторно: кнопка с волшебной палочкой в верхней панели.

- On first launch, when `localStorage` has no `aegisrom_setup_v1` key.
- Existing installs (saved folder handles in IndexedDB or DB records in `aegisrom_v0_5_db`) skip it: the key is set silently.
- Again at any time: the wand button in the top bar.

## Шаги / Steps

1. Язык / language.
2. Тип установки «Клиент» / «Клиент + сервер». Скрыт флагом `SERVER_MODE_AVAILABLE = false` в `SetupWizard.tsx`; когда сервер будет в релизе, поставить `true`. Выбор пишется в `aegisrom_install_mode`. / Installation type, hidden behind `SERVER_MODE_AVAILABLE = false`; flip it when the server ships. Stored in `aegisrom_install_mode`.
3. Папка файла библиотеки (`aegisrom_db.json`) → handle `library_root`. / Library file folder.
4. Хранилище ромов → `scan_root`, `sort_target`, `combine_target`. / ROM storage.
5. Свои ромы (можно пропустить), копировать или переместить → `buffer_source`. Папка, совпадающая с хранилищем, вложенная в него или содержащая его, не принимается. / Own ROMs (optional), copy or move. A folder that equals, sits inside or contains the storage is rejected.
6. Шаблон имени из `FILENAME_CONSTRUCTOR_PRESETS` (можно пропустить). / Naming preset (optional).
7. Сводка → «Собрать библиотеку». / Summary → "Build library".

## Фоновый конвейер / Background pipeline

Использует существующие инструменты, а не новые копии. / Reuses the existing tools.

| Этап / stage | Что вызывает / calls |
|---|---|
| library | `handleUpdateDbState`, создаёт `aegisrom_db.json`, если его нет |
| scanStorage | `scanDirectoryHandleRecursively(storage, 'replace')` |
| scanOwn | `walkBufferDirHandle` + `inspectBufferEntries` (вынесены из Комбайна / extracted from Combain) |
| transfer | `handleRunBufferAutoProcess({ sourceList, targetHandle, moveMode, filenameConfig })`: раскладка по консолям, переименование, дубли в `_Duplicates_1G1R`, битые в `_BadDumps_Junk` |
| save | пишет `aegisrom_db.json` в папку библиотеки / writes the library file |

Стоп в панели прогресса вызывает общий `handleEmergencyStop`. / Stop calls the shared `handleEmergencyStop`.

`syncScannedRomsIntoDb` теперь читает `dbStateRef`, а не замыкание: иначе этапы одной цепочки затирали бы друг другу записи. / `syncScannedRomsIntoDb` now reads `dbStateRef` instead of a stale closure, so chained stages do not overwrite each other's records.

## Тур / Tour

Шаги в `TOUR_STEPS` (`SetupWizard.tsx`): `{ id, target? }`, где `target` — раздел (`library | tools | builds | env`) и вкладка Инструментов. Тексты: `tour.<id>.title` и `tour.<id>.body` в `setup.ts`. Чтобы добавить раздел (BIOS, хаки), допишите шаг и два ключа во все 9 языков.

Steps live in `TOUR_STEPS`: `{ id, target? }`. Strings: `tour.<id>.title` / `tour.<id>.body` in `setup.ts`. To add a section (BIOS, hacks), add a step and both keys for all 9 languages.

## Ограничения / Limits

- Работает через File System Access API (Edge, Chrome, окно приложения). В браузерах без него мастер показывает только выбор языка. Когда выбор папок переедет в Go (Wails, этап 3), достаточно заменить `handleSetupPickFolder`.
- Ромы, которые уже лежат в хранилище, не переименовываются и не перемещаются: мастер только добавляет их в библиотеку.

- Relies on the File System Access API (Edge, Chrome, the app window). Without it the wizard shows only the language step. When folder picking moves to Go (Wails stage 3), only `handleSetupPickFolder` needs replacing.
- ROMs already in the storage are not renamed or moved; the wizard only adds them to the library.
