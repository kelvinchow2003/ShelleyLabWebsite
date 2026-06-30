import { useState, type FormEvent } from 'react';
import { Loader2, FolderKanban, Package, BarChart3 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ShelleyMark } from './Logo';

const FEATURES = [
  { icon: FolderKanban, text: 'Track projects across all five labs' },
  { icon: Package, text: 'Manage equipment loans & live inventory' },
  { icon: BarChart3, text: 'Full audit trail and analytics dashboard' },
];

export function AuthPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-gray-100">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center gap-10 p-6 lg:flex-row lg:gap-20">
        {/* Hero panel (desktop) */}
        <div className="hidden max-w-md flex-1 lg:block">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-lg ring-1 ring-gray-100">
            <ShelleyMark className="h-11 w-11" />
          </div>
          <h1 className="text-4xl font-bold leading-tight text-gray-900">
            <span className="text-slate-700">Shelley</span>
            <span className="font-medium text-gray-400">Automation</span>
            <span className="text-blue-600"> Lab</span>
          </h1>
          <p className="mt-3 text-lg text-gray-500">
            The internal hub for lab projects and equipment — organized, auditable,
            always up to date.
          </p>
          <ul className="mt-8 space-y-3">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <li key={f.text} className="flex items-center gap-3 text-gray-700">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <Icon className="h-5 w-5" />
                  </span>
                  {f.text}
                </li>
              );
            })}
          </ul>
        </div>

        {/* Form column */}
        <div className="w-full max-w-md flex-1">
          {/* Compact brand (mobile only) */}
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-xl bg-white shadow-lg ring-1 ring-gray-100">
              <ShelleyMark className="h-11 w-11" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">
              <span className="text-slate-700">Shelley</span>
              <span className="font-medium text-gray-400">Automation</span>
              <span className="ml-1 text-blue-600">Lab</span>
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Internal project &amp; equipment management
            </p>
          </div>
          {mode === 'login' ? (
            <LoginCard onSwitch={() => setMode('signup')} />
          ) : (
            <SignUpCard onSwitch={() => setMode('login')} />
          )}
          <p className="mt-6 text-center text-xs text-gray-400">
            Shelley Automation · Internal use only
          </p>
        </div>
      </div>
    </div>
  );
}

function LoginCard({ onSwitch }: { onSwitch: () => void }) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign in');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Sign in</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field
          label="Email"
          id="login-email"
          type="email"
          value={email}
          onChange={setEmail}
          required
          autoComplete="email"
        />
        <Field
          label="Password"
          id="login-password"
          type="password"
          value={password}
          onChange={setPassword}
          required
          autoComplete="current-password"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Sign in
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-gray-500">
        Don&apos;t have an account?{' '}
        <button onClick={onSwitch} className="font-medium text-blue-600 hover:underline">
          Create one
        </button>
      </p>
    </div>
  );
}

function SignUpCard({ onSwitch }: { onSwitch: () => void }) {
  const { signUp } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    setSubmitting(true);
    try {
      await signUp(email, password, displayName);
      setInfo('Account created. If email confirmation is on, check your inbox.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign up');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Create account</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field
          label="Display name"
          id="signup-name"
          type="text"
          value={displayName}
          onChange={setDisplayName}
          required
          autoComplete="name"
        />
        <Field
          label="Email"
          id="signup-email"
          type="email"
          value={email}
          onChange={setEmail}
          required
          autoComplete="email"
        />
        <Field
          label="Password"
          id="signup-password"
          type="password"
          value={password}
          onChange={setPassword}
          required
          minLength={6}
          autoComplete="new-password"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        {info && <p className="text-sm text-green-600">{info}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Create account
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-gray-500">
        Already have an account?{' '}
        <button onClick={onSwitch} className="font-medium text-blue-600 hover:underline">
          Sign in
        </button>
      </p>
    </div>
  );
}

function Field({
  label,
  id,
  type,
  value,
  onChange,
  required,
  minLength,
  autoComplete,
}: {
  label: string;
  id: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  minLength?: number;
  autoComplete?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-gray-700">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
      />
    </div>
  );
}
