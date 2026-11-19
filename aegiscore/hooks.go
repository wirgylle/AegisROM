package aegiscore

import "sync"

var (
	hooksMu sync.RWMutex
	logHook func(line string)

	// Путь к gamelist.xml, выбранному пользователем вручную. Проверяется первым
	// при поиске названия рома.
	selectedCustomXmlPath string
)

// SetLogger задаёт, куда ядро пишет строки журнала (в GUI — окно лога).
// nil отключает журнал.
func SetLogger(fn func(line string)) {
	hooksMu.Lock()
	logHook = fn
	hooksMu.Unlock()
}

func logLine(line string) {
	hooksMu.RLock()
	fn := logHook
	hooksMu.RUnlock()
	if fn != nil {
		fn(line)
	}
}

// SetCustomXMLPath задаёт gamelist.xml, выбранный пользователем ("" — не задан).
func SetCustomXMLPath(path string) { selectedCustomXmlPath = path }

// CustomXMLPath возвращает выбранный пользователем gamelist.xml или "".
func CustomXMLPath() string { return selectedCustomXmlPath }

// ResetScanCaches сбрасывает кэши gamelist.xml и нумерации файлов перед новым сканированием.
func ResetScanCaches() {
	cacheMu.Lock()
	gamelistTitleCache = make(map[string]map[string]string)
	gamelistEntryCache = make(map[string]map[string]GameEntryXML)
	seqNumberedDirCache = make(map[string]map[string]bool)
	cacheMu.Unlock()
}
