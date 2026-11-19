// Package aegiscore — ядро AegisROM без привязки к ОС: каталог консолей,
// разбор заголовков ромов (PS1/CHD/PSP и др.), gamelist.xml, 1G1R-скоринг,
// дедупликация, поиск медиа и обложек.
//
// Пакет не импортирует syscall/Win32 и собирается под windows, linux и darwin.
// Оболочки (классический Win32 GUI, локальный HTTP-сервер, в будущем Wails и
// Docker) вызывают ядро, а не дублируют его логику.
package aegiscore
