# Changelog

## [1.8.1] - Workshop Decoupling & Sync Fix
*   **Architecture**: Decoupled `ionrift-resonance` from `ionrift-workshop`. Resonance is now a standalone module.
    *   Sound Picker and Actor/Item Sound Config apps are now native to Resonance.
*   **Fix**: Resolved "0 Results" bug in Syrinscape Library Sync caused by stale token caching.
*   **Fix**: Resolved 400 Errors when playing sounds with invalid keys (e.g. `CORE_MELEE` without binding).
*   **Fix**: Fixed Attunement Wizard failing to apply defaults ("Sound Preset") on first run due to safety lock conflict.
*   **Fix**: Added automatic fallback to Direct API if `syrinscape-control` module fails (fixes playback on first install).
*   **Improvement**: Attunement Wizard now prompts for a World Reload if `syrinscape-control` settings were updated, ensuring full synchronization.

## [1.8.0] - Daggerheart Sound Overhaul
*   **Feature**: Complete overhaul of Daggerheart sound triggers.
    *   **Fear Gain**: Now triggers on specific thresholds (Low: 1-4, Med: 5-8, High: 9+) rather than generic gain.
    *   **Fear Spend**: Variable sounds based on amount spent (1, 2-4, 5+).
    *   **Stress**: Added "Clear Stress" trigger.
    *   **UI**: Split Daggerheart configuration into "Mechanics" and "Fear Tracker" for better usability.
*   **Fix**: Resolved issue where "Empty" preset would still show default sounds.
*   **Fix**: Removed debug logging.

## [1.1.4]
*   Fix: Prevent crash on missing actor in adapter.
