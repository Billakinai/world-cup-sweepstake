import { useEffect, useState } from "react";
import { navigate } from "../App";
import { getSweepstake, listResults } from "../lib/db";
import { resultsToCsv } from "../lib/draw";

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

export default function ResultsPage({ id }) {
  const [sweepstake, setSweepstake] = useState(undefined);
  const [results, setResults] = useState([]);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    let alive = true;
    Promise.all([getSweepstake(id), listResults(id)])
      .then(([s, r]) => {
        if (!alive) return;
        setSweepstake(s);
        setResults(r);
      })
      .catch(() => alive && setSweepstake(null));
    return () => {
      alive = false;
    };
  }, [id]);

  if (sweepstake === undefined) {
    return <div className="card center-card"><p className="muted">Fetching the results…</p></div>;
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
  if (results.length === 0) {
    return (
      <div className="card center-card">
        <h2 className="card-title">{sweepstake.name}</h2>
        <p className="muted">The draw hasn't happened yet. Hold tight!</p>
        <button className="btn btn-primary" onClick={() => navigate(`/room/${id}`)}>
          Back to the room
        </button>
      </div>
    );
  }

  const resultsLink = `${window.location.origin}${window.location.pathname}#/results/${id}`;

  function flash(which) {
    setCopied(which);
    setTimeout(() => setCopied(""), 2000);
  }

  async function copyLink() {
    if (await copyText(resultsLink)) flash("link");
  }

  async function copyWhatsApp() {
    const lines = [
      `🏆 ${sweepstake.name} — the draw is done!`,
      "",
      ...results.map(
        (r) => `${r.nickname || r.player_name}: ⭐ ${r.big_team} + 🐺 ${r.lesser_team}`
      ),
      "",
      `Full results: ${resultsLink}`,
    ];
    if (await copyText(lines.join("\n"))) flash("wa");
  }

  function exportCsv() {
    const blob = new Blob([resultsToCsv(results)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sweepstake.name.replace(/[^\w\- ]+/g, "").trim() || "sweepstake"}-results.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <header className="hero hero-small">
        <div className="hero-badge">🏆 Draw complete</div>
        <h1 className="hero-title hero-title-small">{sweepstake.name}</h1>
        <p className="hero-sub">Everyone got one star team and one underdog. No excuses now.</p>
      </header>

      <section className="results-list">
        {results.map((r, i) => (
          <article className="ticket" key={r.id} style={{ animationDelay: `${Math.min(i, 12) * 60}ms` }}>
            <div className="ticket-left">
              <span className="ticket-order">#{r.draw_order}</span>
              <span className="ticket-name">
                {r.player_name}
                {r.nickname && <span className="player-nick"> “{r.nickname}”</span>}
              </span>
            </div>
            <div className="ticket-teams">
              <span className="combo-chip gold">⭐ {r.big_team}</span>
              <span className="combo-chip green">🐺 {r.lesser_team}</span>
            </div>
          </article>
        ))}
      </section>

      <section className="card">
        <h2 className="card-title">Share the damage</h2>
        <div className="results-actions">
          <button className="btn btn-primary" onClick={copyLink}>
            {copied === "link" ? "Copied ✓" : "Copy results link"}
          </button>
          <button className="btn btn-whatsapp" onClick={copyWhatsApp}>
            {copied === "wa" ? "Copied ✓" : "Copy for WhatsApp 💬"}
          </button>
          <button className="btn btn-ghost" onClick={exportCsv}>Export CSV</button>
          <button className="btn btn-ghost" onClick={() => navigate(`/room/${id}`)}>
            Back to the room
          </button>
        </div>
      </section>
    </>
  );
}
