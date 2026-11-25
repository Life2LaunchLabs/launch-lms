'use client'

import React from 'react'
import { useTranslation } from 'react-i18next'
import { UserCircle, Warning } from '@phosphor-icons/react'
import { toast } from 'react-hot-toast'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { settingsCard, SettingsHeader } from '@components/Objects/Account/AccountPageShell'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { accountSettingsApi } from '@services/users/accountEmails'
import { tr } from '@/lib/tr'

/**
 * Settings › Account (PF-3, DEV-220): the username, with Change username. Before anything changes it says what a new
 * username breaks, and the person confirms by typing the new one again. No limit on how often.
 */
export default function AccountUsername() {
  useTranslation()
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token as string | undefined
  const current = String(session?.data?.user?.username || '')
  const [open, setOpen] = React.useState(false)
  const [next, setNext] = React.useState('')
  const [again, setAgain] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const [saved, setSaved] = React.useState('')
  const shown = saved || current
  const wanted = next.trim()
  const ready = Boolean(wanted) && wanted !== shown && again.trim() === wanted

  const close = () => { setOpen(false); setNext(''); setAgain(''); setError('') }
  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!token || !ready) return
    setBusy(true); setError('')
    try {
      const result = await accountSettingsApi.changeUsername(wanted, token)
      setSaved(result.username)
      await session?.update?.(true)
      close()
      toast.success(tr('account_settings.username_changed', 'Your username is now @{{username}}.', { username: result.username }))
    } catch (caught: any) {
      setError(caught?.message || tr('account_settings.try_again', 'That didn’t work. Try again.'))
    } finally { setBusy(false) }
  }

  return <section className={`${settingsCard} p-5 sm:p-6`} aria-label={tr('account_settings.account', 'Account')} data-testid="settings-account">
    <SettingsHeader icon={UserCircle} title={tr('account_settings.account', 'Account')} description={tr('account_settings.account_description', 'Your username is in the link to your profile.')} />
    <div className="mt-4 flex max-w-2xl flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{tr('account_settings.username', 'Username')}</p>
        <p className="break-all text-[15px] font-bold" data-testid="settings-username">@{shown}</p>
      </div>
      {open ? null : <Button type="button" variant="surface" size="sm" onClick={() => setOpen(true)}>{tr('account_settings.change_username', 'Change username')}</Button>}
    </div>
    {open ? <form onSubmit={save} className="mt-4 grid max-w-2xl gap-4 border-t border-border pt-4">
      <div role="note" className="flex gap-2.5 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
        <Warning size={18} weight="fill" className="mt-0.5 shrink-0" aria-hidden="true" />
        <p>{tr('account_settings.username_warning', 'Old links to your profile stop working, and someone else could take @{{username}} after you let it go.', { username: shown })}</p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="new-username">{tr('account_settings.new_username', 'New username')}</Label>
        <Input id="new-username" value={next} onChange={(event) => setNext(event.target.value)} maxLength={30} autoComplete="username" autoCapitalize="none" spellCheck={false} autoFocus />
        <p className="text-xs text-muted-foreground">{tr('account_settings.username_rules', '3 to 30 letters, numbers, dots, dashes or underscores.')}</p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="confirm-username">{tr('account_settings.type_again', 'Type the new username again to confirm')}</Label>
        <Input id="confirm-username" value={again} onChange={(event) => setAgain(event.target.value)} maxLength={30} autoComplete="off" autoCapitalize="none" spellCheck={false} />
      </div>
      {error ? <p role="alert" className="text-sm font-semibold text-red-600 dark:text-red-400">{error}</p> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={close} disabled={busy}>{tr('account_settings.cancel', 'Cancel')}</Button>
        <Button type="submit" variant="brand" disabled={busy || !ready}>{busy ? tr('account_settings.saving', 'Saving…') : tr('account_settings.change_username', 'Change username')}</Button>
      </div>
    </form> : null}
  </section>
}
