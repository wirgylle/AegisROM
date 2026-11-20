package main

import (
	"bytes"
	"encoding/binary"
	"image"
	"image/color"
	"image/png"
	"math"
	"os"
	"path/filepath"
)

// Generates a crisp AegisROM icon ( vibrant royal-blue & emerald shield + retro D-pad & arcade buttons )
func renderIconRGBA(size int) *image.RGBA {
	img := image.NewRGBA(image.Rect(0, 0, size, size))
	fSize := float64(size)
	center := fSize / 2.0
	radius := fSize * 0.46

	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			fx := float64(x) + 0.5
			fy := float64(y) + 0.5

			// Rounded squircle distance
			dx := math.Abs(fx-center) / radius
			dy := math.Abs(fy-center) / radius
			dist := math.Pow(math.Pow(dx, 4)+math.Pow(dy, 4), 0.25)

			if dist > 1.0 {
				img.SetRGBA(x, y, color.RGBA{0, 0, 0, 0})
				continue
			}

			// Outer border (bright sky/emerald gradient)
			if dist > 0.87 {
				t := fy / fSize
				r := uint8(16*(1-t) + 59*t)
				g := uint8(185*(1-t) + 130*t)
				b := uint8(129*(1-t) + 246*t)
				img.SetRGBA(x, y, color.RGBA{r, g, b, 255})
				continue
			}

			// Rich royal blue-indigo background (#1E3A8A -> #1D4ED8)
			t := fy / fSize
			bgR := uint8(24 + 15*t)
			bgG := uint8(52 + 30*t)
			bgB := uint8(138 + 60*t)
			img.SetRGBA(x, y, color.RGBA{bgR, bgG, bgB, 255})

			// Normalize coordinates to [-1, 1]
			nx := (fx - center) / radius
			ny := (fy - center) / radius

			// Draw Retro D-Pad on the left side
			inDPadHoriz := nx >= -0.64 && nx <= -0.06 && ny >= -0.11 && ny <= 0.11
			inDPadVert := nx >= -0.46 && nx <= -0.24 && ny >= -0.29 && ny <= 0.29
			if inDPadHoriz || inDPadVert {
				img.SetRGBA(x, y, color.RGBA{255, 255, 255, 255})
				continue
			}

			// Draw Action Buttons A & B on the right side
			distB := math.Hypot(nx-0.22, ny-0.12)
			if distB <= 0.14 {
				img.SetRGBA(x, y, color.RGBA{16, 185, 129, 255})
				continue
			}
			distA := math.Hypot(nx-0.52, ny+0.08)
			if distA <= 0.14 {
				img.SetRGBA(x, y, color.RGBA{251, 191, 36, 255})
				continue
			}

			// Top Cartridge Gold Pins
			if ny >= -0.68 && ny <= -0.48 && math.Abs(nx) <= 0.48 {
				slot := int((nx + 0.48) * 12)
				if slot%2 == 0 {
					img.SetRGBA(x, y, color.RGBA{110, 231, 183, 255})
				}
			}
		}
	}
	return img
}

func encodePNG(img *image.RGBA) []byte {
	var buf bytes.Buffer
	_ = png.Encode(&buf, img)
	return buf.Bytes()
}

// Encodes an *image.RGBA as a standard Windows 32-bit uncompressed DIB icon payload (BITMAPINFOHEADER + BGRA bottom-up + 1-bit AND mask).
// Windows LoadIconW and Explorer require uncompressed DIB for 16x16, 32x32, and 48x48 icons!
func encodeIconDIB(img *image.RGBA) []byte {
	w := img.Bounds().Dx()
	h := img.Bounds().Dy()

	andMaskRowBytes := ((w + 31) / 32) * 4
	xorBytes := w * h * 4
	andBytes := andMaskRowBytes * h

	var buf bytes.Buffer
	// BITMAPINFOHEADER (40 bytes)
	_ = binary.Write(&buf, binary.LittleEndian, uint32(40))                  // biSize
	_ = binary.Write(&buf, binary.LittleEndian, int32(w))                    // biWidth
	_ = binary.Write(&buf, binary.LittleEndian, int32(h*2))                  // biHeight (doubled for XOR + AND mask)
	_ = binary.Write(&buf, binary.LittleEndian, uint16(1))                   // biPlanes
	_ = binary.Write(&buf, binary.LittleEndian, uint16(32))                  // biBitCount = 32-bit BGRA
	_ = binary.Write(&buf, binary.LittleEndian, uint32(0))                   // biCompression = BI_RGB
	_ = binary.Write(&buf, binary.LittleEndian, uint32(xorBytes+andBytes))   // biSizeImage
	_ = binary.Write(&buf, binary.LittleEndian, int32(0))                    // biXPelsPerMeter
	_ = binary.Write(&buf, binary.LittleEndian, int32(0))                    // biYPelsPerMeter
	_ = binary.Write(&buf, binary.LittleEndian, uint32(0))                   // biClrUsed
	_ = binary.Write(&buf, binary.LittleEndian, uint32(0))                   // biClrImportant

	// Bottom-up 32-bit BGRA pixels
	for y := h - 1; y >= 0; y-- {
		for x := 0; x < w; x++ {
			c := img.RGBAAt(x, y)
			buf.WriteByte(c.B)
			buf.WriteByte(c.G)
			buf.WriteByte(c.R)
			buf.WriteByte(c.A)
		}
	}

	// Bottom-up 1-bit AND mask (1 = transparent where alpha == 0)
	for y := h - 1; y >= 0; y-- {
		row := make([]byte, andMaskRowBytes)
		for x := 0; x < w; x++ {
			if img.RGBAAt(x, y).A == 0 {
				row[x/8] |= 1 << (7 - (uint(x) % 8))
			}
		}
		buf.Write(row)
	}

	return buf.Bytes()
}

// Build complete .ico file bytes and RT_GROUP_ICON directory bytes
func buildICOAndGroup(png256, dib48, dib32, dib16 []byte) ([]byte, []byte) {
	type icoEntry struct {
		w, h byte
		data []byte
	}
	entries := []icoEntry{
		{0, 0, png256}, // 256x256 PNG
		{48, 48, dib48},
		{32, 32, dib32},
		{16, 16, dib16},
	}

	var icoBuf bytes.Buffer
	var grpBuf bytes.Buffer

	// ICONDIR header (6 bytes)
	_ = binary.Write(&icoBuf, binary.LittleEndian, uint16(0))
	_ = binary.Write(&icoBuf, binary.LittleEndian, uint16(1))
	_ = binary.Write(&icoBuf, binary.LittleEndian, uint16(len(entries)))

	// GRPICONDIR header (6 bytes)
	_ = binary.Write(&grpBuf, binary.LittleEndian, uint16(0))
	_ = binary.Write(&grpBuf, binary.LittleEndian, uint16(1))
	_ = binary.Write(&grpBuf, binary.LittleEndian, uint16(len(entries)))

	offset := uint32(6 + len(entries)*16)
	for i, e := range entries {
		// File ICONDIRENTRY (16 bytes)
		icoBuf.WriteByte(e.w)
		icoBuf.WriteByte(e.h)
		icoBuf.WriteByte(0)
		icoBuf.WriteByte(0)
		_ = binary.Write(&icoBuf, binary.LittleEndian, uint16(1))
		_ = binary.Write(&icoBuf, binary.LittleEndian, uint16(32))
		_ = binary.Write(&icoBuf, binary.LittleEndian, uint32(len(e.data)))
		_ = binary.Write(&icoBuf, binary.LittleEndian, offset)
		offset += uint32(len(e.data))

		// Resource GRPICONDIRENTRY (14 bytes)
		grpBuf.WriteByte(e.w)
		grpBuf.WriteByte(e.h)
		grpBuf.WriteByte(0)
		grpBuf.WriteByte(0)
		_ = binary.Write(&grpBuf, binary.LittleEndian, uint16(1))
		_ = binary.Write(&grpBuf, binary.LittleEndian, uint16(32))
		_ = binary.Write(&grpBuf, binary.LittleEndian, uint32(len(e.data)))
		_ = binary.Write(&grpBuf, binary.LittleEndian, uint16(i+1)) // RT_ICON IDs 1, 2, 3, 4
	}

	for _, e := range entries {
		icoBuf.Write(e.data)
	}

	return icoBuf.Bytes(), grpBuf.Bytes()
}

// Builds a valid x86_64 Windows COFF (.syso) object file containing RT_ICON (3), RT_GROUP_ICON (14), and RT_MANIFEST (24)
func buildCOFFSyso(icon1, icon2, icon3, icon4, grpIcon, manifest []byte) []byte {
	pad8 := func(b []byte) []byte {
		rem := len(b) % 8
		if rem == 0 {
			return b
		}
		return append(b, make([]byte, 8-rem)...)
	}

	icon1P := pad8(icon1)
	icon2P := pad8(icon2)
	icon3P := pad8(icon3)
	icon4P := pad8(icon4)
	grpP := pad8(grpIcon)
	manP := pad8(manifest)

	// Resource Tree Layout:
	// Level 1 (Root): 3 Type entries: RT_ICON (3), RT_GROUP_ICON (14), RT_MANIFEST (24) -> 16 + 3*8 = 40 bytes (offset 0)
	// Level 2 (Names):
	//   - RT_ICON dir: 4 IDs (1, 2, 3, 4) -> 16 + 4*8 = 48 bytes (offset 40)
	//   - RT_GROUP_ICON dir: 1 ID (1)     -> 16 + 1*8 = 24 bytes (offset 88)
	//   - RT_MANIFEST dir: 1 ID (1)       -> 16 + 1*8 = 24 bytes (offset 112)
	// Level 3 (Languages - 0x0409):
	//   - Icon 1 lang dir: 24 bytes (offset 136)
	//   - Icon 2 lang dir: 24 bytes (offset 160)
	//   - Icon 3 lang dir: 24 bytes (offset 184)
	//   - Icon 4 lang dir: 24 bytes (offset 208)
	//   - GrpIcon lang dir: 24 bytes (offset 232)
	//   - Manifest lang dir: 24 bytes (offset 256)
	// Data Entries (6 * 16 = 96 bytes, offset 280..376):
	//   - Entry 0 (Icon 1): offset 280
	//   - Entry 1 (Icon 2): offset 296
	//   - Entry 2 (Icon 3): offset 312
	//   - Entry 3 (Icon 4): offset 328
	//   - Entry 4 (GrpIcon): offset 344
	//   - Entry 5 (Manifest): offset 360
	// Raw Data starts at offset 376!

	var rsrc bytes.Buffer
	writeDir := func(idCount uint16, entries [][2]uint32) {
		_ = binary.Write(&rsrc, binary.LittleEndian, uint32(0))
		_ = binary.Write(&rsrc, binary.LittleEndian, uint32(0))
		_ = binary.Write(&rsrc, binary.LittleEndian, uint16(0))
		_ = binary.Write(&rsrc, binary.LittleEndian, uint16(0))
		_ = binary.Write(&rsrc, binary.LittleEndian, uint16(0))
		_ = binary.Write(&rsrc, binary.LittleEndian, idCount)
		for _, e := range entries {
			_ = binary.Write(&rsrc, binary.LittleEndian, e[0])
			_ = binary.Write(&rsrc, binary.LittleEndian, e[1])
		}
	}

	const subdirBit = 0x80000000

	// Root Dir (offset 0)
	writeDir(3, [][2]uint32{
		{3, subdirBit | 40},   // RT_ICON -> offset 40
		{14, subdirBit | 88},  // RT_GROUP_ICON -> offset 88
		{24, subdirBit | 112}, // RT_MANIFEST -> offset 112
	})

	// Level 2: RT_ICON Dir (offset 40)
	writeDir(4, [][2]uint32{
		{1, subdirBit | 136},
		{2, subdirBit | 160},
		{3, subdirBit | 184},
		{4, subdirBit | 208},
	})
	// Level 2: RT_GROUP_ICON Dir (offset 88)
	writeDir(1, [][2]uint32{
		{1, subdirBit | 232},
	})
	// Level 2: RT_MANIFEST Dir (offset 112)
	writeDir(1, [][2]uint32{
		{1, subdirBit | 256},
	})

	// Level 3: Language Dirs (offsets 136, 160, 184, 208, 232, 256)
	writeDir(1, [][2]uint32{{0x0409, 280}})
	writeDir(1, [][2]uint32{{0x0409, 296}})
	writeDir(1, [][2]uint32{{0x0409, 312}})
	writeDir(1, [][2]uint32{{0x0409, 328}})
	writeDir(1, [][2]uint32{{0x0409, 344}})
	writeDir(1, [][2]uint32{{0x0409, 360}})

	// Data Entries (offsets 280, 296, 312, 328, 344, 360)
	rawStart := uint32(376)
	off0 := rawStart
	off1 := off0 + uint32(len(icon1P))
	off2 := off1 + uint32(len(icon2P))
	off3 := off2 + uint32(len(icon3P))
	off4 := off3 + uint32(len(icon4P))
	off5 := off4 + uint32(len(grpP))

	writeDataEntry := func(dataOff, origSize uint32) {
		_ = binary.Write(&rsrc, binary.LittleEndian, dataOff)
		_ = binary.Write(&rsrc, binary.LittleEndian, origSize)
		_ = binary.Write(&rsrc, binary.LittleEndian, uint32(0))
		_ = binary.Write(&rsrc, binary.LittleEndian, uint32(0))
	}

	writeDataEntry(off0, uint32(len(icon1)))
	writeDataEntry(off1, uint32(len(icon2)))
	writeDataEntry(off2, uint32(len(icon3)))
	writeDataEntry(off3, uint32(len(icon4)))
	writeDataEntry(off4, uint32(len(grpIcon)))
	writeDataEntry(off5, uint32(len(manifest)))

	// Raw resource payloads
	rsrc.Write(icon1P)
	rsrc.Write(icon2P)
	rsrc.Write(icon3P)
	rsrc.Write(icon4P)
	rsrc.Write(grpP)
	rsrc.Write(manP)

	rsrcBytes := rsrc.Bytes()

	var coff bytes.Buffer
	_ = binary.Write(&coff, binary.LittleEndian, uint16(0x8664)) // AMD64
	_ = binary.Write(&coff, binary.LittleEndian, uint16(1))      // 1 section (.rsrc)
	_ = binary.Write(&coff, binary.LittleEndian, uint32(0))
	relocOffset := uint32(20 + 40 + len(rsrcBytes))
	symTableOffset := relocOffset + 6*10
	_ = binary.Write(&coff, binary.LittleEndian, symTableOffset)
	_ = binary.Write(&coff, binary.LittleEndian, uint32(1))
	_ = binary.Write(&coff, binary.LittleEndian, uint16(0))
	_ = binary.Write(&coff, binary.LittleEndian, uint16(0))

	var secName [8]byte
	copy(secName[:], ".rsrc")
	coff.Write(secName[:])
	_ = binary.Write(&coff, binary.LittleEndian, uint32(0))
	_ = binary.Write(&coff, binary.LittleEndian, uint32(0))
	_ = binary.Write(&coff, binary.LittleEndian, uint32(len(rsrcBytes)))
	_ = binary.Write(&coff, binary.LittleEndian, uint32(60))
	_ = binary.Write(&coff, binary.LittleEndian, relocOffset)
	_ = binary.Write(&coff, binary.LittleEndian, uint32(0))
	_ = binary.Write(&coff, binary.LittleEndian, uint16(6)) // 6 relocations
	_ = binary.Write(&coff, binary.LittleEndian, uint16(0))
	_ = binary.Write(&coff, binary.LittleEndian, uint32(0x40000040))

	coff.Write(rsrcBytes)

	dataEntryOffsets := []uint32{280, 296, 312, 328, 344, 360}
	for _, deo := range dataEntryOffsets {
		_ = binary.Write(&coff, binary.LittleEndian, deo)
		_ = binary.Write(&coff, binary.LittleEndian, uint32(0))
		_ = binary.Write(&coff, binary.LittleEndian, uint16(3)) // IMAGE_REL_AMD64_ADDR32NB
	}

	coff.Write(secName[:])
	_ = binary.Write(&coff, binary.LittleEndian, uint32(0))
	_ = binary.Write(&coff, binary.LittleEndian, int16(1))
	_ = binary.Write(&coff, binary.LittleEndian, uint16(0))
	coff.WriteByte(3)
	coff.WriteByte(0)

	_ = binary.Write(&coff, binary.LittleEndian, uint32(4))

	return coff.Bytes()
}

// Note: Using <gdiScaling>true</gdiScaling> instead of raw PerMonitorV2 ensures Windows 11 automatically scales
// all Win32 controls, buttons, and TrueType fonts crisply on 125%, 150%, and 200% High-DPI displays so nothing is ever tiny!
const win11ManifestXML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <assemblyIdentity type="win32" name="AegisROM.Desktop.App" version="0.6.0.0" processorArchitecture="amd64"/>
  <description>AegisROM — R36S &amp; Retro Console ROM Cataloger &amp; Scraper</description>
  <dependency>
    <dependentAssembly>
      <assemblyIdentity type="win32" name="Microsoft.Windows.Common-Controls" version="6.0.0.0" processorArchitecture="*" publicKeyToken="6595b64144ccf1df" language="*"/>
    </dependentAssembly>
  </dependency>
  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v3">
    <security>
      <requestedPrivileges>
        <requestedExecutionLevel level="asInvoker" uiAccess="false"/>
      </requestedPrivileges>
    </security>
  </trustInfo>
  <compatibility xmlns="urn:schemas-microsoft-com:compatibility.v1">
    <application>
      <supportedOS Id="{8e0f7a12-bfb3-4fe8-b9a5-48fd50a15a9a}"/>
      <supportedOS Id="{1f676c76-80e1-4239-95bb-83d0f6d0da78}"/>
    </application>
  </compatibility>
  <application xmlns="urn:schemas-microsoft-com:asm.v3">
    <windowsSettings>
      <gdiScaling xmlns="http://schemas.microsoft.com/SMI/2017/WindowsSettings">true</gdiScaling>
    </windowsSettings>
  </application>
</assembly>`

func main() {
	img256 := renderIconRGBA(256)
	img48 := renderIconRGBA(48)
	img32 := renderIconRGBA(32)
	img16 := renderIconRGBA(16)

	png256 := encodePNG(img256)
	dib48 := encodeIconDIB(img48)
	dib32 := encodeIconDIB(img32)
	dib16 := encodeIconDIB(img16)

	icoBytes, grpBytes := buildICOAndGroup(png256, dib48, dib32, dib16)

	_ = os.MkdirAll("public", 0755)
	_ = os.WriteFile(filepath.Join("public", "favicon.ico"), icoBytes, 0644)
	_ = os.WriteFile(filepath.Join("public", "aegisrom-icon.png"), png256, 0644)

	sysoBytes := buildCOFFSyso(png256, dib48, dib32, dib16, grpBytes, []byte(win11ManifestXML))
	_ = os.WriteFile(filepath.Join("cmd", "aegis-gui", "rsrc_windows_amd64.syso"), sysoBytes, 0644)
}
