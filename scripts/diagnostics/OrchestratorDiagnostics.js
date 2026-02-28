import { SoundOrchestrator } from "../SoundOrchestrator.js";
import { Logger } from "../Logger.js";

/**
 * OrchestratorDiagnostics — Regression test suite for SoundOrchestrator.
 *
 * Tests the 6 canonical layering scenarios to guard against budget regression.
 * Runs in-memory with no actual sound playback.
 *
 * Usage: game.ionrift.handler.orchestrator._runTests()
 * Or via the Resonance Diagnostics panel.
 */
export class OrchestratorDiagnostics {
    constructor() {
        this.logs = [];
        this.passed = 0;
        this.failed = 0;
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    log(msg, type = "info") {
        this.logs.push({ msg, type });
        Logger.log(`[OrchestratorTest] ${msg}`);
    }

    assert(condition, description) {
        if (condition) {
            this.log(`✅ PASS: ${description}`, "success");
            this.passed++;
        } else {
            this.log(`❌ FAIL: ${description}`, "error");
            this.failed++;
        }
    }

    /**
     * Create a test orchestrator with default budgets, no Foundry dependency.
     */
    makeOrchestrator(budgetOverrides = {}, timingOverrides = {}) {
        const o = new SoundOrchestrator();
        // Inject config directly, bypassing game.settings
        o.budgetConfig = budgetOverrides;
        o.timingConfig = timingOverrides;
        return o;
    }

    /**
     * Advance the orchestrator's last-played timestamp for a category
     * by rewinding it into the past (simulate time passing).
     */
    rewind(orchestrator, category, msAgo) {
        orchestrator.lastPlayed.set(category, Date.now() - msAgo);
    }

    // -------------------------------------------------------------------------
    // Scenario Tests
    // -------------------------------------------------------------------------

    testBudgetBasic() {
        this.log("── Unit: Same key 3× in 1s → only first plays ──");
        const o = this.makeOrchestrator();

        const r1 = o.allow("DAGGERHEART_FEAR_LOW");
        const r2 = o.allow("DAGGERHEART_FEAR_LOW");
        const r3 = o.allow("DAGGERHEART_FEAR_LOW");

        this.assert(r1 === true, "First call: allowed");
        this.assert(r2 === false, "Second call (immediately): throttled");
        this.assert(r3 === false, "Third call (immediately): throttled");
    }

    testBudgetReset() {
        this.log("── Unit: Budget window resets after elapsed ──");
        const o = this.makeOrchestrator();

        o.allow("DAGGERHEART_FEAR_LOW"); // first fires, sets timestamp
        // Simulate budget window elapsed
        this.rewind(o, "FEAR_STINGER", 6000); // 6s ago, 5s budget
        const r2 = o.allow("DAGGERHEART_FEAR_LOW");
        this.assert(r2 === true, "After budget window: allowed again");
    }

    testCrossCategory() {
        this.log("── Unit: Different categories don't suppress each other ──");
        const o = this.makeOrchestrator();

        const r1 = o.allow("DAGGERHEART_HOPE");       // DH_HOPE_GAIN
        const r2 = o.allow("DAGGERHEART_STRESS_CLEAR"); // DH_STRESS_CLEAR
        this.assert(r1 === true, "Hope gain: allowed");
        this.assert(r2 === true, "Stress clear: allowed (different category)");
    }

    testUncategorised() {
        this.log("── Unit: Uncategorised key (CORE_HIT) always plays ──");
        const o = this.makeOrchestrator();
        const r1 = o.allow("CORE_HIT");
        const r2 = o.allow("CORE_HIT");
        const r3 = o.allow("CORE_HIT");
        this.assert(r1 && r2 && r3, "CORE_HIT: all 3 calls allowed (no throttle)");
    }

    testDHOutcomeUnlimited() {
        this.log("── Unit: DH_OUTCOME has no budget (always plays) ──");
        const o = this.makeOrchestrator();
        const r1 = o.allow("DAGGERHEART_CRIT");
        const r2 = o.allow("DAGGERHEART_CRIT");
        this.assert(r1 && r2, "DAGGERHEART_CRIT: plays regardless of frequency");
    }

    testTimingOffset() {
        this.log("── Unit: getOffset returns configured value ──");
        const o = this.makeOrchestrator({}, { "DAGGERHEART_CRIT": { offsetMs: 150 } });
        this.assert(o.getOffset("DAGGERHEART_CRIT") === 150, "Configured offset 150ms returned");
        this.assert(o.getOffset("CORE_HIT") === 0, "Unconfigured key returns 0ms offset");
    }

    // -------------------------------------------------------------------------
    // Named Scenario Regression Tests
    // -------------------------------------------------------------------------

    testScenario_HeroicStrike() {
        this.log("── Scenario: Heroic Strike (crit + hope + stress clear) ──");
        const o = this.makeOrchestrator();

        const attack = o.allow("ATTACK_SWORD");               // uncategorised
        const hit = o.allow("CORE_HIT");                   // uncategorised
        const crit = o.allow("DAGGERHEART_CRIT");           // DH_OUTCOME (unlimited)
        const vocal = o.allow("MONSTER_WOLF");               // MONSTER_VOCAL
        const hope = o.allow("DAGGERHEART_HOPE");           // DH_HOPE_GAIN
        const stressClear = o.allow("DAGGERHEART_STRESS_CLEAR"); // DH_STRESS_CLEAR

        this.assert(attack, "Heroic Strike: ATTACK_SWORD plays");
        this.assert(hit, "Heroic Strike: CORE_HIT plays");
        this.assert(crit, "Heroic Strike: DAGGERHEART_CRIT plays (unlimited)");
        this.assert(vocal, "Heroic Strike: MONSTER_WOLF vocal plays");
        this.assert(hope, "Heroic Strike: DAGGERHEART_HOPE plays");
        this.assert(stressClear, "Heroic Strike: DAGGERHEART_STRESS_CLEAR plays (different category from Hope)");
    }

    testScenario_FumblePlusFear() {
        this.log("── Scenario: Fumble + DM gains Fear ──");
        const o = this.makeOrchestrator();

        const swing = o.allow("ATTACK_DAGGER");             // uncategorised
        const whoosh = o.allow("CORE_WHOOSH");               // uncategorised
        const fumble = o.allow("DAGGERHEART_FAIL_WITH_FEAR");// DH_OUTCOME (unlimited)
        const fear = o.allow("DAGGERHEART_FEAR_MED");      // FEAR_STINGER

        this.assert(swing, "Fumble+Fear: ATTACK_DAGGER plays");
        this.assert(whoosh, "Fumble+Fear: CORE_WHOOSH plays");
        this.assert(fumble, "Fumble+Fear: DAGGERHEART_FAIL_WITH_FEAR plays");
        this.assert(fear, "Fumble+Fear: DAGGERHEART_FEAR_MED plays (different category)");
    }

    testScenario_FearTrackerSpam() {
        this.log("── Scenario: Fear tracker spam (LOW→MED→HIGH within 5s) ──");
        const o = this.makeOrchestrator();

        const r1 = o.allow("DAGGERHEART_FEAR_LOW");  // fires, sets FEAR_STINGER timestamp
        const r2 = o.allow("DAGGERHEART_FEAR_MED");  // should be throttled (same category)
        const r3 = o.allow("DAGGERHEART_FEAR_HIGH"); // should be throttled (same category)

        this.assert(r1 === true, "Fear spam: FEAR_LOW plays (first in window)");
        this.assert(r2 === false, "Fear spam: FEAR_MED throttled (same FEAR_STINGER category)");
        this.assert(r3 === false, "Fear spam: FEAR_HIGH throttled (same FEAR_STINGER category)");

        // After window resets, next one plays
        this.rewind(o, "FEAR_STINGER", 6000);
        const r4 = o.allow("DAGGERHEART_FEAR_HIGH");
        this.assert(r4 === true, "Fear spam: FEAR_HIGH plays after budget window reset");
    }

    testScenario_CampArmorRepair() {
        this.log("── Scenario: Camp rest — 4x ARMOR_REPAIR simultaneously ──");
        const o = this.makeOrchestrator();

        const r1 = o.allow("DAGGERHEART_ARMOR_REPAIR");
        const r2 = o.allow("DAGGERHEART_ARMOR_REPAIR");
        const r3 = o.allow("DAGGERHEART_ARMOR_REPAIR");
        const r4 = o.allow("DAGGERHEART_ARMOR_REPAIR");

        this.assert(r1 === true, "Camp rest: first ARMOR_REPAIR plays");
        this.assert(r2 === false, "Camp rest: 2nd ARMOR_REPAIR throttled");
        this.assert(r3 === false, "Camp rest: 3rd ARMOR_REPAIR throttled");
        this.assert(r4 === false, "Camp rest: 4th ARMOR_REPAIR throttled");
    }

    testScenario_HopePlusStress() {
        this.log("── Scenario: Hope gain + Stress clear in same action (200ms apart) ──");
        const o = this.makeOrchestrator();

        const hope = o.allow("DAGGERHEART_HOPE");        // DH_HOPE_GAIN
        const stress = o.allow("DAGGERHEART_STRESS_CLEAR"); // DH_STRESS_CLEAR (separate category)

        this.assert(hope, "Hope+Stress: HOPE plays");
        this.assert(stress, "Hope+Stress: STRESS_CLEAR plays (different category — not suppressed)");
    }

    // -------------------------------------------------------------------------
    // Main runner
    // -------------------------------------------------------------------------

    async run() {
        this.logs = [];
        this.passed = 0;
        this.failed = 0;

        this.log("═══ SoundOrchestrator Regression Suite ═══");

        this.testBudgetBasic();
        this.testBudgetReset();
        this.testCrossCategory();
        this.testUncategorised();
        this.testDHOutcomeUnlimited();
        this.testTimingOffset();

        this.log("─── Scenario Tests ───");
        this.testScenario_HeroicStrike();
        this.testScenario_FumblePlusFear();
        this.testScenario_FearTrackerSpam();
        this.testScenario_CampArmorRepair();
        this.testScenario_HopePlusStress();

        this.log(`═══ Results: ${this.passed} passed / ${this.failed} failed ═══`,
            this.failed === 0 ? "success" : "error");

        this._displayResults();
        return this.failed === 0;
    }

    _displayResults() {
        const statusColor = this.failed === 0 ? "green" : "red";
        let content = `<h3>🎼 Orchestrator Regression Suite</h3>`;
        content += `<p><strong style="color:${statusColor}">${this.passed} passed / ${this.failed} failed</strong></p><ul>`;

        for (const l of this.logs) {
            const color = { success: "green", error: "red", warn: "orange", info: "#aaa" }[l.type] ?? "black";
            content += `<li style="color:${color};font-size:0.85em">${l.msg}</li>`;
        }

        content += "</ul>";
        ChatMessage.create({ content, speaker: { alias: "Ionrift Orchestrator" } });
    }
}
