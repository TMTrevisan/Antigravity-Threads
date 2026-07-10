'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface AuthGateProps {
  children: React.ReactNode;
}

export default function AuthGate({ children }: AuthGateProps) {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // 1. Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      // Inject Authorization Bearer token into global fetch headers
      if (session?.access_token) {
        window.fetch = new Proxy(window.fetch, {
          apply(target, thisArg, argumentsList) {
            const [resource, config = {}] = argumentsList;
            if (config.headers === undefined) {
              config.headers = {};
            }
            if (config.headers instanceof Headers) {
              config.headers.set('Authorization', `Bearer ${session.access_token}`);
            } else if (Array.isArray(config.headers)) {
              config.headers.push(['Authorization', `Bearer ${session.access_token}`]);
            } else {
              config.headers['Authorization'] = `Bearer ${session.access_token}`;
            }
            argumentsList[1] = config;
            return Reflect.apply(target, thisArg, argumentsList);
          }
        });
      }
      setLoading(false);
    });

    // 2. Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.access_token) {
        window.fetch = new Proxy(window.fetch, {
          apply(target, thisArg, argumentsList) {
            const [resource, config = {}] = argumentsList;
            if (config.headers === undefined) {
              config.headers = {};
            }
            if (config.headers instanceof Headers) {
              config.headers.set('Authorization', `Bearer ${session.access_token}`);
            } else if (Array.isArray(config.headers)) {
              config.headers.push(['Authorization', `Bearer ${session.access_token}`]);
            } else {
              config.headers['Authorization'] = `Bearer ${session.access_token}`;
            }
            argumentsList[1] = config;
            return Reflect.apply(target, thisArg, argumentsList);
          }
        });
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setSubmitting(true);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        setSuccessMsg('Verification email sent! Please check your inbox.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex flex-col items-center justify-center">
        <div className="w-8 h-8 border-2 border-t-[var(--accent-terracotta)] border-[#EAE5D9] rounded-full animate-spin"></div>
        <p className="mt-4 text-[var(--text-secondary)] text-xs font-bold uppercase tracking-wider">Establishing secure locker session...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-md bg-white border border-[#EAE5D9] p-8 rounded-3xl shadow-xl shadow-stone-200/50 space-y-6">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-[var(--bg-card-primary)] border border-[#EAE5D9] flex items-center justify-center mx-auto shadow-inner p-1.5">
              <img src="/icon-192.png" alt="Atelier Logo" className="w-full h-full object-contain" />
            </div>
            <h2 className="text-xl font-extrabold text-[var(--text-primary)] tracking-tight">Atelier Closet Vault</h2>
            <p className="text-[var(--text-secondary)] text-xs font-semibold">Your personal wardrobe, isolated and secured.</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-[var(--text-secondary)]">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-[#FAF8F5] border border-[#EAE5D9] rounded-xl p-3 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-terracotta)]/40"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-[var(--text-secondary)]">Locker Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#FAF8F5] border border-[#EAE5D9] rounded-xl p-3 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-terracotta)]/40"
              />
            </div>

            {errorMsg && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-600 rounded-xl text-xs font-bold leading-relaxed">
                ⚠️ {errorMsg}
              </div>
            )}

            {successMsg && (
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-600 rounded-xl text-xs font-bold leading-relaxed">
                ✉️ {successMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-[var(--accent-terracotta)] text-white font-extrabold text-xs uppercase tracking-wider rounded-xl hover:bg-[var(--accent-terracotta)]/90 active:scale-[0.98] transition shadow-md"
            >
              {submitting ? 'Processing...' : isSignUp ? 'Create Secured Account' : 'Decrypt Closet Locker'}
            </button>
          </form>

          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setErrorMsg('');
                setSuccessMsg('');
              }}
              className="text-xs text-[var(--accent-terracotta)] hover:underline font-bold"
            >
              {isSignUp ? 'Already have an account? Decrypt here' : "Need a personal locker? Register here"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
