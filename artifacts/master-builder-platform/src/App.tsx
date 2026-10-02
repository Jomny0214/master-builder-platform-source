import { createContext, Fragment, type ReactNode, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClerkProvider, useAuth, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { ErrorBoundary } from '@/components/error-boundary';
import { AuthCallback, AuthPage } from '@/components/auth-page';
import { SiteFooter } from '@/components/site-footer';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { LegalPage } from '@/pages/legal-pages';
import NotFound from '@/pages/not-found';
import { type CourseContent, type Module, type Question } from '@/data/course-types';
import {
  ArrowLeft,
  ArrowRight,
  Award,
  Bookmark,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  Flame,
  HelpCircle,
  Home,
  LayoutGrid,
  LockKeyhole,
  Menu,
  Play,
  Search,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Target,
  X,
  Zap,
} from 'lucide-react';
import { Link, Redirect, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';

const queryClient = new QueryClient();
const progressSeed = { completedModules: [] as number[], examScore: null as number | null, streak: 0 };
const FINAL_EXAM_PASS_PERCENT = 75;

type Progress = typeof progressSeed;

type CourseAccess = {
  status: 'loading' | 'signed-out' | 'unpaid' | 'paid' | 'error';
  account?: {
    id: string;
    email: string;
    displayName: string;
    paddleCustomerId: string | null;
  };
}

type CourseContextValue = {
  access: CourseAccess;
  content: CourseContent | null;
  progress: Progress;
  progressLoaded: boolean;
  updateProgress: (next: Progress) => Promise<void>;
  unlockWithCode: (code: string) => Promise<{ ok: boolean; error?: string }>;
};

type PaddleInstance = {
  Environment: {
    set: (environment: 'sandbox' | 'production') => void;
  };
  Initialize: (options: {
    token: string;
    eventCallback?: (event: unknown) => void;
    pwCustomer?: { id: string };
  }) => void;
  Checkout: {
    open: (options: {
      items: Array<{ priceId: string; quantity: number }>;
      customData: Record<string, string>;
    }) => void;
    close: () => void;
  };
};

let paddleInitialized = false;
let paddleEventHandler: ((event: unknown) => void) | null = null;

type PaddleDiagnostic = {
  phase: string;
  eventName?: string;
  type?: string;
  documentationUrl?: string;
  name?: string;
  code?: string;
  message: string;
  stack?: string;
};

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function paddleDiagnosticFrom(value: unknown): Omit<PaddleDiagnostic, 'phase'> {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message || String(value),
      stack: value.stack,
    };
  }

  if (typeof value === 'string') {
    return { message: value };
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const nested =
      record.error && typeof record.error === 'object'
        ? (record.error as Record<string, unknown>)
        : undefined;
    const data =
      record.data && typeof record.data === 'object'
        ? (record.data as Record<string, unknown>)
        : undefined;
    const nestedData =
      data?.error && typeof data.error === 'object'
        ? (data.error as Record<string, unknown>)
        : undefined;
    const message =
      stringValue(record.message) ||
      stringValue(record.errorMessage) ||
      stringValue(nested?.message) ||
      stringValue(record.detail) ||
      stringValue(data?.message) ||
      stringValue(data?.detail) ||
      stringValue(nestedData?.message) ||
      stringValue(nestedData?.detail) ||
      stringValue(record.reason) ||
      'Paddle returned an error without a message.';
    return {
      name: stringValue(record.name) || stringValue(nested?.name),
      code:
        stringValue(record.code) ||
        stringValue(record.errorCode) ||
        stringValue(nested?.code) ||
        stringValue(data?.code) ||
        stringValue(nestedData?.code),
      type:
        stringValue(record.type) ||
        stringValue(data?.type) ||
        stringValue(nestedData?.type),
      documentationUrl:
        stringValue(record.documentation_url) ||
        stringValue(record.documentationUrl) ||
        stringValue(data?.documentation_url) ||
        stringValue(data?.documentationUrl) ||
        stringValue(nestedData?.documentation_url) ||
        stringValue(nestedData?.documentationUrl),
      message,
      stack:
        stringValue(record.stack) ||
        stringValue(nested?.stack) ||
        stringValue(data?.stack) ||
        stringValue(nestedData?.stack),
    };
  }

  return { message: String(value) };
}

function paddleEventDiagnostic(event: unknown) {
  const record =
    event && typeof event === 'object'
      ? (event as Record<string, unknown>)
      : {};
  const eventName =
    stringValue(record.name) ||
    stringValue(record.eventName) ||
    stringValue(record.type);
  const details = paddleDiagnosticFrom(event);
  const detailMessage =
    details.message === 'Paddle returned an error without a message.'
      ? ''
      : details.message;
  const failureText = `${eventName || ''} ${detailMessage}`.toLowerCase();
  const isFailure =
    Boolean(record.error) ||
    /error|fail|invalid|declin|warning/.test(failureText);

  return isFailure
    ? { ...details, eventName }
    : null;
}

function paddleEventName(event: unknown) {
  if (!event || typeof event !== 'object') return undefined;
  const record = event as Record<string, unknown>;
  return (
    stringValue(record.name) ||
    stringValue(record.eventName) ||
    stringValue(record.type)
  );
}

function paddleEventTransactionId(event: unknown) {
  if (!event || typeof event !== 'object') return undefined;
  const record = event as Record<string, unknown>;
  const data =
    record.data && typeof record.data === 'object'
      ? (record.data as Record<string, unknown>)
      : {};
  return (
    stringValue(data.transaction_id) ||
    stringValue(data.transactionId) ||
    stringValue(record.transaction_id) ||
    stringValue(record.transactionId)
  );
}

declare global {
  interface Window {
    Paddle?: PaddleInstance;
  }
}

const CourseContext = createContext<CourseContextValue | null>(null);

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in the environment.');
}

function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#C1602E',
    colorForeground: '#182338',
    colorMutedForeground: '#5B5648',
    colorDanger: '#B8443A',
    colorBackground: '#F7F1E4',
    colorInput: '#F7F1E4',
    colorInputForeground: '#182338',
    colorNeutral: '#122036',
    fontFamily: 'Inter',
    borderRadius: '0.85rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#F7F1E4] rounded-2xl w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'font-display text-[#122036]',
    headerSubtitle: 'text-[#5B5648]',
    formFieldLabel: 'text-[#182338]',
    footerActionLink: 'text-[#A94E22]',
    footerActionText: 'text-[#5B5648]',
    dividerText: 'text-[#5B5648]',
    formButtonPrimary: 'bg-[#C1602E] hover:bg-[#A94E22] text-[#F7F1E4]',
    formFieldInput: 'bg-[#F7F1E4] border-[#122036]/15 text-[#182338]',
  },
};

function useCourse() {
  const context = useContext(CourseContext);
  if (!context) throw new Error('useCourse must be used inside CourseProvider');
  return context;
}

function useRequiredCourseContent() {
  const { content } = useCourse();
  if (!content) throw new Error('Course content is not available');
  return content;
}

function CourseProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [access, setAccess] = useState<CourseAccess>({ status: 'loading' });
  const [content, setContent] = useState<CourseContent | null>(null);
  const [progress, setProgress] = useState<Progress>(progressSeed);
  const [progressLoaded, setProgressLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadAccount() {
      if (!isLoaded) return;
      if (!isSignedIn) {
        setAccess({ status: 'signed-out' });
        setContent(null);
        setProgressLoaded(false);
        return;
      }
      setAccess({ status: 'loading' });
      try {
        const authToken = await getToken(); const authHeaders: HeadersInit = authToken ? { Authorization: `Bearer ${authToken}` } : {}; const accessResponse = await fetch('/api/course/access', { credentials: 'include', headers: authHeaders });
        if (accessResponse.status === 401) {
          if (!cancelled) setAccess({ status: 'signed-out' });
          return;
        }
        if (!accessResponse.ok) throw new Error('Unable to load account');
        const accountData = await accessResponse.json() as { paid: boolean; account: CourseAccess['account'] };
        if (accountData.paid !== true) {
          if (!cancelled) {
            setContent(null);
            setAccess({ status: 'unpaid', account: accountData.account });
          }
          return;
        }
        const progressResponse = await fetch('/api/course/progress', { credentials: 'include', headers: authHeaders });
        if (!progressResponse.ok) throw new Error('Unable to load progress');
        const savedProgress = await progressResponse.json() as Progress;
        const contentResponse = await fetch('/api/course/content', { credentials: 'include', headers: authHeaders });
        if (!contentResponse.ok) throw new Error('Unable to load course content');
        const courseContent = await contentResponse.json() as CourseContent;
        if (!cancelled) {
          setProgress({ ...progressSeed, ...savedProgress });
          setContent(courseContent);
          setProgressLoaded(true);
          setAccess({ status: 'paid', account: accountData.account });
        }
      } catch {
        if (!cancelled) setAccess({ status: 'error' });
      }
    }
    void loadAccount();
    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn]);

  const updateProgress = async (next: Progress) => {
    setProgress(next);
    if (access.status !== 'paid') return;
    await fetch('/api/course/progress', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    });
  };

  const unlockWithCode = async (code: string) => {
    try {
      const response = await fetch('/api/course/unlock', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const payload = await response.json() as { paid?: boolean; error?: string };
      if (!response.ok || payload.paid !== true) {
        return { ok: false, error: payload.error || 'That access code is not valid.' };
      }
      const progressResponse = await fetch('/api/course/progress', { credentials: 'include', headers: authHeaders });
      if (!progressResponse.ok) {
        return { ok: false, error: 'Access was activated, but progress could not be loaded. Refresh and try again.' };
      }
      const savedProgress = await progressResponse.json() as Progress;
      setProgress({ ...progressSeed, ...savedProgress });
      const contentResponse = await fetch('/api/course/content', { credentials: 'include', headers: authHeaders });
      if (!contentResponse.ok) {
        return { ok: false, error: 'Access was activated, but course content could not be loaded. Refresh and try again.' };
      }
      setContent(await contentResponse.json() as CourseContent);
      setProgressLoaded(true);
      setAccess((current) => ({ ...current, status: 'paid' }));
      return { ok: true };
    } catch {
      return { ok: false, error: 'Unable to check the access code. Try again.' };
    }
  };

  return <CourseContext.Provider value={{ access, content, progress, progressLoaded, updateProgress, unlockWithCode }}>{children}</CourseContext.Provider>;
}

function LoadingScreen({ label = 'Loading your course...' }: { label?: string }) {
  return <div className="flex min-h-[55dvh] items-center justify-center text-center"><div><div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[#EADFC8] border-t-[#C1602E]" /><p className="mt-4 font-mono text-[10px] uppercase tracking-[.16em] text-[#5B5648]" data-testid="status-loading">{label}</p></div></div>;
}

function PublicHome() {
  return <div className="min-h-[100dvh] bg-[#F2E8D6] px-4 py-5 text-[#182338]"><div className="mx-auto max-w-[480px]"><header className="rounded-b-[18px] bg-[#122036] px-5 py-6 text-[#F7F1E4] shadow-[0_4px_0_#C1602E]"><Logo /></header><main className="py-12"><p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#A94E22]">Master Builder / Interactive Course</p><h1 className="mt-4 font-display text-4xl font-extrabold leading-[1.02] tracking-[-.05em]">Build the knowledge<br /><span className="text-[#C1602E]">before the building.</span></h1><p className="mt-5 text-[14px] leading-6 text-[#5B5648]">A practical construction course for the decisions that make a project durable, safe and worth standing behind.</p><div className="mt-8 space-y-3"><Link href="/sign-up" className="flex w-full items-center justify-center rounded-[14px] bg-[#C1602E] px-5 py-3.5 font-display text-[14px] font-bold text-[#F7F1E4] shadow-[3px_3px_0_#122036]" data-testid="link-public-sign-up">Create an account <ArrowRight size={16} /></Link><Link href="/sign-in" className="flex w-full items-center justify-center rounded-[14px] bg-[#122036] px-5 py-3.5 font-display text-[14px] font-bold text-[#F7F1E4]" data-testid="link-public-sign-in">Sign in to continue</Link></div><div className="mt-10 rounded-[16px] border border-[rgba(18,32,54,.1)] bg-[#F7F1E4] p-5"><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#A94E22]">Inside the course</p><div className="mt-4 grid gap-3 text-[12px] text-[#5B5648]"><span>22 guided construction modules</span><span>Graded knowledge checks and final exam</span><span>Progress tracking and completion certificate</span></div></div></main><SiteFooter /></div></div>;
}

function Paywall() {
  const { signOut } = useClerk();
  const { access, unlockWithCode } = useCourse();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutConfirming, setCheckoutConfirming] = useState(false);

  const reconcilePaddleAccess = async (transactionId?: string) => {
    const response = await fetch('/api/paddle/reconcile', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(transactionId ? { transactionId } : {}),
    });
    const payload = await response.json() as { paid?: boolean };
    if (response.ok && payload.paid === true) {
      window.location.assign(`${basePath}/curriculum`);
      return true;
    }
    return false;
  };

  useEffect(() => {
    void reconcilePaddleAccess().catch(() => {
      // Leave checkout available when this account has no completed payment.
    });
  }, []);

  const reportPaddleDiagnostic = (diagnostic: PaddleDiagnostic) => {
    const displayMessage = [
      diagnostic.eventName,
      diagnostic.type,
      diagnostic.code,
      diagnostic.message,
    ]
      .filter(Boolean)
      .join(': ');
    setError(displayMessage || 'Paddle returned an unknown checkout error.');
    if (/error|fail|invalid|declin/i.test(`${diagnostic.eventName || ''} ${diagnostic.message}`)) {
      setCheckoutLoading(false);
    }
    void fetch('/api/paddle/checkout-debug', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(diagnostic),
    }).catch(() => {
      // Keep the original Paddle error visible even if diagnostic logging fails.
    });
  };

  const loadPaddle = () => new Promise<PaddleInstance>((resolve, reject) => {
    if (window.Paddle) {
      resolve(window.Paddle);
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>('script[data-paddle-sdk]');
    if (existing) {
      existing.addEventListener('load', () => window.Paddle ? resolve(window.Paddle) : reject(new Error('Paddle checkout failed to load.')), { once: true });
      existing.addEventListener('error', () => reject(new Error('Paddle checkout failed to load.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
    script.async = true;
    script.dataset.paddleSdk = 'true';
    script.onload = () => window.Paddle ? resolve(window.Paddle) : reject(new Error('Paddle checkout failed to load.'));
    script.onerror = () => reject(new Error('Paddle checkout failed to load.'));
    document.head.appendChild(script);
  });

  const pollPaddleAccess = () => {
    let attempts = 0;
    const check = async () => {
      attempts += 1;
      try {
        const response = await fetch('/api/course/access', { credentials: 'include' });
        const payload = await response.json() as { paid?: boolean };
        if (response.ok && payload.paid === true) {
          window.location.assign(`${basePath}/curriculum`);
          return;
        }
      } catch {
        // The signed webhook may still be in flight.
      }
      if (attempts < 24) {
        window.setTimeout(() => void check(), 2500);
        return;
      }
      setCheckoutConfirming(false);
      setError('Payment succeeded, but access is taking longer than expected to activate. Refresh the page in a moment.');
    };
    void check();
  };

  const submitCode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    const result = await unlockWithCode(code);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error || 'That access code is not valid.');
      return;
    }
    setCode('');
  };

  const startCheckout = async () => {
    setError('');
    setCheckoutLoading(true);
    let phase = 'paddle-api';
    try {
      const response = await fetch('/api/paddle/checkout', {
        method: 'POST',
        credentials: 'include',
      });
      const payload = await response.json() as {
        transactionId?: string;
        clientToken?: string;
        environment?: 'sandbox' | 'production';
        productId?: string;
        priceId?: string;
        customData?: Record<string, string>;
        alreadyPaid?: boolean;
        error?: string;
      };
      if (payload.alreadyPaid) {
        window.location.reload();
        return;
      }
      if (
        !response.ok ||
        !payload.clientToken ||
        !payload.environment ||
        !payload.priceId ||
        !payload.customData
      ) {
        throw new Error(payload.error || 'Unable to start checkout.');
      }
      phase = 'paddle-sdk-load';
      const paddle = await loadPaddle();
      let accessPollingStarted = false;
      paddleEventHandler = (event) => {
        const diagnostic = paddleEventDiagnostic(event);
        if (diagnostic) {
          reportPaddleDiagnostic({
            phase: 'paddle-event',
            ...diagnostic,
          });
        }
        if (paddleEventName(event) === 'checkout.completed' && !accessPollingStarted) {
          accessPollingStarted = true;
          setError('');
          setCheckoutConfirming(true);
          paddle.Checkout.close();
          void reconcilePaddleAccess(paddleEventTransactionId(event)).catch(() => {
            // Signed webhook polling remains available if Paddle API verification is delayed.
          });
          pollPaddleAccess();
        }
      };
      if (!paddleInitialized) {
        phase = 'paddle-sdk-initialize';
        if (payload.environment === 'sandbox') {
          paddle.Environment.set('sandbox');
        }
        paddle.Initialize({
          token: payload.clientToken,
          eventCallback: (event) => paddleEventHandler?.(event),
          ...(access.account?.paddleCustomerId
            ? { pwCustomer: { id: access.account.paddleCustomerId } }
            : {}),
        });
        paddleInitialized = true;
      }
      phase = 'paddle-sdk-open';
      paddle.Checkout.open({
        items: [{ priceId: payload.priceId, quantity: 1 }],
        customData: payload.customData,
      });
      setCheckoutLoading(false);
    } catch (checkoutError) {
      const diagnostic = {
        phase,
        ...paddleDiagnosticFrom(checkoutError),
      };
      reportPaddleDiagnostic(diagnostic);
      setCheckoutLoading(false);
    }
  };

  return <div className="min-h-[100dvh] bg-[#F2E8D6] px-4 py-5 text-[#182338]"><div className="mx-auto max-w-[480px]"><header className="rounded-b-[18px] bg-gradient-to-b from-[#122036] to-[#0D1829] px-5 py-6 text-[#F7F1E4] shadow-[0_4px_0_#C1602E]"><Logo /></header><main className="py-12"><p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#A94E22]">Account ready</p><h1 className="mt-4 font-display text-3xl font-extrabold leading-tight tracking-[-.04em]">Unlock your field school.</h1><p className="mt-4 text-[14px] leading-6 text-[#5B5648]">You are signed in as <strong>{access.account?.email}</strong>. Purchase lifetime access to open the Modules, Final Exam, and Certificate.</p><div className="mt-8 rounded-[16px] border border-[rgba(18,32,54,.1)] bg-[#122036] p-5 text-[#F7F1E4]"><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#D8A84E]">One-time payment</p><div className="mt-3 flex items-end justify-between"><div><p className="font-display text-3xl font-extrabold">$199</p><p className="mt-1 text-[11px] text-[#C7D2CB]">USD · lifetime course access</p></div><ShieldCheck size={28} className="text-[#9FB7A5]" /></div><button type="button" onClick={() => void startCheckout()} disabled={checkoutLoading || checkoutConfirming} className="mt-5 flex w-full items-center justify-center gap-2 rounded-[10px] bg-[#C1602E] px-5 py-3.5 font-display text-[13px] font-bold text-[#F7F1E4] shadow-[2px_2px_0_#D8A84E] disabled:cursor-not-allowed disabled:bg-[#8E756A]" data-testid="button-buy-course">{checkoutConfirming ? 'Confirming your payment...' : checkoutLoading ? 'Opening secure checkout...' : 'Buy Course Access'} {!checkoutLoading && !checkoutConfirming && <ArrowRight size={15} />}</button><p className="mt-3 text-center text-[10px] text-[#9FB7A5]">{checkoutConfirming ? 'Payment received. Unlocking your course now…' : 'Secure payment hosted by Paddle Sandbox'}</p></div>{error && <p role="alert" className="mt-4 text-[12px] font-semibold text-[#B8443A]" data-testid="error-payment">{error}</p>}<div className="my-7 flex items-center gap-3"><span className="h-px flex-1 bg-[#CFC5B5]" /><span className="font-mono text-[9px] uppercase tracking-[.16em] text-[#817A6D]">Already enrolled?</span><span className="h-px flex-1 bg-[#CFC5B5]" /></div><form onSubmit={submitCode} className="rounded-[16px] border border-[rgba(18,32,54,.1)] bg-[#F7F1E4] p-5"><label className="block font-mono text-[10px] uppercase tracking-[.16em] text-[#5B5648]" htmlFor="course-access-code">Access code<input id="course-access-code" value={code} onChange={(event) => setCode(event.target.value)} autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false} placeholder="Enter your access code" className="mt-3 block w-full rounded-[10px] border border-[#CFC5B5] bg-[#F2E8D6] px-3 py-3 text-[14px] font-semibold tracking-[.08em] text-[#182338] outline-none placeholder:font-normal placeholder:tracking-normal focus:border-[#C1602E]" data-testid="input-access-code" /></label><button type="submit" disabled={!code.trim() || submitting} className="mt-5 flex w-full items-center justify-center gap-2 rounded-[10px] bg-[#F2E8D6] px-5 py-3 font-display text-[12px] font-bold text-[#182338] ring-1 ring-[#CFC5B5] disabled:cursor-not-allowed disabled:text-[#9A9387]" data-testid="button-unlock-course">{submitting ? 'Checking code...' : 'Unlock with access code'}</button></form><button onClick={() => void signOut({ redirectUrl: `${basePath}/` })} className="mt-6 w-full rounded-[14px] bg-[#122036] px-5 py-3.5 font-display text-[13px] font-bold text-[#F7F1E4]" data-testid="button-sign-out-paywall">Sign out</button></main><SiteFooter /></div></div>;
}

function AuthRoute({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  if (!isLoaded) return <LoadingScreen />;
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  return <>{children}</>;
}

function PaidRoute({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { access, content, progressLoaded } = useCourse();
  if (!isLoaded || access.status === 'loading') return <LoadingScreen />;
  if (!isSignedIn || access.status === 'signed-out') return <Redirect to="/sign-in" />;
  if (access.status === 'error') return <LoadingScreen label="Unable to load account. Refresh to try again." />;
  if (access.status !== 'paid') return <Paywall />;
  if (!progressLoaded || !content) return <LoadingScreen />;
  return <>{children}</>;
}

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-3 group" data-testid="link-brand-home">
      <span className="relative flex h-10 w-10 items-center justify-center bg-[#D2643F] text-[#F4EFE6] shadow-[3px_3px_0_#D8A84E] transition-transform duration-200 group-hover:-translate-y-0.5">
        <span className="font-display text-lg font-extrabold tracking-tight">MB</span>
      </span>
      <span className="leading-none">
        <span className="block font-display text-[15px] font-extrabold tracking-[-.04em] text-[#F4EFE6]">MASTER BUILDER</span>
        <span className="mt-1 block font-mono text-[8px] tracking-[.24em] text-[#9FB7A5]">FIELD SCHOOL / 01</span>
      </span>
    </Link>
  );
}

function Sidebar({ mobileOpen, setMobileOpen }: { mobileOpen: boolean; setMobileOpen: (value: boolean) => void }) {
  const [location] = useLocation();
  const navItems = [
    { href: '/', label: 'Overview', icon: Home },
    { href: '/curriculum', label: 'Curriculum', icon: LayoutGrid },
    { href: '/exam', label: 'Final examination', icon: ClipboardCheck },
    { href: '/certificate', label: 'Certificate', icon: Award },
  ];
  return (
    <>
      {mobileOpen && <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-[#13231F]/50 lg:hidden" onClick={() => setMobileOpen(false)} data-testid="button-close-mobile-nav" />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[270px] flex-col bg-[#13231F] px-6 py-7 text-[#F4EFE6] transition-transform duration-300 lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between">
          <Logo />
          <button className="rounded-md p-2 text-[#9FB7A5] hover:bg-[#294038] lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close menu" data-testid="button-menu-close"><X size={18} /></button>
        </div>
        <div className="mt-11">
          <p className="mb-3 font-mono text-[9px] uppercase tracking-[.2em] text-[#718F80]">Your workspace</p>
          <nav className="space-y-1" aria-label="Primary navigation">
            {navItems.map(({ href, label, icon: Icon }) => {
              const active = href === '/' ? location === '/' : location.startsWith(href);
              return (
                <Link key={href} href={href} onClick={() => setMobileOpen(false)} className={`group flex items-center gap-3 border-l-2 px-3 py-3 text-[13px] font-semibold transition-all ${active ? 'border-[#D2643F] bg-[#20352D] text-[#F4EFE6]' : 'border-transparent text-[#9FB7A5] hover:border-[#D8A84E] hover:bg-[#20352D]/70 hover:text-[#F4EFE6]'}`} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`}>
                  <Icon size={17} strokeWidth={active ? 2.4 : 1.8} className={active ? 'text-[#D8A84E]' : 'text-[#718F80] group-hover:text-[#D8A84E]'} />
                  <span>{label}</span>
                  {label === 'Certificate' && <span className="ml-auto text-[9px] text-[#718F80]">22</span>}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="mt-auto">
          <div className="mb-6 overflow-hidden border border-[#355248] bg-[#1B3028] p-4">
            <div className="mb-3 flex items-start justify-between">
              <span className="font-mono text-[9px] uppercase tracking-[.18em] text-[#9FB7A5]">Current run</span>
              <Zap size={15} className="text-[#D8A84E]" />
            </div>
            <div className="flex items-end gap-2">
              <span className="font-display text-3xl font-extrabold text-[#F4EFE6]">04</span>
              <span className="pb-1 text-[11px] text-[#9FB7A5]">days in a row</span>
            </div>
            <div className="mt-3 flex gap-1">
              {[1, 2, 3, 4, 5, 6, 7].map((day) => <span key={day} className={`h-1.5 flex-1 ${day < 5 ? 'bg-[#D2643F]' : 'bg-[#355248]'}`} />)}
            </div>
          </div>
          <Link href="/profile" className="flex items-center gap-3 border-t border-[#355248] pt-5" data-testid="link-profile">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#D8A84E] font-display text-sm font-extrabold text-[#13231F]">AR</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-bold">Alex Rivera</span>
              <span className="block truncate font-mono text-[9px] uppercase tracking-wider text-[#718F80]">Homeowner / Builder</span>
            </span>
            <Settings2 size={15} className="text-[#718F80]" />
          </Link>
        </div>
      </aside>
    </>
  );
}

function TopBar() {
  const [location, setLocation] = useLocation();
  const crumb = location === '/' ? 'Overview' : location.includes('/module/') ? 'Curriculum / Module' : location.slice(1).replace('-', ' ');
  return (
    <header className="bg-[#13231F] px-4 py-5 text-[#F4EFE6] shadow-[0_4px_0_#D2643F] md:rounded-b-[18px] md:px-6">
      <div className="flex items-center justify-between gap-4">
        <Logo />
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-2 font-mono text-[10px] uppercase tracking-[.14em] text-[#9FB7A5] sm:flex"><span className="h-2 w-2 rounded-full bg-[#79A383]" /> Saved locally</span>
          <button onClick={() => setLocation('/curriculum')} className="rounded-full p-2.5 text-[#B9C2D4] transition-colors hover:bg-[#20352D] hover:text-[#F4EFE6]" aria-label="Search course" data-testid="button-search"><Search size={17} /></button>
          <Link href="/profile" className="flex h-9 w-9 items-center justify-center rounded-full bg-[#D8A84E] font-display text-[11px] font-extrabold text-[#13231F]" data-testid="link-top-profile">AR</Link>
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between gap-3">
        <nav className="flex min-w-0 gap-1 overflow-x-auto" aria-label="Primary navigation">
          {[['/', 'Overview'], ['/curriculum', 'Modules'], ['/exam', 'Final exam'], ['/certificate', 'Certificate']].map(([href, label]) => (
            <Link key={href} href={href} className={`whitespace-nowrap rounded-[10px] px-3 py-2 text-[11px] font-semibold transition-colors ${location === href || (href !== '/' && location.startsWith(href)) ? 'bg-[#C1602E] text-[#F7F1E4]' : 'text-[#B9C2D4] hover:bg-[#20352D] hover:text-[#F7F1E4]'}`} data-testid={`link-top-nav-${label.toLowerCase().replaceAll(' ', '-')}`}>{label}</Link>
          ))}
        </nav>
        <span className="hidden shrink-0 font-mono text-[10px] uppercase tracking-[.16em] text-[#B9C2D4] sm:block">{crumb}</span>
      </div>
    </header>
  );
}

function scrollCourseToTop() {
  requestAnimationFrame(() => {
    const scrollContainer = document.getElementById('course-top');
    if (scrollContainer) {
      scrollContainer.scrollTop = 0;
    }
  });
}

function AppShell({ children }: { children: ReactNode }) {
  return (
    <div id="course-top" data-course-scroll-container className="course-scroll-container noise h-[100dvh] overflow-y-auto bg-[#F2E8D6] text-[#182338]">
      <div className="mx-auto min-h-[100dvh] max-w-[760px]">
        <TopBar />
        <main className="paper-grid min-h-[calc(100dvh-150px)] px-4 py-6 md:px-5 md:py-8">{children}</main>
        <SiteFooter dark />
      </div>
    </div>
  );
}

function ProgressBar({ value, className = '' }: { value: number; className?: string }) {
  return <div className={`h-2 overflow-hidden bg-[#DDD4C5] ${className}`}><div className="animate-width h-full bg-[#D2643F]" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>;
}

function Stat({ label, value, detail, icon: Icon, accent = 'orange' }: { label: string; value: string; detail: string; icon: typeof Target; accent?: 'orange' | 'gold' | 'sage' }) {
  const color = accent === 'gold' ? 'text-[#AC7B18] bg-[#F1E3B9]' : accent === 'sage' ? 'text-[#517D62] bg-[#D6E4D7]' : 'text-[#B34E30] bg-[#F3D6CA]';
  return (
    <div className="flex min-w-0 items-start gap-3 border-r border-[#DDD4C5] px-5 py-1 first:pl-0 last:border-0 md:px-7">
      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${color}`}><Icon size={15} /></span>
      <div>
        <p className="font-mono text-[9px] uppercase tracking-[.16em] text-[#78877E]">{label}</p>
        <p className="mt-1 font-display text-2xl font-extrabold tracking-[-.04em]">{value}</p>
        <p className="mt-0.5 text-[11px] text-[#78877E]">{detail}</p>
      </div>
    </div>
  );
}

function Dashboard() {
  const { progress } = useCourse();
  const { modules, phaseGroups } = useRequiredCourseContent();
  const completed = progress.completedModules.length;
  const nextModule = modules.find((module) => !progress.completedModules.includes(module.num)) ?? modules[21];
  const recentlyFinished = modules.filter((module) => progress.completedModules.includes(module.num)).slice(-3).reverse();
  const percent = Math.round((completed / modules.length) * 100);
  return (
    <div className="mx-auto max-w-[1320px]">
      <div className="animate-rise flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[.23em] text-[#B34E30]">Tuesday, October 14, 2025 / 08:42</p>
          <h1 className="mt-3 max-w-xl font-display text-4xl font-extrabold leading-[.98] tracking-[-.055em] text-[#13231F] md:text-6xl">Build the knowledge<br /><span className="text-[#D2643F]">before the building.</span></h1>
          <p className="mt-5 max-w-lg text-[14px] leading-6 text-[#5E6E65]">A field-tested path through the decisions that make a project durable, safe and worth standing behind.</p>
        </div>
        <Link href={`/module/${nextModule.num}`} className="group flex w-full items-center justify-between bg-[#D2643F] px-5 py-4 text-[#F4EFE6] shadow-[4px_4px_0_#13231F] transition-all hover:-translate-y-1 hover:shadow-[6px_6px_0_#13231F] md:w-[280px]" data-testid="link-continue-module">
          <span><span className="block font-mono text-[9px] uppercase tracking-[.18em] text-[#F3D6CA]">Up next / module {String(nextModule.num).padStart(2, '0')}</span><span className="mt-1 block max-w-[180px] text-[13px] font-bold leading-4">{nextModule.title}</span></span>
          <ArrowRight size={22} className="transition-transform group-hover:translate-x-1" />
        </Link>
      </div>

      <div className="animate-rise delay-1 mt-10 grid border-y border-[#DDD4C5] py-6 md:grid-cols-3">
        <Stat label="Course completion" value={`${percent}%`} detail={`${completed} of 22 modules cleared`} icon={Target} />
        <Stat label="Learning time" value="11.8 h" detail="+ 38 min this week" icon={Clock3} accent="gold" />
        <Stat label="Current streak" value={`${progress.streak} days`} detail="Best: 12 days" icon={Flame} accent="sage" />
      </div>

      <div className="mt-9 grid gap-8 xl:grid-cols-[1.3fr_.7fr]">
        <section className="animate-rise delay-2 border border-[#DDD4C5] bg-[#F8F4ED] p-5 shadow-[var(--shadow-sm)] md:p-7" data-testid="section-course-progress">
          <div className="flex items-start justify-between gap-5">
            <div><p className="font-mono text-[9px] uppercase tracking-[.2em] text-[#B34E30]">The full build</p><h2 className="mt-2 font-display text-2xl font-extrabold tracking-[-.04em]">22 modules / one complete picture</h2></div>
            <Link href="/curriculum" className="hidden items-center gap-1 pt-1 text-[11px] font-bold text-[#B34E30] hover:text-[#13231F] sm:flex" data-testid="link-view-curriculum">View curriculum <ChevronRight size={14} /></Link>
          </div>
          <div className="mt-6 flex items-center gap-4">
            <ProgressBar value={percent} className="flex-1" />
            <span className="font-mono text-[11px] text-[#78877E]">{String(completed).padStart(2, '0')} / 22</span>
          </div>
          <div className="mt-7 space-y-3">
            {phaseGroups.map((group, index) => {
              const done = group.modules.filter((module) => progress.completedModules.includes(module.num)).length;
              return <Link href="/curriculum" key={group.phase} className="group grid grid-cols-[28px_1fr_auto] items-center gap-3 border-t border-[#E5DDD0] py-3 transition-colors hover:bg-[#F1E9DD]" data-testid={`link-phase-${index + 1}`}>
                <span className={`font-mono text-[10px] ${done === group.modules.length ? 'text-[#B34E30]' : 'text-[#78877E]'}`}>{String(index + 1).padStart(2, '0')}</span>
                <span><span className="block text-[13px] font-bold">{group.label}</span><span className="mt-0.5 block text-[11px] text-[#78877E]">{group.phase} · modules {group.range}</span></span>
                <span className="flex items-center gap-2"><span className="font-mono text-[10px] text-[#78877E]">{done}/{group.modules.length}</span><ChevronRight size={14} className="text-[#B2A99B] transition-transform group-hover:translate-x-1" /></span>
              </Link>;
            })}
          </div>
        </section>

        <section className="animate-rise delay-3 flex flex-col bg-[#20352D] p-6 text-[#F4EFE6] shadow-[4px_4px_0_#D8A84E] md:p-7" data-testid="section-next-up">
          <div className="flex items-start justify-between"><div><p className="font-mono text-[9px] uppercase tracking-[.2em] text-[#9FB7A5]">Pick up the line</p><h2 className="mt-2 font-display text-2xl font-extrabold leading-tight tracking-[-.04em]">Your next<br />inspection point</h2></div><span className="font-mono text-[10px] text-[#D8A84E]">0{nextModule.num}</span></div>
          <div className="mt-8 border-l-2 border-[#D2643F] pl-4"><p className="font-mono text-[9px] uppercase tracking-[.18em] text-[#9FB7A5]">{nextModule.phase}</p><h3 className="mt-2 text-[17px] font-bold leading-5">{nextModule.title}</h3><p className="mt-3 text-[12px] leading-5 text-[#B8C9BE]">{nextModule.summary}</p></div>
          <div className="mt-auto pt-9"><div className="mb-4 flex justify-between font-mono text-[9px] uppercase tracking-[.14em] text-[#9FB7A5]"><span>{nextModule.duration}</span><span>4 knowledge checks</span></div><Link href={`/module/${nextModule.num}`} className="flex items-center justify-center gap-2 bg-[#D8A84E] py-3 text-[12px] font-bold text-[#13231F] transition-colors hover:bg-[#E7C879]" data-testid="link-start-next">Start module <Play size={14} fill="currentColor" /></Link></div>
        </section>
      </div>

      <section className="mt-10 border-t border-[#DDD4C5] pt-7" data-testid="section-recent-modules">
        <div className="flex items-end justify-between"><div><p className="font-mono text-[9px] uppercase tracking-[.2em] text-[#B34E30]">Field notes</p><h2 className="mt-2 font-display text-2xl font-extrabold tracking-[-.04em]">Recently cleared</h2></div><span className="font-mono text-[10px] uppercase tracking-[.15em] text-[#78877E]">Last 3</span></div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {recentlyFinished.map((module) => <Link href={`/module/${module.num}`} key={module.num} className="group flex items-center gap-4 border border-[#DDD4C5] bg-[#F8F4ED] p-4 transition-all hover:-translate-y-0.5 hover:border-[#D2643F] hover:shadow-[var(--shadow-sm)]" data-testid={`card-recent-module-${module.num}`}><span className="flex h-10 w-10 shrink-0 items-center justify-center bg-[#D6E4D7] font-mono text-[11px] text-[#517D62]"><Check size={17} /></span><span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-bold">{module.title}</span><span className="mt-1 block font-mono text-[9px] uppercase tracking-wider text-[#78877E]">{module.phase} · complete</span></span><ChevronRight size={16} className="text-[#B2A99B] transition-transform group-hover:translate-x-1" /></Link>)}
        </div>
      </section>
      <div className="fixed bottom-5 right-5 flex items-center gap-2 rounded-full bg-[#13231F] px-4 py-3 text-[11px] font-bold text-[#F4EFE6] shadow-lg" data-testid="status-progress-saved"><CheckCircle2 size={15} className="text-[#9BC6A2]" /> Progress saved</div>
    </div>
  );
}

function Curriculum() {
  const { progress } = useCourse();
  const { phaseGroups } = useRequiredCourseContent();
  const [query, setQuery] = useState('');
  const filteredGroups = useMemo(() => phaseGroups.map((group) => ({ ...group, modules: group.modules.filter((module) => module.title.toLowerCase().includes(query.toLowerCase()) || module.summary.toLowerCase().includes(query.toLowerCase())) })).filter((group) => group.modules.length), [query]);
  return (
    <div className="mx-auto max-w-[1160px]">
      <div className="animate-rise flex flex-col justify-between gap-5 border-b border-[#DDD4C5] pb-8 md:flex-row md:items-end">
        <div><p className="font-mono text-[10px] uppercase tracking-[.23em] text-[#B34E30]">Curriculum map / 05 phases</p><h1 className="mt-3 font-display text-4xl font-extrabold tracking-[-.055em] md:text-5xl">The build sequence.</h1><p className="mt-4 max-w-xl text-[14px] leading-6 text-[#5E6E65]">Nothing is out of order. Each phase unlocks the next set of decisions, from soil report to signed handover.</p></div>
        <label className="flex w-full items-center gap-2 border border-[#CFC5B5] bg-[#F8F4ED] px-3 py-2.5 md:w-[235px]" data-testid="label-search-modules"><Search size={15} className="text-[#78877E]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a module" className="w-full bg-transparent text-[12px] outline-none placeholder:text-[#9C988F]" data-testid="input-search-modules" /></label>
      </div>
      <div className="mt-9 space-y-11">
        {filteredGroups.map((group, groupIndex) => {
          const completed = group.modules.filter((module) => progress.completedModules.includes(module.num)).length;
          return <section key={group.phase} className="animate-rise" style={{ animationDelay: `${groupIndex * 80}ms` }} data-testid={`section-curriculum-phase-${groupIndex + 1}`}>
            <div className="mb-4 flex items-end justify-between"><div className="flex items-center gap-3"><span className="font-mono text-[10px] text-[#B34E30]">{group.range}</span><div><h2 className="font-display text-xl font-extrabold tracking-[-.035em]">{group.label}</h2><p className="mt-1 text-[11px] text-[#78877E]">{group.phase}</p></div></div><span className="font-mono text-[10px] uppercase tracking-[.13em] text-[#78877E]">{completed} / {group.modules.length} cleared</span></div>
            <div className="overflow-hidden border border-[#DDD4C5] bg-[#F8F4ED]">
              {group.modules.map((module, index) => {
                const done = progress.completedModules.includes(module.num);
                const locked = module.num > 1 && !progress.completedModules.includes(module.num - 1) && !done;
                return <ModuleRow key={module.num} module={module} done={done} locked={locked} index={index} />;
              })}
            </div>
          </section>;
        })}
      </div>
      {filteredGroups.length === 0 && <div className="mt-12 border border-dashed border-[#CFC5B5] py-16 text-center" data-testid="empty-module-search"><Search size={25} className="mx-auto text-[#B2A99B]" /><p className="mt-4 font-display text-xl font-bold">No module found</p><p className="mt-2 text-[12px] text-[#78877E]">Try a broader construction term.</p></div>}
    </div>
  );
}

function ModuleRow({ module, done, locked, index }: { module: Module; done: boolean; locked: boolean; index: number }) {
  const content = <><span className={`font-mono text-[11px] ${done ? 'text-[#B34E30]' : locked ? 'text-[#B2A99B]' : 'text-[#78877E]'}`}>{String(module.num).padStart(2, '0')}</span><span className={`flex h-9 w-9 items-center justify-center ${done ? 'bg-[#D6E4D7] text-[#517D62]' : locked ? 'bg-[#E8E1D7] text-[#ADA497]' : 'bg-[#F3D6CA] text-[#B34E30]'}`}>{done ? <Check size={16} /> : locked ? <LockKeyhole size={15} /> : <span className="font-display text-sm font-extrabold">{module.num}</span>}</span><span className="min-w-0 flex-1"><span className={`block text-[13px] font-bold ${locked ? 'text-[#9A988E]' : ''}`}>{module.title}</span><span className="mt-1 block truncate text-[11px] text-[#78877E]">{module.summary}</span></span><span className="hidden items-center gap-2 font-mono text-[9px] uppercase tracking-wider text-[#9A988E] sm:flex"><Clock3 size={13} /> {module.duration}</span><span className={`ml-2 font-mono text-[9px] uppercase tracking-wider ${done ? 'text-[#517D62]' : locked ? 'text-[#ADA497]' : 'text-[#B34E30]'}`}>{done ? 'Cleared' : locked ? 'Locked' : 'Open'}</span>{!locked && <ChevronRight size={17} className="ml-2 text-[#B2A99B]" />}</>;
  return locked ? <div className="grid grid-cols-[24px_36px_1fr_auto] items-center gap-3 border-b border-[#E5DDD0] px-4 py-4 last:border-0 md:grid-cols-[32px_40px_1fr_auto_auto_auto]" data-testid={`row-module-${module.num}`}>{content}</div> : <Link href={`/module/${module.num}`} className="group grid grid-cols-[24px_36px_1fr_auto] items-center gap-3 border-b border-[#E5DDD0] px-4 py-4 transition-colors hover:bg-[#F1E9DD] last:border-0 md:grid-cols-[32px_40px_1fr_auto_auto_auto]" data-testid={`link-module-${module.num}`}>{content}</Link>;
}

function ModulePage({ id }: { id: string }) {
  const { modules } = useRequiredCourseContent();
  const module = modules.find((item) => item.num === Number(id)) ?? modules[0];
  const { progress, updateProgress } = useCourse();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState(0);
  const quizPassCount = module.quizPassCount ?? 3;
  const [answers, setAnswers] = useState<number[]>(Array(module.questions.length).fill(-1));
  const [submitted, setSubmitted] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const done = progress.completedModules.includes(module.num);
  const locked = module.num > 1 && !progress.completedModules.includes(module.num - 1) && !done;
  const score = answers.reduce((total, answer, index) => total + (answer === module.questions[index].correct ? 1 : 0), 0);
  const submitQuiz = () => setSubmitted(true);
  const retryQuiz = () => { setAnswers(Array(module.questions.length).fill(-1)); setSubmitted(false); };
  const quizPassed = done || (submitted && score >= quizPassCount);

  useLayoutEffect(() => {
    const requestedTab = Number(new URLSearchParams(window.location.search).get('tab'));
    setActiveTab(Number.isInteger(requestedTab) && requestedTab >= 0 && requestedTab < moduleTabLabels.length ? requestedTab : 0);
    setAnswers(Array(module.questions.length).fill(-1));
    setSubmitted(false);
    setBookmarked(false);
  }, [module.num]);

  const completeAndContinue = async () => {
    const next = { ...progress, completedModules: [...new Set([...progress.completedModules, module.num])] };
    if (!done) await updateProgress(next);
    const destination = module.num < modules.length ? `/module/${module.num + 1}` : '/exam';
    setLocation(destination);
  };
  if (locked) return <LockedModule module={module} previous={module.num - 1} />;
  return (
    <div className="mx-auto max-w-[1120px]">
      <Link href="/curriculum" className="animate-rise inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.17em] text-[#78877E] transition-colors hover:text-[#B34E30]" data-testid="link-back-curriculum"><ArrowLeft size={14} /> Curriculum</Link>
      <div className="animate-rise delay-1 mt-7 grid gap-8 lg:grid-cols-[1fr_290px]">
        <div><div className="flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-[.19em] text-[#B34E30]"><span>{module.phaseNum}</span><span className="h-1 w-1 rounded-full bg-[#D8A84E]" /><span>Module {String(module.num).padStart(2, '0')}</span>{done && <span className="flex items-center gap-1 text-[#517D62]"><CheckCircle2 size={12} /> Cleared</span>}</div><h1 className="mt-4 max-w-3xl font-display text-4xl font-extrabold leading-[.98] tracking-[-.055em] md:text-6xl">{module.title}</h1><p className="mt-5 max-w-2xl text-[15px] leading-7 text-[#5E6E65]">{module.summary} This module turns the principle into a sequence you can use on a real project.</p><div className="mt-7 flex flex-wrap items-center gap-5 font-mono text-[10px] uppercase tracking-[.14em] text-[#78877E]"><span className="flex items-center gap-2"><Clock3 size={14} /> {module.duration}</span><span className="flex items-center gap-2"><HelpCircle size={14} /> {module.questions.length} knowledge checks</span><button onClick={() => setBookmarked(!bookmarked)} className={`flex items-center gap-2 transition-colors ${bookmarked ? 'text-[#B34E30]' : 'hover:text-[#B34E30]'}`} data-testid="button-bookmark-module"><Bookmark size={14} fill={bookmarked ? 'currentColor' : 'none'} /> {bookmarked ? 'Saved' : 'Save for later'}</button></div></div>
        <div className="bg-[#20352D] p-5 text-[#F4EFE6] shadow-[4px_4px_0_#D8A84E]"><p className="font-mono text-[9px] uppercase tracking-[.19em] text-[#9FB7A5]">Module brief</p><p className="mt-4 font-display text-xl font-extrabold leading-tight">Learn it. Inspect it. Explain it.</p><div className="mt-6 space-y-3 border-t border-[#355248] pt-4">{module.sections.map((section, index) => <div key={section} className="flex gap-3 text-[11px] leading-4 text-[#C3D0C7]"><span className="font-mono text-[9px] text-[#D8A84E]">0{index + 1}</span><span>{section}</span></div>)}</div></div>
      </div>
      <TabbedLessonContent module={module} activeTab={activeTab} setActiveTab={setActiveTab} answers={answers} setAnswers={setAnswers} submitted={submitted} score={score} onSubmit={submitQuiz} onRetry={retryQuiz} done={done} quizPassed={quizPassed} onCompleteAndContinue={completeAndContinue} />
    </div>
  );
}

const moduleTabLabels = ['Fundamentals', 'Planning', 'Specifications', 'Inspection', 'Application', 'Q&A', 'Quiz'];

function renderLessonMarkdown(content: string) {
  return content.split('\n').map((line, lineIndex) => (
    <Fragment key={`line-${lineIndex}`}>
      {lineIndex > 0 && <br />}
      {renderBoldMarkdownLine(line, lineIndex)}
    </Fragment>
  ));
}

function renderBoldMarkdownLine(line: string, lineIndex: number) {
  const nodes: ReactNode[] = [];
  const boldPattern = /\*\*(.+?)\*\*/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  let matchIndex = 0;

  while ((match = boldPattern.exec(line))) {
    if (match.index > cursor) {
      nodes.push(line.slice(cursor, match.index));
    }
    nodes.push(
      <strong key={`bold-${lineIndex}-${matchIndex}`} className="font-extrabold text-[#40554A]">
        {match[1]}
      </strong>,
    );
    cursor = boldPattern.lastIndex;
    matchIndex += 1;
  }

  if (cursor < line.length) {
    nodes.push(line.slice(cursor));
  }

  return nodes.length > 0 ? nodes : line;
}

function TabbedLessonContent({ module, activeTab, setActiveTab, answers, setAnswers, submitted, score, onSubmit, onRetry, done, quizPassed, onCompleteAndContinue }: { module: Module; activeTab: number; setActiveTab: (value: number) => void; answers: number[]; setAnswers: (value: number[]) => void; submitted: boolean; score: number; onSubmit: () => void; onRetry: () => void; done: boolean; quizPassed: boolean; onCompleteAndContinue: () => void | Promise<void> }) {
  const [, setLocation] = useLocation();
  const { modules } = useRequiredCourseContent();
  const isQuiz = activeTab === 6;
  const isQandA = activeTab === 5;
  const progressPercent = done ? 100 : Math.round(((activeTab + 1) / moduleTabLabels.length) * 100);
  const lessonSections = module.lessonSections ?? module.sections.map((title) => ({
    title,
    content: 'A sound build begins with a clear decision. Establish the governing condition, check the project requirements, and keep the sequence visible to the people doing the work. On site, this is where theory becomes a repeatable inspection: measure the condition, compare it with the approved detail, and document the result before the next trade closes the work.',
  }));
  const qaReview = module.qaReview ?? [
    ['What should I verify before work begins?', 'Confirm the approved documents, controlling site condition, required tolerances, and who has authority to accept the work.'],
    ['Where should the inspection hold point occur?', 'Place it immediately before the work becomes concealed or the next trade makes correction costly.'],
    ['What evidence belongs in the project record?', 'Keep measurements, marked-up details, photographs, test results, and the responsible approval together.'],
    ['What happens when the field condition differs?', 'Stop the affected work, record the difference, and route it to the responsible designer or authority before changing the detail.'],
  ].map(([question, answer]) => ({ question, answer }));
  const quizPassCount = module.quizPassCount ?? 3;

  const previous = () => {
    if (activeTab > 0) {
      setActiveTab(activeTab - 1);
      return;
    }
    if (module.num > 1) setLocation(`/module/${module.num - 1}?tab=6`);
  };

  const next = async () => {
    if (activeTab < moduleTabLabels.length - 1) {
      setActiveTab(activeTab + 1);
    } else if (quizPassed) {
      await onCompleteAndContinue();
    }
    scrollCourseToTop();
  };

  return (
    <div className="animate-rise delay-2 mt-12">
      <div className="overflow-x-auto border-b border-[#CFC5B5]" role="tablist" aria-label={`Module ${module.num} sections`}>
        <div className="flex min-w-max gap-1">
          {moduleTabLabels.map((label, index) => (
            <button
              key={label}
              type="button"
              role="tab"
              aria-selected={activeTab === index}
              aria-controls="module-tab-panel"
              onClick={() => setActiveTab(index)}
              className={`relative px-4 py-3 font-mono text-[9px] font-bold uppercase tracking-[.13em] transition-colors ${activeTab === index ? 'bg-[#20352D] text-[#F4EFE6]' : 'text-[#78877E] hover:bg-[#EFE7DA] hover:text-[#B34E30]'}`}
              data-testid={`tab-module-${index + 1}`}
            >
              <span className={`mr-2 ${activeTab === index ? 'text-[#D8A84E]' : 'text-[#B2A99B]'}`}>{String(index + 1).padStart(2, '0')}</span>
              {label}
              {index === 6 && done && <CheckCircle2 size={11} className="ml-2 inline text-[#9FC2A6]" />}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_290px]">
        <article id="module-tab-panel" role="tabpanel" className="min-w-0 border border-[#DDD4C5] bg-[#F8F4ED] p-6 md:p-8">
          {!isQuiz && !isQandA && (
            <section>
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-[10px] text-[#B34E30]">{String(activeTab + 1).padStart(2, '0')}</span>
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[.18em] text-[#78877E]">Content section {activeTab + 1} of 5</p>
                   <h2 className="mt-2 font-display text-2xl font-extrabold tracking-[-.04em]">{lessonSections[activeTab].title}</h2>
                </div>
              </div>
                <div className="mt-6 whitespace-pre-wrap text-[14px] leading-7 text-[#5E6E65]">{renderLessonMarkdown(lessonSections[activeTab].content)}</div>
               {!module.lessonSections && <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="border-l-2 border-[#D8A84E] bg-[#F2E8D6] p-4"><p className="font-mono text-[9px] uppercase tracking-[.17em] text-[#B34E30]">Builder’s note</p><p className="mt-2 text-[12px] font-medium leading-5 text-[#40554A]">If it cannot be inspected later, give it a hold point now.</p></div>
                <div className="border-l-2 border-[#517D62] bg-[#E2EFE1] p-4"><p className="font-mono text-[9px] uppercase tracking-[.17em] text-[#41674F]">Field action</p><p className="mt-2 text-[12px] font-medium leading-5 text-[#40554A]">Record the requirement, responsible trade, evidence, and approval before work advances.</p></div>
               </div>}
            </section>
          )}

          {isQandA && (
            <section>
              <p className="font-mono text-[9px] uppercase tracking-[.18em] text-[#B34E30]">Questions & answers</p>
              <h2 className="mt-2 font-display text-2xl font-extrabold tracking-[-.04em]">Clear the field questions.</h2>
              <div className="mt-6 divide-y divide-[#DDD4C5] border-y border-[#DDD4C5]">
                 {qaReview.map(({ question, answer }, index) => (
                  <div key={question} className="py-5">
                    <h3 className="flex gap-3 text-[13px] font-bold"><span className="font-mono text-[10px] text-[#B34E30]">Q{index + 1}</span>{question}</h3>
                    <p className="mt-2 pl-7 text-[12px] leading-6 text-[#5E6E65]">{answer}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {isQuiz && (
            <section>
              <p className="font-mono text-[9px] uppercase tracking-[.18em] text-[#B34E30]">Module quiz</p>
              <h2 className="mt-2 font-display text-2xl font-extrabold tracking-[-.04em]">{done ? 'Module cleared' : 'Prove the decision.'}</h2>
               <p className="mt-3 text-[12px] leading-5 text-[#78877E]">Answer all {module.questions.length} questions. A score of {quizPassCount} out of {module.questions.length} unlocks the next module.</p>
               <TabbedQuiz questions={module.questions} passCount={quizPassCount} answers={answers} setAnswers={setAnswers} submitted={submitted} score={score} onSubmit={onSubmit} onRetry={onRetry} done={done} />
            </section>
          )}

          <div className="mt-10 flex items-center justify-between gap-4 border-t border-[#DDD4C5] pt-6">
            <button type="button" onClick={previous} disabled={module.num === 1 && activeTab === 0} className="flex items-center gap-2 border border-[#CFC5B5] px-4 py-3 text-[11px] font-bold transition-colors hover:border-[#D2643F] hover:text-[#B34E30] disabled:cursor-not-allowed disabled:opacity-35" data-testid="button-module-prev"><ArrowLeft size={14} /> Prev</button>
            <span className="hidden font-mono text-[9px] uppercase tracking-[.15em] text-[#9A988E] sm:block">{activeTab + 1} / {moduleTabLabels.length}</span>
            <button type="button" onClick={next} disabled={isQuiz && !quizPassed} className="flex items-center gap-2 bg-[#D2643F] px-5 py-3 text-[11px] font-bold text-[#F4EFE6] transition-colors hover:bg-[#B34E30] disabled:cursor-not-allowed disabled:bg-[#B2A99B]" data-testid="button-module-next">{isQuiz ? (module.num === modules.length ? 'Continue to final exam' : `Continue to module ${String(module.num + 1).padStart(2, '0')}`) : 'Next'} <ArrowRight size={14} /></button>
          </div>
          {isQuiz && !quizPassed && <p className="mt-3 text-right text-[10px] text-[#78877E]">Pass the quiz to continue.</p>}
        </article>

        <aside className="h-fit border border-[#DDD4C5] bg-[#F8F4ED] p-5 lg:sticky lg:top-[100px]">
          <p className="font-mono text-[9px] uppercase tracking-[.18em] text-[#78877E]">Module progress</p>
          <div className="mt-4 flex items-center gap-3"><ProgressBar value={progressPercent} className="flex-1" /><span className="font-mono text-[10px] text-[#78877E]">{progressPercent}%</span></div>
          <div className="mt-5 space-y-3 border-t border-[#DDD4C5] pt-4">
            {moduleTabLabels.map((label, index) => <button key={label} type="button" onClick={() => setActiveTab(index)} className={`flex w-full items-center gap-3 text-left text-[11px] ${index === activeTab ? 'font-bold text-[#13231F]' : index < activeTab || done ? 'text-[#517D62]' : 'text-[#9A988E]'}`}><span className={`flex h-[15px] w-[15px] items-center justify-center rounded-full border ${index < activeTab || done ? 'border-[#7DA686] bg-[#D6E4D7]' : index === activeTab ? 'border-[#D2643F]' : 'border-[#CFC5B5]'}`}>{(index < activeTab || done) && <Check size={9} />}</span><span>{label}</span></button>)}
          </div>
          <Link href="/curriculum" className="mt-7 flex items-center justify-center gap-2 border border-[#CFC5B5] py-2.5 text-[11px] font-bold transition-colors hover:border-[#D2643F] hover:text-[#B34E30]" data-testid="link-all-modules">All modules <ArrowRight size={13} /></Link>
        </aside>
      </div>
    </div>
  );
}

function TabbedQuiz({ questions, passCount, answers, setAnswers, submitted, score, onSubmit, onRetry, done }: { questions: Question[]; passCount: number; answers: number[]; setAnswers: (value: number[]) => void; submitted: boolean; score: number; onSubmit: () => void; onRetry: () => void; done: boolean }) {
  return <div className="mt-7 space-y-8">{questions.map((question, index) => <fieldset key={question.prompt} className="border-t border-[#DDD4C5] pt-5"><legend className="max-w-2xl text-[14px] font-bold leading-5"><span className="mr-2 font-mono text-[10px] text-[#B34E30]">{String(index + 1).padStart(2, '0')}</span>{question.prompt}</legend><div className="mt-4 grid gap-2">{question.options.map((option, optionIndex) => { const selected = answers[index] === optionIndex; const correct = submitted && optionIndex === question.correct; const incorrect = submitted && selected && !correct; return <button key={option} type="button" disabled={submitted || done} onClick={() => { const nextAnswers = [...answers]; nextAnswers[index] = optionIndex; setAnswers(nextAnswers); }} className={`flex items-start gap-3 border p-3 text-left text-[12px] leading-5 transition-all ${correct ? 'border-[#7DA686] bg-[#E2EFE1]' : incorrect ? 'border-[#D2643F] bg-[#F3D6CA]' : selected ? 'border-[#D2643F] bg-[#F8E9E2]' : 'border-[#DDD4C5] bg-[#F8F4ED] hover:border-[#B5A99A]'} ${submitted || done ? 'cursor-default' : ''}`} data-testid={`button-answer-${index + 1}-${optionIndex + 1}`}><span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border font-mono text-[9px] ${selected ? 'border-[#D2643F] bg-[#D2643F] text-[#F4EFE6]' : 'border-[#CFC5B5] text-[#9A988E]'}`}>{selected ? <Check size={10} /> : String.fromCharCode(65 + optionIndex)}</span><span>{option}</span></button>; })}</div>{submitted && question.rationale && <p className="mt-3 border-l-2 border-[#D8A84E] pl-3 text-[11px] leading-5 text-[#5E6E65]"><strong className="text-[#13231F]">Why:</strong> {question.rationale}</p>}</fieldset>)}<div className="flex flex-col items-start justify-between gap-4 border-t border-[#DDD4C5] pt-6 sm:flex-row sm:items-center">{done ? <div><p className="font-display text-xl font-extrabold text-[#517D62]">Previously cleared</p><p className="mt-1 text-[11px] text-[#78877E]">Use Next to continue through the course.</p></div> : submitted ? <div><p className={`font-display text-xl font-extrabold ${score >= passCount ? 'text-[#517D62]' : 'text-[#B34E30]'}`}>{score} / {questions.length} correct</p><p className="mt-1 text-[11px] text-[#78877E]">{score >= passCount ? 'Good call. Next is now unlocked.' : 'Review the lesson tabs, then take another pass.'}</p></div> : <p className="text-[11px] text-[#78877E]">{answers.filter((answer) => answer >= 0).length} of {questions.length} answered · {passCount} correct to clear</p>}{!done && (submitted && score < passCount ? <button onClick={onRetry} className="flex items-center gap-2 bg-[#D2643F] px-5 py-3 text-[12px] font-bold text-[#F4EFE6]" data-testid="button-retry-quiz"><RotateCcw size={14} /> Try again</button> : !submitted ? <button onClick={() => { if (answers.every((answer) => answer >= 0)) onSubmit(); }} disabled={answers.some((answer) => answer < 0)} className="flex items-center gap-2 bg-[#D2643F] px-5 py-3 text-[12px] font-bold text-[#F4EFE6] transition-colors hover:bg-[#B34E30] disabled:cursor-not-allowed disabled:bg-[#B2A99B]" data-testid="button-submit-quiz">Submit answers <ArrowRight size={14} /></button> : null)}</div></div>;
}

function LessonContent({ module, quizOpen, setQuizOpen, answers, setAnswers, submitted, score, onFinish, onSubmit, onRetry, done }: { module: Module; quizOpen: boolean; setQuizOpen: (value: boolean) => void; answers: number[]; setAnswers: (value: number[]) => void; submitted: boolean; score: number; onFinish: () => void; onSubmit: () => void; onRetry: () => void; done: boolean }) {
  return <div className="animate-rise delay-2 mt-12 grid gap-8 lg:grid-cols-[1fr_290px]"><article className="min-w-0"><div className="mb-7 flex items-center justify-between border-b border-[#DDD4C5] pb-4"><span className="font-mono text-[9px] uppercase tracking-[.18em] text-[#78877E]">Field notes / 01—03</span><span className="font-mono text-[9px] uppercase tracking-[.18em] text-[#B34E30]">Read time 24 min</span></div><div className="space-y-8">{module.sections.map((section, index) => <section key={section} className="border-l-2 border-[#D8A84E] pl-5"><div className="flex items-baseline gap-3"><span className="font-mono text-[10px] text-[#B34E30]">0{index + 1}</span><h2 className="font-display text-xl font-extrabold tracking-[-.03em]">{section}</h2></div><p className="mt-3 text-[13px] leading-7 text-[#5E6E65]">A sound build begins with a clear decision. Establish the governing condition, check the project requirements, and keep the sequence visible to the people doing the work. On site, this is where theory becomes a repeatable inspection: measure the condition, compare it with the approved detail, and document the result before the next trade closes the work.</p><div className="mt-4 border border-[#DDD4C5] bg-[#F8F4ED] p-4"><p className="font-mono text-[9px] uppercase tracking-[.17em] text-[#B34E30]">Builder’s note</p><p className="mt-2 text-[12px] font-medium leading-5 text-[#40554A]">If it cannot be inspected later, give it a hold point now.</p></div></section>)}</div><div className="mt-12 border-t-2 border-[#13231F] pt-6"><button onClick={() => setQuizOpen(!quizOpen)} className="flex w-full items-center justify-between text-left" data-testid="button-toggle-knowledge-check"><span><span className="block font-mono text-[9px] uppercase tracking-[.2em] text-[#B34E30]">Knowledge check</span><span className="mt-2 block font-display text-2xl font-extrabold tracking-[-.04em]">{done ? 'Module cleared' : 'Prove the decision'}</span></span><span className="flex h-10 w-10 items-center justify-center border border-[#CFC5B5]">{quizOpen ? <ChevronDown size={17} /> : <ChevronRight size={17} />}</span></button>{quizOpen && <Quiz questions={module.questions} answers={answers} setAnswers={setAnswers} submitted={submitted} score={score} onFinish={onFinish} onSubmit={onSubmit} onRetry={onRetry} done={done} />}</div></article><aside className="h-fit border border-[#DDD4C5] bg-[#F8F4ED] p-5 lg:sticky lg:top-[100px]"><p className="font-mono text-[9px] uppercase tracking-[.18em] text-[#78877E]">Module progress</p><div className="mt-4 flex items-center gap-3"><ProgressBar value={done ? 100 : quizOpen ? 78 : 35} className="flex-1" /><span className="font-mono text-[10px] text-[#78877E]">{done ? '100%' : quizOpen ? '78%' : '35%'}</span></div><div className="mt-5 space-y-3 border-t border-[#DDD4C5] pt-4"><div className="flex items-center gap-3 text-[11px]"><CheckCircle2 size={15} className="text-[#517D62]" /><span>Module brief</span></div><div className="flex items-center gap-3 text-[11px]"><CheckCircle2 size={15} className="text-[#517D62]" /><span>Three field notes</span></div><div className={`flex items-center gap-3 text-[11px] ${quizOpen ? 'text-[#13231F]' : 'text-[#9A988E]'}`}>{quizOpen ? <CheckCircle2 size={15} className="text-[#D2643F]" /> : <span className="h-[15px] w-[15px] rounded-full border border-[#CFC5B5]" />}<span>Knowledge check</span></div></div><Link href="/curriculum" className="mt-7 flex items-center justify-center gap-2 border border-[#CFC5B5] py-2.5 text-[11px] font-bold transition-colors hover:border-[#D2643F] hover:text-[#B34E30]" data-testid="link-all-modules">All modules <ArrowRight size={13} /></Link></aside></div>;
}

function Quiz({ questions, answers, setAnswers, submitted, score, onFinish, onSubmit, onRetry, done }: { questions: Question[]; answers: number[]; setAnswers: (value: number[]) => void; submitted: boolean; score: number; onFinish: () => void; onSubmit: () => void; onRetry: () => void; done: boolean }) {
  return <div className="mt-7 space-y-8">{questions.map((question, index) => <fieldset key={question.prompt} className="border-t border-[#DDD4C5] pt-5"><legend className="max-w-2xl text-[14px] font-bold leading-5"><span className="mr-2 font-mono text-[10px] text-[#B34E30]">0{index + 1}</span>{question.prompt}</legend><div className="mt-4 grid gap-2">{question.options.map((option, optionIndex) => { const selected = answers[index] === optionIndex; const correct = submitted && optionIndex === question.correct; const incorrect = submitted && selected && !correct; return <button key={option} type="button" disabled={submitted} onClick={() => { const next = [...answers]; next[index] = optionIndex; setAnswers(next); }} className={`flex items-start gap-3 border p-3 text-left text-[12px] leading-5 transition-all ${correct ? 'border-[#7DA686] bg-[#E2EFE1]' : incorrect ? 'border-[#D2643F] bg-[#F3D6CA]' : selected ? 'border-[#D2643F] bg-[#F8E9E2]' : 'border-[#DDD4C5] bg-[#F8F4ED] hover:border-[#B5A99A]'} ${submitted ? 'cursor-default' : ''}`} data-testid={`button-answer-${index + 1}-${optionIndex + 1}`}><span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border font-mono text-[9px] ${selected ? 'border-[#D2643F] bg-[#D2643F] text-[#F4EFE6]' : 'border-[#CFC5B5] text-[#9A988E]'}`}>{selected ? <Check size={10} /> : String.fromCharCode(65 + optionIndex)}</span><span>{option}</span></button>; })}</div>{submitted && <p className="mt-3 border-l-2 border-[#D8A84E] pl-3 text-[11px] leading-5 text-[#5E6E65]"><strong className="text-[#13231F]">Why:</strong> {question.rationale}</p>}</fieldset>)}<div className="flex flex-col items-start justify-between gap-4 border-t border-[#DDD4C5] pt-6 sm:flex-row sm:items-center">{submitted ? <div><p className={`font-display text-xl font-extrabold ${score >= 3 ? 'text-[#517D62]' : 'text-[#B34E30]'}`}>{score} / 4 correct</p><p className="mt-1 text-[11px] text-[#78877E]">{score >= 3 ? 'Good call. The module is cleared.' : 'Review the field notes, then take another pass.'}</p></div> : <p className="text-[11px] text-[#78877E]">{answers.filter((answer) => answer >= 0).length} of 4 answered · 3 correct to clear</p>}{submitted ? (score >= 3 && !done ? <button onClick={onFinish} className="flex items-center gap-2 bg-[#517D62] px-5 py-3 text-[12px] font-bold text-[#F4EFE6] hover:bg-[#41674F]" data-testid="button-complete-module"><Check size={15} /> Mark module complete</button> : score < 3 ? <button onClick={onRetry} className="flex items-center gap-2 bg-[#D2643F] px-5 py-3 text-[12px] font-bold text-[#F4EFE6]" data-testid="button-retry-quiz"><RotateCcw size={14} /> Try again</button> : <Link href="/curriculum" className="flex items-center gap-2 bg-[#13231F] px-5 py-3 text-[12px] font-bold text-[#F4EFE6]" data-testid="link-return-curriculum">Return to curriculum <ArrowRight size={14} /></Link>) : <button onClick={() => { if (answers.every((answer) => answer >= 0)) onSubmit(); }} disabled={answers.some((answer) => answer < 0)} className="flex items-center gap-2 bg-[#D2643F] px-5 py-3 text-[12px] font-bold text-[#F4EFE6] transition-colors hover:bg-[#B34E30] disabled:cursor-not-allowed disabled:bg-[#B2A99B]" data-testid="button-submit-quiz">Submit answers <ArrowRight size={14} /></button>}</div></div>;
}

function LockedModule({ module, previous }: { module: Module; previous: number }) {
  return <div className="mx-auto max-w-[760px] py-10 text-center"><span className="mx-auto flex h-16 w-16 items-center justify-center bg-[#E8E1D7] text-[#9A988E]"><LockKeyhole size={26} /></span><p className="mt-7 font-mono text-[10px] uppercase tracking-[.2em] text-[#B34E30]">Module {String(module.num).padStart(2, '0')} / locked</p><h1 className="mt-3 font-display text-4xl font-extrabold tracking-[-.05em]">{module.title}</h1><p className="mx-auto mt-4 max-w-md text-[13px] leading-6 text-[#78877E]">Clear module {String(previous).padStart(2, '0')} first. The sequence protects the decisions that come next.</p><Link href={`/module/${previous}`} className="mt-8 inline-flex items-center gap-2 bg-[#D2643F] px-5 py-3 text-[12px] font-bold text-[#F4EFE6] shadow-[3px_3px_0_#13231F]" data-testid="link-previous-module">Go to module {String(previous).padStart(2, '0')} <ArrowRight size={15} /></Link></div>;
}

function Exam() {
  const { progress, updateProgress } = useCourse();
  const { finalExamQuestions } = useRequiredCourseContent();
  const finalExamPassCount = Math.ceil(finalExamQuestions.length * (FINAL_EXAM_PASS_PERCENT / 100));
  const unlocked = progress.completedModules.length === 22;
  const [started, setStarted] = useState(false);
  const [answers, setAnswers] = useState<number[]>(Array(finalExamQuestions.length).fill(-1));
  const [submitted, setSubmitted] = useState(false);
  const score = answers.reduce((total, answer, index) => total + (answer === finalExamQuestions[index].correct ? 1 : 0), 0);
  const submit = () => { if (answers.every((answer) => answer >= 0)) { const next = { ...progress, examScore: Math.round((score / finalExamQuestions.length) * 100) }; updateProgress(next); setSubmitted(true); } };
  return <div className="mx-auto max-w-[1080px]">{!started ? <><div className="animate-rise max-w-3xl"><p className="font-mono text-[10px] uppercase tracking-[.23em] text-[#B34E30]">The capstone / {finalExamQuestions.length} questions</p><h1 className="mt-3 font-display text-5xl font-extrabold leading-[.95] tracking-[-.055em] md:text-7xl">Put the whole<br /><span className="text-[#D2643F]">site together.</span></h1><p className="mt-6 max-w-xl text-[14px] leading-7 text-[#5E6E65]">The final examination is a single pass through the decisions behind a durable build. It is designed to test judgment, not memorization.</p></div><div className="animate-rise delay-1 mt-11 grid gap-7 border-y border-[#DDD4C5] py-7 md:grid-cols-3"><Stat label="Questions" value={String(finalExamQuestions.length)} detail="Three per module" icon={ClipboardCheck} /><Stat label="Passing mark" value={`${FINAL_EXAM_PASS_PERCENT}%`} detail={`${finalExamPassCount} correct answers`} icon={Target} accent="gold" /><Stat label="Time window" value="45 min" detail="No timer in practice mode" icon={Clock3} accent="sage" /></div><div className="animate-rise delay-2 mt-9 flex flex-col gap-4 border border-[#DDD4C5] bg-[#F8F4ED] p-6 md:flex-row md:items-center md:justify-between md:p-8"><div className="flex gap-4"><div className="flex h-11 w-11 shrink-0 items-center justify-center bg-[#D6E4D7] text-[#517D62]"><ShieldCheck size={21} /></div><div><h2 className="font-display text-xl font-extrabold">{unlocked ? 'You have earned the attempt.' : 'Complete all 22 modules to unlock.'}</h2><p className="mt-1 text-[12px] leading-5 text-[#78877E]">{unlocked ? 'Your module notes are available during this practice pass.' : `${progress.completedModules.length} of 22 modules cleared · the exam remains safely behind the last inspection.`}</p></div></div><button disabled={!unlocked} onClick={() => setStarted(true)} className="flex items-center justify-center gap-2 bg-[#D2643F] px-5 py-3 text-[12px] font-bold text-[#F4EFE6] disabled:cursor-not-allowed disabled:bg-[#C7BFB2]" data-testid="button-start-exam">{unlocked ? 'Begin examination' : 'Exam locked'} <ArrowRight size={15} /></button></div>{progress.examScore !== null && <div className="mt-5 flex items-center gap-3 border border-[#7DA686] bg-[#E2EFE1] p-4 text-[12px] text-[#41674F]" data-testid="status-exam-score"><CheckCircle2 size={17} /> Previous result: <strong>{progress.examScore}%</strong></div>}</> : <div className="animate-rise"><div className="flex flex-col justify-between gap-4 border-b border-[#DDD4C5] pb-6 md:flex-row md:items-end"><div><p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#B34E30]">Final examination / practice mode</p><h1 className="mt-2 font-display text-3xl font-extrabold tracking-[-.05em]">The complete build</h1></div><div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-wider text-[#78877E]"><span>{answers.filter((answer) => answer >= 0).length} / {finalExamQuestions.length} answered</span><button onClick={() => { setStarted(false); setSubmitted(false); }} className="flex items-center gap-1 text-[#B34E30]" data-testid="button-exit-exam"><X size={13} /> Exit</button></div></div><div className="mt-7 space-y-7">{finalExamQuestions.map((question, index) => <ExamQuestion key={question.prompt} question={question} index={index} answer={answers[index]} setAnswer={(value) => { const next = [...answers]; next[index] = value; setAnswers(next); }} submitted={submitted} />)}</div><div className="sticky bottom-4 mt-9 flex flex-col justify-between gap-4 border border-[#DDD4C5] bg-[#F8F4ED]/95 p-4 shadow-[var(--shadow-md)] backdrop-blur md:flex-row md:items-center"><p className="text-[12px] text-[#78877E]">{submitted ? `Result: ${score} / ${finalExamQuestions.length} correct` : 'Take your time. Your best answer is usually the one tied to the field condition.'}</p>{submitted ? <Link href="/certificate" className="flex items-center justify-center gap-2 bg-[#517D62] px-5 py-3 text-[12px] font-bold text-[#F4EFE6]" data-testid="link-exam-certificate">View certificate path <Award size={15} /></Link> : <button onClick={submit} disabled={answers.some((answer) => answer < 0)} className="flex items-center justify-center gap-2 bg-[#D2643F] px-5 py-3 text-[12px] font-bold text-[#F4EFE6] disabled:cursor-not-allowed disabled:bg-[#B2A99B]" data-testid="button-submit-exam">Submit examination <Check size={15} /></button>}</div></div>}</div>;
}

function ExamQuestion({ question, index, answer, setAnswer, submitted }: { question: Question; index: number; answer: number; setAnswer: (value: number) => void; submitted: boolean }) {
  return <fieldset className="border-t border-[#DDD4C5] pt-5"><legend className="max-w-3xl text-[14px] font-bold leading-5"><span className="mr-3 font-mono text-[10px] text-[#B34E30]">{String(index + 1).padStart(2, '0')}</span>{question.prompt}</legend><div className="mt-4 grid gap-2 md:grid-cols-2">{question.options.map((option, optionIndex) => <button key={option} type="button" onClick={() => setAnswer(optionIndex)} disabled={submitted} className={`flex items-start gap-3 border p-3 text-left text-[12px] leading-5 transition-colors ${answer === optionIndex ? 'border-[#D2643F] bg-[#F8E9E2]' : 'border-[#DDD4C5] bg-[#F8F4ED] hover:border-[#B5A99A]'} ${submitted && optionIndex === question.correct ? 'border-[#7DA686] bg-[#E2EFE1]' : ''}`} data-testid={`button-exam-answer-${index + 1}-${optionIndex + 1}`}><span className="font-mono text-[10px] text-[#9A988E]">{String.fromCharCode(65 + optionIndex)}</span>{option}</button>)}</div></fieldset>;
}

function Certificate() {
  const { progress } = useCourse();
  const ready = progress.completedModules.length === 22 && (progress.examScore ?? 0) >= FINAL_EXAM_PASS_PERCENT;
  return <div className="mx-auto max-w-[1030px]"><div className="animate-rise"><p className="font-mono text-[10px] uppercase tracking-[.23em] text-[#B34E30]">Proof of practice / certificate path</p><h1 className="mt-3 font-display text-5xl font-extrabold tracking-[-.055em] md:text-6xl">Make the work<br /><span className="text-[#D2643F]">official.</span></h1><p className="mt-5 max-w-xl text-[14px] leading-7 text-[#5E6E65]">A certificate is not a shortcut. It is the record of 22 completed modules and a passing capstone exam.</p></div><div className="animate-rise delay-1 mt-11 grid gap-8 lg:grid-cols-[1fr_330px]"><div className="relative overflow-hidden border-2 border-[#13231F] bg-[#F8F4ED] p-7 shadow-[7px_7px_0_#D8A84E] md:p-10" data-testid="card-certificate-preview"><div className="absolute right-[-32px] top-[-32px] h-28 w-28 rounded-full border-[18px] border-[#F3D6CA]" /><div className="flex items-start justify-between"><span className="font-mono text-[10px] font-bold tracking-[.23em] text-[#B34E30]">MASTER BUILDER<br />FIELD SCHOOL</span><Award size={29} className="text-[#D8A84E]" /></div><div className="mt-20 md:mt-28"><p className="font-mono text-[9px] uppercase tracking-[.22em] text-[#78877E]">Certificate of completion</p><h2 className="mt-3 font-display text-4xl font-extrabold tracking-[-.05em]">Alex Rivera</h2><p className="mt-3 max-w-sm text-[12px] leading-5 text-[#5E6E65]">has completed the Master Builder curriculum: site, structure, envelope, MEP and closeout.</p></div><div className="mt-16 flex items-end justify-between border-t border-[#DDD4C5] pt-4"><span className="font-mono text-[9px] uppercase tracking-[.15em] text-[#78877E]">Candidate / MB-2025-104</span><span className="font-display text-xl italic text-[#13231F]">MBS</span></div></div><div className="border border-[#DDD4C5] bg-[#F8F4ED] p-6"><p className="font-mono text-[9px] uppercase tracking-[.18em] text-[#78877E]">Your requirements</p><div className="mt-5 space-y-4">{[{ label: 'Curriculum complete', value: `${progress.completedModules.length} / 22`, ok: progress.completedModules.length === 22 }, { label: 'Final examination', value: progress.examScore === null ? 'Not attempted' : `${progress.examScore}%`, ok: (progress.examScore ?? 0) >= FINAL_EXAM_PASS_PERCENT }, { label: 'Certificate status', value: ready ? 'Ready to issue' : 'In progress', ok: ready }].map((item) => <div key={item.label} className="flex items-start gap-3 border-t border-[#DDD4C5] pt-4"><span className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full ${item.ok ? 'bg-[#D6E4D7] text-[#517D62]' : 'bg-[#E8E1D7] text-[#9A988E]'}`}>{item.ok ? <Check size={12} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}</span><span className="flex-1"><span className="block text-[11px] font-bold">{item.label}</span><span className="mt-1 block font-mono text-[10px] uppercase tracking-wider text-[#78877E]">{item.value}</span></span></div>)}</div>{ready ? <button onClick={() => window.print()} className="mt-7 flex w-full items-center justify-center gap-2 bg-[#D2643F] py-3 text-[12px] font-bold text-[#F4EFE6]" data-testid="button-download-certificate"><FileCheck2 size={15} /> Print certificate</button> : <Link href={progress.completedModules.length < 22 ? '/curriculum' : '/exam'} className="mt-7 flex w-full items-center justify-center gap-2 border border-[#CFC5B5] py-3 text-[12px] font-bold hover:border-[#D2643F] hover:text-[#B34E30]" data-testid="link-certificate-next-step">{progress.completedModules.length < 22 ? 'Continue curriculum' : 'Take final exam'} <ArrowRight size={14} /></Link>}</div></div></div>;
}

function Profile() {
  const { user } = useUser();
  const { access } = useCourse();
  const { signOut } = useClerk();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.fullName || access.account?.displayName || 'Course learner');
  return <div className="mx-auto max-w-[900px]"><div className="animate-rise border-b border-[#DDD4C5] pb-8"><p className="font-mono text-[10px] uppercase tracking-[.23em] text-[#B34E30]">Your field record</p><h1 className="mt-3 font-display text-5xl font-extrabold tracking-[-.055em]">The builder behind<br />the build.</h1></div><div className="animate-rise delay-1 mt-9 grid gap-8 md:grid-cols-[220px_1fr]"><div className="flex flex-col items-center border border-[#DDD4C5] bg-[#20352D] p-7 text-center text-[#F4EFE6]"><span className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-[#D8A84E] bg-[#D2643F] font-display text-3xl font-extrabold">AR</span><p className="mt-5 font-display text-xl font-extrabold">{name}</p><p className="mt-1 font-mono text-[9px] uppercase tracking-[.16em] text-[#9FB7A5]">Homeowner / Builder</p><div className="mt-7 w-full border-t border-[#355248] pt-5"><p className="font-mono text-[9px] uppercase tracking-[.16em] text-[#9FB7A5]">Member since</p><p className="mt-1 text-[12px]">September 2025</p></div></div><div className="border border-[#DDD4C5] bg-[#F8F4ED] p-6 md:p-8"><div className="flex items-start justify-between"><div><p className="font-mono text-[9px] uppercase tracking-[.18em] text-[#78877E]">Account details</p><h2 className="mt-2 font-display text-2xl font-extrabold">Keep the record current.</h2></div><button onClick={() => setEditing(!editing)} className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-[#B34E30]" data-testid="button-edit-profile"><Settings2 size={14} /> {editing ? 'Done' : 'Edit'}</button></div>{editing ? <div className="mt-7 space-y-4"><label className="block text-[11px] font-bold">Name<input value={name} onChange={(event) => setName(event.target.value)} className="mt-2 block w-full border border-[#CFC5B5] bg-[#F4EFE6] px-3 py-2.5 text-[13px] outline-none focus:border-[#D2643F]" data-testid="input-profile-name" /></label><p className="text-[11px] text-[#78877E]">Changes are saved to this browser automatically.</p></div> : <div className="mt-7 grid gap-5 border-t border-[#DDD4C5] pt-5 md:grid-cols-2"><div><p className="font-mono text-[9px] uppercase tracking-wider text-[#78877E]">Email</p><p className="mt-2 text-[13px] font-medium">alex.rivera@example.com</p></div><div><p className="font-mono text-[9px] uppercase tracking-wider text-[#78877E]">Learning focus</p><p className="mt-2 text-[13px] font-medium">Whole-home renovation</p></div></div>}</div></div></div>;
  return <div className="mx-auto max-w-[900px]"><div className="animate-rise border-b border-[#DDD4C5] pb-8"><p className="font-mono text-[10px] uppercase tracking-[.23em] text-[#B34E30]">Your field record</p><h1 className="mt-3 font-display text-5xl font-extrabold tracking-[-.055em]">The builder behind<br />the build.</h1></div><div className="animate-rise delay-1 mt-9 grid gap-8 md:grid-cols-[220px_1fr]"><div className="flex flex-col items-center border border-[#DDD4C5] bg-[#20352D] p-7 text-center text-[#F4EFE6]"><span className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-[#D8A84E] bg-[#D2643F] font-display text-3xl font-extrabold">{name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span><p className="mt-5 font-display text-xl font-extrabold">{name}</p><p className="mt-1 font-mono text-[9px] uppercase tracking-[.16em] text-[#9FB7A5]">Course member</p><div className="mt-7 w-full border-t border-[#355248] pt-5"><p className="font-mono text-[9px] uppercase tracking-[.16em] text-[#9FB7A5]">Account status</p><p className="mt-1 text-[12px]">{access.status === 'paid' ? 'Paid access active' : 'Access pending'}</p></div></div><div className="border border-[#DDD4C5] bg-[#F8F4ED] p-6 md:p-8"><div className="flex items-start justify-between"><div><p className="font-mono text-[9px] uppercase tracking-[.18em] text-[#78877E]">Account details</p><h2 className="mt-2 font-display text-2xl font-extrabold">Keep the record current.</h2></div><button onClick={() => setEditing(!editing)} className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-[#B34E30]" data-testid="button-edit-profile"><Settings2 size={14} /> {editing ? 'Done' : 'Edit'}</button></div>{editing ? <div className="mt-7 space-y-4"><label className="block text-[11px] font-bold">Name<input value={name} onChange={(event) => setName(event.target.value)} className="mt-2 block w-full border border-[#CFC5B5] bg-[#F4EFE6] px-3 py-2.5 text-[13px] outline-none focus:border-[#D2643F]" data-testid="input-profile-name" /></label><p className="text-[11px] text-[#78877E]">Changes are saved to this browser automatically.</p></div> : <div className="mt-7 grid gap-5 border-t border-[#DDD4C5] pt-5 md:grid-cols-2"><div><p className="font-mono text-[9px] uppercase tracking-wider text-[#78877E]">Email</p><p className="mt-2 text-[13px] font-medium">{access.account?.email}</p></div><div><p className="font-mono text-[9px] uppercase tracking-wider text-[#78877E]">Learning focus</p><p className="mt-2 text-[13px] font-medium">Whole-home renovation</p></div></div>}<button onClick={() => void signOut({ redirectUrl: `${basePath}/` })} className="mt-7 border-t border-[#DDD4C5] pt-5 font-mono text-[10px] uppercase tracking-wider text-[#A94E22]" data-testid="button-sign-out-profile">Sign out</button></div></div></div>;
}

function SignInPage() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  if (!isLoaded) return <LoadingScreen />;
  if (isSignedIn) return <Redirect to="/" />;
  return <AuthPage mode="sign-in" basePath={basePath} />;
}

function SignUpPage() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  if (!isLoaded) return <LoadingScreen />;
  if (isSignedIn) return <Redirect to="/" />;
  return <AuthPage mode="sign-up" basePath={basePath} />;
}

function HomeRedirect() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { access } = useCourse();
  if (!isLoaded || (isSignedIn && access.status === 'loading')) return <LoadingScreen />;
  if (!isSignedIn) return <PublicHome />;
  if (access.status === 'unpaid') return <Paywall />;
  if (access.status === 'error') return <LoadingScreen label="Unable to load account. Refresh to try again." />;
  if (access.status !== 'paid') return <Redirect to="/sign-in" />;
  return <AppShell><Dashboard /></AppShell>;
}

function Router() {
  return <RoutedErrorBoundary><Switch><Route path="/" component={HomeRedirect} /><Route path="/privacy-policy">{() => <LegalPage kind="privacy" />}</Route><Route path="/terms-and-conditions">{() => <LegalPage kind="terms" />}</Route><Route path="/refund-policy">{() => <LegalPage kind="refund" />}</Route><Route path="/sign-in/sso-callback" component={AuthCallback} /><Route path="/sign-up/sso-callback" component={AuthCallback} /><Route path="/sign-in/*?" component={SignInPage} /><Route path="/sign-up/*?" component={SignUpPage} /><Route path="/curriculum">{() => <PaidRoute><AppShell><Curriculum /></AppShell></PaidRoute>}</Route><Route path="/module/:id">{(params) => <PaidRoute><AppShell><ModulePage id={params.id} /></AppShell></PaidRoute>}</Route><Route path="/exam">{() => <PaidRoute><AppShell><Exam /></AppShell></PaidRoute>}</Route><Route path="/certificate">{() => <PaidRoute><AppShell><Certificate /></AppShell></PaidRoute>}</Route><Route path="/profile">{() => <AuthRoute><AppShell><Profile /></AppShell></AuthRoute>}</Route><Route component={NotFound} /></Switch></RoutedErrorBoundary>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  const routerPush = useCallback((to: string) => {
    setLocation(stripBase(to));
  }, [setLocation]);
  const routerReplace = useCallback((to: string) => {
    setLocation(stripBase(to), { replace: true });
  }, [setLocation]);
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} routerPush={routerPush} routerReplace={routerReplace}><CourseProvider><Router /></CourseProvider></ClerkProvider>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={basePath}><ClerkProviderWithRoutes /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;