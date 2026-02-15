# Ionrift Resonance
![Downloads](https://img.shields.io/github/downloads/ionrift-gm/ionrift-sounds/total?color=violet&label=Downloads)
![Latest Release](https://img.shields.io/github/v/release/ionrift-gm/ionrift-sounds?color=violet&label=Latest%20Version)

**Automated audio triggers for Foundry VTT.**

Triggers sound effects based on chat messages, mechanics, and combat workflows. Supports **Daggerheart** (Native) and **DnD5e** (via Midi-QOL). Integrates with Syrinscape (via `fvtt-syrin-control`) to handle the audio.

## Features
*   **Duality Dice Support**: Recognizes Daggerheart roll mechanics.
    *   **Fear**: Plays dark/tense sounds when Fear interacts with the roll.
    *   **Hope**: Plays heroic/uplifting sounds when Hope prevails.
    *   **Criticals**: Distinct audio cues for rolling doubles (Crits).
*   **Contextual Triggers**:
    *   **Damage**: "Blood splat" sounds when actors take damage.
    *   **Death**: Dramatic cues when an actor takes damage exceeding their max HP.
    *   **Misses**: "Whoosh" or failure sounds on missed attacks.
*   **Smart Matching**: Automatically picks sounds based on weapon names (Sword, Dagger, Bow) or spell keywords (Fire, Ice, Void).

## Resonance Calibration
Ionrift Resonance features a comprehensive configuration UI used to map game events to specific Syrinscape Sound IDs.

Open it via **Module Settings -> Ionrift Resonance -> Resonance Calibration**.

### Tier 1: Core Events
Override the fundamental sounds of the system, such as Critical Hits, Misses, and Generic PC Death sounds.
*   **Tip**: Enter multiple IDs separated by commas (e.g. `1234, 5678`) to randomize playback.

### Tier 2: Categories
Configure sounds for broad categories like specific Weapon types (Axes, Bows, Swords) and Magic Schools (Fire, Ice, Necrotic).

### Tier 3: Monsters
Assign default sounds to entire families of creatures. The system attempts to classify actors (e.g. "Zombie Shambler" -> Zombie) and play the appropriate family sound.

### Tier 4: Campaign Overrides
Create highly specific mappings for unique Campaign Actors or Items.
*   **Actor Name**: Restricts the sound to a specific Actor (e.g. "Strahd"). Leave blank for any actor.
*   **Item Name**: The specific weapon or attack name (e.g. "Sunsword").
*   **Sound ID**: The Syrinscape element to play.

### Players Tab
Define specific pain and death sounds for your Player Characters, overriding generic gender defaults.
*   **Pain ID**: Plays when the character takes damage.
*   **Death ID**: Plays when the character drops to 0 HP / dies.

## Data Management
*   **Export JSON**: You can backup your entire configuration (including all overrides and player settings) to a JSON file via the **Export JSON** button in the calibration footer.
*   **Syrinscape Token**: To ensure reliable playback, enter your Syrinscape Auth Token in the Module Settings.

## Dependencies
*   **[Ionrift Library](https://github.com/ionrift-gm/ionrift-library)** (Required Core)
*   *[Optional] [fvtt-syrin-control](https://foundryvtt.com/packages/fvtt-syrin-control)* - Legacy fallback.

## Supported Systems

### 1. Daggerheart
**Native Support**. No external modules required (other than core dependencies).
*   Sound triggers on Duality Dice rolls (Fear/Hope/Crit).
*   Automatic chat card parsing.

### 2. DnD 5e
**Requires [Midi-QOL](https://foundryvtt.com/packages/midi-qol)**.
The module listens to Midi-QOL workflows to automate combat sounds.

**Supported Triggers:**
*   **Attacks**: Hits, Misses, and Critical Hits.
*   **Damage**:
    *   **Pain**: Plays configured pain sounds for PCs (Masculine/Feminine) and Monsters (based on creature type: Undead, Beast, etc.).
    *   **Death**: Detects when HP drops to 0 and plays a death sound (PC or Generic).
*   **Items**:
    *   **Weapons**: Detects Damage Type (Slashing -> Sword sound, Bludgeoning -> Mace sound, etc.).
    *   **Spells**: Detects Magic School (Evocation -> Fire, Necromancy -> Void, etc.).
    *   **Specifics**: Configuration overrides (Tier 4) work for any item name (e.g. override "Fireball" specifically).

---

## License
MIT License. See [LICENSE](./LICENSE) for details.

---
*Part of the [Ionrift Module Suite](https://github.com/ionrift-gm).*
