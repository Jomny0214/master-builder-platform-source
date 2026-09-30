import { Link } from 'wouter';

export type LegalPageKind = 'privacy' | 'terms' | 'refund';

const legalContent: Record<LegalPageKind, string> = {
  privacy: `PRIVACY POLICY

Last updated: September 12, 2026

This Privacy Policy explains how "Master Builder" (a trading name of
Hypoint Industries Ltd.) ("we," "us," or "our"), collects, uses, and
protects your information when you use our website and interactive
course platform (the "Service").

1. Information We Collect

When you create an account and purchase the Service, we collect:
- Your name and email address
- Your course progress, quiz scores, and certificate data
- Payment is processed entirely by our payment provider, Paddle.com
  (Paddle.com Market Limited). We do not collect or store your card
  details, billing address, or other payment information directly —
  this is handled by Paddle under their own privacy policy, available
  at paddle.com/legal/privacy.

We also automatically collect basic technical information (such as
browser type and general usage data) to keep the Service working
correctly and securely.

2. How We Use Your Information

We use your information to:
- Provide access to the course content you've purchased
- Track your progress, quiz results, and issue your certificate
- Communicate with you about your account or purchase
- Improve and maintain the Service

3. How We Share Your Information

We do not sell your personal information. We share information only:
- With Paddle, to process your payment and manage your purchase
- If required by law, or to protect our legal rights

4. Data Retention

We retain your account and progress data for as long as your account
is active, or as needed to provide the Service and comply with legal
obligations.

5. Your Rights

You can request access to, correction of, or deletion of your
personal information at any time by contacting us at masterbuilderinteractive@gmail.com. If you're located in a region with specific data protection
laws (such as the EU/UK GDPR), you may have additional rights under
those laws.

6. Security

We take reasonable technical measures to protect your information,
including secure password storage and encrypted connections (HTTPS).
No method of transmission or storage is 100% secure, and we cannot
guarantee absolute security.

7. Changes to This Policy

We may update this Privacy Policy from time to time. Changes will be
posted on this page with an updated "Last updated" date.

8. Contact Us

Questions about this Privacy Policy can be sent to:
masterbuilderinteractive@gmail.com`,
  terms: `TERMS AND CONDITIONS

Last updated: September 12, 2026

These Terms and Conditions ("Terms") govern your access to and use of
the Master Builder Interactive Course (the "Service"). "Master
Builder" is a trading name of Hypoint Industries Ltd. ("we," "us,"
or "our"), a company incorporated in Trinidad and Tobago. By
creating an account or purchasing the Service, you agree to these
Terms.

1. The Service

Master Builder is an online interactive educational course covering
construction industry topics across 22 modules, including quizzes, a
final examination, and a certificate of completion upon passing.

2. Purchases and Payment

The Service is sold as a one-time purchase granting lifetime access
to the course content. Payment is processed by our third-party
payment provider, Paddle.com Market Limited, who acts as the
Merchant of Record for your purchase. Paddle's own terms of use also
apply to the payment transaction, available at paddle.com/legal.

3. License to Use

Upon purchase, we grant you a personal, non-transferable,
non-exclusive license to access and use the course content for your
own individual educational use. You may not:
- Share your account or login credentials with others
- Copy, redistribute, resell, or publicly share the course content
- Use the course content for any commercial training purpose without
  our prior written permission

4. Educational Content Disclaimer

The course content is provided for general educational purposes only.
It does not constitute professional engineering, architectural, legal,
or safety advice, and code-sensitive requirements vary by
jurisdiction. Always verify design, safety, and compliance decisions
with licensed professionals before acting on any information provided
in this course. We are not liable for any decisions made or actions
taken based on the course content.

5. Certificates

Certificates of completion are issued upon passing the final
examination. Certificates reflect completion of our course content
and do not constitute a professional license, accreditation, or
certification recognized by any government or regulatory body unless
explicitly stated.

6. Account Termination

We reserve the right to suspend or terminate access to the Service
for any user who violates these Terms, including sharing account
access or redistributing course content.

7. Limitation of Liability

To the fullest extent permitted by law, Hypoint Industries Ltd. shall
not be liable for any indirect, incidental, or consequential damages
arising from your use of the Service.

8. Changes to the Service or Terms

We may update these Terms or modify the Service from time to time.
Continued use of the Service after changes constitutes acceptance of
the updated Terms.

9. Governing Law

These Terms are governed by the laws of Trinidad and Tobago, without
regard to its conflict of law principles.

10. Contact Us

Questions about these Terms can be sent to:
masterbuilderinteractive@gmail.com`,
  refund: `REFUND POLICY

Last updated: September 12, 2026

We want you to be satisfied with your purchase of the Master Builder
Interactive Course. Please read this policy carefully before
purchasing, as it explains exactly when a refund is and is not
available.

1. Refund Eligibility

Once you have accessed any module of the course, your purchase is
final and non-refundable. Because the course grants immediate, full
digital access to all 22 modules, quizzes, and the final exam upon
purchase, opening or starting any part of the course is treated as
use of the product.

If you have purchased the course but have not yet accessed or opened
any module, you may request a full refund within 48 hours of your
purchase date.

2. Exceptions

We will also consider a refund outside the above policy in these
specific situations:
- You were charged more than once for the same purchase (duplicate
  charge)
- A verified technical issue on our end prevented you from accessing
  the course at all, and we were unable to resolve it within a
  reasonable time

3. How to Request a Refund

To request a refund, contact us at masterbuilderinteractive@gmail.com with your
order/receipt details. Refunds are processed through Paddle.com, our
payment provider, and will be issued to your original payment method.

4. Processing Time

Approved refunds are typically processed within 5-10 business days,
though the exact timing of funds appearing back in your account
depends on your bank or card issuer.

5. Contact Us

Questions about this Refund Policy can be sent to:
masterbuilderinteractive@gmail.com`,
};

const pageTitles: Record<LegalPageKind, string> = {
  privacy: 'Privacy Policy',
  terms: 'Terms and Conditions',
  refund: 'Refund Policy',
};

export function LegalPage({ kind }: { kind: LegalPageKind }) {
  return (
    <div className="min-h-[100dvh] bg-[#F2E8D6] px-4 py-5 text-[#182338]">
      <div className="mx-auto max-w-[760px]">
        <header className="rounded-b-[18px] bg-[#122036] px-5 py-6 text-[#F7F1E4] shadow-[0_4px_0_#C1602E]">
          <Link href="/" className="font-display text-[13px] font-bold text-[#F7F1E4] hover:text-[#EADFC8]">
            ← Master Builder
          </Link>
        </header>
        <main className="paper-grid py-10 md:py-14">
          <article className="rounded-[16px] border border-[rgba(18,32,54,.1)] bg-[#F7F1E4] p-6 shadow-[var(--shadow-sm)] md:p-10">
            <h1 className="font-display text-3xl font-extrabold tracking-[-.04em]">{pageTitles[kind]}</h1>
            <pre className="mt-8 whitespace-pre-wrap break-words font-sans text-[13px] leading-7 text-[#5B5648]">{legalContent[kind]}</pre>
          </article>
        </main>
        <footer className="border-t border-[rgba(18,32,54,.1)] py-6 text-center text-[11px] text-[#5B5648]">
          <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2" aria-label="Legal navigation">
            <Link href="/privacy-policy" className="font-semibold hover:text-[#A94E22]">Privacy Policy</Link>
            <Link href="/terms-and-conditions" className="font-semibold hover:text-[#A94E22]">Terms &amp; Conditions</Link>
            <Link href="/refund-policy" className="font-semibold hover:text-[#A94E22]">Refund Policy</Link>
          </nav>
        </footer>
      </div>
    </div>
  );
}