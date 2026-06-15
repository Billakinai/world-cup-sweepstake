import { useMemo, useState } from "react";
import {
  flagOf,
  teamsMatch,
  scorePrediction,
  scoreBreakdown,
  matchWinner,
  kickedOff,
  fmtCountdown,
  fmtKickoff,
  FINISH_LABELS,
} from "../lib/predict";
import { addMatch, updateMatch, deleteMatch, addPrediction } from "../lib/db";
import { WC_FIXTURES } from "../lib/fixtures";

function fmtShort(iso) {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

export default function PredictTab({
  sweepstake,
  participants = [],
  drawResults = [],
  matches,
  predictions,
  joinedName,
  adminUnlocked,
  onAdminUnlock,
  now,
  refresh,
}) {
  const [forms, setForms] = useState({});
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [rulesOpen, setRulesOpen] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const [showAllDone, setShowAllDone] = useState(false);
  // Admin
  const [panelOpen, setPanelOpen] = useState(false);
  const [pinTry, setPinTry] = useState("");
  const [pinErr, setPinErr] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [mHome, setMHome] = useState("");
  const [mAway, setMAway] = useState("");
  const [mKick, setMKick] = useState("");
  const [mKO, setMKO] = useState(false);
  const [addErr, setAddErr] = useState("");
  const [loadingFixtures, setLoadingFixtures] = useState(false);
  const [resultFor, setResultFor] = useState(null);
  const [rHome, setRHome] = useState("");
  const [rAway, setRAway] = useState("");
  const [rFg, setRFg] = useState("");
  const [rNone, setRNone] = useState(false);
  const [rFinish, setRFinish] = useState("normal");
  const [rWinner, setRWinner] = useState("");
  const [resErr, setResErr] = useState("");

  const isAdmin = adminUnlocked && panelOpen;

  const teams = useMemo(() => {
    const all = [...(sweepstake.big_teams || []), ...(sweepstake.lesser_teams || [])];
    return [...new Set(all)].sort((a, b) => a.localeCompare(b));
  }, [sweepstake]);

  const nickFor = (name) => {
    const p = participants.find(
      (x) => x.name.trim().toLowerCase() === (name || "").trim().toLowerCase()
    );
    return p && p.nickname ? p.nickname : null;
  };

  /** Sweepstake owners of a team: [{name, icon}] */
  const ownersOf = (team) =>
    drawResults
      .filter((r) => teamsMatch(r.big_team, team) || teamsMatch(r.lesser_team, team))
      .map((r) => ({ name: r.player_name, icon: teamsMatch(r.big_team, team) ? "⭐" : "🐺" }));

  const isMine = (m) =>
    Boolean(joinedName) &&
    [...ownersOf(m.home), ...ownersOf(m.away)].some(
      (o) => o.name.toLowerCase() === joinedName.toLowerCase()
    );

  const { upcoming, inPlay, done } = useMemo(() => {
    return {
      upcoming: matches.filter((m) => m.status !== "scored" && !kickedOff(m, now)),
      inPlay: matches.filter((m) => m.status !== "scored" && kickedOff(m, now)),
      done: [...matches.filter((m) => m.status === "scored")].reverse(),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, now]);

  const hero = upcoming[0] || null;
  const restUpcoming = upcoming.slice(1);
  const schedShown = showAllUpcoming ? restUpcoming : restUpcoming.slice(0, 5);
  const latestDone = done[0] || null;
  const earlierDone = done.slice(1);
  const doneShown = showAllDone ? earlierDone : [];

  // Rules card reflects what's actually being asked. Before any match exists we
  // explain the full game; once matches are in, we scope to the live ones.
  const ruleScope = matches.filter((m) => m.status !== "scored");
  const scope = ruleScope.length ? ruleScope : matches;
  const noMatches = matches.length === 0;
  const showFgRule = noMatches || scope.some((m) => m.q_fg !== false);
  const showScoreRule = noMatches || scope.some((m) => m.q_score !== false);
  const showWinnerRule = noMatches || scope.some((m) => m.q_winner === true);
  const showKoRule = !noMatches && scope.some((m) => m.is_knockout);

  function form(mid) {
    return forms[mid] || { minute: "", none: false, home: "", away: "", winner: "", finish: "" };
  }
  function setForm(mid, patch) {
    setForms((f) => ({ ...f, [mid]: { ...form(mid), ...patch } }));
  }

  /** Toggle "No goals" without throwing away what the player already typed. */
  function toggleNoGoals(mid) {
    const f = form(mid);
    if (!f.none) {
      setForm(mid, { none: true, _saved: { minute: f.minute, home: f.home, away: f.away }, home: "0", away: "0" });
    } else {
      const s = f._saved || {};
      setForm(mid, { none: false, minute: s.minute ?? "", home: s.home ?? "", away: s.away ?? "" });
    }
  }

  /** "1st goal +3 · score +3" — only the parts that actually scored. */
  const breakdownText = (m, p) =>
    scoreBreakdown(m, p).map((x) => `${x.label} +${x.pts}`).join(" · ");

  /* ----------------------------- Actions --------------------------------- */

  async function lockIn(m) {
    const f = form(m.id);
    const errs = {};
    const askFg = m.q_fg !== false;
    const askScore = m.q_score !== false;
    const askWinner = m.q_winner === true;
    if (askFg && !f.none && (f.minute === "" || Number(f.minute) < 0 || Number(f.minute) > 130)) {
      errs[m.id] = "Enter the first-goal minute (or tap No goals).";
    } else if (askScore && (f.home === "" || f.away === "" || Number(f.home) < 0 || Number(f.away) < 0)) {
      errs[m.id] = "Enter the final score.";
    } else if (askScore && f.none && (Number(f.home) !== 0 || Number(f.away) !== 0)) {
      errs[m.id] = "No goals means the score must be 0-0!";
    } else if (askWinner && !f.winner) {
      errs[m.id] = "Pick who wins (or draw).";
    } else if (m.is_knockout && !f.finish) {
      errs[m.id] = "Pick how the match ends.";
    }
    setErrors(errs);
    if (errs[m.id]) return;
    const bits = [];
    if (askFg) bits.push(f.none ? "No goals" : `First goal ${f.minute}'`);
    if (askScore) bits.push(`${m.home} ${f.home}-${f.away} ${m.away}`);
    if (askWinner) bits.push(f.winner === "draw" ? "Draw" : `${f.winner === "home" ? m.home : m.away} to win`);
    if (!window.confirm(`Lock it in? No changes once it's in!\n\n${bits.join(" · ")}`)) return;
    setBusy(true);
    try {
      await addPrediction(m.id, sweepstake.id, joinedName, {
        fg_minute: !askFg || f.none ? null : Number(f.minute),
        fg_none: askFg ? f.none : false,
        home: askScore && f.home !== "" ? Number(f.home) : 0,
        away: askScore && f.away !== "" ? Number(f.away) : 0,
        winner: askWinner ? f.winner : null,
        finish_type: m.is_knockout ? f.finish : null,
      });
      setExpandedId(null);
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
      (f) => new Date(f.kickoff).getTime() > Date.now() && !have.has(`${f.home}|${f.away}`.toLowerCase())
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
        home: mHome, away: mAway,
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

  async function toggleQuestion(m, key) {
    await updateMatch(m.id, { [key]: !(key === "q_winner" ? m.q_winner === true : m[key] !== false) });
    refresh();
  }

  async function applyQuestionsToAll(m) {
    const targets = upcoming.filter(
      (x) => x.id !== m.id && !predictions.some((p) => p.match_id === x.id)
    );
    if (targets.length === 0) {
      window.alert("No other upcoming matches to update — the rest either have predictions in already or there aren't any.");
      return;
    }
    if (!window.confirm(`Use this match's questions for ${targets.length} other upcoming match${targets.length === 1 ? "" : "es"}? (Any match that already has predictions is left untouched.)`)) return;
    setBusy(true);
    try {
      for (const x of targets) {
        // eslint-disable-next-line no-await-in-loop
        await updateMatch(x.id, {
          q_fg: m.q_fg !== false,
          q_score: m.q_score !== false,
          q_winner: m.q_winner === true,
        });
      }
      refresh();
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
    setRWinner(m.winner_side || "");
    setResErr("");
  }

  async function saveResult(m) {
    setResErr("");
    if (rHome === "" || rAway === "") return setResErr("Enter the final score.");
    if (m.q_fg !== false && !rNone && rFg === "") return setResErr("Enter the first-goal minute (or tap No goals).");
    if (rNone && (Number(rHome) !== 0 || Number(rAway) !== 0)) return setResErr("No goals means 0-0!");
    const levelKO = m.is_knockout && Number(rHome) === Number(rAway);
    if (levelKO && !rWinner) return setResErr("This knockout is level — pick who went through (extra time / pens).");
    setBusy(true);
    try {
      const patch = {
        result_home: Number(rHome),
        result_away: Number(rAway),
        fg_minute: rNone || rFg === "" ? null : Number(rFg),
        fg_none: rNone,
        finish_type: m.is_knockout ? rFinish : null,
        winner_side: levelKO ? rWinner : null,
        status: "scored",
      };
      try {
        await updateMatch(m.id, patch);
      } catch {
        // winner_side column may not exist on older databases — save without it.
        const { winner_side, ...basic } = patch;
        await updateMatch(m.id, basic);
      }
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

  /* ----------------------------- Pieces ----------------------------------- */

  const ownershipLine = (m) => {
    const oh = ownersOf(m.home);
    const oa = ownersOf(m.away);
    if (oh.length === 0 && oa.length === 0) return null;
    const fmt = (team, os) =>
      os.length ? `${team}: ${os.map((o) => `${o.name} ${o.icon}`).join(", ")}` : null;
    return [fmt(m.home, oh), fmt(m.away, oa)].filter(Boolean).join("  ·  ");
  };

  const verdictLines = (m) => {
    const w = matchWinner(m);
    if (!w) return [];
    const lines = [];
    const oh = ownersOf(m.home);
    const oa = ownersOf(m.away);
    if (w === "draw") {
      [...oh.map((o) => ({ o, t: m.home })), ...oa.map((o) => ({ o, t: m.away }))].forEach(({ o, t }) =>
        lines.push({ text: `🤝 ${o.name}'s team (${t}) drew`, kind: "draw" })
      );
    } else {
      const winT = w === "home" ? m.home : m.away;
      const loseT = w === "home" ? m.away : m.home;
      (w === "home" ? oh : oa).forEach((o) => lines.push({ text: `🎉 ${o.name}'s team (${winT}) WON!`, kind: "win" }));
      (w === "home" ? oa : oh).forEach((o) => lines.push({ text: `😬 ${o.name}'s team (${loseT}) lost`, kind: "lose" }));
    }
    return lines;
  };

  const myPickText = (m, p) => {
    const bits = [];
    if (m.q_fg !== false) bits.push(p.fg_none ? "No goals (0-0)" : `First goal ${p.fg_minute}'`);
    if (m.q_score !== false) bits.push(`${p.home}-${p.away}`);
    if (m.q_winner === true && p.winner)
      bits.push(p.winner === "draw" ? "Draw" : `${p.winner === "home" ? m.home : m.away} to win`);
    if (m.is_knockout && p.finish_type) bits.push(FINISH_LABELS[p.finish_type]);
    return bits.join(" · ");
  };

  function renderAdminTools(m) {
    if (!isAdmin || m.status === "scored") return null;
    const hasPreds = predictions.some((p) => p.match_id === m.id);
    return (
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
            {m.q_fg !== false && (
              <div className="share-row">
                <input className="input" type="number" inputMode="numeric" min="0" max="130" placeholder="First goal minute"
                  value={rNone ? "" : rFg} disabled={rNone} onChange={(e) => setRFg(e.target.value)} />
                <button className={`btn ${rNone ? "btn-primary" : "btn-ghost"}`} onClick={() => setRNone(!rNone)}>No goals ✋</button>
              </div>
            )}
            {m.is_knockout && (
              <div className="finish-row">
                {Object.entries(FINISH_LABELS).map(([k, label]) => (
                  <button key={k} className={`btn btn-small ${rFinish === k ? "btn-primary" : "btn-ghost"}`} onClick={() => setRFinish(k)}>
                    {label}
                  </button>
                ))}
              </div>
            )}
            {m.is_knockout && rHome !== "" && rAway !== "" && Number(rHome) === Number(rAway) && (
              <>
                <span className="field-label">Who went through? <span className="optional">— extra time / pens</span></span>
                <div className="finish-row">
                  <button className={`btn btn-small ${rWinner === "home" ? "btn-primary" : "btn-ghost"}`} onClick={() => setRWinner("home")}>
                    {flagOf(m.home)} {m.home}
                  </button>
                  <button className={`btn btn-small ${rWinner === "away" ? "btn-primary" : "btn-ghost"}`} onClick={() => setRWinner("away")}>
                    {flagOf(m.away)} {m.away}
                  </button>
                </div>
              </>
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
          <>
            <div className="q-toggle-row">
              <span className="q-toggle-label">Questions:</span>
              <button className={`q-chip ${m.q_fg !== false ? "on" : ""}`} disabled={hasPreds} onClick={() => toggleQuestion(m, "q_fg")}>⏱️ 1st goal</button>
              <button className={`q-chip ${m.q_score !== false ? "on" : ""}`} disabled={hasPreds} onClick={() => toggleQuestion(m, "q_score")}>🔢 Score</button>
              <button className={`q-chip ${m.q_winner === true ? "on" : ""}`} disabled={hasPreds} onClick={() => toggleQuestion(m, "q_winner")}>🏆 Winner</button>
            </div>
            {hasPreds ? (
              <p className="field-hint">🔒 Questions are locked — predictions are already in for this match, so changing them would be unfair.</p>
            ) : (
              <button className="link-btn" onClick={() => applyQuestionsToAll(m)}>apply these questions to all upcoming</button>
            )}
            <div className="share-row">
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => openResult(m)}>🧮 Enter result</button>
              <button className="mini-btn danger" onClick={() => removeMatch(m)} title="Delete match">✕</button>
            </div>
          </>
        )}
      </div>
    );
  }

  function renderMatchCard(m, big = false) {
    const off = kickedOff(m, now);
    const mPreds = predictions.filter((p) => p.match_id === m.id);
    const mine = mPreds.find((p) => p.name.toLowerCase() === (joinedName || "").toLowerCase());
    const f = form(m.id);
    const owners = ownershipLine(m);
    const askFg = m.q_fg !== false;
    const askScore = m.q_score !== false;
    const askWinner = m.q_winner === true;

    return (
      <section className={`card match-card ${big ? "hero-match" : ""} ${m.status === "scored" ? "done" : ""}`} key={m.id}>
        {big && !off && m.status !== "scored" && <p className="next-kicker">⚡ NEXT MATCH</p>}
        {isMine(m) && m.status !== "scored" && <p className="mine-banner">🔥 Your team is playing!</p>}
        <div className="match-head">
          <div className="match-team">
            <span className={`match-flag ${big ? "xl" : ""}`}>{flagOf(m.home)}</span>
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
            <span className={`match-flag ${big ? "xl" : ""}`}>{flagOf(m.away)}</span>
            <span className="match-name">{m.away}</span>
          </div>
        </div>
        {owners && <p className="owners-line">{owners}</p>}

        {m.status === "scored" ? (
          <>
            <p className="field-hint center">
              {m.q_fg !== false ? (m.fg_none ? "No goals — 0-0 ✋" : `First goal: ${m.fg_minute}'`) : ""}
              {m.is_knockout && m.finish_type ? ` · ${FINISH_LABELS[m.finish_type]}` : ""}
            </p>
            {verdictLines(m).length > 0 && (
              <div className="verdicts">
                {verdictLines(m).map((v, i) => (
                  <p className={`verdict-line ${v.kind}`} key={i}>{v.text}</p>
                ))}
              </div>
            )}
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
                        {myPickText(m, p)}
                        {s > 0 && <span className="pred-breakdown">{breakdownText(m, p)}</span>}
                      </span>
                      <span className={`pred-pts ${s > 0 ? "got" : ""}`}>{s > 0 ? `+${s}` : "0"}</span>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="muted empty-state">Nobody predicted this one.</p>
            )}
            {isAdmin && (
              <button className="link-btn" onClick={() => { openResult(m); updateMatch(m.id, { status: "upcoming" }).then(refresh); }}>
                ✏️ fix result
              </button>
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
                    <span className="pred-pick">{myPickText(m, p)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted empty-state">No predictions came in for this one.</p>
            )}
            <p className="field-hint center">Waiting for the result… points land automatically.</p>
            {renderAdminTools(m)}
          </>
        ) : (
          <>
            <p className="lock-line ticking">⏱️ Locks in {fmtCountdown(new Date(m.kickoff_at).getTime() - now)} · {fmtKickoff(m.kickoff_at)}</p>
            {!joinedName ? (
              <p className="field-hint center">Join with your name on the 🏠 Room tab to play.</p>
            ) : mine ? (
              <div className="my-pred pop-in">
                <span className="field-label">✅ You're in!</span>
                <p className="my-pick">{myPickText(m, mine)}</p>
                <p className="field-hint">Locked — no changes. {mPreds.length} prediction{mPreds.length === 1 ? "" : "s"} in 👀 (hidden until kickoff)</p>
              </div>
            ) : (
              <div className="pred-form">
                {askFg && (
                  <>
                    <span className="q-label">⏱️ Minute of the first goal?</span>
                    <div className="share-row">
                      <input className="input" type="number" inputMode="numeric" min="0" max="130" placeholder="e.g. 23"
                        value={f.none ? "" : f.minute} disabled={f.none}
                        onChange={(e) => setForm(m.id, { minute: e.target.value })} />
                      <button className={`btn ${f.none ? "btn-primary" : "btn-ghost"}`}
                        onClick={() => toggleNoGoals(m.id)}>
                        No goals ✋
                      </button>
                    </div>
                  </>
                )}
                {askScore && (
                  <>
                    <span className="q-label">🔢 Final score?</span>
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
                  </>
                )}
                {askWinner && (
                  <>
                    <span className="q-label">🏆 Who wins?</span>
                    <div className="finish-row">
                      <button className={`btn btn-small ${f.winner === "home" ? "btn-primary" : "btn-ghost"}`}
                        onClick={() => setForm(m.id, { winner: "home" })}>{flagOf(m.home)} {m.home}</button>
                      {!m.is_knockout && (
                        <button className={`btn btn-small ${f.winner === "draw" ? "btn-primary" : "btn-ghost"}`}
                          onClick={() => setForm(m.id, { winner: "draw" })}>🤝 Draw</button>
                      )}
                      <button className={`btn btn-small ${f.winner === "away" ? "btn-primary" : "btn-ghost"}`}
                        onClick={() => setForm(m.id, { winner: "away" })}>{flagOf(m.away)} {m.away}</button>
                    </div>
                  </>
                )}
                {m.is_knockout && (
                  <>
                    <span className="q-label">⏳ How does it end?</span>
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
            {renderAdminTools(m)}
          </>
        )}
      </section>
    );
  }

  function renderSchedRow(m) {
    const mPreds = predictions.filter((p) => p.match_id === m.id);
    const mine = mPreds.some((p) => p.name.toLowerCase() === (joinedName || "").toLowerCase());
    const expanded = expandedId === m.id;
    return (
      <div key={m.id}>
        <button className="sched-row" onClick={() => setExpandedId(expanded ? null : m.id)}>
          <span className="sched-flags">{flagOf(m.home)} <span className="sched-vs">v</span> {flagOf(m.away)}</span>
          <span className="sched-names">{m.home} v {m.away}</span>
          <span className="sched-meta">
            {isMine(m) && <span className="sched-chip fire">🔥</span>}
            {mine && <span className="sched-chip">✅</span>}
            <span className="sched-time">{fmtShort(m.kickoff_at)}</span>
          </span>
        </button>
        {expanded && renderMatchCard(m, false)}
      </div>
    );
  }

  /* ----------------------------- Render ----------------------------------- */

  return (
    <>
      {/* Rules strip */}
      <button className="rules-strip" onClick={() => setRulesOpen(!rulesOpen)}>
        ℹ️ How the points work {rulesOpen ? "⌃" : "⌄"}
      </button>
      {rulesOpen && (
        <section className="card rules-card">
          {showFgRule && <p className="rule-line">⏱️ <strong>First goal minute:</strong> exact = 3 pts · one minute out = 2 pts</p>}
          {showScoreRule && <p className="rule-line">🔢 <strong>Exact final score:</strong> 3 pts</p>}
          {showWinnerRule && <p className="rule-line">🏆 <strong>Match winner</strong> (when asked): 2 pts</p>}
          {showKoRule && <p className="rule-line">⏳ <strong>Knockouts</strong> — normal/extra time/pens: 1 pt</p>}
          <p className="rule-line">🔒 Predictions lock at kickoff. One shot, no changes. Picks hidden until kickoff, then everyone's are revealed.</p>
        </section>
      )}

      {/* In-play matches first (awaiting results) */}
      {inPlay.map((m) => renderMatchCard(m, false))}

      {/* THE next match — hero */}
      {hero ? (
        renderMatchCard(hero, true)
      ) : (
        matches.length === 0 && (
          <section className="card center-card">
            <h2 className="card-title">🔮 Predictions</h2>
            <p className="muted">No matches yet — the admin loads the World Cup schedule here. ⚽</p>
          </section>
        )
      )}

      {/* Schedule */}
      {restUpcoming.length > 0 && (
        <>
          <p className="section-label">📅 Coming up</p>
          <section className="card sched-card">
            {schedShown.map((m) => renderSchedRow(m))}
            {restUpcoming.length > 5 && (
              <button className="link-btn" onClick={() => setShowAllUpcoming(!showAllUpcoming)}>
                {showAllUpcoming ? "show less ⌃" : `show all ${restUpcoming.length} upcoming matches ⌄`}
              </button>
            )}
          </section>
        </>
      )}

      {/* Finished */}
      {latestDone && (
        <>
          <p className="section-label">✅ Latest result</p>
          {renderMatchCard(latestDone, false)}
          {earlierDone.length > 0 && (
            <>
              {doneShown.map((m) => renderMatchCard(m, false))}
              <button className="btn btn-ghost btn-big" onClick={() => setShowAllDone(!showAllDone)}>
                {showAllDone ? "Hide earlier results ⌃" : `Show earlier results (${earlierDone.length} more) ⌄`}
              </button>
            </>
          )}
        </>
      )}

      {/* Admin gate */}
      <section className="admin-zone">
        {!panelOpen ? (
          <button className="link-btn light" onClick={() => setPanelOpen(true)}>⚙️ Are you the admin?</button>
        ) : (
          <div className="card admin-card">
            <div className="players-head">
              <h2 className="card-title">Admin</h2>
              <button className="link-btn" onClick={() => setPanelOpen(false)}>hide</button>
            </div>
            {!adminUnlocked ? (
              <>
                <div className="share-row">
                  <input className="input" type="password" placeholder="Admin PIN" value={pinTry}
                    onChange={(e) => setPinTry(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (onAdminUnlock(pinTry) ? setPinErr("") : setPinErr("That PIN isn't right."))} />
                  <button className="btn btn-primary"
                    onClick={() => (onAdminUnlock(pinTry) ? setPinErr("") : setPinErr("That PIN isn't right."))}>
                    Unlock
                  </button>
                </div>
                {pinErr && <p className="error">{pinErr}</p>}
              </>
            ) : !addOpen ? (
              <div className="admin-actions">
                <button className="btn btn-primary btn-big" onClick={loadFixtures} disabled={loadingFixtures}>
                  {loadingFixtures ? "Loading fixtures… ⏳" : "📅 Load World Cup fixtures"}
                </button>
                <button className="btn btn-ghost" onClick={() => setAddOpen(true)}>➕ Add a single match</button>
                <p className="field-hint">
                  With this panel open, every match card gets: question toggles, 🧮 Enter result, and ✕ delete.
                  Tap a match in the schedule to open it.
                </p>
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
          </div>
        )}
      </section>
    </>
  );
}