import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';
import { AppRoute, sanitizeReturnTo, validateAuthForm } from './authLogic';

export interface StudioUser {
  id: string;
  email: string;
  displayName: string;
  provider: 'supabase' | 'local_preview';
}

export interface AuthActionResult {
  ok: boolean;
  error?: string;
  needsEmailConfirmation?: boolean;
}

interface AuthContextValue {
  user: StudioUser | null;
  isLoading: boolean;
  isSupabaseConfigured: boolean;
  signInWithEmail: (email: string, password: string) => Promise<AuthActionResult>;
  signUpWithEmail: (params: {
    email: string;
    password: string;
    displayName: string;
    legalConsentAccepted: boolean;
  }) => Promise<AuthActionResult>;
  signInWithGoogle: (returnTo?: AppRoute) => Promise<AuthActionResult>;
  signOut: () => Promise<void>;
}

const LOCAL_SESSION_KEY = 'mixlearn_local_preview_user_v1';
const RETURN_TO_STORAGE_KEY = 'mixlearn_auth_return_to_v1';

const AuthContext = createContext<AuthContextValue | null>(null);

function mapSupabaseUser(raw: {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}): StudioUser {
  const email = raw.email || 'engineer@mixlearn.studio';
  const metaName =
    (typeof raw.user_metadata?.display_name === 'string' && raw.user_metadata.display_name) ||
    (typeof raw.user_metadata?.full_name === 'string' && raw.user_metadata.full_name) ||
    email.split('@')[0];
  return {
    id: raw.id,
    email,
    displayName: metaName,
    provider: 'supabase',
  };
}

function readLocalPreviewUser(): StudioUser | null {
  try {
    const raw = window.sessionStorage.getItem(LOCAL_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StudioUser;
    if (parsed && typeof parsed.id === 'string' && typeof parsed.email === 'string') {
      return parsed;
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

function writeLocalPreviewUser(user: StudioUser | null): void {
  try {
    if (user) {
      window.sessionStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(user));
    } else {
      window.sessionStorage.removeItem(LOCAL_SESSION_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export function storePendingReturnTo(route: AppRoute): void {
  try {
    window.sessionStorage.setItem(RETURN_TO_STORAGE_KEY, sanitizeReturnTo(route));
  } catch {
    // ignore
  }
}

export function consumePendingReturnTo(): AppRoute | null {
  try {
    const raw = window.sessionStorage.getItem(RETURN_TO_STORAGE_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(RETURN_TO_STORAGE_KEY);
    return sanitizeReturnTo(raw);
  } catch {
    return null;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<StudioUser | null>(() =>
    isSupabaseConfigured ? null : readLocalPreviewUser()
  );
  const [isLoading, setIsLoading] = useState<boolean>(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setIsLoading(false);
      return;
    }

    let mounted = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        const nextUser = data.session?.user ? mapSupabaseUser(data.session.user) : null;
        setUser(nextUser);
        setIsLoading(false);
      })
      .catch(() => {
        if (!mounted) return;
        setUser(null);
        setIsLoading(false);
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setUser(session?.user ? mapSupabaseUser(session.user) : null);
      setIsLoading(false);
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signInWithEmail = useCallback(
    async (email: string, password: string): Promise<AuthActionResult> => {
      const check = validateAuthForm({ mode: 'login', email, password });
      if (!check.valid) {
        return { ok: false, error: check.error };
      }

      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) {
          return { ok: false, error: error.message };
        }
        if (data.user) {
          setUser(mapSupabaseUser(data.user));
        }
        return { ok: true };
      }

      // Preview / CI environment without Supabase env vars:
      // creates an isolated browser-session account after full validation.
      const cleanEmail = email.trim().toLowerCase();
      const previewUser: StudioUser = {
        id: `local-${cleanEmail.replace(/[^a-z0-9]/g, '').slice(0, 16) || 'user'}`,
        email: cleanEmail,
        displayName: cleanEmail.split('@')[0],
        provider: 'local_preview',
      };
      writeLocalPreviewUser(previewUser);
      setUser(previewUser);
      return { ok: true };
    },
    []
  );

  const signUpWithEmail = useCallback(
    async (params: {
      email: string;
      password: string;
      displayName: string;
      legalConsentAccepted: boolean;
    }): Promise<AuthActionResult> => {
      const check = validateAuthForm({
        mode: 'signup',
        email: params.email,
        password: params.password,
        displayName: params.displayName,
        legalConsentAccepted: params.legalConsentAccepted,
      });
      if (!check.valid) {
        return { ok: false, error: check.error };
      }

      const cleanEmail = params.email.trim();
      const cleanName = params.displayName.trim() || cleanEmail.split('@')[0];

      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password: params.password,
          options: {
            data: {
              display_name: cleanName,
              legal_consent_accepted_at: new Date().toISOString(),
            },
          },
        });
        if (error) {
          return { ok: false, error: error.message };
        }
        if (data.session?.user) {
          setUser(mapSupabaseUser(data.session.user));
          return { ok: true };
        }
        return { ok: true, needsEmailConfirmation: true };
      }

      const previewUser: StudioUser = {
        id: `local-${cleanEmail.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16) || 'user'}`,
        email: cleanEmail.toLowerCase(),
        displayName: cleanName,
        provider: 'local_preview',
      };
      writeLocalPreviewUser(previewUser);
      setUser(previewUser);
      return { ok: true };
    },
    []
  );

  const signInWithGoogle = useCallback(
    async (returnTo: AppRoute = '/simple'): Promise<AuthActionResult> => {
      const safeTarget = sanitizeReturnTo(returnTo);
      storePendingReturnTo(safeTarget);

      if (isSupabaseConfigured && supabase) {
        const redirectTo = `${window.location.origin}${safeTarget}`;
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo },
        });
        if (error) {
          return { ok: false, error: error.message };
        }
        return { ok: true };
      }

      return {
        ok: false,
        error:
          'Google OAuth requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to be configured with Google enabled in your Supabase project.',
      };
    },
    []
  );

  const signOut = useCallback(async () => {
    if (isSupabaseConfigured && supabase) {
      await supabase.auth.signOut().catch(() => {});
    }
    writeLocalPreviewUser(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isSupabaseConfigured,
        signInWithEmail,
        signUpWithEmail,
        signInWithGoogle,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>.');
  }
  return ctx;
}
