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

test('WebDAV: default port, label, preset name', async () => {
  const { defaultPort, remoteLabel } = await import('./wifiTransfer.ts');
  assert.equal(defaultPort({ protocol: 'webdav' }), 80);
  assert.equal(defaultPort({ protocol: 'webdav', tls: true }), 443);
  assert.equal(defaultPort({ protocol: 'smb' }), 445);
  assert.equal(defaultPort({ protocol: 'sftp' }), 22);
  const base = { id: '1', name: 'n', host: '192.168.1.9', remoteDir: '/dav/roms', hasPassword: false } as const;
  assert.equal(remoteLabel({ ...base, protocol: 'webdav', auth: 'guest', user: 'x' }), 'http://192.168.1.9/dav/roms');
  assert.equal(remoteLabel({ ...base, protocol: 'webdav', auth: 'password', user: 'me', tls: true, port: 8443 }), 'https://me@192.168.1.9:8443/dav/roms');
  assert.equal(remoteLabel({ ...base, protocol: 'sftp', auth: 'password', user: 'ark', remoteDir: '/roms' }), 'sftp://ark@192.168.1.9/roms');
  assert.equal(profileFromPreset({ id: 'x', label: 'NAS (WebDAV)', protocol: 'webdav', auth: 'guest', remoteDir: '/' }).name, 'NAS');
});
