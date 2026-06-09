/* ---------------------------------------------------------------------------
 * Draw rules, team presets and small helpers.
 * ------------------------------------------------------------------------- */

export const DEFAULT_NAME = "Family World Cup Sweepstake";

export const PRESET_BIG_TEAMS = [
  "Argentina", "Brazil", "France", "England", "Spain", "Germany", "Portugal",
  "Netherlands", "Belgium", "Croatia", "Uruguay", "Colombia", "Morocco",
  "Japan", "USA", "Mexico",
];

export const PRESET_LESSER_TEAMS = [
  "Uzbekistan", "Panama", "Jordan", "New Zealand", "Qatar", "Saudi Arabia",
  "Iraq", "South Africa", "Tunisia", "Algeria", "Egypt", "Bolivia",
  "Paraguay", "Scotland", "Norway", "Sweden", "Türkiye", "Czech Republic",
  "Haiti", "Cape Verde", "Curaçao", "Canada", "Australia", "South Korea",
  "Iran", "Ecuador", "Peru", "Chile", "Austria",
];

export const FUN_LINES = [
  "Someone just became an Uzbekistan ultra.",
  "Family WhatsApp pressure activated.",
  "VAR is checking this draw.",
  "Underdog loyalty unlocked.",
  "One favourite. One emotional damage team.",
  "New flag in the bio incoming.",
  "Scenes when these two meet in the final.",
  "Group-stage heartbreak loading…",
  "That's a brave shirt to buy.",
  "The pundits did not see this coming.",
];

export function parseTeams(text) {
  return [...new Set(
    text
      .split(/\r?\n|,/)
      .map((t) => t.trim())
      .filter(Boolean)
  )];
}

export function validateDraw(participants, bigTeams, lesserTeams) {
  const errors = [];
  if (participants.length === 0) {
    errors.push("Nobody has joined yet. Share the invite link first.");
  }
  if (participants.length > bigTeams.length) {
    errors.push(
      `There are ${participants.length} players but only ${bigTeams.length} favourite teams. Add more favourites before drawing.`
    );
  }
  if (participants.length > lesserTeams.length) {
    errors.push(
      `There are ${participants.length} players but only ${lesserTeams.length} underdog teams. Add more underdogs before drawing.`
    );
  }
  const bigSet = new Set(bigTeams.map((t) => t.toLowerCase()));
  const overlap = lesserTeams.filter((t) => bigSet.has(t.toLowerCase()));
  if (overlap.length > 0) {
    errors.push(`These teams appear in both lists: ${overlap.join(", ")}. Each team can only be in one list.`);
  }
  return errors;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Fair assignment: every participant gets exactly one favourite and one
 * underdog, no team is used twice. Returns rows ready for the results table.
 */
export function runDraw(participants, bigTeams, lesserTeams) {
  const order = shuffle(participants);
  const bigs = shuffle(bigTeams);
  const lessers = shuffle(lesserTeams);
  return order.map((p, i) => ({
    participant_id: p.id,
    player_name: p.name,
    nickname: p.nickname || null,
    big_team: bigs[i],
    lesser_team: lessers[i],
    draw_order: i + 1,
  }));
}

export function resultsToCsv(results) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = ["Draw order", "Name", "Nickname", "Star team", "Underdog team"];
  const lines = [header.map(esc).join(",")];
  for (const r of results) {
    lines.push([r.draw_order, r.player_name, r.nickname || "", r.big_team, r.lesser_team].map(esc).join(","));
  }
  return lines.join("\n");
}

export function pickFunLine(i) {
  return FUN_LINES[i % FUN_LINES.length];
}

export const HYPE_LINES = [
  "Warming up the wheels…",
  "Polishing the trophy…",
  "Pumping up the match balls…",
  "Painting the pitch lines…",
  "The mascot is doing keepy-uppies…",
  "Checking everyone's studs…",
  "Cutting the half-time oranges…",
  "Floodlights at full power…",
];

export const CHIP_COLORS = ["#ff3d7f", "#2db5e2", "#5b2fd1", "#19d97c", "#ff6a3d", "#e2a52d", "#e23d5b", "#3a6cff"];

export const FUNNY_NICKNAMES = [
  "Top Bins Specialist", "Nutmeg Ninja", "VAR's Worst Nightmare", "The Golazo Machine",
  "Sunday League Legend", "Captain Chaos", "The Super Sub", "Worldie Merchant",
  "Fergie Time Specialist", "The Offside Trap", "Panenka Pro", "Tekkers Titan",
  "The Magic Sponge", "Hat-Trick Pending", "The Rabona", "Extra-Time Hero",
  "Crossbar Challenge Champ", "The False 9", "Keepy-Uppy Machine", "The Gaffer",
  "Squad Rotation Victim", "The Diving Header", "Agent of Chaos", "The Wall",
  "Stoppage Time Menace", "The Bicycle Kick", "Half-Time Orange Thief", "The Long Throw",
  "Set-Piece Wizard", "The Wind-Up Merchant",
];

/** Pick a funny nickname nobody in this room has yet. */
export function pickNickname(taken = []) {
  const used = new Set(taken.filter(Boolean).map((n) => n.toLowerCase()));
  const free = FUNNY_NICKNAMES.filter((n) => !used.has(n.toLowerCase()));
  const pool = free.length ? free : FUNNY_NICKNAMES;
  return pool[Math.floor(Math.random() * pool.length)];
}
