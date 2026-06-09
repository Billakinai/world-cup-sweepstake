import { useEffect, useMemo, useRef, useState } from "react";
import { navigate } from "../App";
import Wheel from "../components/Wheel";
import { confettiBurst } from "../lib/confetti";
import {
  getSweepstake,
  listParticipants,
  listResults,
  updateSweepstake,
  saveOneResult,
  markComplete,
} from "../lib/db";
import { runDraw, validateDraw, pickFunLine } from "../lib/draw";
import { spinTicks, cheer, bigCheer, setMuted, isMuted } from "../lib/sound";

/* Phases for the current player:
 * idle → spinBig → bigDone → spinLesser → comboDone → (next player | finish)
 */

export default function DrawPage({ id }) {
  const [sweepstake, setSweepstake] = useState(undefined);
  const [participants, setParticipants] = useState([]);
  const [savedResults, setSavedResults] = useState([]);
  const [pin, setPin] = useState(sessionStorage.getItem(`fwcs-admin-${id}`) || "");
  const [pinError, setPinError] = useState("");
  const [adminOk, setAdminOk] = useState(false);
  const [blockers, setBlockers] = useState([]);

  const [plan, setPlan] = useState(null); // rows for remaining players, in draw order
  const [step, setStep] = useState(0); // index into plan
  const [phase, setPhase] = useState("idle");
  const [spinToken, setSpinToken] = useState(0);
  const [busy, setBusy] = useState(false);
  const [bigPool, setBigPool] = useState([]);
  const [lesserPool, setLesserPool] = useState([]);
  const funIndexRef = useRef(Math.floor(Math.random() * 10));
  const [muted, setMutedState] = useState(isMuted());
  const cancelTicks = useRef(() => {});

  function toggleMute() {
    const m = !muted;
    setMuted(m);
    setMutedState(m);
  }

  async function loadAll() {
    const [s, p, r] = await Promise.all([getSweepstake(id), listParticipants(id), listResults(id)]);
    setSweepstake(s);
    setParticipants(p);
    setSavedResults(r);
    return { s, p, r };
  }

  useEffect(() => {
    loadAll().catch(() => setSweepstake(null));
    const stored = sessionStorage.getItem(`fwcs-admin-${id}`);
    if (stored) setPin(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Already-drawn redirect + admin check once data lands.
  useEffect(() => {
    if (!sweepstake) return;
    if (sweepstake.status === "complete") {
      navigate(`/results/${id}`);
      return;
    }
    if (pin && pin === sweepstake.admin_pin) setAdminOk(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sweepstake]);

  // Spectators: poll until the draw finishes, then jump to results.
  useEffect(() => {
    if (!sweepstake || adminOk) return;
    const t = setInterval(async () => {
      const s = await getSweepstake(id).catch(() => null);
      if (s?.status === "complete") navigate(`/results/${id}`);
    }, 4000);
    return () => clearInterval(t);
  }, [sweepstake, adminOk, id]);

  const remaining = useMemo(() => {
    const done = new Set(savedResults.map((r) => r.participant_id));
    return participants.filter((p) => !done.has(p.id));
  }, [participants, savedResults]);

  const remainingBig = useMemo(() => {
    const used = new Set(savedResults.map((r) => r.big_team));
    return (sweepstake?.big_teams || []).filter((t) => !used.has(t));
  }, [sweepstake, savedResults]);

  const remainingLesser = useMemo(() => {
    const used = new Set(savedResults.map((r) => r.lesser_team));
    return (sweepstake?.lesser_teams || []).filter((t) => !used.has(t));
  }, [sweepstake, savedResults]);

  /* ------------------------------------------------------------------ */

  if (sweepstake === undefined) {
    return <div className="card center-card"><p className="muted">Warming up the wheels…</p></div>;
  }
  if (sweepstake === null) {
    return (
      <div className="card center-card">
        <h2 className="card-title">Link not found</h2>
        <p className="muted">This sweepstake doesn't exist. Double-check the link.</p>
        <button className="btn btn-ghost" onClick={() => navigate("/")}>Create a new one</button>
      </div>
    );
  }

  // PIN gate ----------------------------------------------------------
  if (!adminOk) {
    return (
      <>
        <header className="hero hero-small">
          <div className="hero-badge">Draw night 🎡</div>
          <h1 className="hero-title hero-title-small">{sweepstake.name}</h1>
        </header>
        <section className="card center-card">
          <h2 className="card-title">Admin runs the draw</h2>
          <p className="muted">
            The wheels spin on the admin's phone — perfect for putting on the big screen.
            Results will appear for everyone at the results link the moment the draw finishes.
          </p>
          <div className="share-row">
            <input
              className="input"
              type="password"
              placeholder="Admin PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
            />
            <button
              className="btn btn-gold"
              onClick={() => {
                if (pin === sweepstake.admin_pin) {
                  sessionStorage.setItem(`fwcs-admin-${id}`, pin);
                  setAdminOk(true);
                  setPinError("");
                } else setPinError("That PIN isn't right. Try again.");
              }}
            >
              Unlock
            </button>
          </div>
          {pinError && <p className="error">{pinError}</p>}
          <button className="btn btn-ghost" onClick={() => navigate(`/room/${id}`)}>
            Back to the room
          </button>
        </section>
      </>
    );
  }

  // Intro / mode select -------------------------------------------------
  async function startTheatre() {
    const errs = validateDraw(remaining, remainingBig, remainingLesser);
    if (errs.length) return setBlockers(errs);
    setBlockers([]);
    await updateSweepstake(id, { locked: true });
    const startOrder = savedResults.length;
    const rows = runDraw(remaining, remainingBig, remainingLesser).map((r, i) => ({
      ...r,
      draw_order: startOrder + i + 1,
    }));
    setPlan(rows);
    setBigPool([...remainingBig]);
    setLesserPool([...remainingLesser]);
    setStep(0);
    setPhase("idle");
  }

  async function quickDraw() {
    const errs = validateDraw(remaining, remainingBig, remainingLesser);
    if (errs.length) return setBlockers(errs);
    setBlockers([]);
    setBusy(true);
    try {
      await updateSweepstake(id, { locked: true });
      const startOrder = savedResults.length;
      const rows = runDraw(remaining, remainingBig, remainingLesser).map((r, i) => ({
        ...r,
        draw_order: startOrder + i + 1,
      }));
      for (const row of rows) await saveOneResult(id, row);
      await markComplete(id);
      confettiBurst(140);
      navigate(`/results/${id}`);
    } finally {
      setBusy(false);
    }
  }

  if (!plan) {
    const drawnCount = savedResults.length;
    return (
      <>
        <header className="hero hero-small">
          <div className="hero-badge">Draw night 🎡</div>
          <h1 className="hero-title hero-title-small">{sweepstake.name}</h1>
          <p className="hero-sub">
            {remaining.length} player{remaining.length === 1 ? "" : "s"} ready ·{" "}
            {remainingBig.length} star teams · {remainingLesser.length} underdogs on the wheels
          </p>
        </header>

        {drawnCount > 0 && (
          <section className="card">
            <p className="muted">
              ✅ {drawnCount} player{drawnCount === 1 ? " has" : "s have"} already been drawn and saved.
              Carry on with the rest below.
            </p>
          </section>
        )}

        {blockers.length > 0 && (
          <section className="card">
            {blockers.map((b, i) => (
              <p className="error" key={i}>{b}</p>
            ))}
            <button className="btn btn-ghost" onClick={() => navigate(`/room/${id}`)}>
              Back to the room
            </button>
          </section>
        )}

        <section className="card mode-card">
          <h2 className="card-title">🎭 Theatre Mode</h2>
          <p className="muted">
            The main event. One player at a time, two wheel spins each, full suspense.
            Best with everyone watching one screen.
          </p>
          <button className="btn btn-gold btn-big" onClick={startTheatre} disabled={remaining.length === 0}>
            {drawnCount > 0 ? "Continue the draw 🎡" : "Start the show 🎡"}
          </button>
        </section>

        <section className="card mode-card">
          <h2 className="card-title">⚡ Quick Draw</h2>
          <p className="muted">No theatre — draw everyone instantly and jump to the results.</p>
          <button className="btn btn-ghost" onClick={quickDraw} disabled={busy || remaining.length === 0}>
            {busy ? "Drawing…" : "Draw everyone now"}
          </button>
        </section>
      </>
    );
  }

  // Theatre mode --------------------------------------------------------
  const row = plan[step];
  const totalPlayers = participants.length;
  const playerNumber = savedResults.length + (phase === "comboDone" ? 0 : 1);
  const isLast = step === plan.length - 1;
  const wheelIsBig = phase === "idle" || phase === "spinBig" || phase === "bigDone";

  function spinBig() {
    if (phase !== "idle") return;
    setPhase("spinBig");
    cancelTicks.current = spinTicks(4600);
    setSpinToken((t) => t + 1);
  }
  function spinLesser() {
    if (phase !== "bigDone") return;
    setPhase("spinLesser");
    cancelTicks.current = spinTicks(4600);
    setSpinToken((t) => t + 1);
  }
  async function onLanded() {
    cancelTicks.current();
    if (phase === "spinBig") {
      setPhase("bigDone");
      cheer(0.7);
    } else if (phase === "spinLesser") {
      setPhase("comboDone");
      confettiBurst(110);
      cheer(1.2);
      try {
        const saved = await saveOneResult(id, row);
        setSavedResults((prev) =>
          prev.some((r) => r.participant_id === saved.participant_id) ? prev : [...prev, saved]
        );
      } catch {
        /* will retry on next load; the plan keeps the result on screen */
      }
    }
  }
  async function nextPlayer() {
    setBigPool((p) => p.filter((t) => t !== row.big_team));
    setLesserPool((p) => p.filter((t) => t !== row.lesser_team));
    if (isLast) {
      setBusy(true);
      await markComplete(id);
      confettiBurst(160);
      bigCheer();
      navigate(`/results/${id}`);
      return;
    }
    setStep((s) => s + 1);
    setPhase("idle");
  }

  return (
    <div className="draw-stage">
      <button className="mute-btn" onClick={toggleMute} aria-label={muted ? "Unmute sounds" : "Mute sounds"}>
        {muted ? "🔇" : "🔊"}
      </button>
      <header className="draw-head">
        <p className="draw-tournament">{sweepstake.name}</p>
        <h1 className="draw-player pop-in" key={row.participant_id}>
          Now drawing for <span className="draw-player-name">{row.player_name}</span>
        </h1>
        {row.nickname && <p className="nick-line light">“{row.nickname}”</p>}
        <p className="draw-progress">
          Player {Math.min(playerNumber, totalPlayers)} of {totalPlayers} ·{" "}
          {wheelIsBig ? "⭐ Star team draw" : "🐺 Underdog draw"}
        </p>
      </header>

      <div className="wheel-zone">
        {wheelIsBig ? (
          <Wheel
            key={`big-${step}-${bigPool.length}`}
            teams={bigPool}
            targetTeam={row.big_team}
            spinToken={phase === "spinBig" ? spinToken : 0}
            onLanded={onLanded}
            variant="gold"
          />
        ) : (
          <Wheel
            key={`lesser-${step}-${lesserPool.length}`}
            teams={lesserPool}
            targetTeam={row.lesser_team}
            spinToken={phase === "spinLesser" ? spinToken : 0}
            onLanded={onLanded}
            variant="green"
          />
        )}
        <p className="wheel-caption">
          {phase === "spinBig" || phase === "spinLesser"
            ? "Spinning…"
            : wheelIsBig
            ? `${bigPool.length} star teams on the wheel`
            : `${lesserPool.length} underdogs on the wheel`}
        </p>
      </div>

      <div className="draw-controls">
        {phase === "idle" && (
          <button className="btn btn-gold btn-big" onClick={spinBig}>
            Spin the Star Wheel ⭐
          </button>
        )}

        {phase === "spinBig" && (
          <button className="btn btn-gold btn-big" disabled>Spinning…</button>
        )}

        {phase === "bigDone" && (
          <>
            <div className="reveal-card gold pop-in">
              <span className="reveal-kicker">Star team</span>
              <span className="reveal-team">{row.big_team}</span>
            </div>
            <button className="btn btn-primary btn-big" onClick={spinLesser}>
              Spin the Underdog Wheel 🐺
            </button>
          </>
        )}

        {phase === "spinLesser" && (
          <>
            <div className="reveal-card gold dimmed">
              <span className="reveal-kicker">Star team</span>
              <span className="reveal-team">{row.big_team}</span>
            </div>
            <button className="btn btn-primary btn-big" disabled>Spinning…</button>
          </>
        )}

        {phase === "comboDone" && (
          <>
            <div className="combo-card pop-in">
              <span className="combo-name">{row.player_name} gets</span>
              <div className="combo-teams">
                <span className="combo-chip gold">{row.big_team}</span>
                <span className="combo-plus">+</span>
                <span className="combo-chip green">{row.lesser_team}</span>
              </div>
              <span className="combo-fun">{pickFunLine(funIndexRef.current + step)}</span>
            </div>
            <button className="btn btn-gold btn-big" onClick={nextPlayer} disabled={busy}>
              {busy ? "Saving…" : isLast ? "Finish draw 🏆" : "Next player →"}
            </button>
          </>
        )}
      </div>

      {savedResults.length > 0 && phase !== "comboDone" && (
        <div className="drawn-ticker">
          {savedResults
            .slice(-3)
            .map((r) => `${r.nickname || r.player_name}: ${r.big_team} + ${r.lesser_team}`)
            .join("  ·  ")}
        </div>
      )}
    </div>
  );
}
