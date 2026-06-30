import { useState, type FormEvent } from 'react';
import { FlaskConical, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export function AuthPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-gray-100 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg">
            <FlaskConical className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">ShelleyAutomationLab</h1>
          <p className="mt-1 text-sm text-gray-500">
            Internal project &amp; equipment management
          </p>
        </div>
        {mode === 'login' ? (
          <LoginCard onSwitch={() => setMode('signup')} />
        ) : (
          <SignUpCard onSwitch={() => setMode('login')} />
        )}
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
