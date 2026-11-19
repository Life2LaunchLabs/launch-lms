'use client'

import React from 'react'
import useSWR from 'swr'
import { EnvelopeSimple, X } from '@phosphor-icons/react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { Button } from '@components/ui/button'
import { accountEmailsApi, accountEmailsKey, type AccountEmails } from '@services/users/accountEmails'
import AddEmailForm from './AddEmailForm'

/**
 * On a learner's Plans home, when a school or work address is their only email: add a personal one now (DEV-198).
 * "Not now" dismisses it; it comes back once they're alumni.
 */
export default function PersonalEmailPrompt() {
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token as string | undefined
  const { data, mutate } = useSWR<AccountEmails>(token ? accountEmailsKey() : null, () => accountEmailsApi.get(token as string),
    { revalidateOnFocus: false, shouldRetryOnError: false })
  const [adding, setAdding] = React.useState(false)
  const [added, setAdded] = React.useState('')
  if (!token) return null
  if (added) {
    return <div role="status" className="mt-2 rounded-2xl border-2 border-border bg-card p-4 text-sm font-semibold sm:p-5">
      Added {added}. You can sign in with it any time, even after you leave school.
    </div>
  }
  if (!data?.ask_for_personal) return null

  const dismiss = async () => { try { await mutate(await accountEmailsApi.dismissPrompt(token), { revalidate: false }) } catch { /* it asks again next time */ } }

  return <section aria-labelledby="personal-email-title" className="relative mt-2 rounded-2xl border-2 border-border bg-card p-4 shadow-[0_4px_0_hsl(var(--edge))] sm:p-5">
    <button type="button" onClick={() => void dismiss()} aria-label="Not now"
      className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
      <X size={18} />
    </button>
    <div className="flex items-start gap-3 pr-10">
      <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground sm:flex" aria-hidden="true"><EnvelopeSimple size={19} /></span>
      <div className="min-w-0 flex-1">
        <h2 id="personal-email-title" className="text-base font-extrabold tracking-tight">Add a personal email</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">You sign in with <span className="break-all font-semibold text-foreground">{data.main.email}</span>. When you leave school you may lose it. Add an email you’ll keep, so your account stays yours.</p>
        <div className="mt-3">
          {adding
            ? <AddEmailForm token={token} idPrefix="personal-email" onCancel={() => setAdding(false)}
                onAdded={(next) => { void mutate(next, { revalidate: false }); setAdded(next.spares[next.spares.length - 1]?.email || 'your email') }} />
            : <div className="flex flex-wrap gap-2">
                <Button type="button" variant="brand" onClick={() => setAdding(true)}>Add an email</Button>
                <Button type="button" variant="ghost" onClick={() => void dismiss()}>Not now</Button>
              </div>}
        </div>
      </div>
    </div>
  </section>
}
