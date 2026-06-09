import { useState } from "react";
import { navigate } from "../App";
import { createSweepstake } from "../lib/db";
import {
  DEFAULT_NAME,
  PRESET_BIG_TEAMS,
  PRESET_LESSER_TEAMS,
  parseTeams,
} from "../lib/draw";

export default function CreatePage() {
  const [name, setName] = useState(DEFAULT_NAME);
  const [pin, setPin] = useState("2026");
  const [bigText, setBigText] = useState(PRESET_BIG_TEAMS.join("\n"));
  const [lesserText, setLesserText] = useState(PRESET_LESSER_TEAMS.join("\n"));
  const [editingTeams, setEditingTeams] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const bigTeams = parseTeams(bigText);
  const lesserTeams = parseTeams(lesserText);

  async function handleCreate() {
    setError("");
    if (!name.trim()) return setError("Give your sweepstake a name.");
    if (!pin.trim() || pin.trim().length < 3) return setError("Choose an admin PIN of at least 3 characters.");
    if (bigTeams.length < 2) return setError("Add at least two star teams.");
    if (lesserTeams.length < 2) return setError("Add at least two underdog teams.");
    const bigSet = new Set(bigTeams.map((t) => t.toLowerCase()));
    const overlap = lesserTeams.filter((t) => bigSet.has(t.toLowerCase()));
    if (overlap.length) return setError(`These teams are in both lists: ${overlap.join(", ")}. Remove the duplicates.`);

    setBusy(true);
    try {
      const row = await createSweepstake({
        name: name.trim(),
        adminPin: pin.trim(),
        bigTeams,
        lesserTeams,
      });
      sessionStorage.setItem(`fwcs-admin-${row.id}`, pin.trim());
      navigate(`/room/${row.id}`);
    } catch {
      setError("Couldn't create the sweepstake. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="hero">
        <div className="hero-badge">⚽ Family sweepstake</div>
        <h1 className="hero-title">
          World Cup
          <span className="hero-gold">Draw Night</span>
        </h1>
        <p className="hero-sub">
          One link. Everyone joins. The wheel gives each person{" "}
          <strong>a star team + an underdog</strong> to scream about all tournament.
        </p>
        <div className="hero-example">
          <span className="combo-chip gold">⭐ Brazil</span>
          <span className="combo-plus">+</span>
          <span className="combo-chip green">🐺 Uzbekistan</span>
        </div>
      </header>

      <section className="card">
        <label className="field">
          <span className="field-label">Name your sweepstake</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Cousins Cup 2026"
            maxLength={60}
          />
        </label>

        <label className="field">
          <span className="field-label">Admin PIN <span className="optional">— only you use this</span></span>
          <input
            className="input"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="e.g. 2026"
            maxLength={20}
          />
        </label>

        <div className="teams-summary">
          <div className="teams-summary-text">
            <span className="field-label">
              <span className="dot gold-dot" /> {bigTeams.length} stars
              <span className="dot green-dot" style={{ marginLeft: 6 }} /> {lesserTeams.length} underdogs
            </span>
            <span className="field-hint">World Cup teams already loaded — you're good to go.</span>
          </div>
          <button type="button" className="btn btn-ghost btn-small" onClick={() => setEditingTeams((v) => !v)}>
            {editingTeams ? "Done" : "Edit teams"}
          </button>
        </div>

        {editingTeams && (
          <div className="team-editor pop-in">
            <label className="field">
              <span className="field-label">
                <span className="dot gold-dot" /> Star teams
                <span className="count-pill">{bigTeams.length}</span>
              </span>
              <textarea className="input textarea" rows={10} value={bigText} onChange={(e) => setBigText(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">
                <span className="dot green-dot" /> Underdog teams
                <span className="count-pill">{lesserTeams.length}</span>
              </span>
              <textarea className="input textarea" rows={10} value={lesserText} onChange={(e) => setLesserText(e.target.value)} />
            </label>
            <p className="field-hint">One team per line. Every player gets one from each list.</p>
          </div>
        )}

        {error && <p className="error">{error}</p>}

        <button className="btn btn-primary btn-big" onClick={handleCreate} disabled={busy}>
          {busy ? "Creating…" : "Create & get your link 🔗"}
        </button>
      </section>

      <p className="how-2line">
        <strong>How it works:</strong> share one link, everyone taps in with their name,
        then two wheels spin live — each player wins ⭐ one star team + 🐺 one underdog. Fair, random, saved.
      </p>
    </>
  );
}
