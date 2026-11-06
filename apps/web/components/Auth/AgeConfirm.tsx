'use client'
import React from 'react'
import { useTranslation } from 'react-i18next'


/** The required "I'm 15 or older" box. Learners own their accounts, so there are no managed accounts for younger children. */
export function useAgeConfirm() {
  const [confirmed, setConfirmed] = React.useState(false)
  const [error, setError] = React.useState('')
  const { t } = useTranslation()
  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setConfirmed(event.target.checked)
    if (event.target.checked) setError('')
  }
  /** False (and says why) until the box is ticked. */
  const ok = () => {
    if (!confirmed) setError(t('auth.age_required'))
    return confirmed
  }
  return { ok, field: { checked: confirmed, error, onChange } }
}

export default function AgeConfirm({ checked, error, onChange }: ReturnType<typeof useAgeConfirm>['field']) {
  const { t } = useTranslation()
  return (
    <div className="text-left">
      <label className="flex cursor-pointer items-start gap-2.5 text-sm text-gray-700">
        <input type="checkbox" checked={checked} onChange={onChange} required aria-invalid={Boolean(error)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 accent-gray-950" />
        <span>{t('auth.age_confirm')}</span>
      </label>
      {error ? <p role="alert" className="mt-1.5 text-sm font-medium text-red-600">{error}</p> : null}
    </div>
  )
}
