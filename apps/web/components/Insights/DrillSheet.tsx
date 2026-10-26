'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import * as Dialog from '@radix-ui/react-dialog'
import { Download, Loader2, MessageCircle, X } from 'lucide-react'
import { PersonAvatar } from '@components/Goals/share/PersonAvatar'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { insightsApi, type CardSpec, type DateRange, type DrillPerson, type Scope } from '@services/insights/insights'

export type DrillTarget = { title: string; spec: CardSpec; drill: string }

const nameOf = (person: DrillPerson) => [person.first_name, person.last_name].filter(Boolean).join(' ') || person.username

function daysAgo(iso: string): string {
  const days = Math.max(0, Math.round((Date.now() - new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime()) / 86400000))
  return days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
}

function csv(people: DrillPerson[]): string {
  const cell = (value: string) => `"${value.replace(/"/g, '""')}"`
  return ['Name,Username,Groups,Counted,Last', ...people.map((person) =>
    [nameOf(person), person.username, person.groups.join('; '), person.counted ? 'yes' : 'no', person.last.slice(0, 10)].map(cell).join(','))].join('\n')
}

/** The learners behind one number: the same people the card counted, each a click from their thread. */
export default function DrillSheet({ target, onClose, orgId, orgslug, token, scope, range }: {
  target: DrillTarget | null; onClose: () => void; orgId: number; orgslug: string; token?: string
  scope: { kind: Scope; key: string | null }; range: DateRange
}) {
  const { data, error, isLoading } = useSWR(target ? ['insights', orgId, 'drill', JSON.stringify([target, scope, range])] : null,
    () => insightsApi.drill(orgId, { scope, range, spec: target!.spec, drill: target!.drill }, token), { revalidateOnFocus: false })
  const rate = data?.people.some((person) => !person.counted)
  const download = () => {
    if (!data) return
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([csv(data.people)], { type: 'text/csv' }))
    link.download = 'learners.csv'
    link.click()
    URL.revokeObjectURL(link.href)
  }
  return <Dialog.Root open={Boolean(target)} onOpenChange={(open) => { if (!open) onClose() }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30" />
      <Dialog.Content className="insights-viz fixed inset-y-0 right-0 z-50 flex w-full max-w-[440px] flex-col border-l border-border bg-card shadow-2xl outline-none">
        <header className="flex items-start gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <Dialog.Title className="text-[17px] font-bold leading-snug tracking-tight text-foreground">{target?.title}</Dialog.Title>
            <Dialog.Description className="mt-0.5 text-[12.5px] text-muted-foreground">
              {data ? `${data.total.toLocaleString()} learner${data.total === 1 ? '' : 's'}${rate ? ', finished first' : ''}. Only learners you can see are listed.` : 'The learners behind this number.'}
            </Dialog.Description>
          </div>
          <Dialog.Close className="rounded-full p-1.5 text-muted-foreground hover:bg-muted" aria-label="Close"><X size={18} /></Dialog.Close>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {isLoading ? <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" />Finding them</p>
            : error ? <p className="px-2 py-10 text-center text-sm text-muted-foreground">{error.message || "Couldn't load the list."}</p>
              : !data?.people.length ? <p className="px-2 py-10 text-center text-sm text-muted-foreground">Nobody here for these dates.</p>
                : <ul>{data.people.map((person) => <li key={person.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-muted">
                  <PersonAvatar user={{ ...person, name: nameOf(person) } as any} size="md" />
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-[13.5px] text-foreground">{nameOf(person)}</b>
                    <span className="block truncate text-[12px] text-muted-foreground">
                      {[person.groups.join(', '), rate ? (person.counted ? 'Finished' : 'Not finished') : null, `last ${daysAgo(person.last)}`].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  <Link href={getUriWithOrg(orgslug, routePaths.org.admin.threads.person(person.id))} aria-label={`Open the thread with ${nameOf(person)}`}
                    className="rounded-full p-2 text-muted-foreground hover:bg-card hover:text-foreground"><MessageCircle size={16} /></Link>
                </li>)}
                {data.truncated ? <li className="px-2 py-3 text-[12.5px] text-muted-foreground">Showing the first {data.people.length}. Download the list for everyone shown.</li> : null}
                </ul>}
        </div>
        <footer className="flex gap-2 border-t border-border px-5 py-3">
          <button type="button" onClick={download} disabled={!data?.people.length}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-[13px] font-semibold hover:bg-muted disabled:opacity-50"><Download size={14} />Download CSV</button>
        </footer>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
