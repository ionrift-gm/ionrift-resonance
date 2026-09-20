import { SOUND_EVENTS } from "../data/constants.js";
import { Logger } from "../utils/Logger.js";

export class QuizNightIntegration {
    /**
     * @param {import("../services/playback/SoundHandler.js").SoundHandler} handler
     */
    constructor(handler) {
        this.handler = handler;
    }

    static get isInstalled() {
        return game.modules.has("ionrift-quiz-night");
    }

    static get isActive() {
        return game.modules.get("ionrift-quiz-night")?.active ?? false;
    }

    registerHooks() {
        if (!QuizNightIntegration.isActive) {
            Logger.log("QuizNightIntegration | ionrift-quiz-night is not active, skipping hooks.");
            return;
        }

        Logger.log("QuizNightIntegration | Registering Quiz Night sound hooks.");

        // 1. Macro Table Events (Broadcast by GM)
        Hooks.on("ionrift.quizNight.roundStart", () => {
            if (!game.user.isGM) return;
            Logger.log("QuizNightIntegration | roundStart -> QUIZ_ROUND_START");
            this.handler.play(SOUND_EVENTS.QUIZ_ROUND_START);
        });

        Hooks.on("ionrift.quizNight.roundLocked", () => {
            if (!game.user.isGM) return;
            Logger.log("QuizNightIntegration | roundLocked -> QUIZ_PENS_DOWN");
            this.handler.play(SOUND_EVENTS.QUIZ_PENS_DOWN);
        });

        Hooks.on("ionrift.quizNight.timerExpired", () => {
            if (!game.user.isGM) return;
            Logger.log("QuizNightIntegration | timerExpired -> QUIZ_TIMER_EXPIRED");
            this.handler.play(SOUND_EVENTS.QUIZ_TIMER_EXPIRED);
        });

        Hooks.on("ionrift.quizNight.quizEnd", () => {
            if (!game.user.isGM) return;
            Logger.log("QuizNightIntegration | quizEnd -> QUIZ_END");
            this.handler.play(SOUND_EVENTS.QUIZ_END);
        });

        // 2. Personal Client Audio (Played in local headphones only)
        Hooks.on("ionrift.quizNight.answerResult", (data) => {
            if (!data) return;
            const myId = game.user?.id;
            if (data.userId && data.userId !== myId) return;

            if (data.correct) {
                Logger.log("QuizNightIntegration | Local answer result: CORRECT -> QUIZ_ANSWER_CORRECT");
                this.handler.playLocal(SOUND_EVENTS.QUIZ_ANSWER_CORRECT);
            } else {
                Logger.log("QuizNightIntegration | Local answer result: INCORRECT -> QUIZ_ANSWER_INCORRECT");
                this.handler.playLocal(SOUND_EVENTS.QUIZ_ANSWER_INCORRECT);
            }
        });

        // 3. Adjudication Reward (When GM approves an appeal / manually awards point)
        Hooks.on("ionrift.quizNight.answerAdjudicated", (data) => {
            if (!data || !data.markCorrect) return;
            if (data.userId === game.user?.id) {
                Logger.log("QuizNightIntegration | Point awarded to this player -> QUIZ_ANSWER_CORRECT");
                this.handler.playLocal(SOUND_EVENTS.QUIZ_ANSWER_CORRECT);
            }
        });
    }
}
