//go:build darwin

package aegisdesktop

import "os"

// Current returns the table for the running OS.
func Current() Platform {
	home, _ := os.UserHomeDir()
	return DarwinPlatform(home)
}
