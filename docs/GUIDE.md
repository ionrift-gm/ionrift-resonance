# Ionrift Reactive Sounds: User Guide

## Getting Started

### 1. Installation
Install the module from the Foundry VTT Package Browser.
*   **Recommended**: Install `midi-qol` if playing DnD 5e for full automation support.

### 2. Audio Provider Setup
Ionrift works best with **Syrinscape**.
1.  Go to **Module Settings** -> **Ionrift Reactive Sounds**.
2.  Open **Setup Guide**.
3.  Enter your **Syrinscape Auth Token**.

> **Note**: You can also use Local Audio (Playlists), but Syrinscape offers the most dynamic library.

## Configuration Wizard
The heart of the module is the **Sound Configuration Wizard**.
*   **Access**: Module Settings -> Sound Configuration Wizard.

### The Tiers
The system uses a priority waterfall. It checks Tier 4 first, then 3, then 2, then 1.

*   **Tier 4 (Campaign)**: Specific overrides for unique items ("Sunsword") or Actors ("Strahd").
*   **Tier 3 (Monsters)**: Family-based sounds (Zombie, Orc, Dragon). The system tries to guess the family from the actor name.
*   **Tier 2 (Categories)**: Weapon types (Sword, Bow) and Magic Schools (Fire, Ice).
*   **Tier 1 (Core)**: The fallbacks. Generic Hits, Misses, Crits, and Death sounds.

### Player Configuration
In the **Players** tab, you can assign specific Pain and Death sounds to each Player Character, giving them a unique auditory identity.
