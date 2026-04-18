# Changelog

## [2.5.2] - 2026-04-18

### Fixed
- **Combat Turn Spotlight.** Fixed: sounds were not playing when an actor's turn began in combat. Turn-start audio now fires correctly for both mid-round advances and new-round rollovers, with per-actor override support.

## [2.5.1] - 2026-04-17

### Fixed
- Module failed to initialise on The Forge — diagnostic files were missing from the release archive, preventing the entire module from loading.

## [2.5.0] - 2026-04-17

### Added
- **Pathfinder 2e support.** Attack rolls, damage, spells, vocals, and creature sounds trigger automatically using degree-of-success outcomes and PF2e trait tags.
- **Ambient loop API.** Other Ionrift modules can trigger keyed ambient loops with fade transitions — used by Respite for campfire ambience.

### Fixed
- Sound packs now load correctly on The Forge.

## [2.4.0] - Sound Pack Infrastructure

*   **Feature**: Sound Pack system. Resonance now supports external sound packs -- downloadable ZIP files that add or replace sound bindings without modifying the module itself. Each pack contains a `manifest.json` and a `bindings.json` using the same sound keys as Resonance Calibration.
*   **Feature**: **Import Sound Pack** button in the Manage Sound Packs panel. Select a downloaded `.zip` file and Resonance extracts it, reads the manifest, and installs it to the right location automatically. No manual file placement needed.
*   **Feature**: **Manage Sound Packs** panel in module settings. Lists every discovered pack with enable/disable toggles. Disabled packs are ignored; enabled packs merge their bindings into your active sound set (preset overrides still take priority).
*   **Feature**: Pack-relative paths resolve automatically. Audio files referenced without a full path are resolved relative to the pack folder -- no manual path editing required.
*   **Improvement**: Multiple packs can be active at once. Array bindings (e.g. randomised hit sounds) concatenate across packs; single-value bindings use last-pack-wins order (alphabetical, deterministic).
*   **Note**: Bundled SFX (`sounds/pack/`) continue to work exactly as before. The pack system is additive -- nothing changes until you install a pack.


## [2.3.4] - Fix Expired Discord Link
*   **Fix**: Updated the support Discord link in module settings and the `bugs` field. The previous invite had expired.

## [2.3.1] - Per-Item Mute Toggle and Settings Layout
*   **Feature**: Per-item mute button on sound slots. Click the speaker icon to silence a specific attack/slot without needing a silent file. Click again to unmute.
*   **Feature**: Standardised settings layout with visual divider between module settings and support/diagnostics section.
*   **Feature**: Wiki / Guides button in module settings footer.
*   **Docs**: Standardised README footer with wiki, Discord, and Patreon links.
*   **Docs**: Added Guide 5 (Targeting Sounds Per Creature) link to README.

## [2.3.0] - Mute Toggle for Sound Events
*   **Feature**: Added a per-event mute button in the Calibration UI. Click the speaker icon to silence any sound event, overriding inheritance. Click again to restore inherited sounds.

## [2.2.5] - Hotfix: Sound Files Were LFS Pointers
*   **Critical Fix**: Release zip contained Git LFS pointer stubs (130 bytes) instead of actual MP3 audio files. Added `lfs: true` to the GitHub Actions checkout step so sound files are properly resolved. Added a validation gate that blocks releases if sound files are stubs.

## [2.2.4] - Update Notification for Sound Fix
*   **Improvement**: Added one-time GM notification on module load explaining the v2.2.3 sound fix and prompting users to re-run the Attunement Protocol if sounds weren't working.

## [2.2.3] - Hotfix: Sound Files Missing from Download
*   **Critical Fix**: The Ionrift SFX Pack audio files (`sounds/pack/`) were excluded from the release zip. Users who installed via the Foundry package manager received the sound bindings but no actual audio files, causing "Directory does not exist" errors in Resonance Calibration. The 500+ local sound files now ship with the module download.

## [2.2.2] - Hotfix: Case-Sensitivity Fix
*   **Critical Fix**: Renamed `soundHandler.js` to `SoundHandler.js` to match the import in `module.js`. The case mismatch caused a 404 on Linux-hosted servers (Molten, etc), preventing the entire module from initializing. Windows users were unaffected.

## [2.2.1] - Discord Support Link
*   **Feature**: Added "Get Support" button to module settings. Opens the Ionrift Discord server.
*   **Improvement**: Added `bugs` field to `module.json` pointing to Discord.
## [2.2.0] — UI Polish, Orchestration & SFX Pack

### New Features
*   **Configurable Sound Timing**: All hardcoded stagger delays are now exposed in the Orchestrator tab under "Sound Timing". Five named offsets — Vocal Delay (after impact), AoE Vocal Stagger, Spell Audio Bonus, Fumble → Miss Delay, and Crit → Decoration Delay — can be tuned per-world. System-agnostic: works identically for DnD 5e and Daggerheart.

### Improvements
*   **Sound Picker UX**: Distinct visual treatment for catalog (browse) vs. playlist (assigned) sections. Catalog rows use compact `+` icon with "ADDED" tags. Assigned section has violet tint with "These sounds play in-game" subtitle. Gradient divider between sections.
*   **Syrinscape Tab Polish**: Stripped noisy `[Global]` prefix from search results. Added `+` click affordance and already-added detection matching Pack tab styling.
*   **Actor Sound Config**: "Pain / Hit" → "Vocal (Pain)", "Death" → "Vocal (Death)" — aligned with main Resonance config terminology. Voice Tone dropdown now only shows for PCs; NPCs display "Vocal defaults resolve from monster type" instead. Default badges show "Default (Monster)" for NPCs.
*   **Item Sound Config**: "Hit / Impact" → "Impact", "Miss / Dodge" → "Miss". Hints added to all slots.
*   **Sound Picker Titles**: Humanized from raw keys (`Bind sound_pain for Zombie`) to readable labels (`Pick Sound: Vocal (Pain) — Zombie`).
*   **NPC Preview Sounds**: Picker correctly resolves monster defaults via `getMonsterSound` instead of PC defaults for non-character actors.
*   **Tab Persistence**: Switching between Pack/Syrinscape tabs no longer resets back to default when adding sounds.

### Bug Fixes
*   **PC Detection**: Fixed regression where PC actors without a player assignment showed as monsters. Now uses `actor.type === "character"` instead of `hasPlayerOwner`.
*   **SFX Metadata**: Stripped ID3 tags from all ~400 MP3 files in the SFX pack. Prevents prompt and toolchain metadata leaks.

## [2.1.0] — Sound Key Architecture & SFX Pack Integration

### New Features
*   **Ionrift SFX Pack**: 104 local audio bindings ship inside the module. Select "Ionrift SFX Pack" in the Attunement Protocol to activate. No Syrinscape account required.
*   **Sound Provider Capability Helpers**: `SyrinscapeProvider.isConfigured()`, `hasControlModule()`, `hasMismatch()` — canonical checks used throughout the module. Stop All button now hidden when Syrinscape is not configured.

### Improvements
*   **Sound Key Namespaces**: New `ASK_*`, `ANSWER_*`, and `VOCAL_*` semantic prefixes added as aliases. Existing bindings (`CORE_*`, `MONSTER_*`) continue to work unchanged. Groundwork for the planned v3.0 full rename — no action needed from users.
*   **Resonance Calibration UI**: Attack type cards now clarify they are weapon-swing sounds, not impact sounds. Impact/miss sounds are configured under Core Mechanics. Monster "Vocal / Pain Sound" cards renamed for clarity. Species-specific "Default Attack" override slots documented.
*   **Attunement Protocol**: Token field required before Syrinscape verify. Apply Sound Preset locked behind Sound Provider completion. Close-without-completing no longer marks setup as done.
*   **Spell/Domain Fallback (clarification)**: Spell and ability sounds resolve via the character's class domain. Individual item cards do not need sound data populated — this is expected behaviour, not a missing feature.

### Bug Fixes
*   **Foundry v15 Compatibility**: Migrated `renderChatMessage` hook to `renderChatMessageHTML` in `DaggerheartAdapter`. The old hook is deprecated in v13 and removed in v15.
*   **Daggerheart Armor**: Armor direction corrected — increasing value = slot used, decreasing = repaired. Previously triggers were swapped.
*   **Crossbow Detection**: "Hand Crossbow" was resolving to `ATTACK_BOW` due to substring ordering. Now correctly resolves to `ATTACK_CROSSBOW`.
*   **Daggerheart Pain/Death Routing**: Character-type actors without a player owner (GM-owned NPCs) now correctly route to PC pain/death sounds.
*   **NPC Death Sound**: Non-player actor deaths now play `VOCAL_GENERIC_DEATH` instead of `PC_DEATH`.
*   **Pack Preset Bleed**: `SYRINSCAPE_DEFAULTS` (Syrinscape element IDs) no longer bleeds through as inherited values for local SFX Pack users.

## [2.0.3] - Compatibility Standardization
*   **Fix**: Minimum Foundry version corrected to v12 (previously claimed v10, untested).

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
