import { Link } from 'wouter';

const legalLinks = [
  { href: '/privacy-policy', label: 'Privacy Policy' },
  { href: '/terms-and-conditions', label: 'Terms & Conditions' },
  { href: '/refund-policy', label: 'Refund Policy' },
];

export function SiteFooter({ dark = false }: { dark?: boolean }) {
  return (
    <footer
      className={`border-t px-4 py-6 text-center text-[11px] ${
        dark ? 'border-[#355248] text-[#9FB7A5]' : 'border-[rgba(18,32,54,.1)] text-[#5B5648]'
      }`}
      data-testid="site-footer"
    >
      <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2" aria-label="Legal navigation">
        {legalLinks.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={dark ? 'font-semibold hover:text-[#F7F1E4]' : 'font-semibold hover:text-[#A94E22]'}
            data-testid={`link-footer-${href.slice(1)}`}
          >
            {label}
          </Link>
        ))}
        <a
          href="mailto:masterbuilderinteractive@gmail.com"
          className={dark ? 'font-semibold hover:text-[#F7F1E4]' : 'font-semibold hover:text-[#A94E22]'}
          data-testid="link-footer-contact"
        >
          Contact
        </a>
      </nav>
    </footer>
  );
}