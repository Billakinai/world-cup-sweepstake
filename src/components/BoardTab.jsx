import { useMemo, useState } from "react";
import { flagOf, scorePrediction, buildLeaderboard } from "../lib/predict";
import { setParticipantBonus, addParticipant } from "../lib/db";

const STARTING_SCORES_SEED = `Zak 6
Farhaan 10
Tahaira 12
Naz 9
Moona 6
B REHMAN 10
Kash 8
Tahreem 8
Zish 4
Big J 7
Sadiya 7
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
    let name = line
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
          // New names join as spectators ("stand") so they never affect the wheel draw.
          // eslint-disable-next-line no-await-in-loop
          await addParticipant(sweepstakeId, name, null, "stand", bonus);
          added += 1;
        }
      }
      setSeedMsg(`Done — ${updated} updated, ${added} added. Starting scores are live for everyone.`);
      refresh();
    } catch {
      setSeedMsg("Couldn't save — your database probably needs the one-time update first (ask for the SQL line).");
    } finally {
      setSeedBusy(false);
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

      {/* Admin: seed an existing leaderboard. Future match points add on top. */}
      {isAdmin && (
        <section className="card">
          <button className="link-btn" onClick={() => setSeedOpen((o) => !o)}>
            {seedOpen ? "▾" : "▸"} ⚙️ Set starting scores
          </button>
          {seedOpen && (
            <>
              <p className="field-hint">
                One person per line: name then their current points (e.g. “Zak 13”). Names already in the
                room get updated; new names are added as spectators. Points you score from future matches
                add on top automatically.
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