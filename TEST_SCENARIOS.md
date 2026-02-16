# Ionrift Resonance — Test Scenarios

Manual test harness for verifying DnD5e combat sound resolution.
Each scenario documents the expected sound event chain and the logic it validates.

---

## Setup

- **System:** DnD5e v4 with Midi-QOL active
- **Debug Mode:** Enable `ionrift-resonance` debug logging in module settings
- **Recommended Actors:** A PC (Human Fighter or similar) and various monsters (Brown Bear, Fire Elemental, Skeleton)

---

## 1. Melee Weapon Attack — Hit

**Action:** Bear attacks PC with Claws, roll hits.

| Phase | Hook | Expected Key | Sound |
|-------|------|-------------|-------|
| Ask | `postUseActivity` | `MONSTER_BEAR_CLAW` → classifier | Claw swipe |
| Answer | `AttackRollComplete` | *(no miss/crit)* | Silent |
| Impact | `DamageRollComplete` | `CORE_HIT` | Hit thud |
| Vocal | `DamageRollComplete` | `CORE_PAIN_MASCULINE` / `CORE_PAIN_FEMININE` | Pain cry |

**Validates:**
- Three-phase hook timing (ask → answer → impact)
- Creature classifier resolves bear claw attack
- PC identity determines masculine/feminine pain vocal
- Pain sound (not death) plays when PC drops to 0 HP (death saves, not instant death)

---

## 2. PC Death — Massive Damage Only

**Action:** Bear deals massive damage to PC (overflow ≥ max HP).

| Scenario | PC HP | Damage | Expected |
|----------|-------|--------|----------|
| **Unconscious** | 12/12 | 14 dmg (overflow 2 < 12 max) | Pain cry |
| **Instant Death** | 12/12 | 26 dmg (overflow 14 ≥ 12 max) | Death cry |

**Validates:**
- DnD 5e death rules: PCs go unconscious at 0 HP, not dead
- Death cry only on massive damage (overflow ≥ max HP)
- NPCs always die at 0 HP (no death save check)

---

## 3. Ranged Weapon Attack — Miss

**Action:** PC fires Longbow at Skeleton, roll misses.

| Phase | Hook | Expected Key | Sound |
|-------|------|-------------|-------|
| Ask | `postUseActivity` | `ATTACK_BOW` | Bow draw/release |
| Answer | `AttackRollComplete` | `CORE_MISS_RANGED` | Ranged miss (arrow ricochet) |

**Validates:**
- `_getMissKey()` detects ranged weapon by name or `system.range.long`
- `CORE_MISS_RANGED` resolves (not generic `CORE_MISS`)

---

## 4. Spell Cast — Evocation (Fire Bolt)

**Action:** PC casts Fire Bolt at target.

| Phase | Hook | Expected Key | Sound |
|-------|------|-------------|-------|
| Ask | `postUseActivity` | `SPELL_FIRE` → fallback `SCHOOL_EVOCATION` | Evocation cast |
| Answer | `AttackRollComplete` | miss/crit/silent | Result stinger |
| Impact | `DamageRollComplete` | `CORE_HIT` + pain | Hit + vocal |

**Validates:**
- `handleWeaponSound` tries effect key (`SPELL_FIRE`) first
- Falls back to school key (`SCHOOL_EVOCATION`) via `playItemSoundWithFallback`
- `CORE_MAGIC` no longer falls back to `CORE_WHOOSH` (no sword swing for spells)

---

## 5. Spell Miss — Type-Aware

**Action:** PC casts a spell, roll misses.

| Weapon Type | Expected Miss Key |
|-------------|------------------|
| Melee weapon | `CORE_MISS` |
| Ranged weapon | `CORE_MISS_RANGED` |
| Spell | `CORE_MISS_MAGIC` |

**Validates:**
- `_getMissKey()` returns type-appropriate miss sound

---

## 6. Healing Spell (Healing Word)

**Action:** PC casts Healing Word on an ally.

| Phase | Hook | Expected Key | Sound |
|-------|------|-------------|-------|
| Ask | `postUseActivity` | `SPELL_HEAL` / `SCHOOL_ABJURATION` | Healing cast |
| Damage | `DamageRollComplete` | *(skipped)* | **Silent** — no hit/pain |

**Validates:**
- Cast sound fires **after** spell confirmation dialog (not before)
- `handleDamage` detects healing via `defaultDamageType` / `damageDetail` and skips
- No pain cry when target receives healing

---

## 7. Potion Use — With Binding

**Action:** PC uses Potion of Healing (has `sound_attack` flag bound to drinking sound).

| Phase | Hook | Expected Key | Sound |
|-------|------|-------------|-------|
| Ask | `postUseActivity` | Item flag `sound_attack` | Drinking sound |
| Damage | `DamageRollComplete` | *(skipped — consumable)* | **Silent** |

**Validates:**
- Consumables with explicit `sound_attack` flag play their bound sound
- Consumables without binding are silently skipped
- `handleDamage` skips all consumable items

---

## 8. Potion Use — Without Binding

**Action:** PC uses Rations or other consumable without a sound binding.

| Phase | Hook | Expected |
|-------|------|----------|
| Ask | `postUseActivity` | **Silent** — no binding, no generic fallback |
| Damage | `DamageRollComplete` | **Silent** — consumable skipped |

**Validates:**
- Unbound consumables produce no sound at all
- No sword swing fallback for potions/rations

---

## 9. Monster Subtype Vocal — Fire Elemental

**Action:** PC hits Fire Elemental with a weapon.

| Phase | Expected Key | Sound |
|-------|-------------|-------|
| Pain | `SFX_FIRE` (subtype) | Fire Elemental Touch |
| Fallback if unbound | `MONSTER_ELEMENTAL` → `CORE_MONSTER_PAIN` | Generic monster pain |

**Validates:**
- `detectMonsterPain` tries subtype-specific key (`SFX_FIRE`) before broad category
- `_getSubtypeVocalKey()` maps classifier `{type: 'elemental', subtype: 'fire'}` → `SFX_FIRE`
- Falls back to `MONSTER_ELEMENTAL` → `CORE_MONSTER_PAIN` if subtype key is unbound

---

## 10. Spell Confirmation Dialog Timing

**Action:** Cast any leveled spell (e.g., Healing Word) that shows a spell slot dialog.

| Event | Sound |
|-------|-------|
| Click spell in sheet | **Silent** — dialog opens |
| Click "CAST SPELL" | Cast sound plays |

**Validates:**
- `dnd5e.postUseActivity` fires after dialog confirmation, not before
- Sound does not play if player cancels the dialog

---

## 11. AoE Spell — Fireball (Save-Based Multi-Target Mitigation)

**Action:** PC casts Fireball targeting 8+ creatures. Fireball is a **save-based** spell — it uses `workflow.saves` and `workflow.targets`, not `AttackRollComplete`.

| Targets Hit | Hit Sound | Vocals |
|---|---|---|
| 1–3 | Individual `CORE_HIT` per target | Individual pain/death per target (400ms stagger) |
| 4+ (AoE) | **Single** `CORE_HIT` | Up to **5** random vocals with micro-stagger (0–400ms overlap) |
| 20+ | **Capped at 20** targets processed | Same as 4+ AoE |

**Validates:**
- `handleDamage` detects AoE using `workflow.targets.size` (full AoE scope), not just `hitTargets`
- Combines `workflow.hitTargets` (failed saves) + `workflow.saves` (made saves, half dmg) into one target pool
- Workflow deduplication via `workflow.id` prevents multiple `DamageRollComplete` fires from cascading sounds
- Single hit impact for AoE (not N individual hits)
- Vocals capped at `MAX_AOE_VOCALS = 5` random targets
- Micro-stagger creates natural chorus overlap, not sequential machine-gun
- Hard cap (`MAX_TARGETS = 20`) prevents degenerate performance

---

## 12. NPC Death Vocal — Monster Death (Not PC Death)

**Action:** Kill a Skeleton (NPC) with any damage source.

| Phase | Expected Key | Sound |
|-------|-------------|-------|
| Death | `CORE_MONSTER_DEATH` | Monster death sound (e.g. Wilhelm Scream) |
| ~~Not~~ | ~~`PC_DEATH`~~ | ~~Should NOT play PC death~~ |

**Validates:**
- `_playVocalForTarget` routes NPC deaths to `CORE_MONSTER_DEATH` (not `PC_DEATH`)
- `CORE_MONSTER_DEATH` is defined in `SOUND_EVENTS` constants
- Monster death sound plays when NPC HP drops to 0

---

## 13. Daggerheart Domain Resolution — Sparing Touch

**Action:** (Daggerheart) Healy uses "Sparing Touch" (a `feature` type item, Splendor domain).

| Resolution Step | Check | Result |
|---|---|---|
| Item flags | `ionrift-resonance.sound_attack` | None set → continue |
| Item domain | `item.system.domain` | `undefined` (features don't carry domain) → continue |
| Actor domains | `actor.system.domains` = `["valor","splendor"]` | Tries each; `DOMAIN_SPLENDOR` has binding → **plays healing sound** |

**Validates:**
- Domain resolution checks `item.system.domain` first (for `domainCard` items)
- Falls back to `actor.system.domains` for features without domain metadata
- First domain with a bound sound wins
- Known limitation: all features from same class use same domain sound (documented in README)

---

## Resolution Chain Reference

### Spell Resolution
```
Item flag → Adversary map → Weapon/Spell map →
  [Daggerheart] Domain (item → actor fallback) →
  Classifier → detectSoundKey (school → effect) → string match →
  playItemSoundWithFallback(effectKey, schoolKey)
```

### Monster Vocal Resolution
```
Actor flag (sound_pain) → detectMonsterPain →
  subtypeKey (SFX_FIRE) → categoryKey (MONSTER_ELEMENTAL) → MONSTER_GENERIC
```

### NPC Death Resolution
```
Actor flag (sound_death) → PC? → getPCSound(DEATH)
                          → NPC? → CORE_MONSTER_DEATH
```

### Miss Resolution
```
_getMissKey: spell → CORE_MISS_MAGIC | ranged → CORE_MISS_RANGED | melee → CORE_MISS
```

### Fallback Chain (SoundResolver)
```
SPELL_FIRE → CORE_MAGIC (spells do NOT fall to CORE_WHOOSH)
ATTACK_BOW → CORE_RANGED → CORE_WHOOSH
ATTACK_SWORD → CORE_MELEE → CORE_WHOOSH
MONSTER_ELEMENTAL → CORE_MONSTER_PAIN
DOMAIN_SPLENDOR → (no fallback — returns null if unbound)
```

