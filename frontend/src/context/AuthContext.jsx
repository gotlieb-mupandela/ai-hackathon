/**
 * Auth context: session state, signUp, signIn, signOut, and role detection.
 * Listens to Supabase auth state changes so login/logout stay in sync.
 *
 * Roles: 'admin' | 'designer' | null
 * - Admin: Can manage designers and see all uploads
 * - Designer: Can upload pages and see only their own uploads
 *
 * First user to sign up (when admins table is empty) is bootstrapped as admin.
 */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getSupabaseClient } from '../lib/supabase';

const AuthContext = createContext(null);

function clearStaleSupabaseTokens() {
  if (typeof window === 'undefined') return;
  try {
    const keysToRemove = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (k && k.includes('auth-token')) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // ignore storage errors
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  /**
   * Detect role by calling the backend /auth/role endpoint.
   * The backend uses the Supabase service role key which bypasses RLS,
   * ensuring the admins table is always readable regardless of RLS policies.
   */
  const detectRole = async (userEmail, accessToken) => {
    if (!userEmail) {
      setRole(null);
      return null;
    }

    // Fall back to session token from Supabase if not explicitly passed
    const token = accessToken || (await getSupabaseClient()?.auth.getSession())
      ?.data?.session?.access_token;

    if (!token) {
      setRole(null);
      return null;
    }

    try {
      const res = await fetch('http://localhost:8000/auth/role', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        console.warn('Role check failed:', res.status);
        setRole(null);
        return null;
      }

      const { role: detectedRole } = await res.json();
      setRole(detectedRole || null);
      return detectedRole || null;
    } catch (err) {
      console.error('Error detecting role from backend:', err);
      setRole(null);
      return null;
    }
  };

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setLoading(false);
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setLoading(false);
    };
    supabase.auth.getSession().then(async ({ data: { session: s }, error }) => {
      if (error && String(error.message || '').includes('Invalid Refresh Token')) {
        clearStaleSupabaseTokens();
        await supabase.auth.signOut();
        setSession(null);
        setUser(null);
        setRole(null);
        finish();
        return;
      }
      setSession(s);
      setUser(s?.user ?? null);
      finish();
      if (s?.user?.email) {
        detectRole(s.user.email);
      } else {
        // Auto sign-in as admin when no session (e.g. admin@gmail.com)
        const autoEmail = process.env.REACT_APP_AUTO_LOGIN_EMAIL || 'admin@gmail.com';
        const autoPassword = process.env.REACT_APP_AUTO_LOGIN_PASSWORD;
        if (autoPassword) {
          supabase.auth.signInWithPassword({ email: autoEmail, password: autoPassword })
            .then(({ data, error }) => {
              if (error) {
                console.warn('Auto-login failed:', error.message);
                return;
              }
              setSession(data.session);
              setUser(data.user);
              if (data.user?.email) detectRole(data.user.email);
            });
        }
      }
    }).catch(finish);
    const fallback = setTimeout(finish, 3000);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (!s?.user?.email) {
        setRole(null);
        return;
      }
      // Detect role on every auth state change (including after sign-in)
      detectRole(s.user.email);
    });

    return () => {
      clearTimeout(fallback);
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email, password) => {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase is not configured.');
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    
    // After signup, check if admins table is empty - if so, make this user an admin
    if (data.user) {
      try {
        const { count } = await supabase
          .from('admins')
          .select('*', { count: 'exact', head: true });
        
        if (count === 0) {
          await supabase.from('admins').insert({ email: data.user.email });
          setRole('admin');
        }
      } catch (err) {
        console.error('Error checking/creating first admin:', err);
      }
    }
    
    return data;
  };

  const signIn = async (email, password) => {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase is not configured.');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    let roleResult = null;
    if (data.user && data.session) {
      await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
      // Pass the fresh access token so detectRole can authenticate with the backend
      roleResult = await detectRole(data.user.email, data.session.access_token);
    }
    return { ...data, role: roleResult };
  };

  const signOut = async () => {
    const supabase = getSupabaseClient();
    if (supabase) await supabase.auth.signOut();
    setRole(null);
  };

  /** Re-run role detection for current user (e.g. after login so PrivateLayout can resolve role). */
  const refreshRole = useCallback(async () => {
    if (user?.email) await detectRole(user.email);
  }, [user?.email]);

  const value = {
    user,
    session,
    role,
    loading,
    signUp,
    signIn,
    signOut,
    refreshRole,
    isAuthenticated: !!user,
    isAdmin: role === 'admin',
    isDesigner: role === 'designer',
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
