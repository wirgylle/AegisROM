// Сохранения встроенного запуска рядом с ромом (менеджер сохранений, шаг 1).
// Saves of the in-app player stored next to the ROM (save manager, step 1).
// Go-часть: aegisapi/saves.go. Описание: docs/saves.md.

/** Где ром лежит на диске: те же поля, что у GET /api/native/fs/rom. */
export interface NativeRomRef {
  romFileName: string;
  relativePath: string;
  consoleCode: string;
  libraryPath: string;
  sdCardPath: string;
}

export type SaveKind = 'srm' | 'state';

export function nativeRomQuery(ref: NativeRomRef): string {
  return new URLSearchParams({
    romFileName: ref.romFileName || '',
    relativePath: ref.relativePath || '',
    consoleCode: ref.consoleCode || '',
    libraryPath: ref.libraryPath || '',
    sdCardPath: ref.sdCardPath || '',
  }).toString();
}

/** Имя файла сохранения без расширения, как у RetroArch: имя рома без последнего расширения. */
export function saveBaseName(romFileName: string): string {
  const base = (romFileName || 'game').split(/[\\/]/).pop() || 'game';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

export function sameBytes(a: Uint8Array | undefined, b: Uint8Array): boolean {
  if (!a || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
