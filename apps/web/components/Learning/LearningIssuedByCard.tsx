'use client'

import React from 'react'
import { Award, Clock3, Loader2 } from 'lucide-react'
import { SafeImage } from '@components/Objects/SafeImage'
import { getOrgLogoMediaDirectory } from '@services/media/media'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select'

const ACCESS_NOTES: Record<string, string> = {
  open: 'Open to every learner. Start any time.',
  request: 'Accepts requests. Start once they accept you.',
  invite: 'Works with learners they invite.',
}

function IssuerLogo({ org }: { org: any }) {
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted text-lime-600">
      {org?.logo_image ? <SafeImage src={getOrgLogoMediaDirectory(org.org_uuid, org.logo_image)} alt="" className="h-full w-full object-contain" /> : <Award size={20} />}
    </span>
  )
}

function issuerNote(issuer: any) {
  if (issuer.can_start) return issuer.access === 'open' ? ACCESS_NOTES.open : 'You’re accepted. Start any time.'
  if (issuer.request_status === 'requested') return 'Your request is waiting for them to accept it.'
  if (issuer.request_status === 'rejected') return 'Your last request was declined.'
  return ACCESS_NOTES[issuer.access] || ACCESS_NOTES.request
}

// Who issues this badge to the learner: the default is preselected, others sit in a dropdown,
// and the action matches the issuer (start now, request, or wait).
export default function LearningIssuedByCard({ issuers, selectedId, onSelect, runIssuerOrgId, hasRun, busy, onStart, onRequest }: {
  issuers: any[]
  selectedId: number | null
  onSelect: React.Dispatch<number>
  runIssuerOrgId?: number | null
  hasRun: boolean
  busy: boolean
  onStart: React.Dispatch<number>
  onRequest: React.Dispatch<number>
}) {
  const selected = issuers.find((item) => item.org.id === (hasRun ? runIssuerOrgId : selectedId)) || (hasRun ? null : issuers[0])

  if (hasRun) {
    if (!selected) return null
    return (
      <section className="mt-6 flex items-center gap-4 rounded-2xl bg-card p-5 shadow-sm">
        <IssuerLogo org={selected.org} />
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Issued by</p>
          <p className="truncate font-bold text-foreground">{selected.org.name}</p>
        </div>
      </section>
    )
  }

  if (!selected) {
    return (
      <section className="mt-6 rounded-2xl border border-dashed border-border bg-card p-5 text-sm text-muted-foreground">
        No organization is issuing this badge right now. Your progress will be here when one is.
      </section>
    )
  }

  const action = selected.can_start ? (
    <button type="button" onClick={() => onStart(selected.org.id)} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-foreground px-5 py-2.5 text-sm font-bold text-background disabled:opacity-50">
      {busy ? <Loader2 size={15} className="animate-spin" /> : null}Start
    </button>
  ) : selected.request_status === 'requested' ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700"><Clock3 size={14} /> Request pending</span>
  ) : selected.access === 'invite' && selected.request_status !== 'rejected' ? null : (
    <button type="button" onClick={() => onRequest(selected.org.id)} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-foreground px-5 py-2.5 text-sm font-bold text-background disabled:opacity-50">
      {busy ? <Loader2 size={15} className="animate-spin" /> : null}{selected.request_status === 'rejected' ? 'Request again' : 'Request to join'}
    </button>
  )

  return (
    <section className="mt-6 rounded-2xl bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <IssuerLogo org={selected.org} />
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Issued by</p>
            <p className="truncate font-bold text-foreground">{selected.org.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{issuerNote(selected)}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {issuers.length > 1 ? (
            <Select value={String(selected.org.id)} onValueChange={(value) => onSelect(Number(value))} disabled={busy}>
              <SelectTrigger className="h-10 w-auto min-w-36 bg-card" aria-label="Choose who issues this badge"><SelectValue placeholder="Change issuer" /></SelectTrigger>
              <SelectContent align="end">
                {issuers.map((item) => (
                  <SelectItem key={item.org.id} value={String(item.org.id)}>
                    {item.org.name}{item.is_default ? ' · default' : ''}{!item.can_start ? (item.request_status === 'requested' ? ' · pending' : ' · request') : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          {action}
        </div>
      </div>
    </section>
  )
}
