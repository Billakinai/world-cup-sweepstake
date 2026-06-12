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

export function flagOf(team) {
  if (!team) return "🏳️";
  return TEAM_FLAGS[team.trim().toLowerCase()] || "🏳️";
}

/**
 * Khala Naji's rules:
 *  - First goal minute: exact = 3, within ±1 minute = 2. ("No goals" correct = 3.)
 *  - Exact final score = 3.
 *  - Knockout games only: normal time / extra time / penalties correct = 1.
 */
export function matchWinner(match) {
  if (match.result_home == null || match.result_away == null) return null;
  if (Number(match.result_home) > Number(match.result_away)) return "home";
  if (Number(match.result_home) < Number(match.result_away)) return "away";
  return "draw";
}

export function scorePrediction(match, pred) {
  if (!match || !pred || match.status !== "scored") return 0;
  let pts = 0;
  if (match.q_fg !== false) {
    if (match.fg_none) {
      if (pred.fg_none) pts += 3;
    } else if (!pred.fg_none && pred.fg_minute != null && match.fg_minute != null) {
      const diff = Math.abs(Number(pred.fg_minute) - Number(match.fg_minute));
      if (diff === 0) pts += 3;
      else if (diff === 1) pts += 2;
    }
  }
  if (
    match.q_score !== false &&
    pred.home != null &&
    pred.away != null &&
    Number(pred.home) === Number(match.result_home) &&
    Number(pred.away) === Number(match.result_away)
  ) {
    pts += 3;
  }
  if (match.q_winner === true && pred.winner && pred.winner === matchWinner(match)) {
    pts += 2;
  }
  if (match.is_knockout && match.finish_type && pred.finish_type === match.finish_type) {
    pts += 1;
  }
  return pts;
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
