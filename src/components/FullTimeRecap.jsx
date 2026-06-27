import { useState } from "react";
import { scorePrediction, scoreBreakdown, FINISH_LABELS } from "../lib/predict";
import { buildBanter } from "../lib/banter";
import { avatarUrl } from "../lib/avatars";
import Flag from "./Flag";

const shareSvg = (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
    strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 14V4" />
    <path d="m8.5 7.5 3.5-3.5 3.5 3.5" />
    <path d="M5 12v6.5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5V12" />
  </svg>
);

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

/** Read-only "dramatic finish" view for one scored match. Computes everything
 *  locally from the existing scorer — no DB reads, no DB writes. */
export default function FullTimeRecap({ match, predictions = [], participants = [], joinedName }) {
  const [copied, setCopied] = useState(false);
  if (!match) return null;

  const rows = predictions
    .filter((p) => p.match_id === match.id)
    .map((p) => ({ p, s: scorePrediction(match, p) }))
    .sort((a, b) => b.s - a.s || a.p.name.localeCompare(b.p.name));
  const gained = rows.filter((r) => r.s > 0);
  const cooked = rows.filter((r) => r.s === 0);

  const banter = buildBanter(match, predictions);

  const nickFor = (name) => {
    const x = participants.find(
      (q) => q.name.trim().toLowerCase() === (name || "").trim().toLowerCase()
    );
    return x && x.nickname ? x.nickname : null;
  };

  const caption = [
    match.q_fg !== false ? (match.fg_none ? "No goals" : `First goal ${match.fg_minute}'`) : null,
    match.is_knockout && match.finish_type ? FINISH_LABELS[match.finish_type] : null,
  ]
    .filter(Boolean)
    .join(" · ");

  async function share() {
    const lines = [
      "⏱️ FULL TIME",
      `${match.home} ${match.result_home}–${match.result_away} ${match.away}`,
      caption || null,
      "",
      banter.text,
    ].filter((v) => v !== null);
    if (await copyText(lines.join("\n"))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  }

  // Colour the +N (green) and the word "cooked" (amber) inside the banter.
  const renderBanter = (text) =>
    text.split(/(\+\d+|cooked)/g).map((t, i) => {
      if (/^\+\d+$/.test(t)) return <span key={i} className="recap-plus">{t}</span>;
      if (t === "cooked") return <span key={i} className="recap-cooked-word">{t}</span>;
      return <span key={i}>{t}</span>;
    });

  return (
    <div className="recap-inline">
        {/* FULL TIME hero */}
        <section className="recap-hero">
          <button className="share-mini recap-hero-share" onClick={share} title="Copy for WhatsApp">
            {shareSvg}
          </button>
          <div className="recap-ft"><span className="recap-ft-dot" /> FULL TIME</div>
          <div className="recap-score-row">
            <div className="recap-side">
              <Flag team={match.home} size={50} />
              <span className="recap-team">{match.home}</span>
            </div>
            <span className="recap-score">
              {match.result_home}<span className="recap-dash">–</span>{match.result_away}
            </span>
            <div className="recap-side">
              <Flag team={match.away} size={50} />
              <span className="recap-team">{match.away}</span>
            </div>
          </div>
          {caption && <p className="recap-caption">{caption}</p>}
          {copied && <p className="recap-copied">Copied ✓ — paste it in the group</p>}
        </section>

        {/* Matchday banter */}
        <section className="recap-bot-card">
          <div className="recap-bot-head">
            <span className="recap-bot-avatar">📣</span>
            <span className="recap-bot-meta">
              <span className="recap-bot-name">Matchday</span>
              <span className="recap-bot-sub">full-time report · now</span>
            </span>
          </div>
          <div className="recap-bot-bubble">{renderBanter(banter.text)}</div>
          <div className="recap-bot-foot">
            <button className="recap-share-chat" onClick={share}>
              {copied ? "Copied ✓" : "Copy for WhatsApp 💬"}
            </button>
          </div>
        </section>

        {/* GAINED / GOT COOKED */}
        <section className="recap-points-card">
          <div className="recap-col">
            <span className="recap-gained-label">🎯 Gained</span>
            {gained.length ? (
              gained.map((r, i) => (
                <div className={`recap-gain-row ${i === 0 ? "top" : ""}`} key={r.p.id}>
                  <img className="recap-gain-avatar" src={avatarUrl(r.p.name)} alt="" loading="lazy" />
                  <span className="recap-gain-name">
                    <span className="recap-gain-top">
                      {r.p.name === joinedName ? "You" : r.p.name}
                    </span>
                    {nickFor(r.p.name) && <span className="recap-gain-nick">{nickFor(r.p.name)}</span>}
                  </span>
                  <span className="recap-gain-right">
                    <span className={`recap-gain-pill ${i === 0 ? "top" : ""}`}>+{r.s}</span>
                    <span className="recap-gain-detail">
                      {scoreBreakdown(match, r.p).map((x) => `${x.label} +${x.pts}`).join(" · ")}
                    </span>
                  </span>
                </div>
              ))
            ) : (
              <p className="recap-empty">No points on this one 😅</p>
            )}
          </div>

          <div className="recap-divider" />

          <div className="recap-col">
            <span className="recap-cooked-label">💀 Got cooked</span>
            {cooked.length ? (
              <>
                <div className="recap-cooked-wrap">
                  {cooked.map((r) => (
                    <span className="recap-cooked-chip" key={r.p.id}>
                      {r.p.name === joinedName ? "You" : r.p.name}
                    </span>
                  ))}
                </div>
                <p className="recap-cooked-foot">Nil points, full effort 🫡</p>
              </>
            ) : (
              <p className="recap-empty">Everyone got something this time 🙌</p>
            )}
          </div>
        </section>
    </div>
  );
}
