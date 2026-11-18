'use client'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { checkBirthDate, markRefused, rememberBirthDate, rememberedBirthDate, wasRefused } from '@services/auth/ageCheck'

/**
 * The date-of-birth question on every way to create an account (DEV-38). It doesn't say what age is needed;
 * anyone under 13 is refused kindly, and stays refused for the browser session. Only the API's check counts.
 */
export function useAgeConfirm() {
  const { t } = useTranslation()
  const [birthDate, setBirthDate] = React.useState('')
  const [error, setError] = React.useState('')
  const [refused, setRefused] = React.useState(false)
  React.useEffect(() => {
    if (wasRefused()) setRefused(true)
    else setBirthDate((current) => current || rememberedBirthDate() || '')
  }, [])
  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setBirthDate(event.target.value)
    if (error) setError('')
  }
  const refuse = () => {
    markRefused()
    setRefused(true)
  }
  /** False (and says why) until a date of birth 13 or more years ago is given; remembers it for this sign-up. */
  const ok = () => {
    if (refused || wasRefused()) {
      setRefused(true)
      return false
    }
    const result = checkBirthDate(birthDate)
    if (result === 'refused') refuse()
    else if (result !== 'ok') setError(t(result === 'required' ? 'auth.birth_date_required' : 'auth.birth_date_invalid'))
    else rememberBirthDate(birthDate)
    return result === 'ok'
  }
  return { ok, refuse, refused, birthDate: refused ? null : birthDate || null, field: { value: birthDate, error, refused, onChange } }
}

export default function AgeConfirm({ value, error, refused, onChange }: ReturnType<typeof useAgeConfirm>['field']) {
  const { t } = useTranslation()
  const id = React.useId()
  if (refused) {
    return (
      <div role="alert" className="rounded-2xl bg-gray-50 px-4 py-4 text-left ring-1 ring-gray-200">
        <p className="text-[15px] font-semibold text-gray-950">{t('auth.under_13_title')}</p>
        <p className="mt-1 text-sm leading-6 text-gray-600">{t('auth.under_13_body')}</p>
      </div>
    )
  }
  return (
    <div className="text-left">
      <label htmlFor={id} className="block text-sm font-semibold text-gray-800">{t('auth.birth_date')}</label>
      <input id={id} type="date" name="birth_date" value={value} onChange={onChange} required
        min="1900-01-01" max={new Date().toISOString().slice(0, 10)} autoComplete="bday"
        aria-invalid={Boolean(error)} aria-describedby={`${id}-help`}
        className="mt-1.5 h-12 w-full rounded-2xl border border-gray-200 bg-white px-4 text-[16px] text-gray-950 shadow-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-gray-100" />
      <p id={`${id}-help`} className="mt-1.5 text-[13px] leading-5 text-gray-500">{t('auth.birth_date_help')}</p>
      {error ? <p role="alert" className="mt-1.5 text-sm font-medium text-red-600">{error}</p> : null}
    </div>
  )
}
