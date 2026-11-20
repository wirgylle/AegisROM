// RU: Базовая версия (как в package.json) — для имён файлов и ссылок на релиз.
// EN: Base version (same as package.json) for file names and release links.
export const APP_BASE_VERSION = '0.6.0-dev';
// RU: Показываемая версия. Dev-сборки CI добавляют коммит: 0.6.0-dev+abc1234.
// EN: Displayed version. CI dev builds append the commit: 0.6.0-dev+abc1234.
export const APP_VERSION: string = import.meta.env.VITE_APP_VERSION || APP_BASE_VERSION;
export const APP_VERSION_TAG = `v${APP_VERSION} (Beta)`;
export const APP_FULL_TITLE = `AegisROM ${APP_VERSION_TAG}`;
export const SETUP_EXE_FILENAME = `AegisROM-Setup-v${APP_BASE_VERSION}-Win11-x64.exe`;
export const ZIP_PKG_FILENAME = `AegisROM-v${APP_BASE_VERSION}-Win11-x64.zip`;
export const PORTABLE_EXE_FILENAME = 'AegisROM-Portable-Win11-x64.exe';
// Бинарники публикуются только через GitHub Releases (тег vX.Y.Z, см. docs/releasing.md).
export const RELEASE_DOWNLOAD_BASE = `https://github.com/wirgylle/AegisROM/releases/download/v${APP_BASE_VERSION}`;
export const DOWNLOAD_SETUP_URL = `${RELEASE_DOWNLOAD_BASE}/${SETUP_EXE_FILENAME}`;
export const DOWNLOAD_ZIP_URL = `${RELEASE_DOWNLOAD_BASE}/${ZIP_PKG_FILENAME}`;
export const DOWNLOAD_PORTABLE_URL = `${RELEASE_DOWNLOAD_BASE}/${PORTABLE_EXE_FILENAME}`;
export const DOWNLOAD_SCANNER_EXE_URL = `${RELEASE_DOWNLOAD_BASE}/aegis-scanner-win11-x64.exe`;

// RU: Адреса для доната («Угостить разработчика кофе») лежат в src/data/donate.ts.
// EN: Donation addresses ("Buy the developer a coffee") live in src/data/donate.ts.
