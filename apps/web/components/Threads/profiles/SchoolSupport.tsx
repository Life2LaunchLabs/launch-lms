'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { FileText, GraduationCap, Loader2 } from 'lucide-react'
import { getUriWithOrg } from '@services/config/config'
import { routePaths } from '@services/routing/paths'
import { usePeopleContext } from '@components/Admin/People/usePeople'
import { DIPLOMA_TRACK_LABELS, supportApi, supportKey, supportedLearnerKey, type DiplomaTrack, type SupportUpdate } from '@services/school/support'
import { Card } from './ProfileFrame'

const formatDate = (value?: string | null) => value ? new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' }) : ''

/**
 * The school's support link with a learner, on their profile. Staff ask; the learner gets a consent card in
 * their chat with the organization. Only once they say yes does the school record open: student ID, diploma
 * track, graduation year and counselor. Either side can end it, which closes the record again.
 */
export default function SchoolSupport({ userId, name, username }: { userId: number; name: string; username: string }) {
  const { orgId, orgslug, token, viewerId } = usePeopleContext()
  const ready = Boolean(orgId && token)
  const { data: state, mutate } = useSWR(ready ? supportKey(orgId, userId) : null, () => supportApi.status(orgId, userId, token), { revalidateOnFocus: true })
  const active = state?.status === 'active'
  const { data: opened, mutate: reopen } = useSWR(ready && active ? supportedLearnerKey(orgId, userId) : null, () => supportApi.open(orgId, userId, token), { revalidateOnFocus: false })
  const [busy, setBusy] = React.useState('')
  const first = name.split(' ')[0] || 'them'

  const run = async (key: string, action: () => Promise<unknown>, done?: string) => {
    setBusy(key)
    try {
      await action()
      if (done) toast.success(done)
      await Promise.all([mutate(), reopen()])
    } catch (error: any) {
      toast.error(error?.message || 'That didn’t work')
    } finally {
      setBusy('')
    }
  }
  const save = (payload: SupportUpdate) => run('save', () => supportApi.update(orgId, userId, payload, token))

  if (!state) return <Card title="School record"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></Card>
  const ask = <button type="button" disabled={Boolean(busy)} onClick={() => void run('ask', () => supportApi.ask(orgId, userId, token), `Asked ${first}`)}
    className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-4 text-sm font-semibold text-background disabled:opacity-50">
    {busy === 'ask' ? <Loader2 size={14} className="animate-spin" /> : <GraduationCap size={14} aria-hidden="true" />}Ask to support {first}
  </button>

  if (!active) return <Card title="School record">
    <p className="mb-3 text-sm text-muted-foreground">
      {state.status === 'requested' ? `Waiting for ${first} to say yes. A card asking them went to their chat with the organization on ${formatDate(state.requested_at)}.`
        : state.status === 'declined' ? `${first} said not now. You can ask again.`
        : state.status === 'ended' ? `Support ended on ${formatDate(state.ended_at)}. Ask again to open their record.`
        : `To keep ${first}'s Education Plan and Profile, ask to support them. They get a card that says what you'd see, and choose yes or not now.`}
    </p>
    {state.status === 'requested' ? null : ask}
  </Card>

  const record = opened?.record
  return <Card title="School record" aside={<span className="text-xs text-muted-foreground">Supported since {formatDate(state.consent_at)}</span>}>
    {!record ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : <div className="space-y-4">
      <div className="grid gap-4 @lg:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Student ID</span>
          <input defaultValue={record.student_id || ''} key={`sid-${record.student_id}`} maxLength={64} disabled={Boolean(busy)}
            onBlur={(event) => { if ((event.target.value.trim() || null) !== record.student_id) void save({ student_id: event.target.value }) }}
            className="h-10 w-full rounded-xl border border-border bg-background px-3" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Diploma track</span>
          <select value={record.diploma_track || ''} disabled={Boolean(busy)} onChange={(event) => void save({ diploma_track: (event.target.value || null) as DiplomaTrack | null })}
            className="h-10 w-full rounded-xl border border-border bg-background px-3">
            <option value="">Not set</option>
            {(state.diploma_tracks || (Object.keys(DIPLOMA_TRACK_LABELS) as DiplomaTrack[])).map((track) => <option key={track} value={track}>{DIPLOMA_TRACK_LABELS[track] || track}</option>)}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Graduation year</span>
          <input type="number" inputMode="numeric" min={1990} max={2100} defaultValue={record.graduation_year ?? ''} key={`gy-${record.graduation_year}`} disabled={Boolean(busy)}
            onBlur={(event) => { const year = event.target.value ? Number(event.target.value) : null; if (year !== record.graduation_year) void save({ graduation_year: year }) }}
            className="h-10 w-full rounded-xl border border-border bg-background px-3" />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted-foreground">Counselor: <b className="text-foreground">{record.counselor?.name || 'Not set'}</b></span>
        {record.counselor?.id === viewerId ? <button type="button" disabled={Boolean(busy)} onClick={() => void save({ counselor_user_id: null })} className="text-sm font-semibold underline disabled:opacity-50">Clear</button>
          : <button type="button" disabled={Boolean(busy)} onClick={() => void save({ counselor_user_id: viewerId })} className="text-sm font-semibold underline disabled:opacity-50">Make me their counselor</button>}
        <Link href={getUriWithOrg(orgslug, routePaths.org.admin.people.eppCaseload())} className="ml-auto text-sm font-semibold underline">All plans</Link>
        <Link href={getUriWithOrg(orgslug, routePaths.org.admin.people.epp(username))} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-3 text-sm font-semibold text-background">
          <FileText size={14} aria-hidden="true" />EPP report
        </Link>
        <button type="button" disabled={Boolean(busy)} onClick={() => { if (confirm(`End support for ${first}? Their school record closes until they say yes again.`)) void run('end', () => supportApi.end(orgId, userId, token), 'Support ended') }}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50">
          {busy === 'end' ? <Loader2 size={14} className="animate-spin" /> : null}End support
        </button>
      </div>
    </div>}
  </Card>
}
