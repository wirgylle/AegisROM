//go:build darwin

package main

import (
	"net/http"

	"aegisgui/aegisapi"
)

// registerTransfer adds the Wi-Fi upload routes (SFTP, SMB). Device passwords go
// to the macOS Keychain through go-keyring (aegistransfer/secrets.go).
func registerTransfer(mux *http.ServeMux, appDir string) {
	aegisapi.RegisterTransferRoutes(mux, appDir, nil, aegisapi.TransferOptions{})
}
