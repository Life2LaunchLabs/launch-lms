'use client'

import type { ChangeEventHandler } from 'react'
import { useTranslation } from 'react-i18next'

const field = 'h-12 w-full min-w-0 rounded-2xl border border-gray-200 bg-white px-4 text-[16px] text-gray-950 shadow-sm outline-none transition-colors placeholder:text-gray-400 focus:border-gray-300 focus:ring-2 focus:ring-gray-100'

export type SignupNameValues = { first_name: string; last_name: string; preferred_name: string }

/**
 * The names asked at sign-up: the legal first and last name (rosters and reports use them) and,
 * optionally, the name they go by, which everyone else sees. No username: the account gets one.
 */
export default function SignupNames({ values, onChange }: { values: SignupNameValues; onChange: ChangeEventHandler<HTMLInputElement> }) {
  const { t } = useTranslation()
  return <div className="space-y-2">
    <div className="grid grid-cols-2 gap-3">
      <input name="first_name" value={values.first_name} onChange={onChange} placeholder={t('user.first_name')} aria-label={t('user.first_name')} autoComplete="given-name" maxLength={100} required className={field} />
      <input name="last_name" value={values.last_name} onChange={onChange} placeholder={t('user.last_name')} aria-label={t('user.last_name')} autoComplete="family-name" maxLength={100} required className={field} />
    </div>
    <input name="preferred_name" value={values.preferred_name} onChange={onChange} placeholder={t('auth.name_you_go_by_optional')} aria-label={t('auth.name_you_go_by')} autoComplete="nickname" maxLength={100} className={field} />
  </div>
}

/** Where the names wait, beside the password, while the welcome page makes the account. */
export const welcomeSignupNamesKey = (email: string) => `launchlms_welcome_signup_names:${email}`
