# Медиа Skraper / Skraper media

## RU

Skraper 1.4.x кладёт медиа в `<консоль>/media/<папка>/<ром>.<расш>`. Словарь папок и видов — `src/utils/gameMediaKinds.ts` (Go: `aegisapi/gamemedia.go`).

| Папка Skraper | Вид | Куда переносит «Упорядочить медиа» |
|---|---|---|
| boxes, box2dfront | обложка | `images/<ром>-image` |
| images, mix | основное изображение (микс) | `images/<ром>-mix` (или `-image`, если обложки нет) |
| screenshot | скриншот | `images/<ром>-thumb` |
| screenshottitle | титульный экран | `images/<ром>-title` (или `-thumb`, если скриншота нет) |
| wheels, wheel | логотип | `marquees/<ром>-marquee` |
| screenmarquee | маркиза | `marquees/<ром>-screenmarquee` (или `-marquee`, если логотипа нет) |
| steamgrid | Steam grid | `images/<ром>-steamgrid` |
| fanart | фон | `images/<ром>-fanart` |
| support | картридж / диск | `images/<ром>-cartridge` |
| supporttexture | скан картриджа / диска | `images/<ром>-supporttexture` |
| maps | карты | `images/<ром>-map` или `manuals/<ром>-map.pdf` |
| tipsandtricks | советы | `manuals/<ром>-tips.pdf/.txt` или `images/<ром>-tips` |
| videos | видео | `videos/<ром>-video` |
| manuals | мануал | `manuals/<ром>.pdf` |

- «Упорядочить медиа» (Инструменты → Библиотека) работает в фоне: окно можно закрыть, прогресс и «Остановить» видны в плашке слева внизу. Одинаковые файлы сравниваются кусками по 1 МБ.
- Карточка игры показывает «Медиа игры»: вкладки по видам, миниатюры, просмотр картинок, видео, PDF и текста. В браузере файлы берутся через доступ к папке, в десктопе — `GET /api/native/fs/game-media`.
- Фильтр «Медиа» в Библиотеке: «Без обложки» и «Есть: <вид>». Виды фона, карт и т. п. появляются после «Найти медиа в папках» или при открытии игры.
- Фон, карты, носитель, маркиза, Steam grid и советы никогда не становятся обложкой.

## EN

Skraper 1.4.x stores media in `<console>/media/<folder>/<rom>.<ext>`. The folder → kind dictionary lives in `src/utils/gameMediaKinds.ts` (Go: `aegisapi/gamemedia.go`); the table above shows where "Tidy media" moves each folder.

- "Tidy media" (Tools → Library) runs in the background: the window can be closed, progress and Stop stay in a bottom-left panel. Identical files are compared in 1 MB chunks.
- The game card shows "Game media": kind tabs, thumbnails, an image viewer, video, PDF and text. In a browser files come through folder access, on desktop through `GET /api/native/fs/game-media`.
- The Library "Media" filter: "No cover" and "Has: <kind>". Fan art, maps etc. appear after "Find media in folders" or when a game is opened.
- Fan art, maps, cartridge, marquee, Steam grid and tips never become a cover.
