# Resonance Tools

Dev tools for pack integrity and release prep.

## Release Checklist

Run these before tagging a release:

```bash
# 1. Pack integrity — must pass with 0 errors
python tools/pack_audit.py

# 2. Metadata strip — remove any encoder/prompt tags from new MP3s
python tools/strip_metadata.py --dry-run   # preview
python tools/strip_metadata.py             # strip

# 3. Level audit — review outliers (optional, for QA)
python tools/level_audit.py
```

> **IMPORTANT:** Any new MP3 added to `sounds/pack/` must be stripped
> before commit. ffmpeg and ElevenLabs both embed metadata that can
> expose generation prompts or toolchain details. Run `strip_metadata.py`
> after adding or regenerating any sound files.

## Tools

| Script | Purpose |
|---|---|
| `pack_audit.py` | Validates `pack.json` keys vs constants, UI cards, and files on disk |
| `strip_metadata.py` | Strips all ID3/metadata tags from pack MP3s |
| `level_audit.py` | Volume analysis by category, flags blown/quiet outliers |
