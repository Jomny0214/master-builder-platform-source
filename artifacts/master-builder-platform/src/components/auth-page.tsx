import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { AuthenticateWithRedirectCallback, useAuth } from '@clerk/react';
import { useSignIn, useSignUp } from '@clerk/react/legacy';
import { SiteFooter } from '@/components/site-footer';
import { ArrowLeft, ArrowRight, Mail, RefreshCw } from 'lucide-react';
import { Redirect, useLocation } from 'wouter';

type AuthMode = 'sign-in' | 'sign-up';
type AuthStage = 'start' | 'verify';

const VERIFICATION_WINDOW_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 30 * 1000;

function authError(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return 'Clerk could not complete that request. Please try again.';
}

function storageKey(mode: AuthMode) {
  return `master-builder-auth-${mode}`;
}

function readSavedStage(mode: AuthMode): AuthStage {
  try {
    return window.sessionStorage.getItem(storageKey(mode)) === 'verify'
      ? 'verify'
      : 'start';
  } catch {
    return 'start';
  }
}

function saveStage(mode: AuthMode, stage: AuthStage) {
  try {
    if (stage === 'verify') window.sessionStorage.setItem(storageKey(mode), stage);
    else window.sessionStorage.removeItem(storageKey(mode));
  } catch {
    // Session storage is an enhancement; Clerk owns the auth transaction.
  }
}

function formatRemaining(milliseconds: number | null) {
  if (milliseconds === null) return '10:00';
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function AuthCard({
  mode,
  children,
  onBack,
}: {
  mode: AuthMode;
  children: ReactNode;
  onBack?: () => void;
}) {
  const [, setLocation] = useLocation();
  const isSignIn = mode === 'sign-in';
  return (
    <div className="w-full max-w-[440px] overflow-hidden rounded-2xl bg-[#F7F1E4] shadow-[0_18px_45px_rgba(18,32,54,.2)]">
      <div className="px-8 pb-7 pt-8">
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setLocation('/')}
            className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#C1602E] font-display text-2xl font-extrabold text-[#F7F1E4]"
            aria-label="Return to home"
          >
            M
          </button>
        </div>
        <h1 className="mt-5 text-center font-display text-xl font-extrabold text-[#182338]">
          {isSignIn ? 'Sign in to Master Builder' : 'Create your Master Builder account'}
        </h1>
        <p className="mt-2 text-center text-[13px] leading-5 text-[#5B5648]">
          {isSignIn ? 'Welcome back! Please sign in to continue.' : 'Start your field-school account.'}
        </p>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mt-6 flex items-center gap-2 text-[12px] font-semibold text-[#A94E22]"
          >
            <ArrowLeft size={14} /> Use a different email
          </button>
        )}
        {children}
      </div>
      <div className="border-t border-[#E0D6C7] px-8 py-4 text-center text-[12px] text-[#5B5648]">
        {isSignIn ? (
          <>
            Don’t have an account?{' '}
            <button type="button" onClick={() => setLocation('/sign-up')} className="font-semibold text-[#A94E22]">
              Sign up
            </button>
          </>
        ) : (
          <>
            Already have an account?{' '}
            <button type="button" onClick={() => setLocation('/sign-in')} className="font-semibold text-[#A94E22]">
              Sign in
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function VerificationStep({
  mode,
  email,
  onBack,
  expiresAt,
  resendAvailableAt,
  loading,
  error,
  code,
  setCode,
  onSubmit,
  onResend,
}: {
  mode: AuthMode;
  email: string;
  onBack: () => void;
  expiresAt: number | null;
  resendAvailableAt: number | null;
  loading: boolean;
  error: string;
  code: string;
  setCode: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onResend: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const remaining = expiresAt === null ? null : expiresAt - now;
  const resendRemaining = resendAvailableAt === null ? 0 : Math.max(0, resendAvailableAt - now);
  const expired = remaining !== null && remaining <= 0;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <AuthCard mode={mode} onBack={onBack}>
      <div className="mt-7 flex items-center gap-3 rounded-xl border border-[#D6E4D7] bg-[#EDF5EA] p-3 text-[12px] text-[#41674F]">
        <Mail size={18} className="shrink-0" />
        <span>Enter the code sent to <strong>{email}</strong>.</span>
      </div>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <label className="block text-[11px] font-bold text-[#182338]">
          Verification code
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            required
            className="mt-2 block w-full rounded-lg border border-[#CFC5B5] bg-[#F4EFE6] px-3 py-3 text-center text-xl tracking-[.35em] text-[#182338] outline-none focus:border-[#C1602E]"
            placeholder="000000"
            aria-label="Verification code"
          />
        </label>
        <div className="flex items-center justify-between text-[11px] text-[#78877E]">
          <span>{expired ? 'This code has expired.' : `Code valid for ${formatRemaining(remaining)}.`}</span>
          <button
            type="button"
            onClick={onResend}
            disabled={loading || resendRemaining > 0}
            className="flex items-center gap-1 font-semibold text-[#A94E22] disabled:cursor-not-allowed disabled:text-[#9A988E]"
          >
            <RefreshCw size={12} /> {resendRemaining > 0 ? `Resend in ${Math.ceil(resendRemaining / 1000)}s` : 'Resend code'}
          </button>
        </div>
        {error && <p className="rounded-lg bg-[#F8E9E2] px-3 py-2 text-[12px] leading-5 text-[#9A3E32]">{error}</p>}
        <button
          type="submit"
          disabled={loading || code.length < 6 || expired}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#C1602E] px-4 py-3 font-display text-[13px] font-bold text-[#F7F1E4] disabled:cursor-not-allowed disabled:bg-[#B9AEA0]"
        >
          {loading ? 'Checking code…' : 'Verify and continue'} <ArrowRight size={15} />
        </button>
      </form>
      <p className="mt-5 text-center text-[11px] leading-5 text-[#78877E]">
        Clerk keeps this code valid for 10 minutes. Requesting a new code starts a new 10-minute window.
      </p>
    </AuthCard>
  );
}

function SignInFlow({ basePath }: { basePath: string }) {
  const { isLoaded, signIn, setActive } = useSignIn();
  const [, setLocation] = useLocation();
  const [stage, setStage] = useState<AuthStage>(() => readSavedStage('sign-in'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!email && signIn?.identifier) setEmail(signIn.identifier);
  }, [email, signIn?.identifier]);

  const updateStage = (next: AuthStage) => {
    setStage(next);
    saveStage('sign-in', next);
  };

  const complete = async (sessionId: string | null) => {
    if (!sessionId) throw new Error('Clerk did not return a session.');
    if (!setActive) throw new Error('Clerk is still loading.');
    await setActive({ session: sessionId });
    saveStage('sign-in', 'start');
    setLocation('/');
  };

  const sendEmailCode = async () => {
    if (!isLoaded || !signIn || !email.trim()) return;
    setLoading(true);
    setError('');
    try {
      await signIn.create({ identifier: email.trim() });
      const factor = signIn.supportedFirstFactors?.find(
        (candidate) => candidate.strategy === 'email_code',
      );
      if (!factor || !('emailAddressId' in factor) || !factor.emailAddressId) {
        throw new Error('Email verification is not available for this account.');
      }
      await signIn.prepareFirstFactor({
        strategy: 'email_code',
        emailAddressId: factor.emailAddressId,
      });
      const serverExpiry = signIn.firstFactorVerification.expireAt?.getTime() ?? null;
      setExpiresAt(serverExpiry ?? Date.now() + VERIFICATION_WINDOW_MS);
      setResendAvailableAt(Date.now() + RESEND_COOLDOWN_MS);
      updateStage('verify');
    } catch (requestError) {
      setError(authError(requestError));
    } finally {
      setLoading(false);
    }
  };

  const signInWithPassword = async () => {
    if (!isLoaded || !signIn || !email.trim() || !password) return;
    setLoading(true);
    setError('');
    try {
      const result = await signIn.create({
        strategy: 'password',
        identifier: email.trim(),
        password,
      });
      if (result.status === 'complete') await complete(result.createdSessionId);
      else throw new Error('This account requires another sign-in step.');
    } catch (requestError) {
      setError(authError(requestError));
    } finally {
      setLoading(false);
    }
  };

  const verify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isLoaded || !signIn || !code) return;
    setLoading(true);
    setError('');
    try {
      const result = await signIn.attemptFirstFactor({ strategy: 'email_code', code });
      if (result.status === 'complete') await complete(result.createdSessionId);
      else throw new Error('The code was accepted, but sign-in needs another step.');
    } catch (requestError) {
      setError(authError(requestError));
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (!isLoaded || !signIn || !email || (resendAvailableAt && Date.now() < resendAvailableAt)) return;
    setLoading(true);
    setError('');
    try {
      const factor = signIn.supportedFirstFactors?.find((candidate) => candidate.strategy === 'email_code');
      if (!factor || !('emailAddressId' in factor) || !factor.emailAddressId) throw new Error('Email verification is not available.');
      await signIn.prepareFirstFactor({ strategy: 'email_code', emailAddressId: factor.emailAddressId });
      setExpiresAt(signIn.firstFactorVerification.expireAt?.getTime() ?? Date.now() + VERIFICATION_WINDOW_MS);
      setResendAvailableAt(Date.now() + RESEND_COOLDOWN_MS);
      setCode('');
    } catch (requestError) {
      setError(authError(requestError));
    } finally {
      setLoading(false);
    }
  };

  if (!isLoaded || !signIn || !setActive) return null;
  if (stage === 'verify') {
    return (
      <VerificationStep
        mode="sign-in"
        email={email || signIn.identifier || 'your email'}
        onBack={() => updateStage('start')}
        expiresAt={expiresAt ?? signIn.firstFactorVerification.expireAt?.getTime() ?? null}
        resendAvailableAt={resendAvailableAt}
        loading={loading}
        error={error}
        code={code}
        setCode={setCode}
        onSubmit={verify}
        onResend={() => void resend()}
      />
    );
  }

  return (
    <AuthCard mode="sign-in">
      <form onSubmit={(event) => { event.preventDefault(); void sendEmailCode(); }} className="mt-7 space-y-4">
        <label className="block text-[11px] font-bold text-[#182338]">
          Email address
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required autoComplete="email" className="mt-2 block w-full rounded-lg border border-[#CFC5B5] bg-[#F4EFE6] px-3 py-3 text-[13px] outline-none focus:border-[#C1602E]" placeholder="you@example.com" />
        </label>
        <button type="submit" disabled={loading || !email} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#C1602E] px-4 py-3 font-display text-[13px] font-bold text-[#F7F1E4] disabled:cursor-not-allowed disabled:bg-[#B9AEA0]">
          {loading ? 'Sending code…' : 'Email me a verification code'} <ArrowRight size={15} />
        </button>
      </form>
      <div className="my-5 flex items-center gap-3 text-[11px] text-[#9A988E]"><span className="h-px flex-1 bg-[#E0D6C7]" />or<span className="h-px flex-1 bg-[#E0D6C7]" /></div>
      <form onSubmit={(event) => { event.preventDefault(); void signInWithPassword(); }} className="space-y-3">
        <input type="email" name="username" autoComplete="username" value={email} readOnly tabIndex={-1} aria-label="Email address" className="sr-only" />
        <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" className="block w-full rounded-lg border border-[#CFC5B5] bg-[#F4EFE6] px-3 py-3 text-[13px] outline-none focus:border-[#C1602E]" placeholder="Password (optional)" />
        <button type="submit" disabled={loading || !email || !password} className="w-full rounded-lg border border-[#CFC5B5] px-4 py-3 text-[12px] font-semibold text-[#182338] disabled:cursor-not-allowed disabled:text-[#9A988E]">Sign in with password</button>
        <button type="button" onClick={() => void signIn.authenticateWithRedirect({ strategy: 'oauth_google', redirectUrl: `${basePath}/sign-in/sso-callback`, redirectUrlComplete: `${basePath}/` })} className="w-full rounded-lg border border-[#CFC5B5] px-4 py-3 text-[12px] font-semibold text-[#182338]">Continue with Google</button>
      </form>
      {error && <p className="mt-4 rounded-lg bg-[#F8E9E2] px-3 py-2 text-[12px] leading-5 text-[#9A3E32]">{error}</p>}
    </AuthCard>
  );
}

function SignUpFlow({ basePath }: { basePath: string }) {
  const { isLoaded, signUp, setActive } = useSignUp();
  const [, setLocation] = useLocation();
  const [stage, setStage] = useState<AuthStage>(() => readSavedStage('sign-up'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!email && signUp?.emailAddress) setEmail(signUp.emailAddress);
  }, [email, signUp?.emailAddress]);

  const updateStage = (next: AuthStage) => { setStage(next); saveStage('sign-up', next); };
  const complete = async (sessionId: string | null) => {
    if (!sessionId) throw new Error('Clerk did not return a session.');
    if (!setActive) throw new Error('Clerk is still loading.');
    await setActive({ session: sessionId });
    saveStage('sign-up', 'start');
    setLocation('/');
  };

  const sendEmailCode = async () => {
    if (!isLoaded || !signUp || !email.trim() || !password) return;
    setLoading(true);
    setError('');
    try {
      await signUp.create({ emailAddress: email.trim(), password });
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setExpiresAt(signUp.verifications.emailAddress.expireAt?.getTime() ?? Date.now() + VERIFICATION_WINDOW_MS);
      setResendAvailableAt(Date.now() + RESEND_COOLDOWN_MS);
      updateStage('verify');
    } catch (requestError) {
      setError(authError(requestError));
    } finally {
      setLoading(false);
    }
  };

  const verify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isLoaded || !signUp || !code) return;
    setLoading(true);
    setError('');
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status === 'complete') await complete(result.createdSessionId);
      else throw new Error('The code was accepted, but sign-up needs another step.');
    } catch (requestError) {
      setError(authError(requestError));
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (!isLoaded || !signUp || (resendAvailableAt && Date.now() < resendAvailableAt)) return;
    setLoading(true);
    setError('');
    try {
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setExpiresAt(signUp.verifications.emailAddress.expireAt?.getTime() ?? Date.now() + VERIFICATION_WINDOW_MS);
      setResendAvailableAt(Date.now() + RESEND_COOLDOWN_MS);
      setCode('');
    } catch (requestError) {
      setError(authError(requestError));
    } finally {
      setLoading(false);
    }
  };

  if (!isLoaded || !signUp || !setActive) return null;
  if (stage === 'verify') {
    return (
      <VerificationStep
        mode="sign-up"
        email={email || signUp.emailAddress || 'your email'}
        onBack={() => updateStage('start')}
        expiresAt={expiresAt ?? signUp.verifications.emailAddress.expireAt?.getTime() ?? null}
        resendAvailableAt={resendAvailableAt}
        loading={loading}
        error={error}
        code={code}
        setCode={setCode}
        onSubmit={verify}
        onResend={() => void resend()}
      />
    );
  }

  return (
    <AuthCard mode="sign-up">
      <form onSubmit={(event) => { event.preventDefault(); void sendEmailCode(); }} className="mt-7 space-y-4">
        <label className="block text-[11px] font-bold text-[#182338]">Email address<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required autoComplete="email" className="mt-2 block w-full rounded-lg border border-[#CFC5B5] bg-[#F4EFE6] px-3 py-3 text-[13px] outline-none focus:border-[#C1602E]" placeholder="you@example.com" /></label>
        <label className="block text-[11px] font-bold text-[#182338]">Create a password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required minLength={15} autoComplete="new-password" className="mt-2 block w-full rounded-lg border border-[#CFC5B5] bg-[#F4EFE6] px-3 py-3 text-[13px] outline-none focus:border-[#C1602E]" placeholder="At least 15 characters" /></label>
        <button type="submit" disabled={loading || !email || !password} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#C1602E] px-4 py-3 font-display text-[13px] font-bold text-[#F7F1E4] disabled:cursor-not-allowed disabled:bg-[#B9AEA0]">{loading ? 'Sending code…' : 'Create account and send code'} <ArrowRight size={15} /></button>
      </form>
      <div className="my-5 flex items-center gap-3 text-[11px] text-[#9A988E]"><span className="h-px flex-1 bg-[#E0D6C7]" />or<span className="h-px flex-1 bg-[#E0D6C7]" /></div>
      <button type="button" onClick={() => void signUp.authenticateWithRedirect({ strategy: 'oauth_google', redirectUrl: `${basePath}/sign-up/sso-callback`, redirectUrlComplete: `${basePath}/` })} className="w-full rounded-lg border border-[#CFC5B5] px-4 py-3 text-[12px] font-semibold text-[#182338]">Continue with Google</button>
      {error && <p className="mt-4 rounded-lg bg-[#F8E9E2] px-3 py-2 text-[12px] leading-5 text-[#9A3E32]">{error}</p>}
    </AuthCard>
  );
}

export function AuthPage({ mode, basePath }: { mode: AuthMode; basePath: string }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-8 bg-[#F2E8D6] px-4 py-8">
      {mode === 'sign-in' ? <SignInFlow basePath={basePath} /> : <SignUpFlow basePath={basePath} />}
      <div className="w-full max-w-[440px]">
        <SiteFooter />
      </div>
    </div>
  );
}

export function AuthCallback() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <div className="flex min-h-[100dvh] items-center justify-center bg-[#F2E8D6] text-sm text-[#5B5648]">Loading your account…</div>;
  if (isSignedIn) return <Redirect to="/" />;
  return <AuthenticateWithRedirectCallback />;
}