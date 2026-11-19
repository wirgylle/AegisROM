package aegiscore

import (
	"bytes"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

// Strips raw 2352-byte or 2448-byte (2352+96 subchannel) CD sectors (MODE1 +16 or MODE2/XA +24) to pure 2048-byte ISO9660.
func StripBin2352ToISO(binPath, isoPath string) error {
	src, err := os.Open(binPath)
	if err != nil {
		return err
	}
	defer src.Close()

	st, err := src.Stat()
	if err != nil {
		return err
	}
	if st.Size() < 32768 {
		return fmt.Errorf("входной образ диска слишком мал (%d Б)", st.Size())
	}

	head := make([]byte, 96*1024)
	nHead, _ := io.ReadFull(src, head)
	head = head[:nHead]

	syncPattern := []byte{0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x00}
	sectorSize := 2048
	if len(head) >= 2460 && bytes.HasPrefix(head, syncPattern) && bytes.Equal(head[2448:2460], syncPattern) {
		sectorSize = 2448
	} else if len(head) >= 2364 && bytes.HasPrefix(head, syncPattern) && bytes.Equal(head[2352:2364], syncPattern) {
		sectorSize = 2352
	} else if st.Size()%2448 == 0 && st.Size()%2352 != 0 {
		sectorSize = 2448
	} else if st.Size()%2352 == 0 {
		sectorSize = 2352
	}

	if _, err := src.Seek(0, io.SeekStart); err != nil {
		return err
	}

	dst, err := os.Create(isoPath)
	if err != nil {
		return err
	}
	defer dst.Close()

	if sectorSize == 2048 {
		_, err = io.Copy(dst, src)
		return err
	}

	dataOffset := 24
	pvdBase := 16 * sectorSize
	if len(head) >= pvdBase+30 && bytes.Equal(head[pvdBase+17:pvdBase+22], []byte("CD001")) {
		dataOffset = 16
	}

	const sectorsBatch = 2048
	inBuf := make([]byte, sectorsBatch*sectorSize)
	outBuf := make([]byte, sectorsBatch*2048)

	for {
		n, readErr := io.ReadFull(src, inBuf)
		sectors := n / sectorSize
		if sectors > 0 {
			for s := 0; s < sectors; s++ {
				srcOff := s*sectorSize + dataOffset
				copy(outBuf[s*2048:(s+1)*2048], inBuf[srcOff:srcOff+2048])
			}
			if _, wErr := dst.Write(outBuf[:sectors*2048]); wErr != nil {
				return wErr
			}
		}
		if readErr == io.EOF || readErr == io.ErrUnexpectedEOF {
			break
		}
		if readErr != nil {
			return readErr
		}
	}
	return nil
}

// Normalizes .mdf / standalone .img (2448B CloneCD/Alcohol -> 2352B, or 2352B copy) into a clean .cue + .bin pair for chdman.exe.
func NormalizeDiscImageToCueAndBin(srcPath, cuePath, binPath string) error {
	src, err := os.Open(srcPath)
	if err != nil {
		return err
	}
	defer src.Close()

	st, err := src.Stat()
	if err != nil {
		return err
	}
	if st.Size() < 32768 {
		return fmt.Errorf("файл образа %s слишком мал (%d Б)", filepath.Base(srcPath), st.Size())
	}

	head := make([]byte, 96*1024)
	nHead, _ := io.ReadFull(src, head)
	head = head[:nHead]

	syncPattern := []byte{0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x00}
	sectorSize := 2048
	if len(head) >= 2460 && bytes.HasPrefix(head, syncPattern) && bytes.Equal(head[2448:2460], syncPattern) {
		sectorSize = 2448
	} else if len(head) >= 2364 && bytes.HasPrefix(head, syncPattern) && bytes.Equal(head[2352:2364], syncPattern) {
		sectorSize = 2352
	} else if st.Size()%2448 == 0 && st.Size()%2352 != 0 {
		sectorSize = 2448
	} else if st.Size()%2352 == 0 {
		sectorSize = 2352
	}

	modeStr := "MODE2/2352"
	if sectorSize == 2048 {
		modeStr = "MODE1/2048"
	} else {
		pvdBase := 16 * sectorSize
		if len(head) >= pvdBase+30 && bytes.Equal(head[pvdBase+17:pvdBase+22], []byte("CD001")) {
			modeStr = "MODE1/2352"
		}
	}

	if _, err := src.Seek(0, io.SeekStart); err != nil {
		return err
	}
	dst, err := os.Create(binPath)
	if err != nil {
		return err
	}
	if sectorSize == 2448 {
		const sectorsBatch = 2048
		inBuf := make([]byte, sectorsBatch*2448)
		outBuf := make([]byte, sectorsBatch*2352)
		for {
			n, readErr := io.ReadFull(src, inBuf)
			sectors := n / 2448
			if sectors > 0 {
				for s := 0; s < sectors; s++ {
					copy(outBuf[s*2352:(s+1)*2352], inBuf[s*2448:s*2448+2352])
				}
				if _, wErr := dst.Write(outBuf[:sectors*2352]); wErr != nil {
					_ = dst.Close()
					return wErr
				}
			}
			if readErr == io.EOF || readErr == io.ErrUnexpectedEOF {
				break
			}
			if readErr != nil {
				_ = dst.Close()
				return readErr
			}
		}
	} else {
		if _, err := io.Copy(dst, src); err != nil {
			_ = dst.Close()
			return err
		}
	}
	_ = dst.Close()

	cueBody := fmt.Sprintf("FILE \"%s\" BINARY\r\n  TRACK 01 %s\r\n    INDEX 01 00:00:00\r\n", filepath.Base(binPath), modeStr)
	return os.WriteFile(cuePath, []byte(cueBody), 0644)
}
