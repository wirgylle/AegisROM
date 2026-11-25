// Что скраппер реально записал на диск и почему не записал остальное.
// Раньше лог говорил «найдено N» (название совпало), а записанных файлов было в разы меньше:
// у рома уже была обложка, не хватало видео или логотипа, а источник давал только обложку.
// What the scraper actually wrote to disk and why it did not write the rest.
// The log used to say "found N" (title matched) while far fewer files were written:
// the ROM already had box art, it lacked a video or a logo, and the source only had box art.

import type { MediaSlot } from './scrapePlan';

export const SLOT_ORDER: MediaSlot[] = ['image', 'thumb', 'marquee', 'video'];

// Слоты, которые этому рому ещё нужны: нет рабочего файла и тип выбран в окне запуска.
// Slots this ROM still needs: no working file and the type was chosen in the start dialog.
export function neededSlots(toDownload: Set<MediaSlot>, wanted: Set<MediaSlot>): Set<MediaSlot> {
  return new Set(SLOT_ORDER.filter((s) => toDownload.has(s) && wanted.has(s)));
}

// Слоты источника, которые закрывают нужные. / The source's slots that cover needed ones.
export function usefulSlots(needed: Set<MediaSlot>, offer: Partial<Record<MediaSlot, unknown>> | null | undefined): MediaSlot[] {
  if (!offer) return [];
  return SLOT_ORDER.filter((s) => needed.has(s) && Boolean(offer[s]));
}

export type WriteFail = 'link-broken' | 'rejected' | 'io-error';

export interface ScrapeWriteStats {
  // Ромы, у которых записан хотя бы один файл. / ROMs with at least one file written.
  written: number;
  // Название найдено, но у источника нет ни одного нужного типа. / Title matched, the source had none of the needed types.
  nothingNew: number;
  // Каких типов не хватало у ромов из nothingNew. / Which types the nothingNew ROMs lacked.
  nothingNewLacked: Record<MediaSlot, number>;
  // Нужный файл был, но не записан. / A needed file existed but was not written.
  failed: number;
  failedBy: Record<WriteFail, number>;
  // Файлы, прочитанные через ссылку-симлинк. / Files read through a symlink stub.
  viaLink: number;
}

export function emptyWriteStats(): ScrapeWriteStats {
  return {
    written: 0,
    nothingNew: 0,
    nothingNewLacked: { image: 0, thumb: 0, marquee: 0, video: 0 },
    failed: 0,
    failedBy: { 'link-broken': 0, rejected: 0, 'io-error': 0 },
    viaLink: 0,
  };
}

// Итог по одному рому с найденным названием. / One matched ROM's outcome.
export function recordRomWrite(
  st: ScrapeWriteStats,
  needed: Set<MediaSlot>,
  offered: MediaSlot[],
  results: Partial<Record<MediaSlot, 'ok' | WriteFail>>
): void {
  if (offered.length === 0) {
    st.nothingNew++;
    for (const s of needed) st.nothingNewLacked[s]++;
    return;
  }
  const vals = Object.values(results);
  if (vals.includes('ok')) {
    st.written++;
    return;
  }
  st.failed++;
  // Причина рома — первая по важности среди его слотов. / The ROM's reason: the first that applies.
  const why: WriteFail = vals.includes('link-broken') ? 'link-broken' : vals.includes('rejected') ? 'rejected' : 'io-error';
  st.failedBy[why]++;
}
