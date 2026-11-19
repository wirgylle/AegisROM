package aegisapi

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func newTestGuard() *Guard {
	ok := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	return NewGuard(ok, "secret-token", "38470")
}

func TestLocalAPIGuard(t *testing.T) {
	cookie := &http.Cookie{Name: SessionCookieName("38470"), Value: "secret-token"}

	cases := []struct {
		name   string
		method string
		path   string
		host   string
		setup  func(r *http.Request)
		want   int
	}{
		{"app page sets cookie", "GET", "/", "127.0.0.1:38470", nil, 200},
		{"rebinding host rejected on page", "GET", "/", "evil.example:38470", nil, 403},
		{"api without token", "GET", "/api/native/status", "127.0.0.1:38470", nil, 401},
		{"api with cookie", "POST", "/api/native/emulators/launch", "127.0.0.1:38470", func(r *http.Request) {
			r.AddCookie(cookie)
			r.Header.Set("Origin", "http://127.0.0.1:38470")
			r.Header.Set("Sec-Fetch-Site", "same-origin")
		}, 200},
		{"api with localhost host and cookie", "GET", "/api/native/fs/media", "localhost:38470", func(r *http.Request) {
			r.AddCookie(cookie)
		}, 200},
		{"api with header token (native client)", "POST", "/api/native/shutdown", "127.0.0.1:38470", func(r *http.Request) {
			r.Header.Set(TokenHeader, "secret-token")
		}, 200},
		{"api with wrong token", "POST", "/api/native/shutdown", "127.0.0.1:38470", func(r *http.Request) {
			r.Header.Set(TokenHeader, "nope")
		}, 401},
		{"foreign origin rejected", "POST", "/api/native/emulators/launch", "127.0.0.1:38470", func(r *http.Request) {
			r.AddCookie(cookie)
			r.Header.Set("Origin", "https://evil.example")
		}, 403},
		{"other local port origin rejected", "POST", "/api/db/sync", "127.0.0.1:38470", func(r *http.Request) {
			r.AddCookie(cookie)
			r.Header.Set("Origin", "http://127.0.0.1:3000")
		}, 403},
		{"cross-site fetch metadata rejected", "GET", "/api/native/fs/media", "127.0.0.1:38470", func(r *http.Request) {
			r.AddCookie(cookie)
			r.Header.Set("Sec-Fetch-Site", "cross-site")
		}, 403},
		{"rebinding host rejected on api", "POST", "/api/native/emulators/launch", "evil.example:38470", func(r *http.Request) {
			r.AddCookie(cookie)
		}, 403},
	}

	g := newTestGuard()
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest(tc.method, "http://"+tc.host+tc.path, nil)
			r.Host = tc.host
			if tc.setup != nil {
				tc.setup(r)
			}
			w := httptest.NewRecorder()
			g.ServeHTTP(w, r)
			if w.Code != tc.want {
				t.Fatalf("status = %d, want %d", w.Code, tc.want)
			}
		})
	}
}

func TestLocalAPIGuardPageSetsStrictCookie(t *testing.T) {
	g := newTestGuard()
	r := httptest.NewRequest("GET", "http://127.0.0.1:38470/", nil)
	w := httptest.NewRecorder()
	g.ServeHTTP(w, r)
	cookies := w.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("got %d cookies, want 1", len(cookies))
	}
	c := cookies[0]
	if c.Value != "secret-token" || !c.HttpOnly || c.SameSite != http.SameSiteStrictMode {
		t.Fatalf("unexpected cookie: %+v", c)
	}
}
