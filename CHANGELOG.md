# Changelog

## [2.7.9] - 2026-05-20

### Fixed
- Monster sounds and any other pack-bound rows outside the core Syrinscape
  set now appear in Sound Configuration with their pack defaults visible.
  Previously they showed as "No Sound Bound" until you edited and applied an
  override; resetting an override would make the sounds appear to vanish.
  The fix preserves any custom bindings you have already configured.
- Sounds delivered through a Library content pack install now
  populate Calibration automatically, the same way a manually imported zip
  pack does. Status returns CONNECTED and the install nudge hides on its own.

### Changed
- The Sound Configuration content nudge now uses the shared Ionrift Library
  banner. Your prior "snooze" or "don't show again" choices carry over.
- Attunement Protocol setup has been tightened. Steps the overlay system
  already covers are removed. Existing attuned users are not re-prompted.

## [2.7.8] - 2026-05-19

### Changed
- Sound packs now reload automatically when content updates are applied.

## [2.7.7] - 2026-05-14

### Fixed
- **Item-specific sounds are now respected again in Daggerheart.** If you configured custom attack, impact, or miss sounds on a weapon (e.g. a Scepter with its own magical cast sound), those sounds were being ignored and the generic module defaults played instead. The root cause was that Resonance identified attacking items by matching their name against the roll card title — a format change in recent Daggerheart versions broke that match, so items resolved as unknown and their configured sounds were never read. Resonance now looks up the item's UUID from roll data first, then falls back to exact name matching, and finally to a prefix match that handles sub-titled item names. Custom item sounds now play correctly.

## [2.7.6] - 2026-05-12


### Fixed
- **Module settings missing from Game Settings after updating to 2.7.5.** A batch comment-cleanup in 2.7.5 accidentally commented out method declarations in two internal files, producing syntax errors that prevented the module from loading. All settings, the Calibration panel, and the Sound Packs manager are restored.

## [2.7.5] - 2026-05-12

### Fixed
- **Clicking the pick/search button on any sound binding now opens the sound picker correctly.** After updating to 2.7.4, the button showed a "Sound Config required for Search" error instead of opening the picker. A stale variable reference left over from the sound preset deprecation refactor caused a crash the moment you clicked the button.

## [2.7.4] - 2026-05-07

### Fixed
- **NPC attacks now play the correct miss sound when using DnD5e without Midi-QOL.** When an NPC swung and missed, a melee attack swing played instead of the miss whoosh. The attack roll result is now read directly from the dice and routes to the appropriate miss sound — melee, ranged, or spell — including fumble and critical hit stingers.
- **Resonance Forge Safety tests no longer fail on The Forge.** The internal test suite used a dynamic module import that doesn't resolve correctly under Forge VTT's CDN hosting, causing a suite-execution error on every Forge-hosted world. The import is removed; the already-initialized loader is passed directly instead.

## [2.7.3] - 2026-05-07

### Added
- **Starfinder (sfrpg) support.** Weapon and spell sounds trigger automatically for Starfinder 1e campaigns. Melee, small arms, long arms, heavy weapons, and grenades each route to the appropriate sound category. Spells use the school fallback chain, and item-level overrides work the same way they do for DnD5e.

### Fixed
- Custom item sounds now play correctly in-game. When you assigned a sound to a specific weapon or spell in the item config, the correct sound played in the test panel but the school or category default played during actual use. That mismatch is resolved.
- Sound pack install no longer shows "Target directory does not exist" errors. The red banners were noise from Foundry's directory creation process and did not affect whether files were actually installed - they are now suppressed.

## [2.7.0] - 2026-05-03

### Changed
- **Sound files are no longer bundled with the module.** The 550+ SFX that previously shipped inside the module download are now distributed as the free Core SFX Pack. Install it from Module Settings or download from Patreon. This cuts the module download size from ~80 MB to under 1 MB.
- **Attunement Protocol redesigned.** The old "Apply Sound Preset" step has been replaced by a Sound Packs status step. It shows which packs are installed and lets you import a pack directly from the wizard.
- Sound binding resolution no longer branches on a preset setting. Custom bindings, pack bindings, and Syrinscape defaults (when configured) are resolved in a single predictable cascade.

### Fixed
- Resonance Calibration now shows pack-provided sounds immediately instead of requiring a preset selection first.
- Startup health checks no longer skip validation for users who had not selected a preset.

### Removed
- The "Sound Preset" setting is deprecated. Existing values are automatically cleared on first load. Sound packs and custom bindings handle everything the preset system used to do.

## [2.6.0] - 2026-04-23

### Added
- **Per-category volume sliders.** Scale playback volume for entire Action Taxonomy roots - Melee, Ranged, Magic, Spell Schools, and Domains - directly from Resonance Calibration.
- Spell Schools and Domains inherit from the Magic slider unless individually overridden, so one slider quiets all magic at once.
- Volume scaling applies to local and pack audio only. Syrinscape elements are fire-and-forget and not affected.

## [2.5.6] - 2026-04-21

### Added
- **Daggerheart domains.** Blood, Dread, and Wonder now appear in the Calibration UI alongside the original nine domains.

### Fixed
- Sound picker buttons (Save, Preview) could become unresponsive when editing keys without pre-mapped pack sounds.
- Startup integrity check no longer flags backward-compatible roll outcome aliases as missing.
- Foundry V13 deprecation warnings for template loading and file browser resolved.


## [2.5.5] - 2026-04-20

### Changed
- Platform logic (Forge detection, FilePicker resolution, directory creation) now delegates to the ionrift-library kernel instead of carrying local copies. No user-facing changes - this is a maintenance update that requires ionrift-library 1.9.0 or later.

## [2.5.4] - 2026-04-20

### Fixed
- Forge v13 FilePicker compatibility. The v13 namespaced FilePicker bypasses the Forge module's monkey-patch, so browse and directory-creation calls silently failed. Now uses the correct (patched) FilePicker on Forge instances.

## [2.5.3] - 2026-04-19

### Fixed
- Sound pack import now works correctly on The Forge. The directory pre-check was targeting the wrong file source on cloud-hosted instances, which could cause the first import to fail.


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
