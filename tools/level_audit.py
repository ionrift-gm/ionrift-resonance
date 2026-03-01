"""
level_audit.py
--------------
Full-pack volume analysis across all categories.
Groups by folder, reports min/max/mean peak levels.
Flags outliers for manual review.

Usage: python level_audit.py
"""
import subprocess, re
from pathlib import Path
from collections import defaultdict

SOUNDS = Path(r"C:\Users\geoff\AppData\Local\FoundryVTT\Data\modules\ionrift-resonance\sounds\pack")

# Category-specific target peaks (dB). Used for flagging outliers.
CATEGORY_TARGETS = {
    "stingers":   -9.0,
    "combat":     -6.0,
    "monsters":   -6.0,
    "fx":         -9.0,
}
DEFAULT_TARGET = -6.0

def measure(path):
    r = subprocess.run(
        ["ffmpeg", "-i", str(path), "-af", "volumedetect", "-f", "null", "NUL"],
        capture_output=True, text=True
    )
    mx = re.search(r"max_volume:\s*([-\d.]+)", r.stderr)
    mn = re.search(r"mean_volume:\s*([-\d.]+)", r.stderr)
    return (float(mx.group(1)) if mx else None, float(mn.group(1)) if mn else None)

# ── Gather all files by category ──────────────────────────────────────────────

files = sorted([f for f in SOUNDS.rglob("*.mp3") if "_backup" not in str(f)])
categories = defaultdict(list)

print(f"Measuring {len(files)} files...")
for f in files:
    rel = f.relative_to(SOUNDS)
    category = rel.parts[0] if len(rel.parts) > 1 else "root"
    mx, mn = measure(f)
    if mx is not None:
        categories[category].append((rel, mx, mn))

# ── Report by category ───────────────────────────────────────────────────────

print(f"\n{'='*70}")
print(f"{'Category':<15} {'Files':>5}  {'Min Peak':>9} {'Max Peak':>9} {'Avg Peak':>9}  {'Target':>7}  Status")
print(f"{'-'*70}")

all_outliers = []

for cat in sorted(categories.keys()):
    items = categories[cat]
    peaks = [mx for _, mx, _ in items]
    min_p = min(peaks)
    max_p = max(peaks)
    avg_p = sum(peaks) / len(peaks)
    target = CATEGORY_TARGETS.get(cat, DEFAULT_TARGET)

    # Flag if any file is above -3dB (blown) or if range spans > 6dB (inconsistent)
    blown = [i for i in items if i[1] > -3.0]
    quiet = [i for i in items if i[1] < -15.0]
    spread = max_p - min_p

    status = "OK"
    if blown:
        status = f"BLOWN ({len(blown)})"
    elif spread > 6.0:
        status = f"SPREAD {spread:.0f}dB"
    elif quiet:
        status = f"QUIET ({len(quiet)})"

    print(f"{cat:<15} {len(items):>5}  {min_p:>+8.1f}  {max_p:>+8.1f}  {avg_p:>+8.1f}   {target:>+6.1f}  {status}")

    for rel, mx, mn in items:
        if mx > -3.0:
            all_outliers.append(("BLOWN", cat, rel, mx))
        elif mx < -15.0:
            all_outliers.append(("QUIET", cat, rel, mx))

# ── Outlier detail ────────────────────────────────────────────────────────────

if all_outliers:
    print(f"\n{'='*70}")
    print(f"OUTLIERS ({len(all_outliers)} files for manual review):")
    for tag, cat, rel, mx in sorted(all_outliers, key=lambda x: x[3], reverse=True):
        print(f"  [{tag}] {mx:+6.1f}dB  {rel}")
else:
    print(f"\nNo outliers found.")

print(f"\nTotal: {len(files)} files across {len(categories)} categories")
