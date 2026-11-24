// Тексты окна «Настройки». Подписи вариантов берутся из уже переведённых ключей разделов.
// Settings window strings. Option labels reuse the already translated section keys.
// Пока EN и RU; остальные языки показывают английский текст.
// EN and RU for now; other languages fall back to English.

type Dict = Record<string, string>;

const EN: Dict = {
  'settings.button': 'Settings',
  'settings.title': 'Settings',
  'settings.intro':
    'Defaults the app uses every time it opens. Switches inside a section still change only the current session.',
  'settings.tab.general': 'General',
  'settings.tab.rename': 'Sorting and renaming',
  'settings.tab.scraper': 'Scraper',
  'settings.tab.delete': 'Deletion',
  'settings.tab.combine': 'Combine and SD card',
  'settings.theme': 'Theme',
  'settings.theme.system': 'Same as system',
  'settings.theme.light': 'Light',
  'settings.theme.dark': 'Dark',
  'settings.language': 'Language',
  'settings.startSection': 'Section on start',
  'settings.libraryView': 'Library view on start',
  'settings.librarySort': 'Library sorting',
  'settings.sidebarGroup': 'Sidebar categories',
  'settings.renameHint': 'The file name template itself is set in the Tools section, in the file name constructor.',
  'settings.scraperHint':
    'Your ScreenScraper login is entered in the Tools section.',
  'settings.deleteHint':
    'When off, duplicates and junk go to a backup folder first, so you can bring them back.',
  'settings.combineTitle': 'Combine (buffer folder)',
  'settings.sdTitle': 'SD card',
  'settings.sdFirmware': 'Device and firmware',
  'settings.reset': 'Reset to defaults',
  'settings.cancel': 'Cancel',
  'settings.save': 'Save',
  'settings.savedLog': '⚙ Settings saved. They apply now and on every start.',
};

const RU: Dict = {
  'settings.button': 'Настройки',
  'settings.title': 'Настройки',
  'settings.intro':
    'Значения, с которыми приложение открывается каждый раз. Переключатели внутри разделов по-прежнему меняют только текущий сеанс.',
  'settings.tab.general': 'Общие',
  'settings.tab.rename': 'Сортировка и переименование',
  'settings.tab.scraper': 'Скраппер',
  'settings.tab.delete': 'Удаление',
  'settings.tab.combine': 'Комбайн и флешка',
  'settings.theme': 'Тема',
  'settings.theme.system': 'Как в системе',
  'settings.theme.light': 'Светлая',
  'settings.theme.dark': 'Тёмная',
  'settings.language': 'Язык',
  'settings.startSection': 'Раздел при открытии',
  'settings.libraryView': 'Вид библиотеки при открытии',
  'settings.librarySort': 'Сортировка библиотеки',
  'settings.sidebarGroup': 'Категории в боковой панели',
  'settings.renameHint': 'Сам шаблон имени файла задаётся в разделе «Инструменты», в конструкторе имён.',
  'settings.scraperHint':
    'Логин ScreenScraper вводится в разделе «Инструменты».',
  'settings.deleteHint':
    'Если выключено, дубли и мусор сначала уходят в резервную папку, и их можно вернуть.',
  'settings.combineTitle': 'Комбайн (буферная папка)',
  'settings.sdTitle': 'Флешка',
  'settings.sdFirmware': 'Устройство и прошивка',
  'settings.reset': 'Сбросить к стандартным',
  'settings.cancel': 'Отмена',
  'settings.save': 'Сохранить',
  'settings.savedLog': '⚙ Настройки сохранены. Действуют сейчас и при каждом запуске.',
};

export const SETTINGS_STRINGS: Record<string, Dict> = { en: EN, ru: RU };
