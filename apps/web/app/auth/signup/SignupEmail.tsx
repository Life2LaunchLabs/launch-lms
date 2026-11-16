'use client'

import type { ChangeEventHandler, FocusEventHandler } from 'react'
import { useTranslation } from 'react-i18next'

/** The sign-up email box, labelled, with a note on which email to use (FEED-258). */
export default function SignupEmail({ value, error, onChange, onBlur }: { value: string; error?: string; onChange: ChangeEventHandler<HTMLInputElement>; onBlur?: FocusEventHandler<HTMLInputElement> }) {
  const { t } = useTranslation()
  return <div className="space-y-2 text-left">
    <label htmlFor="signup-email" className="block text-sm font-semibold text-gray-950">{t('auth.email')}</label>
    <p id="signup-email-help" className="text-[13px] leading-snug text-gray-600">{t('auth.email_help')}</p>
    <input
      id="signup-email" name="email" type="email" value={value} onChange={onChange} onBlur={onBlur}
      placeholder={t('auth.enter_email')} autoComplete="email" aria-describedby="signup-email-help" aria-invalid={error ? true : undefined} required
      className="h-12 w-full rounded-2xl border border-gray-200 bg-white px-4 text-[16px] text-gray-950 shadow-sm outline-none transition-colors placeholder:text-gray-400 focus:border-gray-300 focus:ring-2 focus:ring-gray-100"
    />
    {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
  </div>
}
