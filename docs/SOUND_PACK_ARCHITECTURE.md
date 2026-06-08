# Resonance Sound Pack Architecture

> Self-describing sound packs that extend the creature classifier.

## Overview

Resonance uses a **plug-in architecture** for sound packs. Each pack is a
self-contained overlay that declares what creature subtypes it handles and
provides the sound files for those creatures. When installed, the pack
extends the module's creature vocabulary. When removed, creatures gracefully
degrade to generic type-level sounds.

No Resonance code changes are required for new packs.

## How it works

```
Actor → Classifier → MonsterVocalMap → SoundResolver → Audio Playback
                         ↑
                 classifierBindings
                   from pack manifest
```

1. **Classifier** (`ionrift-library/creatureClassifier.js`) analyses a
   Foundry actor's type, traits, and description. Returns `{ type, subtype, sound }`.

2. **MonsterVocalMap** (`data/MonsterVocalMap.js`) routes the classifier
   output to a sound event key. Checks:
   - Dynamic bindings from pack manifests (highest priority)
   - Static `SUBTYPE_VOCAL_MAP` (built-in creature types)
   - Prefix fallback (`beast_canine_domestic` → `beast_canine`)

3. **SoundResolver** resolves the key to an audio clip path from the
   merged binding pool (all enabled packs contribute).

4. If no binding exists for the key, the fallback chain fires:
   `MONSTER_VAMPIRE` → `MONSTER_UNDEAD` → `CORE_MONSTER_PAIN`

## Pack manifest contract

A sound pack lives in the overlay directory:
```
ionrift-data/overlays/ionrift-resonance/{sublayer}/
├── manifest.json        (required)
├── bindings.json        (required)
├── overlay-manifest.json (required for Patreon Library overlays)
└── sounds/              (audio files)
```

### manifest.json

```json
{
    "id": "ionrift-soundpack-bone-dust",
    "packId": "ionrift-soundpack-bone-dust",
    "name": "Bone & Dust Creature SFX",
    "version": "1.0.0",
    "author": "Ionrift",
    "description": "Creature vocal expansion for catacombs and ruins.",
    "systems": ["dnd5e", "pf2e", "daggerheart"],
    "tier": "Initiate",
    "packType": "sfx",
    "format": "zip",
    "contentTypes": [".mp3"],
    "classifierBindings": {
        "undead_vampire": "MONSTER_VAMPIRE",
        "undead_mummy": "MONSTER_MUMMY"
    }
}
```

### classifierBindings (the plug-in contract)

The `classifierBindings` field maps classifier subtype composite keys
to sound event keys. When SoundPackLoader loads the pack, it registers
these mappings in its dynamic classifier registry. MonsterVocalMap
checks this registry before the static map.

**Key format:** `{type}_{subtype}` — matches the composite key built
from the classifier's `type` and `subtype` fields.

**Value format:** Sound event key string (e.g. `MONSTER_VAMPIRE`).
Must match a key in the pack's `bindings.json`.

### bindings.json

Standard Resonance binding format. Each key maps to an array of
sound clip objects:

```json
{
    "version": "1.0",
    "bindings": {
        "MONSTER_VAMPIRE": [
            { "id": "sounds/monsters/vampire/MONSTER_VAMPIRE_01.mp3", "name": "Vampire (01)", "type": "local" },
            { "id": "sounds/monsters/vampire/MONSTER_VAMPIRE_02.mp3", "name": "Vampire (02)", "type": "local" }
        ]
    }
}
```

Paths are relative to the pack root. SoundPackLoader resolves them
to full paths automatically.

## Graceful degradation

When a pack is **not installed**, the classifier still produces the
subtype (e.g. `undead_vampire`). The resolution chain:

1. Dynamic classifier binding → empty (no pack) → skip
2. Static SUBTYPE_VOCAL_MAP → no entry for `undead_vampire` → skip
3. `classification.sound` → `MONSTER_VAMPIRE` (from classifier) → no binding → skip
4. `MONSTER_UNDEAD` → core pack has binding → **plays generic undead**

When the pack **is installed**:

1. Dynamic classifier binding → `MONSTER_VAMPIRE` → binding found → **plays vampire clip**

## Sound file conventions

- Directory: `sounds/monsters/{creature}/`
- Naming: `MONSTER_{TYPE}_{NN}.mp3` (zero-padded, e.g. `01`, `02`)
- Format: MP3, 44.1kHz, mono or stereo
- Duration: 0.5–2.0 seconds (vocal stingers, not loops)
- Count: 4–5 clips per creature for pool variety

## Adding a new creature pack

1. **Check the classifier** — does it already produce a subtype for
   your creature? Check `dnd5eData.js` and `classifierData.js`.
   If not, add the subtype (kernel change, requires lib version bump).

2. **Create the pack directory** in the workshop:
   ```
   ionrift-pack-workshop/packs/resonance/standard/{pack-name}/
   ```

3. **Write manifest.json** with `classifierBindings` mapping your
   subtypes to sound keys.

4. **Write bindings.json** with sound clip entries for each key.

5. **Add sound files** to `sounds/monsters/{creature}/`.

6. **Test** — create a token with the creature name, attack it,
   verify the correct vocal plays. Disable the overlay, verify
   it falls back to the parent type sound.

## ElevenLabs compliance

This architecture demonstrates that sounds are functional parameters
of an automated classification system, not a browsable library:

1. **No user selection.** The classifier analyses the actor automatically.
2. **Gameplay-triggered.** Sounds fire on attack/damage hooks.
3. **Packs extend classification.** They refine the system's output
   fidelity, not provide standalone content.
4. **No standalone value.** Sound files are keyed to binding IDs and
   cannot be browsed or used outside Resonance's pipeline.
