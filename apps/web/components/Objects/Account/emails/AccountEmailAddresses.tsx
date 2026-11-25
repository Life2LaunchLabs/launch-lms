'use client'

import React from 'react'
import useSWR from 'swr'
import { At } from '@phosphor-icons/react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { settingsCard, SettingsHeader } from '@components/Objects/Account/AccountPageShell'
import { Button } from '@components/ui/button'
import { accountEmailsApi, accountEmailsKey, type AccountEmails, type SpareEmail } from '@services/users/accountEmails'
import AddEmailForm from './AddEmailForm'
import AccountPhone from './AccountPhone'
import { useTranslation } from 'react-i18next'
import { tr } from '@/lib/tr'

const SOURCE: Record<string, string> = { canvas: 'From your school’s Canvas', main: 'Your main email before', code: 'Added by you', google: 'From your Google account' }

/** The marks beside an email: Main, and Verified once it's confirmed. */
function Marks({ main, verified }: { main?: boolean; verified: boolean }) {
  const mark = 'rounded-full px-2.5 py-0.5 text-xs font-bold'
  return <span className="flex flex-wrap gap-1.5">
    {main ? <span className={`${mark} bg-foreground text-background`}>{tr('account_settings.main', 'Main')}</span> : null}
    {verified ? <span className={`${mark} bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300`}>{tr('account_settings.verified', 'Verified')}</span> : null}
  </span>
}

/**
 * Settings › Emails (DEV-198, reshaped for PF-3): the main email (sign-in, notifications, the résumé) and spares you can
 * also sign in with, each marked Main and Verified. Add one with a code, choose the main one, take a spare off. Keeps the
 * account yours when a school email goes away. The account's one phone number sits below.
 */
export default function AccountEmailAddresses() {
  useTranslation()
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token as string | undefined
  const { data, mutate } = useSWR<AccountEmails>(token ? accountEmailsKey() : null, () => accountEmailsApi.get(token as string))
  const [adding, setAdding] = React.useState(false)
  const [working, setWorking] = React.useState('')
  const [error, setError] = React.useState('')
  const [note, setNote] = React.useState('')
  if (!data || !token) return null

  const act = async (email: string, run: () => Promise<AccountEmails>, done: string, refreshSession = false) => {
    setWorking(email); setError(''); setNote('')
    try {
      await mutate(await run(), { revalidate: false })
      if (refreshSession) await session?.update?.(true)
      setNote(done)
    } catch (caught: any) {
      setError(caught?.message || 'That didn’t work. Try again.')
    } finally { setWorking('') }
  }

  const full = data.spares.length >= data.max_spares
  return <section id="account-emails" className={`${settingsCard} scroll-mt-6 p-5 sm:p-6`} aria-label={tr('account_settings.emails', 'Emails')}>
    <SettingsHeader icon={At} title={tr('account_settings.emails', 'Emails')} description={tr('account_settings.emails_description', 'Sign in with any of these. Notifications and your résumé use your main email. Add a personal email so you keep your account after you leave school or work.')} />
    <ul className="mt-4 max-w-2xl divide-y divide-border">
      <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
        <div className="min-w-0">
          <p className="break-all text-[15px] font-bold">{data.main.email}</p>
          <p className="text-sm text-muted-foreground">{tr('account_settings.main_email_use', 'Main email: sign-in, notifications and your résumé')}</p>
        </div>
        <Marks main verified={data.main.verified} />
      </li>
      {data.spares.map((spare: SpareEmail) => <li key={spare.email} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
        <div className="min-w-0">
          <p className="break-all text-[15px] font-bold">{spare.email}</p>
          <p className="text-sm text-muted-foreground">{SOURCE[spare.source] || 'Added'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Marks verified={Boolean(spare.verified_at)} />
          <Button type="button" variant="outline" size="sm" disabled={!!working}
            onClick={() => void act(spare.email, () => accountEmailsApi.makeMain(spare.email, token), `${spare.email} is your main email now.`, true)}>
            {working === spare.email ? 'Saving…' : 'Make main'}
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={!!working} aria-label={`Remove ${spare.email}`}
            onClick={() => void act(spare.email, () => accountEmailsApi.remove(spare.email, token), `${spare.email} was removed.`)}>
            Remove
          </Button>
        </div>
      </li>)}
    </ul>
    <div aria-live="polite" className="max-w-2xl">
      {error ? <p role="alert" className="mt-2 text-sm font-semibold text-red-600 dark:text-red-400">{error}</p> : null}
      {note ? <p className="mt-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">{note}</p> : null}
    </div>
    <div className="mt-4 max-w-2xl">
      {adding
        ? <AddEmailForm token={token} onCancel={() => setAdding(false)} onAdded={(next) => { void mutate(next, { revalidate: false }); setAdding(false); setNote('Email added. You can sign in with it now.') }} />
        : full
          ? <p className="text-sm text-muted-foreground">You have as many emails as an account can hold. Remove one to add another.</p>
          : <Button type="button" variant="surface" onClick={() => { setAdding(true); setNote(''); setError('') }}>Add an email</Button>}
    </div>
    <AccountPhone token={token} phone={data.phone || ''} onSaved={(phone) => void mutate({ ...data, phone }, { revalidate: false })} />
  </section>
}
