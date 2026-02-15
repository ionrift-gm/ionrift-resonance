# Migration Strategy: Resonance Rebranding
> **Objective:** Transition the codebase and user base from the legacy `ionrift-sounds` ID to the branded `ionrift-resonance` ID.

## The Challenge
Changing a module's `id` in `module.json` is a **destructive action** for Foundry VTT.
- **Settings:** Stored by Module ID (will be lost).
- **Flags:** Stored on Actors/Items by Module ID (will be inaccessible).
- **Macros:** identifying the module by ID will break.

## Phase 1: Preparation (v1.x)
1.  **UI Rebranding (Safe):**
    - Rename all user-facing labels in `en.json`, HTML templates, and Dialog titles to **"Ionrift Resonance"**.
    - Keep `id: "ionrift-sounds"` internally.
2.  **Deprecation Warning:**
    - Add a specialized "Deprecation Warning" in the Settings or Console warning users that `ionrift-sounds` will eventually become `ionrift-resonance`.

## Phase 2: The Migration Bridge (v1.9 -> v2.0)
We cannot simply rename the folder. We must release a **New Module**.

1.  **Release `ionrift-resonance` (v2.0)**
    - Clean slate.
    - Includes a **Migration Wizard** on first launch.
2.  **The Migration Wizard**
    - **Detection:** Checks if `ionrift-sounds` is active or if legacy data exists.
    - **Action:**
        - **Settings:** Copies `game.settings.get('ionrift-sounds', ...)` -> `game.settings.set('ionrift-resonance', ...)`.
        - **Actor/Item Data:** Scans all World Actors/Items. Copies `flags['ionrift-sounds']` -> `flags['ionrift-resonance']`.
3.  **Sunset `ionrift-sounds`**
    - Release a final update (v1.9.9) that simply displays a banner: *"This module has moved. Please install Ionrift Resonance."*

## Phase 3: Archive
- Archive the `ionrift-sounds` GitHub repository.
- Update `ionrift-lib` to require `ionrift-resonance`.

## Execution Checklist (Future)
- [ ] Create `ionrift-resonance` Repo.
- [ ] Write `MigrationService.js` (Settings & Flags copier).
- [ ] Verify Daggerheart/DnD5e system compatibility with new ID.
