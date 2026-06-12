import { useMemo, useState } from "react";
import {
  flagOf,
  scorePrediction,
  buildLeaderboard,
  kickedOff,
  fmtCountdown,
  fmtKickoff,
  FINISH_LABELS,
} from "../lib/predict";
import { addMatch, updateMatch, deleteMatch, addPrediction } from "../lib/db";
import { WC_FIXTURES } from "../lib/fixtures";

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function PredictTab({
  sweepstake,
  participants = [],
  matches,
  predictions,
  joinedName,
  adminUnlocked,
  adminOpen,
  now,
  refresh,
}) {
  const [forms, setForms] = useState({}); // matchId -> {minute, none, home, away, finish}
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [addOpen, setAddOpen] = useState(false);
  const [mHome, setMHome] = useState("");
  const [mAway, setMAway] = useState("");
  const [mKick, setMKick] = useState("");
  const [mKO, setMKO] = useState(false);
  const [addErr, setAddErr] = useState("");
  const [resultFor, setResultFor] = useState(null); // matchId being scored
  const [rHome, setRHome] = useState("");
  const [rAway, setRAway] = useState("");
  const [rFg, setRFg] = useState("");
  const [rNone, setRNone] = useState(false);
  const [rFinish, setRFinish] = useState("normal");
  const [resErr, setResErr] = useState("");
  const [copied, setCopied] = useState(false);
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const [showAllDone, setShowAllDone] = useState(false);
  const [loadingFixtures, setLoadingFixtures] = useState(false);

  const teams = useMemo(() => {
    const all = [...(sweepstake.big_teams || []), ...(sweepstake.lesser_teams || [])];
    return [...new Set(all)].sort((a, b) => a.localeCompare(b));
  }, [sweepstake]);

  const board = useMemo(() => buildLeaderboard(matches, predictions), [matches, predictions]);
  const nickFor = (name) => {
    const p = participants.find(
      (x) => x.name.trim().toLowerCase() === (name || "").trim().toLowerCase()
    );
    return p && p.nickname ? p.nickname : null;
  };
  const scoredMatches = matches.filter((m) => m.status === "scored");
  const lastScored = scoredMatches[scoredMatches.length - 1];
  const isAdmin = adminUnlocked && adminOpen;

  const { upcoming, inPlay, done } = useMemo(() => {
    return {
      upcoming: matches.filter((m) => m.status !== "scored" && !kickedOff(m, now)),
      inPlay: matches.filter((m) => m.status !== "scored" && kickedOff(m, now)),
      done: [...matches.filter((m) => m.status === "scored")].reverse(),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, now]);
  const upcomingShown = showAllUpcoming ? upcoming : upcoming.slice(0, 3);
  const doneShown = showAllDone ? done : done.slice(0, 3);
  const ordered = [...inPlay, ...upcomingShown];

  function form(mid) {
    return forms[mid] || { minute: "", none: false, home: "", away: "", finish: "" };
  }
  function setForm(mid, patch) {
    setForms((f) => ({ ...f, [mid]: { ...form(mid), ...patch } }));
  }

  async function lockIn(m) {
    const f = form(m.id);
    const errs = {};
    if (!f.none && (f.minute === "" || Number(f.minute) < 0 || Number(f.minute) > 130)) {
      errs[m.id] = "Enter the first-goal minute (or tap No goals).";
    } else if (f.home === "" || f.away === "" || Number(f.home) < 0 || Number(f.away) < 0) {
      errs[m.id] = "Enter the final score.";
    } else if (f.none && (Number(f.home) !== 0 || Number(f.away) !== 0)) {
      errs[m.id] = "No goals means the score must be 0-0!";
    } else if (m.is_knockout && !f.finish) {
      errs[m.id] = "Pick how the match ends.";
    }
    setErrors(errs);
    if (errs[m.id]) return;
    const summary = f.none
      ? `No goals (0-0)`
      : `First goal: ${f.minute}' · Score: ${m.home} ${f.home}-${f.away} ${m.away}`;
    if (!window.confirm(`Lock it in? No changes once it's in!\n\n${summary}`)) return;
    setBusy(true);
    try {
      await addPrediction(m.id, sweepstake.id, joinedName, {
        fg_minute: f.none ? null : Number(f.minute),
        fg_none: f.none,
        home: Number(f.home),
        away: Number(f.away),
        finish_type: m.is_knockout ? f.finish : null,
      });
      refresh();
    } catch {
      setErrors({ [m.id]: "Couldn't save — maybe you already predicted this one?" });
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function loadFixtures() {
    const have = new Set(matches.map((m) => `${m.home}|${m.away}`.toLowerCase()));
    const todo = WC_FIXTURES.filter(
      (f) =>
        new Date(f.kickoff).getTime() > Date.now() &&
        !have.has(`${f.home}|${f.away}`.toLowerCase())
    );
    if (todo.length === 0) {
      window.alert("All upcoming World Cup fixtures are already loaded ✅");
      return;
    }
    if (!window.confirm(`Add ${todo.length} upcoming World Cup group matches (UK kick-off times)?`)) return;
    setLoadingFixtures(true);
    try {
      for (const f of todo) {
        // eslint-disable-next-line no-await-in-loop
        await addMatch(sweepstake.id, {
          home: f.home,
          away: f.away,
          kickoff_at: new Date(f.kickoff).toISOString(),
          is_knockout: false,
        });
      }
      refresh();
    } finally {
      setLoadingFixtures(false);
    }
  }

  async function saveMatch() {
    setAddErr("");
    if (!mHome || !mAway) return setAddErr("Pick both teams.");
    if (mHome === mAway) return setAddErr("A team can't play itself 😄");
    if (!mKick) return setAddErr("Set the kickoff time.");
    setBusy(true);
    try {
      await addMatch(sweepstake.id, {
        home: mHome,
        away: mAway,
        kickoff_at: new Date(mKick).toISOString(),
        is_knockout: mKO,
      });
      setMHome(""); setMAway(""); setMKick(""); setMKO(false); setAddOpen(false);
      refresh();
    } catch {
      setAddErr("Couldn't add the match — try again.");
    } finally {
      setBusy(false);
    }
  }

  function openResult(m) {
    setResultFor(m.id);
    setRHome(m.result_home ?? "");
    setRAway(m.result_away ?? "");
    setRFg(m.fg_minute ?? "");
    setRNone(!!m.fg_none);
    setRFinish(m.finish_type || "normal");
    setResErr("");
  }

  async function saveResult(m) {
    setResErr("");
    if (rHome === "" || rAway === "") return setResErr("Enter the final score.");
    if (!rNone && rFg === "") return setResErr("Enter the first-goal minute (or tap No goals).");
    if (rNone && (Number(rHome) !== 0 || Number(rAway) !== 0)) return setResErr("No goals means 0-0!");
    setBusy(true);
    try {
      await updateMatch(m.id, {
        result_home: Number(rHome),
        result_away: Number(rAway),
        fg_minute: rNone ? null : Number(rFg),
        fg_none: rNone,
        finish_type: m.is_knockout ? rFinish : null,
        status: "scored",
      });
      setResultFor(null);
      refresh();
    } catch {
      setResErr("Couldn't save the result — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function removeMatch(m) {
    if (!window.confirm(`Delete ${m.home} v ${m.away}? All predictions for it go too.`)) return;
    await deleteMatch(m.id);
    refresh();
  }

  async function copyBoard() {
    const lines = board.map((r, i) => {
      const nick = nickFor(r.name);
      const rank = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
      return `${rank} ${r.name}${nick ? ` “${nick}”` : ""} — ${r.points} pts`;
    });
    if (await copyText(`🏆 Predictions leaderboard\n${lines.join("\n")}`)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const medal = (i) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`);

  const renderMatch = (m) => {
        const off = kickedOff(m, now);
        const mPreds = predictions.filter((p) => p.match_id === m.id);
        const mine = mPreds.find((p) => p.name.toLowerCase() === (joinedName || "").toLowerCase());
        const f = form(m.id);

        return (
          <section className={`card match-card ${m.status === "scored" ? "done" : ""}`} key={m.id}>
            <div className="match-head">
              <div className="match-team">
                <span className="match-flag">{flagOf(m.home)}</span>
                <span className="match-name">{m.home}</span>
              </div>
              <div className="match-mid">
                {m.status === "scored" ? (
                  <span className="match-score">{m.result_home}–{m.result_away}</span>
                ) : (
                  <span className="match-vs">vs</span>
                )}
              </div>
              <div className="match-team">
                <span className="match-flag">{flagOf(m.away)}</span>
                <span className="match-name">{m.away}</span>
              </div>
            </div>

            {m.status === "scored" ? (
              <>
                <p className="field-hint center">
                  {m.fg_none ? "No goals — 0-0 ✋" : `First goal: ${m.fg_minute}'`}
                  {m.is_knockout && m.finish_type ? ` · ${FINISH_LABELS[m.finish_type]}` : ""}
                </p>
                {mPreds.length > 0 ? (
                  <div className="pred-results">
                    {mPreds
                      .map((p) => ({ p, s: scorePrediction(m, p) }))
                      .sort((a, b) => b.s - a.s || a.p.name.localeCompare(b.p.name))
                      .map(({ p, s }) => (
                        <div className={`pred-row ${p.name === joinedName ? "me" : ""}`} key={p.id}>
                          <span className="pred-who">
                            <span className="pred-name">{p.name}</span>
                            {nickFor(p.name) && <span className="pred-nick">“{nickFor(p.name)}”</span>}
                          </span>
                          <span className="pred-pick">
                            {p.fg_none ? "0-0, no goals" : `${p.fg_minute}' · ${p.home}-${p.away}`}
                            {m.is_knockout && p.finish_type ? ` · ${FINISH_LABELS[p.finish_type]}` : ""}
                          </span>
                          <span className={`pred-pts ${s > 0 ? "got" : ""}`}>{s > 0 ? `+${s}` : "0"}</span>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="muted empty-state">Nobody predicted this one.</p>
                )}
              </>
            ) : off ? (
              <>
                <p className="lock-line">🔒 Locked — kicked off {fmtKickoff(m.kickoff_at)}</p>
                {mPreds.length > 0 ? (
                  <div className="pred-results">
                    {mPreds.map((p) => (
                      <div className={`pred-row ${p.name === joinedName ? "me" : ""}`} key={p.id}>
                        <span className="pred-who">
                          <span className="pred-name">{p.name}</span>
                          {nickFor(p.name) && <span className="pred-nick">“{nickFor(p.name)}”</span>}
                        </span>
                        <span className="pred-pick">
                          {p.fg_none ? "0-0, no goals" : `${p.fg_minute}' · ${p.home}-${p.away}`}
                          {m.is_knockout && p.finish_type ? ` · ${FINISH_LABELS[p.finish_type]}` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted empty-state">No predictions came in for this one.</p>
                )}
                <p className="field-hint center">Waiting for the result… points land here automatically.</p>
              </>
            ) : (
              <>
                <p className="lock-line ticking">⏱️ Locks in {fmtCountdown(new Date(m.kickoff_at).getTime() - now)} · {fmtKickoff(m.kickoff_at)}</p>
                {!joinedName ? (
                  <p className="field-hint center">Join with your name on the 🏠 Room tab to play.</p>
                ) : mine ? (
                  <div className="my-pred pop-in">
                    <span className="field-label">✅ You're in!</span>
                    <p className="my-pick">
                      {mine.fg_none ? "No goals (0-0)" : `First goal ${mine.fg_minute}' · ${m.home} ${mine.home}-${mine.away} ${m.away}`}
                      {m.is_knockout && mine.finish_type ? ` · ${FINISH_LABELS[mine.finish_type]}` : ""}
                    </p>
                    <p className="field-hint">Locked — no changes. {mPreds.length} prediction{mPreds.length === 1 ? "" : "s"} in 👀 (hidden until kickoff)</p>
                  </div>
                ) : (
                  <div className="pred-form">
                    <span className="q-label">1️⃣ Minute of the first goal?</span>
                    <div className="share-row">
                      <input
                        className="input"
                        type="number"
                        inputMode="numeric"
                        min="0"
                        max="130"
                        placeholder="e.g. 23"
                        value={f.none ? "" : f.minute}
                        disabled={f.none}
                        onChange={(e) => setForm(m.id, { minute: e.target.value })}
                      />
                      <button
                        className={`btn ${f.none ? "btn-primary" : "btn-ghost"}`}
                        onClick={() => setForm(m.id, { none: !f.none, minute: "", home: f.none ? f.home : "0", away: f.none ? f.away : "0" })}
                      >
                        No goals ✋
                      </button>
                    </div>
                    <span className="q-label">2️⃣ Final score?</span>
                    <div className="score-row">
                      <span className="score-team">{flagOf(m.home)} {m.home}</span>
                      <input className="input score-in" type="number" inputMode="numeric" min="0" max="20"
                        value={f.home} disabled={f.none}
                        onChange={(e) => setForm(m.id, { home: e.target.value })} />
                      <span className="score-dash">–</span>
                      <input className="input score-in" type="number" inputMode="numeric" min="0" max="20"
                        value={f.away} disabled={f.none}
                        onChange={(e) => setForm(m.id, { away: e.target.value })} />
                      <span className="score-team right">{m.away} {flagOf(m.away)}</span>
                    </div>
                    {m.is_knockout && (
                      <>
                        <span className="q-label">3️⃣ How does it end?</span>
                        <div className="finish-row">
                          {Object.entries(FINISH_LABELS).map(([k, label]) => (
                            <button key={k} className={`btn btn-small ${f.finish === k ? "btn-primary" : "btn-ghost"}`}
                              onClick={() => setForm(m.id, { finish: k })}>
                              {label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    {errors[m.id] && <p className="error">{errors[m.id]}</p>}
                    <button className="btn btn-gold btn-big" onClick={() => lockIn(m)} disabled={busy}>
                      Lock in my prediction ✅
                    </button>
                    <p className="field-hint center">One shot — no changes once it's in. {mPreds.length} in so far 👀</p>
                  </div>
                )}
              </>
            )}

            {isAdmin && m.status !== "scored" && (
              <div className="admin-match-row">
                {resultFor === m.id ? (
                  <div className="edit-panel">
                    <span className="field-label">Final result</span>
                    <div className="score-row">
                      <span className="score-team">{m.home}</span>
                      <input className="input score-in" type="number" inputMode="numeric" min="0" value={rHome} onChange={(e) => setRHome(e.target.value)} />
                      <span className="score-dash">–</span>
                      <input className="input score-in" type="number" inputMode="numeric" min="0" value={rAway} onChange={(e) => setRAway(e.target.value)} />
                      <span className="score-team right">{m.away}</span>
                    </div>
                    <div className="share-row">
                      <input className="input" type="number" inputMode="numeric" min="0" max="130" placeholder="First goal minute"
                        value={rNone ? "" : rFg} disabled={rNone} onChange={(e) => setRFg(e.target.value)} />
                      <button className={`btn ${rNone ? "btn-primary" : "btn-ghost"}`} onClick={() => setRNone(!rNone)}>No goals ✋</button>
                    </div>
                    {m.is_knockout && (
                      <div className="finish-row">
                        {Object.entries(FINISH_LABELS).map(([k, label]) => (
                          <button key={k} className={`btn btn-small ${rFinish === k ? "btn-primary" : "btn-ghost"}`} onClick={() => setRFinish(k)}>
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                    {resErr && <p className="error">{resErr}</p>}
                    <div className="share-row">
                      <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => saveResult(m)} disabled={busy}>
                        Save result & score everyone 🧮
                      </button>
                      <button className="btn btn-ghost" onClick={() => setResultFor(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="share-row">
                    <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => openResult(m)}>🧮 Enter result</button>
                    <button className="mini-btn danger" onClick={() => removeMatch(m)} title="Delete match">✕</button>
                  </div>
                )}
              </div>
            )}
            {isAdmin && m.status === "scored" && (
              <button className="link-btn" onClick={() => { openResult(m); updateMatch(m.id, { status: "upcoming" }).then(refresh); }}>
                ✏️ fix result
              </button>
            )}
          </section>
        );
  };

  return (
    <>
      {/* Leaderboard */}
      {board.length > 0 ? (
        <section className="card">
          <div className="players-head">
            <span className="field-label">🏆 Leaderboard</span>
            <button className="link-btn" onClick={copyBoard}>{copied ? "copied ✓" : "📋 copy"}</button>
          </div>
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
          {lastScored && (
            <p className="field-hint">
              Last match: {flagOf(lastScored.home)} {lastScored.result_home}–{lastScored.result_away} {flagOf(lastScored.away)}
              {" · top points: "}
              {(() => {
                const ps = predictions
                  .filter((p) => p.match_id === lastScored.id)
                  .map((p) => ({ n: p.name, s: scorePrediction(lastScored, p) }))
                  .sort((a, b) => b.s - a.s);
                const best = ps.filter((p) => p.s > 0 && p.s === ps[0]?.s).slice(0, 4);
                return best.length ? best.map((p) => `${p.n} +${p.s}`).join(", ") : "nobody scored 😅";
              })()}
            </p>
          )}
        </section>
      ) : (
        <section className="card center-card">
          <h2 className="card-title">🔮 Predictions</h2>
          <p className="muted">
            Guess the first-goal minute and the final score before each match kicks off.
            Exact minute = 3pts, one minute out = 2pts, exact score = 3pts. The leaderboard
            appears once the first match is scored.
          </p>
        </section>
      )}

      {/* Admin: add match */}
      {isAdmin && (
        <section className="card admin-card">
          {!addOpen ? (
            <div className="admin-actions">
              <button className="btn btn-primary btn-big" onClick={loadFixtures} disabled={loadingFixtures}>
                {loadingFixtures ? "Loading fixtures… ⏳" : "📅 Load World Cup fixtures"}
              </button>
              <button className="btn btn-ghost" onClick={() => setAddOpen(true)}>➕ Add a single match</button>
            </div>
          ) : (
            <div className="edit-panel">
              <span className="field-label">New match</span>
              <div className="share-row">
                <select className="input" value={mHome} onChange={(e) => setMHome(e.target.value)}>
                  <option value="">Home team…</option>
                  {teams.map((t) => <option key={t} value={t}>{flagOf(t)} {t}</option>)}
                </select>
                <select className="input" value={mAway} onChange={(e) => setMAway(e.target.value)}>
                  <option value="">Away team…</option>
                  {teams.map((t) => <option key={t} value={t}>{flagOf(t)} {t}</option>)}
                </select>
              </div>
              <label className="field">
                <span className="field-label">Kickoff</span>
                <input className="input" type="datetime-local" value={mKick} onChange={(e) => setMKick(e.target.value)} />
              </label>
              <label className="ko-row">
                <input type="checkbox" checked={mKO} onChange={(e) => setMKO(e.target.checked)} />
                <span>Knockout match (extra time/pens question, +1pt)</span>
              </label>
              {addErr && <p className="error">{addErr}</p>}
              <div className="share-row">
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={saveMatch} disabled={busy}>Add match</button>
                <button className="btn btn-ghost" onClick={() => setAddOpen(false)}>Cancel</button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Matches */}
      {matches.length === 0 && (
        <section className="card center-card">
          <p className="muted empty-state">No matches yet — the admin adds them here before each game. ⚽</p>
        </section>
      )}

      {ordered.map((m) => renderMatch(m))}

      {upcoming.length > 3 && (
        <button className="btn btn-ghost btn-big" onClick={() => setShowAllUpcoming(!showAllUpcoming)}>
          {showAllUpcoming ? "Hide the full schedule ⌃" : `📅 Show full schedule (${upcoming.length - 3} more matches) ⌄`}
        </button>
      )}

      {done.length > 0 && (
        <>
          <p className="section-label">✅ Finished matches</p>
          {doneShown.map((m) => renderMatch(m))}
          {done.length > 3 && (
            <button className="btn btn-ghost btn-big" onClick={() => setShowAllDone(!showAllDone)}>
              {showAllDone ? "Hide earlier results ⌃" : `Show earlier results (${done.length - 3} more) ⌄`}
            </button>
          )}
        </>
      )}
    </>
  );
}
