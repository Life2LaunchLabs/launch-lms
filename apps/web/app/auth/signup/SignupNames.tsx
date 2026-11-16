'use client'

import type { ChangeEventHandler } from 'react'
import { useTranslation } from 'react-i18next'

const field = 'h-12 w-full min-w-0 rounded-2xl border border-gray-200 bg-white px-4 text-[16px] text-gray-950 shadow-sm outline-none transition-colors placeholder:text-gray-400 focus:border-gray-300 focus:ring-2 focus:ring-gray-100'

export type SignupNameValues = { first_name: string; last_name: string; preferred_name: string }

/**
 * The names asked at sign-up, each saying what it's for: the legal first and last name (school
 * records and reports, such as the Education Plan and Profile) and, optionally, the name they go by,
 * which everyone sees in the app. No username: the account gets one.
 */
export default function SignupNames({ values, onChange }: { values: SignupNameValues; onChange: ChangeEventHandler<HTMLInputElement> }) {
  const { t } = useTranslation()
  return <div className="space-y-4 text-left">
    <fieldset className="space-y-2" aria-describedby="signup-legal-name-help">
      <legend className="text-sm font-semibold text-gray-950">{t('auth.legal_name')}</legend>
      <p id="signup-legal-name-help" className="text-[13px] leading-snug text-gray-600">{t('auth.legal_name_help')}</p>
      <div className="grid grid-cols-2 gap-3">
        <input name="first_name" value={values.first_name} onChange={onChange} placeholder={t('user.first_name')} aria-label={t('auth.legal_first_name')} autoComplete="given-name" maxLength={100} required className={field} />
        <input name="last_name" value={values.last_name} onChange={onChange} placeholder={t('user.last_name')} aria-label={t('auth.legal_last_name')} autoComplete="family-name" maxLength={100} required className={field} />
      </div>
    </fieldset>
    <div className="space-y-2">
      <label htmlFor="signup-preferred-name" className="block text-sm font-semibold text-gray-950">
        {t('auth.name_you_go_by')} <span className="font-normal text-gray-500">{t('auth.optional')}</span>
      </label>
      <p id="signup-preferred-name-help" className="text-[13px] leading-snug text-gray-600">{t('auth.name_you_go_by_help')}</p>
      <input id="signup-preferred-name" name="preferred_name" value={values.preferred_name} onChange={onChange} placeholder={values.first_name.trim() || t('auth.name_you_go_by_placeholder')} aria-describedby="signup-preferred-name-help" autoComplete="nickname" maxLength={100} className={field} />
    </div>
  </div>
}

/** Where the names wait, beside the password, while the welcome page makes the account. */
export const welcomeSignupNamesKey = (email: string) => `launchlms_welcome_signup_names:${email}`
