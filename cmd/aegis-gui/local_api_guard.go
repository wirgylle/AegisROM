package main

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// Local API protection for the hybrid desktop server on 127.0.0.1.
//
// The server exposes endpoints that launch executables, read files from disk and
// rewrite the library DB. Binding to loopback alone does not protect them: any web
// page open in the user's browser can send requests to 127.0.0.1, and a DNS
// rebinding attack can make such requests look same-origin. The guard below:
//
//  1. Rejects requests whose Host header is not our own loopback address
//     (blocks DNS rebinding).
//  2. For /api/*: rejects requests coming from another origin (Origin and
//     Sec-Fetch-Site headers).
//  3. For /api/*: requires a per-launch random session token, delivered to the
//     app page as an HttpOnly SameSite=Strict cookie, or sent by native Go
//     clients in the X-Aegis-Token header.

const localAPITokenHeader = "X-Aegis-Token"

// localAPITokenFileName stores the token of the running instance so that a newer
// launch can ask it to shut down via /api/native/shutdown.
const localAPITokenFileName = "native-api.token"

func newLocalAPIToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func readLocalAPITokenFile(appDir string) string {
	b, err := os.ReadFile(filepath.Join(appDir, localAPITokenFileName))
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(b))
}

func writeLocalAPITokenFile(appDir, token string) {
	_ = os.WriteFile(filepath.Join(appDir, localAPITokenFileName), []byte(token), 0600)
}

// localAPISessionCookieName includes the port, because browsers share cookies
// between ports of the same host.
func localAPISessionCookieName(port string) string {
	return "aegis_session_" + port
}

type localAPIGuard struct {
	next       http.Handler
	token      string
	port       string
	cookieName string
}

func newLocalAPIGuard(next http.Handler, token, port string) *localAPIGuard {
	return &localAPIGuard{
		next:       next,
		token:      token,
		port:       port,
		cookieName: localAPISessionCookieName(port),
	}
}

func (g *localAPIGuard) allowedHost(host string) bool {
	h := strings.ToLower(host)
	return h == "127.0.0.1:"+g.port || h == "localhost:"+g.port
}

func (g *localAPIGuard) allowedOrigin(origin string) bool {
	o := strings.ToLower(strings.TrimRight(origin, "/"))
	return o == "http://127.0.0.1:"+g.port || o == "http://localhost:"+g.port
}

func (g *localAPIGuard) tokenMatches(candidate string) bool {
	if candidate == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(candidate), []byte(g.token)) == 1
}

func (g *localAPIGuard) authorized(r *http.Request) bool {
	if g.tokenMatches(r.Header.Get(localAPITokenHeader)) {
		return true
	}
	if c, err := r.Cookie(g.cookieName); err == nil && g.tokenMatches(c.Value) {
		return true
	}
	return false
}

func (g *localAPIGuard) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if !g.allowedHost(r.Host) {
		http.Error(w, "Forbidden host", http.StatusForbidden)
		return
	}

	if !strings.HasPrefix(r.URL.Path, "/api/") {
		// App page and static assets: hand the session cookie to the app window.
		// SameSite=Strict keeps the browser from sending it on requests that
		// other sites trigger, and from accepting it from cross-site responses.
		http.SetCookie(w, &http.Cookie{
			Name:     g.cookieName,
			Value:    g.token,
			Path:     "/",
			HttpOnly: true,
			SameSite: http.SameSiteStrictMode,
		})
		g.next.ServeHTTP(w, r)
		return
	}

	if origin := r.Header.Get("Origin"); origin != "" && !g.allowedOrigin(origin) {
		http.Error(w, "Forbidden origin", http.StatusForbidden)
		return
	}
	switch r.Header.Get("Sec-Fetch-Site") {
	case "", "same-origin", "none":
	default:
		http.Error(w, "Forbidden cross-site request", http.StatusForbidden)
		return
	}
	if !g.authorized(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	g.next.ServeHTTP(w, r)
}
