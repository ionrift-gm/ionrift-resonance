import { SYRINSCAPE_DEFAULTS } from "../../data/syrinscape/syrinscape_defaults.js";
import { SoundCardState } from "../../models/SoundCardState.js";
import {
    getSoundPackLoader,
    getSyrinscapeProvider
} from "../../composition/accessors.js";
import { isFeatureFlagEnabled } from "../../data/featureFlags.js";
import { positionalPanelData } from "../../services/playback/SpatialSettings.js";
import { buildCoreAndCombatTaxonomies, buildIntegrationTaxonomies } from "./SoundConfigTaxonomies.js";
import { soundConfigOrchestratorAuditorMethods } from "./SoundConfigOrchestratorAuditor.js";
import { soundConfigActionsMethods } from "./SoundConfigActions.js";

const FEATURE_SHARED_MONSTER_VOICES = false;

export class SoundConfigApp extends FormApplication {
    constructor(object, options) {
        super(object, options);
        this._auditorSearch = "";
        this._auditorPage = 1;
        this._auditorLimit = 25;
        this._debouncedRefresh = foundry.utils.debounce(() => this.render(true), 250);

        this._expandedGroups = new Set();
        this._scrollPositions = {};
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "ionrift-sound-config",
            title: "ionrift-resonance.config.title",
            template: "modules/ionrift-resonance/templates/sound-config.hbs",
            width: 900,
            height: 750,
            tabs: [{ navSelector: ".tabs", contentSelector: ".content", initial: "tier1" }],
            classes: ["ionrift", "sheet", "ionrift-window", "glass-ui", "resonance-app"],
            dragDrop: [{ dropSelector: null }],
            scrollY: [".content", ".auditor-list"]
        });
    }

    getData() {
        const customBindings = JSON.parse(game.settings.get("ionrift-resonance", "customSoundBindings") || "{}");
        const configOverrides = game.settings.get("ionrift-resonance", "configOverrides") || {};

        const resolveValue = (key, loopCheck = []) => {
            if (!key) return null;
            if (loopCheck.includes(key)) return null;

            if (customBindings[key]) return { value: customBindings[key], source: "custom" };

            const packBindings = getSoundPackLoader().loaded ? getSoundPackLoader().getMergedBindings() : {};
            if (packBindings[key]) return { value: packBindings[key], source: "pack" };

            if (getSyrinscapeProvider().isConfigured()) {
                const def = SYRINSCAPE_DEFAULTS[key];
                if (def) return { value: def, source: "default" };
            }

            return { value: null, source: null };
        };

        let taxonomyVolumes = {};
        try {
            taxonomyVolumes = JSON.parse(game.settings.get("ionrift-resonance", "taxonomyVolume") || "{}");
        } catch { /* empty */ }

        const VOLUME_ENABLED_ROOTS = new Set([
            "CORE_MELEE", "CORE_RANGED", "CORE_MAGIC", "CORE_SCHOOL", "CORE_DOMAIN"
        ]);

        const processHierarchy = (node, parentState = null) => {
            let myState = null;
            let myResolved = { value: null, source: null };

            if (node.id) {
                const check = resolveValue(node.id);

                if (check.value) {
                    myResolved = check;
                    const isCustom = check.source === "custom";
                    const displayDefault = isCustom
                        ? SYRINSCAPE_DEFAULTS[node.id]
                        : check.value;
                    myState = new SoundCardState(node.id,
                        isCustom ? check.value : null,
                        displayDefault,
                        node.cardLabel || node.label,
                        node.description
                    );
                    if (!isCustom) myState.value = check.value;
                } else {
                    if (parentState && parentState.value) {
                        myResolved = { value: parentState.value, source: "inherited" };
                        myState = new SoundCardState(node.id, null, parentState.value, node.cardLabel || node.label, node.description, parentState.label);
                        myState.value = myResolved.value;
                    } else {
                        myState = new SoundCardState(node.id, null, null, node.cardLabel || node.label, node.description);
                    }
                }
            } else {
                myState = parentState;
            }

            const groupData = {
                label: node.label,
                key: node.id,
                description: node.description,
                packName: node.packName || null,
                packIcon: node.packIcon || null,
                children: [],
                fields: [],
                headerCard: node.id ? myState.getRenderData() : null,
                isOpen: this._expandedGroups.has(node.label) || false,
                volumeControl: null
            };

            if (node.id && VOLUME_ENABLED_ROOTS.has(node.id)) {
                const vol = taxonomyVolumes[node.id];
                const magicVol = taxonomyVolumes["CORE_MAGIC"];
                const isChild = (node.id === "CORE_SCHOOL" || node.id === "CORE_DOMAIN");
                const effectiveVol = vol ?? (isChild ? (magicVol ?? 1.0) : 1.0);
                groupData.volumeControl = {
                    key: node.id,
                    volume: effectiveVol,
                    percent: Math.round(effectiveVol * 100),
                    hasOverride: vol !== undefined,
                    inheritsFromMagic: isChild && vol === undefined && magicVol !== undefined
                };
            }

            if (node.children) {
                node.children.forEach(child => {
                    const childResult = processHierarchy(child, myState);
                    if (child.children && child.children.length > 0) {
                        groupData.children.push(childResult);
                    } else if (childResult.headerCard) {
                        groupData.fields.push(childResult.headerCard);
                    }
                });
            }

            return groupData;
        };

        const { coreTaxonomy, actionTaxonomy, monsterTaxonomy } = buildCoreAndCombatTaxonomies();

        const tier1Roots = coreTaxonomy.map(node => processHierarchy(node));
        const tier2Roots = actionTaxonomy.map(node => processHierarchy(node));
        const tier3Roots = monsterTaxonomy.map(node => processHierarchy(node));

        // --- MODULE INTEGRATIONS: CURSEWRIGHT ---
        const cursewrightTaxonomy = [
            {
                label: game.i18n.localize("ionrift-resonance.taxonomy.groupCursewrightProgress.label"),
                description: game.i18n.localize("ionrift-resonance.taxonomy.groupCursewrightProgress.description"),
                children: [
                    {
                        id: "CURSEWRIGHT_REMOVAL_ATTEMPTED",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightRemovalAttempted.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightRemovalAttempted.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightRemovalAttempted.description")
                    },
                    {
                        id: "CURSEWRIGHT_WHISPER_SENT",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightWhisperSent.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightWhisperSent.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightWhisperSent.description")
                    },
                    {
                        id: "CURSEWRIGHT_CURSE_LOCKED",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightCurseLocked.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightCurseLocked.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightCurseLocked.description")
                    },
                    {
                        id: "CURSEWRIGHT_PHASE_ADVANCED",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightPhaseAdvanced.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightPhaseAdvanced.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightPhaseAdvanced.description")
                    },
                    {
                        id: "CURSEWRIGHT_CURSE_ACTIVATED",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightCurseActivated.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightCurseActivated.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightCurseActivated.description")
                    }
                ]
            },
            {
                label: game.i18n.localize("ionrift-resonance.taxonomy.groupCursewrightDevour.label"),
                description: game.i18n.localize("ionrift-resonance.taxonomy.groupCursewrightDevour.description"),
                children: [
                    {
                        id: "CURSEWRIGHT_DEVOUR_REVEAL_FIRST",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightDevourRevealFirst.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightDevourRevealFirst.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightDevourRevealFirst.description")
                    },
                    {
                        id: "CURSEWRIGHT_DEVOUR_REVEAL_FULL",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightDevourRevealFull.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightDevourRevealFull.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightDevourRevealFull.description")
                    },
                    {
                        id: "CURSEWRIGHT_ARM_GRIP",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightArmGrip.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightArmGrip.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightArmGrip.description")
                    },
                    {
                        id: "CURSEWRIGHT_ARM_CAUGHT",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightArmCaught.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightArmCaught.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightArmCaught.description")
                    },
                    {
                        id: "CURSEWRIGHT_ARM_PULLED",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightArmPulled.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightArmPulled.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightArmPulled.description")
                    },
                    {
                        id: "CURSEWRIGHT_DEVOURED",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightDevoured.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightDevoured.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightDevoured.description")
                    }
                ]
            },
            {
                label: game.i18n.localize("ionrift-resonance.taxonomy.groupCursewrightTribute.label"),
                description: game.i18n.localize("ionrift-resonance.taxonomy.groupCursewrightTribute.description"),
                children: [
                    {
                        id: "CURSEWRIGHT_TRIBUTE_DEMANDED",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightTributeDemanded.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightTributeDemanded.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightTributeDemanded.description")
                    },
                    {
                        id: "CURSEWRIGHT_TRIBUTE_MISSED",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightTributeMissed.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightTributeMissed.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightTributeMissed.description")
                    },
                    {
                        id: "CURSEWRIGHT_DETONATION",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightDetonation.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightDetonation.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightDetonation.description")
                    },
                    {
                        id: "CURSEWRIGHT_CURSE_BROKEN",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightCurseBroken.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightCurseBroken.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightCurseBroken.description")
                    },
                    {
                        id: "CURSEWRIGHT_CURSE_RESISTED",
                        label: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightCurseResisted.label"),
                        cardLabel: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightCurseResisted.cardLabel"),
                        description: game.i18n.localize("ionrift-resonance.taxonomy.cursewrightCurseResisted.description")
                    }
                ]
            }
        ];
        const cursewrightRoots = cursewrightTaxonomy.map(node => processHierarchy(node));

        const {
            sharedMonsterTaxonomy,
            quizNightTaxonomy,
            respiteTaxonomy,
            voiceTaxonomy,
            tripwireTaxonomy,
            luminanceTaxonomy,
            waterlineTaxonomy,
            qolTaxonomy,
            puzzlesTaxonomy,
            isPuzzlesIncubationEnabled,
            integrations
        } = buildIntegrationTaxonomies();

        const sharedMonsterRoots = FEATURE_SHARED_MONSTER_VOICES
            ? sharedMonsterTaxonomy.map(node => processHierarchy(node))
            : [];
        const quizNightRoots = quizNightTaxonomy.map(node => processHierarchy(node));
        const respiteRoots = respiteTaxonomy.map(node => processHierarchy(node));
        const voiceRoots = voiceTaxonomy.map(node => processHierarchy(node));
        const tripwireRoots = tripwireTaxonomy.map(node => processHierarchy(node));
        const luminanceRoots = luminanceTaxonomy.map(node => processHierarchy(node));
        const waterlineRoots = waterlineTaxonomy.map(node => processHierarchy(node));
        const qolRoots = qolTaxonomy.map(node => processHierarchy(node));
        const puzzlesRoots = isPuzzlesIncubationEnabled
            ? puzzlesTaxonomy.map(node => processHierarchy(node))
            : [];

        return {
            hasSyrinscape: getSyrinscapeProvider().isConfigured(),
            features: {
                sharedMonsterVoices: FEATURE_SHARED_MONSTER_VOICES,
                spellVocalLayer: isFeatureFlagEnabled("SPELL_VOCAL_LAYER"),
                puzzlesIncubation: isPuzzlesIncubationEnabled
            },
            integrations,
            tiers: {
                tier1: {
                    label: game.i18n.localize("ionrift-resonance.config.tabEssentials"),
                    active: true,
                    paramounts: tier1Roots
                },
                tier2: {
                    label: game.i18n.localize("ionrift-resonance.config.tabCombatActions"),
                    active: false,
                    paramounts: tier2Roots
                },
                tier3: {
                    label: game.i18n.localize("ionrift-resonance.config.tabMonsters"),
                    active: false,
                    paramounts: tier3Roots
                },
                sharedMonster: {
                    label: game.i18n.localize("ionrift-resonance.config.tabSharedMonsterVoices"),
                    active: false,
                    paramounts: sharedMonsterRoots
                },
                quizNight: {
                    label: game.i18n.localize("ionrift-resonance.config.integration.tabQuizNight"),
                    active: false,
                    paramounts: quizNightRoots
                },
                respite: {
                    label: game.i18n.localize("ionrift-resonance.config.integration.tabRespite"),
                    active: false,
                    paramounts: respiteRoots
                },
                cursewright: {
                    label: game.i18n.localize("ionrift-resonance.config.integration.tabCursewright"),
                    active: false,
                    paramounts: cursewrightRoots
                },
                voice: {
                    label: game.i18n.localize("ionrift-resonance.config.integration.tabVoice"),
                    active: false,
                    paramounts: voiceRoots
                },
                tripwire: {
                    label: game.i18n.localize("ionrift-resonance.config.integration.tabTripwire"),
                    active: false,
                    paramounts: tripwireRoots
                },
                luminance: {
                    label: game.i18n.localize("ionrift-resonance.config.integration.tabLuminance"),
                    active: false,
                    paramounts: luminanceRoots
                },
                waterline: {
                    label: game.i18n.localize("ionrift-resonance.config.integration.tabWaterline"),
                    active: false,
                    paramounts: waterlineRoots
                },
                qol: {
                    label: game.i18n.localize("ionrift-resonance.config.integration.tabQol"),
                    active: false,
                    paramounts: qolRoots
                },
                puzzles: {
                    label: game.i18n.localize("ionrift-resonance.config.integration.tabPuzzles"),
                    active: false,
                    paramounts: puzzlesRoots
                },
                auditor: {
                    label: game.i18n.localize("ionrift-resonance.config.tabSoundAuditor"),
                    active: false,
                    items: this._getAuditorData()
                },
                players: {
                    label: game.i18n.localize("ionrift-resonance.config.tabPlayers"),
                    active: false,
                    players: configOverrides.players || []
                },
                orchestrator: this._getOrchestratorData(),
                config: configOverrides,
                spellVocalLayer: game.settings.get("ionrift-resonance", "spellVocalLayer") ?? false
            },
            positional: positionalPanelData()
        };
    }

    async _updateObject(event, formData) {
        // Auto-save handles bindings; this handles any top-level config overrides if present.
    }

    activateListeners(html) {
        super.activateListeners(html);

        html.on("click", ".play-preview", this._onPlayPreview.bind(this));

        html.on("click", ".export-config", this._onExportConfig.bind(this));
        html.on("click", ".import-config", this._onImportConfig.bind(this));
        html.on("click", ".load-preset", this._onLoadPreset.bind(this));

        html.on("click", ".add-row", this._onAddRow.bind(this));
        html.on("click", ".delete-row", this._onDeleteRow.bind(this));

        html.on("click", ".search-sound", this._onSearch.bind(this));

        html.on("click", ".stop-all-sounds", this._onStopAll.bind(this));
        html.on("click", ".reset-sound", this._onReset.bind(this));
        html.on("click", ".toggle-mute", this._onToggleMute.bind(this));
        html.on("input", ".taxonomy-volume-slider", this._onTaxonomyVolumeInput.bind(this));
        html.on("change", ".taxonomy-volume-slider", this._onTaxonomyVolumeChange.bind(this));
        html.on("click", ".taxonomy-volume-reset", this._onTaxonomyVolumeReset.bind(this));

        html.on("click", ".auditor-edit", this._onAuditorEdit.bind(this));
        html.on("click", ".auditor-delete", this._onAuditorDelete.bind(this));

        html.on("keyup", ".auditor-search-input", this._onAuditorSearchKey.bind(this));
        html.on("click", ".auditor-control-btn", this._onAuditorPageControl.bind(this));

        this._updateHook = (doc, changes) => {
            const flagsChanged = changes?.flags?.["ionrift-resonance"];
            if (flagsChanged) this._debouncedRefresh();
        };

        if (!this._hooksRegistered) {
            Hooks.on("updateActor", this._updateHook);
            Hooks.on("updateItem", this._updateHook);
            this._hooksRegistered = true;
        }

        html.on("change", ".orchestrator-budget-input", this._onOrchestratorBudgetChange.bind(this));
        html.on("click", ".orchestrator-reset-category", this._onOrchestratorResetCategory.bind(this));
        html.on("change", ".orchestrator-timing-input", this._onOrchestratorTimingSave.bind(this));
        html.on("click", ".orchestrator-timing-delete", this._onOrchestratorTimingDelete.bind(this));
        html.on("change", ".orchestrator-offset-input", this._onOrchestratorOffsetChange.bind(this));
        html.on("click", ".orchestrator-reset-offset", this._onOrchestratorResetOffset.bind(this));
        html.on("click", ".orchestrator-reset-all", this._onOrchestratorResetAll.bind(this));

        html.on("click", ".orchestrator-toggle-setting", this._onToggleSetting.bind(this));
        html.on("change", ".positional-master", this._onPositionalMaster.bind(this));
        html.on("change", ".positional-category", this._onPositionalCategory.bind(this));
        html.on("change", ".hear-positional", this._onHearPositional.bind(this));

        html.on("keydown", ".orchestrator-budget-input, .orchestrator-timing-input, .orchestrator-offset-input", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                $(e.currentTarget).trigger("change").blur();
            }
        });

        html.find("details").on("toggle", (event) => {
            const details = event.currentTarget;
            const label = details.dataset.groupLabel;
            if (!label) return;

            if (details.open) {
                this._expandedGroups.add(label);
            } else {
                this._expandedGroups.delete(label);
            }
        });
    }

    async close(options) {
        if (this._hooksRegistered) {
            Hooks.off("updateActor", this._updateHook);
            Hooks.off("updateItem", this._updateHook);
            this._hooksRegistered = false;
        }
        return super.close(options);
    }
}

Object.assign(
    SoundConfigApp.prototype,
    soundConfigOrchestratorAuditorMethods,
    soundConfigActionsMethods
);
