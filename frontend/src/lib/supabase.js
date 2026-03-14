/**
 * Supabase singleton client.
 *
 * The window-level check at the TOP of this module ensures only ONE
 * GoTrueClient is ever created, even when Webpack HMR re-executes the
 * module (React Fast Refresh). Storing on `window` survives hot reloads;
 * a normal module variable would reset to null on every HMR cycle.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL     = process.env.REACT_APP_SUPABASE_URL      || '';
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || '';

const SINGLETON_KEY = '__newera_supabase__';

function _build() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn(
      '[supabase] Missing REACT_APP_SUPABASE_URL or REACT_APP_SUPABASE_ANON_KEY'
    );
    return null;
  }
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession:    true,
      autoRefreshToken:  true,
      detectSessionInUrl: true,
    },
  });
}

// Guard: create only once per browser context, never during HMR re-runs
if (typeof window !== 'undefined' && !window[SINGLETON_KEY]) {
  window[SINGLETON_KEY] = _build();
}

/** The single shared Supabase client. Import this directly. */
export const supabase =
  typeof window !== 'undefined' ? window[SINGLETON_KEY] : _build();

/** Backwards-compat helper used by older code paths. */
export function getSupabaseClient() {
  return supabase;
}
