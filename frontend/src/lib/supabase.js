/**
 * Supabase client for Auth and app data.
 * Reads config at runtime so `public/config.js` works even if it loads after
 * the bundle is built or the dev server hot-reloads.
 */
import { createClient } from '@supabase/supabase-js';

// Use window-level key so the singleton survives hot-module reloads in dev
const SINGLETON_KEY = '__newera_supabase_client__';
let warnedMissingConfig = false;

function readSupabaseConfig() {
  const runtimeUrl =
    typeof window !== 'undefined' ? window.__SUPABASE_URL__ || '' : '';
  const runtimeAnonKey =
    typeof window !== 'undefined' ? window.__SUPABASE_ANON_KEY__ || '' : '';

  return {
    supabaseUrl: process.env.REACT_APP_SUPABASE_URL || runtimeUrl || '',
    supabaseAnonKey:
      process.env.REACT_APP_SUPABASE_ANON_KEY || runtimeAnonKey || '',
  };
}

export function getSupabaseClient() {
  if (typeof window !== 'undefined' && window[SINGLETON_KEY]) {
    return window[SINGLETON_KEY];
  }

  const { supabaseUrl, supabaseAnonKey } = readSupabaseConfig();

  if (!supabaseUrl || !supabaseAnonKey) {
    if (!warnedMissingConfig) {
      warnedMissingConfig = true;
      console.warn(
        'Supabase URL or anon key missing. Set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY in .env or public/config.js.'
      );
    }
    return null;
  }

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  if (typeof window !== 'undefined') {
    window[SINGLETON_KEY] = client;
  }

  return client;
}

export const supabase = getSupabaseClient();
