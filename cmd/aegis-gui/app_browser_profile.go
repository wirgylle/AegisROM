//go:build windows
// +build windows

package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
)

// appBrowserProfileDirName is the persistent Edge/Chrome profile used for the
// --app window. Do not rename it: IndexedDB (saved folder handles) and the
// persistent File System Access grants live in this profile.
const appBrowserProfileDirName = "WebViewProfile_0_5_4"

// appBrowserArgs returns the command line for the standalone app window.
// The flags suppress browser UI that makes no sense for a desktop app:
// first-run wizard, "not your default browser" bar, translate bubble,
// "restore pages" bubble after an unclean exit, sync/sign-in nags.
func appBrowserArgs(appURL, profileDir string) []string {
	return []string{
		"--app=" + appURL,
		"--user-data-dir=" + profileDir,
		"--window-size=1500,940",
		"--no-first-run",
		"--no-default-browser-check",
		"--disable-default-apps",
		"--disable-sync",
		"--disable-session-crashed-bubble",
		"--hide-crash-restore-bubble",
		"--disable-features=Translate,TranslateUI",
	}
}

// prepareAppBrowserProfile merges a few preferences into the profile before
// the browser starts. Existing keys (site permissions, IndexedDB metadata,
// File System Access grants) are kept untouched; only the listed values are
// overwritten. If Preferences cannot be parsed, it is left as is.
func prepareAppBrowserProfile(profileDir string) {
	defaultDir := filepath.Join(profileDir, "Default")
	if err := os.MkdirAll(defaultDir, 0755); err != nil {
		return
	}
	prefsPath := filepath.Join(defaultDir, "Preferences")

	prefs := map[string]any{}
	if data, err := os.ReadFile(prefsPath); err == nil && len(data) > 0 {
		// UseNumber keeps large integers (timestamps) byte-exact on rewrite.
		dec := json.NewDecoder(bytes.NewReader(data))
		dec.UseNumber()
		if dec.Decode(&prefs) != nil {
			return
		}
	}

	setPref(prefs, false, "translate", "enabled")
	setPref(prefs, []string{"ru", "en"}, "translate_blocked_languages")
	setPref(prefs, false, "browser", "check_default_browser")
	setPref(prefs, true, "browser", "has_seen_welcome_page")
	setPref(prefs, false, "credentials_enable_service")
	setPref(prefs, false, "autofill", "profile_enabled")
	setPref(prefs, false, "autofill", "credit_card_enabled")
	setPref(prefs, "Normal", "profile", "exit_type")
	setPref(prefs, true, "profile", "exited_cleanly")
	setPref(prefs, false, "sync_promo", "show_on_first_run_allowed")

	out, err := json.Marshal(prefs)
	if err != nil {
		return
	}
	tmp := prefsPath + ".aegis-tmp"
	if os.WriteFile(tmp, out, 0644) != nil {
		return
	}
	if os.Rename(tmp, prefsPath) != nil {
		_ = os.Remove(tmp)
	}
}

func setPref(root map[string]any, value any, path ...string) {
	node := root
	for _, key := range path[:len(path)-1] {
		child, ok := node[key].(map[string]any)
		if !ok {
			child = map[string]any{}
			node[key] = child
		}
		node = child
	}
	node[path[len(path)-1]] = value
}
