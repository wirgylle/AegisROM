// Package aegisdesktop — нативные функции десктопа вне Windows (macOS, Linux):
// поиск и запуск эмуляторов, chdman, медиа рядом с ромами, выбор файлов.
//
// RU: Windows-версия (cmd/aegis-gui) пока держит свою копию этих обработчиков
// с Win32-диалогами. Пакет без cgo и без build-тегов в общей логике, чтобы её
// можно было тестировать на любой ОС; таблицы путей по ОС — в *_darwin.go и
// *_other.go.
//
// EN: Native desktop features outside Windows (macOS, Linux): emulator lookup
// and launch, chdman, media next to ROMs, file pickers. The Windows build
// (cmd/aegis-gui) still keeps its own copy of these handlers with Win32
// dialogs. Shared logic has no cgo and no build tags so it can be tested on
// any OS; per-OS path tables live in *_darwin.go and *_other.go.
package aegisdesktop
