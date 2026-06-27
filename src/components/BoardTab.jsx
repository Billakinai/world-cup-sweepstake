import { useMemo, useState } from "react";
import { scorePrediction, buildLeaderboard } from "../lib/predict";
import { setParticipantBonus, addParticipant } from "../lib/db";
import Flag from "./Flag";

const shareSvg = (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
    strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 14V4" />
    <path d="m8.5 7.5 3.5-3.5 3.5 3.5" />
    <path d="M5 12v6.5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5V12" />
  </svg>
);

// Flip to true ONLY when you need to set/fix starting scores, then back to false.
// When true it still shows to the admin only.
const SHOW_STARTING_SCORES = false;

const STARTING_SCORES_SEED = `Zak 6
Farhaan 8
Tahaira 6
Naz 4
Moona 6
B REHMAN 8
Kash 6
Tahreem 6
Zish 4
Big J 4
Sadiya 4
Safiya 6
Inaaya 2
Aadam 4
Shamim 4
Javairia 4
Kalsoom 4
Bk 4
Aishah 2
Aliyah 2
E3ESR 2
Hashim 2
Imran 2
Shereen 2
Zakie 2
Mariam 0`;

/** Read "Name 13" / "🥇 Zak — 13 pts" lines → [{ name, bonus }]. */
function parseStartingScores(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/(\d+)\s*(?:pts?\.?)?\s*$/i);
    if (!m) continue;
    const bonus = parseInt(m[1], 10);
    const name = line
      .slice(0, m.index)
      .replace(/^[\s\d.)🥇🥈🥉]+/u, "")
      .replace(/[—–\-:]+\s*$/, "")
      .trim();
    if (name) out.push({ name, bonus });
  }
  return out;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function BoardTab({
  participants = [],
  matches,
  predictions,
  joinedName,
  isAdmin = false,
  sweepstakeId,
  refresh = () => {},
  onOpenRecap = () => {},
}) {
  const [copied, setCopied] = useState(false);
  const [seedOpen, setSeedOpen] = useState(false);
  const [seedText, setSeedText] = useState(STARTING_SCORES_SEED);
  const [seedBusy, setSeedBusy] = useState(false);
  const [seedMsg, setSeedMsg] = useState("");

  const scored = matches.filter((m) => m.status === "scored");
  const lastMatch = scored.length ? [...scored].reverse()[0] : null;

  const nickFor = (name) => {
    const p = participants.find(
      (x) => x.name.trim().toLowerCase() === (name || "").trim().toLowerCase()
    );
    return p && p.nickname ? p.nickname : null;
  };

  // Overall board: everyone who joined, even on 0 points. Each player's
  // starting/carry-over points (bonus_points) are added on top of what they've
  // earned from predictions, so a seeded leaderboard keeps growing live.
  const board = useMemo(() => {
    const totals = buildLeaderboard(matches, predictions);
    const map = new Map(totals.map((r) => [r.name.toLowerCase(), { ...r }]));
    for (const p of participants) {
      const key = p.name.toLowerCase();
      if (!map.has(key)) map.set(key, { name: p.name, points: 0, played: 0 });
    }
    for (const p of participants) {
      const bonus = Number(p.bonus_points) || 0;
      if (!bonus) continue;
      const row = map.get(p.name.toLowerCase());
      if (row) row.points += bonus;
    }
    return [...map.values()].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  }, [matches, predictions, participants]);

  // Standings as they were BEFORE the most recent result, so we can show ▲/▼
  // movement. Computed in memory from data we already have — no DB, no history.
  const prevBoard = useMemo(() => {
    const scoredSorted = matches
      .filter((m) => m.status === "scored")
      .sort((a, b) => new Date(a.kickoff_at) - new Date(b.kickoff_at));
    if (scoredSorted.length < 1) return null;
    const lastId = scoredSorted[scoredSorted.length - 1].id;
    const before = matches.map((m) => (m.id === lastId ? { ...m, status: "upcoming" } : m));
    const totals = buildLeaderboard(before, predictions);
    const map = new Map(totals.map((r) => [r.name.toLowerCase(), { ...r }]));
    for (const p of participants) {
      const k = p.name.toLowerCase();
      if (!map.has(k)) map.set(k, { name: p.name, points: 0 });
    }
    for (const p of participants) {
      const b = Number(p.bonus_points) || 0;
      const row = map.get(p.name.toLowerCase());
      if (row && b) row.points += b;
    }
    return [...map.values()]
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
      .map((r) => r.name.toLowerCase());
  }, [matches, predictions, participants]);

  const moveFor = (name, i) => {
    if (!prevBoard) return null;
    const was = prevBoard.indexOf(name.toLowerCase());
    if (was === -1 || was === i) return { dir: "same", txt: "–" };
    return was > i ? { dir: "up", txt: `▲${was - i}` } : { dir: "down", txt: `▼${i - was}` };
  };

  const lastScores = lastMatch
    ? predictions
        .filter((p) => p.match_id === lastMatch.id)
        .map((p) => ({ p, s: scorePrediction(lastMatch, p) }))
        .sort((a, b) => b.s - a.s || a.p.name.localeCompare(b.p.name))
    : [];
  const bestLast = lastScores.length && lastScores[0].s > 0 ? lastScores[0].s : 0;
  const lastWinners = lastScores.filter((x) => x.s > 0);

  // Rank badge: medals for the podium, then a medal ribbon for 4th/5th, numbers after.
  const rankBadge = (i) =>
    i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i === 3 ? "🏅" : i === 4 ? "🎖️" : `${i + 1}`;

  async function copyBoard() {
    const lines = board.map((r, i) => {
      const nick = nickFor(r.name);
      const badge = i <= 4 ? rankBadge(i) : `${i + 1}.`;
      return `${badge} ${r.name}${nick ? ` “${nick}”` : ""} — ${r.points} pts`;
    });
    if (await copyText(`🏆 Predictions leaderboard\n${lines.join("\n")}`)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  async function applyStartingScores() {
    const entries = parseStartingScores(seedText);
    if (!entries.length) {
      setSeedMsg("Couldn't read any names — use one per line, like “Zak 13”.");
      return;
    }
    setSeedBusy(true);
    setSeedMsg("");
    try {
      let updated = 0;
      let added = 0;
      for (const { name, bonus } of entries) {
        const existing = participants.find(
          (p) => p.name.trim().toLowerCase() === name.toLowerCase()
        );
        if (existing) {
          // eslint-disable-next-line no-await-in-loop
          await setParticipantBonus(existing.id, bonus);
          updated += 1;
        } else {
          // eslint-disable-next-line no-await-in-loop
          await addParticipant(sweepstakeId, name, null, "stand", bonus);
          added += 1;
        }
      }
      setSeedMsg(`Done — ${updated} updated, ${added} added.`);
      refresh();
    } catch {
      setSeedMsg("Couldn't save — the database may need the bonus_points column first.");
    } finally {
      setSeedBusy(false);
    }
  }

  return (
    <>
      {/* Last match spotlight */}
      {lastMatch ? (
        <section className="card last-card">
          <div className="last-head">
            <span className="last-label">Last result</span>
            <span className="last-fg">
              {lastMatch.q_fg !== false
                ? lastMatch.fg_none
                  ? "No goals ✋"
                  : `First goal ${lastMatch.fg_minute}'`
                : ""}
            </span>
          </div>
          <div className="last-score-row">
            <span className="last-flag"><Flag team={lastMatch.home} size={36} /></span>
            <span className="last-score">{lastMatch.result_home}–{lastMatch.result_away}</span>
            <span className="last-flag"><Flag team={lastMatch.away} size={36} /></span>
          </div>
          <p className="last-teams">{lastMatch.home} v {lastMatch.away}</p>
          {lastWinners.length > 0 ? (
            <div className="last-chips">
              {lastWinners.map(({ p, s }) => (
                <span className={`last-chip ${s === bestLast ? "top" : ""}`} key={p.id}>
                  {s === bestLast ? "🎯 " : ""}{p.name} +{s}
                </span>
              ))}
            </div>
          ) : (
            <p className="muted empty-state">Nobody scored on that one 😅</p>
          )}
          <button className="recap-open-btn" onClick={() => onOpenRecap(lastMatch)}>
            📣 See the full-time recap →
          </button>
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
          <button className="share-pill" onClick={copyBoard}>{shareSvg}{copied ? "Copied ✓" : "Share"}</button>
        </div>
        {board.length === 0 ? (
          <p className="muted empty-state">Join on the 🏠 Room tab to get on the board!</p>
        ) : (
          <div className="board">
            {board.map((r, i) => {
              const isMe = r.name === joinedName;
              const tier = isMe ? "me" : i === 0 ? "rank-1" : i <= 2 ? "rank-top" : "plain";
              const mv = moveFor(r.name, i);
              return (
                <div className={`board-row ${tier}`} key={r.name}>
                  <span className={`board-rank ${i > 4 ? "is-num" : ""}`}>{rankBadge(i)}</span>
                  <span className="board-who">
                    <span className="board-name">
                      {r.name}
                      {isMe && <span className="you-chip">you</span>}
                    </span>
                    {nickFor(r.name) && <span className="board-nick">“{nickFor(r.name)}”</span>}
                  </span>
                  {mv && <span className={`board-move ${mv.dir}`}>{mv.txt}</span>}
                  <span className="board-pts">{r.points}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Hidden by default. Set SHOW_STARTING_SCORES = true (top of file) to use; admin only. */}
      {SHOW_STARTING_SCORES && isAdmin && (
        <section className="card">
          <button className="link-btn" onClick={() => setSeedOpen((o) => !o)}>
            {seedOpen ? "▾" : "▸"} ⚙️ Set starting scores
          </button>
          {seedOpen && (
            <>
              <p className="field-hint">
                One person per line: name then points (e.g. “Zak 13”). Existing names get updated; new
                names are added. Future match points add on top automatically.
              </p>
              <textarea
                className="input textarea"
                rows={10}
                value={seedText}
                onChange={(e) => setSeedText(e.target.value)}
              />
              {seedMsg && <p className="field-hint">{seedMsg}</p>}
              <button className="btn btn-primary" onClick={applyStartingScores} disabled={seedBusy}>
                {seedBusy ? "Saving…" : "Apply starting scores"}
              </button>
            </>
          )}
        </section>
      )}
    </>
  );
}