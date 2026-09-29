# NUSAQUEST Design System

> Working title: **NUSAQUEST** — _A BINUS Learning Game Experience_ — "Play • Learn • Connect"
> Visual thesis: **Indonesian Future Game Show.**

This document is the contract every screen is built against. When a screen and this
document disagree, fix the screen or update this document; never let them drift.

---

## 0. The one memorable thing

We spend boldness in **one** place: **giant condensed numerals used as architecture.**
Round numbers, scores, ranks, countdowns and the room PIN are set in Bricolage Grotesque
at its narrowest width and heaviest weight, so large that they become the stage
itself. `04` fills the question intro. `+850` punches out of the result screen. `#03`
anchors a leaderboard row.

Everything around the numerals stays disciplined: one shape vocabulary (NUSA FRAME), one
navy stage, a restrained orange/yellow energy, and cultural pattern at 3–10% opacity.

---

## 1. Information architecture

Three products share DNA but not layouts.

```
PUBLIC
  /                               Landing: hero stage + inline PIN entry
  /login                          Lecturer sign-in (email + password, database mode)
  /design                         Component gallery (all states), dev reference

A. PLAYER — phone is a game controller (route group: (player))
  /join?room=XXXXXX               Room PIN entry (QR deep link pre-fills)
  /join/profile                   Nickname + geometric avatar
  /room/[code]/lobby              "Siap bermain?"
  /play/[sessionId]               Live controller; phase-driven views:
  /play/[sessionId]/waiting         "Jawaban terkunci"
  /play/[sessionId]/result          BENAR! / Belum tepat, +pts, rank move
  /play/[sessionId]/final           Personal summary

B. HOST — projector stage 16:9, adapts to 4:3 (route group: (host))
  /host/session/[id]/lobby        PIN, QR, participant bubbles
  /host/session/[id]              Stage: intro → question → reveal → leaderboard → between
  /host/session/[id]/podium       Final podium

C. CREATOR — calm authoring app (route group: (creator))
  /dashboard                      "Selamat datang, Bu …"
  /quizzes                        Arena library
  /quizzes/new                    Blank / Generate with AI
  /quizzes/[id]/edit              Three-pane editor
  /quizzes/[id]/analytics         Post-game insight
  /sessions                       Session history
  /settings                       Profile, language, sound
```

The live player and host experiences each run **one** client controller that swaps
views as the authoritative game phase changes (no navigation round-trip per state).
Sub-routes such as `/play/[id]/result` exist so a refresh resumes at the right view and
so each state is deep-linkable for review; the controller keeps the URL in sync with
`history.replaceState`.

Session id `demo` runs a scripted mock game, so every screen is viewable without a
backend.

---

## 2. Color tokens (PROJECT TOKENS)

> **These are project tokens inspired by BINUS University's public visual language
> (institutional blue + orange/yellow energy). They are NOT the official BINUS Graphic
> Standard.** When the official manual is supplied, replace values in
> `app/styles/tokens.css` only; every component reads semantic tokens.

### Primitive palette

| Token               | Hex       | Role                                              |
| ------------------- | --------- | ------------------------------------------------- |
| `--binus-blue-950`  | `#061433` | The stage. Base game environment                  |
| `--binus-blue-900`  | `#0B2150` | Raised surfaces on stage                          |
| `--binus-blue-700`  | `#153C8C` | Active panels, pressed states                     |
| `--binus-blue-500`  | `#2266D9` | Institutional blue, links, creator primary        |
| `--binus-sky`       | `#46B8F4` | Highlight, info, answer A                         |
| `--binus-orange`    | `#F7861F` | Energy, primary game CTA, answer B                |
| `--binus-yellow`    | `#FFC82E` | Score, streak, focus ring, answer D               |
| `--nusantara-red`   | `#E0262F` | Celebration accent only (podium, confetti)        |
| `--nusantara-white` | `#FFF9EE` | Warm "kapas" white: text on stage, answer C       |
| `--night`           | `#020918` | Deepest shadow, vignette                          |
| `--ink`             | `#0A1633` | Text on light (creator)                           |
| `--cloud`           | `#EEF2F9` | Creator canvas                                    |
| `--success`         | `#1FCF93` | Confirmations in creator, correct check           |
| `--warning`         | `#FFB224` | Caution                                           |
| `--danger`          | `#FF5A4D` | Destructive actions only; never for wrong answers |

### Rules

- The stage is navy (`blue-950`), never black.
- Orange and yellow are _energy_: CTAs, score, streak, timer urgency. Max ~15% of a screen.
- Red + white appear only in **celebration** moments (podium, perfect round, confetti).
  Never as interface chrome.
- **A wrong answer is never red.** "Belum tepat" uses muted slate
  (`--state-miss`) with a small shake, so it doesn't humiliate the student.
- Creator mode inverts to a light `cloud` canvas with `ink` text. Authoring should
  feel calm, and the inversion tells the lecturer at a glance whether they're
  authoring or playing.

### Answer identity (color + symbol + letter + position)

| Pos | Letter | Symbol                                 | Name    | Accent      |
| --- | ------ | -------------------------------------- | ------- | ----------- |
| 1   | A      | four-petal kawung                      | Kawung  | sky         |
| 2   | B      | slanted parang blade                   | Parang  | orange      |
| 3   | C      | layered cloud (Cirebon _mega mendung_) | Mega    | kapas white |
| 4   | D      | eight-point bintang                    | Bintang | yellow      |

Answer bars are **navy with a colored symbol chip and edge rail**; color floods the
bar only when selected or revealed. Correctness is always communicated by an icon
and a label ("Jawaban benar" / check glyph), never by hue.

---

## 3. Typography

| Role               | Family                                                                          | Why                                                                               |
| ------------------ | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Display / numerals | **Bricolage Grotesque** (variable: `wght 200–800`, `wdth 75–100`, `opsz 12–96`) | Condensed heavy numerals with ink-trap character. Loud, contemporary, poster-like |
| Interface / body   | **Plus Jakarta Sans** (400–800)                                                 | Designed by Tokotype in Jakarta. Highly legible; our Indonesian connection        |

Numerals always use `font-variant-numeric: tabular-nums` where they tick.

### Scale

Interface (Plus Jakarta Sans): 12 · 14 · 16 · 18 · 20 · 24 · 30 (line-height 1.5 body,
1.25 headings).

Display (Bricolage, `wdth 75`, `wght 800`, line-height 0.85, tracking -0.02em):

| Token          | Size                         | Use                                      |
| -------------- | ---------------------------- | ---------------------------------------- |
| `--text-mega`  | `clamp(7rem, 22vw, 20rem)`   | Ghost numerals, question intro, host PIN |
| `--text-giga`  | `clamp(4.5rem, 12vw, 11rem)` | Podium ranks, +points                    |
| `--text-hero`  | `clamp(3rem, 8vw, 6.5rem)`   | Landing hero, "BENAR!"                   |
| `--text-title` | `clamp(2rem, 4vw, 3.5rem)`   | Host question text                       |

Game labels such as `QUESTION`, `STREAK` and `SUDAH MENJAWAB` are uppercase Jakarta
800 at `0.14em` tracking. **Caps are reserved for game HUD labels**; creator UI is
sentence case.

---

## 4. NUSA FRAME: the proprietary shape

```
   r=10 ┌──────────────────────╲  cut 18 (diagonal)
        │                        │
        │                        │
   notch└┐                      ╱  r=28 (large radius)
     8x8 └─────────────────────╯
```

| Corner       | Treatment        | Variable          |
| ------------ | ---------------- | ----------------- |
| top-left     | modest radius    | `--nf-tl: 10px`   |
| top-right    | 45° diagonal cut | `--nf-cut: 18px`  |
| bottom-right | large radius     | `--nf-br: 28px`   |
| bottom-left  | square notch     | `--nf-notch: 8px` |

**Implementation.** The shape lives on pseudo-elements, never on the element itself:
`::before` = fill, `::after` = stroke/focus halo. The host element stays unclipped, so
focus outlines, tooltips and children aren't cut off. The shape is
`border-radius: var(--nf-tl) 0 var(--nf-br) 0` + `clip-path: polygon(...)` with
`calc()` offsets, so it stays responsive at any size.

Sizes: `nf-sm` (6/10/16/5), `nf-md` (10/18/28/8, default), `nf-lg` (14/28/44/12) for
host panels. Mirrored variant `nf-flip` (cut on the left) is used for alternating
leaderboard rows and the player/host "conversation" on the landing page.

Companion shapes: **capsule with notch** (badges), **circle** (avatars, timer), and the
**parang slash**, a 12° slanted edge used on progress bars and dividers.

---

## 5. Indonesian pattern families

Three geometric abstractions. None reproduces a specific protected artwork; each is
reduced to its structural idea.

| Pattern        | Source idea               | Geometry                                                       | Where                                          |
| -------------- | ------------------------- | -------------------------------------------------------------- | ---------------------------------------------- |
| **NusaKawung** | Kawung's four-lobed cross | 4 pointed ellipses around a center point, on a 45° lattice     | Podium, achievement frames, confetti particles |
| **NusaFlow**   | Parang's diagonal rhythm  | Repeating 45° S-bands with a knot every other band             | Results, reveals, transitions                  |
| **NusaGrid**   | Tenun woven grid          | Over/under interlace squares with a small lozenge at crossings | Lobby, waiting, join                           |

Opacity 3–10% (`--pattern-quiet: .04`, `--pattern-soft: .07`, `--pattern-loud: .10`).
The question screen is nearly pattern-free (≤ .03) because focus matters most there.

Background stack (`<StageBackground>`): base navy → soft radial light (top-left
institutional blue, bottom-right faint orange) → SVG grain (feTurbulence, 5%) →
pattern layer → optional slow-drifting pattern (transform only, paused under reduced
motion).

---

## 6. Motion language

Library: `motion` (`motion/react`). Tokens live in `lib/motion.ts`.

| Category    | Duration    | Easing                                        | Examples                      |
| ----------- | ----------- | --------------------------------------------- | ----------------------------- |
| MICRO       | 100–180 ms  | `nusaSnap` spring (stiffness 700, damping 32) | press, toggle, select         |
| SYSTEM      | 200–350 ms  | `ease-out-expo` `[0.16, 1, 0.3, 1]`           | panels, dialogs, route views  |
| GAME        | 400–800 ms  | `ease-in-out-quint` `[0.83, 0, 0.17, 1]`      | question reveal, rank reorder |
| CELEBRATION | 800–1800 ms | spring (stiffness 180, damping 14)            | correct burst, podium, streak |

Signature moments:

1. **Question intro.** The ghost round numeral scales from 0.6 → 1 behind the stage, a
   parang-slash mask wipes open diagonally, then the question slides in.
2. **Countdown.** Numerals tick; in the final 5 s the timer ring gains segment pulses,
   the number scales on each tick and the HUD shows `5…4…3`. Urgency is carried by
   shape and text as well as color.
3. **Answer lock.** The pressed bar compresses to 0.96, rebounds, and a lock glyph
   stamps in. Acknowledged in < 150 ms (optimistic), with a haptic tick.
4. **Correct.** A radial burst of 8 kawung lobes plus a yellow ring flare.
5. **Wrong.** 3-cycle, 6 px horizontal shake over 360 ms. No red.
6. **Score.** Numbers count up with an ease-out over 900 ms.
7. **Rank move.** The old rank slides up and out as the new rank drops in; a ▲n chip follows.
8. **Streak.** A flame built from stacked parang blades gains one blade per streak step (max 5).
9. **Leaderboard.** `layout` animation; rows physically slide into their new order.
10. **Podium.** 3rd rises, then 2nd, then 1st (staggered 450 ms), followed by kawung confetti.
11. **Waiting.** NusaGrid drifts 40 px/min.

`prefers-reduced-motion`: all transforms collapse to opacity cross-fades ≤ 150 ms,
count-ups jump to the final value, and drifting patterns stop. The `useReducedMotion`
hook from `motion/react` drives this.

---

## 7. Sound

`lib/audio` exposes `play(cue)` for cues `join | countdown | answer-lock | correct |
incorrect | rank-up | streak | round-end | winner`. The engine is lazy: no
AudioContext exists until the first user gesture. Default cues are tiny synthesized
tones (WebAudio), replaceable by files in `public/audio/<cue>.mp3`. A global mute
toggle is persisted per device.

### Music (projector only)

`lib/audio/music.ts` generates adaptive music procedurally: no files, no licences.

| Mood     | Game phase          | Tuning          | Tempo | Texture                                                      |
| -------- | ------------------- | --------------- | ----- | ------------------------------------------------------------ |
| lobby    | lobby, paused       | slendro (5-TET) | 92    | saron balungan, mipil bonang, soft kendang, pad              |
| intro    | question intro      | pelog           | 128   | rising bonang run, kendang roll                              |
| question | question open       | pelog           | 118   | interlocking (imbal) bonang, driving kendang, bass, 8th hats |
| urgent   | last 5 s            | pelog           | 142   | denser imbal, kendang roll, 16th hats                        |
| results  | reveal, leaderboard | slendro         | 104   | brighter balungan, bass                                      |
| podium   | finished            | slendro         | 112   | ascending runs, gong every cycle                             |

A colotomic 16-beat cycle (gong / kenong / kempul / kethuk) gives the gamelan shape;
triangle bass and noise hats add arcade drive. Phones never play music (a room of 40
phones would be chaos); they play short SFX only. `/lab/audio` auditions every mood and
cue and runs an offline render check.

---

## 8. Component inventory

| Component            | Purpose                                                                                                      | States                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `BinusLogo`          | Replaceable logo slot (reads `/brand/binus-logo.svg` if present, else a neutral typographic placeholder)     | default                                                                  |
| `Wordmark`           | Product name from `lib/brand.ts`                                                                             | default                                                                  |
| `NusaFrame`          | Shape container                                                                                              | solid, outline, ghost; sizes; flip                                       |
| `NusaButton`         | Primary action with press depth                                                                              | default, hover, focus, active, disabled, loading                         |
| `NusaBadge`          | Notched capsule label / achievement                                                                          | neutral, energy, success, celebration                                    |
| `NusaTimer`          | Ring + numerals, final-5s mode                                                                               | running, urgent, paused, done                                            |
| `NusaScore`          | Count-up tabular score                                                                                       | idle, counting, delta                                                    |
| `NusaRank`           | Rank numeral with movement                                                                                   | up, down, same                                                           |
| `NusaProgress`       | Parang-slash segmented progress                                                                              | question progress, answer progress                                       |
| `NusaPattern`        | Kawung / Flow / Grid SVG layers                                                                              | intensity, drift                                                         |
| `NusaAvatar`         | Seeded geometric creature (no ethnic depiction)                                                              | sizes, joined pop                                                        |
| `NusaAnswer`         | Answer bar (symbol + letter + text)                                                                          | idle, hover, focus, pressed, selected, locked, correct, missed, disabled |
| `NusaLeaderboardRow` | Rank row with movement                                                                                       | top3 emphasis, self highlight                                            |
| `NusaPodium`         | 3-step rising podium                                                                                         | staged reveal                                                            |
| `NusaRoomCode`       | PIN display (host) and PIN input (player)                                                                    | display, input, error                                                    |
| `NusaQRCode`         | Stylized QR (real, scannable) in a NUSA FRAME                                                                | default, loading                                                         |
| `AnswerSymbol`       | Kawung / Parang / Mega / Bintang SVGs. Silhouettes must never resemble a Latin letter or a UI icon (×, ⚠, ▶) | sizes                                                                    |
| `AchievementIcon`    | Fast Answer, Perfect Round, Comeback, Hot Streak, Top Three, First Place, Accuracy Master                    | earned, locked                                                           |
| `StageBackground`    | Procedural layered background                                                                                | pattern, intensity, drift                                                |

---

## 9. Layout principles per experience

**Player (320 px+).** Everything important sits in the bottom 60% (thumb zone). HUD strip
on top (`Q 04/10` + timer), then the question, then the answer stack. Answer bars
are ≥ 64 px tall (target ≥ 44 px guaranteed), full width, with 10 px gaps. Their diagonal
cuts align into one slanted column, echoing the parang rhythm.

**Host (1920×1080, safe 64 px).** Readable from the back row: question text ≥ 56 px,
labels ≥ 24 px, numerals ≥ 120 px. The question sits on the left 60%, the answer stack on
the right 40% (never a 2×2 quadrant grid). The HUD footer carries the timer and
`34 / 42 SUDAH MENJAWAB`. At 4:3 the answer stack moves beneath the question.

**Creator (768 px+).** A light canvas with a navy left rail. The editor uses three
panes (navigator 280 / editor fluid / settings 340). Quiet surfaces, one orange
primary action per view.

---

## 10. Voice (Bahasa Indonesia default)

Friendly, university-level, never childish, with slang used sparingly. Examples:
"Masuk Arena", "Menunggu pemain…", "Semua siap?", "Jawaban terkunci", "Benar!",
"Belum tepat", "Naik 3 peringkat!", "Pertahankan streak-mu!", "100% tepat. Mantap!",
"Menunggu para Binusian masuk…". Errors say what happened and what to do.

---

## 11. Review checklist (every screen)

1. Recognizable without the logo?
2. Game, not LMS?
3. Not Kahoot (no quadrants, no purple, no copied podium/transition/lobby)?
4. Culture integrated, not pasted on?
5. Appropriate for BINUS?
6. Understood in under 2 s?
7. Readable from the back row (host)?
8. Effortless on mobile?
9. Does animation explain state?
10. Handcrafted, not generated?
