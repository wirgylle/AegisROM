// Настройки по умолчанию: разбор, проверка значений, тема. / Default settings: parsing, validation, theme.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_APP_SETTINGS,
  normalizeAppSettings,
  resolveDarkMode,
} from './appSettings.ts';

test('normalizeAppSettings: empty or broken input gives factory values', () => {
  assert.deepEqual(normalizeAppSettings(null), DEFAULT_APP_SETTINGS);
  assert.deepEqual(normalizeAppSettings('oops'), DEFAULT_APP_SETTINGS);
  assert.deepEqual(normalizeAppSettings({}), DEFAULT_APP_SETTINGS);
});

test('normalizeAppSettings: keeps valid values, drops invalid and unknown ones', () => {
  const s = normalizeAppSettings({
    theme: 'dark',
    startSection: 'tools',
    libraryView: 'banana',
    deleteJunkPermanently: true,
    renameOnSort: 'yes',
    combineMoveMode: 'copy',
    sdFirmwareId: 'miyoo_onion',
    extra: 1,
  });
  assert.equal(s.theme, 'dark');
  assert.equal(s.startSection, 'tools');
  assert.equal(s.libraryView, DEFAULT_APP_SETTINGS.libraryView);
  assert.equal(s.deleteJunkPermanently, true);
  assert.equal(s.renameOnSort, DEFAULT_APP_SETTINGS.renameOnSort);
  assert.equal(s.combineMoveMode, 'copy');
  assert.equal(s.sdFirmwareId, 'miyoo_onion');
  assert.equal((s as any).extra, undefined);
});

test('resolveDarkMode follows the OS only in system mode', () => {
  assert.equal(resolveDarkMode('system', true), true);
  assert.equal(resolveDarkMode('system', false), false);
  assert.equal(resolveDarkMode('light', true), false);
  assert.equal(resolveDarkMode('dark', false), true);
});
