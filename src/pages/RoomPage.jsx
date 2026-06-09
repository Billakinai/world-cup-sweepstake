import { useEffect, useRef, useState } from "react";
import { navigate } from "../App";
import { supabase, hasSupabase } from "../supabaseClient";
import { confettiBurst } from "../lib/confetti";
import { HYPE_LINES, CHIP_COLORS, pickNickname, parseTeams } from "../lib/draw";
import {
  getSweepstake,
  listParticipants,
  addParticipant,
  removeParticipant,
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

const QUICK_EMOJI = ["⚽", "🔥", "😂", "🏆"];

export default function RoomPage({ id }) {
  const [sweepstake, setSweepstake] = useState(undefined);
  const [players, setPlayers] = useState([]);
  const [liveResults, setLiveResults] = useState([]);
  const [messages, setMessages] = useState([]);

  const [joinedName, setJoinedName] = useState(localStorage.getItem(`fwcs-me-${id}`) || "");
  const [joinedNick, setJoinedNick] = useState(localStorage.getItem(`fwcs-nick-${id}`) || "");
  const [name, setName] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joining, setJoining] = useState(false);

  const [chatText, setChatText] = useState("");
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef(null);
  const lastMsgId = useRef(null);

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
      setPlayers(p);
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
      clearInterval(hype);
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Keep chat scrolled to the newest message.
  useEffect(() => {
    const newest = messages[messages.length - 1]?.id;
    if (newest && newest !== lastMsgId.current) {
      lastMsgId.current = newest;
      chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [messages]);

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
  const drawInProgress = !isComplete && liveResults.length > 0;
  const isLocked = sweepstake.locked && !isComplete;
  const hasJoined = Boolean(joinedName);
  const myResult = liveResults.find((r) => r.player_name === joinedName);

  /* ----------------------------- Join ----------------------------------- */

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
      const nick = pickNickname(existing.map((p) => p.nickname));
      await addParticipant(id, trimmed, nick);
      localStorage.setItem(`fwcs-me-${id}`, trimmed);
      localStorage.setItem(`fwcs-nick-${id}`, nick);
      setJoinedName(trimmed);
      setJoinedNick(nick);
      confettiBurst(70);
      refresh();
    } catch {
      setJoinError("Couldn't join just now — try again.");
    } finally {
      setJoining(false);
    }
  }

  async function shareInvite() {
    const url = shareUrl(id);
    const text = `⚽ You're invited to ${sweepstake.name}! Tap the link, type your name, and the wheel gives you a star team + an underdog: ${url}`;
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        /* cancelled — fall through to copy */
      }
    }
    if (await copyText(text)) {
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    }
  }

  /* ----------------------------- Chat ----------------------------------- */

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

  /* ----------------------------- Admin ----------------------------------- */

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
    setEditBig((sweepstake.big_teams || []).join("\n"));
    setEditLesser((sweepstake.lesser_teams || []).join("\n"));
    setEditError("");
    setEditing(true);
  }

  async function saveEdits() {
    setEditError("");
    const newName = editName.trim();
    const bigs = parseTeams(editBig);
    const lessers = parseTeams(editLesser);
    if (!newName) return setEditError("The sweepstake needs a name.");
    if (bigs.length < players.length) return setEditError(`You need at least ${players.length} star teams (one per player).`);
    if (lessers.length < players.length) return setEditError(`You need at least ${players.length} underdogs (one per player).`);
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
    if (!window.confirm(`Remove ${p.name} from the draw?`)) return;
    await removeParticipant(p.id);
    refresh();
  }

  async function toggleLock() {
    const updated = await updateSweepstake(id, { locked: !sweepstake.locked });
    if (updated) setSweepstake(updated);
  }

  /* ----------------------------- Render ----------------------------------- */

  return (
    <>
      <header className="hero hero-small">
        <h1 className="hero-title hero-title-small">{sweepstake.name}</h1>
        <div className="live-row">
          <span className={`live-badge ${isComplete ? "done" : ""}`}>
            <span className="live-dot" />
            {isComplete
              ? "Draw complete 🏆"
              : drawInProgress
              ? `🎡 Drawing live — ${liveResults.length} of ${players.length} done`
              : `${players.length} in the room`}
          </span>
          {isLocked && !drawInProgress && <span className="locked-chip">🔒 Joining locked</span>}
        </div>
      </header>

      {/* Done → your result + everyone's */}
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

      {/* Draw happening right now → results land here live */}
      {drawInProgress && (
        <section className="card join-card">
          <h2 className="card-title">🎡 The wheels are spinning!</h2>
          <p className="muted">Results drop in here the second each player is drawn:</p>
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

      {/* Join card */}
      {!isComplete && !drawInProgress && (
        <section className={`card ${hasJoined ? "joined-banner" : "join-card"}`}>
          {!hasJoined ? (
            isLocked ? (
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
                    autoFocus
                  />
                  <button className="btn btn-primary" onClick={handleJoin} disabled={joining}>
                    {joining ? "…" : "I'm in!"}
                  </button>
                </div>
                <p className="field-hint">You'll get a free nickname on the way in. No refunds.</p>
                {joinError && <p className="error">{joinError}</p>}
              </>
            )
          ) : (
            <div className="joined-inner">
              <div className="joined-emoji">🎉</div>
              <h2 className="card-title">You're in, {joinedName}!</h2>
              {joinedNick && <p className="nick-line">aka “{joinedNick}” 😎</p>}
              <p className="muted">Your teams will land right here after the draw.</p>
            </div>
          )}

          <hr className="divider" />

          <div className="players-head">
            <span className="field-label">In the room</span>
            <span className="count-pill big-pill">{players.length}</span>
          </div>
          {players.length === 0 ? (
            <p className="muted empty-state">Nobody yet — be the first in!</p>
          ) : (
            <div className="player-chips">
              {players.map((p, i) => (
                <span
                  key={p.id}
                  className={`player-chip ${p.name === joinedName ? "is-you" : ""}`}
                  style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}
                  title={p.nickname ? `“${p.nickname}”` : undefined}
                >
                  <span className="chip-avatar" style={{ background: CHIP_COLORS[i % CHIP_COLORS.length] }}>
                    {p.name.trim().charAt(0).toUpperCase()}
                  </span>
                  {p.name}
                  {p.name === joinedName && <span className="you-chip">you</span>}
                  {adminUnlocked && adminOpen && (
                    <button className="kick-btn" onClick={() => kick(p)} aria-label={`Remove ${p.name}`}>✕</button>
                  )}
                </span>
              ))}
            </div>
          )}

          <button className="btn btn-gold btn-big" onClick={shareInvite}>
            {shared ? "Invite copied ✓" : "📲 Invite the family"}
          </button>
        </section>
      )}

      {/* Chat */}
      <section className="card chat-card">
        <div className="players-head">
          <span className="field-label">💬 Room chat</span>
        </div>
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
            <div className="emoji-row">
              {QUICK_EMOJI.map((e) => (
                <button key={e} className="emoji-btn" onClick={() => handleSend(e)} disabled={sending}>{e}</button>
              ))}
            </div>
          </>
        ) : (
          <p className="field-hint">Join with your name to chat.</p>
        )}
      </section>

      {!isComplete && !drawInProgress && <p className="hype-line" key={hypeIdx}>{HYPE_LINES[hypeIdx % HYPE_LINES.length]}</p>}

      <p className="how-2line">
        <strong>How it works:</strong> everyone joins with this link, then two wheels spin live —
        each player wins ⭐ one star team + 🐺 one underdog. Fair, random, saved forever.
      </p>

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
                  {players.length === 0 && <p className="field-hint">You need at least one player to draw.</p>}

                  {!drawInProgress && (
                    <>
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
                      <p className="field-hint">Tip: with this panel open, tap ✕ on a player chip above to remove someone. Everything updates live on every phone. Once the draw finishes, results are locked for good — that's what keeps it fair.</p>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </>
  );
}
