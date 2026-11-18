// AegisROM High-Performance Concurrent File System Scanner & 1G1R Organizer
// Windows 11 Native 64-bit Build

package main

import (
	"crypto/md5"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"hash/crc32"
	"io"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

type RomInfo struct {
	FilePath         string `json:"file_path"`
	FileName         string `json:"file_name"`
	CleanTitle       string `json:"clean_title"`
	CanonicalName    string `json:"canonical_name"`
	Extension        string `json:"extension"`
	Platform         string `json:"platform"`
	FileSize         int64  `json:"file_size"`
	CRC32            string `json:"crc32"`
	MD5              string `json:"md5,omitempty"`
	SHA1             string `json:"sha1,omitempty"`
	Region           string `json:"region"`
	Revision         string `json:"revision,omitempty"`
	Status           string `json:"status"`
	CloneGroup       string `json:"clone_group,omitempty"`
	Is1G1RWinner     bool   `json:"is_1g1r_winner"`
	QuarantineReason string `json:"quarantine_reason,omitempty"`
}

type ScanConfig struct {
	RootDir        string
	OutputDir      string
	TargetPlatform string
	WorkerCount    int
	ComputeSHA1    bool
	RegionPriority []string
	DryRun         bool
	ApplyOrganize  bool
}

type Job struct {
	Path     string
	FileInfo os.FileInfo
}

var extensionToPlatform = map[string]string{
	".sfc": "snes", ".smc": "snes", ".fig": "snes",
	".nes": "nes", ".unf": "nes", ".fds": "nes",
	".md": "genesis", ".gen": "genesis", ".smd": "genesis",
	".gba": "gba", ".agb": "gba",
	".gb": "gb", ".gbc": "gbc",
	".z64": "n64", ".n64": "n64", ".v64": "n64",
	".iso": "psx", ".cue": "psx", ".chd": "psx",
	".pce": "pce", ".sgx": "pce",
}

var regionRegex = regexp.MustCompile(`\((USA|Europe|Japan|World|Germany|France|Spain|Italy|Australia|En,Fr,De|En,Ja|Asia|Korea|Brazil)\)`)
var revisionRegex = regexp.MustCompile(`\((Rev [0-9A-Z]+|v[0-9\.]+)\)`)
var junkRegex = regexp.MustCompile(`\[(b[0-9]?|h[0-9]?|t[0-9]?|p[0-9]?|o[0-9]?)\]|\(Unl\)|\(Pirate\)`)

func main() {
	rootDir := flag.String("dir", ".", "Root directory of ROMs to scan")
	outputDir := flag.String("out", "./Organized_ROMs", "Output destination folder")
	platform := flag.String("platform", "all", "Target platform (all, snes, nes, genesis, gba, etc.)")
	workers := flag.Int("workers", 8, "Number of concurrent goroutine workers")
	sha1Flag := flag.Bool("sha1", false, "Compute full SHA1 hash (slower, for Redump)")
	priority := flag.String("priority", "USA,Europe,Japan,World", "Comma-separated 1G1R regional priority")
	dryRun := flag.Bool("dry-run", true, "Preview changes without moving/renaming files")
	organize := flag.Bool("organize", false, "Execute physical file reorganization")
	flag.Parse()

	config := ScanConfig{
		RootDir:        *rootDir,
		OutputDir:      *outputDir,
		TargetPlatform: strings.ToLower(*platform),
		WorkerCount:    *workers,
		ComputeSHA1:    *sha1Flag,
		RegionPriority: strings.Split(*priority, ","),
		DryRun:         *dryRun && !*organize,
		ApplyOrganize:  *organize,
	}

	fmt.Println("====================================================================")
	fmt.Println(" AegisROM — High-Speed Concurrent ROM Scanner & 1G1R Sorter")
	fmt.Println(" Built for Windows 11 (64-bit)")
	fmt.Println("====================================================================")
	fmt.Printf("Root Path:        %s\n", config.RootDir)
	fmt.Printf("Worker Threads:   %d goroutines\n", config.WorkerCount)
	fmt.Printf("Platform Filter:  %s\n", config.TargetPlatform)
	fmt.Printf("Region Priority:  %v\n", config.RegionPriority)
	fmt.Printf("Dry Run Mode:     %t\n", config.DryRun)
	fmt.Println("--------------------------------------------------------------------")

	startTime := time.Now()

	jobsChan := make(chan Job, 1000)
	resultsChan := make(chan RomInfo, 1000)

	var workerWg sync.WaitGroup
	var collectorWg sync.WaitGroup

	for w := 1; w <= config.WorkerCount; w++ {
		workerWg.Add(1)
		go worker(w, &config, jobsChan, resultsChan, &workerWg)
	}

	var scannedRoms []RomInfo
	collectorWg.Add(1)
	go func() {
		defer collectorWg.Done()
		for rom := range resultsChan {
			scannedRoms = append(scannedRoms, rom)
		}
	}()

	err := scanDirectoryWithPermissionHandling(config.RootDir, config.TargetPlatform, jobsChan)
	if err != nil {
		log.Printf("[ERROR] Scanning encountered error: %v\n", err)
	}

	close(jobsChan)
	workerWg.Wait()
	close(resultsChan)
	collectorWg.Wait()

	scannedRoms = apply1G1R(scannedRoms, config.RegionPriority)
	elapsed := time.Since(startTime)

	var verified, clones, junk int
	for _, r := range scannedRoms {
		if r.Status == "verified" || r.Status == "renamed" {
			verified++
		} else if r.Status == "duplicate_clone" {
			clones++
		} else if r.Status == "junk_bad_dump" {
			junk++
		}
	}

	fmt.Println("--------------------------------------------------------------------")
	fmt.Printf("✓ Scan Completed in:     %v\n", elapsed)
	fmt.Printf("Total ROMs Found:        %d\n", len(scannedRoms))
	fmt.Printf("Clean / 1G1R Primary:    %d\n", verified)
	fmt.Printf("Duplicate Clones:        %d\n", clones)
	fmt.Printf("Bad Dumps / Junk:        %d\n", junk)

	reportPath := filepath.Join(config.OutputDir, "aegis_scan_report.json")
	_ = os.MkdirAll(config.OutputDir, 0755)
	if reportBytes, err := json.MarshalIndent(scannedRoms, "", "  "); err == nil {
		_ = os.WriteFile(reportPath, reportBytes, 0644)
		fmt.Printf("Report saved to:         %s\n", reportPath)
	}

	if config.ApplyOrganize {
		executeReorganize(scannedRoms, config.OutputDir)
	} else {
		fmt.Println("Tip: Pass -organize flag to physically sort files into clean folders.")
	}
}

func scanDirectoryWithPermissionHandling(rootPath string, platformFilter string, jobs chan<- Job) error {
	return filepath.Walk(rootPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			if os.IsPermission(err) {
				log.Printf("[SKIPPED: PERMISSION DENIED] %s\n", path)
				return filepath.SkipDir
			}
			log.Printf("[WARNING] Access error on %s: %v\n", path, err)
			return nil
		}

		if info.IsDir() {
			name := info.Name()
			if strings.HasPrefix(name, ".") || name == "$RECYCLE.BIN" || name == "System Volume Information" {
				return filepath.SkipDir
			}
			return nil
		}

		ext := strings.ToLower(filepath.Ext(path))
		plat, ok := extensionToPlatform[ext]
		if !ok {
			return nil
		}

		if platformFilter != "all" && plat != platformFilter {
			return nil
		}

		jobs <- Job{Path: path, FileInfo: info}
		return nil
	})
}

func worker(id int, config *ScanConfig, jobs <-chan Job, results chan<- RomInfo, wg *sync.WaitGroup) {
	defer wg.Done()
	for job := range jobs {
		rom := inspectAndHashFile(job.Path, job.FileInfo, config.ComputeSHA1)
		results <- rom
	}
}

func inspectAndHashFile(path string, info os.FileInfo, computeSHA1 bool) RomInfo {
	file, err := os.Open(path)
	if err != nil {
		if os.IsPermission(err) {
			log.Printf("[WORKER: PERMISSION DENIED] %s\n", path)
		}
		return RomInfo{
			FilePath: path,
			FileName: info.Name(),
			Status:   "unknown",
		}
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(path))
	platform := extensionToPlatform[ext]

	crcTable := crc32.MakeTable(crc32.IEEE)
	crcWriter := crc32.New(crcTable)
	md5Writer := md5.New()
	sha1Writer := sha1.New()

	var writers []io.Writer
	writers = append(writers, crcWriter, md5Writer)
	if computeSHA1 {
		writers = append(writers, sha1Writer)
	}

	multiWriter := io.MultiWriter(writers...)
	buf := make([]byte, 65536)
	_, _ = io.CopyBuffer(multiWriter, file, buf)

	crcHex := fmt.Sprintf("%08x", crcWriter.Sum32())
	md5Hex := hex.EncodeToString(md5Writer.Sum(nil))
	var sha1Hex string
	if computeSHA1 {
		sha1Hex = hex.EncodeToString(sha1Writer.Sum(nil))
	}

	fileName := info.Name()
	cleanTitle := cleanGameTitle(fileName)
	region := detectRegion(fileName)
	revision := detectRevision(fileName)
	isJunk := junkRegex.MatchString(fileName)

	status := "verified"
	quarantine := ""
	if isJunk {
		status = "junk_bad_dump"
		quarantine = "Bad dump or unauthorized hack detected"
	}

	return RomInfo{
		FilePath:         path,
		FileName:         fileName,
		CleanTitle:       cleanTitle,
		CanonicalName:    fmt.Sprintf("%s (%s)%s", cleanTitle, region, ext),
		Extension:        ext,
		Platform:         platform,
		FileSize:         info.Size(),
		CRC32:            crcHex,
		MD5:              md5Hex,
		SHA1:             sha1Hex,
		Region:           region,
		Revision:         revision,
		Status:           status,
		CloneGroup:       cleanTitle,
		Is1G1RWinner:     !isJunk,
		QuarantineReason: quarantine,
	}
}

func apply1G1R(roms []RomInfo, regionPriority []string) []RomInfo {
	groups := make(map[string][]int)
	for i, r := range roms {
		if r.Status != "junk_bad_dump" {
			groups[r.CloneGroup] = append(groups[r.CloneGroup], i)
		}
	}

	for _, indices := range groups {
		if len(indices) <= 1 {
			continue
		}

		bestIdx := indices[0]
		bestScore := scoreRom(roms[bestIdx], regionPriority)

		for _, idx := range indices[1:] {
			score := scoreRom(roms[idx], regionPriority)
			if score > bestScore {
				bestScore = score
				bestIdx = idx
			}
		}

		for _, idx := range indices {
			if idx == bestIdx {
				roms[idx].Is1G1RWinner = true
			} else {
				roms[idx].Is1G1RWinner = false
				roms[idx].Status = "duplicate_clone"
				roms[idx].QuarantineReason = fmt.Sprintf("1G1R regional clone of %s", roms[bestIdx].FileName)
			}
		}
	}

	return roms
}

func scoreRom(r RomInfo, priority []string) int {
	score := 0
	for i, reg := range priority {
		if strings.EqualFold(r.Region, strings.TrimSpace(reg)) {
			score += (len(priority) - i) * 100
			break
		}
	}
	if strings.Contains(r.Revision, "Rev") || strings.Contains(r.Revision, "v1.1") {
		score += 10
	}
	return score
}

func detectRegion(name string) string {
	matches := regionRegex.FindStringSubmatch(name)
	if len(matches) > 1 {
		return matches[1]
	}
	return "World"
}

func detectRevision(name string) string {
	matches := revisionRegex.FindStringSubmatch(name)
	if len(matches) > 1 {
		return matches[1]
	}
	return ""
}

func cleanGameTitle(name string) string {
	ext := filepath.Ext(name)
	base := strings.TrimSuffix(name, ext)
	base = regionRegex.ReplaceAllString(base, "")
	base = revisionRegex.ReplaceAllString(base, "")
	base = regexp.MustCompile(`\[.*?\]|\(.*?\)`).ReplaceAllString(base, "")
	base = strings.ReplaceAll(base, "_", " ")
	return strings.TrimSpace(base)
}

func executeReorganize(roms []RomInfo, outRoot string) {
	fmt.Println("Executing physical organization...")
	cleanDir := filepath.Join(outRoot, "Organized")
	clonesDir := filepath.Join(outRoot, "_Quarantine_1G1R_Clones")
	junkDir := filepath.Join(outRoot, "_Junk_BadDumps")

	_ = os.MkdirAll(cleanDir, 0755)
	_ = os.MkdirAll(clonesDir, 0755)
	_ = os.MkdirAll(junkDir, 0755)

	for _, r := range roms {
		var targetDir string
		if r.Status == "junk_bad_dump" {
			targetDir = filepath.Join(junkDir, r.Platform)
		} else if r.Status == "duplicate_clone" {
			targetDir = filepath.Join(clonesDir, r.Platform)
		} else {
			targetDir = filepath.Join(cleanDir, r.Platform)
		}

		_ = os.MkdirAll(targetDir, 0755)
		targetFile := filepath.Join(targetDir, r.CanonicalName)
		if err := os.Rename(r.FilePath, targetFile); err != nil {
			log.Printf("[ERROR] Failed to move %s -> %s: %v\n", r.FilePath, targetFile, err)
		} else {
			fmt.Printf("[MOVED] %s -> %s\n", r.FileName, targetFile)
		}
	}
}

