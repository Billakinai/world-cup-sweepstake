import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// If env vars are missing (e.g. local preview before setup), the app falls
// back to in-browser storage so the screens still work. Nothing about this
// is ever shown to players in the UI.
export const hasSupabase = Boolean(url && anonKey);

export const supabase = hasSupabase ? createClient(url, anonKey) : null;
