[Русский](hacks.md) · **English**

# Hacks, translations and patches

AegisROM tells hacks, fan translations and patched ROMs apart from originals: it does not remove them as duplicates, shows how they differ, and can apply patches itself.

## Folders

Each console folder has two subfolders:

```text
snes/
├── hackroms/   # hacks, translations and patched ROMs
└── patch/      # patch files (.ips .ups .bps .xdelta) for original ROMs
```

They are created automatically the first time the app puts a file there. You can also create them by hand.

## How the app knows a ROM is a hack

From most to least reliable:

1. **A patch in `patch/`.** BPS and UPS patches store the checksum of the source ROM and of the result. If a ROM is produced by such a patch, its card says "made with patch …". A clean ROM that a patch fits says "patches available in patch/".
2. **DAT hash check** (during online rename, see [dat.md](dat.md)). If the hash matches a clean original, the ROM counts as an original even if its name has a hack tag. If the hash is not in the DAT and the name has a tag, the card says "hash not found in DAT: the ROM is modified".
3. **File name tags** (GoodTools and No-Intro style):

   | Tag | Meaning |
   |---|---|
   | `[T+Rus]`, `[T+Rus1.0_Author]`, `[T-Eng]`, `(Rus Translation)` | translation; language, version and author come from the tag |
   | `[h]`, `[h1]`, `[hM04]`, `(Hack)`, `(Kaizo Hack)`, `[Hack]` | hack |
   | `[f]`, `[f1]`, `(Fixed)` | fix (corrected dump) |
   | `[t]`, `[t1]`, `(Trainer)` | trainer (built-in cheats) |
   | `(Patched)` | patched ROM |

4. **The `hackroms/` folder.** An untagged ROM inside `hackroms/` counts as patched.

The game card's "Hack / patch" row shows what it is (translation, hack, fix), the language, version, author, which original it is based on and which patch made it.

## 1G1R

1G1R no longer removes hacks and translations as duplicates of the original. Exact copies (same CRC32) are still duplicates.

If 1G1R finds hacks outside `hackroms/`, a "Move hacks to hackroms/?" window opens. Tick the ones you want and press "Move". Covers, videos and saves move with the ROM. "Leave as is" changes nothing.

When sorting the catalog, hacks and translations go straight into `<console>/hackroms/`.

## Filters, sorting, builds

- **Library → Status:** all, originals only, all modified, translations, hacks, other patches.
- **Sort → Status:** originals first, then translations, hacks and other patches.
- **Builds → By status:** ready-made presets "Russian translations only", "ROM hacks only" and "Originals only, no hacks or patches".

## Renaming

The filename constructor has a **"Status (hack / translation)"** block. It adds a `[T+Rus]`, `[Hack]`, `[Fixed]`, `[Trainer]` or `[Patched]` tag. Originals get no tag, so the block is on by default: without it a renamed hack would get the original's name.

Example: `Final Fantasy (U) [T+Rus1.0_Shedevr].nes` → `Final Fantasy (USA) [T+Rus].nes`.

## Patcher

**Tools → ROM patcher.**

1. Pick a clean ROM and a patch file. The app shows the patch format and checks whether the ROM fits (by CRC32 for BPS and UPS).
2. Pick a tag: translation (`T+Rus`, the language can be changed), hack, fix or custom.
3. **Patch and download** saves the result as a file. **Patch into console folder…** asks for the console folder: the result goes to `hackroms/` and the patch is copied to `patch/`.

If a SNES ROM has a 512-byte copier header and the patch was made for a headerless ROM, the app removes the header itself.

### Formats and limits

| Format | Support |
|---|---|
| IPS (including RLE and truncation) | yes |
| UPS | yes, with CRC32 check |
| BPS | yes, with CRC32 check and metadata |
| xdelta (VCDIFF) | yes, including LZMA secondary compression (the `xdelta3` default) and DJW. FGK compression is not supported: recreate such a patch with `xdelta3 -e -S lzma -s original result patch.xdelta`. |

- No ROM size limit: the ROM is read from disk in pieces and the result is written to a temporary browser file, then saved from there. You need free disk space the size of the result.
- For ROMs over 16 MB the scanner computes the full CRC32 only when `patch/` holds a BPS/UPS patch for exactly that size, so linking works for large images too.
- IPS and xdelta do not store the ROM checksum, so whether a ROM fits cannot be checked in advance.
