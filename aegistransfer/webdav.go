package aegistransfer

// WebDAV-клиент для заливки (RFC 4918): PROPFIND, MKCOL, PUT, MOVE, DELETE, GET.
// Вход: без пароля, Basic или Digest (MD5). Время файла на сервере выставить нельзя
// (getlastmodified защищён), поэтому после заливки на сервере стоит время заливки: оно новее
// исходника, и повторная заливка файл пропускает. Докачки нет: PUT с середины файла в WebDAV
// не стандартизован, оборванный файл заливается заново.
//
// WebDAV client for uploads (RFC 4918): PROPFIND, MKCOL, PUT, MOVE, DELETE, GET.
// Login: none, Basic or Digest (MD5). The server file time cannot be set (getlastmodified is
// protected), so after an upload it holds the upload time: newer than the source, so the next
// run skips the file. No resume: a PUT from the middle of a file is not standard in WebDAV, an
// interrupted file is sent again.

import (
	"context"
	"crypto/md5"
	"crypto/rand"
	"encoding/hex"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"
	"sync"
	"time"
)

// webdavRequestTimeout — запросы без тела файла / requests without a file body.
const webdavRequestTimeout = 30 * time.Second

// webdavMaxListing — предел ответа PROPFIND / PROPFIND answer limit.
const webdavMaxListing = 64 << 20

type webdavRemote struct {
	ctx    context.Context
	base   url.URL // scheme://host:port
	client *http.Client
	tr     *http.Transport
	user   string
	pass   string

	mu     sync.Mutex
	digest *digestChallenge
	nc     int
}

type digestChallenge struct {
	realm, nonce, opaque, qop, algorithm string
}

func newWebDAVRemote(ctx context.Context, p Profile, password string) *webdavRemote {
	scheme := "http"
	if p.TLS {
		scheme = "https"
	}
	tr := &http.Transport{
		// Приставка в локальной сети: системный прокси не нужен.
		// The handheld is on the local network: no system proxy.
		Proxy:                 nil,
		DialContext:           (&net.Dialer{Timeout: DialTimeout}).DialContext,
		TLSHandshakeTimeout:   DialTimeout,
		ResponseHeaderTimeout: 2 * time.Minute,
		MaxIdleConnsPerHost:   4,
		IdleConnTimeout:       60 * time.Second,
	}
	user, pass := p.User, password
	if p.Auth == AuthGuest {
		user, pass = "", ""
	}
	return &webdavRemote{
		ctx:  ctx,
		base: url.URL{Scheme: scheme, Host: net.JoinHostPort(p.Host, strconv.Itoa(p.EffectivePort()))},
		tr:   tr,
		client: &http.Client{
			Transport: tr,
			// Переадресацию разбираем сами: клиент Go превратил бы PROPFIND в GET.
			// Redirects are handled here: the Go client would turn PROPFIND into GET.
			CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
		},
		user: user,
		pass: pass,
	}
}

func dialWebDAV(ctx context.Context, p Profile, password string) (Remote, error) {
	r := newWebDAVRemote(ctx, p, password)
	// Проверка входа: PROPFIND папки ромов. 404 — вход есть, папки нет (это скажет Probe).
	// Login check: PROPFIND of the ROM folder. 404 means logged in, no folder (Probe reports it).
	_, code, err := r.propfind(collectionPath(p.RemoteDir), "0", propfindBody)
	if err != nil {
		switch code {
		case http.StatusNotFound, http.StatusConflict:
			return r, nil
		case http.StatusMethodNotAllowed, http.StatusNotImplemented:
			err = coded(CodeOther, fmt.Errorf("webdav: the server does not speak WebDAV: %w", err))
		}
		r.Close()
		return nil, err
	}
	return r, nil
}

func collectionPath(p string) string {
	p = path.Clean("/" + p)
	if p == "/" {
		return p
	}
	return p + "/"
}

func (r *webdavRemote) urlFor(p string) string {
	u := r.base
	u.Path = path.Clean("/" + p)
	if strings.HasSuffix(p, "/") && u.Path != "/" {
		u.Path += "/"
	}
	return u.String()
}

func drain(resp *http.Response) {
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 1<<20))
	resp.Body.Close()
}

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func md5hex(s string) string {
	sum := md5.Sum([]byte(s))
	return hex.EncodeToString(sum[:])
}

// parseDigest разбирает заголовок WWW-Authenticate: Digest ... / parses a Digest challenge.
func parseDigest(h string) *digestChallenge {
	if len(h) < 7 || !strings.EqualFold(h[:7], "digest ") {
		return nil
	}
	c := &digestChallenge{}
	rest := h[7:]
	for len(rest) > 0 {
		rest = strings.TrimLeft(rest, " ,")
		eq := strings.IndexByte(rest, '=')
		if eq < 0 {
			break
		}
		key := strings.ToLower(strings.TrimSpace(rest[:eq]))
		rest = rest[eq+1:]
		var val string
		if strings.HasPrefix(rest, `"`) {
			end := strings.IndexByte(rest[1:], '"')
			if end < 0 {
				val, rest = rest[1:], ""
			} else {
				val, rest = rest[1:1+end], rest[end+2:]
			}
		} else {
			end := strings.IndexByte(rest, ',')
			if end < 0 {
				val, rest = rest, ""
			} else {
				val, rest = rest[:end], rest[end:]
			}
		}
		switch key {
		case "realm":
			c.realm = val
		case "nonce":
			c.nonce = val
		case "opaque":
			c.opaque = val
		case "qop":
			c.qop = val
		case "algorithm":
			c.algorithm = val
		}
	}
	if c.nonce == "" {
		return nil
	}
	return c
}

// authorize ставит заголовок входа / sets the login header.
func (r *webdavRemote) authorize(req *http.Request) {
	if r.user == "" && r.pass == "" {
		return
	}
	r.mu.Lock()
	d := r.digest
	if d != nil {
		r.nc++
	}
	nc := r.nc
	r.mu.Unlock()
	if d == nil {
		req.SetBasicAuth(r.user, r.pass)
		return
	}
	uri := req.URL.RequestURI()
	ha1 := md5hex(r.user + ":" + d.realm + ":" + r.pass)
	ha2 := md5hex(req.Method + ":" + uri)
	var b strings.Builder
	fmt.Fprintf(&b, `Digest username="%s", realm="%s", nonce="%s", uri="%s"`, r.user, d.realm, d.nonce, uri)
	if strings.Contains(d.qop, "auth") {
		cnonce := randomHex(8)
		ncs := fmt.Sprintf("%08x", nc)
		resp := md5hex(ha1 + ":" + d.nonce + ":" + ncs + ":" + cnonce + ":auth:" + ha2)
		fmt.Fprintf(&b, `, qop=auth, nc=%s, cnonce="%s", response="%s"`, ncs, cnonce, resp)
	} else {
		fmt.Fprintf(&b, `, response="%s"`, md5hex(ha1+":"+d.nonce+":"+ha2))
	}
	if d.opaque != "" {
		fmt.Fprintf(&b, `, opaque="%s"`, d.opaque)
	}
	if d.algorithm != "" {
		fmt.Fprintf(&b, `, algorithm=%s`, d.algorithm)
	}
	req.Header.Set("Authorization", b.String())
}

// do отправляет запрос. body != nil — потоковое тело (без повтора), иначе при 401 с Digest
// запрос повторяется один раз.
// do sends a request. With a streamed body there is no retry; otherwise a 401 with a Digest
// challenge is retried once.
func (r *webdavRemote) do(method, p string, body io.Reader, size int64, hdr map[string]string) (*http.Response, error) {
	for attempt := 0; ; attempt++ {
		ctx := r.ctx
		var cancel context.CancelFunc
		if body == nil {
			ctx, cancel = context.WithTimeout(ctx, webdavRequestTimeout)
		}
		var rd io.Reader = body
		if body == nil && hdr["_body"] != "" {
			rd = strings.NewReader(hdr["_body"])
		}
		req, err := http.NewRequestWithContext(ctx, method, r.urlFor(p), rd)
		if err != nil {
			if cancel != nil {
				cancel()
			}
			return nil, err
		}
		if body != nil {
			req.ContentLength = size
		}
		for k, v := range hdr {
			if k != "_body" {
				req.Header.Set(k, v)
			}
		}
		if hdr["_body"] != "" {
			req.Header.Set("Content-Type", `application/xml; charset="utf-8"`)
		}
		r.authorize(req)
		resp, err := r.client.Do(req)
		if err != nil {
			if cancel != nil {
				cancel()
			}
			return nil, err
		}
		if cancel != nil {
			resp.Body = &cancelBody{ReadCloser: resp.Body, cancel: cancel}
		}
		if resp.StatusCode == http.StatusUnauthorized && body == nil && attempt == 0 && r.user != "" {
			if d := pickDigest(resp.Header.Values("WWW-Authenticate")); d != nil {
				r.mu.Lock()
				r.digest, r.nc = d, 0
				r.mu.Unlock()
				drain(resp)
				continue
			}
		}
		return resp, nil
	}
}

func pickDigest(values []string) *digestChallenge {
	for _, v := range values {
		if d := parseDigest(v); d != nil {
			return d
		}
	}
	return nil
}

type cancelBody struct {
	io.ReadCloser
	cancel context.CancelFunc
}

func (b *cancelBody) Close() error {
	err := b.ReadCloser.Close()
	b.cancel()
	return err
}

// statusErr переводит код ответа в ошибку с понятным кодом / turns a status into a coded error.
func statusErr(resp *http.Response, op, p string) error {
	base := fmt.Errorf("webdav %s %s: %s", op, p, resp.Status)
	switch resp.StatusCode {
	case http.StatusUnauthorized:
		return coded(CodeAuth, base)
	case http.StatusForbidden:
		return fmt.Errorf("%w: %w", base, fs.ErrPermission)
	case http.StatusNotFound, http.StatusConflict, http.StatusGone:
		return fmt.Errorf("%w: %w", base, fs.ErrNotExist)
	case http.StatusInsufficientStorage, http.StatusRequestEntityTooLarge:
		return coded(CodeNoSpace, base)
	}
	return base
}

const propfindBody = `<?xml version="1.0" encoding="utf-8"?>` +
	`<d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getcontentlength/><d:getlastmodified/></d:prop></d:propfind>`

const quotaBody = `<?xml version="1.0" encoding="utf-8"?>` +
	`<d:propfind xmlns:d="DAV:"><d:prop><d:quota-available-bytes/></d:prop></d:propfind>`

type davProp struct {
	ResourceType struct {
		Collection *struct{} `xml:"DAV: collection"`
	} `xml:"DAV: resourcetype"`
	Length   string `xml:"DAV: getcontentlength"`
	Modified string `xml:"DAV: getlastmodified"`
	Avail    string `xml:"DAV: quota-available-bytes"`
}

type davResponse struct {
	Href     string `xml:"DAV: href"`
	Propstat []struct {
		Status string  `xml:"DAV: status"`
		Prop   davProp `xml:"DAV: prop"`
	} `xml:"DAV: propstat"`
}

type davMultistatus struct {
	Responses []davResponse `xml:"DAV: response"`
}

// davItem — разобранная запись PROPFIND / a parsed PROPFIND entry.
type davItem struct {
	path  string // без «/» на конце / without a trailing slash
	entry RemoteEntry
	avail int64
}

func parseMultistatus(rd io.Reader) ([]davItem, error) {
	var ms davMultistatus
	if err := xml.NewDecoder(io.LimitReader(rd, webdavMaxListing)).Decode(&ms); err != nil {
		return nil, fmt.Errorf("webdav: bad PROPFIND answer: %w", err)
	}
	out := make([]davItem, 0, len(ms.Responses))
	for _, resp := range ms.Responses {
		u, err := url.Parse(strings.TrimSpace(resp.Href))
		if err != nil {
			continue
		}
		it := davItem{path: path.Clean("/" + u.Path), avail: -1}
		for _, ps := range resp.Propstat {
			// Свойства без «200» сервер не знает / properties without "200" are unknown to the server.
			if ps.Status != "" && !strings.Contains(ps.Status, " 200") {
				continue
			}
			pr := ps.Prop
			if pr.ResourceType.Collection != nil {
				it.entry.IsDir = true
			}
			if n, err := strconv.ParseInt(strings.TrimSpace(pr.Length), 10, 64); err == nil {
				it.entry.Size = n
			}
			if t, err := http.ParseTime(strings.TrimSpace(pr.Modified)); err == nil {
				it.entry.ModTime = t
			}
			if n, err := strconv.ParseInt(strings.TrimSpace(pr.Avail), 10, 64); err == nil {
				it.avail = n
			}
		}
		out = append(out, it)
	}
	return out, nil
}

func isRedirect(code int) bool {
	return code == http.StatusMovedPermanently || code == http.StatusFound ||
		code == http.StatusTemporaryRedirect || code == http.StatusPermanentRedirect
}

func (r *webdavRemote) propfind(p, depth, body string) ([]davItem, int, error) {
	resp, err := r.do("PROPFIND", p, nil, 0, map[string]string{"Depth": depth, "_body": body})
	if err != nil {
		return nil, 0, err
	}
	defer drain(resp)
	if resp.StatusCode != http.StatusMultiStatus {
		return nil, resp.StatusCode, statusErr(resp, "PROPFIND", p)
	}
	items, err := parseMultistatus(resp.Body)
	return items, resp.StatusCode, err
}

func (r *webdavRemote) ReadDir(dir string) (map[string]RemoteEntry, bool, error) {
	cp := collectionPath(dir)
	items, code, err := r.propfind(cp, "1", propfindBody)
	if err != nil {
		if code == http.StatusNotFound || code == http.StatusConflict {
			return map[string]RemoteEntry{}, false, nil
		}
		return nil, false, err
	}
	self := path.Clean(cp)
	out := make(map[string]RemoteEntry, len(items))
	for _, it := range items {
		if it.path == self || path.Dir(it.path) != self {
			continue
		}
		out[path.Base(it.path)] = it.entry
	}
	return out, true, nil
}

func (r *webdavRemote) Stat(p string) (RemoteEntry, error) {
	clean := path.Clean("/" + p)
	items, code, err := r.propfind(clean, "0", propfindBody)
	if isRedirect(code) {
		// Папку без «/» сервер переадресует на «папка/» / a folder without "/" redirects to "folder/".
		items, code, err = r.propfind(collectionPath(clean), "0", propfindBody)
	}
	if err != nil {
		return RemoteEntry{}, err
	}
	for _, it := range items {
		if it.path == clean {
			return it.entry, nil
		}
	}
	if len(items) == 1 {
		return items[0].entry, nil
	}
	return RemoteEntry{}, fmt.Errorf("webdav PROPFIND %s: no entry: %w", clean, fs.ErrNotExist)
}

func (r *webdavRemote) MkdirAll(dir string) error {
	dir = path.Clean("/" + dir)
	if dir == "/" {
		return nil
	}
	if st, err := r.Stat(dir); err == nil && st.IsDir {
		return nil
	}
	cur := ""
	for _, part := range strings.Split(strings.Trim(dir, "/"), "/") {
		cur += "/" + part
		resp, err := r.do("MKCOL", cur+"/", nil, 0, nil)
		if err != nil {
			return err
		}
		drain(resp)
		switch {
		case resp.StatusCode == http.StatusCreated, resp.StatusCode == http.StatusOK,
			resp.StatusCode == http.StatusNoContent:
		case resp.StatusCode == http.StatusMethodNotAllowed, isRedirect(resp.StatusCode):
			// Уже есть / already there.
		default:
			return statusErr(resp, "MKCOL", cur)
		}
	}
	return nil
}

// webdavWriter — PUT, тело которого пишется через трубу / a PUT whose body is written through a pipe.
type webdavWriter struct {
	pw   *io.PipeWriter
	done chan error
}

func (w *webdavWriter) Write(b []byte) (int, error) { return w.pw.Write(b) }

func (w *webdavWriter) Close() error {
	_ = w.pw.Close()
	return <-w.done
}

func (r *webdavRemote) put(p string, size int64) io.WriteCloser {
	pr, pw := io.Pipe()
	w := &webdavWriter{pw: pw, done: make(chan error, 1)}
	go func() {
		resp, err := r.do(http.MethodPut, p, pr, size, nil)
		if err == nil {
			drain(resp)
			if resp.StatusCode < 200 || resp.StatusCode > 299 {
				err = statusErr(resp, "PUT", p)
			}
		}
		// Ошибка отдаётся и пишущему, чтобы он не ждал. / The writer gets the error too, so it stops.
		if err != nil {
			pr.CloseWithError(err)
		} else {
			_ = pr.Close()
		}
		w.done <- err
	}()
	return w
}

// OpenWrite без докачки: offset > 0 не поддерживается / no resume: offset > 0 is unsupported.
func (r *webdavRemote) OpenWrite(p string, offset int64) (io.WriteCloser, error) {
	if offset > 0 {
		return nil, errors.New("webdav: resume is not supported")
	}
	return r.put(p, -1), nil
}

// OpenWriteSize — PUT с известной длиной (не все серверы принимают chunked).
// OpenWriteSize is a PUT with a known length (not every server accepts chunked bodies).
func (r *webdavRemote) OpenWriteSize(p string, size int64) (io.WriteCloser, error) {
	return r.put(p, size), nil
}

// CanResume: WebDAV не дописывает файл с середины / WebDAV does not append from the middle.
func (r *webdavRemote) CanResume() bool { return false }

func (r *webdavRemote) OpenRead(p string) (io.ReadCloser, error) {
	resp, err := r.do(http.MethodGet, p, nil, 0, nil)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		drain(resp)
		return nil, statusErr(resp, "GET", p)
	}
	return resp.Body, nil
}

func (r *webdavRemote) Replace(from, to string) error {
	resp, err := r.do("MOVE", from, nil, 0, map[string]string{"Destination": r.urlFor(to), "Overwrite": "T"})
	if err != nil {
		return err
	}
	drain(resp)
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return statusErr(resp, "MOVE", from)
	}
	return nil
}

func (r *webdavRemote) Remove(p string) error {
	resp, err := r.do(http.MethodDelete, p, nil, 0, nil)
	if err != nil {
		return err
	}
	drain(resp)
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return statusErr(resp, "DELETE", p)
	}
	return nil
}

// Chtimes: время на WebDAV-сервере не меняется (см. начало файла) / server time cannot be set.
func (r *webdavRemote) Chtimes(string, time.Time) error { return nil }

func (r *webdavRemote) FreeBytes(dir string) int64 {
	items, _, err := r.propfind(collectionPath(dir), "0", quotaBody)
	if err != nil || len(items) == 0 {
		return -1
	}
	return items[0].avail
}

func (r *webdavRemote) Close() error {
	r.tr.CloseIdleConnections()
	return nil
}
