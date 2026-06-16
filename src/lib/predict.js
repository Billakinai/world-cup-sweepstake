/** Predictions mini-game: flags, scoring, leaderboard. */

export const TEAM_FLAGS = {
  argentina: "🇦🇷", brazil: "🇧🇷", france: "🇫🇷", england: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", spain: "🇪🇸",
  germany: "🇩🇪", portugal: "🇵🇹", netherlands: "🇳🇱", belgium: "🇧🇪", croatia: "🇭🇷",
  uruguay: "🇺🇾", colombia: "🇨🇴", morocco: "🇲🇦", japan: "🇯🇵", usa: "🇺🇸",
  mexico: "🇲🇽", switzerland: "🇨🇭", senegal: "🇸🇳", "south korea": "🇰🇷", ecuador: "🇪🇨",
  austria: "🇦🇹", australia: "🇦🇺", iran: "🇮🇷", "türkiye": "🇹🇷", turkiye: "🇹🇷", turkey: "🇹🇷",
  scotland: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", norway: "🇳🇴", sweden: "🇸🇪", czechia: "🇨🇿", "czech republic": "🇨🇿",
  "bosnia & herzegovina": "🇧🇦", bosnia: "🇧🇦", canada: "🇨🇦", panama: "🇵🇦", haiti: "🇭🇹",
  "curaçao": "🇨🇼", curacao: "🇨🇼", paraguay: "🇵🇾", egypt: "🇪🇬", algeria: "🇩🇿",
  tunisia: "🇹🇳", "ivory coast": "🇨🇮", ghana: "🇬🇭", "south africa": "🇿🇦",
  "cape verde": "🇨🇻", "saudi arabia": "🇸🇦", qatar: "🇶🇦", uzbekistan: "🇺🇿",
  jordan: "🇯🇴", iraq: "🇮🇶", "dr congo": "🇨🇩", "new zealand": "🇳🇿",
};

const TEAM_ALIASES = {
  columbia: "colombia",
  bosnia: "bosnia & herzegovina",
  "bosnia and herzegovina": "bosnia & herzegovina",
  "czech republic": "czechia",
  turkey: "turkiye",
  "ivory coast": "ivory coast",
};

/** Normalise a team name: lowercase, strip accents, apply family-spelling aliases. */
export function canonTeam(name) {
  if (!name) return "";
  let t = name.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (TEAM_ALIASES[t]) t = TEAM_ALIASES[t];
  return t;
}

export function teamsMatch(a, b) {
  return canonTeam(a) !== "" && canonTeam(a) === canonTeam(b);
}

export function flagOf(team) {
  if (!team) return "🏳️";
  const c = canonTeam(team);
  for (const [k, v] of Object.entries(TEAM_FLAGS)) {
    if (canonTeam(k) === c) return v;
  }
  return "🏳️";
}

/**
 * Khala Naji's rules:
 *  - First goal minute: exact = 3, within ±1 minute = 2. ("No goals" correct = 3.)
 *  - Exact final score = 3.
 *  - Knockout games only: normal time / extra time / penalties correct = 1.
 */
export function matchWinner(match) {
  if (match.result_home == null || match.result_away == null) return null;
  const h = Number(match.result_home);
  const a = Number(match.result_away);
  if (h > a) return "home";
  if (h < a) return "away";
  // Scores level. A knockout can't end drawn — it was settled in extra time or
  // on penalties — so use the side the admin recorded as going through. Group
  // games genuinely can be draws.
  if (match.is_knockout && (match.winner_side === "home" || match.winner_side === "away")) {
    return match.winner_side;
  }
  return "draw";
}

/**
 * Itemised points for one prediction → [{ label, pts }], only the parts that
 * actually scored. This is the single source of truth: scorePrediction simply
 * sums it, and the UI shows the same parts, so a row's breakdown can never
 * disagree with its total. Each part is gated by its own question flag, so a
 * question turned off contributes nothing.
 */
export function scoreBreakdown(match, pred) {
  const parts = [];
  if (!match || !pred || match.status !== "scored") return parts;

  if (match.q_fg !== false) {
    if (match.fg_none) {
      if (pred.fg_none) parts.push({ label: "1st goal", pts: 3 });
    } else if (!pred.fg_none && pred.fg_minute != null && match.fg_minute != null) {
      const diff = Math.abs(Number(pred.fg_minute) - Number(match.fg_minute));
      if (diff === 0) parts.push({ label: "1st goal", pts: 3 });
      else if (diff === 1) parts.push({ label: "1st goal", pts: 2 });
    }
  }

  if (
    match.q_score !== false &&
    pred.home != null &&
    pred.away != null &&
    Number(pred.home) === Number(match.result_home) &&
    Number(pred.away) === Number(match.result_away)
  ) {
    parts.push({ label: "score", pts: 3 });
  }

  if (pred.winner && pred.winner === matchWinner(match)) {
    parts.push({ label: "winner", pts: 2 });
  }

  if (match.is_knockout && match.finish_type && pred.finish_type === match.finish_type) {
    parts.push({ label: "finish", pts: 1 });
  }

  return parts;
}

export function scorePrediction(match, pred) {
  return scoreBreakdown(match, pred).reduce((sum, part) => sum + part.pts, 0);
}

/** Overall totals across all scored matches → sorted [{name, points, played}] */
export function buildLeaderboard(matches, predictions) {
  const scored = matches.filter((m) => m.status === "scored");
  const totals = new Map();
  for (const m of scored) {
    for (const p of predictions.filter((x) => x.match_id === m.id)) {
      const cur = totals.get(p.name) || { name: p.name, points: 0, played: 0 };
      cur.points += scorePrediction(m, p);
      cur.played += 1;
      totals.set(p.name, cur);
    }
  }
  return [...totals.values()].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
}

export function kickedOff(match, now) {
  return now >= new Date(match.kickoff_at).getTime();
}

export function fmtCountdown(ms) {
  if (ms <= 0) return "now";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  const s = Math.floor((ms % 60000) / 1000);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function fmtKickoff(iso) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const FINISH_LABELS = { normal: "Normal time", extra: "Extra time", pens: "Penalties" };