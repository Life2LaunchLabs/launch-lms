'use client'
import { useTranslation } from 'react-i18next'
import { LEGAL_LINKS } from './legalLinks'

const LABEL_KEYS: Record<(typeof LEGAL_LINKS)[number]['href'], string> = {
  '/privacy': 'legal.privacy_policy',
  '/terms': 'legal.terms_of_use',
  '/data': 'legal.student_data',
}

/** The Privacy Policy, Terms of Use and Student data links at the foot of signed-out pages, on every address. */
export default function LegalFooter({ className = '' }: { className?: string }) {
  const { t } = useTranslation()
  return (
    <footer data-canvas-hide className={`w-full px-4 py-6 print:hidden ${className}`}>
      <nav aria-label={t('legal.footer_label')} className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] text-muted-foreground">
        <span>© {new Date().getFullYear()} Life2Launch</span>
        {LEGAL_LINKS.map((link) => (
          <a key={link.href} href={link.href} className="rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2">
            {t(LABEL_KEYS[link.href], link.label)}
          </a>
        ))}
      </nav>
    </footer>
  )
}
