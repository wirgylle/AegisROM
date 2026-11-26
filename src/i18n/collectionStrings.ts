// Тексты коллекций и серий. Лежат отдельно, как biosStrings.ts, чтобы не конфликтовать
// с параллельными ветками. Остальные языки берут английский текст.
// Collection and series strings. Kept apart like biosStrings.ts to avoid merge conflicts
// with parallel branches. Other languages fall back to English.

type Dict = Record<string, string>;

const EN: Dict = {
  'coll.toggle': 'Collections',
  'coll.toggleHint': 'In “All”, show one card per game: versions from other consoles, regions and hacks are grouped under it. Series group the whole game line.',
  'coll.countSuffix': 'collections',
  'coll.openHint': '{count} versions: {consoles}. Click to see them all.',
  'coll.openHintNamed': 'Collection “{name}”: {count} ROMs on {consoles}. Click to see them all.',
  'coll.modalTitle': '{title}: all versions',
  'coll.modalSubtitle': '{count} ROMs on {consoles} consoles. Pick one to open it in the panel on the right.',
  'coll.colConsole': 'Console',
  'coll.colRegion': 'Region',
  'coll.colFile': 'File',
  'coll.colStatus': 'Status',
  'coll.original': 'Original',
  'coll.current': 'open',
  'coll.close': 'Close',
  'series.toggle': 'Series',
  'series.toggleHint': 'In “All”, show one card per game line: Final Fantasy, Final Fantasy VII, Final Fantasy Tactics and so on are grouped under “Final Fantasy”. Collections group one game across consoles.',
  'series.countSuffix': 'series',
  'series.openHint': 'Series “{name}”: {count} games on {consoles}. Click to see them all.',
  'series.modalTitle': '{title}: the whole series',
  'series.modalSubtitle': '{games} games, {count} ROMs on {consoles} consoles, by release year. Pick one to open it in the panel on the right.',
  'gi.versions': 'Other versions in your library',
  'gi.versionsEmpty': 'No other versions of this game in your library.',
  'gi.series': 'Same series in your library',
  'gi.seriesHint': 'Matched by title: the same name with a different part number or subtitle.',
  'gi.about': 'About the game',
  'gi.loading': 'Looking it up in Wikidata…',
  'gi.notFound': 'Not found in Wikidata under this exact title. Fix the title (online rename, DAT) and try again.',
  'gi.error': 'Wikidata did not answer: {error}',
  'gi.retry': 'Try again',
  'gi.load': 'Load description',
  'gi.auto': 'Load automatically',
  'gi.autoHint': 'When on, the panel asks Wikidata and Wikipedia about each game you open. Only the title is sent. Answers are cached for 30 days.',
  'gi.platforms': 'Released on',
  'gi.inLibrary': 'in your library',
  'gi.seriesWd': 'Series: {name}',
  'gi.seriesWdMore': '+{count} more',
  'gi.source': 'Source: Wikidata, Wikipedia (CC BY-SA)',
  'gi.openWiki': 'Wikipedia',
  'gi.openWd': 'Wikidata',
  'gi.yearUnknown': 'year ?',
};

const RU: Dict = {
  'coll.toggle': 'Коллекции',
  'coll.toggleHint': 'В разделе «Все» одна карточка на игру: версии с других консолей, регионы и хаки собраны под ней. Серии собирают всю линейку игры.',
  'coll.countSuffix': 'коллекций',
  'coll.openHint': 'Версий: {count} ({consoles}). Нажмите, чтобы увидеть все.',
  'coll.openHintNamed': 'Коллекция «{name}»: ромов {count} ({consoles}). Нажмите, чтобы увидеть все.',
  'coll.modalTitle': '{title}: все версии',
  'coll.modalSubtitle': 'Ромов: {count}, консолей: {consoles}. Выберите ром, чтобы открыть его в панели справа.',
  'coll.colConsole': 'Консоль',
  'coll.colRegion': 'Регион',
  'coll.colFile': 'Файл',
  'coll.colStatus': 'Статус',
  'coll.original': 'Оригинал',
  'coll.current': 'открыт',
  'coll.close': 'Закрыть',
  'series.toggle': 'Серии',
  'series.toggleHint': 'В разделе «Все» одна карточка на линейку: Final Fantasy, Final Fantasy VII, Final Fantasy Tactics и другие части собраны под «Final Fantasy». Коллекции собирают одну игру с разных консолей.',
  'series.countSuffix': 'серий',
  'series.openHint': 'Серия «{name}»: игр {count} ({consoles}). Нажмите, чтобы увидеть все.',
  'series.modalTitle': '{title}: вся серия',
  'series.modalSubtitle': 'Игр: {games}, ромов: {count}, консолей: {consoles}. По году выхода. Выберите ром, чтобы открыть его в панели справа.',
  'gi.versions': 'Другие версии в библиотеке',
  'gi.versionsEmpty': 'Других версий этой игры в библиотеке нет.',
  'gi.series': 'Та же серия в библиотеке',
  'gi.seriesHint': 'Найдено по названию: то же имя с другим номером части или подзаголовком.',
  'gi.about': 'Об игре',
  'gi.loading': 'Ищу в Wikidata…',
  'gi.notFound': 'В Wikidata нет игры с таким точным названием. Исправьте название (онлайн-переименование, DAT) и попробуйте снова.',
  'gi.error': 'Wikidata не ответила: {error}',
  'gi.retry': 'Повторить',
  'gi.load': 'Загрузить описание',
  'gi.auto': 'Загружать сразу',
  'gi.autoHint': 'Если включено, панель спрашивает Wikidata и Wikipedia о каждой открытой игре. Отправляется только название. Ответы хранятся 30 дней.',
  'gi.platforms': 'Выходила на',
  'gi.inLibrary': 'есть в библиотеке',
  'gi.seriesWd': 'Серия: {name}',
  'gi.seriesWdMore': 'ещё {count}',
  'gi.source': 'Источник: Wikidata, Wikipedia (CC BY-SA)',
  'gi.openWiki': 'Wikipedia',
  'gi.openWd': 'Wikidata',
  'gi.yearUnknown': 'год ?',
};

// Остальные языки: только кнопки и заголовки, прочее — по-английски.
// Other languages: only buttons and titles, the rest falls back to English.
const DE: Dict = {
  'coll.toggle': 'Sammlungen',
  'series.toggle': 'Serien',
  'series.toggleHint': 'In „Alle“ eine Karte pro Spielreihe: Final Fantasy, Final Fantasy VII, Final Fantasy Tactics usw. unter „Final Fantasy“.',
  'series.countSuffix': 'Serien',
  'series.openHint': 'Serie „{name}“: {count} Spiele auf {consoles}. Klicken, um alle zu sehen.',
  'series.modalTitle': '{title}: die ganze Serie',
};
const ES: Dict = {
  'coll.toggle': 'Colecciones',
  'series.toggle': 'Series',
  'series.toggleHint': 'En «Todos», una tarjeta por saga: Final Fantasy, Final Fantasy VII, Final Fantasy Tactics, etc. bajo «Final Fantasy».',
  'series.countSuffix': 'series',
  'series.openHint': 'Saga «{name}»: {count} juegos en {consoles}. Pulsa para verlos todos.',
  'series.modalTitle': '{title}: toda la saga',
};
const FR: Dict = {
  'coll.toggle': 'Collections',
  'series.toggle': 'Séries',
  'series.toggleHint': 'Dans « Tous », une carte par série : Final Fantasy, Final Fantasy VII, Final Fantasy Tactics, etc. sous « Final Fantasy ».',
  'series.countSuffix': 'séries',
  'series.openHint': 'Série « {name} » : {count} jeux sur {consoles}. Cliquez pour tout voir.',
  'series.modalTitle': '{title} : toute la série',
};
const IT: Dict = {
  'coll.toggle': 'Collezioni',
  'series.toggle': 'Serie',
  'series.toggleHint': 'In «Tutti», una scheda per saga: Final Fantasy, Final Fantasy VII, Final Fantasy Tactics, ecc. sotto «Final Fantasy».',
  'series.countSuffix': 'serie',
  'series.openHint': 'Serie «{name}»: {count} giochi su {consoles}. Clicca per vederli tutti.',
  'series.modalTitle': '{title}: tutta la serie',
};
const SR: Dict = {
  'coll.toggle': 'Kolekcije',
  'series.toggle': 'Serijali',
  'series.toggleHint': 'U „Sve“ jedna kartica po serijalu: Final Fantasy, Final Fantasy VII, Final Fantasy Tactics itd. pod „Final Fantasy“.',
  'series.countSuffix': 'serijala',
  'series.openHint': 'Serijal „{name}“: {count} igara na {consoles}. Kliknite da vidite sve.',
  'series.modalTitle': '{title}: ceo serijal',
};
const JA: Dict = {
  'coll.toggle': 'コレクション',
  'series.toggle': 'シリーズ',
  'series.toggleHint': '「すべて」でシリーズごとに1枚のカードを表示します（Final Fantasy、VII、Tactics などを「Final Fantasy」にまとめます）。',
  'series.countSuffix': 'シリーズ',
  'series.openHint': 'シリーズ「{name}」：{consoles} で {count} 作品。クリックで一覧表示。',
  'series.modalTitle': '{title}：シリーズ全体',
};
const ZH: Dict = {
  'coll.toggle': '合集',
  'series.toggle': '系列',
  'series.toggleHint': '在“全部”中每个系列显示一张卡片：Final Fantasy、VII、Tactics 等归入“Final Fantasy”。',
  'series.countSuffix': '个系列',
  'series.openHint': '系列“{name}”：{consoles} 上共 {count} 款游戏。点击查看全部。',
  'series.modalTitle': '{title}：整个系列',
};

export const COLLECTION_STRINGS: Record<string, Dict> = { en: EN, ru: RU, de: DE, es: ES, fr: FR, it: IT, sr: SR, ja: JA, zh: ZH };
