'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { Button } from '@components/ui/button'
import { fetchUserTests, personaName, readTestMail, userTestsKey, type TestMail, type TestPersona } from '@services/userTests/userTests'
import { formatWhen } from './UserTestsShell'

const REASONS: Record<TestMail['reason'], string> = {
  test_address: 'To a test address',
  persona_sender: 'Sent by a persona to an outside address, not delivered',
}

export default function UserTestsInbox({ cohortUuid, personas, onOpenAs }: {
  cohortUuid: string
  personas: TestPersona[]
  onOpenAs: React.Dispatch<{ persona: TestPersona; path: string }>
}) {
  const [persona, setPersona] = useState<number | ''>('')
  const [open, setOpen] = useState<TestMail | null>(null)
  const [error, setError] = useState('')
  const query = `cohorts/${cohortUuid}/mail${persona ? `?persona=${persona}` : ''}`
  const { data, mutate } = useSWR(userTestsKey(query), () => fetchUserTests<{ mail: TestMail[] }>(query), { refreshInterval: 10000 })
  const byId = new Map(personas.map((item) => [item.user_id, item]))
  const who = (id: number | null, address?: string) => (id && byId.get(id) ? personaName(byId.get(id)!) : address || 'Someone outside the cohort')

  async function show(mail: TestMail) {
    setError('')
    try { setOpen(await readTestMail(mail.id)); void mutate() } catch (failure) { setError((failure as Error).message) }
  }

  const recipient = open?.to_user_id ? byId.get(open.to_user_id) : undefined
  return <section className="space-y-3" aria-labelledby="inbox-heading">
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1"><h2 id="inbox-heading" className="text-lg font-semibold">Test mail</h2><p className="text-sm text-muted-foreground">Every email sent to a persona, or by one, lands here instead of being delivered.</p></div>
      <label className="text-sm"><span className="sr-only">Show mail for</span>
        <select className="h-9 rounded-md border bg-background px-2 text-sm" value={persona} onChange={(event) => { setPersona(event.target.value ? Number(event.target.value) : ''); setOpen(null) }}>
          <option value="">Everyone</option>
          {personas.map((item) => <option key={item.user_id} value={item.user_id}>{personaName(item)}</option>)}
        </select>
      </label>
    </div>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
      <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {!data ? <li className="p-4 text-sm text-muted-foreground">Loading…</li> : null}
        {data && !data.mail.length ? <li className="p-4 text-sm text-muted-foreground">No mail yet. Invites and notices these personas trigger will show up here.</li> : null}
        {data?.mail.map((mail) => <li key={mail.id}>
          <button type="button" onClick={() => void show(mail)} className={`w-full px-4 py-3 text-left hover:bg-muted/50 ${open?.id === mail.id ? 'bg-muted/60' : ''}`}>
            <span className="flex items-center gap-2"><span className={`min-w-0 flex-1 truncate text-sm ${mail.opened_at ? '' : 'font-semibold'}`}>{mail.subject || '(no subject)'}</span>{mail.reason === 'persona_sender' ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">Outside</span> : null}</span>
            <span className="block truncate text-xs text-muted-foreground">To {who(mail.to_user_id, mail.to_address)} · {formatWhen(mail.captured_at)}</span>
          </button>
        </li>)}
      </ul>
      <div className="min-h-64 rounded-xl border bg-card p-4">
        {!open ? <p className="text-sm text-muted-foreground">Choose a message to read it.</p> : <div className="space-y-3">
          <div><h3 className="text-base font-semibold">{open.subject || '(no subject)'}</h3><p className="text-xs text-muted-foreground">To {who(open.to_user_id, open.to_address)}{open.from_user_id ? ` · from ${who(open.from_user_id)}` : ''} · {REASONS[open.reason]}</p></div>
          {open.links.length ? <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Links</p>
            <ul className="space-y-1.5">{open.links.map((link) => <li key={link.url} className="flex flex-wrap items-center gap-2 text-xs">
              <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1">{link.url}</code>
              {link.path && recipient ? <Button type="button" size="sm" onClick={() => onOpenAs({ persona: recipient, path: link.path! })}>Open as {recipient.first_name}</Button>
                : <span className="text-muted-foreground">{link.path ? 'No persona has this address' : 'Not on this site'}</span>}
            </li>)}</ul>
          </div> : null}
          {/* Rendered exactly as it would have been sent, with scripts and forms off. */}
          <iframe title={`Email: ${open.subject}`} sandbox="" srcDoc={open.html || ''} className="h-[28rem] w-full rounded-lg border bg-white" />
        </div>}
      </div>
    </div>
  </section>
}
