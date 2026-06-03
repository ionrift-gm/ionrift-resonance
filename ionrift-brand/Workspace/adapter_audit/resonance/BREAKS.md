# Resonance Adapter — BREAK Items

Active 🔴 BREAK-severity findings that require immediate attention.

---

## 2026-06-03

### BREAK-1: PF2e Spell Effect-Type Config Missing (B-2)

**File:** `scripts/apps/SoundConfigApp.js:326`
**Code:** `if (game.system.id === 'dnd5e')`

**Impact:** PF2e users see an empty "Magic (Spells)" group with zero configurable children. The SPELL_FIRE, SPELL_ICE, SPELL_LIGHTNING, SPELL_ACID, SPELL_HEAL, SPELL_PSYCHIC, and SPELL_VOID keys are used by the PF2e adapter's `_getSpellTraitKey()` at runtime, but users have no config UI to customize or preview these bindings. They are stuck with whatever the sound pack defaults provide, with no ability to override or verify via the Calibration UI.

**Fix:** Change the condition to include PF2e:
```js
if (game.system.id === 'dnd5e' || game.system.id === 'pf2e') {
```
Or add a separate PF2e block with appropriate labels (PF2e calls these "energy types" or "damage traits", not "spell schools").

---

### BREAK-2: PF2e Roll Stinger Config Missing (B-4 / B-5)

**File:** `scripts/apps/SoundConfigApp.js:619-676`
**Code:** `if (game.system.id === 'daggerheart') { ... } else if (game.system.id === 'dnd5e') { ... }`

**Impact:** PF2e falls through both conditions with NO roll stinger section rendered. The PF2e adapter's `_handleOutcome()` method plays `ROLL_CRIT` on critical success and `ROLL_FUMBLE` on critical failure. These keys work at runtime (bindings resolve through the pack/default chain), but PF2e users cannot:
- See that these stingers exist in their config
- Preview them
- Override them with custom sounds
- Mute them individually

This is a functional gap: the feature works but is invisible and unconfigurable for PF2e users.

**Fix:** Extend the condition:
```js
} else if (game.system.id === 'dnd5e' || game.system.id === 'pf2e') {
```
Consider PF2e-appropriate labels:
- "Critical Success" instead of "Natural 20"
- "Critical Failure" instead of "Natural 1"

---

### BREAK-3: DH HP Inversion Leak Risk (D-1)

**File:** `scripts/systems/DaggerheartAdapter.js:271`
**Code:** `if (newHp > oldHp)` — damage detection

**Impact:** Daggerheart uses a damage-UP HP model (HP value increases = damage taken, HP reaching max = death). This is the opposite of every other supported system. Currently the inversion is correctly contained within DaggerheartAdapter, but:
- No code comments explain WHY the comparison is inverted
- No shared abstraction prevents future shared utilities from assuming HP-down
- If any future cross-adapter code (e.g. a shared `assessTarget()` utility) assumes standard HP direction, DH will silently break

**Status:** Currently working correctly. Flagged as BREAK because the failure mode (playing death sounds on healing, or no sounds on damage) would be severe and hard to diagnose.

**Fix:** Add explicit code documentation. Consider an adapter-level `isDamage(oldHp, newHp)` method that each adapter implements with its system's direction semantics.

---

*Last updated: 2026-06-03T02:00:00Z*
