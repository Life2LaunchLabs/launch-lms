'use client'

import React from 'react'
import { Phone } from '@phosphor-icons/react'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { accountSettingsApi } from '@services/users/accountEmails'
import { tr } from '@/lib/tr'

/** The account's one phone number (PF-3, DEV-221), under its emails. The résumé prints it with the main email. */
export default function AccountPhone({ token, phone, onSaved }: { token: string; phone: string; onSaved: (phone: string) => void }) { // eslint-disable-line no-unused-vars
  const [editing, setEditing] = React.useState(false)
  const [value, setValue] = React.useState(phone)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      const result = await accountSettingsApi.setPhone(value.trim(), token)
      onSaved(result.phone)
      setEditing(false)
    } catch (caught: any) {
      setError(caught?.message || tr('account_settings.try_again', 'That didn’t work. Try again.'))
    } finally { setBusy(false) }
  }

  return <div className="mt-5 max-w-2xl border-t border-border pt-4" data-testid="settings-phone">
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex min-w-0 items-start gap-2.5">
        <Phone size={18} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-[15px] font-bold">{phone || <span className="font-normal italic text-muted-foreground">{tr('account_settings.no_phone', 'No phone number yet')}</span>}</p>
          <p className="text-sm text-muted-foreground">{tr('account_settings.phone_use', 'Your phone number. Your résumé shows it with your main email.')}</p>
        </div>
      </div>
      {editing ? null : <Button type="button" variant="surface" size="sm" onClick={() => { setValue(phone); setEditing(true) }}>{phone ? tr('account_settings.change_phone', 'Change') : tr('account_settings.add_phone', 'Add a phone number')}</Button>}
    </div>
    {editing ? <form onSubmit={save} className="mt-3 grid gap-2">
      <Label htmlFor="account-phone">{tr('account_settings.phone', 'Phone number')}</Label>
      <div className="flex flex-wrap gap-2">
        <Input id="account-phone" type="tel" value={value} onChange={(event) => setValue(event.target.value)} maxLength={40} placeholder="541-555-0123" autoComplete="tel" className="min-w-0 flex-1 basis-48" autoFocus />
        <Button type="button" variant="ghost" onClick={() => { setEditing(false); setError('') }} disabled={busy}>{tr('account_settings.cancel', 'Cancel')}</Button>
        <Button type="submit" variant="brand" disabled={busy}>{busy ? tr('account_settings.saving', 'Saving…') : tr('account_settings.save', 'Save')}</Button>
      </div>
      {phone ? <p className="text-xs text-muted-foreground">{tr('account_settings.clear_phone', 'Leave it empty and save to take it off.')}</p> : null}
      {error ? <p role="alert" className="text-sm font-semibold text-red-600 dark:text-red-400">{error}</p> : null}
    </form> : null}
  </div>
}
