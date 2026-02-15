import { SystemAdapter } from "./SystemAdapter.js";
import { Logger } from "../Logger.js";
import { SOUND_EVENTS } from "../constants.js";
import { msgContains } from "../utils.js";
import { getDaggerheartMonsterSound } from "../data/daggerheart_mappings.js";

export class DaggerheartAdapter extends SystemAdapter {
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
            checks.push({ path: "system.hp.value", desc: "Character HP (Current)" });
            checks.push({ path: "system.hp.max", desc: "Character HP (Max)" });
            checks.push({ path: "system.hope.value", desc: "Character Hope" }); // or system.resources.hope
            checks.push({ path: "system.fear.value", desc: "Character Fear" });
            checks.push({ path: "system.armor.value", desc: "Character Armor Slots" });
            checks.push({ path: "system.stress.value", desc: "Character Stress" });
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

        // Listen for chat messages to detect rolls
        Hooks.on("createChatMessage", (message) => {
            if (!game.user.isGM) return; // Only GM processes sounds to prevent duplicates
            this.handleInfo(message);
        });

        // Listen for pre-updates to compare Old vs New HP
        Hooks.on("preUpdateActor", (actor, changes, options, userId) => {
            if (!game.user.isGM) return;
            // console.log(`Ionrift Sounds | Daggerheart preUpdateActor Triggered`);
            this.handlePreUpdate(actor, changes);
        });

        // Listen for Item updates (Armor Slots)
        Hooks.on("preUpdateItem", (item, changes, options, userId) => {
            if (!game.user.isGM) return;
            this.handlePreUpdateItem(item, changes);
        });

        // Listen for Fear Tracker Renders (Multiple Strategies)
        // 1. Try specific hook (if it exists)
        Hooks.on("renderFearTracker", (app, html, data) => {
            if (!game.user.isGM) return;
            this.handleFearRender(app, html, data);
        });

        // 2. Generic Application hook (Fallback) - Filter by ID 'resources'
        Hooks.on("renderApplicationV2", (app, html, data) => {
            if (app.id === "resources" || app?.options?.id === "resources") {
                if (!game.user.isGM) return;
                this.handleFearRender(app, html, data || app); // Data might be app itself in V2 events
            }
        });

        // 3. Legacy Application hook
        Hooks.on("renderApplication", (app, html, data) => {
            if (app.id === "resources") {
                if (!game.user.isGM) return;
                // Inspect 'data' for current value (V1 pattern) or fall back to app context
                this.handleFearRender(app, html, data);
            }
        });
    }

    handleFearRender(app, html, data) {
        // Guard against missing data
        if (!data) return;

        // Try to find 'current' fear value
        // V2 apps might keep it in app.context or data
        let currentFear = data.current;

        // If not directly in data, check common patterns
        if (currentFear === undefined && data.app) currentFear = data.app.current;

        // Valid number check
        if (typeof currentFear !== "number") return;

        // Initialize last count if undefined
        if (this.lastFearCount === undefined) {
            this.lastFearCount = currentFear;
            return;
        }

        if (currentFear !== this.lastFearCount) {
            Logger.log(`Fear Tracker Update: ${this.lastFearCount} -> ${currentFear} `);

            if (currentFear > this.lastFearCount) {
                // Fear Gained
                if (currentFear >= 5) {
                    this.handler.play("DAGGERHEART_FEAR_HIGH");
                } else if (currentFear >= 3) {
                    this.handler.play("DAGGERHEART_FEAR_MED");
                } else {
                    this.handler.play("DAGGERHEART_FEAR_LOW");
                }
            } else if (currentFear < this.lastFearCount) {
                // Fear Used
                this.handler.play("DAGGERHEART_FEAR_USE");
            }

            this.lastFearCount = currentFear;
        }
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
                Logger.log(`Damage Taken(Value Increased).Playing 'Blood Splat'`);
                this.play(SOUND_EVENTS.BLOODY_HIT);

                // Pain Sound
                if (actor.hasPlayerOwner) {
                    this.play(this.handler.getPCSound(actor, "PAIN"));
                } else {
                    // Play Monster Pain Sound
                    const painSound = getDaggerheartMonsterSound(actor);
                    if (painSound && painSound !== SOUND_EVENTS.MONSTER_GENERIC) {
                        this.play(painSound, 200);
                    }
                }

                // Death Check
                if (maxHp > 0 && newHp >= maxHp && oldHp < maxHp) {
                    Logger.log("Actor Died (Damage >= Max)!");

                    if (actor.hasPlayerOwner) {
                        this.play(this.handler.getPCSound(actor, "DEATH"));
                    } else {
                        this.play(SOUND_EVENTS.PC_DEATH); // Default for now
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
                this.handler.play("DAGGERHEART_HOPE");
            } else if (newHope < oldHope) {
                Logger.log(`Hope Used(${oldHope} -> ${newHope})`);
                this.handler.play("DAGGERHEART_HOPE_USE");
            } else {
                Logger.log(`Hope Logic Skipped: Old ${oldHope} == New ${newHope} `);
            }
        }

        // 3. Fear Detection
        // Candidate Paths: 'system.fear.value', 'system.gmtracker.fear', 'system.resources.fear.value'
        const newFear = getProperty(changes, "system.fear.value") ?? getProperty(changes, "system.resources.fear.value");

        if (newFear !== undefined) {
            const oldFear = getProperty(actor, "system.fear.value") ?? getProperty(actor, "system.resources.fear.value") ?? 0;
            if (newFear > oldFear) {
                Logger.log(`Fear Gained(${oldFear} -> ${newFear})`);
                this.handler.play("DAGGERHEART_FEAR");
            } else if (newFear < oldFear) {
                Logger.log(`Fear Used(${oldFear} -> ${newFear})`);
                this.handler.play("DAGGERHEART_FEAR_USE");
            } else {
                Logger.log(`Fear Logic Skipped: Old ${oldFear} == New ${newFear} `);
            }
        }

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
                this.handler.play("DAGGERHEART_STRESS");
            } else if (newStress < realOldStress) {
                Logger.log(`Stress Cleared / Reduced(${realOldStress} -> ${newStress})`);
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

        // Armor Slot Detection (Item-based)
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
        if (!message.isRoll && !message.rolls?.length) return;

        const roll = message.rolls[0];
        Logger.log("Daggerheart Chat/Roll Detected:", {
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

            if (hopeValue === fearValue) {
                Logger.log(`CRITICAL! Doubles(${hopeValue})`);
                this.handler.playItemSound(attackSoundKey, item, 700);
                this.play(SOUND_EVENTS.CORE_CRIT, 700);

            } else if (hopeValue > fearValue) {
                Logger.log(`Action with HOPE`);
                this.handler.playItemSound(attackSoundKey, item, 700);
                this.play("DAGGERHEART_HOPE", 700); // Play Hope Sound on Roll Result

            } else {
                Logger.log(`Action with FEAR`);
                this.handler.playItemSound(attackSoundKey, item, 700);
                this.play("DAGGERHEART_FEAR", 700); // Play Fear Sound on Roll Result
            }
        } else {
            // Standard Roll
            this.handler.playItemSound(attackSoundKey, item, 700);
        }

        // Check for Miss
        if (msgContains(message.content, ["MISS", "FAILURE"])) {
            this.play(SOUND_EVENTS.MISS, 700);
        }
    }
}
