import { Logger } from "../../utils/Logger.js";

export class VocalLayerService {

    static SCHOOL_VOCAL_MAP = {
        evo: "SPELL_VOCAL_EVOCATION",
        evoc: "SPELL_VOCAL_EVOCATION",
        nec: "SPELL_VOCAL_NECROMANCY",
        abj: "SPELL_VOCAL_ABJURATION",
        div: "SPELL_VOCAL_DIVINATION",
        con: "SPELL_VOCAL_CONJURATION",
        enc: "SPELL_VOCAL_ENCHANTMENT",
        ill: "SPELL_VOCAL_ILLUSION",
        tra: "SPELL_VOCAL_TRANSMUTATION"
    };

    static shouldTrigger(item) {
        if (!game.settings.get("ionrift-resonance", "spellVocalLayer")) return false;
        if (!item) return false;
        if (item.getFlag?.("ionrift-resonance", "spellVocal") === true) return true;
        if (item.system?.components?.vocal === true) return true;
        return false;
    }

    static resolveVocalKey(item, handler) {
        const resolver = handler?.resolver;
        if (!resolver) return null;

        const override = item?.getFlag?.("ionrift-resonance", "spellVocalOverride");
        if (override) {
            Logger.log(`VocalLayerService | Item override vocal: ${override}`);
            return { key: override, resolved: override, isRaw: true };
        }

        const school = item?.system?.school;
        if (school) {
            const schoolKey = VocalLayerService.SCHOOL_VOCAL_MAP[school];
            if (schoolKey) {
                const schoolResolved = resolver.resolveKey(schoolKey);
                if (schoolResolved) {
                    Logger.log(`VocalLayerService | School vocal key: ${schoolKey} as ${schoolResolved}`);
                    return { key: schoolKey, resolved: schoolResolved };
                }
            }
        }

        const genericResolved = resolver.resolveKey("SPELL_VOCAL_CAST");
        if (genericResolved) {
            Logger.log(`VocalLayerService | Generic vocal key: SPELL_VOCAL_CAST as ${genericResolved}`);
            return { key: "SPELL_VOCAL_CAST", resolved: genericResolved };
        }

        Logger.log("VocalLayerService | No vocal binding found (SPELL_VOCAL_CAST unbound). Skipping vocal layer.");
        return null;
    }
    static playAndGetDelay(handler, item) {
        const vocKey = VocalLayerService.resolveVocalKey(item, handler);
        if (!vocKey) return 0;

        if (vocKey.isRaw) {
            const manager = game.ionrift?.resonance?.manager ?? game.ionrift?.sounds?.manager;
            if (manager) manager.play(vocKey.resolved);
        } else {
            handler.play(vocKey.key);
        }

        const leadIn = handler?.orchestrator?.getNamedOffset("SPELL_VOCAL_LEAD_IN") ?? 400;
        Logger.log(`VocalLayerService | Vocal fired (${vocKey.key}). Effect delayed by ${leadIn}ms.`);
        return leadIn;
    }
}
