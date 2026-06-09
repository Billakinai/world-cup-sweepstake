import { supabase, hasSupabase } from "../supabaseClient";

/* ---------------------------------------------------------------------------
 * Data layer. Uses Supabase when configured; otherwise a silent local
 * fallback so the app can be previewed before the database is connected.
 * Pages never need to know which one is active.
 * ------------------------------------------------------------------------- */

const LS_KEY = "fwcs-local-db-v1";

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

export async function addParticipant(sweepstakeId, name, nickname) {
  if (hasSupabase) {
    const { data, error } = await supabase
      .from("participants")
      .insert({ sweepstake_id: sweepstakeId, name, nickname: nickname || null })
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  const db = localDb();
  const row = {
    id: uid(),
    sweepstake_id: sweepstakeId,
    name,
    nickname: nickname || null,
    created_at: new Date().toISOString(),
  };
  db.participants.push(row);
  saveLocal(db);
  return row;
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
