'use client'
import { useTranslation } from 'react-i18next'

/**
 * "By continuing, you agree to Life2Launch's Terms of Use and Privacy Policy." with both as real links,
 * under every sign-up and sign-in form. They open in a new tab so a half-filled form isn't lost, and
 * work on every Life2Launch address (the pages are public on all of them).
 */
export default function LegalAgreement({ className = '' }: { className?: string }) {
  const { t } = useTranslation()
  const link = 'font-medium underline underline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 rounded-sm'
  return (
    <p className={`text-[12px] leading-relaxed text-muted-foreground ${className}`}>
      {t('auth.agree_prefix')}{' '}
      <a href="/terms" target="_blank" rel="noopener" className={link}>{t('auth.terms_of_service')}</a>{' '}
      {t('auth.agree_and')}{' '}
      <a href="/privacy" target="_blank" rel="noopener" className={link}>{t('auth.privacy_policy')}</a>
      {t('auth.agree_suffix')}
    </p>
  )
}
