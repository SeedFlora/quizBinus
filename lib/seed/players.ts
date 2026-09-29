import type { LeaderboardEntry, PublicPlayer } from "@/lib/game/types";

/** Realistic nicknames students actually type. Used by demo mode and previews. */
export const DEMO_NICKNAMES = [
  "rara.tiara",
  "Bima S.",
  "dewikinanti",
  "Kevin_T",
  "Nadia R",
  "yosua.h",
  "Putu Adi",
  "Siti Aisyah",
  "andre99",
  "Michelle W",
  "Farhan",
  "tasya.ng",
  "Gilang R",
  "Jessica L",
  "Raka",
  "Aurel",
  "Dimas P",
  "Clarissa",
  "Made Wira",
  "Hana",
  "Bagas",
  "Stefanie",
  "Rizky A",
  "Nabila",
  "Theo",
  "Intan",
  "Galih",
  "Vania",
  "Reza F",
  "Kirana",
  "Samuel",
  "Ayu Lestari",
  "Fikri",
  "Olivia",
  "Arya",
  "Salsa",
  "Daniel H",
  "Nurul",
  "Evan",
  "Laras M",
  "Josh",
  "Wulan",
] as const;

export const DEMO_PLAYERS: PublicPlayer[] = DEMO_NICKNAMES.map((nickname, i) => ({
  id: `demo-p${String(i + 1).padStart(2, "0")}`,
  nickname,
  avatarSeed: `${nickname}-${i * 7919}`,
}));

/** The player whose phone we are "holding" in demo mode. */
export const DEMO_SELF = DEMO_PLAYERS[4]!;

const scores = [8420, 8190, 7985, 7710, 7560, 7210, 6980, 6725, 6400, 6120];
const prev = [2, 1, 3, 7, 5, 4, 6, 9, 8, 10];
const lastPts = [980, 870, 910, 1040, 820, 0, 760, 930, 0, 700];
const streaks = [5, 3, 4, 6, 2, 0, 1, 3, 0, 1];

export const DEMO_LEADERBOARD: LeaderboardEntry[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => {
  const player = [
    DEMO_PLAYERS[0],
    DEMO_PLAYERS[3],
    DEMO_PLAYERS[6],
    DEMO_SELF,
    DEMO_PLAYERS[1],
    DEMO_PLAYERS[9],
    DEMO_PLAYERS[12],
    DEMO_PLAYERS[15],
    DEMO_PLAYERS[20],
    DEMO_PLAYERS[7],
  ][i]!;
  return {
    playerId: player.id,
    nickname: player.nickname,
    avatarSeed: player.avatarSeed,
    score: scores[i]!,
    rank: i + 1,
    previousRank: prev[i]!,
    streak: streaks[i]!,
    lastPoints: lastPts[i]!,
  };
});
