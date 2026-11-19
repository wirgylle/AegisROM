package aegisapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestStorageRoundTrip(t *testing.T) {
	mux := http.NewServeMux()
	RegisterStorageRoutes(mux, t.TempDir(), nil)

	do := func(method, target, body string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, httptest.NewRequest(method, target, strings.NewReader(body)))
		return rec
	}

	if rec := do(http.MethodGet, "/api/native/storage?key=aegisrom_lang", ""); rec.Code != http.StatusNotFound {
		t.Fatalf("missing key: got %d, want 404", rec.Code)
	}
	if rec := do(http.MethodPut, "/api/native/storage?key=aegisrom_lang", "en"); rec.Code != http.StatusOK {
		t.Fatalf("put: got %d", rec.Code)
	}
	if rec := do(http.MethodGet, "/api/native/storage?key=aegisrom_lang", ""); rec.Body.String() != "en" {
		t.Fatalf("get: got %q", rec.Body.String())
	}

	var list struct {
		Keys map[string]string `json:"keys"`
	}
	if err := json.Unmarshal(do(http.MethodGet, "/api/native/storage", "").Body.Bytes(), &list); err != nil {
		t.Fatal(err)
	}
	if _, ok := list.Keys["aegisrom_lang"]; !ok || len(list.Keys) != 1 {
		t.Fatalf("list: got %v", list.Keys)
	}

	if rec := do(http.MethodDelete, "/api/native/storage?key=aegisrom_lang", ""); rec.Code != http.StatusOK {
		t.Fatalf("delete: got %d", rec.Code)
	}
	if rec := do(http.MethodGet, "/api/native/storage?key=aegisrom_lang", ""); rec.Code != http.StatusNotFound {
		t.Fatalf("after delete: got %d", rec.Code)
	}
}

func TestStorageRejectsBadKeys(t *testing.T) {
	mux := http.NewServeMux()
	RegisterStorageRoutes(mux, t.TempDir(), nil)
	for _, key := range []string{"..%2Fevil", "a%2Fb", "a%5Cb", strings.Repeat("x", 97)} {
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, httptest.NewRequest(http.MethodPut, "/api/native/storage?key="+key, strings.NewReader("x")))
		if rec.Code != http.StatusBadRequest {
			t.Errorf("key %q: got %d, want 400", key, rec.Code)
		}
	}
}
