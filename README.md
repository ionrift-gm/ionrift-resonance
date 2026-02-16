# Ionrift Resonance
![Downloads](https://img.shields.io/github/downloads/ionrift-gm/ionrift-resonance/total?color=violet&label=Downloads)
![Latest Release](https://img.shields.io/github/v/release/ionrift-gm/ionrift-resonance?color=violet&label=Latest%20Version)
![Foundry Version](https://img.shields.io/badge/Foundry-v12-333333?style=flat&logo=foundryvirtualtabletop)
![Systems](https://img.shields.io/badge/systems-dnd5e%20%7C%20daggerheart-blue)

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

> **Note:** This release focuses on manual configuration ("Standard Setup"). Curated presets are currently disabled and will be available in future updates.

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
*   **[Ionrift Library](https://github.com/ionrift-gm/ionrift-library)** — Required core module.
*   **[Midi-QOL](https://foundryvtt.com/packages/midi-qol)** — Required for DnD 5e combat automation.

### Recommended Modules
These are not required but significantly improve the experience:

*   **[Dice So Nice](https://foundryvtt.com/packages/dice-so-nice)** — 3D dice animations add a natural pause between the attack roll and result, giving Resonance's two-beat sound sequence (weapon swing → hit/miss) room to breathe. Works well with both Daggerheart and DnD 5e.
*   **[Automated Animations](https://foundryvtt.com/packages/autoanimations)** — Attack and spell animations create timing gaps that let weapon and impact sounds play distinctly rather than overlapping.
*   **[fvtt-syrin-control](https://foundryvtt.com/packages/fvtt-syrin-control)** — Legacy Syrinscape integration fallback. Not needed if using a Syrinscape auth token directly.

## Supported Systems

### 1. Daggerheart
**Native Support**. No external modules required (other than core dependencies).
*   Sound triggers on Duality Dice rolls (Fear/Hope/Crit).
*   **Fear Tracker**: Dynamic sounds for GM Fear Gain (Thresholds 1-4, 5-8, 9+) and variable Spends.
*   **Resources**: Triggers for Hope Gain/Use and Stress Take/Clear.
*   Automatic chat card parsing.

### 2. DnD 5e
**Requires [Midi-QOL](https://foundryvtt.com/packages/midi-qol)** for combat automation.

Without Midi-QOL, Resonance falls back to native DnD5e hooks which provide limited automation (attack rolls only, no damage/death detection).

**Supported Triggers:**
*   **Attacks**: Weapon swing → then Hit, Miss, or Critical result (two-beat sequence).
*   **Damage**:
    *   **Pain**: Configured pain sounds for PCs (Masculine/Feminine) and Monsters (classified by creature type).
    *   **Death**: Detects when HP drops to 0 and plays a death sound.
*   **Items**:
    *   **Weapons**: Detects Damage Type (Slashing → Sword, Bludgeoning → Mace, etc.).
    *   **Spells**: Maps to Spell Schools (Evocation, Necromancy, etc.) and effect types (Fire, Ice, Void).
    *   **Specifics**: Tier 4 overrides work for any item name (e.g. override "Fireball" specifically).

#### Recommended: Midi-QOL Setup

For the best experience, Resonance works with Midi-QOL's **automated workflow**. This gives Resonance access to attack results, damage rolls, and target HP changes.

**Recommended Midi-QOL Workflow Settings:**
1.  Open **Module Settings → Midi-QOL → Workflow Settings**.
2.  Set **Auto Roll Attack** and **Auto Roll Damage** to your preference — Resonance works with any setting.
3.  Enable **Auto Apply Damage** (or "Apply Damage to Target") so that HP changes fire the damage hook and trigger pain/death vocals.

> **Tip:** Dice So Nice and Automated Animations are particularly effective with DnD 5e, as they insert natural pauses between the weapon swing sound and the hit/miss result.

---

## License
MIT License. See [LICENSE](./LICENSE) for details.

---
*Part of the [Ionrift Module Suite](https://github.com/ionrift-gm).*
