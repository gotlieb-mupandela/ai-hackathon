/**
 * Supabase client for Auth and app data.
 * Reads config at runtime so `public/config.js` works even if it loads after
 * the bundle is built or the dev server hot-reloads.
 */
import { createClient } from '@supabase/supabase-js';

let cachedClient = null;
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
  if (cachedClient) {
    return cachedClient;
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

  cachedClient = createClient(supabaseUrl, supabaseAnonKey);
  return cachedClient;
}

export const supabase = getSupabaseClient();
