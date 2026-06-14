import { useMemo, useState } from "react";
import { flagOf, scorePrediction, buildLeaderboard } from "../lib/predict";

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function BoardTab({ participants = [], matches, predictions, joinedName }) {
  const [copied, setCopied] = useState(false);

  const scored = matches.filter((m) => m.status === "scored");
  const lastMatch = scored.length ? [...scored].reverse()[0] : null;

  const nickFor = (name) => {
    const p = participants.find(
      (x) => x.name.trim().toLowerCase() === (name || "").trim().toLowerCase()
    );
    return p && p.nickname ? p.nickname : null;
  };

  // Overall board: everyone who joined, even on 0 points
  const board = useMemo(() => {
    const totals = buildLeaderboard(matches, predictions);
    const map = new Map(totals.map((r) => [r.name.toLowerCase(), r]));
    for (const p of participants) {
      if (!map.has(p.name.toLowerCase())) {
        map.set(p.name.toLowerCase(), { name: p.name, points: 0, played: 0 });
      }
    }
    return [...map.values()].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  }, [matches, predictions, participants]);

  const lastScores = lastMatch
    ? predictions
        .filter((p) => p.match_id === lastMatch.id)
        .map((p) => ({ p, s: scorePrediction(lastMatch, p) }))
        .sort((a, b) => b.s - a.s || a.p.name.localeCompare(b.p.name))
    : [];
  const bestLast = lastScores.length && lastScores[0].s > 0 ? lastScores[0].s : 0;
  const lastWinners = lastScores.filter((x) => x.s > 0);

  const medal = (i) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`);

  async function copyBoard() {
    const lines = board.map((r, i) => {
      const nick = nickFor(r.name);
      return `${i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`} ${r.name}${nick ? ` “${nick}”` : ""} — ${r.points} pts`;
    });
    if (await copyText(`🏆 Predictions leaderboard\n${lines.join("\n")}`)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <>
      {/* Last match spotlight */}
      {lastMatch ? (
        <section className="card last-card">
          <span className="field-label">🔥 Last match</span>
          <div className="last-score-row">
            <span className="last-flag">{flagOf(lastMatch.home)}</span>
            <span className="last-score">{lastMatch.result_home}–{lastMatch.result_away}</span>
            <span className="last-flag">{flagOf(lastMatch.away)}</span>
          </div>
          <p className="field-hint center">
            {lastMatch.home} v {lastMatch.away}
            {lastMatch.q_fg !== false
              ? lastMatch.fg_none
                ? " · no goals ✋"
                : ` · first goal ${lastMatch.fg_minute}'`
              : ""}
          </p>
          {lastWinners.length > 0 ? (
            <div className="board">
              {lastWinners.map(({ p, s }) => (
                <div className={`board-row winner ${p.name === joinedName ? "me" : ""}`} key={p.id}>
                  <span className="board-rank">🎯</span>
                  <span className="board-who">
                    <span className="board-name">{p.name}</span>
                    {nickFor(p.name) && <span className="board-nick">“{nickFor(p.name)}”</span>}
                  </span>
                  <span className="board-pts">+{s}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted empty-state">Nobody scored on that one 😅</p>
          )}
        </section>
      ) : (
        <section className="card center-card">
          <h2 className="card-title">🏆 Leaderboard</h2>
          <p className="muted">Points appear here the moment the first result goes in. Everyone starts on 0 — it's anyone's World Cup.</p>
        </section>
      )}

      {/* Overall */}
      <section className="card">
        <div className="players-head">
          <span className="field-label">🏆 Overall standings</span>
          <button className="link-btn" onClick={copyBoard}>{copied ? "copied ✓" : "📋 copy"}</button>
        </div>
        {board.length === 0 ? (
          <p className="muted empty-state">Join on the 🏠 Room tab to get on the board!</p>
        ) : (
          <div className="board">
            {board.map((r, i) => (
              <div className={`board-row ${r.name === joinedName ? "me" : ""}`} key={r.name}>
                <span className="board-rank">{medal(i)}</span>
                <span className="board-who">
                  <span className="board-name">{r.name}</span>
                  {nickFor(r.name) && <span className="board-nick">“{nickFor(r.name)}”</span>}
                </span>
                <span className="board-pts">{r.points} pts</span>
              </div>
            ))}
          </div>
        )}
        <p className="field-hint center">Updates live on every phone the second a result is entered.</p>
      </section>
    </>
  );
}