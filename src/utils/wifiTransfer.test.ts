import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRomSubfolder, formatBytes, joinLocalPath, profileFromPreset } from './wifiTransfer.ts';

test('build profile → ROM subfolder on the device', () => {
  assert.equal(buildRomSubfolder('r36s_arkos'), 'EASYROMS');
  assert.equal(buildRomSubfolder('steamdeck_emudeck'), 'Emulation/roms');
  assert.equal(buildRomSubfolder('something_else'), '');
});

test('joinLocalPath keeps the OS separator', () => {
  assert.equal(joinLocalPath('D:\\Builds\\R36S\\', 'EASYROMS'), 'D:\\Builds\\R36S\\EASYROMS');
  assert.equal(joinLocalPath('D:\\Builds', 'Emulation/roms'), 'D:\\Builds\\Emulation\\roms');
  assert.equal(joinLocalPath('/home/me/build', 'Roms'), '/home/me/build/Roms');
  assert.equal(joinLocalPath('/home/me/build', ''), '/home/me/build');
});

test('formatBytes', () => {
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(-1), '—');
  assert.equal(formatBytes(250 * 1024 ** 3), '250 GB');
});

test('profileFromPreset drops the protocol suffix', () => {
  const p = profileFromPreset({ id: 'arkos', label: 'R36S / ArkOS (SFTP)', protocol: 'sftp', user: 'ark', auth: 'password', remoteDir: '/roms' });
  assert.equal(p.name, 'R36S / ArkOS');
  assert.equal(p.remoteDir, '/roms');
  assert.equal(p.user, 'ark');
});
