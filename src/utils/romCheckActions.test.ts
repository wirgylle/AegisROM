import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildM3uList, guessTrackMode, matchCueRefs, planFixes, rewriteCue, singleTrackCue } from './romCheckActions.ts';
import type { RomCheckResult, RomCheckTarget } from './romCheck.ts';

test('matchCueRefs: letter case is fixed', () => {
  const map = matchCueRefs('Game.cue', ['game (track 1).bin'], ['Game (Track 1).bin', 'Game.cue']);
  assert.deepEqual([...map!.entries()], [['game (track 1).bin', 'Game (Track 1).bin']]);
});

test('matchCueRefs: renamed tracks are matched by the .cue name in track order', () => {
  const map = matchCueRefs(
    'Crash Bandicoot (Europe).cue',
    ['Crash (Track 1).bin', 'Crash (Track 2).bin'],
    ['Crash Bandicoot (Europe) (Track 2).bin', 'Crash Bandicoot (Europe) (Track 1).bin', 'Crash Bandicoot (Europe).cue', 'Other.bin']
  );
  assert.equal(map!.get('Crash (Track 1).bin'), 'Crash Bandicoot (Europe) (Track 1).bin');
  assert.equal(map!.get('Crash (Track 2).bin'), 'Crash Bandicoot (Europe) (Track 2).bin');
});

test('matchCueRefs: ambiguous folder gives null', () => {
  assert.equal(matchCueRefs('A.cue', ['x.bin'], ['A (Track 1).bin', 'A (Track 2).bin']), null);
  assert.equal(matchCueRefs('A.cue', ['x.bin'], ['B.bin']), null);
});

test('rewriteCue keeps the rest of the line', () => {
  const out = rewriteCue('FILE "a.bin" BINARY\n  TRACK 01 MODE2/2352', new Map([['a.bin', 'A.bin']]));
  assert.equal(out, 'FILE "A.bin" BINARY\r\n  TRACK 01 MODE2/2352');
});

test('buildM3uList picks discs of this game, CHD first, in disc order', () => {
  const list = buildM3uList('Final Fantasy VII (Europe).m3u', [
    'Final Fantasy VII (Europe) (Disc 2).chd',
    'Final Fantasy VII (Europe) (Disc 1).cue',
    'Final Fantasy VII (Europe) (Disc 1).chd',
    'Final Fantasy VII (Europe) (Disc 1).bin',
    '.hidden/Final Fantasy VII (Europe) (Disc 3).chd',
    'Final Fantasy VIII (Europe) (Disc 1).chd',
  ]);
  assert.deepEqual(list, [
    'Final Fantasy VII (Europe) (Disc 1).chd',
    'Final Fantasy VII (Europe) (Disc 2).chd',
    '.hidden/Final Fantasy VII (Europe) (Disc 3).chd',
  ]);
});

test('guessTrackMode', () => {
  const sync = [0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x00, 0, 2, 0, 2];
  assert.equal(guessTrackMode(Uint8Array.from(sync), 2352 * 10), 'MODE2/2352');
  sync[15] = 1;
  assert.equal(guessTrackMode(Uint8Array.from(sync), 2352 * 10), 'MODE1/2352');
  assert.equal(guessTrackMode(new Uint8Array(16), 2048 * 10), 'MODE1/2048');
  assert.equal(guessTrackMode(new Uint8Array(16), 1000), null);
  assert.match(singleTrackCue('a.bin', 'MODE2/2352'), /^FILE "a\.bin" BINARY\r\n  TRACK 01 MODE2\/2352\r\n/);
});

test('planFixes: per issue, CHD only with a path', () => {
  const file = (name: string) => Object.assign(new Blob(['x']), { name });
  const t: RomCheckTarget = { id: '1', title: 'A', console: 'psx', relativePath: 'psx/A.chd', file: file('A.chd'), parentHandle: {} };
  const r: RomCheckResult = { id: '1', title: 'A', console: 'psx', path: '', level: 'error', issues: [{ level: 'error', code: 'chdCookedTrack' }] };
  assert.deepEqual(planFixes(t, r, () => false), []);
  assert.deepEqual(planFixes(t, r, () => true).map((o) => o.kind), ['rebuildChd']);
  const cue: RomCheckTarget = { ...t, file: file('A.cue') };
  const rc: RomCheckResult = { ...r, issues: [{ level: 'error', code: 'cueMissingFile', params: { file: 'a.bin' } }] };
  assert.deepEqual(planFixes(cue, rc, () => false).map((o) => o.kind), ['cue']);
  const trunc: RomCheckResult = { ...r, issues: [{ level: 'error', code: 'romTruncated' }] };
  assert.deepEqual(planFixes(t, trunc, () => true), []);
});
