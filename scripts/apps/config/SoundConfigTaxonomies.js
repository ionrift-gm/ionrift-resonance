/**
 * SoundConfigTaxonomies — Taxonomy definition builders for SoundConfigApp.
 */

import { getSoundPackLoader } from "../../composition/accessors.js";
import { QuizNightIntegration } from "../../integrations/QuizNightIntegration.js";
import { RespiteIntegration } from "../../integrations/RespiteIntegration.js";
import { CursewrightIntegration } from "../../integrations/CursewrightIntegration.js";
import { VoiceIntegration } from "../../integrations/VoiceIntegration.js";
import { TripwireIntegration } from "../../integrations/TripwireIntegration.js";
import { LuminanceIntegration } from "../../integrations/LuminanceIntegration.js";
import { WaterlineIntegration } from "../../integrations/WaterlineIntegration.js";
import { PuzzlesIntegration } from "../../integrations/PuzzlesIntegration.js";
import { QolIntegration } from "../../integrations/QolIntegration.js";
import { DirectorIntegration } from "../../integrations/DirectorIntegration.js";

/**
 * Build core (tier1), combat action (tier2), and monster (tier3) taxonomies.
 * @returns {{ coreTaxonomy: Array, actionTaxonomy: Array, monsterTaxonomy: Array }}
 */
export function buildCoreAndCombatTaxonomies() {
    const actionTaxonomy = [
        {
            label: game.i18n.localize("ionrift-resonance.taxonomy.coreMelee.label"),
            id: "CORE_MELEE",
            description: game.i18n.localize("ionrift-resonance.taxonomy.coreMelee.description"),
            children: [
                { label: game.i18n.localize("ionrift-resonance.taxonomy.attackBludgeon.label"), id: "ATTACK_BLUDGEON", description: game.i18n.localize("ionrift-resonance.taxonomy.attackBludgeon.description") },
                { label: game.i18n.localize("ionrift-resonance.taxonomy.attackSword.label"), id: "ATTACK_SWORD", description: game.i18n.localize("ionrift-resonance.taxonomy.attackSword.description") },
                { label: game.i18n.localize("ionrift-resonance.taxonomy.attackDagger.label"), id: "ATTACK_DAGGER", description: game.i18n.localize("ionrift-resonance.taxonomy.attackDagger.description") },
                { label: game.i18n.localize("ionrift-resonance.taxonomy.attackClaw.label"), id: "ATTACK_CLAW", description: game.i18n.localize("ionrift-resonance.taxonomy.attackClaw.description") },
                { label: game.i18n.localize("ionrift-resonance.taxonomy.coreBrawl.label"), id: "CORE_BRAWL", description: game.i18n.localize("ionrift-resonance.taxonomy.coreBrawl.description") }
            ]
        },
        {
            label: game.i18n.localize("ionrift-resonance.taxonomy.coreRanged.label"),
            id: "CORE_RANGED",
            description: game.i18n.localize("ionrift-resonance.taxonomy.coreRanged.description"),
            children: [
                { label: game.i18n.localize("ionrift-resonance.taxonomy.attackBow.label"), id: "ATTACK_BOW", description: game.i18n.localize("ionrift-resonance.taxonomy.attackBow.description") },
                { label: game.i18n.localize("ionrift-resonance.taxonomy.attackCrossbow.label"), id: "ATTACK_CROSSBOW", description: game.i18n.localize("ionrift-resonance.taxonomy.attackCrossbow.description") },
                { label: game.i18n.localize("ionrift-resonance.taxonomy.attackSling.label"), id: "ATTACK_SLING", description: game.i18n.localize("ionrift-resonance.taxonomy.attackSling.description") }
            ]
        },
        {
            label: game.i18n.localize("ionrift-resonance.taxonomy.coreMagic.label"),
            id: "CORE_MAGIC",
            description: game.i18n.localize("ionrift-resonance.taxonomy.coreMagic.description"),
            children: []
        }
    ];

    if (game.system.id === "dnd5e" || game.system.id === "pf2e") {
        actionTaxonomy[actionTaxonomy.length - 1].children = [
            { label: game.i18n.localize("ionrift-resonance.taxonomy.spellFire.label"), id: "SPELL_FIRE" },
            { label: game.i18n.localize("ionrift-resonance.taxonomy.spellIce.label"), id: "SPELL_ICE" },
            { label: game.i18n.localize("ionrift-resonance.taxonomy.spellLightning.label"), id: "SPELL_LIGHTNING" },
            { label: game.i18n.localize("ionrift-resonance.taxonomy.spellAcid.label"), id: "SPELL_ACID" },
            { label: game.i18n.localize("ionrift-resonance.taxonomy.spellHeal.label"), id: "SPELL_HEAL" },
            { label: game.i18n.localize("ionrift-resonance.taxonomy.spellPsychic.label"), id: "SPELL_PSYCHIC" },
            { label: game.i18n.localize("ionrift-resonance.taxonomy.spellVoid.label"), id: "SPELL_VOID" }
        ];

        if (game.system.id === "dnd5e") {
            actionTaxonomy.push({
                label: game.i18n.localize("ionrift-resonance.taxonomy.coreSchool.label"),
                id: "CORE_SCHOOL",
                description: game.i18n.localize("ionrift-resonance.taxonomy.coreSchool.description"),
                children: [
                    { label: game.i18n.localize("ionrift-resonance.taxonomy.schoolAbjuration.label"), id: "SCHOOL_ABJURATION", description: game.i18n.localize("ionrift-resonance.taxonomy.schoolAbjuration.description") },
                    { label: game.i18n.localize("ionrift-resonance.taxonomy.schoolConjuration.label"), id: "SCHOOL_CONJURATION", description: game.i18n.localize("ionrift-resonance.taxonomy.schoolConjuration.description") },
                    { label: game.i18n.localize("ionrift-resonance.taxonomy.schoolDivination.label"), id: "SCHOOL_DIVINATION", description: game.i18n.localize("ionrift-resonance.taxonomy.schoolDivination.description") },
                    { label: game.i18n.localize("ionrift-resonance.taxonomy.schoolEnchantment.label"), id: "SCHOOL_ENCHANTMENT", description: game.i18n.localize("ionrift-resonance.taxonomy.schoolEnchantment.description") },
                    { label: game.i18n.localize("ionrift-resonance.taxonomy.schoolEvocation.label"), id: "SCHOOL_EVOCATION", description: game.i18n.localize("ionrift-resonance.taxonomy.schoolEvocation.description") },
                    { label: game.i18n.localize("ionrift-resonance.taxonomy.schoolIllusion.label"), id: "SCHOOL_ILLUSION", description: game.i18n.localize("ionrift-resonance.taxonomy.schoolIllusion.description") },
                    { label: game.i18n.localize("ionrift-resonance.taxonomy.schoolNecromancy.label"), id: "SCHOOL_NECROMANCY", description: game.i18n.localize("ionrift-resonance.taxonomy.schoolNecromancy.description") },
                    { label: game.i18n.localize("ionrift-resonance.taxonomy.schoolTransmutation.label"), id: "SCHOOL_TRANSMUTATION", description: game.i18n.localize("ionrift-resonance.taxonomy.schoolTransmutation.description") }
                ]
            });
        }
    }

    if (game.system.id === "daggerheart") {
        actionTaxonomy.push({
            label: game.i18n.localize("ionrift-resonance.taxonomy.coreDomain.label"),
            id: "CORE_DOMAIN",
            description: game.i18n.localize("ionrift-resonance.taxonomy.coreDomain.description"),
            children: [
                { label: game.i18n.localize("ionrift-resonance.taxonomy.domainArcana.label"), id: "DOMAIN_ARCANA", description: game.i18n.localize("ionrift-resonance.taxonomy.domainArcana.description") },
                { label: game.i18n.localize("ionrift-resonance.taxonomy.domainBlade.label"), id: "DOMAIN_BLADE", description: game.i18n.localize("ionrift-resonance.taxonomy.domainBlade.description") },
                { label: game.i18n.localize("ionrift-resonance.taxonomy.domainBlood.label"), id: "DOMAIN_BLOOD", description: game.i18n.localize("ionrift-resonance.taxonomy.domainBlood.description") },
                { label: game.i18n.localize("ionrift-resonance.taxonomy.domainBone.label"), id: "DOMAIN_BONE", description: game.i18n.localize("ionrift-resonance.taxonomy.domainBone.description") },
                { label: game.i18n.localize("ionrift-resonance.taxonomy.domainCodex.label"), id: "DOMAIN_CODEX", description: game.i18n.localize("ionrift-resonance.taxonomy.domainCodex.description") },
                { label: game.i18n.localize("ionrift-resonance.taxonomy.domainDread.label"), id: "DOMAIN_DREAD", description: game.i18n.localize("ionrift-resonance.taxonomy.domainDread.description") },
                { label: game.i18n.localize("ionrift-resonance.taxonomy.domainGrace.label"), id: "DOMAIN_GRACE", description: game.i18n.localize("ionrift-resonance.taxonomy.domainGrace.description") },
                { label: game.i18n.localize("ionrift-resonance.taxonomy.domainMidnight.label"), id: "DOMAIN_MIDNIGHT", description: game.i18n.localize("ionrift-resonance.taxonomy.domainMidnight.description") },
                { label: game.i18n.localize("ionrift-resonance.taxonomy.domainSage.label"), id: "DOMAIN_SAGE", description: game.i18n.localize("ionrift-resonance.taxonomy.domainSage.description") },
                { label: game.i18n.localize("ionrift-resonance.taxonomy.domainSplendor.label"), id: "DOMAIN_SPLENDOR", description: game.i18n.localize("ionrift-resonance.taxonomy.domainSplendor.description") },
                { label: game.i18n.localize("ionrift-resonance.taxonomy.domainValor.label"), id: "DOMAIN_VALOR", description: game.i18n.localize("ionrift-resonance.taxonomy.domainValor.description") },
                { label: game.i18n.localize("ionrift-resonance.taxonomy.domainWonder.label"), id: "DOMAIN_WONDER", description: game.i18n.localize("ionrift-resonance.taxonomy.domainWonder.description") }
            ]
        });
    }

    const monsterTaxonomy = [
        {
            label: game.i18n.localize("ionrift-resonance.taxonomy.monsterHumanoid.label"),
            id: "MONSTER_HUMANOID", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
            description: game.i18n.localize("ionrift-resonance.taxonomy.monsterHumanoid.description"),
            children: [
                { label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "MONSTER_HUMANOID_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") },
                {
                    label: game.i18n.localize("ionrift-resonance.taxonomy.monsterGoblin.label"), id: "MONSTER_GOBLIN", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                    children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "MONSTER_GOBLIN_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                },
                {
                    label: game.i18n.localize("ionrift-resonance.taxonomy.monsterLycanthrope.label"), id: "MONSTER_LYCANTHROPE", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                    children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "MONSTER_LYCANTHROPE_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                }
            ]
        },
        {
            label: game.i18n.localize("ionrift-resonance.taxonomy.monsterUndead.label"),
            id: "MONSTER_UNDEAD", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
            description: game.i18n.localize("ionrift-resonance.taxonomy.monsterUndead.description"),
            children: [
                { label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "MONSTER_UNDEAD_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") },
                {
                    label: game.i18n.localize("ionrift-resonance.taxonomy.monsterZombie.label"), id: "MONSTER_ZOMBIE", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                    children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "MONSTER_ZOMBIE_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                },
                {
                    label: game.i18n.localize("ionrift-resonance.taxonomy.monsterSkeleton.label"), id: "MONSTER_SKELETON", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                    children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "MONSTER_SKELETON_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                },
                {
                    label: game.i18n.localize("ionrift-resonance.taxonomy.monsterGhost.label"), id: "MONSTER_GHOST", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                    children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "MONSTER_GHOST_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                }
            ]
        },
        {
            label: game.i18n.localize("ionrift-resonance.taxonomy.monsterBeast.label"),
            id: "MONSTER_BEAST", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
            description: game.i18n.localize("ionrift-resonance.taxonomy.monsterBeast.description"),
            children: [
                { label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "MONSTER_BEAST_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") },
                {
                    label: game.i18n.localize("ionrift-resonance.taxonomy.monsterBear.label"), id: "MONSTER_BEAR", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                    children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "MONSTER_BEAR_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                },
                {
                    label: game.i18n.localize("ionrift-resonance.taxonomy.monsterWolf.label"), id: "MONSTER_WOLF", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                    children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "MONSTER_WOLF_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                },
                {
                    label: game.i18n.localize("ionrift-resonance.taxonomy.monsterCat.label"), id: "MONSTER_CAT", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                    children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "MONSTER_CAT_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                },
                {
                    label: game.i18n.localize("ionrift-resonance.taxonomy.monsterBird.label"), id: "MONSTER_BIRD", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                    children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "MONSTER_BIRD_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                },
                {
                    label: game.i18n.localize("ionrift-resonance.taxonomy.monsterHorse.label"), id: "MONSTER_HORSE", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                    children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "MONSTER_HORSE_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                },
                {
                    label: game.i18n.localize("ionrift-resonance.taxonomy.monsterReptile.label"), id: "MONSTER_REPTILE", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                    children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "MONSTER_REPTILE_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                },
                {
                    label: game.i18n.localize("ionrift-resonance.taxonomy.sfxInsect.label"), id: "SFX_INSECT", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                    children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "SFX_INSECT_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                }
            ]
        },
        {
            label: game.i18n.localize("ionrift-resonance.taxonomy.monsterFiend.label"),
            id: "MONSTER_FIEND", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
            description: game.i18n.localize("ionrift-resonance.taxonomy.monsterFiend.description"),
            children: [
                { label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "MONSTER_FIEND_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") },
                {
                    label: game.i18n.localize("ionrift-resonance.taxonomy.monsterDemon.label"), id: "MONSTER_DEMON", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                    children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "MONSTER_DEMON_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                }
            ]
        },
        {
            label: game.i18n.localize("ionrift-resonance.taxonomy.monsterDragon.label"),
            id: "MONSTER_DRAGON", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
            description: game.i18n.localize("ionrift-resonance.taxonomy.monsterDragon.description"),
            children: [
                { label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "MONSTER_DRAGON_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") },
                {
                    label: game.i18n.localize("ionrift-resonance.taxonomy.dragonWyvern.label"), id: "dragon_wyvern", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                    children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "dragon_wyvern_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                }
            ]
        },
        {
            label: game.i18n.localize("ionrift-resonance.taxonomy.monsterGiant.label"),
            id: "MONSTER_GIANT", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
            description: game.i18n.localize("ionrift-resonance.taxonomy.monsterGiant.description"),
            children: [
                { label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "MONSTER_GIANT_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }
            ]
        },
        {
            label: game.i18n.localize("ionrift-resonance.taxonomy.monsterConstruct.label"),
            id: "MONSTER_CONSTRUCT", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
            description: game.i18n.localize("ionrift-resonance.taxonomy.monsterConstruct.description"),
            children: [
                { label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "MONSTER_CONSTRUCT_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") },
                {
                    label: game.i18n.localize("ionrift-resonance.taxonomy.constructGolem.label"), id: "construct_golem", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                    children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "construct_golem_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                },
                {
                    label: game.i18n.localize("ionrift-resonance.taxonomy.constructAnimatedObject.label"), id: "construct_animated_object", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                    children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "construct_animated_object_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                }
            ]
        },
        {
            label: game.i18n.localize("ionrift-resonance.taxonomy.monsterElemental.label"),
            id: "MONSTER_ELEMENTAL", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
            description: game.i18n.localize("ionrift-resonance.taxonomy.monsterElemental.description"),
            children: [
                { label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "MONSTER_ELEMENTAL_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") },
                {
                    label: game.i18n.localize("ionrift-resonance.taxonomy.sfxFire.label"), id: "SFX_FIRE", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                    children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "SFX_FIRE_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                },
                {
                    label: game.i18n.localize("ionrift-resonance.taxonomy.sfxWaterEntity.label"), id: "SFX_WATER_ENTITY", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                    children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "SFX_WATER_ENTITY_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                },
                {
                    label: game.i18n.localize("ionrift-resonance.taxonomy.sfxWind.label"), id: "SFX_WIND", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                    children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "SFX_WIND_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                },
                {
                    label: game.i18n.localize("ionrift-resonance.taxonomy.elementalEarth.label"), id: "elemental_earth", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                    children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "elemental_earth_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                }
            ]
        },
        {
            label: game.i18n.localize("ionrift-resonance.taxonomy.monsterAlien.label"),
            id: "MONSTER_ALIEN", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
            description: game.i18n.localize("ionrift-resonance.taxonomy.monsterAlien.description"),
            children: [
                { label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "MONSTER_ALIEN_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") },
                {
                    label: game.i18n.localize("ionrift-resonance.taxonomy.aberrationBeholder.label"), id: "aberration_beholder", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                    children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "aberration_beholder_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                },
                {
                    label: game.i18n.localize("ionrift-resonance.taxonomy.aberrationMindFlayer.label"), id: "aberration_mind_flayer", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                    children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "aberration_mind_flayer_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                },
                {
                    label: game.i18n.localize("ionrift-resonance.taxonomy.aberrationChuul.label"), id: "aberration_chuul", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                    children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "aberration_chuul_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                }
            ]
        },
        {
            label: game.i18n.localize("ionrift-resonance.taxonomy.monsterPlant.label"),
            id: "MONSTER_PLANT", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
            description: game.i18n.localize("ionrift-resonance.taxonomy.monsterPlant.description"),
            children: [
                { label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "MONSTER_PLANT_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") },
                {
                    label: game.i18n.localize("ionrift-resonance.taxonomy.plantTreant.label"), id: "plant_treant", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                    children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "plant_treant_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                },
                {
                    label: game.i18n.localize("ionrift-resonance.taxonomy.plantMyconid.label"), id: "plant_myconid", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                    children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "plant_myconid_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                },
                {
                    label: game.i18n.localize("ionrift-resonance.taxonomy.plantShamblingMound.label"), id: "plant_shambling_mound", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                    children: [{ label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "plant_shambling_mound_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }]
                }
            ]
        },
        {
            label: game.i18n.localize("ionrift-resonance.taxonomy.sfxSlime.label"),
            id: "SFX_SLIME", cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
            description: game.i18n.localize("ionrift-resonance.taxonomy.sfxSlime.description"),
            children: [
                { label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: "SFX_SLIME_ATTACK", description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description") }
            ]
        }
    ];

    if (getSoundPackLoader().loaded) {
        const dynamicBindings = getSoundPackLoader().getAllDynamicClassifierBindings();

        if (dynamicBindings.size > 0) {
            const existingIds = new Set();
            const collectIds = (nodes) => {
                for (const node of nodes) {
                    if (node.id) existingIds.add(node.id);
                    if (node.children) collectIds(node.children);
                }
            };
            collectIds(monsterTaxonomy);

            const TYPE_TO_PARENT = {
                undead: "MONSTER_UNDEAD",
                beast: "MONSTER_BEAST",
                humanoid: "MONSTER_HUMANOID",
                fiend: "MONSTER_FIEND",
                elemental: "MONSTER_ELEMENTAL",
                dragon: "MONSTER_DRAGON",
                giant: "MONSTER_GIANT",
                construct: "MONSTER_CONSTRUCT",
                aberration: "MONSTER_ALIEN",
                plant: "MONSTER_PLANT",
                ooze: "SFX_SLIME"
            };

            const findNode = (nodes, targetId) => {
                for (const node of nodes) {
                    if (node.id === targetId) return node;
                    if (node.children) {
                        const found = findNode(node.children, targetId);
                        if (found) return found;
                    }
                }
                return null;
            };

            for (const [compositeKey, binding] of dynamicBindings) {
                const soundKey = binding.soundKey;
                const packName = binding.packName;
                const packIcon = binding.packIcon;

                if (existingIds.has(soundKey)) continue;

                const parts = compositeKey.split("_");
                const typePart = parts[0];
                const subtypePart = parts.slice(1).join("_");
                const parentId = TYPE_TO_PARENT[typePart];
                if (!parentId) continue;

                const parent = findNode(monsterTaxonomy, parentId);
                if (!parent || !parent.children) continue;

                const label = subtypePart
                    .split("_")
                    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                    .join(" ");

                parent.children.push({
                    label: label, id: soundKey, cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.vocalPainSoundCardLabel"),
                    packName: packName,
                    packIcon: packIcon,
                    children: [{
                        label: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.label"), id: `${soundKey}_ATTACK`,
                        description: game.i18n.localize("ionrift-resonance.taxonomy.defaultAttack.description")
                    }]
                });

                existingIds.add(soundKey);
            }
        }
    }

    const coreTaxonomy = [
        {
            label: game.i18n.localize("ionrift-resonance.taxonomy.groupStrikeResults.label"),
            description: game.i18n.localize("ionrift-resonance.taxonomy.groupStrikeResults.description"),
            children: [
                {
                    id: "CORE_HIT", label: game.i18n.localize("ionrift-resonance.taxonomy.coreHit.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.coreHit.description"),
                    children: [
                        { id: "CORE_HIT_RANGED", label: game.i18n.localize("ionrift-resonance.taxonomy.coreHitRanged.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.coreHitRanged.description") },
                        { id: "CORE_HIT_MAGIC", label: game.i18n.localize("ionrift-resonance.taxonomy.coreHitMagic.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.coreHitMagic.description") }
                    ]
                },
                {
                    id: "CORE_MISS", label: game.i18n.localize("ionrift-resonance.taxonomy.coreMiss.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.coreMiss.description"),
                    children: [
                        { id: "CORE_MISS_RANGED", label: game.i18n.localize("ionrift-resonance.taxonomy.coreMissRanged.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.coreMissRanged.description") },
                        { id: "CORE_MISS_MAGIC", label: game.i18n.localize("ionrift-resonance.taxonomy.coreMissMagic.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.coreMissMagic.description") }
                    ]
                }
            ]
        },
        {
            label: game.i18n.localize("ionrift-resonance.taxonomy.groupWeaponExtras.label"),
            description: game.i18n.localize("ionrift-resonance.taxonomy.groupWeaponExtras.description"),
            children: [
                { id: "CORE_WHOOSH", label: game.i18n.localize("ionrift-resonance.taxonomy.coreWhoosh.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.coreWhoosh.description") },
                { id: "CORE_CRIT", label: game.i18n.localize("ionrift-resonance.taxonomy.coreCrit.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.coreCrit.description") },
                { id: "CORE_FUMBLE", label: game.i18n.localize("ionrift-resonance.taxonomy.coreFumble.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.coreFumble.description") }
            ]
        },
        {
            label: game.i18n.localize("ionrift-resonance.taxonomy.groupVocals.label"),
            description: game.i18n.localize("ionrift-resonance.taxonomy.groupVocals.description"),
            children: [
                { id: "CORE_PAIN_MASCULINE", label: game.i18n.localize("ionrift-resonance.taxonomy.corePainMasculine.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.corePainMasculine.description") },
                { id: "CORE_PAIN_FEMININE", label: game.i18n.localize("ionrift-resonance.taxonomy.corePainFeminine.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.corePainFeminine.description") },
                { id: "CORE_DEATH_MASCULINE", label: game.i18n.localize("ionrift-resonance.taxonomy.coreDeathMasculine.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.coreDeathMasculine.description") },
                { id: "CORE_DEATH_FEMININE", label: game.i18n.localize("ionrift-resonance.taxonomy.coreDeathFeminine.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.coreDeathFeminine.description") },
                { id: "CORE_MONSTER_PAIN", label: game.i18n.localize("ionrift-resonance.taxonomy.coreMonsterPain.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.coreMonsterPain.description") },
                { id: "CORE_MONSTER_DEATH", label: game.i18n.localize("ionrift-resonance.taxonomy.coreMonsterDeath.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.coreMonsterDeath.description") }
            ]
        },
        {
            label: game.i18n.localize("ionrift-resonance.taxonomy.groupEncounter.label"),
            description: game.i18n.localize("ionrift-resonance.taxonomy.groupEncounter.description"),
            children: [
                { id: "COMBAT_START", label: game.i18n.localize("ionrift-resonance.taxonomy.combatStart.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.combatStart.description") },
                { id: "COMBAT_END", label: game.i18n.localize("ionrift-resonance.taxonomy.combatEnd.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.combatEnd.description") },
                { id: "LEVEL_UP", label: game.i18n.localize("ionrift-resonance.taxonomy.levelUp.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.levelUp.description") }
            ]
        }
    ];

    if (game.system.id === "daggerheart") {
        coreTaxonomy.push({
            label: game.i18n.localize("ionrift-resonance.taxonomy.groupDhDualityDice.label"),
            description: game.i18n.localize("ionrift-resonance.taxonomy.groupDhDualityDice.description"),
            children: [
                { id: "ROLL_CRIT", label: game.i18n.localize("ionrift-resonance.taxonomy.rollCrit.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.rollCrit.description") },
                { id: "DAGGERHEART_SUCCESS", label: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartSuccess.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartSuccess.description") },
                { id: "DAGGERHEART_FAIL", label: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartFail.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartFail.description") }
            ]
        });

        coreTaxonomy.push({
            label: game.i18n.localize("ionrift-resonance.taxonomy.groupDhPlayerResources.label"),
            description: game.i18n.localize("ionrift-resonance.taxonomy.groupDhPlayerResources.description"),
            children: [
                { id: "DAGGERHEART_HOPE", label: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartHope.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartHope.description") },
                { id: "DAGGERHEART_HOPE_USE", label: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartHopeUse.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartHopeUse.description") },
                { id: "DAGGERHEART_STRESS", label: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartStress.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartStress.description") },
                { id: "DAGGERHEART_STRESS_CLEAR", label: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartStressClear.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartStressClear.description") },
                { id: "DAGGERHEART_ARMOR_USE", label: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartArmorUse.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartArmorUse.description") },
                { id: "DAGGERHEART_ARMOR_REPAIR", label: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartArmorRepair.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartArmorRepair.description") }
            ]
        });

        coreTaxonomy.push({
            label: game.i18n.localize("ionrift-resonance.taxonomy.groupDhFearTracker.label"),
            description: game.i18n.localize("ionrift-resonance.taxonomy.groupDhFearTracker.description"),
            children: [
                { id: "DAGGERHEART_FEAR_USE_LOW", label: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartFearUseLow.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartFearUseLow.description") },
                { id: "DAGGERHEART_FEAR_USE_MED", label: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartFearUseMed.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartFearUseMed.description") },
                { id: "DAGGERHEART_FEAR_USE_HIGH", label: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartFearUseHigh.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartFearUseHigh.description") },
                { id: "DAGGERHEART_FEAR_LOW", label: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartFearLow.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartFearLow.description") },
                { id: "DAGGERHEART_FEAR_MED", label: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartFearMed.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartFearMed.description") },
                { id: "DAGGERHEART_FEAR_HIGH", label: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartFearHigh.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.daggerheartFearHigh.description") }
            ]
        });
    } else if (game.system.id === "dnd5e") {
        coreTaxonomy.push({
            label: game.i18n.localize("ionrift-resonance.taxonomy.groupDnd5eRollStingers.label"),
            description: game.i18n.localize("ionrift-resonance.taxonomy.groupDnd5eRollStingers.description"),
            children: [
                { id: "ROLL_CRIT", label: game.i18n.localize("ionrift-resonance.taxonomy.rollCrit.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.rollCrit.description") },
                { id: "ROLL_FUMBLE", label: game.i18n.localize("ionrift-resonance.taxonomy.rollFumble.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.rollFumble.description") }
            ]
        });
    } else if (game.system.id === "pf2e") {
        coreTaxonomy.push({
            label: game.i18n.localize("ionrift-resonance.taxonomy.groupPf2eRollStingers.label"),
            description: game.i18n.localize("ionrift-resonance.taxonomy.groupPf2eRollStingers.description"),
            children: [
                { id: "ROLL_CRIT", label: game.i18n.localize("ionrift-resonance.taxonomy.rollCrit.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.rollCrit.description") },
                { id: "ROLL_FUMBLE", label: game.i18n.localize("ionrift-resonance.taxonomy.rollFumble.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.rollFumble.description") }
            ]
        });
        coreTaxonomy.push({
            label: game.i18n.localize("ionrift-resonance.taxonomy.groupPf2eHeroPoints.label"),
            description: game.i18n.localize("ionrift-resonance.taxonomy.groupPf2eHeroPoints.description"),
            children: [
                { id: "HERO_POINT_GAIN", label: game.i18n.localize("ionrift-resonance.taxonomy.heroPointGain.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.heroPointGain.description") },
                { id: "HERO_POINT_USE", label: game.i18n.localize("ionrift-resonance.taxonomy.heroPointUse.label"), description: game.i18n.localize("ionrift-resonance.taxonomy.heroPointUse.description") }
            ]
        });
    }

    return { coreTaxonomy, actionTaxonomy, monsterTaxonomy };
}

/**
 * Build module integration taxonomies and status descriptor.
 */
export function buildIntegrationTaxonomies() {
    const sharedMonsterTaxonomy = [
        {
            label: game.i18n.localize("ionrift-resonance.taxonomy.groupSharedMonsterMasculine.label"),
            description: game.i18n.localize("ionrift-resonance.taxonomy.groupSharedMonsterMasculine.description"),
            children: [
                {
                    id: "CORE_HUMANOID_PAIN_MASCULINE",
                    label: game.i18n.localize("ionrift-resonance.taxonomy.coreHumanoidPainMasculine.label"),
                    cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.coreHumanoidPainMasculine.cardLabel"),
                    description: game.i18n.localize("ionrift-resonance.taxonomy.coreHumanoidPainMasculine.description")
                },
                {
                    id: "CORE_HUMANOID_DEATH_MASCULINE",
                    label: game.i18n.localize("ionrift-resonance.taxonomy.coreHumanoidDeathMasculine.label"),
                    cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.coreHumanoidDeathMasculine.cardLabel"),
                    description: game.i18n.localize("ionrift-resonance.taxonomy.coreHumanoidDeathMasculine.description")
                }
            ]
        },
        {
            label: game.i18n.localize("ionrift-resonance.taxonomy.groupSharedMonsterFeminine.label"),
            description: game.i18n.localize("ionrift-resonance.taxonomy.groupSharedMonsterFeminine.description"),
            children: [
                {
                    id: "CORE_HUMANOID_PAIN_FEMININE",
                    label: game.i18n.localize("ionrift-resonance.taxonomy.coreHumanoidPainFeminine.label"),
                    cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.coreHumanoidPainFeminine.cardLabel"),
                    description: game.i18n.localize("ionrift-resonance.taxonomy.coreHumanoidPainFeminine.description")
                },
                {
                    id: "CORE_HUMANOID_DEATH_FEMININE",
                    label: game.i18n.localize("ionrift-resonance.taxonomy.coreHumanoidDeathFeminine.label"),
                    cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.coreHumanoidDeathFeminine.cardLabel"),
                    description: game.i18n.localize("ionrift-resonance.taxonomy.coreHumanoidDeathFeminine.description")
                }
            ]
        }
    ];

    const quizNightTaxonomy = [
        {
            label: game.i18n.localize("ionrift-resonance.taxonomy.groupQuizFlow.label"),
            description: game.i18n.localize("ionrift-resonance.taxonomy.groupQuizFlow.description"),
            children: [
                {
                    id: "QUIZ_ROUND_START",
                    label: game.i18n.localize("ionrift-resonance.taxonomy.quizRoundStart.label"),
                    cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.quizRoundStart.cardLabel"),
                    description: game.i18n.localize("ionrift-resonance.taxonomy.quizRoundStart.description")
                },
                {
                    id: "QUIZ_PENS_DOWN",
                    label: game.i18n.localize("ionrift-resonance.taxonomy.quizPensDown.label"),
                    cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.quizPensDown.cardLabel"),
                    description: game.i18n.localize("ionrift-resonance.taxonomy.quizPensDown.description")
                },
                {
                    id: "QUIZ_TIMER_EXPIRED",
                    label: game.i18n.localize("ionrift-resonance.taxonomy.quizTimerExpired.label"),
                    cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.quizTimerExpired.cardLabel"),
                    description: game.i18n.localize("ionrift-resonance.taxonomy.quizTimerExpired.description")
                }
            ]
        },
        {
            label: game.i18n.localize("ionrift-resonance.taxonomy.groupQuizMarking.label"),
            description: game.i18n.localize("ionrift-resonance.taxonomy.groupQuizMarking.description"),
            children: [
                {
                    id: "QUIZ_ANSWER_CORRECT",
                    label: game.i18n.localize("ionrift-resonance.taxonomy.quizAnswerCorrect.label"),
                    cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.quizAnswerCorrect.cardLabel"),
                    description: game.i18n.localize("ionrift-resonance.taxonomy.quizAnswerCorrect.description")
                },
                {
                    id: "QUIZ_ANSWER_INCORRECT",
                    label: game.i18n.localize("ionrift-resonance.taxonomy.quizAnswerIncorrect.label"),
                    cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.quizAnswerIncorrect.cardLabel"),
                    description: game.i18n.localize("ionrift-resonance.taxonomy.quizAnswerIncorrect.description")
                },
                {
                    id: "QUIZ_END",
                    label: game.i18n.localize("ionrift-resonance.taxonomy.quizEnd.label"),
                    cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.quizEnd.cardLabel"),
                    description: game.i18n.localize("ionrift-resonance.taxonomy.quizEnd.description")
                }
            ]
        }
    ];

    const respiteTaxonomy = [
        {
            label: game.i18n.localize("ionrift-resonance.taxonomy.groupRespiteCampRest.label"),
            description: game.i18n.localize("ionrift-resonance.taxonomy.groupRespiteCampRest.description"),
            children: [
                {
                    id: "RESPITE_FIRE_LIT",
                    label: game.i18n.localize("ionrift-resonance.taxonomy.respiteFireLit.label"),
                    cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.respiteFireLit.cardLabel"),
                    description: game.i18n.localize("ionrift-resonance.taxonomy.respiteFireLit.description")
                },
                {
                    id: "RESPITE_CAMPFIRE",
                    label: game.i18n.localize("ionrift-resonance.taxonomy.respiteCampfire.label"),
                    cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.respiteCampfire.cardLabel"),
                    description: game.i18n.localize("ionrift-resonance.taxonomy.respiteCampfire.description")
                },
                {
                    id: "RESPITE_SLEEP_STARTED",
                    label: game.i18n.localize("ionrift-resonance.taxonomy.respiteSleepStarted.label"),
                    cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.respiteSleepStarted.cardLabel"),
                    description: game.i18n.localize("ionrift-resonance.taxonomy.respiteSleepStarted.description")
                },
                {
                    id: "RESPITE_RESOLUTION",
                    label: game.i18n.localize("ionrift-resonance.taxonomy.respiteResolution.label"),
                    cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.respiteResolution.cardLabel"),
                    description: game.i18n.localize("ionrift-resonance.taxonomy.respiteResolution.description")
                }
            ]
        }
    ];

    const voiceTaxonomy = [
        {
            label: game.i18n.localize("ionrift-resonance.taxonomy.groupVoiceWhisperAmbients.label"),
            description: game.i18n.localize("ionrift-resonance.taxonomy.groupVoiceWhisperAmbients.description"),
            children: [
                {
                    id: "VOICE_WHISPER_LIGHT",
                    label: game.i18n.localize("ionrift-resonance.taxonomy.voiceWhisperLight.label"),
                    cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.voiceWhisperLight.cardLabel"),
                    description: game.i18n.localize("ionrift-resonance.taxonomy.voiceWhisperLight.description")
                },
                {
                    id: "VOICE_WHISPER_NEUTRAL",
                    label: game.i18n.localize("ionrift-resonance.taxonomy.voiceWhisperNeutral.label"),
                    cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.voiceWhisperNeutral.cardLabel"),
                    description: game.i18n.localize("ionrift-resonance.taxonomy.voiceWhisperNeutral.description")
                },
                {
                    id: "VOICE_WHISPER_DARK",
                    label: game.i18n.localize("ionrift-resonance.taxonomy.voiceWhisperDark.label"),
                    cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.voiceWhisperDark.cardLabel"),
                    description: game.i18n.localize("ionrift-resonance.taxonomy.voiceWhisperDark.description")
                }
            ]
        }
    ];

    const tripwireTaxonomy = [
        {
            label: game.i18n.localize("ionrift-resonance.taxonomy.groupTripwireDoors.label"),
            description: game.i18n.localize("ionrift-resonance.taxonomy.groupTripwireDoors.description"),
            children: [
                { id: "DOOR_WOOD_OPEN", label: game.i18n.localize("ionrift-resonance.taxonomy.doorWoodOpen.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.doorWoodOpen.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.doorWoodOpen.description") },
                { id: "DOOR_WOOD_CLOSE", label: game.i18n.localize("ionrift-resonance.taxonomy.doorWoodClose.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.doorWoodClose.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.doorWoodClose.description") },
                { id: "DOOR_IRON_OPEN", label: game.i18n.localize("ionrift-resonance.taxonomy.doorIronOpen.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.doorIronOpen.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.doorIronOpen.description") },
                { id: "DOOR_IRON_CLOSE", label: game.i18n.localize("ionrift-resonance.taxonomy.doorIronClose.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.doorIronClose.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.doorIronClose.description") },
                { id: "DOOR_STONE_OPEN", label: game.i18n.localize("ionrift-resonance.taxonomy.doorStoneOpen.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.doorStoneOpen.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.doorStoneOpen.description") },
                { id: "DOOR_STONE_CLOSE", label: game.i18n.localize("ionrift-resonance.taxonomy.doorStoneClose.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.doorStoneClose.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.doorStoneClose.description") }
            ]
        },
        {
            label: game.i18n.localize("ionrift-resonance.taxonomy.groupTripwireLocks.label"),
            description: game.i18n.localize("ionrift-resonance.taxonomy.groupTripwireLocks.description"),
            children: [
                { id: "LOCK_LOCKED", label: game.i18n.localize("ionrift-resonance.taxonomy.lockLocked.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.lockLocked.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.lockLocked.description") },
                { id: "LOCK_UNLOCKED", label: game.i18n.localize("ionrift-resonance.taxonomy.lockUnlocked.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.lockUnlocked.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.lockUnlocked.description") },
                { id: "LOCK_PICK_SUCCESS", label: game.i18n.localize("ionrift-resonance.taxonomy.lockPickSuccess.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.lockPickSuccess.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.lockPickSuccess.description") }
            ]
        },
        {
            label: game.i18n.localize("ionrift-resonance.taxonomy.groupTripwireTraps.label"),
            description: game.i18n.localize("ionrift-resonance.taxonomy.groupTripwireTraps.description"),
            children: [
                { id: "TRAP_DISARM_SUCCESS", label: game.i18n.localize("ionrift-resonance.taxonomy.trapDisarmSuccess.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.trapDisarmSuccess.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.trapDisarmSuccess.description") },
                { id: "TRIPWIRE_TRAP_SPRING", label: game.i18n.localize("ionrift-resonance.taxonomy.tripwireTrapSpring.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.tripwireTrapSpring.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.tripwireTrapSpring.description") },
                { id: "TRAP_DARTS", label: game.i18n.localize("ionrift-resonance.taxonomy.trapDarts.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.trapDarts.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.trapDarts.description") },
                { id: "TRAP_PIT", label: game.i18n.localize("ionrift-resonance.taxonomy.trapPit.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.trapPit.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.trapPit.description") },
                { id: "TRAP_ROCKFALL", label: game.i18n.localize("ionrift-resonance.taxonomy.trapRockfall.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.trapRockfall.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.trapRockfall.description") },
                { id: "TRAP_SPEARS", label: game.i18n.localize("ionrift-resonance.taxonomy.trapSpears.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.trapSpears.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.trapSpears.description") },
                { id: "TRAP_SNAPPING", label: game.i18n.localize("ionrift-resonance.taxonomy.trapSnapping.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.trapSnapping.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.trapSnapping.description") },
                { id: "TRAP_TELEPORT", label: game.i18n.localize("ionrift-resonance.taxonomy.trapTeleport.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.trapTeleport.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.trapTeleport.description") },
                { id: "TRAP_MAGICAL", label: game.i18n.localize("ionrift-resonance.taxonomy.trapMagical.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.trapMagical.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.trapMagical.description") }
            ]
        }
    ];

    const luminanceTaxonomy = [
        {
            label: game.i18n.localize("ionrift-resonance.taxonomy.groupLuminanceTorch.label"),
            description: game.i18n.localize("ionrift-resonance.taxonomy.groupLuminanceTorch.description"),
            children: [
                { id: "LUMINANCE_TORCH_LOOP", label: game.i18n.localize("ionrift-resonance.taxonomy.luminanceTorchLoop.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.luminanceTorchLoop.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.luminanceTorchLoop.description") },
                { id: "LUMINANCE_TORCH_LIT", label: game.i18n.localize("ionrift-resonance.taxonomy.luminanceTorchLit.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.luminanceTorchLit.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.luminanceTorchLit.description") },
                { id: "LUMINANCE_TORCH_EXTINGUISH", label: game.i18n.localize("ionrift-resonance.taxonomy.luminanceTorchExtinguish.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.luminanceTorchExtinguish.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.luminanceTorchExtinguish.description") }
            ]
        }
    ];

    const waterlineTaxonomy = [
        {
            label: game.i18n.localize("ionrift-resonance.taxonomy.groupWaterlineMovement.label"),
            description: game.i18n.localize("ionrift-resonance.taxonomy.groupWaterlineMovement.description"),
            children: [
                { id: "WATERLINE_ENTER", label: game.i18n.localize("ionrift-resonance.taxonomy.waterlineEnter.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.waterlineEnter.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.waterlineEnter.description") },
                { id: "WATERLINE_WADE", label: game.i18n.localize("ionrift-resonance.taxonomy.waterlineWade.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.waterlineWade.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.waterlineWade.description") },
                { id: "WATERLINE_EXIT", label: game.i18n.localize("ionrift-resonance.taxonomy.waterlineExit.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.waterlineExit.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.waterlineExit.description") }
            ]
        }
    ];

    const qolTaxonomy = [
        {
            label: game.i18n.localize("ionrift-resonance.taxonomy.groupQolLobby.label"),
            description: game.i18n.localize("ionrift-resonance.taxonomy.groupQolLobby.description"),
            children: [
                { id: "QOL_CINEMATIC_LOBBY_THEME", label: game.i18n.localize("ionrift-resonance.taxonomy.qolCinematicLobbyTheme.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.qolCinematicLobbyTheme.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.qolCinematicLobbyTheme.description") }
            ]
        },
        {
            label: game.i18n.localize("ionrift-resonance.taxonomy.groupQolCinematics.label"),
            description: game.i18n.localize("ionrift-resonance.taxonomy.groupQolCinematics.description"),
            children: [
                { id: "QOL_CINEMATIC_INTRO", label: game.i18n.localize("ionrift-resonance.taxonomy.qolCinematicIntro.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.qolCinematicIntro.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.qolCinematicIntro.description") },
                { id: "QOL_CINEMATIC_OMINOUS", label: game.i18n.localize("ionrift-resonance.taxonomy.qolCinematicOminous.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.qolCinematicOminous.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.qolCinematicOminous.description") },
                { id: "QOL_CINEMATIC_HEROIC", label: game.i18n.localize("ionrift-resonance.taxonomy.qolCinematicHeroic.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.qolCinematicHeroic.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.qolCinematicHeroic.description") },
                { id: "QOL_CINEMATIC_MYSTERY", label: game.i18n.localize("ionrift-resonance.taxonomy.qolCinematicMystery.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.qolCinematicMystery.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.qolCinematicMystery.description") },
                { id: "QOL_CINEMATIC_DANGER", label: game.i18n.localize("ionrift-resonance.taxonomy.qolCinematicDanger.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.qolCinematicDanger.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.qolCinematicDanger.description") },
                { id: "QOL_CINEMATIC_TRIUMPH", label: game.i18n.localize("ionrift-resonance.taxonomy.qolCinematicTriumph.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.qolCinematicTriumph.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.qolCinematicTriumph.description") }
            ]
        }
    ];

    const puzzlesTaxonomy = [
        {
            label: game.i18n.localize("ionrift-resonance.taxonomy.groupPuzzlesStarlightClavier.label"),
            description: game.i18n.localize("ionrift-resonance.taxonomy.groupPuzzlesStarlightClavier.description"),
            children: [
                { id: "PUZZLE_PIANO_KEY_1", label: game.i18n.localize("ionrift-resonance.taxonomy.puzzlePianoKey1.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.puzzlePianoKey1.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.puzzlePianoKey1.description") },
                { id: "PUZZLE_PIANO_KEY_2", label: game.i18n.localize("ionrift-resonance.taxonomy.puzzlePianoKey2.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.puzzlePianoKey2.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.puzzlePianoKey2.description") },
                { id: "PUZZLE_PIANO_KEY_3", label: game.i18n.localize("ionrift-resonance.taxonomy.puzzlePianoKey3.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.puzzlePianoKey3.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.puzzlePianoKey3.description") },
                { id: "PUZZLE_PIANO_KEY_4", label: game.i18n.localize("ionrift-resonance.taxonomy.puzzlePianoKey4.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.puzzlePianoKey4.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.puzzlePianoKey4.description") },
                { id: "PUZZLE_PIANO_KEY_5", label: game.i18n.localize("ionrift-resonance.taxonomy.puzzlePianoKey5.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.puzzlePianoKey5.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.puzzlePianoKey5.description") },
                { id: "PUZZLE_PIANO_SOLVED", label: game.i18n.localize("ionrift-resonance.taxonomy.puzzlePianoSolved.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.puzzlePianoSolved.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.puzzlePianoSolved.description") },
                { id: "PUZZLE_PIANO_REVERSED", label: game.i18n.localize("ionrift-resonance.taxonomy.puzzlePianoReversed.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.puzzlePianoReversed.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.puzzlePianoReversed.description") }
            ]
        }
    ];

    const directorTaxonomy = [
        {
            id: "DIRECTOR_REVEAL_GENERIC",
            label: game.i18n.localize("ionrift-resonance.taxonomy.groupDirectorReveal.label"),
            cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.directorRevealGeneric.cardLabel"),
            cardDescription: game.i18n.localize("ionrift-resonance.taxonomy.directorRevealGeneric.description"),
            description: game.i18n.localize("ionrift-resonance.taxonomy.groupDirectorReveal.description"),
            children: [
                { id: "DIRECTOR_REVEAL_BONES", label: game.i18n.localize("ionrift-resonance.taxonomy.directorRevealBones.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.directorRevealBones.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.directorRevealBones.description") },
                { id: "DIRECTOR_REVEAL_SPECTRAL", label: game.i18n.localize("ionrift-resonance.taxonomy.directorRevealSpectral.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.directorRevealSpectral.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.directorRevealSpectral.description") },
                { id: "DIRECTOR_REVEAL_WINGS", label: game.i18n.localize("ionrift-resonance.taxonomy.directorRevealWings.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.directorRevealWings.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.directorRevealWings.description") },
                { id: "DIRECTOR_REVEAL_SKITTER", label: game.i18n.localize("ionrift-resonance.taxonomy.directorRevealSkitter.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.directorRevealSkitter.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.directorRevealSkitter.description") },
                { id: "DIRECTOR_REVEAL_EMBER", label: game.i18n.localize("ionrift-resonance.taxonomy.directorRevealEmber.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.directorRevealEmber.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.directorRevealEmber.description") },
                { id: "DIRECTOR_REVEAL_HEAVY", label: game.i18n.localize("ionrift-resonance.taxonomy.directorRevealHeavy.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.directorRevealHeavy.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.directorRevealHeavy.description") },
                { id: "DIRECTOR_REVEAL_BRAMBLE", label: game.i18n.localize("ionrift-resonance.taxonomy.directorRevealBramble.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.directorRevealBramble.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.directorRevealBramble.description") },
                { id: "DIRECTOR_REVEAL_SLIME", label: game.i18n.localize("ionrift-resonance.taxonomy.directorRevealSlime.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.directorRevealSlime.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.directorRevealSlime.description") }
            ]
        },
        {
            label: game.i18n.localize("ionrift-resonance.taxonomy.groupDirectorSense.label"),
            description: game.i18n.localize("ionrift-resonance.taxonomy.groupDirectorSense.description"),
            children: [
                { id: "DIRECTOR_SENSE_PRESENCE", label: game.i18n.localize("ionrift-resonance.taxonomy.directorSensePresence.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.directorSensePresence.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.directorSensePresence.description") },
                { id: "DIRECTOR_SENSE_SEEK_PINPOINT", label: game.i18n.localize("ionrift-resonance.taxonomy.directorSenseSeekPinpoint.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.directorSenseSeekPinpoint.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.directorSenseSeekPinpoint.description") },
                { id: "DIRECTOR_SENSE_HIDE_SLIP", label: game.i18n.localize("ionrift-resonance.taxonomy.directorSenseHideSlip.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.directorSenseHideSlip.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.directorSenseHideSlip.description") },
                { id: "DIRECTOR_SENSE_POINT_OUT", label: game.i18n.localize("ionrift-resonance.taxonomy.directorSensePointOut.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.directorSensePointOut.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.directorSensePointOut.description") },
                { id: "DIRECTOR_SENSE_FLAT_WHIFF", label: game.i18n.localize("ionrift-resonance.taxonomy.directorSenseFlatWhiff.label"), cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.directorSenseFlatWhiff.cardLabel"), description: game.i18n.localize("ionrift-resonance.taxonomy.directorSenseFlatWhiff.description") }
            ]
        }
    ];

    const isQuizNightActive = game.modules.get("ionrift-quiz-night")?.active ?? false;
    const isRespiteActive = game.modules.get("ionrift-respite")?.active ?? false;
    const isCursewrightActive = CursewrightIntegration.isActive;
    const isVoiceActive = game.modules.get("ionrift-voice")?.active ?? false;
    const isTripwireActive = TripwireIntegration.isActive;
    const isLuminanceActive = LuminanceIntegration.isActive;
    const isWaterlineActive = WaterlineIntegration.isActive;
    const isQolActive = QolIntegration.isActive;
    const isPuzzlesIncubationEnabled = PuzzlesIntegration.isIncubationEnabled;
    const isPuzzlesActive = PuzzlesIntegration.isActive;
    const isDirectorIncubationEnabled = DirectorIntegration.isIncubationEnabled;
    const isDirectorActive = DirectorIntegration.isActive;

    const integrations = {
        hasActive: isQuizNightActive || isRespiteActive || isCursewrightActive || isVoiceActive || isTripwireActive || isLuminanceActive || isWaterlineActive || isQolActive || isPuzzlesActive || isDirectorActive,
        quizNight: {
            installed: QuizNightIntegration.isInstalled,
            active: QuizNightIntegration.isActive,
            compatible: QuizNightIntegration.isCompatible,
            version: QuizNightIntegration.version,
            minVersion: QuizNightIntegration.MIN_VERSION
        },
        respite: {
            installed: RespiteIntegration.isInstalled,
            active: RespiteIntegration.isActive,
            compatible: RespiteIntegration.isCompatible,
            version: RespiteIntegration.version,
            minVersion: RespiteIntegration.MIN_VERSION
        },
        cursewright: {
            installed: CursewrightIntegration.isInstalled,
            active: CursewrightIntegration.isActive,
            compatible: CursewrightIntegration.isCompatible,
            version: CursewrightIntegration.version,
            minVersion: CursewrightIntegration.MIN_VERSION
        },
        voice: {
            installed: VoiceIntegration.isInstalled,
            active: VoiceIntegration.isActive,
            compatible: VoiceIntegration.isCompatible,
            version: VoiceIntegration.version,
            minVersion: VoiceIntegration.MIN_VERSION
        },
        tripwire: {
            installed: TripwireIntegration.isInstalled,
            active: TripwireIntegration.isActive,
            compatible: TripwireIntegration.isCompatible,
            version: TripwireIntegration.version,
            minVersion: TripwireIntegration.MIN_VERSION
        },
        luminance: {
            installed: LuminanceIntegration.isInstalled,
            active: LuminanceIntegration.isActive,
            compatible: LuminanceIntegration.isCompatible,
            version: LuminanceIntegration.version,
            minVersion: LuminanceIntegration.MIN_VERSION
        },
        waterline: {
            installed: WaterlineIntegration.isInstalled,
            active: WaterlineIntegration.isActive,
            compatible: WaterlineIntegration.isCompatible,
            version: WaterlineIntegration.version,
            minVersion: WaterlineIntegration.MIN_VERSION
        },
        qol: {
            installed: QolIntegration.isInstalled,
            active: QolIntegration.isActive,
            compatible: QolIntegration.isCompatible,
            version: QolIntegration.version,
            minVersion: QolIntegration.MIN_VERSION
        },
        puzzles: {
            installed: PuzzlesIntegration.isInstalled,
            active: PuzzlesIntegration.isActive,
            compatible: PuzzlesIntegration.isCompatible,
            version: PuzzlesIntegration.version,
            minVersion: PuzzlesIntegration.MIN_VERSION
        },
        director: {
            installed: DirectorIntegration.isInstalled,
            active: DirectorIntegration.isActive,
            compatible: DirectorIntegration.isCompatible,
            version: DirectorIntegration.version,
            minVersion: DirectorIntegration.MIN_VERSION
        }
    };

    return {
        sharedMonsterTaxonomy,
        quizNightTaxonomy,
        respiteTaxonomy,
        voiceTaxonomy,
        tripwireTaxonomy,
        luminanceTaxonomy,
        waterlineTaxonomy,
        qolTaxonomy,
        puzzlesTaxonomy,
        directorTaxonomy,
        isPuzzlesIncubationEnabled,
        isDirectorIncubationEnabled,
        integrations
    };
}
