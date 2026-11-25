package aegisdesktop

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"aegisgui/aegisapi"
	"aegisgui/aegiscore"
)

// FileFilter is one entry of a file picker filter; Patterns is "*.cue;*.chd".
type FileFilter struct {
	Name     string
	Patterns string
}

// Dialogs are the native pickers of the window (Wails on macOS).
type Dialogs interface {
	PickFolder(title, initialDir string) (string, error)
	// PickFile opens a file picker. On macOS .app bundles can be picked as files.
	PickFile(title string, filters []FileFilter) (string, error)
}

// Options configure RegisterRoutes.
type Options struct {
	AppDir   string
	Touch    func()
	Dialogs  Dialogs
	Platform Platform
	// Start runs an emulator; tests replace it. Defaults to exec.Cmd.Start.
	Start func(cmd *exec.Cmd) error
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(v)
}

func errString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

var mediaExts = map[string]bool{".png": true, ".jpg": true, ".jpeg": true, ".webp": true, ".mp4": true, ".webm": true}

// RegisterRoutes adds the /api/native/{fs,converter,emulators}/* routes that the
// Windows build serves from cmd/aegis-gui, with the same JSON shapes.
func RegisterRoutes(mux *http.ServeMux, o Options) {
	if o.Touch == nil {
		o.Touch = func() {}
	}
	if o.Start == nil {
		o.Start = func(cmd *exec.Cmd) error { return cmd.Start() }
	}
	plat := o.Platform
	appDir := o.AppDir
	h := func(pattern string, fn http.HandlerFunc) {
		mux.HandleFunc(pattern, func(w http.ResponseWriter, r *http.Request) {
			o.Touch()
			fn(w, r)
		})
	}

	h("/api/native/fs/pick-dir", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Title      string `json:"title"`
			InitialDir string `json:"initialDir"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		title := body.Title
		if title == "" {
			title = "Выберите папку библиотеки AegisROM"
		}
		chosen, err := o.Dialogs.PickFolder(title, body.InitialDir)
		writeJSON(w, map[string]any{"ok": err == nil && chosen != "", "path": chosen})
	})

	h("/api/native/fs/resolve-media", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			LibraryPath string `json:"libraryPath"`
			Items       []struct {
				ID        string `json:"id"`
				Title     string `json:"title"`
				CleanFile string `json:"cleanFile"`
				OldFile   string `json:"oldFile"`
			} `json:"items"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, map[string]any{"ok": false, "results": []any{}})
			return
		}
		images, videos := indexMedia(strings.TrimSpace(req.LibraryPath))
		results := make([]map[string]string, 0, len(req.Items))
		for _, it := range req.Items {
			img, vid := "", ""
			for _, cand := range []string{it.CleanFile, it.OldFile, it.Title} {
				if cand == "" {
					continue
				}
				k := strings.TrimSuffix(strings.ToLower(filepath.Base(cand)), strings.ToLower(filepath.Ext(cand)))
				if p, ok := images[k]; ok && img == "" {
					img = "/api/native/fs/media?path=" + url.QueryEscape(p)
				}
				if p, ok := videos[k]; ok && vid == "" {
					vid = "/api/native/fs/media?path=" + url.QueryEscape(p)
				}
			}
			results = append(results, map[string]string{"id": it.ID, "boxArtUrl": img, "videoUrl": vid})
		}
		writeJSON(w, map[string]any{"ok": true, "results": results})
	})

	h("/api/native/fs/media", func(w http.ResponseWriter, r *http.Request) {
		p := r.URL.Query().Get("path")
		if p == "" || !filepath.IsAbs(p) || !mediaExts[strings.ToLower(filepath.Ext(p))] {
			http.Error(w, "Invalid media path", http.StatusBadRequest)
			return
		}
		w.Header().Set("X-Content-Type-Options", "nosniff")
		http.ServeFile(w, r, p)
	})

	chdmanStatus := func() map[string]any {
		c := plat.FindChdman(appDir)
		return map[string]any{"ok": true, "chdmanAvailable": c != "", "chdmanPath": c, "toolsDir": ToolsDir(appDir)}
	}
	h("/api/native/converter/status", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, chdmanStatus())
	})
	h("/api/native/converter/select-chdman", func(w http.ResponseWriter, r *http.Request) {
		chosen, err := o.Dialogs.PickFile("Укажите файл chdman (brew install rom-tools) / Select the chdman binary", nil)
		if err == nil && chosen != "" {
			if !isRegularFile(chosen) {
				err = fmt.Errorf("файл не найден / file not found: %s", chosen)
			} else {
				err = SaveChdmanPath(appDir, chosen)
			}
		}
		res := chdmanStatus()
		res["ok"] = err == nil && chosen != ""
		res["error"] = errString(err)
		writeJSON(w, res)
	})
	h("/api/native/converter/verify", func(w http.ResponseWriter, r *http.Request) {
		aegisapi.HandleChdVerify(w, r, plat.FindChdman(appDir), nil)
	})
	h("/api/native/converter/chd", func(w http.ResponseWriter, r *http.Request) {
		handleChd(w, r, plat.FindChdman(appDir))
	})

	emuState := func(cfg EmulatorConfig) map[string]any {
		detected, cores := plat.DetectEmulators(cfg.CustomPaths)
		return map[string]any{
			"ok": true, "detectedPaths": detected, "customPaths": cfg.CustomPaths,
			"installedCores": cores, "starredByConsole": cfg.StarredByConsole,
		}
	}
	h("/api/native/emulators/status", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, emuState(LoadEmulatorConfig(appDir)))
	})
	h("/api/native/emulators/browse", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			EmulatorID   string `json:"emulatorId"`
			EmulatorName string `json:"emulatorName"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		chosen, err := o.Dialogs.PickFile("Укажите эмулятор / Select the emulator: "+req.EmulatorName, nil)
		if err == nil && chosen != "" && !IsLaunchable(chosen) {
			err = fmt.Errorf("это не приложение / not an application: %s", chosen)
		}
		if err != nil || chosen == "" {
			writeJSON(w, map[string]any{"ok": false, "error": errString(err)})
			return
		}
		cfg := LoadEmulatorConfig(appDir)
		if req.EmulatorID != "" {
			cfg.CustomPaths[req.EmulatorID] = chosen
			_ = SaveEmulatorConfig(appDir, cfg)
		}
		res := emuState(cfg)
		res["emulatorId"] = req.EmulatorID
		res["exePath"] = chosen
		writeJSON(w, res)
	})
	h("/api/native/emulators/save-config", func(w http.ResponseWriter, r *http.Request) {
		var req EmulatorConfig
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		req.normalize()
		_ = SaveEmulatorConfig(appDir, req)
		writeJSON(w, emuState(req))
	})
	h("/api/native/emulators/launch", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ConsoleCode  string `json:"consoleCode"`
			EmulatorID   string `json:"emulatorId"`
			ExePath      string `json:"exePath"`
			CoreFile     string `json:"coreFile"`
			RomFileName  string `json:"romFileName"`
			RelativePath string `json:"relativePath"`
			LibraryPath  string `json:"libraryPath"`
			SdCardPath   string `json:"sdCardPath"`
			IsRetroArch  bool   `json:"isRetroArch"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		detected, _ := plat.DetectEmulators(LoadEmulatorConfig(appDir).CustomPaths)
		// RU: Запускаем только найденный или указанный пользователем эмулятор: путь
		// из тела запроса принимается, только если он совпадает с одним из них.
		// EN: Only a detected or user-picked emulator runs: a path from the request
		// is accepted only when it matches one of them.
		emu := ""
		for _, p := range detected {
			if req.ExePath != "" && filepath.Clean(p) == filepath.Clean(req.ExePath) {
				emu = p
			}
		}
		if emu == "" && req.EmulatorID != "" {
			emu = detected[req.EmulatorID]
		}
		if emu == "" && req.IsRetroArch {
			emu = detected["retroarch"]
		}
		if emu == "" {
			writeJSON(w, map[string]any{"ok": false, "error": "Эмулятор не найден на этом Mac. Укажите его во вкладке «4. Среда». / Emulator not found on this Mac. Set it in the Environment tab."})
			return
		}
		rom := ""
		for _, c := range aegisapi.RomPathCandidates(req.ConsoleCode, req.RomFileName, req.RelativePath, req.LibraryPath, req.SdCardPath) {
			if isRegularFile(c) {
				rom = c
				break
			}
		}
		if rom == "" {
			rom, _ = o.Dialogs.PickFile("Укажите файл игры / Select the game file: "+req.RomFileName, nil)
		}
		if rom == "" || !isRegularFile(rom) {
			writeJSON(w, map[string]any{"ok": false, "error": "Файл игры не выбран или не найден. / Game file not selected or not found."})
			return
		}
		bin := ExecutablePath(emu)
		args := plat.LaunchArgs(emu, req.CoreFile, rom, req.IsRetroArch)
		cmd := exec.Command(bin, args...)
		cmd.Dir = filepath.Dir(bin)
		if err := o.Start(cmd); err != nil {
			writeJSON(w, map[string]any{"ok": false, "error": "Не удалось запустить процесс / Could not start: " + err.Error()})
			return
		}
		pid := 0
		if cmd.Process != nil {
			pid = cmd.Process.Pid
			go func() { _ = cmd.Wait() }()
		}
		writeJSON(w, map[string]any{
			"ok": true, "pid": pid, "exePath": emu, "romPath": rom,
			"commandLine": fmt.Sprintf("%q %s", bin, strings.Join(args, " ")),
		})
	})
}

// indexMedia maps lower-case base names (without -image/-boxart/... suffixes) to
// image and video files up to 4 levels below root.
func indexMedia(root string) (map[string]string, map[string]string) {
	images, videos := map[string]string{}, map[string]string{}
	if root == "" {
		return images, videos
	}
	if st, err := os.Stat(root); err != nil || !st.IsDir() {
		return images, videos
	}
	baseSep := strings.Count(filepath.Clean(root), string(filepath.Separator))
	_ = filepath.WalkDir(root, func(p string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() {
			if strings.Count(filepath.Clean(p), string(filepath.Separator))-baseSep > 4 {
				return filepath.SkipDir
			}
			return nil
		}
		ext := strings.ToLower(filepath.Ext(d.Name()))
		base := strings.TrimSuffix(strings.ToLower(d.Name()), ext)
		for _, suf := range []string{"-image", "-thumb", "-boxart", "-snap", "-marquee", "-banner", "-video"} {
			base = strings.TrimSuffix(base, suf)
		}
		switch ext {
		case ".png", ".jpg", ".jpeg", ".webp":
			if _, ok := images[base]; !ok {
				images[base] = p
			}
		case ".mp4", ".webm":
			if _, ok := videos[base]; !ok {
				videos[base] = p
			}
		}
		return nil
	})
	return images, videos
}

// handleChd converts disc images with chdman (same form fields and answers as the Windows build).
func handleChd(w http.ResponseWriter, r *http.Request, chdman string) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if chdman == "" {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(http.StatusPreconditionFailed)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"ok":    false,
			"error": "chdman не найден. Установите его (brew install rom-tools) или укажите путь в «Сборки и Конвертер». / chdman not found. Install it (brew install rom-tools) or set its path in Builds & Converter.",
		})
		return
	}
	if err := r.ParseMultipartForm(64 << 20); err != nil {
		http.Error(w, "Ошибка разбора входных файлов: "+err.Error(), http.StatusBadRequest)
		return
	}
	defer func() {
		if r.MultipartForm != nil {
			_ = r.MultipartForm.RemoveAll()
		}
	}()
	targetExt := strings.ToLower(strings.TrimSpace(r.FormValue("targetExt")))
	// outDir: результат сразу в папку сборки. / outDir: output straight into the build folder.
	outDir, err := aegisapi.ConverterOutDir(r)
	if err != nil {
		http.Error(w, "outDir: "+err.Error(), http.StatusForbidden)
		return
	}
	baseName := filepath.Base(strings.ReplaceAll(strings.TrimSpace(r.FormValue("baseName")), `\`, `/`))
	if baseName == "" || baseName == "." || baseName == "/" {
		baseName = "Converted_Game"
	}
	tmpDir, err := os.MkdirTemp("", "aegisrom_chd_*")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer os.RemoveAll(tmpDir)

	save := func(src io.Reader, filename string) (string, error) {
		dst := filepath.Join(tmpDir, filepath.Base(strings.ReplaceAll(filename, `\`, `/`)))
		head := make([]byte, 8193)
		n, _ := io.ReadFull(src, head)
		if handled, err := aegisapi.MaterializeVFSUpload(head[:n], dst); handled {
			return dst, err
		}
		out, err := os.Create(dst)
		if err != nil {
			return "", err
		}
		_, cErr := io.Copy(out, io.MultiReader(bytes.NewReader(head[:n]), src))
		if clErr := out.Close(); cErr == nil {
			cErr = clErr
		}
		return dst, cErr
	}
	entryFH, entryHdr, err := r.FormFile("entryFile")
	if err != nil {
		http.Error(w, "Не передан entryFile: "+err.Error(), http.StatusBadRequest)
		return
	}
	entry, err := save(entryFH, entryHdr.Filename)
	_ = entryFH.Close()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if r.MultipartForm != nil {
		for _, hdr := range r.MultipartForm.File["companionFiles"] {
			if f, err := hdr.Open(); err == nil {
				_, _ = save(f, hdr.Filename)
				_ = f.Close()
			}
		}
	}
	runChdman := func(args ...string) bool {
		// Контекст запроса: отмена на странице (таймаут, «Стоп») завершает chdman.
		// Request context: a cancel on the page (timeout, Stop) kills chdman.
		cmd := exec.CommandContext(r.Context(), chdman, args...)
		cmd.Dir = tmpDir
		if out, err := cmd.CombinedOutput(); err != nil {
			http.Error(w, "chdman "+args[0]+" error: "+err.Error()+"\n"+string(out), http.StatusInternalServerError)
			return false
		}
		return true
	}
	sendFile := func(p, name string) {
		if outDir != "" {
			aegisapi.SendConverterOutputs(w, tmpDir, outDir, []string{filepath.Base(p)})
			return
		}
		f, err := os.Open(p)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer f.Close()
		w.Header().Set("Content-Type", "application/octet-stream")
		w.Header().Set("X-Output-Mode", "single")
		w.Header().Set("X-Output-Filename", url.PathEscape(name))
		_, _ = io.Copy(w, f)
	}

	switch targetExt {
	case ".chd":
		out, notes, err := aegisapi.CreateCDCHD(r.Context(), chdman, entry, tmpDir, baseName, r.FormValue("console"), nil)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		aegisapi.SetConverterNotes(w, notes)
		sendFile(out, baseName+".chd")
	case ".iso":
		cue := filepath.Join(tmpDir, baseName+"_tmp.cue")
		bin := filepath.Join(tmpDir, baseName+"_tmp.bin")
		iso := filepath.Join(tmpDir, baseName+".iso")
		if !runChdman("extractcd", "-f", "-i", entry, "-o", cue, "-ob", bin) {
			return
		}
		if err := aegiscore.StripBin2352ToISO(bin, iso); err != nil {
			http.Error(w, "strip bin->iso error: "+err.Error(), http.StatusInternalServerError)
			return
		}
		sendFile(iso, baseName+".iso")
	case ".bin+.cue":
		cue := filepath.Join(tmpDir, baseName+".cue")
		bin := filepath.Join(tmpDir, baseName+".bin")
		if !runChdman("extractcd", "-f", "-i", entry, "-o", cue, "-ob", bin) {
			return
		}
		if outDir != "" {
			aegisapi.SendConverterOutputs(w, tmpDir, outDir, []string{baseName + ".bin", baseName + ".cue"})
			return
		}
		w.Header().Set("Content-Type", "application/zip")
		w.Header().Set("X-Output-Mode", "zip-store")
		zw := zip.NewWriter(w)
		for _, name := range []string{baseName + ".cue", baseName + ".bin"} {
			p := filepath.Join(tmpDir, name)
			st, err := os.Stat(p)
			if err != nil || st.IsDir() {
				continue
			}
			hdr, _ := zip.FileInfoHeader(st)
			hdr.Name = name
			hdr.Method = zip.Store
			if ew, err := zw.CreateHeader(hdr); err == nil {
				if f, err := os.Open(p); err == nil {
					_, _ = io.Copy(ew, f)
					_ = f.Close()
				}
			}
		}
		_ = zw.Close()
	default:
		http.Error(w, "Неподдерживаемый целевой формат для chdman: "+targetExt, http.StatusBadRequest)
	}
}
