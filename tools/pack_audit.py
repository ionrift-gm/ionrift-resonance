"""
pack_audit.py
-------------
Validates pack.json integrity against constants, UI cards, and actual files on disk.

Usage: python pack_audit.py
"""
import json, re, os, sys
from pathlib import Path

MODULE = Path(r"C:\Users\geoff\AppData\Local\FoundryVTT\Data\modules\ionrift-resonance")
PACK   = MODULE / "scripts" / "presets" / "pack.json"
CONST  = MODULE / "scripts" / "constants.js"
UI     = MODULE / "scripts" / "apps" / "SoundConfigApp.js"
SOUNDS = MODULE / "sounds"

errors = []
warnings = []

def err(msg):  errors.append(msg)
def warn(msg): warnings.append(msg)

# ── Load data ─────────────────────────────────────────────────────────────────

raw = json.load(open(PACK, encoding="utf-8"))
pack = raw.get("bindings", raw)
pack_keys = set(pack.keys())

# Extract SOUND_EVENTS from constants
consts = {}
with open(CONST, encoding="utf-8") as f:
    src = f.read()
    for m in re.finditer(r'(\w+):\s*"(\w+)"', src):
        consts[m.group(1)] = m.group(2)

aliases = {k: v for k, v in consts.items() if k != v}
const_values = set(consts.values())

# Extract UI card IDs
ui_ids = set()
with open(UI, encoding="utf-8") as f:
    for m in re.finditer(r'id:\s*"([A-Z_]+)"', f.read()):
        ui_ids.add(m.group(1))

# ── 1. Pack files exist on disk ───────────────────────────────────────────────
print("1. Checking pack file paths exist on disk...")
missing_files = 0
for key, sounds in pack.items():
    for s in sounds:
        fpath = MODULE.parent.parent / s["id"]
        if not fpath.exists():
            err(f"  MISSING FILE: {s['id']} (key: {key})")
            missing_files += 1
print(f"   {missing_files} missing files" if missing_files else "   All files OK")

# ── 2. Pack keys vs constants ─────────────────────────────────────────────────
print("\n2. Pack keys not in constants (orphan pack entries)...")
orphans = pack_keys - const_values
for k in sorted(orphans):
    warn(f"  {k} — in pack.json but no constant resolves to it")
print(f"   {len(orphans)} orphan keys" if orphans else "   All mapped")

# ── 3. Constants with no pack entry (and not aliased) ─────────────────────────
print("\n3. Constants with no pack entry (potential gaps)...")
# Only check non-alias constants that have their own unique string value
unique_const_vals = set(v for k, v in consts.items() if k == v)
no_pack = unique_const_vals - pack_keys
# Filter out known abstract/routing keys
SKIP = {"CORE_MELEE", "CORE_RANGED", "CORE_MAGIC", "DAGGERHEART_FEAR_USE", "DAGGERHEART_FEAR"}
flagged = sorted(no_pack - SKIP)
for k in flagged:
    warn(f"  {k} — constant exists but no pack.json sounds")
print(f"   {len(flagged)} gaps" if flagged else "   All constants have pack entries")

# ── 4. UI cards with no pack entry ────────────────────────────────────────────
print("\n4. UI cards with no pack sounds (will show 'NO SOUND BOUND')...")
ui_no_pack = sorted(ui_ids - pack_keys)
for k in ui_no_pack:
    is_alias = f" (alias -> {aliases[k]})" if k in aliases else ""
    warn(f"  {k}{is_alias}")
print(f"   {len(ui_no_pack)} unbound cards" if ui_no_pack else "   All cards have sounds")

# ── 5. Aliases that also have pack entries (potential double-bind) ─────────────
print("\n5. Aliases that ALSO have their own pack entries (double-bind risk)...")
double = sorted(k for k in aliases if k in pack_keys)
for k in double:
    err(f"  {k} -> {aliases[k]} — both have pack.json entries, will create duplicate bindings")
print(f"   {len(double)} double-binds" if double else "   No double-binds")

# ── 6. Duplicate file references ──────────────────────────────────────────────
print("\n6. Checking for duplicate file references across keys...")
seen = {}
dupes = 0
for key, sounds in pack.items():
    for s in sounds:
        fid = s["id"]
        if fid in seen:
            warn(f"  {fid} used by both '{seen[fid]}' and '{key}'")
            dupes += 1
        else:
            seen[fid] = key
print(f"   {dupes} duplicates" if dupes else "   No duplicates")

# ── Summary ───────────────────────────────────────────────────────────────────
print(f"\n{'='*60}")
print(f"ERRORS:   {len(errors)}")
print(f"WARNINGS: {len(warnings)}")
if errors:
    print("\nERRORS (must fix):")
    for e in errors: print(f"  {e}")
if not errors and not warnings:
    print("\nPack audit PASSED")
elif not errors:
    print(f"\nPack audit PASSED with {len(warnings)} warnings")
else:
    print(f"\nPack audit FAILED")
    sys.exit(1)
