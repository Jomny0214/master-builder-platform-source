import { AlertCircle, ArrowLeft } from 'lucide-react';
import { SiteFooter } from '@/components/site-footer';
import { Link } from 'wouter';

export default function NotFound() {
  return (
    <div className="paper-grid flex min-h-[100dvh] w-full flex-col items-center justify-center gap-8 bg-[#F4EFE6] px-5 py-8">
      <div className="w-full max-w-md border border-[#DDD4C5] bg-[#F8F4ED] p-8 shadow-[4px_4px_0_#D8A84E]">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center bg-[#F3D6CA] text-[#B34E30]"><AlertCircle size={20} /></span>
          <span className="font-mono text-[10px] uppercase tracking-[.2em] text-[#B34E30]">Field record / 404</span>
        </div>
        <h1 className="mt-7 font-display text-3xl font-extrabold tracking-[-.05em] text-[#13231F]">That detail is not on this set.</h1>
        <p className="mt-3 text-[13px] leading-6 text-[#78877E]">The page may have moved, or this drawing was never issued.</p>
        <Link href="/" className="mt-7 inline-flex items-center gap-2 bg-[#13231F] px-4 py-3 text-[12px] font-bold text-[#F4EFE6]" data-testid="link-not-found-home"><ArrowLeft size={14} /> Back to overview</Link>
      </div>
      <div className="w-full max-w-md">
        <SiteFooter />
      </div>
    </div>
  );
}
