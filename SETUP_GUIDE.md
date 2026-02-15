# Ionrift Resonance: Setup & Configuration

> **Note:** This module is designed to be "Quiet by Default". It will not play sounds until you explicitly configure it or load a preset.

## Quick Start

1.  **Install & Enable**: Ensure `ionrift-resonance` and `ionrift-library` are enabled.
2.  **Attunement**: Upon first launch (as GM), the "Attunement Protocol" window will appear.
3.  **Choose Preset**: Select **"None (Manual / Custom)"** to start with a clean slate.
    *   *Note: "Paid Sound Profile" presets require a valid Syrinscape subscription and are currently disabled for public release.*

## System Requirements

### Daggerheart (Critical)
To enable sound automation for Daggerheart (Attack Rolls, Damage, Hope/Fear), you **MUST** enable Automation Settings in the Daggerheart System options.

1.  Go to **Game Settings** -> **Configure Settings** -> **System Settings (Daggerheart)**.
2.  Click **"Configure Automation"**.
3.  Ensure the following are checked/enabled for both GM and Players:
    *   [x] **Roll** (Auto behavior for rolls)
    *   [x] **Damage/Healing Roll** (Set to "Always")
    *   [x] **Hope & Fear** (Enabled for GM & Players)
    *   [x] **Apply Damage/Healing** (Enabled)
    *   [x] **Apply Effects** (Enabled)
    *   [x] **Triggers -> Enabled** (Critical for Fear/Hope tracking)

> **Why?** Resonance relies on the system's "Hooks" to know when events happen. If automation is disabled, Daggerheart does not broadcast these events, and Resonance stays silent.

### DnD5e
Resonance primarily listens to:
*   **Midi-QOL** (Workflow events) - *Highly Recommended for best experience.*
*   **Core Rolls** (Attack/Damage chat messages) - *Basic support.*

## Sound Configuration

### The "Sound Picker"
1.  Open any **Actor** or **Item** sheet.
2.  Click the **"Sounds"** button in the window header.
3.  **Browse**: Search for sounds (requires internet connection to Syrinscape).
4.  **Select**: Click a sound to assign it to that specific action (e.g., "Attack Hit").
5.  **Save**: The sound is now bound to that item/actor.

### Global Calibration
1.  Go to **Game Settings** -> **Ionrift Resonance** -> **Sound Configuration**.
2.  Here you can set **Global Defaults** (e.g., "All Swords play *Schwing*").
3.  You can also override specific sounds for specific actors without opening their sheets.

## Troubleshooting

-   **"I hear nothing!"**: Check the **"None"** preset. Did you assign any sounds yet?
-   **"Phantom Sounds"**: If you hear sounds you didn't set, check if you have a default preset active. Switch to "None" in the Attunement settings.
-   **Syrinscape Error**: verify your Auth Token in the "Attunement Protocol" or Module Settings.
