# Resonance Adapter — BREAK Items

Active 🔴 BREAK-severity findings that require immediate attention.

---

## Active Breaks

**None.** All previously identified BREAK items have been resolved as of 2026-06-04.

---

## Resolved Breaks

### ~~BREAK-1: PF2e Spell Effect-Type Config Missing (B-2)~~ — RESOLVED 2026-06-04

**File:** `scripts/apps/SoundConfigApp.js:326`
**Resolution:** Condition changed to `if (game.system.id === 'dnd5e' || game.system.id === 'pf2e')`. PF2e users now see and can configure SPELL_FIRE, SPELL_ICE, SPELL_LIGHTNING, SPELL_ACID, SPELL_HEAL, SPELL_PSYCHIC, and SPELL_VOID bindings under the "Magic (Spells)" group.

---

### ~~BREAK-2: PF2e Roll Stinger Config Missing (B-4 / B-5)~~ — RESOLVED 2026-06-04

**File:** `scripts/apps/SoundConfigApp.js:676`
**Resolution:** Dedicated `else if (game.system.id === 'pf2e')` block added with PF2e-appropriate labels:
- "Critical Success" (maps to ROLL_CRIT)
- "Critical Failure" (maps to ROLL_FUMBLE)

PF2e users can now see, preview, override, and mute roll stingers.

---

### ~~BREAK-3: DH HP Inversion Leak Risk (D-1)~~ — RESOLVED 2026-06-04

**File:** `scripts/systems/SystemAdapter.js`
**Resolution:** Abstract base class now provides `isDamage(oldHp, newHp)` and `isDeath(newHp, maxHp, isPC)` methods with standard HP-down semantics. `DaggerheartAdapter` overrides both with its damage-UP logic:
- `isDamage()`: returns `newHp > oldHp`
- `isDeath()`: returns `newHp >= maxHp`

Shared utilities and future cross-adapter code should use these methods rather than comparing HP values directly. The inversion is now contained by design, not by convention.

---

*Last updated: 2026-06-04T02:00:00Z*
