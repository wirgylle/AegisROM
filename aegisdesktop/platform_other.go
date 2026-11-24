//go:build !darwin

package aegisdesktop

import "os"

// Current returns the table for the running OS (Linux table outside macOS).
func Current() Platform {
	home, _ := os.UserHomeDir()
	return LinuxPlatform(home)
}
