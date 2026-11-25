// Ром взят из базы без скана: поля, которых у рома нет (жанр, год, ручные правки, PortMaster),
// сохраняем из записи, а меняем только то, что операции могли поменять у файла.
// Без parentHandle сборка не видела медиа рядом с ромом («Медиа найдены у 2 из 13363 игр»).
//
// ROM taken from the database without a scan: fields the ROM lacks (genre, year, manual edits,
// PortMaster) are kept from the record; only what operations may change on the file is replaced.
// Without parentHandle the build saw no media next to the ROM ("media found for 2 of 13363 games").
//
// Модуль без импортов значений, чтобы тесты шли через `node --test`.
// No value imports, so tests run with `node --test`.

import type { UnifiedGameRow } from '../components/FigmaConceptStudio';

export function mergeSessionRowIntoDbRow(row: UnifiedGameRow, dbRow: UnifiedGameRow): UnifiedGameRow {
  return {
    ...dbRow,
    id: row.id,
    title: row.title,
    oldFile: row.oldFile,
    cleanFile: row.cleanFile,
    relativePath: row.relativePath,
    size: row.size,
    totalBytes: row.totalBytes,
    crc32: row.crc32 || dbRow.crc32,
    boxArtUrl: row.boxArtUrl,
    videoUrl: row.videoUrl,
    status: row.status || dbRow.status,
    // Папка рома (handle) и медиа сеанса. / The ROM's folder handle and session media.
    parentHandle: row.parentHandle,
    media: row.media ? { ...(dbRow.media || {}), ...row.media } : dbRow.media,
    manualFile: row.manualFile || dbRow.manualFile,
    manualRel: row.manualRel || dbRow.manualRel,
    fileObj: row.fileObj,
    companionFiles: row.companionFiles,
    cueText: row.cueText,
    trackCount: row.trackCount,
    sourceExt: row.sourceExt,
    isMultiDisc: row.isMultiDisc,
    discCount: row.discCount,
    discs: row.discs,
    multiDiscFolderName: row.multiDiscFolderName,
    m3uFileName: row.m3uFileName,
    titleSource: row.titleSource || dbRow.titleSource,
    titleNote: row.titleNote,
    modKind: row.modKind,
    modTag: row.modTag,
    modLang: row.modLang,
    modNote: row.modNote,
    saveCount: row.saveCount,
  };
}
