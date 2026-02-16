import { SystemAdapter } from "./SystemAdapter.js";
import { Logger } from "../Logger.js";
import { SOUND_EVENTS } from "../constants.js";
import { msgContains } from "../utils.js";
import { getDaggerheartMonsterSound } from "../data/daggerheart_mappings.js";

export class DaggerheartAdapter extends SystemAdapter {
    constructor(handler) {
        super(handler);
        this.renderPhases = new Map(); // Track render phases: { timestamp, phase: 1|2 }
        this.lastAttackItem = null; // Cache the last attacking item for hit override lookup
    }
    validateSchema() {
        const issues = [];

        // 1. Get a sample Actor to inspect (World Actor OR Synthetic Default)
        // This ensures the check works even in a brand new empty world.
        let actor = game.actors.find(a => a.type === "character" || a.type === "npc" || a.type === "adversary");


        if (!actor) {
            try {
                // Create a temporary in-memory actor to test the System's current data model
                Logger.log("No World Actors found. Creating Synthetic Actor for Schema Check.");
                actor = new Actor({ name: "Schema Validator", type: "character" });
            } catch (e) {
                Logger.warn("Failed to create Synthetic Actor:", e);
                return ["Critical: Could not create test Actor for validation."];
            }
        }

        Logger.log(`Validating Schema against Actor: ${actor.name} (${actor.type})`);
        const data = actor; // In V10+ we inspect the document itself

        // 2. Define Critical Paths we rely on
        // Format: { path: "string", description: "text", condition: (val) => boolean }
        const checks = [

        ];

        // Specific Checks based on Actor Type
        if (actor.type === "character") {
            // HP: Check for standard OR resources path
            if (foundry.utils.getProperty(data, "system.resources.hitPoints.value") === undefined &&
                foundry.utils.getProperty(data, "system.hp.value") === undefined) {
                checks.push({ path: "system.resources.hitPoints.value", desc: "Character HP (Current)" });
            }

            if (foundry.utils.getProperty(data, "system.resources.hitPoints.max") === undefined &&
                foundry.utils.getProperty(data, "system.hp.max") === undefined) {
                checks.push({ path: "system.resources.hitPoints.max", desc: "Character HP (Max)" });
            }

            // Hope & Fear (often specialized paths)
            // checks.push({ path: "system.hope.value", desc: "Character Hope" }); // handled by alias logic below
            // checks.push({ path: "system.fear.value", desc: "Character Fear" }); // handled by alias logic below

            // checks.push({ path: "system.armor.value", desc: "Character Armor Slots" }); // handled by alias logic below
            // checks.push({ path: "system.stress.value", desc: "Character Stress" }); // handled by alias logic below
        } else {
            // Adversary / NPC
            // Note: Daggerheart NPCs might use different structure (hitPoints vs hp)
            // We check multiple in code, so we should check if AT LEAST ONE exists.
            if (foundry.utils.getProperty(data, "system.resources.hitPoints.value") === undefined &&
                foundry.utils.getProperty(data, "system.hp.value") === undefined) {
                issues.push("Adversary HP (Unknown Path: checked system.resources.hitPoints.value & system.hp.value)");
            }
        }

        // 3. Run Checks
        for (const check of checks) {
            const val = foundry.utils.getProperty(data, check.path);

            // Verify primary path existence (fallback paths handled in handlePreUpdate)

            // Let's check the aliases.
            if (check.desc.includes("Hope")) {
                if (foundry.utils.getProperty(data, "system.hope.value") === undefined &&
                    foundry.utils.getProperty(data, "system.resources.hope.value") === undefined) {
                    issues.push("Hope Value (Unknown Path)");
                }
            } else if (check.desc.includes("Fear")) {
                if (foundry.utils.getProperty(data, "system.fear.value") === undefined &&
                    foundry.utils.getProperty(data, "system.resources.fear.value") === undefined) {
                    issues.push("Fear Value (Unknown Path)");
                }
            } else if (check.desc.includes("Armor")) {
                if (foundry.utils.getProperty(data, "system.armor.value") === undefined &&
                    foundry.utils.getProperty(data, "system.resources.armor.value") === undefined &&
                    foundry.utils.getProperty(data, "system.damage.armor") === undefined) {
                    issues.push("Armor Value (Unknown Path)");
                }
            } else if (check.desc.includes("Stress")) {
                if (foundry.utils.getProperty(data, "system.stress.value") === undefined &&
                    foundry.utils.getProperty(data, "system.damage.stress") === undefined &&
                    foundry.utils.getProperty(data, "system.resources.stress.value") === undefined) {
                    issues.push("Stress Value (Unknown Path)");
                }
            } else if (check.path) {
                // Std check
                if (val === undefined) {
                    issues.push(`${check.desc} missing at '${check.path}'`);
                }
            }
        }

        return issues;
    }

    registerHooks() {
        Logger.log("Daggerheart Adapter Active");

        // Two-phase sound playback for Daggerheart:
        // Phase 1 (first render): Attack sound only (sword swing, spell cast)
        // Phase 2 (re-render, ~4s later): Result decorations (miss/hit/stingers)
        // This syncs result sounds with when the visual result appears on screen.
        Hooks.on("renderChatMessage", (message, html, data) => {
            Logger.log(`⏱️ [${Date.now()}] renderChatMessage HOOK FIRED (msg: ${message.id})`);
            if (!game.user.isGM) return;
            if (!message.isRoll || !message.rolls?.length) return;

            const phase = this.renderPhases.get(message.id);

            if (!phase) {
                // Phase 1: First render → attack sound only
                Logger.log(`⏱️ [${Date.now()}] PHASE 1 (Attack) for msg: ${message.id}`);
                this.renderPhases.set(message.id, { timestamp: Date.now(), phase: 1 });
                this.handleAttackSound(message);
            } else if (phase.phase === 1 && (Date.now() - phase.timestamp) > 500) {
                // Phase 2: Re-render after 500ms+ → result decorations
                Logger.log(`⏱️ [${Date.now()}] PHASE 2 (Result) for msg: ${message.id} (${Date.now() - phase.timestamp}ms since Phase 1)`);
                this.renderPhases.set(message.id, { ...phase, phase: 2 });
                this.handleResultSound(message);
            } else {
                Logger.log(`⏱️ [${Date.now()}] Skipping render for msg: ${message.id} (phase: ${phase.phase}, elapsed: ${Date.now() - phase.timestamp}ms)`);
            }
        });

        // Listen for pre-updates to compare Old vs New HP
        Hooks.on("preUpdateActor", (actor, changes, options, userId) => {
            Logger.log(`⏱️ [${Date.now()}] preUpdateActor HOOK FIRED (actor: ${actor.name})`);
            if (!game.user.isGM) return;
            this.handlePreUpdate(actor, changes);
        });

        // Listen for Item updates (Armor Slots, Equip/Unequip)
        Hooks.on("preUpdateItem", (item, changes, options, userId) => {
            Logger.log(`⏱️ [${Date.now()}] preUpdateItem HOOK FIRED`);
            if (!game.user.isGM) return;
            this.handlePreUpdateItem(item, changes);
        });

        // Listen for Daggerheart Item/Action usage (Use Item button)
        Hooks.on("daggerheart.preUseAction", (action, config) => {
            if (!game.user.isGM) return;
            const item = action?.item;
            Logger.log(`⏱️ [${Date.now()}] daggerheart.preUseAction | Item: ${item?.name}, Type: ${item?.type}`);

            if (item) {
                const useOverride = item.getFlag("ionrift-resonance", "sound_use");
                if (useOverride) {
                    Logger.log(`Item Override: Use ${item.name} -> ${useOverride}`);
                    this.handler.play(useOverride);
                } else {
                    Logger.log(`DH | Use: ${item.name} (no override, generic)`);
                    this.handler.play("ITEM_USE");
                }
            }
        });

        // Fear Tracker: Daggerheart stores fear as a world setting, not an actor property.
        // The FearTracker UI calls game.settings.set() which fires updateSetting.
        Hooks.on("updateSetting", (setting) => {
            if (!game.user.isGM) return;
            // Match the Daggerheart fear setting key (format: "daggerheart.<key>")
            if (setting.key?.includes("Fear") || setting.key?.includes("fear")) {
                Logger.log(`⏱️ [${Date.now()}] updateSetting HOOK FIRED for: ${setting.key}`);
                this.handleFearSettingChange(setting);
            }
        });
    }

    /**
     * Handle fear changes from the DM Fear Tracker.
     * Daggerheart stores fear as a world setting (game.settings.set), not on an actor.
     * The updateSetting hook fires when the GM changes the fear value.
     */
    handleFearSettingChange(setting) {
        let newFear;
        try {
            // Setting value may be a raw number or JSON-encoded
            const raw = setting.value;
            newFear = typeof raw === "number" ? raw : Number(JSON.parse(raw));
        } catch {
            Logger.log(`Fear setting parse failed: ${setting.value}`);
            return;
        }

        if (typeof newFear !== "number" || isNaN(newFear)) return;

        // Initialize baseline on first fire
        if (this.lastFearCount === undefined) {
            Logger.log(`Fear Tracker: Initializing baseline at ${newFear}`);
            this.lastFearCount = newFear;
            return;
        }

        if (newFear === this.lastFearCount) return;

        Logger.log(`Fear Tracker Update: ${this.lastFearCount} -> ${newFear}`);

        if (newFear > this.lastFearCount) {
            // Fear Gained — threshold-based intensity
            if (newFear >= 9) {
                this.handler.play("DAGGERHEART_FEAR_HIGH");
            } else if (newFear >= 5) {
                this.handler.play("DAGGERHEART_FEAR_MED");
            } else {
                this.handler.play("DAGGERHEART_FEAR_LOW");
            }
        } else {
            // Fear Used — delta-based intensity
            const delta = this.lastFearCount - newFear;
            if (delta >= 5) {
                this.handler.play("DAGGERHEART_FEAR_USE_HIGH");
            } else if (delta >= 2) {
                this.handler.play("DAGGERHEART_FEAR_USE_MED");
            } else {
                this.handler.play("DAGGERHEART_FEAR_USE_LOW");
            }
        }

        this.lastFearCount = newFear;
    }

    handlePreUpdate(actor, changes) {
        // Use Foundry's robust getter
        const getProperty = foundry.utils.getProperty;

        // Debug: Log the incoming changes to understand structure
        Logger.log("Daggerheart PreUpdate (JSON):", JSON.stringify(changes, null, 2));

        // 1. HP / Damage Logic
        // Check multiple paths (Structure varies by System Version)
        const advHpDiff = getProperty(changes, "system.resources.hitPoints.value");
        const pcHpDiff = getProperty(changes, "system.hp.value");

        const newHp = advHpDiff !== undefined ? advHpDiff : pcHpDiff;

        if (newHp !== undefined) {
            // Get Old HP (Current Value on Actor)
            const oldHp = (advHpDiff !== undefined)
                ? (getProperty(actor, "system.resources.hitPoints.value") || 0)
                : (getProperty(actor, "system.hp.value") || 0);

            // Get Max HP for Death Check
            const maxHp = (advHpDiff !== undefined)
                ? (getProperty(actor, "system.resources.hitPoints.max") || 0)
                : (getProperty(actor, "system.hp.max") || 0);

            if (newHp > oldHp) {
                Logger.log(`⏱️ [${Date.now()}] Damage Taken (Value Increased). Playing 'Blood Splat'`);
                Logger.log(`⏱️ [${Date.now()}] DH | HP Change: ${oldHp} -> ${newHp} (Max: ${maxHp})`);

                // Hit Sound (immediate) — check weapon override first
                const hitOverride = this.lastAttackItem?.getFlag?.("ionrift-resonance", "sound_hit");
                if (hitOverride) {
                    Logger.log(`⏱️ [${Date.now()}] DH | Item Override: Hit -> ${hitOverride}`);
                    this.handler.play(hitOverride);
                } else {
                    Logger.log(`⏱️ [${Date.now()}] DH | Playing BLOODY_HIT: ${SOUND_EVENTS.BLOODY_HIT}`);
                    this.play(SOUND_EVENTS.BLOODY_HIT);
                }

                const VOCAL_STAGGER = 400;
                const isDeath = maxHp > 0 && newHp >= maxHp && oldHp < maxHp;

                if (isDeath) {
                    // Killing blow — skip pain, go straight to death cry
                    Logger.log("Actor Died (Damage >= Max)!");
                    const deathOverride = actor.getFlag("ionrift-resonance", "sound_death");
                    if (deathOverride) {
                        Logger.log(`Actor Override: Death -> ${deathOverride} (delay: ${VOCAL_STAGGER}ms)`);
                        this.handler.play(deathOverride, VOCAL_STAGGER);
                    } else if (actor.hasPlayerOwner) {
                        this.play(this.handler.getPCSound(actor, "DEATH"), VOCAL_STAGGER);
                    } else {
                        this.play(SOUND_EVENTS.PC_DEATH, VOCAL_STAGGER);
                    }
                } else {
                    // Non-lethal — pain sound after impact
                    const painOverride = actor.getFlag("ionrift-resonance", "sound_pain");
                    if (painOverride) {
                        Logger.log(`Actor Override: Pain -> ${painOverride} (delay: ${VOCAL_STAGGER}ms)`);
                        this.handler.play(painOverride, VOCAL_STAGGER);
                    } else if (actor.hasPlayerOwner) {
                        const pcPain = this.handler.getPCSound(actor, "PAIN");
                        Logger.log(`DH | PC ${actor.name} pain sound: ${pcPain} (delay: ${VOCAL_STAGGER}ms)`);
                        this.play(pcPain, VOCAL_STAGGER);
                    } else {
                        const painSound = getDaggerheartMonsterSound(actor);
                        Logger.log(`DH | Monster ${actor.name} pain sound: ${painSound || 'none'} (delay: ${VOCAL_STAGGER}ms)`);
                        if (painSound && painSound !== SOUND_EVENTS.MONSTER_GENERIC) {
                            this.play(painSound, VOCAL_STAGGER);
                        } else {
                            Logger.log(`DH | Using generic monster pain: ${SOUND_EVENTS.MONSTER_GENERIC}`);
                            this.play(SOUND_EVENTS.MONSTER_GENERIC, VOCAL_STAGGER);
                        }
                    }
                }
            }
        }

        // 2. Hope Detection
        // Candidate Paths: 'system.hope.value', 'system.resources.hope.value'
        const newHope = getProperty(changes, "system.hope.value") ?? getProperty(changes, "system.resources.hope.value");

        if (newHope !== undefined) {
            // Debug: Check Raw Source vs Derived Data
            const rawHope = getProperty(actor._source, "system.resources.hope.value");
            const derivedHope = getProperty(actor, "system.resources.hope.value");
            Logger.log(`Hope Debug: Raw = ${rawHope}, Derived = ${derivedHope}, New = ${newHope} `);

            // Use Source if available to avoid pre-applied derived updates
            const oldHope = rawHope ?? derivedHope ?? 0;

            if (newHope > oldHope) {
                Logger.log(`Hope Gained(${oldHope} -> ${newHope})`);
                const hopeGainOverride = actor.getFlag("ionrift-resonance", "sound_hope_gain");
                if (hopeGainOverride) {
                    Logger.log(`Actor Override: Hope Gain -> ${hopeGainOverride}`);
                    this.handler.play(hopeGainOverride);
                } else {
                    this.handler.play("DAGGERHEART_HOPE");
                }
            } else if (newHope < oldHope) {
                Logger.log(`Hope Used(${oldHope} -> ${newHope})`);
                const hopeUseOverride = actor.getFlag("ionrift-resonance", "sound_hope_use");
                if (hopeUseOverride) {
                    Logger.log(`Actor Override: Hope Use -> ${hopeUseOverride}`);
                    this.handler.play(hopeUseOverride);
                } else {
                    this.handler.play("DAGGERHEART_HOPE_USE");
                }
            } else {
                Logger.log(`Hope Logic Skipped: Old ${oldHope} == New ${newHope} `);
            }
        }

        // Fear Detection: Handled by updateSetting hook (fear is a world setting, not an actor property).

        // 4. Stress Detection
        // Extensive Probing for different data structures
        const stressPaths = [
            "system.stress.value",
            "system.damage.stress",
            "system.resources.stress.value", // Common in some variants
            "system.stress" // Direct number?
        ];

        let newStressVal = undefined;
        let oldStressVal = undefined;
        let foundPath = "";

        for (const path of stressPaths) {
            const val = getProperty(changes, path);
            if (val !== undefined) {
                newStressVal = val;
                foundPath = path;
                oldStressVal = getProperty(actor, path);
                break;
            }
        }

        if (newStressVal !== undefined) {
            const newStress = Number(newStressVal);

            // Re-fetch old stress accurately based on found path
            const realOldStress = Number(getProperty(actor, foundPath) || 0);

            // console.log(`Ionrift Sounds | Stress Debug[Path: ${ foundPath }]: New = ${ newStress }, Old = ${ realOldStress } `);

            if (newStress > realOldStress) {
                Logger.log(`Stress Gained(${realOldStress} -> ${newStress})`);
                const stressOverride = actor.getFlag("ionrift-resonance", "sound_stress");
                if (stressOverride) {
                    Logger.log(`Actor Override: Stress -> ${stressOverride}`);
                    this.handler.play(stressOverride);
                } else {
                    this.handler.play("DAGGERHEART_STRESS");
                }
            } else if (newStress < realOldStress) {
                Logger.log(`Stress Cleared / Reduced(${realOldStress} -> ${newStress})`);
                const stressClearOverride = actor.getFlag("ionrift-resonance", "sound_stress_clear");
                if (stressClearOverride) {
                    Logger.log(`Actor Override: Stress Clear -> ${stressClearOverride}`);
                    this.handler.play(stressClearOverride);
                } else {
                    this.handler.play("DAGGERHEART_STRESS_CLEAR");
                }
            }
        } else {
            // Log keys if stress update suspect but not found
            if (JSON.stringify(changes).includes("stress")) {
                Logger.log("Potential Stress Update Missed? Keys:", Object.keys(changes));
            }
        }

        // 5. Armor Detection
        const armorPaths = ["system.armor.value", "system.resources.armor.value", "system.damage.armor"];
        let newArmorVal = undefined;
        let armorPath = "";

        for (const path of armorPaths) {
            const val = getProperty(changes, path);
            if (val !== undefined) {
                newArmorVal = val;
                armorPath = path;
                break;
            }
        }

        if (newArmorVal !== undefined) {
            const newArmor = Number(newArmorVal);
            const oldArmor = Number(getProperty(actor, armorPath) || 0);

            Logger.log(`Armor Debug[Path: ${armorPath}]: New = ${newArmor}, Old = ${oldArmor} `);

            if (newArmor < oldArmor) {
                Logger.log(`Armor Used / Damaged(${oldArmor} -> ${newArmor})`);
                this.handler.play("DAGGERHEART_ARMOR_USE");
            } else if (newArmor > oldArmor) {
                Logger.log(`Armor Repaired(${oldArmor} -> ${newArmor})`);
                this.handler.play("DAGGERHEART_ARMOR_REPAIR");
            }
        }
    }

    handlePreUpdateItem(item, changes) {
        // Use Foundry's robust getter
        const getProperty = foundry.utils.getProperty;

        // DEBUG: Probe ALL item updates to see what Armor looks like
        Logger.log(`PreUpdateItem: Name = '${item.name}', Type = '${item.type}'`, changes);

        // --- Equip / Unequip Detection (weapons, armor, any item) ---
        const equippedChange = getProperty(changes, "system.equipped");
        if (equippedChange !== undefined) {
            const wasEquipped = item.system?.equipped ?? false;
            if (equippedChange && !wasEquipped) {
                // Equipping
                const equipOverride = item.getFlag("ionrift-resonance", "sound_equip");
                if (equipOverride) {
                    Logger.log(`Item Override: Equip ${item.name} -> ${equipOverride}`);
                    this.handler.play(equipOverride);
                } else {
                    Logger.log(`DH | Equip: ${item.name} (no override, generic)`);
                    this.handler.play("ITEM_EQUIP");
                }
            } else if (!equippedChange && wasEquipped) {
                // Unequipping
                const unequipOverride = item.getFlag("ionrift-resonance", "sound_unequip");
                if (unequipOverride) {
                    Logger.log(`Item Override: Unequip ${item.name} -> ${unequipOverride}`);
                    this.handler.play(unequipOverride);
                } else {
                    Logger.log(`DH | Unequip: ${item.name} (no override, generic)`);
                    this.handler.play("ITEM_UNEQUIP");
                }
            }
        }

        // --- Armor Slot Detection (Item-based) ---
        if (item.type === "armor") {
            // Check for 'marks' (Damage) or 'value' (Remaining Slots)
            const changesMarks = getProperty(changes, "system.marks.value");
            const changesValue = getProperty(changes, "system.armor.value") ?? getProperty(changes, "system.value");

            if (changesMarks !== undefined) {
                // Marks Logic: Increasing = Damage, Decreasing = Repair
                const oldMarks = Number(getProperty(item, "system.marks.value") ?? 0);
                const newMarks = Number(changesMarks);

                if (newMarks > oldMarks) {
                    this.handler.play("DAGGERHEART_ARMOR_USE");
                } else if (newMarks < oldMarks) {
                    this.handler.play("DAGGERHEART_ARMOR_REPAIR");
                }
            } else if (changesValue !== undefined) {
                // Slots Logic: Decreasing = Damage, Increasing = Repair
                const oldSlots = Number(getProperty(item, "system.armor.value") ?? getProperty(item, "system.value") ?? 0);
                const newSlots = Number(changesValue);

                if (newSlots < oldSlots) {
                    this.handler.play("DAGGERHEART_ARMOR_USE");
                } else if (newSlots > oldSlots) {
                    this.handler.play("DAGGERHEART_ARMOR_REPAIR");
                }
            }
        }
    }

    handleInfo(message) {
        Logger.log("handleInfo called", { isRoll: message.isRoll, rolls: message.rolls?.length });

        if (!message.isRoll && !message.rolls?.length) {
            Logger.log("handleInfo | Ignored (Not a Roll)");
            return;
        }

        const roll = message.rolls[0];
        Logger.log(`⏱️ [${Date.now()}] Daggerheart Chat/Roll Detected:`, {
            flavor: message.flavor,
            content: message.content,
            rollData: roll
        });

        // Extract Item Name
        let itemName = "Generic";
        if (roll.options && roll.options.title) {
            itemName = roll.options.title.split(":")[0].trim();
        } else if (roll.data && roll.data.name) {
            itemName = roll.data.name; // Fallback
        }

        // Actor Name
        const speakerId = message.speaker?.actor;
        let actorName = "";
        let actor = null;
        if (speakerId) {
            actor = game.actors.get(speakerId);
            if (actor) actorName = actor.name;
        }

        // Attempt to find the real Item object for Flag support
        let item = null;
        if (actor) {
            // Best effort: Try matching by name if we don't have UUID
            // Ideally Daggerheart attaches item uuid to flags, but we can search for now.
            // CAUTION: Name collision possible.
            item = actor.items.getName(itemName);
        }

        Logger.log(`Processing Roll for Item: ${itemName} (Actor: ${actorName})`);

        const attackSoundKey = this.handler.pickSound(item || itemName, actorName, actor);

        // Daggerheart Logic: 2d12 Duality
        const d12s = roll.terms.filter(t => t.faces === 12);

        if (d12s.length >= 2) {
            const hopeDie = d12s[0];
            const fearDie = d12s[1];

            const hopeValue = hopeDie.results.find(r => r.active)?.result || 0;
            const fearValue = fearDie.results.find(r => r.active)?.result || 0;

            // Determine success/fail
            // Try to find DC in roll options, flags, or chat content
            const total = roll.total;
            let isSuccess = null; // null = unknown

            // Check for DC in roll options or flags
            Logger.log("DC Debug - roll.options:", JSON.stringify(roll.options || {}, null, 2));
            Logger.log("DC Debug - roll.formula:", roll.formula);
            Logger.log("DC Debug - message.flags.daggerheart:", JSON.stringify(message.flags?.daggerheart || {}, null, 2));

            // DC can be in multiple locations - check all known paths
            const dc = roll.options?.targetValue
                || roll.options?.dc
                || roll.options?.targets?.[0]?.difficulty  // Daggerheart stores here!
                || message.flags?.daggerheart?.dc;

            if (dc !== undefined) {
                isSuccess = total >= dc;
                Logger.log(`DC Found: ${dc}, Total: ${total}, Success: ${isSuccess}`);
            } else {
                // Fallback: Check roll flags or message flags for hit/miss
                Logger.log("Checking flags for hit/miss:", JSON.stringify(message.flags?.daggerheart || {}, null, 2));

                const hitCount = message.flags?.daggerheart?.hits || 0;
                const missCount = message.flags?.daggerheart?.misses || 0;

                if (missCount > 0) {
                    isSuccess = false;
                    Logger.log(`Miss detected from flags: ${missCount} misses`);
                } else if (hitCount > 0) {
                    isSuccess = true;
                    Logger.log(`Hit detected from flags: ${hitCount} hits`);
                } else {
                    // Last resort: Check chat content (may not be fully formed in preCreate)
                    const content = message.content || "";
                    if (content.includes("MISS") || content.includes("FAILURE") || content.includes("FAIL")) {
                        isSuccess = false;
                        Logger.log(`Miss inferred from content keywords`);
                    } else if (content.includes("SUCCESS") || content.includes("HITS") || content.includes("HIT")) {
                        isSuccess = true;
                        Logger.log(`Hit inferred from content keywords`);
                    }
                }

                if (isSuccess !== null) {
                    Logger.log(`Success/fail determined from flags/content: ${isSuccess}`);
                } else {
                    Logger.log(`No DC found, no flags, content incomplete - using legacy`);
                }
            }

            // Timestamp baseline for timing analysis
            const hookFiredAt = Date.now();
            const timestamp = () => `[T+${Date.now() - hookFiredAt}ms]`;

            // Phase-aware: store data for Phase 2, but only play attack now if called from handleInfo
            // This method is now called from handleAttackSound/handleResultSound via the hook phases
            Logger.log(`${timestamp()} handleInfo computed: isSuccess=${isSuccess}, hopeValue=${hopeValue}, fearValue=${fearValue}, attackSoundKey=${attackSoundKey}`);
            return { isSuccess, hopeValue, fearValue, attackSoundKey, item, roll, isDuality: true };
        } else {
            // Non-duality roll
            return { isDuality: false, attackSoundKey, item, messageContent: message.content || "" };
        }
    }

    /**
     * Phase 1: Play ONLY the attack sound (sword swing, spell cast)
     * Fires on the first renderChatMessage when the card shell appears.
     */
    handleAttackSound(message) {
        const data = this.handleInfo(message);
        if (!data) return;

        const ts = Date.now();
        Logger.log(`⏱️ [${ts}] ══ PHASE 1: ATTACK SOUND ══`);
        Logger.log(`⏱️ [${ts}]   Playing: ${data.attackSoundKey}`);
        this.handler.playItemSound(data.attackSoundKey, data.item);
        Logger.log(`⏱️ [${ts}] ══ END PHASE 1 ══`);

        // Cache attacking item for damage handler hit override lookup
        this.lastAttackItem = data.item || null;

        // Store data for Phase 2
        this.renderPhases.set(message.id, {
            ...this.renderPhases.get(message.id),
            data: data
        });
    }

    /**
     * Phase 2: Play result decorations (hit/miss/stingers)
     * Fires when the chat message re-renders with the visual result (~4s later).
     */
    handleResultSound(message) {
        const phase = this.renderPhases.get(message.id);
        const data = phase?.data;

        if (!data) {
            Logger.log(`⏱️ [${Date.now()}] Phase 2: No stored data for ${message.id}, re-extracting`);
            const freshData = this.handleInfo(message);
            if (!freshData) return;
            this._playResultSounds(freshData);
            return;
        }

        // Override messageContent with fresh content (Phase 1 content may have been empty)
        data.messageContent = message.content || "";
        this._playResultSounds(data);
    }

    /**
     * Play the result decoration sounds based on roll outcome.
     */
    _playResultSounds(data) {
        const ts = Date.now();
        const { isSuccess, hopeValue, fearValue, isDuality } = data;

        if (!isDuality) {
            // Non-duality roll (NPC attacks, d20 rolls)
            // Hit impact is handled by preUpdateActor damage hook
            // Miss needs to be caught here via content keywords
            const content = data.messageContent || "";
            if (msgContains(content, ["MISS", "FAILURE", "FAIL"])) {
                Logger.log(`⏱️ [${ts}]   NON-DUALITY: Miss detected from content`);
                const missOverride = data.item?.getFlag?.("ionrift-resonance", "sound_miss");
                if (missOverride) {
                    Logger.log(`⏱️ [${ts}]   Item Override: Miss -> ${missOverride}`);
                    this.handler.play(missOverride);
                } else {
                    this.play(SOUND_EVENTS.MISS);
                }
            } else {
                Logger.log(`⏱️ [${ts}]   NON-DUALITY: No miss keywords, hit handled by damage hook`);
            }
            return;
        }

        Logger.log(`⏱️ [${ts}] ══ PHASE 2: RESULT SOUNDS ══`);

        if (hopeValue === fearValue) {
            // Critical Hit (Doubles) — CORE_HIT already played by preUpdateActor damage hook
            Logger.log(`⏱️ [${ts}]   CRITICAL HIT (Doubles) Hope=${hopeValue}, Fear=${fearValue}`);
            this.play(SOUND_EVENTS.DAGGERHEART_CRIT); // Stinger only

        } else if (isSuccess !== null) {
            const hopeWins = hopeValue > fearValue;

            if (isSuccess && hopeWins) {
                // Hit — CORE_HIT already played by damage hook
                Logger.log(`⏱️ [${ts}]   SUCCESS WITH HOPE - Stinger only (hit handled by damage hook)`);
                this.play(SOUND_EVENTS.DAGGERHEART_SUCCESS_WITH_HOPE);

            } else if (isSuccess && !hopeWins) {
                // Hit — CORE_HIT already played by damage hook
                Logger.log(`⏱️ [${ts}]   SUCCESS WITH FEAR - Stinger only (hit handled by damage hook)`);
                this.play(SOUND_EVENTS.DAGGERHEART_SUCCESS_WITH_FEAR);

            } else if (!isSuccess && hopeWins) {
                // Miss — no damage hook fires, so play miss whoosh here
                Logger.log(`⏱️ [${ts}]   FAIL WITH HOPE - Miss + Hope stinger`);
                const missOverride1 = data.item?.getFlag?.("ionrift-resonance", "sound_miss");
                this.handler.play(missOverride1 || SOUND_EVENTS.MISS);
                this.play(SOUND_EVENTS.DAGGERHEART_FAIL_WITH_HOPE);

            } else {
                // Miss — no damage hook fires, so play miss whoosh here
                Logger.log(`⏱️ [${ts}]   FUMBLE (Fail+Fear) - Miss + Fumble stinger`);
                const missOverride2 = data.item?.getFlag?.("ionrift-resonance", "sound_miss");
                this.handler.play(missOverride2 || SOUND_EVENTS.MISS);
                this.play(SOUND_EVENTS.DAGGERHEART_FAIL_WITH_FEAR);
            }

        } else {
            // Legacy fallback — assume miss (safe default)
            Logger.log(`⏱️ [${ts}]   LEGACY - Miss + Hope/Fear stinger`);
            this.play(SOUND_EVENTS.MISS);
            if (hopeValue > fearValue) {
                this.play(SOUND_EVENTS.DAGGERHEART_ROLL_HOPE);
            } else {
                this.play(SOUND_EVENTS.DAGGERHEART_ROLL_FEAR);
            }
        }

        Logger.log(`⏱️ [${Date.now()}] ══ END PHASE 2 ══`);
    }
}
