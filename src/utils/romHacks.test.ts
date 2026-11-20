// Тесты распознавания хаков: `npm test`. / Hack detection tests: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  describeRomMod,
  detectRomMod,
  isInHackFolder,
  linkPatchesToRom,
  modGroup,
  modTag,
  refineModWithDat,
} from './romHacks.ts';

test('original ROM stays original', () => {
  const m = detectRomMod('Super Mario Bros. (World).nes', 'nes/Super Mario Bros. (World).nes');
  assert.equal(m.kind, 'original');
  assert.equal(modTag(m), '');
});

test('GoodTools translation tag with version and author', () => {
  const m = detectRomMod('Final Fantasy (U) [T+Rus1.0_Shedevr].nes');
  assert.equal(m.kind, 'translation');
  assert.equal(m.language, 'Rus');
  assert.equal(m.version, '1.0');
  assert.equal(m.author, 'Shedevr');
  assert.equal(m.originalName, 'Final Fantasy (U).nes');
  assert.equal(modTag(m), 'T+Rus');
  assert.equal(modGroup(m.kind), 'translation');
});

test('older translation [T-Eng] and full language name', () => {
  assert.equal(detectRomMod('Mother (J) [T-Eng].nes').language, 'Eng');
  assert.equal(detectRomMod('Seiken (J) [T+English v1.2 by DeJap].sfc').author, 'DeJap');
});

test('word translation tags', () => {
  const m = detectRomMod('Chrono Trigger (USA) (Rus Translation by Chief-Net).sfc');
  assert.equal(m.kind, 'translation');
  assert.equal(m.language, 'Rus');
  assert.equal(m.author, 'Chief-Net');
});

test('hack tags', () => {
  assert.equal(detectRomMod('Super Mario Bros. (W) [h1].nes').kind, 'hack');
  assert.equal(detectRomMod('Contra (U) [hM02].nes').kind, 'hack');
  const named = detectRomMod('Super Mario World (USA) (Kaizo Hack).sfc');
  assert.equal(named.kind, 'hack');
  assert.equal(named.hackName, 'Kaizo');
  assert.equal(detectRomMod('Sonic (USA) [Hack].md').kind, 'hack');
  // Хак + перевод — это хак. / Hack + translation is a hack.
  assert.equal(detectRomMod('Zelda (U) [h1][T+Rus].nes').kind, 'hack');
});

test('fix, trainer, patched', () => {
  assert.equal(detectRomMod('Game (E) [f1].nes').kind, 'fix');
  assert.equal(detectRomMod('Game (U) [t1].nes').kind, 'trainer');
  assert.equal(detectRomMod('Game (USA) (Patched).sfc').kind, 'patched');
  assert.equal(modGroup('fix'), 'patched');
});

test('hackroms/ folder marks an untagged ROM as patched', () => {
  assert.equal(isInHackFolder('snes/hackroms/Game.sfc'), true);
  assert.equal(isInHackFolder('snes/Game hackroms.sfc'), false);
  const m = detectRomMod('Game.sfc', 'snes/HackRoms/Game.sfc');
  assert.equal(m.kind, 'patched');
  assert.equal(m.source, 'folder');
});

test('DAT refinement', () => {
  const tagged = detectRomMod('Game (U) [h1].nes');
  const clean = refineModWithDat(tagged, { matched: true, name: 'Game (USA)' });
  assert.equal(clean.kind, 'original');
  assert.equal(clean.mislabeled, true);
  const miss = refineModWithDat(tagged, { matched: false });
  assert.equal(miss.datMiss, true);
  assert.equal(miss.kind, 'hack');
});

test('patch linking by CRC', () => {
  const patches = [{ name: 'rus.bps', relativePath: 'snes/patch/rus.bps', sourceCrc32: 'aaaa0001', targetCrc32: 'bbbb0002' }];
  const patched = linkPatchesToRom(detectRomMod('Game.sfc'), ['BBBB0002'], patches);
  assert.equal(patched.kind, 'patched');
  assert.equal(patched.patchFile, 'rus.bps');
  const clean = linkPatchesToRom(detectRomMod('Game (USA).sfc'), ['aaaa0001'], patches);
  assert.equal(clean.kind, 'original');
  assert.deepEqual(clean.availablePatches, ['rus.bps']);
});

test('description lists what differs', () => {
  const tf = (k: string, v?: Record<string, string | number>) => `${k}${v ? JSON.stringify(v) : ''}`;
  const d = describeRomMod(detectRomMod('Final Fantasy (U) [T+Rus1.0_Shedevr].nes'), tf);
  assert.match(d, /hack\.desc\.translationTo/);
  assert.match(d, /Shedevr/);
  assert.match(d, /Final Fantasy \(U\)\.nes/);
});
