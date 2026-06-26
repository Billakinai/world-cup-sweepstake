/** "Matchday" banter — pure, read-only, no side effects.
 *  Uses the existing scorer to work out who did well, then writes a light,
 *  family-friendly line about the result.
 *
 *  IMPORTANT: the recap re-renders every couple of seconds (the room polls),
 *  so the wording must NOT be random per render or it would flicker. We seed
 *  the wording from the match id + score, so a given match always reads the
 *  same, but different matches/scorelines pull different lines — across a
 *  tournament you'll basically never see a repeat. */

import { scorePrediction } from "./predict"; // READ-ONLY use of the live scorer

/** Tiny stable hash of a string → non-negative integer. */
function seedFrom(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick(arr, seed) {
  return arr[seed % arr.length];
}

export function buildBanter(match, predictions) {
  const preds = predictions.filter((p) => p.match_id === match.id);
  const scored = preds
    .map((p) => ({ name: p.name, s: scorePrediction(match, p) }))
    .sort((a, b) => b.s - a.s || a.name.localeCompare(b.name));

  const hs = match.result_home;
  const as = match.result_away;
  const base = `${match.home} ${hs}–${as} ${match.away}`;
  const seed = seedFrom(`${match.id}|${hs}-${as}|${match.home}|${match.away}`);

  const winners = scored.filter((x) => x.s > 0);
  const top = winners[0] || null;
  const second = winners[1] || null;
  const cooked = scored.filter((x) => x.s === 0).map((x) => x.name);

  const parts = [];

  /* --- Headline --------------------------------------------------------- */
  const heads = [
    `${base} is in the books. ⚽`,
    `Full time: ${base}.`,
    `That’s a wrap — ${base}.`,
    `${base}, and that’s your lot.`,
    `The whistle’s gone: ${base}.`,
    `${base}. One for the family history books.`,
    `Job done — ${base}.`,
    `${base}. Hope you were watching.`,
    `Final score in: ${base}.`,
    `${base} — stick a fork in it.`,
  ];
  parts.push(pick(heads, seed));

  /* --- Top scorer ------------------------------------------------------- */
  if (top) {
    const big = [
      `🎯 ${top.name} absolutely called it (+${top.s}) — frame that one.`,
      `🎯 ${top.name} read it like a book (+${top.s}).`,
      `🔮 ${top.name} basically had the script (+${top.s}). Spooky.`,
      `👑 ${top.name} is living in the future (+${top.s}).`,
      `🎯 ${top.name} cleaned up with +${top.s}. Bow down.`,
    ];
    const mid = [
      `🎯 ${top.name} nailed it (+${top.s}).`,
      `✅ ${top.name} banked +${top.s} on that one.`,
      `📈 ${top.name} grabbed +${top.s} — tidy work.`,
      `🎯 ${top.name} cashed in for +${top.s}.`,
      `${top.name} top of the pile this round (+${top.s}).`,
    ];
    const small = [
      `${top.name} edged a couple this round (+${top.s}).`,
      `${top.name} nicked +${top.s} — every point counts.`,
      `${top.name} squeaked +${top.s} out of it.`,
      `${top.name} just about got on the board (+${top.s}).`,
    ];
    const tier = top.s >= 5 ? big : top.s >= 3 ? mid : small;
    parts.push(pick(tier, seed >> 3));
  }

  /* --- Runner-up / climber --------------------------------------------- */
  if (second) {
    const climbers = [
      `${second.name}’s climbing the table 📈 (+${second.s}).`,
      `${second.name} quietly banked +${second.s} too.`,
      `${second.name} is right on the heels with +${second.s}.`,
      `Don’t sleep on ${second.name} — +${second.s}.`,
      `${second.name} keeps it ticking over (+${second.s}).`,
      `${second.name} chipped in +${second.s} as well.`,
    ];
    parts.push(pick(climbers, seed >> 7));
  }

  /* --- Cooked / sympathy ------------------------------------------------ */
  if (cooked.length) {
    const one = cooked[0];
    const extra = cooked.length - 1;
    const many = extra > 0;
    const cookedLines = many
      ? [
          `Spare a thought for ${one} and ${extra} other${extra > 1 ? "s" : ""}, who got cooked. 💀`,
          `${one} & co. got cooked on that one. 💀`,
          `A rough night for ${one} and pals — properly cooked. 🥢`,
          `${one} leads a brave bunch who got cooked. 💀`,
          `${one} and friends will want a do-over — cooked. 😬`,
        ]
      : [
          `Spare a thought for ${one}, who got cooked. 💀`,
          `${one} got cooked on that one. 💀`,
          `Tough watch for ${one} — cooked. 🥢`,
          `${one} will want to forget that prediction — cooked. 💀`,
          `Chin up ${one}, that one cooked you. 😅`,
        ];
    parts.push(pick(cookedLines, seed >> 11));
  } else if (!top) {
    const blanks = [
      `Nobody saw that coming — a clean sweep of blanks. 😅`,
      `Not a single point handed out. Brutal. 😬`,
      `That result cooked the whole group. 💀`,
      `Zero points all round — the football gods are laughing. 🙃`,
      `Everyone whiffed that one. It happens. 🫠`,
    ];
    parts.push(pick(blanks, seed >> 11));
  }

  return { text: parts.join(" "), top, second, cooked, scored };
}
