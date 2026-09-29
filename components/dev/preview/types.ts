import type {
  AnswerPayload,
  PlayerQuestionResult,
  PlayerSummary,
  PublicQuestion,
  QuestionReveal,
  SessionSnapshot,
  UpcomingQuestion,
} from "@/lib/game/types";

/**
 * Serializable props for one fixture screen. Built on the server from the real
 * engine (fixtures.ts), rendered by the client PreviewStage with no live provider.
 * `authorityNow` is the frozen engine clock; the client derives a clock offset from
 * it so countdowns start exactly where the fixture stopped.
 */
export type PreviewFixture =
  | { screen: "player-lobby"; snapshot: SessionSnapshot; nickname: string; avatarSeed: string }
  | { screen: "player-question"; snapshot: SessionSnapshot; question: PublicQuestion; authorityNow: number }
  | { screen: "player-waiting"; snapshot: SessionSnapshot; question: PublicQuestion; answer: AnswerPayload }
  | {
      screen: "player-result-correct" | "player-result-miss";
      snapshot: SessionSnapshot;
      question: PublicQuestion;
      reveal: QuestionReveal;
      result: PlayerQuestionResult;
    }
  | { screen: "player-final"; summary: PlayerSummary; quizTitle: string }
  | { screen: "host-lobby"; snapshot: SessionSnapshot; recentJoins: string[] }
  | { screen: "host-intro"; snapshot: SessionSnapshot; upcoming: UpcomingQuestion }
  | { screen: "host-question"; snapshot: SessionSnapshot; question: PublicQuestion; authorityNow: number }
  | { screen: "host-reveal"; snapshot: SessionSnapshot; question: PublicQuestion; reveal: QuestionReveal }
  | { screen: "host-leaderboard"; snapshot: SessionSnapshot }
  | { screen: "host-podium"; snapshot: SessionSnapshot };
