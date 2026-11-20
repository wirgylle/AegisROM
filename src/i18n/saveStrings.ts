// Тексты менеджера сохранений (0.6.0). Лежат отдельно, как biosStrings.ts,
// чтобы не конфликтовать с параллельными ветками. Остальные языки берут английский текст.
// Save manager strings (0.6.0). Kept apart like biosStrings.ts;
// other languages fall back to English.

type Dict = Record<string, string>;

const EN: Dict = {
  'sv.footerDisk':
    'Saves are files next to the ROM: “{name}.srm” (written every 30 s and when you close this window) and “{name}.state” (Save State / Load State buttons). Previous versions are kept in the .aegis-saves folder. RetroArch picks these files up when it keeps saves in the game folder.',
  'sv.written': 'Saved {name} at {time}.',
  'sv.writeFailed': 'Could not write {name}: {err}',
  'sv.stateSaved': 'State saved: {name}',
  'sv.stateLoaded': 'State loaded: {name}',
  'sv.noState': 'No saved state yet ({name})',
  'sv.logWritten': '{title}: save written to {name}',
  'sv.logWrittenBackup': '{title}: save written to {name}, previous version kept as {backup}',
};

const RU: Dict = {
  'sv.footerDisk':
    'Сохранения лежат файлами рядом с ромом: «{name}.srm» (пишется каждые 30 с и при закрытии окна) и «{name}.state» (кнопки «Сохранить состояние» и «Загрузить состояние»). Прошлые версии хранятся в папке .aegis-saves. RetroArch подхватит эти файлы, если хранит сохранения в папке игры.',
  'sv.written': '{name} записан в {time}.',
  'sv.writeFailed': 'Не удалось записать {name}: {err}',
  'sv.stateSaved': 'Состояние сохранено: {name}',
  'sv.stateLoaded': 'Состояние загружено: {name}',
  'sv.noState': 'Сохранённого состояния пока нет ({name})',
  'sv.logWritten': '{title}: сохранение записано в {name}',
  'sv.logWrittenBackup': '{title}: сохранение записано в {name}, прошлая версия сохранена как {backup}',
};

export const SAVE_STRINGS: Record<string, Dict> = { en: EN, ru: RU };
