// Тексты скраппера медиа (источники, выбор типов, ScreenScraper по логину). Отдельно, как
// saveStrings.ts, чтобы не конфликтовать с параллельными ветками. Остальные языки берут английский.
// Media scraper strings (sources, type choice, ScreenScraper login). Kept apart like saveStrings.ts;
// other languages fall back to English.

type Dict = Record<string, string>;

const EN: Dict = {
  'scrape.opts.title': 'Download media',
  'scrape.opts.types': 'What to download',
  'scrape.opts.slot.image': 'Box art',
  'scrape.opts.slotHint.image': 'Game box cover → images/<rom>-image.png',
  'scrape.opts.slot.thumb': 'Screenshot',
  'scrape.opts.slotHint.thumb': 'In-game screen → images/<rom>-thumb.png',
  'scrape.opts.slot.marquee': 'Logo / banner',
  'scrape.opts.slotHint.marquee': 'Game logo (title screen if there is no logo) → marquees/',
  'scrape.opts.slot.video': 'Video',
  'scrape.opts.slotHint.video': 'Short gameplay clip → videos/ (archive.org, ScreenScraper)',
  'scrape.opts.retry': 'Search again for ROMs that had no media last time',
  'scrape.opts.retryHint':
    'Off: such ROMs are skipped, the run is faster. They are searched anyway after a network error or once ScreenScraper is connected.',
  'scrape.opts.start': 'Start',
  'scrape.opts.cancel': 'Cancel',
  'scrape.skippedKnownMisses': 'Skipped {count} ROMs: no media was found for them last time (tick “Search again” to retry).',
  'tools.ss.desc':
    'The scraper uses it when a game is not in Libretro. ScreenScraper matches by CRC, file name and size, so it finds ROMs with bad names too. Your login and password are stored only on this computer.',
  'tools.ss.loginOnly': 'Your screenscraper.fr login and password are enough (free registration on screenscraper.fr).',
  'tools.ss.needDevKey':
    'This build has no ScreenScraper developer key built in, so enter devid and devpassword as well (issued on the ScreenScraper forum). Official AegisROM builds include it.',
  'tools.ss.advanced': 'Advanced: my own developer key',
};

const RU: Dict = {
  'scrape.opts.title': 'Скачать медиа',
  'scrape.opts.types': 'Что качать',
  'scrape.opts.slot.image': 'Боксарт',
  'scrape.opts.slotHint.image': 'Обложка коробки → images/<ром>-image.png',
  'scrape.opts.slot.thumb': 'Скриншот',
  'scrape.opts.slotHint.thumb': 'Кадр из игры → images/<ром>-thumb.png',
  'scrape.opts.slot.marquee': 'Логотип / баннер',
  'scrape.opts.slotHint.marquee': 'Логотип игры (если его нет, титульный экран) → marquees/',
  'scrape.opts.slot.video': 'Видео',
  'scrape.opts.slotHint.video': 'Короткий ролик игры → videos/ (archive.org, ScreenScraper)',
  'scrape.opts.retry': 'Искать заново ромы, для которых медиа не нашлось в прошлый раз',
  'scrape.opts.retryHint':
    'Выключено: такие ромы пропускаются, запуск быстрее. После сетевой ошибки или подключения ScreenScraper они всё равно ищутся заново.',
  'scrape.opts.start': 'Начать',
  'scrape.opts.cancel': 'Отмена',
  'scrape.skippedKnownMisses': 'Пропущено ромов: {count}, для них медиа не нашлось в прошлый раз (включите «Искать заново», чтобы повторить).',
  'tools.ss.desc':
    'Скраппер обращается к нему, когда игры нет в Libretro. ScreenScraper ищет по CRC, имени файла и размеру, поэтому находит ромы и с плохими именами. Логин и пароль хранятся только на этом компьютере.',
  'tools.ss.loginOnly': 'Достаточно логина и пароля screenscraper.fr (бесплатная регистрация на screenscraper.fr).',
  'tools.ss.needDevKey':
    'В эту сборку не вшит ключ разработчика ScreenScraper, поэтому укажите ещё devid и devpassword (их выдают на форуме ScreenScraper). В официальных сборках AegisROM ключ есть.',
  'tools.ss.advanced': 'Дополнительно: свой ключ разработчика',
};

export const SCRAPE_STRINGS: Record<string, Dict> = { en: EN, ru: RU };
