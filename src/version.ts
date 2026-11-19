export const APP_VERSION = '0.5.5';
export const APP_VERSION_TAG = `v${APP_VERSION} (Beta)`;
export const APP_FULL_TITLE = `AegisROM ${APP_VERSION_TAG}`;
export const SETUP_EXE_FILENAME = `AegisROM-Setup-v${APP_VERSION}-Win11-x64.exe`;
export const ZIP_PKG_FILENAME = `AegisROM-v${APP_VERSION}-Win11-x64.zip`;
export const PORTABLE_EXE_FILENAME = 'AegisROM-Portable-Win11-x64.exe';
// Бинарники публикуются только через GitHub Releases (тег vX.Y.Z, см. docs/releasing.md).
export const RELEASE_DOWNLOAD_BASE = `https://github.com/wirgylle/AegisROM/releases/download/v${APP_VERSION}`;
export const DOWNLOAD_SETUP_URL = `${RELEASE_DOWNLOAD_BASE}/${SETUP_EXE_FILENAME}`;
export const DOWNLOAD_ZIP_URL = `${RELEASE_DOWNLOAD_BASE}/${ZIP_PKG_FILENAME}`;
export const DOWNLOAD_PORTABLE_URL = `${RELEASE_DOWNLOAD_BASE}/${PORTABLE_EXE_FILENAME}`;
export const DOWNLOAD_SCANNER_EXE_URL = `${RELEASE_DOWNLOAD_BASE}/aegis-scanner-win11-x64.exe`;
