import { useState } from 'react';
import { AlertCircle, Anchor, Loader2, Lock, LogIn, Mail, Shield, User, UserPlus } from 'lucide-react';

const ROLE_OPTIONS = [
  {
    value: 'reporter',
    label: 'Field Reporter',
    description: 'Submit geotagged marine litter photos and field metadata.',
  },
  {
    value: 'organisation',
    label: 'Organisation Member',
    description: 'View total reported debris, inspect photo metadata, and manage review status.',
  },
];

export default function LoginPage({ onAuthSuccess, redirectMessage }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('reporter');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      if (mode === 'register') {
        const regRes = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), email: email.trim(), password, role }),
        });
        const regBody = await regRes.json().catch(() => ({}));
        if (!regRes.ok) {
          throw new Error(regBody.detail || 'Could not create account.');
        }
      }

      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const loginBody = await loginRes.json().catch(() => ({}));
      if (!loginRes.ok || !loginBody.access_token) {
        throw new Error(loginBody.detail || 'Invalid email or password.');
      }

      const meRes = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${loginBody.access_token}` },
      });
      const meBody = await meRes.json().catch(() => ({}));
      if (!meRes.ok || !meBody.data) {
        throw new Error(meBody.detail || 'Failed to load user profile.');
      }

      onAuthSuccess(loginBody.access_token, meBody.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md py-6">
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
        <div className="border-b border-slate-800 bg-slate-950/60 px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-teal-400/25 bg-teal-400/10 text-teal-300">
              <Anchor size={19} />
            </span>
            <div>
              <h2 className="font-display text-[17px] font-bold text-white">
                {mode === 'login' ? 'Sign in to DriftGuard' : 'Create DriftGuard account'}
              </h2>
              <p className="text-[11px] text-slate-400">
                Access geotagged debris reporting and the Organisation Portal.
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-1.5 rounded-lg border border-slate-800 bg-slate-950 p-1">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError('');
              }}
              className={`flex items-center justify-center gap-1.5 rounded-md py-2 text-[11px] font-semibold transition ${
                mode === 'login'
                  ? 'bg-teal-500/20 text-teal-200 ring-1 ring-teal-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <LogIn size={13} />
              Sign in
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError('');
              }}
              className={`flex items-center justify-center gap-1.5 rounded-md py-2 text-[11px] font-semibold transition ${
                mode === 'register'
                  ? 'bg-teal-500/20 text-teal-200 ring-1 ring-teal-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <UserPlus size={13} />
              Register
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          {redirectMessage && (
            <div className="rounded-lg border border-teal-500/30 bg-teal-500/10 px-3.5 py-2.5 text-[11px] text-teal-200">
              {redirectMessage}
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-red-500/35 bg-red-950/40 px-3.5 py-2.5 text-[11px] text-red-200"
            >
              <AlertCircle size={15} className="mt-0.5 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {mode === 'register' && (
            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-slate-300" htmlFor="auth-name">
                Full name / Organisation name
              </label>
              <div className="relative">
                <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  id="auth-name"
                  type="text"
                  required
                  minLength={2}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Malpe Coastal Team"
                  className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950/80 pl-9 pr-3 text-[12px] text-slate-100 outline-none placeholder:text-slate-600 focus:border-teal-500"
                />
              </div>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-slate-300" htmlFor="auth-email">
              Email address
            </label>
            <div className="relative">
              <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                id="auth-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950/80 pl-9 pr-3 text-[12px] text-slate-100 outline-none placeholder:text-slate-600 focus:border-teal-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-slate-300" htmlFor="auth-password">
              Password {mode === 'register' && <span className="text-slate-500">(min 8 characters)</span>}
            </label>
            <div className="relative">
              <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                id="auth-password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950/80 pl-9 pr-3 text-[12px] text-slate-100 outline-none placeholder:text-slate-600 focus:border-teal-500"
              />
            </div>
          </div>

          {mode === 'register' && (
            <div>
              <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-slate-300">
                <Shield size={13} className="text-teal-300" />
                Account role
              </span>
              <div className="grid gap-2">
                {ROLE_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition ${
                      role === opt.value
                        ? 'border-teal-500/50 bg-teal-500/10'
                        : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={opt.value}
                      checked={role === opt.value}
                      onChange={() => setRole(opt.value)}
                      className="mt-0.5 accent-teal-400"
                    />
                    <span>
                      <span className="block text-[12px] font-semibold text-slate-100">{opt.label}</span>
                      <span className="block text-[10px] text-slate-400">{opt.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-teal-400/30 bg-teal-500/20 text-[12px] font-semibold text-teal-100 transition hover:bg-teal-500/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                {mode === 'login' ? 'Signing in...' : 'Creating account...'}
              </>
            ) : mode === 'login' ? (
              <>
                <LogIn size={15} />
                Sign in
              </>
            ) : (
              <>
                <UserPlus size={15} />
                Create account &amp; sign in
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
