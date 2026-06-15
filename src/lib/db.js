import { supabase, hasSupabase } from "../supabaseClient";

/* ---------------------------------------------------------------------------
 * Data layer. Uses Supabase when configured; otherwise a silent local
 * fallback so the app can be previewed before the database is connected.
 * Pages never need to know which one is active.
 * ------------------------------------------------------------------------- */

const LS_KEY = "fwcs-local-db-v1";

function ensureGameTables(db) {
  if (!db.matches) db.matches = [];
  if (!db.predictions) db.predictions = [];
  return db;
}

function localDb() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY)) || { sweepstakes: {}, participants: [], results: [] };
  } catch {
    return { sweepstakes: {}, participants: [], results: [] };
  }
}
function saveLocal(db) {
  localStorage.setItem(LS_KEY, JSON.stringify(db));
}
function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
}

export async function createSweepstake({ name, adminPin, bigTeams, lesserTeams }) {
  if (hasSupabase) {
    const { data, error } = await supabase
      .from("sweepstakes")
      .insert({ name, admin_pin: adminPin, big_teams: bigTeams, lesser_teams: lesserTeams })
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  const db = localDb();
  const row = {
    id: uid(),
    name,
    admin_pin: adminPin,
    big_teams: bigTeams,
    lesser_teams: lesserTeams,
    status: "open",
    locked: false,
    created_at: new Date().toISOString(),
  };
  db.sweepstakes[row.id] = row;
  saveLocal(db);
  return row;
}

export async function getSweepstake(id) {
  if (hasSupabase) {
    const { data, error } = await supabase.from("sweepstakes").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data;
  }
  return localDb().sweepstakes[id] || null;
}

export async function updateSweepstake(id, patch) {
  if (hasSupabase) {
    const { data, error } = await supabase.from("sweepstakes").update(patch).eq("id", id).select().single();
    if (error) throw error;
    return data;
  }
  const db = localDb();
  if (!db.sweepstakes[id]) return null;
  db.sweepstakes[id] = { ...db.sweepstakes[id], ...patch };
  saveLocal(db);
  return db.sweepstakes[id];
}

export async function listParticipants(sweepstakeId) {
  if (hasSupabase) {
    const { data, error } = await supabase
      .from("participants")
      .select("*")
      .eq("sweepstake_id", sweepstakeId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data || [];
  }
  return localDb()
    .participants.filter((p) => p.sweepstake_id === sweepstakeId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function addParticipant(sweepstakeId, name, nickname, role = "player", bonus = 0) {
  const bonus_points = Number(bonus) || 0;
  if (hasSupabase) {
    const { data, error } = await supabase
      .from("participants")
      .insert({ sweepstake_id: sweepstakeId, name, nickname: nickname || null, role, bonus_points })
      .select()
      .single();
    if (!error) return data;
    // If newer columns (role / bonus_points) don't exist yet, retry with the
    // basics so joining never breaks.
    const retry = await supabase
      .from("participants")
      .insert({ sweepstake_id: sweepstakeId, name, nickname: nickname || null })
      .select()
      .single();
    if (retry.error) throw retry.error;
    return retry.data;
  }
  const db = localDb();
  const row = {
    id: uid(),
    sweepstake_id: sweepstakeId,
    name,
    nickname: nickname || null,
    role,
    bonus_points,
    created_at: new Date().toISOString(),
  };
  db.participants.push(row);
  saveLocal(db);
  return row;
}

/** Admin: set a player's starting/carry-over points (added on top of points
 *  earned from predictions). Used to seed an existing leaderboard. */
export async function setParticipantBonus(participantId, bonus) {
  const bonus_points = Number(bonus) || 0;
  if (hasSupabase) {
    const { data, error } = await supabase
      .from("participants")
      .update({ bonus_points })
      .eq("id", participantId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  const db = localDb();
  const p = db.participants.find((x) => x.id === participantId);
  if (p) {
    p.bonus_points = bonus_points;
    saveLocal(db);
  }
  return p || null;
}

export async function listResults(sweepstakeId) {
  if (hasSupabase) {
    const { data, error } = await supabase
      .from("results")
      .select("*")
      .eq("sweepstake_id", sweepstakeId)
      .order("draw_order", { ascending: true });
    if (error) throw error;
    return data || [];
  }
  return localDb()
    .results.filter((r) => r.sweepstake_id === sweepstakeId)
    .sort((a, b) => a.draw_order - b.draw_order);
}

/** Save a single participant's result the moment their wheels finish. */
export async function saveOneResult(sweepstakeId, row) {
  if (hasSupabase) {
    const { data, error } = await supabase
      .from("results")
      .insert({ ...row, sweepstake_id: sweepstakeId })
      .select()
      .single();
    if (error) {
      // Unique constraint: this player/team was already saved (double tap or
      // second device). Treat the stored row as the truth.
      const existing = await listResults(sweepstakeId);
      const found = existing.find((r) => r.participant_id === row.participant_id);
      if (found) return found;
      throw error;
    }
    return data;
  }
  const db = localDb();
  const dup = db.results.find(
    (r) => r.sweepstake_id === sweepstakeId && r.participant_id === row.participant_id
  );
  if (dup) return dup;
  const stamped = { ...row, id: uid(), sweepstake_id: sweepstakeId, created_at: new Date().toISOString() };
  db.results.push(stamped);
  saveLocal(db);
  return stamped;
}

/** Mark the sweepstake finished once every player has been drawn. */
export async function markComplete(sweepstakeId) {
  return updateSweepstake(sweepstakeId, { status: "complete", locked: true });
}

export async function saveResults(sweepstakeId, rows) {
  if (hasSupabase) {
    // Guard: never overwrite an existing draw.
    const existing = await listResults(sweepstakeId);
    if (existing.length > 0) return existing;
    const { data, error } = await supabase
      .from("results")
      .insert(rows.map((r) => ({ ...r, sweepstake_id: sweepstakeId })))
      .select();
    if (error) {
      // A unique-constraint failure means another device saved first; use theirs.
      const again = await listResults(sweepstakeId);
      if (again.length > 0) return again;
      throw error;
    }
    await updateSweepstake(sweepstakeId, { status: "complete", locked: true });
    return data.sort((a, b) => a.draw_order - b.draw_order);
  }
  const db = localDb();
  const existing = db.results.filter((r) => r.sweepstake_id === sweepstakeId);
  if (existing.length > 0) return existing.sort((a, b) => a.draw_order - b.draw_order);
  const stamped = rows.map((r) => ({
    ...r,
    id: uid(),
    sweepstake_id: sweepstakeId,
    created_at: new Date().toISOString(),
  }));
  db.results.push(...stamped);
  if (db.sweepstakes[sweepstakeId]) {
    db.sweepstakes[sweepstakeId].status = "complete";
    db.sweepstakes[sweepstakeId].locked = true;
  }
  saveLocal(db);
  return stamped;
}

/* ----------------------------- Chat ------------------------------------- */

export async function listMessages(sweepstakeId, limit = 40) {
  if (hasSupabase) {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("sweepstake_id", sweepstakeId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []).reverse();
  }
  const db = localDb();
  db.messages = db.messages || [];
  return db.messages
    .filter((m) => m.sweepstake_id === sweepstakeId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .slice(-limit);
}

export async function sendMessage(sweepstakeId, name, text) {
  const clean = text.trim().slice(0, 240);
  if (!clean) return null;
  if (hasSupabase) {
    const { data, error } = await supabase
      .from("messages")
      .insert({ sweepstake_id: sweepstakeId, name, text: clean })
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  const db = localDb();
  db.messages = db.messages || [];
  const row = { id: uid(), sweepstake_id: sweepstakeId, name, text: clean, created_at: new Date().toISOString() };
  db.messages.push(row);
  saveLocal(db);
  return row;
}

/** Admin: remove a player before the draw. */
export async function removeParticipant(participantId) {
  if (hasSupabase) {
    const { error } = await supabase.from("participants").delete().eq("id", participantId);
    if (error) throw error;
    return true;
  }
  const db = localDb();
  db.participants = db.participants.filter((p) => p.id !== participantId);
  saveLocal(db);
  return true;
}

/** Admin: move someone between the draw and the stands. */
export async function setParticipantRole(participantId, role) {
  if (hasSupabase) {
    const { data, error } = await supabase
      .from("participants")
      .update({ role })
      .eq("id", participantId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  const db = localDb();
  const p = db.participants.find((x) => x.id === participantId);
  if (p) {
    p.role = role;
    saveLocal(db);
  }
  return p || null;
}

/* ---------------- Predictions mini-game ---------------- */

export async function listMatches(sweepstakeId) {
  if (hasSupabase) {
    const { data, error } = await supabase
      .from("matches")
      .select("*")
      .eq("sweepstake_id", sweepstakeId)
      .order("kickoff_at", { ascending: true });
    if (error) throw error;
    return data || [];
  }
  const db = ensureGameTables(localDb());
  return db.matches
    .filter((m) => m.sweepstake_id === sweepstakeId)
    .sort((a, b) => new Date(a.kickoff_at) - new Date(b.kickoff_at));
}

export async function addMatch(sweepstakeId, { home, away, kickoff_at, is_knockout, q_fg = true, q_score = true, q_winner = false }) {
  const row = {
    sweepstake_id: sweepstakeId, home, away, kickoff_at,
    is_knockout: !!is_knockout, q_fg, q_score, q_winner,
  };
  if (hasSupabase) {
    const { data, error } = await supabase.from("matches").insert(row).select().single();
    if (!error) return data;
    // Question columns may not exist yet — retry with the basics so nothing breaks.
    const basic = { sweepstake_id: sweepstakeId, home, away, kickoff_at, is_knockout: !!is_knockout };
    const retry = await supabase.from("matches").insert(basic).select().single();
    if (retry.error) throw retry.error;
    return retry.data;
  }
  const db = ensureGameTables(localDb());
  const full = {
    id: uid(), ...row, result_home: null, result_away: null, fg_minute: null,
    fg_none: false, finish_type: null, winner_side: null, status: "upcoming", created_at: new Date().toISOString(),
  };
  db.matches.push(full);
  saveLocal(db);
  return full;
}

export async function updateMatch(matchId, patch) {
  if (hasSupabase) {
    const { data, error } = await supabase.from("matches").update(patch).eq("id", matchId).select().single();
    if (error) throw error;
    return data;
  }
  const db = ensureGameTables(localDb());
  const m = db.matches.find((x) => x.id === matchId);
  if (m) { Object.assign(m, patch); saveLocal(db); }
  return m || null;
}

export async function deleteMatch(matchId) {
  if (hasSupabase) {
    const { error } = await supabase.from("matches").delete().eq("id", matchId);
    if (error) throw error;
    return;
  }
  const db = ensureGameTables(localDb());
  db.matches = db.matches.filter((x) => x.id !== matchId);
  db.predictions = db.predictions.filter((x) => x.match_id !== matchId);
  saveLocal(db);
}

export async function listPredictions(sweepstakeId) {
  if (hasSupabase) {
    const { data, error } = await supabase
      .from("predictions")
      .select("*")
      .eq("sweepstake_id", sweepstakeId);
    if (error) throw error;
    return data || [];
  }
  const db = ensureGameTables(localDb());
  return db.predictions.filter((p) => p.sweepstake_id === sweepstakeId);
}

/** One shot per person per match — the unique constraint makes changes impossible. */
export async function addPrediction(matchId, sweepstakeId, name, payload) {
  const row = {
    match_id: matchId,
    sweepstake_id: sweepstakeId,
    name,
    fg_minute: payload.fg_none ? null : payload.fg_minute,
    fg_none: !!payload.fg_none,
    home: payload.home,
    away: payload.away,
    winner: payload.winner || null,
    finish_type: payload.finish_type || null,
  };
  if (hasSupabase) {
    const { data, error } = await supabase.from("predictions").insert(row).select().single();
    if (!error) return data;
    const { winner, ...basic } = row;
    const retry = await supabase.from("predictions").insert(basic).select().single();
    if (retry.error) throw retry.error;
    return retry.data;
  }
  const db = ensureGameTables(localDb());
  if (db.predictions.some((p) => p.match_id === matchId && p.name.toLowerCase() === name.toLowerCase())) {
    throw new Error("already predicted");
  }
  const full = { id: uid(), ...row, created_at: new Date().toISOString() };
  db.predictions.push(full);
  saveLocal(db);
  return full;
}