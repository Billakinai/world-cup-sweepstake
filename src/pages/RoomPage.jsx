import { useEffect, useRef, useState } from "react";
import { navigate } from "../App";
import { supabase, hasSupabase } from "../supabaseClient";
import Wheel from "../components/Wheel";
import { confettiBurst } from "../lib/confetti";
import { spinTicks, cheer } from "../lib/sound";
import { HYPE_LINES, CHIP_COLORS, pickNickname, parseTeams, pickFunLine } from "../lib/draw";
import {
  getSweepstake,
  listParticipants,
  addParticipant,
  removeParticipant,
  setParticipantRole,
  updateSweepstake,
  listResults,
  listMessages,
  sendMessage,
} from "../lib/db";

function shareUrl(id) {
  return `${window.location.origin}${window.location.pathname}#/room/${id}`;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

const QUICK_EMOJI = ["⚽", "🔥", "😂", "🏆", "🐺", "⭐", "😭", "💀", "🙌", "👀", "🥶", "🤡", "🍿", "💪", "😤", "🎉"];

export default function RoomPage({ id }) {
  const [sweepstake, setSweepstake] = useState(undefined);
  const [everyone, setEveryone] = useState([]);
  const [liveResults, setLiveResults] = useState([]);
  const [messages, setMessages] = useState([]);
  const [tab, setTab] = useState("room");

  // Joining
  const [joinedName, setJoinedName] = useState(localStorage.getItem(`fwcs-me-${id}`) || "");
  const [joinedNick, setJoinedNick] = useState(localStorage.getItem(`fwcs-nick-${id}`) || "");
  const [joinedRole, setJoinedRole] = useState(localStorage.getItem(`fwcs-role-${id}`) || "player");
  const [name, setName] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joining, setJoining] = useState(false);

  // Chat
  const [chatText, setChatText] = useState("");
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef(null);
  const lastMsgId = useRef(null);

  // Admin
  const [adminOpen, setAdminOpen] = useState(false);
  const [pin, setPin] = useState(sessionStorage.getItem(`fwcs-admin-${id}`) || "");
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editBig, setEditBig] = useState("");
  const [editLesser, setEditLesser] = useState("");
  const [editError, setEditError] = useState("");
  const [shared, setShared] = useState(false);
  const [hypeIdx, setHypeIdx] = useState(0);

  // Countdown
  const [now, setNow] = useState(Date.now());
  const [drawAtInput, setDrawAtInput] = useState("");

  // Live broadcast viewer
  const [wheelBusy, setWheelBusy] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const lastSpinRef = useRef(0);
  const comboFiredRef = useRef(-1);
  const cancelTicksRef = useRef(() => {});
  const wasLiveRef = useRef(false);

  const timer = useRef(null);

  async function refresh() {
    try {
      const [s, p, r, m] = await Promise.all([
        getSweepstake(id),
        listParticipants(id),
        listResults(id),
        listMessages(id),
      ]);
      setSweepstake(s);
      setEveryone(p);
      setLiveResults(r);
      setMessages(m);
      if (pin && s && pin === s.admin_pin) setAdminUnlocked(true);
    } catch {
      setSweepstake((prev) => (prev === undefined ? null : prev));
    }
  }

  useEffect(() => {
    refresh();
    timer.current = setInterval(refresh, 2500);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const hype = setInterval(() => setHypeIdx((i) => i + 1), 4000);
    let channel = null;
    if (hasSupabase) {
      channel = supabase
        .channel(`room-${id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "participants", filter: `sweepstake_id=eq.${id}` }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "sweepstakes", filter: `id=eq.${id}` }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "results", filter: `sweepstake_id=eq.${id}` }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `sweepstake_id=eq.${id}` }, refresh)
        .subscribe();
    }
    return () => {
      clearInterval(timer.current);
      clearInterval(tick);
      clearInterval(hype);
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Derived state -----------------------------------------------------------
  const ds =
    sweepstake && sweepstake.status !== "complete" && sweepstake.draw_state && sweepstake.draw_state.live
      ? sweepstake.draw_state
      : null;

  // Spectator wheel: trigger spins as broadcast arrives
  useEffect(() => {
    if (!ds) return;
    if ((ds.phase === "spinBig" || ds.phase === "spinLesser") && ds.spin > lastSpinRef.current) {
      lastSpinRef.current = ds.spin;
      setWheelBusy(true);
      if (soundOn) cancelTicksRef.current = spinTicks(4600);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ds && ds.spin, ds && ds.phase]);

  // Combo celebration once per player
  useEffect(() => {
    if (!ds) return;
    if (ds.phase === "comboDone" && !wheelBusy && comboFiredRef.current !== ds.step) {
      comboFiredRef.current = ds.step;
      confettiBurst(90);
      if (soundOn) cheer(1.1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ds && ds.phase, wheelBusy]);

  // Auto-jump everyone to the Wheels tab the moment the draw goes live
  useEffect(() => {
    const live = Boolean(ds);
    if (live && !wasLiveRef.current) setTab("wheels");
    wasLiveRef.current = live;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(ds)]);

  // Keep chat scrolled to the newest message
  useEffect(() => {
    const newest = messages[messages.length - 1]?.id;
    if (newest && newest !== lastMsgId.current) {
      lastMsgId.current = newest;
      if (tab === "room") chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, tab]);

  function onSpectatorLanded() {
    cancelTicksRef.current();
    setWheelBusy(false);
    if (soundOn) cheer(0.6);
  }

  if (sweepstake === undefined) {
    return <div className="card center-card"><p className="muted">Opening the room…</p></div>;
  }
  if (sweepstake === null) {
    return (
      <div className="card center-card">
        <h2 className="card-title">Link not found</h2>
        <p className="muted">This sweepstake doesn't exist. Double-check the link from the group chat.</p>
        <button className="btn btn-ghost" onClick={() => navigate("/")}>Create a new one</button>
      </div>
    );
  }

  const isComplete = sweepstake.status === "complete";
  const liveShow = Boolean(ds);
  const drawInProgress = !isComplete && liveResults.length > 0;
  const isLocked = sweepstake.locked && !isComplete;
  const hasJoined = Boolean(joinedName);
  const myResult = liveResults.find((r) => r.player_name === joinedName);

  const bigTeams = sweepstake.big_teams || [];
  const lesserTeams = sweepstake.lesser_teams || [];
  const capacity = Math.min(bigTeams.length, lesserTeams.length);
  const players = everyone.filter((p) => p.role !== "stand");
  const stands = everyone.filter((p) => p.role === "stand");
  const spotsLeft = Math.max(capacity - players.length, 0);

  const liveBigPool = bigTeams.filter((t) => !liveResults.some((r) => r.big_team === t));
  const liveLesserPool = lesserTeams.filter((t) => !liveResults.some((r) => r.lesser_team === t));
  const specOnBigWheel = ds && (ds.phase === "idle" || ds.phase === "spinBig" || ds.phase === "bigDone");
  const showBigReveal = ds && ds.big_team && !wheelBusy && ds.phase !== "idle" && ds.phase !== "spinBig";
  const showCombo = ds && ds.phase === "comboDone" && !wheelBusy;

  const drawAtMs = sweepstake.draw_at ? new Date(sweepstake.draw_at).getTime() : null;
  const msLeft = drawAtMs ? drawAtMs - now : null;
  const showCountdown = Boolean(drawAtMs) && !isComplete && !liveShow;
  const cd =
    msLeft && msLeft > 0
      ? {
          d: Math.floor(msLeft / 86400000),
          h: Math.floor((msLeft % 86400000) / 3600000),
          m: Math.floor((msLeft % 3600000) / 60000),
          s: Math.floor((msLeft % 60000) / 1000),
        }
      : null;
  const drawAtLabel = drawAtMs
    ? new Date(drawAtMs).toLocaleString(undefined, { weekday: "long", hour: "2-digit", minute: "2-digit" })
    : "";

  /* ----------------------------- Actions --------------------------------- */

  async function handleJoin() {
    setJoinError("");
    const trimmed = name.trim();
    if (!trimmed) return setJoinError("Type your name first!");
    setJoining(true);
    try {
      const fresh = await getSweepstake(id);
      if (fresh?.locked || fresh?.status === "complete") {
        setJoinError("Joining just closed — the draw is starting!");
        return;
      }
      const existing = await listParticipants(id);
      if (existing.some((p) => p.name.trim().toLowerCase() === trimmed.toLowerCase())) {
        setJoinError(`"${trimmed}" is taken — add an initial or surname.`);
        return;
      }
      const cap = Math.min((fresh.big_teams || []).length, (fresh.lesser_teams || []).length);
      const playerCount = existing.filter((p) => p.role !== "stand").length;
      const role = playerCount >= cap ? "stand" : "player";
      const nick = pickNickname(existing.map((p) => p.nickname));
      await addParticipant(id, trimmed, nick, role);
      localStorage.setItem(`fwcs-me-${id}`, trimmed);
      localStorage.setItem(`fwcs-nick-${id}`, nick);
      localStorage.setItem(`fwcs-role-${id}`, role);
      setJoinedName(trimmed);
      setJoinedNick(nick);
      setJoinedRole(role);
      confettiBurst(70);
      refresh();
    } catch {
      setJoinError("Couldn't join just now — try again.");
    } finally {
      setJoining(false);
    }
  }

  async function copyRoomLink() {
    if (await copyText(shareUrl(id))) {
      setShared(true);
      setTimeout(() => setShared(false), 2500);
    }
  }

  async function handleSend(text) {
    const clean = (text ?? chatText).trim();
    if (!clean || sending) return;
    setSending(true);
    setChatText("");
    try {
      await sendMessage(id, joinedName || "Someone", clean);
      refresh();
    } finally {
      setSending(false);
    }
  }

  function unlockAdmin() {
    if (pin === sweepstake.admin_pin) {
      sessionStorage.setItem(`fwcs-admin-${id}`, pin);
      setAdminUnlocked(true);
      setAdminError("");
    } else {
      setAdminError("That PIN isn't right.");
    }
  }

  function startEditing() {
    setEditName(sweepstake.name);
    setEditBig(bigTeams.join("\n"));
    setEditLesser(lesserTeams.join("\n"));
    setEditError("");
    setEditing(true);
  }

  async function saveEdits() {
    setEditError("");
    const newName = editName.trim();
    const bigs = parseTeams(editBig);
    const lessers = parseTeams(editLesser);
    if (!newName) return setEditError("The sweepstake needs a name.");
    if (bigs.length < players.length) return setEditError(`You need at least ${players.length} star teams (one per draw player).`);
    if (lessers.length < players.length) return setEditError(`You need at least ${players.length} underdogs (one per draw player).`);
    const bigSet = new Set(bigs.map((t) => t.toLowerCase()));
    const overlap = lessers.filter((t) => bigSet.has(t.toLowerCase()));
    if (overlap.length) return setEditError(`In both lists: ${overlap.join(", ")}. Each team goes in one list only.`);
    const updated = await updateSweepstake(id, { name: newName, big_teams: bigs, lesser_teams: lessers });
    if (updated) {
      setSweepstake(updated);
      setEditing(false);
    }
  }

  async function kick(p) {
    if (!window.confirm(`Remove ${p.name} from the room?`)) return;
    await removeParticipant(p.id);
    refresh();
  }

  async function moveRole(p, role) {
    await setParticipantRole(p.id, role);
    refresh();
  }

  async function toggleLock() {
    const updated = await updateSweepstake(id, { locked: !sweepstake.locked });
    if (updated) setSweepstake(updated);
  }

  /* ----------------------------- Pieces ----------------------------------- */

  function RosterRow({ p, i, inDraw }) {
    return (
      <div className="roster-row" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
        <span className="chip-avatar" style={{ background: CHIP_COLORS[i % CHIP_COLORS.length] }}>
          {p.name.trim().charAt(0).toUpperCase()}
        </span>
        <span className="roster-text">
          <span className="roster-name">
            {p.name}
            {p.name === joinedName && <span className="you-chip">you</span>}
          </span>
          {p.nickname && <span className="roster-nick">“{p.nickname}”</span>}
        </span>
        {adminUnlocked && adminOpen && !isComplete && !liveShow && (
          <span className="roster-actions">
            {inDraw ? (
              <button className="mini-btn" onClick={() => moveRole(p, "stand")} title="Move to the stands">🍿</button>
            ) : (
              <button className="mini-btn" onClick={() => moveRole(p, "player")} disabled={spotsLeft === 0} title="Move into the draw">⚽</button>
            )}
            <button className="mini-btn danger" onClick={() => kick(p)} title="Remove">✕</button>
          </span>
        )}
      </div>
    );
  }

  const badgeText = isComplete
    ? "Draw complete 🏆"
    : liveShow || drawInProgress
    ? `🎡 LIVE — ${liveResults.length} of ${players.length} drawn`
    : `Draw ${players.length}/${capacity}${stands.length ? ` · 🍿 ${stands.length}` : ""}`;

  /* ----------------------------- Render ----------------------------------- */

  return (
    <>
      <header className="hero hero-small">
        <h1 className="hero-title hero-title-small">{sweepstake.name}</h1>
        <div className="live-row">
          <span className={`live-badge ${isComplete ? "done" : ""}`}>
            <span className="live-dot" />
            {badgeText}
          </span>
          {isLocked && !liveShow && <span className="locked-chip">🔒 Joining locked</span>}
        </div>
      </header>

      {/* ============================ ROOM TAB ============================ */}
      {tab === "room" && (
        <>
          {isComplete && (
            <section className="card center-card joined-banner">
              <div className="joined-emoji">🏆</div>
              {myResult ? (
                <>
                  <h2 className="card-title">{joinedName}, you got:</h2>
                  <div className="combo-teams">
                    <span className="combo-chip gold">⭐ {myResult.big_team}</span>
                    <span className="combo-plus">+</span>
                    <span className="combo-chip green">🐺 {myResult.lesser_team}</span>
                  </div>
                </>
              ) : (
                <h2 className="card-title">The teams are out!</h2>
              )}
              <button className="btn btn-primary btn-big" onClick={() => navigate(`/results/${id}`)}>
                See everyone's teams
              </button>
            </section>
          )}

          {/* Join */}
          {!isComplete && !hasJoined && (
            <section className="card join-card">
              {isLocked ? (
                <p className="muted empty-state">Joining is locked — the draw is about to start. Watch this space! 👀</p>
              ) : (
                <>
                  <h2 className="card-title">Jump in 👇</h2>
                  <div className="share-row">
                    <input
                      className="input"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                      placeholder="Your name"
                      maxLength={40}
                    />
                    <button className="btn btn-primary" onClick={handleJoin} disabled={joining}>
                      {joining ? "…" : "I'm in!"}
                    </button>
                  </div>
                  <p className="field-hint">
                    {spotsLeft > 0
                      ? `${spotsLeft} draw spot${spotsLeft === 1 ? "" : "s"} left · free nickname included 😎`
                      : "Draw spots are full — you'll join the stands 🍿 (chat + watch live)"}
                  </p>
                  {joinError && <p className="error">{joinError}</p>}
                </>
              )}
            </section>
          )}

          {!isComplete && hasJoined && (
            <section className="card center-card joined-banner">
              <div className="joined-emoji">{joinedRole === "stand" ? "🍿" : "🎉"}</div>
              <h2 className="card-title">
                {joinedRole === "stand" ? `You're in the stands, ${joinedName}!` : `You're in the draw, ${joinedName}!`}
              </h2>
              {joinedNick && <p className="nick-line">aka “{joinedNick}” 😎</p>}
              <p className="muted">
                {joinedRole === "stand"
                  ? "Chat away and watch the wheels live — best seats in the house."
                  : "Your teams will be drawn live on the Wheels tab."}
              </p>
            </section>
          )}

          {/* Roster */}
          <section className="card">
            <div className="players-head">
              <span className="field-label">⚽ In the draw</span>
              <span className="count-pill big-pill">{players.length}/{capacity}</span>
            </div>
            {players.length === 0 ? (
              <p className="muted empty-state">Nobody yet — be the first in!</p>
            ) : (
              <div className="roster">
                {players.map((p, i) => (
                  <RosterRow key={p.id} p={p} i={i} inDraw />
                ))}
              </div>
            )}

            {stands.length > 0 && (
              <>
                <div className="players-head">
                  <span className="field-label">🍿 In the stands</span>
                  <span className="count-pill">{stands.length}</span>
                </div>
                <div className="roster">
                  {stands.map((p, i) => (
                    <RosterRow key={p.id} p={p} i={i} inDraw={false} />
                  ))}
                </div>
              </>
            )}

            {!isComplete && (
              <button className="btn btn-gold btn-big" onClick={copyRoomLink}>
                {shared ? "Link copied ✓ — paste it in the group" : "📋 Copy the room link"}
              </button>
            )}
          </section>

          {/* Chat */}
          <section className="card chat-card">
            <span className="field-label">💬 Room chat</span>
            <div className="chat-box">
              {messages.length === 0 ? (
                <p className="muted empty-state">No messages yet. Start the trash talk.</p>
              ) : (
                messages.map((m) => (
                  <div className={`chat-msg ${m.name === joinedName ? "mine" : ""}`} key={m.id}>
                    <span className="chat-name">{m.name}</span>
                    <span className="chat-text">{m.text}</span>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>
            {hasJoined ? (
              <>
                <div className="share-row">
                  <input
                    className="input"
                    value={chatText}
                    onChange={(e) => setChatText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                    placeholder="Say something…"
                    maxLength={240}
                  />
                  <button className="btn btn-primary" onClick={() => handleSend()} disabled={sending}>Send</button>
                </div>
                <div className="emoji-row scrollable">
                  {QUICK_EMOJI.map((e) => (
                    <button key={e} className="emoji-btn" onClick={() => handleSend(e)} disabled={sending}>{e}</button>
                  ))}
                </div>
              </>
            ) : (
              <p className="field-hint">Join with your name to chat.</p>
            )}
          </section>

          {!isComplete && !liveShow && (
            <p className="hype-line" key={hypeIdx}>{HYPE_LINES[hypeIdx % HYPE_LINES.length]}</p>
          )}

          {/* Admin */}
          {!isComplete && (
            <section className="admin-zone">
              {!adminOpen ? (
                <button className="link-btn light" onClick={() => setAdminOpen(true)}>
                  ⚙️ Are you the admin?
                </button>
              ) : (
                <div className="card admin-card">
                  <div className="players-head">
                    <h2 className="card-title">Admin</h2>
                    <button className="link-btn" onClick={() => setAdminOpen(false)}>hide</button>
                  </div>
                  {!adminUnlocked ? (
                    <>
                      <div className="share-row">
                        <input
                          className="input"
                          type="password"
                          placeholder="Admin PIN"
                          value={pin}
                          onChange={(e) => setPin(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && unlockAdmin()}
                        />
                        <button className="btn btn-primary" onClick={unlockAdmin}>Unlock</button>
                      </div>
                      {adminError && <p className="error">{adminError}</p>}
                    </>
                  ) : (
                    <div className="admin-actions">
                      <button
                        className="btn btn-primary btn-big"
                        onClick={() => navigate(`/draw/${id}`)}
                        disabled={players.length === 0}
                      >
                        {drawInProgress ? "Continue the draw 🎡" : "Start the draw 🎡"}
                      </button>
                      {players.length === 0 && <p className="field-hint">You need at least one player in the draw.</p>}

                      {!drawInProgress && (
                        <>
                          <div className="edit-panel">
                            <span className="field-label">⏰ Draw night countdown</span>
                            <div className="share-row">
                              <input
                                className="input"
                                type="datetime-local"
                                value={drawAtInput}
                                onChange={(e) => setDrawAtInput(e.target.value)}
                              />
                              <button
                                className="btn btn-primary"
                                onClick={async () => {
                                  if (!drawAtInput) return;
                                  const u = await updateSweepstake(id, { draw_at: new Date(drawAtInput).toISOString() });
                                  if (u) setSweepstake(u);
                                }}
                              >
                                Set
                              </button>
                            </div>
                            {sweepstake.draw_at && (
                              <button
                                className="link-btn"
                                onClick={async () => {
                                  const u = await updateSweepstake(id, { draw_at: null });
                                  if (u) setSweepstake(u);
                                }}
                              >
                                remove countdown
                              </button>
                            )}
                          </div>

                          <button className="btn btn-ghost" onClick={toggleLock}>
                            {sweepstake.locked ? "🔓 Unlock joining" : "🔒 Lock joining"}
                          </button>

                          {!editing ? (
                            <button className="btn btn-ghost" onClick={startEditing}>✏️ Edit name & teams</button>
                          ) : (
                            <div className="edit-panel pop-in">
                              <label className="field">
                                <span className="field-label">Sweepstake name</span>
                                <input className="input" value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={60} />
                              </label>
                              <div className="team-editor">
                                <label className="field">
                                  <span className="field-label"><span className="dot gold-dot" /> Stars <span className="count-pill">{parseTeams(editBig).length}</span></span>
                                  <textarea className="input textarea" rows={8} value={editBig} onChange={(e) => setEditBig(e.target.value)} />
                                </label>
                                <label className="field">
                                  <span className="field-label"><span className="dot green-dot" /> Underdogs <span className="count-pill">{parseTeams(editLesser).length}</span></span>
                                  <textarea className="input textarea" rows={8} value={editLesser} onChange={(e) => setEditLesser(e.target.value)} />
                                </label>
                              </div>
                              {editError && <p className="error">{editError}</p>}
                              <div className="share-row">
                                <button className="btn btn-primary" style={{ flex: 1 }} onClick={saveEdits}>Save changes</button>
                                <button className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
                              </div>
                            </div>
                          )}
                          <p className="field-hint">
                            With this panel open: 🍿 moves a player to the stands, ⚽ moves them into the draw, ✕ removes them.
                            Draw spots = whichever team list is shorter. Everything updates live on every phone.
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>
          )}
        </>
      )}

      {/* ============================ WHEELS TAB ============================ */}
      {tab === "wheels" && (
        <>
          {isComplete && (
            <section className="card center-card joined-banner">
              <div className="joined-emoji">🏆</div>
              {myResult ? (
                <>
                  <h2 className="card-title">{joinedName}, you got:</h2>
                  <div className="combo-teams">
                    <span className="combo-chip gold">⭐ {myResult.big_team}</span>
                    <span className="combo-plus">+</span>
                    <span className="combo-chip green">🐺 {myResult.lesser_team}</span>
                  </div>
                </>
              ) : (
                <h2 className="card-title">The teams are out!</h2>
              )}
              <button className="btn btn-primary btn-big" onClick={() => navigate(`/results/${id}`)}>
                See everyone's teams
              </button>
            </section>
          )}

          {liveShow && (
            <section className="card live-stage">
              <div className="live-stage-head">
                <h2 className="card-title">
                  Drawing for <span className="live-player">{ds.player_name}</span>
                </h2>
                {ds.nickname && <p className="nick-line">“{ds.nickname}”</p>}
                <p className="field-hint">
                  {wheelBusy ? "Spinning…" : ds.phase === "comboDone" ? "What a draw!" : specOnBigWheel ? "⭐ Star team wheel" : "🐺 Underdog wheel"}
                </p>
              </div>
              <div className="wheel-zone">
                {specOnBigWheel ? (
                  <Wheel
                    key={`sb-${ds.step}-${liveBigPool.length}`}
                    teams={liveBigPool}
                    targetTeam={ds.big_team}
                    spinToken={ds.phase === "spinBig" ? ds.spin : 0}
                    onLanded={onSpectatorLanded}
                    variant="gold"
                  />
                ) : (
                  <Wheel
                    key={`sl-${ds.step}-${liveLesserPool.length}`}
                    teams={liveLesserPool}
                    targetTeam={ds.lesser_team}
                    spinToken={ds.phase === "spinLesser" ? ds.spin : 0}
                    onLanded={onSpectatorLanded}
                    variant="green"
                  />
                )}
              </div>

              {showBigReveal && !showCombo && (
                <div className={`reveal-card gold ${ds.phase === "bigDone" ? "pop-in" : "dimmed"}`}>
                  <span className="reveal-kicker">Star team</span>
                  <span className="reveal-team">{ds.big_team}</span>
                </div>
              )}

              {showCombo && (
                <div className="combo-card pop-in">
                  <span className="combo-name">{ds.player_name} gets</span>
                  <div className="combo-teams">
                    <span className="combo-chip gold">⭐ {ds.big_team}</span>
                    <span className="combo-plus">+</span>
                    <span className="combo-chip green">🐺 {ds.lesser_team}</span>
                  </div>
                  <span className="combo-fun">{pickFunLine((ds.fun || 0) + ds.step)}</span>
                </div>
              )}

              {!soundOn && (
                <button className="btn btn-ghost btn-small sound-pill" onClick={() => setSoundOn(true)}>
                  🔇 Tap for sound
                </button>
              )}

              {liveResults.length > 0 && (
                <div className="live-feed">
                  {liveResults.slice(-4).map((r) => (
                    <div className="feed-row pop-in" key={r.id}>
                      <strong>{r.player_name}</strong>
                      <span className="feed-teams">⭐ {r.big_team} + 🐺 {r.lesser_team}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {!isComplete && !liveShow && (
            <section className="card countdown-card">
              <div className="mini-wheels">
                <div className="mini-wheel">
                  <Wheel teams={bigTeams} targetTeam={null} spinToken={0} onLanded={() => {}} variant="gold" />
                </div>
                <div className="mini-lock">🔒</div>
                <div className="mini-wheel">
                  <Wheel teams={lesserTeams} targetTeam={null} spinToken={0} onLanded={() => {}} variant="green" />
                </div>
              </div>
              {showCountdown && cd ? (
                <>
                  <p className="countdown-label">The wheels unlock in</p>
                  <div className="countdown-row">
                    {cd.d > 0 && (
                      <div className="countdown-unit"><span className="countdown-num">{cd.d}</span><span className="countdown-cap">days</span></div>
                    )}
                    <div className="countdown-unit"><span className="countdown-num">{String(cd.h).padStart(2, "0")}</span><span className="countdown-cap">hrs</span></div>
                    <div className="countdown-unit"><span className="countdown-num">{String(cd.m).padStart(2, "0")}</span><span className="countdown-cap">min</span></div>
                    <div className="countdown-unit"><span className="countdown-num">{String(cd.s).padStart(2, "0")}</span><span className="countdown-cap">sec</span></div>
                  </div>
                  <p className="field-hint">Draw night: {drawAtLabel} · the wheels spin live right here 🍿</p>
                </>
              ) : showCountdown && !cd ? (
                <>
                  <p className="countdown-label">⏰ IT'S TIME</p>
                  <p className="muted">Waiting for the admin to spin… any second now 👀</p>
                </>
              ) : (
                <>
                  <p className="countdown-label">The wheels are warming up</p>
                  <p className="muted">When the draw starts, it spins live right here on your phone.</p>
                </>
              )}
            </section>
          )}

          {drawInProgress && !liveShow && (
            <section className="card">
              <h2 className="card-title">🎡 Results so far</h2>
              <div className="live-feed">
                {liveResults.map((r) => (
                  <div className="feed-row pop-in" key={r.id}>
                    <strong>{r.player_name}</strong>
                    <span className="feed-teams">⭐ {r.big_team} + 🐺 {r.lesser_team}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* Bottom tab bar */}
      <nav className="tabbar">
        <button className={`tabbtn ${tab === "room" ? "on" : ""}`} onClick={() => setTab("room")}>
          <span className="tabicon">🏠</span>Room
        </button>
        <button className={`tabbtn ${tab === "wheels" ? "on" : ""}`} onClick={() => setTab("wheels")}>
          <span className="tabicon">🎡</span>Wheels
          {(liveShow || showCountdown) && <span className="tab-dot" />}
        </button>
      </nav>
      <div className="tabbar-spacer" />
    </>
  );
}
