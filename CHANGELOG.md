# Changelog

## [2.0.2] - Supersedes v2.0.1 (Attunement Protocol Fix)
*   **Fix**: Attunement Protocol no longer re-prompts on every module update. Uses a static protocol version that only changes when setup steps change. Existing 2.0.0 users are silently migrated.
*   **Fix**: Release workflow upgraded to `softprops/action-gh-release@v2` (Node 16 EOL).
*   All v2.0.1 fixes included (see below).

## [2.0.1] - Critical Bug Fix + Local Audio
*   **Fix**: Resonance Calibration window no longer re-renders on every HP change during combat. Previously, any actor update (damage, healing) would force the Calibration UI to refresh if the actor had sound flags configured.
*   **Fix**: Weapons (axes, swords, hammers) no longer incorrectly resolve to spell/domain sounds in Daggerheart. The domain resolution step now correctly skips weapon, armor, and equipment item types.
*   **Feature**: Dual-provider audio routing — sound bindings that reference local file paths (e.g. `sfx/melee/axe_hit_01.wav`) automatically play via Foundry's native audio, while Syrinscape element IDs route to the Syrinscape API. No manual provider switching needed.
*   **Feature**: `local` preset with CC0-licensed demo SFX covering melee, ranged, pain, death, creatures, magic, and Daggerheart stingers.
*   **Improvement**: Attack ask sounds (anticipation stingers before impact).
*   **Improvement**: Enhanced crit, fumble, and hope/fear stinger audio.

## [2.0.0] - Public Launch
*   **Feature**: 4-tier sound resolution (Item Flag → Adversary Map → Classifier → String Match) with recursive fallback chains.
*   **Feature**: AoE sound mitigation — single impact stinger with staggered per-target vocals.
*   **Feature**: Full Daggerheart native support — Fear Tracker (threshold-based), Domain resolution, Duality Dice (Hope/Fear), Stress, Armor, and Hope mechanics.
*   **Feature**: Creature Classifier integration via Ionrift Library — automatic monster-specific attack sounds (bear, wolf, dragon, etc.).
*   **Feature**: Per-PC pain/death vocals with Masculine/Feminine identity selection.
*   **Feature**: Syrinscape one-shot element support with local library caching and search.
*   **Feature**: Attunement Protocol — guided first-run setup wizard for token configuration and preset selection.
*   **Feature**: Sound Auditor UI — inspect and manage sound flags across all actors and items.
*   **Feature**: Resonance Calibration — full sound binding editor with per-tier configuration, import/export, and preset management.
*   **Improvement**: DnD5e App V2 header button injection for actor and item sheets.
*   **Improvement**: Context menu integration for Actor/Item directories.
*   **Improvement**: Preset safety lock — confirmation dialog prevents accidental overwrite of custom bindings.
*   **License**: MIT (open source).

> **Note**: This is an early public release. If you encounter any issues, please report them on GitHub with your Foundry logs and a screenshot. Your feedback helps us improve.


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
