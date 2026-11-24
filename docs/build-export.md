# Выгрузка сборки / Build export

Код: `src/utils/buildQueue.ts` (план, линии, таймауты, журнал, отчёт), `src/utils/buildCopy.ts` (копирование), `src/utils/buildMedia.ts` (медиа и `gamelist.xml`), `handleRunBuildExportAndConversion` в `src/components/SmartBuildsAndConverterTab.tsx`, chdman в `aegisdesktop/routes.go` и `cmd/aegis-gui/hybrid_webview_server.go`, `aegisapi/converter_output.go`.

## RU

### Почему раньше казалось, что выгрузка зависла

- Все игры шли одной очередью в 4–6 потоков. Конвертация ждала общий замок «по одной», но при этом занимала поток. Когда подряд шли дисковые консоли, все потоки стояли и ждали одну конвертацию: простые копии тоже не шли, и прогресс почти не двигался.
- У конвертации не было предела времени: зависший chdman или файл держал очередь бесконечно. Строка прогресса обновлялась только по окончании игры, поэтому долгий файл не отличить от зависания.
- Результат chdman целиком возвращался в страницу (ArrayBuffer на сотни МБ и больше) и отправлялся обратно в Go для записи.
- `gamelist.xml`, BIOS и отчёт писались только в самом конце. Кнопка СТОП внизу окна выгрузку не останавливала, а только прятала её прогресс.

### Как сейчас

1. **План перед стартом.** Окно параметров показывает, сколько игр копируется как есть и сколько конвертируется (по форматам), сколько игр без файла в сеансе, нет ли chdman и у скольких игр рядом с ромом найдены медиа.
2. **Две линии одновременно.**
   - Копирование (4 потока в браузере, 6 в нативном окне): ромы без конвертации, правка заголовков картриджей, игры «нет chdman» (копируется оригинал), затем медиа конвертируемых игр.
   - Конвертация (1 поток): образы дисков и chdman, от маленьких файлов к большим.
   - Как только закончилась линия копирования, пишется `gamelist.xml` и копируются BIOS. В конце `gamelist.xml` переписывается ещё раз с играми после конвертации.
3. **Пределы времени.** Копирование: 5 мин + 1 мин на каждые 50 МБ. Конвертация: 10 мин + 1 мин на каждые 100 МБ; конвертации, которые сообщают проценты, ещё и останавливаются, если прогресса нет 5 минут. Это запас, а не замер. Зависший файл пропускается, игра попадает в отчёт, остальные идут дальше. chdman запускается с контекстом запроса: отмена на странице завершает процесс.
4. **Живой прогресс.** Раз в секунду: `Копирование N/M · Конвертация K/L: <игра или файл, %> (время) · МБ/с · общее время`.
5. **Остановка.** Кнопка «Остановить выгрузку» во вкладке и общая СТОП. Новые игры не берутся, текущие отменяются; `gamelist.xml`, журнал, отчёт и манифест записываются.
6. **Продолжение.** Повторный запуск в ту же папку с галкой «Пропускать файлы, которые уже есть»: копии с тем же размером пропускаются, готовые конвертации берутся из журнала `aegisrom_build_progress.json` (если файл на месте и не пустой).
7. **Отчёт** `aegisrom_build_report.txt` в корне сборки: таймауты, ошибки, пропуски, что не сделано из-за остановки.
8. **chdman пишет сразу на диск** (нативное окно): страница передаёт `outDir`, Go переносит результат в папку сборки и отвечает коротким JSON. Путь проверяется по выбранным пользователем папкам.

### Проверено

- `npm test`: тесты `src/utils/buildQueue.test.ts` (линии, сводка, таймаут, сторож, отмена, журнал, синтетическая очередь с «зависшей» конвертацией: копии и медиа заканчиваются раньше таймаута).
- `go test ./aegisapi ./aegisdesktop`: перенос результата, отказ вне выбранных папок, настоящий chdman на синтетическом образе (результат сразу в папке, отмена запроса не оставляет файл).
- На реальной библиотеке и в окне Edge не проверено.

## EN

### Why the export used to look stuck

- All games shared one queue of 4–6 lanes. A conversion waited on a shared "one at a time" lock while holding a lane. When disc consoles came in a row, every lane waited for one conversion: plain copies stopped too and progress barely moved.
- Conversions had no time limit: a stuck chdman or file held the queue forever. The progress line only changed when a game finished, so a long file looked the same as a hang.
- chdman's output came back to the page whole (an ArrayBuffer of hundreds of MB or more) and was sent back to Go to be written.
- `gamelist.xml`, BIOS and the report were written only at the very end. The STOP button at the bottom did not stop the export; it only hid its progress.

### How it works now

1. **Plan before the start.** The settings dialog shows how many games are copied as is and how many are converted (by format), how many have no file in the session, whether chdman is missing, and how many games have media next to the ROM.
2. **Two lanes at once.**
   - Copy (4 at a time in the browser, 6 in the native window): ROMs without conversion, cartridge header fixes, "no chdman" games (the original is copied), then the media of games being converted.
   - Convert (1 at a time): disc images and chdman, smallest files first.
   - As soon as the copy lane is done, `gamelist.xml` is written and BIOS files are copied. At the end `gamelist.xml` is rewritten with the converted games.
3. **Time limits.** Copy: 5 min + 1 min per 50 MB. Convert: 10 min + 1 min per 100 MB; conversions that report percent also stop after 5 minutes without progress. These are headroom, not measurements. A stuck file is skipped, the game goes to the report, the rest continues. chdman runs with the request context: a cancel on the page kills the process.
4. **Live progress.** Once a second: `Copy N/M · Convert K/L: <game or file, %> (time) · MB/s · total time`.
5. **Stop.** The "Stop export" button in the tab and the shared STOP. No new games are taken, running ones are cancelled; `gamelist.xml`, the journal, the report and the manifest are written.
6. **Resume.** Run again into the same folder with "Skip files that are already in the build folder": same-size copies are skipped, finished conversions come from the `aegisrom_build_progress.json` journal (when the file is in place and not empty).
7. **Report** `aegisrom_build_report.txt` in the build root: timeouts, errors, skips, what was not done because of a stop.
8. **chdman writes straight to disk** (native window): the page sends `outDir`, Go moves the output into the build folder and answers with short JSON. The path is checked against the folders the user picked.

### Verified

- `npm test`: `src/utils/buildQueue.test.ts` (lanes, summary, timeout, watchdog, cancel, journal, a synthetic queue with a "stuck" conversion: copies and media finish before its timeout).
- `go test ./aegisapi ./aegisdesktop`: moving the output, denial outside picked folders, a real chdman on a synthetic image (output lands in the folder, a cancelled request leaves no file).
- Not checked on a real library or in the Edge window.
