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

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  // Detect user role based on admins and designers tables. Returns 'admin' | 'designer' | null.
  const detectRole = async (userEmail) => {
    // #region agent log
    fetch('http://127.0.0.1:7680/ingest/252db5ef-7e2f-445f-a476-cb337fcdcf2d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2b4bbe'},body:JSON.stringify({sessionId:'2b4bbe',location:'AuthContext.jsx:detectRole:entry',message:'detectRole called',data:{email:userEmail?.substring(0,3)+'***'},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    const supabase = getSupabaseClient();
    if (!supabase || !userEmail) {
      setRole(null);
      return null;
    }

    try {
      // Check if user is admin
      const { data: adminData, error: adminError } = await supabase
        .from('admins')
        .select('email')
        .eq('email', userEmail)
        .maybeSingle();

      // #region agent log
      fetch('http://127.0.0.1:7680/ingest/252db5ef-7e2f-445f-a476-cb337fcdcf2d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2b4bbe'},body:JSON.stringify({sessionId:'2b4bbe',location:'AuthContext.jsx:detectRole:adminCheck',message:'admins query result',data:{hasAdminData:!!adminData,adminError:adminError?.message},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
      // #endregion

      if (!adminError && adminData) {
        setRole('admin');
        return 'admin';
      }

      // Check if user is designer
      const { data: designerData, error: designerError } = await supabase
        .from('designers')
        .select('email')
        .eq('email', userEmail)
        .maybeSingle();

      if (!designerError && designerData) {
        setRole('designer');
        return 'designer';
      }

      // Not in either table: try to bootstrap as first admin
      try {
        const { count } = await supabase
          .from('admins')
          .select('*', { count: 'exact', head: true });

        if (count === 0) {
          await supabase.from('admins').insert({ email: userEmail.trim().toLowerCase() });
          setRole('admin');
          return 'admin';
        }
      } catch (err) {
        console.warn('Bootstrap admin check failed:', err);
      }

      // #region agent log
      fetch('http://127.0.0.1:7680/ingest/252db5ef-7e2f-445f-a476-cb337fcdcf2d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2b4bbe'},body:JSON.stringify({sessionId:'2b4bbe',location:'AuthContext.jsx:detectRole:setNull',message:'setting role to null',data:{},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
      setRole(null);
      return null;
    } catch (err) {
      // #region agent log
      fetch('http://127.0.0.1:7680/ingest/252db5ef-7e2f-445f-a476-cb337fcdcf2d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2b4bbe'},body:JSON.stringify({sessionId:'2b4bbe',location:'AuthContext.jsx:detectRole:catch',message:'detectRole threw',data:{err:err?.message},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
      console.error('Error detecting role:', err);
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
    supabase.auth.getSession().then(({ data: { session: s } }) => {
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
      // Only run detectRole when restoring session on initial load (INITIAL_SESSION).
      // Skip SIGNED_IN and TOKEN_REFRESHED so we never overwrite role after sign-in or token refresh (those can race and set role to null).
      if (event !== 'INITIAL_SESSION') return;
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
      // Ensure the client uses this session for the next request (RLS needs the JWT).
      await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
      roleResult = await detectRole(data.user.email);
    }
    // #region agent log
    fetch('http://127.0.0.1:7680/ingest/252db5ef-7e2f-445f-a476-cb337fcdcf2d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2b4bbe'},body:JSON.stringify({sessionId:'2b4bbe',location:'AuthContext.jsx:signIn:return',message:'signIn returning',data:{roleReturned:roleResult},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
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
