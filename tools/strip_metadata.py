"""
strip_metadata.py
-----------------
Strips ALL ID3/metadata tags from pack MP3 files.
Removes ElevenLabs prompts, generator info, and any other embedded data.

Usage: python strip_metadata.py [--dry-run]
"""
import subprocess, sys, shutil
from pathlib import Path

SOUNDS = Path(r"C:\Users\geoff\AppData\Local\FoundryVTT\Data\modules\ionrift-resonance\sounds\pack")
DRY_RUN = "--dry-run" in sys.argv

def has_metadata(path):
    """Check if file has non-trivial metadata."""
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format_tags",
         "-of", "default=noprint_wrappers=1", str(path)],
        capture_output=True, text=True
    )
    # Filter out empty or trivial tags
    tags = [l.strip() for l in r.stdout.strip().splitlines() if l.strip() and "=" in l]
    return tags

def strip(path):
    """Strip all metadata from MP3, re-encode in place."""
    tmp = path.with_suffix(".stripped.mp3")
    result = subprocess.run([
        "ffmpeg", "-y", "-i", str(path),
        "-map_metadata", "-1",  # strip all metadata
        "-c:a", "copy",         # don't re-encode audio
        "-write_xing", "0",     # skip Xing header junk
        str(tmp)
    ], capture_output=True, text=True)

    if result.returncode == 0:
        tmp.replace(path)
        return True
    else:
        tmp.unlink(missing_ok=True)
        return False

# ── Main ──────────────────────────────────────────────────────────────────────

files = sorted(SOUNDS.rglob("*.mp3"))
# Skip backup folders
files = [f for f in files if "_backup" not in str(f)]

print(f"Scanning {len(files)} MP3 files in {SOUNDS}...")
if DRY_RUN:
    print("DRY RUN — no files will be modified\n")

tagged = 0
stripped = 0
for f in files:
    tags = has_metadata(f)
    if tags:
        tagged += 1
        rel = f.relative_to(SOUNDS)
        if DRY_RUN:
            print(f"  WOULD STRIP: {rel}")
            for t in tags[:3]:
                print(f"    {t}")
            if len(tags) > 3:
                print(f"    ...({len(tags)} tags total)")
        else:
            ok = strip(f)
            if ok:
                stripped += 1
                print(f"  STRIPPED: {rel} ({len(tags)} tags)")
            else:
                print(f"  FAILED: {rel}")

print(f"\nTotal: {len(files)} files scanned")
print(f"With metadata: {tagged}")
if not DRY_RUN:
    print(f"Stripped: {stripped}")
else:
    print("Run without --dry-run to strip")
