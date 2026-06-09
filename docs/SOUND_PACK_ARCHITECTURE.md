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

## Attack and Spell Attack Bindings

Packs can ship per-monster attack vocalizations alongside pain/death vocals.
The `attackBindings` field in `manifest.json` declares:

- **`attack`** — Phase 1 (ASK) sound key for basic/melee attacks. Played when the
  creature uses a non-spell item. Takes priority over the synthesised composite key
  (`*_BITE`, `*_CLAW`, etc.), giving packs explicit control over what "attacking"
  sounds like for their creature.
- **`spellAttacks`** — ordered list of spell matchers. Only consulted when the item
  is a spell and the actor is an NPC with a recognized creature classification.
  First matching entry wins.

### attackBindings schema

```json
"attackBindings": {
    "MONSTER_RAT": {
        "attack": "MONSTER_RAT_ATTACK"
    },
    "MONSTER_LICH": {
        "attack": "MONSTER_LICH_ATTACK",
        "spellAttacks": [
            {
                "key": "MONSTER_LICH_SPELL_TOUCH",
                "match": { "school": ["nec"], "delivery": "touch" },
                "overrideSpellEffect": true
            },
            {
                "key": "MONSTER_LICH_SPELL_CAST",
                "match": {},
                "overrideSpellEffect": false
            }
        ]
    }
}
```

### spellAttacks matcher fields

| Field | Type | Description |
|---|---|---|
| `key` | `string` | Sound event key to play when this matcher hits. Must have a binding in `bindings.json`. |
| `match` | `object` | Criteria object. All specified fields must match (AND). Empty `{}` = catch-all. |
| `match.school` | `string[]` | Spell school abbreviations (`nec`, `evo`, `abj`, `div`, `con`, `enc`, `ill`, `tra`). |
| `match.delivery` | `string` | `"touch"` · `"ranged"` · `"save"`. System-neutral abstraction over action type. |
| `overrideSpellEffect` | `boolean` | See below. |

### delivery abstraction

`delivery` maps to the system's action type so pack manifests stay system-neutral:

| Delivery | dnd5e actionType | Meaning |
|---|---|---|
| `"touch"` | `msak` | Melee spell attack (Vampiric Touch, Shocking Grasp) |
| `"ranged"` | `rsak` | Ranged spell attack (Fire Bolt, Ray of Frost) |
| `"save"` | `save` | Save-based (Fireball, Hold Person) |

### overrideSpellEffect behaviour

Controls what happens in Phase 1 (ASK) when a spell is cast:

**`overrideSpellEffect: true`** — Monster vocal *replaces* the spell effect sound.
Use for close-range spells where the creature IS the effect (e.g. Vampiric Touch —
the lich's dark hand is the whole event, no separate spell blast sound makes sense).

```
Lich casts Vampiric Touch: MONSTER_LICH_SPELL_TOUCH plays. No SPELL_VOID.
```

**`overrideSpellEffect: false`** — Monster vocal plays first, then the spell effect
sound follows with a short stagger (default 250ms, configurable via
`MONSTER_SPELL_EFFECT_DELAY` orchestrator offset). Use for ranged or area spells
where the creature vocalizes an incantation and the spell effect is a separate event.

```
Lich casts Fireball: MONSTER_LICH_SPELL_CAST plays, then SPELL_FIRE 250ms later.
```

**No match** — If no spell matcher hits (or the matched key has no audio binding),
the standard spell school flow fires unchanged.

### Sound file conventions for attack/spell clips

- Directory: `sounds/monsters/{creature}/`
- Naming:
  - Basic attacks: `MONSTER_{TYPE}_ATTACK_{NN}.mp3`
  - Spell vocalizations: `MONSTER_{TYPE}_SPELL_{NN}.mp3` or `MONSTER_{TYPE}_SPELL_{VARIANT}_{NN}.mp3`
- Duration: 0.5–2.5 seconds (slightly longer than pain vocals — attack/cast buildup)
- Count: 3 clips minimum for pool variety

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
