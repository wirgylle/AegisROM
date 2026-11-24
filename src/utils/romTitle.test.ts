// Тесты названий ромов и имён файлов: `npm test`. / ROM title and file name tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractCleanTitle,
  isNumberedRomFilename,
  canBuildNameFromTitle,
  isPlausibleTitleText,
  prettifyBinaryHeaderTitle,
  stripFileExtension,
} from './romTitle.ts';
import { DEFAULT_FILENAME_CONFIG, formatRomFilenameByConfig } from './filenameConstructor.ts';

// Полный цикл «имя → название → новое имя» как в переименовании.
// Full "name → title → new name" cycle, as in the rename.
function rename(fileName: string, region = 'USA', numericConfirmed = false): string {
  const title = extractCleanTitle(fileName);
  if (!canBuildNameFromTitle(title, numericConfirmed || !isNumberedRomFilename(fileName))) return fileName;
  return formatRomFilenameByConfig({ cleanTitle: title, region, extension: '.zip' }, DEFAULT_FILENAME_CONFIG);
}

test('названия с точками и цифрами не теряются', () => {
  assert.equal(extractCleanTitle('E.T. (USA).zip'), 'E.T.');
  assert.equal(extractCleanTitle('P.O.W. - Prisoners of War (USA).zip'), 'P.O.W. - Prisoners of War');
  assert.equal(extractCleanTitle('1942 (USA).zip'), '1942');
  assert.equal(extractCleanTitle('1943 - The Battle of Midway (USA).zip'), '1943 - The Battle of Midway');
  assert.equal(extractCleanTitle('2020 Super Baseball (USA).sfc'), '2020 Super Baseball');
  assert.equal(extractCleanTitle('10 Yard Fight (USA).nes'), '10 Yard Fight');
});

test('названия из DAT без расширения не режутся по точке', () => {
  assert.equal(extractCleanTitle('E.T. The Extra-Terrestrial (USA)'), 'E.T. The Extra-Terrestrial');
  assert.equal(extractCleanTitle('Dr. Mario (Japan, USA)'), 'Dr. Mario');
  assert.equal(extractCleanTitle('Super Mario Bros. 3 (USA)'), 'Super Mario Bros. 3');
  assert.equal(extractCleanTitle('Mr. Do! (USA)'), 'Mr. Do!');
  assert.equal(stripFileExtension('Contra (USA).nes'), 'Contra (USA)');
  assert.equal(stripFileExtension('Contra (USA).7z'), 'Contra (USA)');
  assert.equal(stripFileExtension('Contra (USA).ZIP'), 'Contra (USA)');
});

test('номера-индексы по-прежнему отрезаются', () => {
  assert.equal(extractCleanTitle('001 - Contra (Japan).nes'), 'Contra');
  assert.equal(extractCleanTitle('02. Sonic the Hedgehog (Europe).md'), 'Sonic the Hedgehog');
  assert.equal(extractCleanTitle('001 Contra.nes'), 'Contra');
  assert.equal(extractCleanTitle('007 - GoldenEye (USA).z64'), '007 - GoldenEye');
  assert.equal(isNumberedRomFilename('0001.zip'), true);
  assert.equal(isNumberedRomFilename('1942.zip'), true);
});

test('«1942 (USA)» — название, а не номер', () => {
  assert.equal(isNumberedRomFilename('1942 (USA).zip'), false);
  assert.equal(isNumberedRomFilename('1943 (Japan) (Rev 1).nes'), false);
  assert.equal(isNumberedRomFilename('0001 (USA).zip'), true);
  // В папке с подряд идущими номерами «1943 - The Battle of Midway» тоже не номер.
  assert.equal(isNumberedRomFilename('1943 - The Battle of Midway (USA).zip', '', true), false);
  assert.equal(isNumberedRomFilename('12 - Contra.nes', '', true), true);
});

test('имя из одних тегов: названия нет, регион не дописывается', () => {
  assert.equal(extractCleanTitle('(USA).zip'), '');
  assert.equal(extractCleanTitle('(USA) (USA).zip'), '');
  assert.equal(canBuildNameFromTitle(''), false);
  assert.equal(canBuildNameFromTitle('(USA)'), false);
  assert.equal(canBuildNameFromTitle('...'), false);
  assert.equal(rename('(USA).zip'), '(USA).zip');
  assert.equal(rename('(USA) (USA).zip'), '(USA) (USA).zip');
});

test('повторное переименование ничего не меняет', () => {
  for (const name of [
    '1942 (USA).zip',
    'E.T. - The Extra-Terrestrial (USA).zip',
    'E.T. (USA).zip',
    'P.O.W. - Prisoners of War (USA).zip',
    'Super Mario Bros. 3 (USA).zip',
    'Contra (USA).zip',
  ]) {
    const once = rename(name);
    assert.equal(once, name, name);
    assert.equal(rename(once), once, name);
  }
});

test('название-число из DAT даёт имя файла', () => {
  assert.equal(canBuildNameFromTitle('1942'), false);
  assert.equal(canBuildNameFromTitle('1942', true), true);
  assert.equal(rename('1942.zip', 'USA', true), '1942 (USA).zip');
  assert.equal(rename('1942.zip'), '1942.zip');
});

test('точка в конце названия сохраняется', () => {
  assert.equal(
    formatRomFilenameByConfig({ cleanTitle: 'E.T.', region: 'USA', extension: '.zip' }, DEFAULT_FILENAME_CONFIG),
    'E.T. (USA).zip'
  );
  assert.equal(
    formatRomFilenameByConfig({ cleanTitle: '...', region: 'USA', extension: '.zip' }, DEFAULT_FILENAME_CONFIG),
    'Unknown_Game (USA).zip'
  );
});

test('мусор из заголовка рома не становится названием', () => {
  for (const junk of [')6el', '!-gKw)(', '}{a~b', 'x|yz']) {
    assert.equal(isPlausibleTitleText(junk), false, junk);
    assert.equal(prettifyBinaryHeaderTitle(junk), '', junk);
  }
  for (const ok of ['E.T.', 'P.O.W.', 'Q*bert', "Kirby's Dream Land 2", 'Ninja Gaiden III: The Ancient Ship of Doom', 'Tom & Jerry']) {
    assert.equal(isPlausibleTitleText(ok), true, ok);
  }
  assert.equal(prettifyBinaryHeaderTitle('CASTLEVANIA ARIA'), 'Castlevania Aria');
});
