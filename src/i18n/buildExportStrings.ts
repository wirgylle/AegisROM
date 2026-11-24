// Тексты окна выгрузки сборки (медиа, пропуск готовых файлов, gamelist.xml). Лежат отдельно,
// как biosStrings.ts, чтобы не конфликтовать с параллельными ветками. Остальные языки берут английский.
// Build export dialog strings (media, skipping finished files, gamelist.xml). Kept apart like
// biosStrings.ts to avoid merge conflicts; other languages fall back to English.

type Dict = Record<string, string>;

const EN: Dict = {
  'bx.title': 'Build export settings',
  'bx.summary': '{count} games, about {size}',
  'bx.mediaToggle': 'Copy media with the ROMs',
  'bx.mediaHint':
    'Media is looked up next to each ROM: the paths in gamelist.xml first, then files named after the ROM in images, videos, marquees, boxart and similar folders.',
  'bx.kind.thumbnail': 'Box art / cover (thumbnail)',
  'bx.kind.image': 'Main picture: screenshot or cover (image)',
  'bx.kind.marquee': 'Banner / logo (marquee)',
  'bx.kind.video': 'Video (video)',
  'bx.mediaUnsupported': 'The “{name}” profile does not use media, so only ROMs are copied.',
  'bx.singleNote': 'This device shows one picture per game: box art if there is one, otherwise the main picture.',
  'bx.skipExisting': 'Skip files that are already in the build folder (same size)',
  'bx.skipHint': 'Exporting again into the same folder copies only what is new or changed.',
  'bx.gamelist': 'Write gamelist.xml (names, descriptions, media paths)',
  'bx.gamelistHint': 'Without it EmulationStation shows file names and no media. Entries for other games already in the file are kept.',
  'bx.start': 'Choose folder and start',
  'bx.cancel': 'Cancel',
  'bx.log.mode': 'Export: {n} files at a time, {how}.',
  'bx.log.modeNative': 'copied on disk by the app',
  'bx.log.modeBrowser': 'each file written whole by the browser',
  'bx.prog': 'Export {done}/{total}: {title}',
  'bx.log.progress': 'Done {done} of {total}: copied {copied}, skipped (already there) {skipped}, converted {converted}.',
  'bx.log.media': 'Media: {files} files copied, no media found for {missing} games.',
  'bx.log.gamelist': 'gamelist.xml written: {path} ({count} games)',
  'bx.log.gamelistErr': 'Could not write gamelist.xml in {path}: {err}',
  'bx.log.time': 'Export took {time}.',
  'bx.log.noFileSummary':
    '{count} games were not copied: their ROM files are not loaded in this session. Scan the library folder and export again.',
};

const RU: Dict = {
  'bx.title': 'Параметры выгрузки сборки',
  'bx.summary': '{count} игр, примерно {size}',
  'bx.mediaToggle': 'Копировать медиа вместе с ромами',
  'bx.mediaHint':
    'Медиа ищется рядом с каждым ромом: сначала пути из gamelist.xml, затем файлы с именем рома в папках images, videos, marquees, boxart и похожих.',
  'bx.kind.thumbnail': 'Боксарт / обложка (thumbnail)',
  'bx.kind.image': 'Основная картинка: скриншот или обложка (image)',
  'bx.kind.marquee': 'Баннер / логотип (marquee)',
  'bx.kind.video': 'Видео (video)',
  'bx.mediaUnsupported': 'Профиль «{name}» не использует медиа, копируются только ромы.',
  'bx.singleNote': 'Это устройство показывает одну картинку на игру: боксарт, а если его нет, основную картинку.',
  'bx.skipExisting': 'Пропускать файлы, которые уже есть в папке сборки (тот же размер)',
  'bx.skipHint': 'Повторная выгрузка в ту же папку докопирует только новое и изменённое.',
  'bx.gamelist': 'Записать gamelist.xml (названия, описания, пути к медиа)',
  'bx.gamelistHint': 'Без него EmulationStation показывает имена файлов и не видит медиа. Записи других игр в файле сохраняются.',
  'bx.start': 'Выбрать папку и начать',
  'bx.cancel': 'Отмена',
  'bx.log.mode': 'Выгрузка: {n} файлов одновременно, {how}.',
  'bx.log.modeNative': 'копирует приложение прямо на диске',
  'bx.log.modeBrowser': 'браузер пишет каждый файл целиком',
  'bx.prog': 'Выгрузка {done}/{total}: {title}',
  'bx.log.progress': 'Готово {done} из {total}: скопировано {copied}, пропущено (уже есть) {skipped}, сконвертировано {converted}.',
  'bx.log.media': 'Медиа: скопировано файлов {files}, не найдено у игр: {missing}.',
  'bx.log.gamelist': 'Записан gamelist.xml: {path} (игр: {count})',
  'bx.log.gamelistErr': 'Не удалось записать gamelist.xml в {path}: {err}',
  'bx.log.time': 'Выгрузка заняла {time}.',
  'bx.log.noFileSummary':
    'Не скопировано игр: {count}, их файлы не загружены в этом сеансе. Просканируйте папку библиотеки и выгрузите снова.',
};

export const BUILD_EXPORT_STRINGS = { en: EN, ru: RU };
