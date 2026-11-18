'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import useSWR, { useSWRConfig } from 'swr'
import toast from 'react-hot-toast'
import { Download, Eye, Loader2, ShieldCheck, Trash2 } from 'lucide-react'
import { PersonAvatar } from '@components/Goals/share/PersonAvatar'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@components/ui/dialog'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { peopleKeys } from '@services/school/people'
import { recordsApi, recordsKeys, type RecordsAccessItem } from '@services/school/records'
import { inOrgWords } from '@/lib/people'

function when(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/**
 * A parent's records request, on a learner's Access tab (admins): download their records, see which staff
 * opened them and when, and delete the learner and their data.
 */
export default function LearnerRecords({ orgslug, orgId, token, learner }: {
  orgslug: string
  orgId: number
  token?: string
  learner: { id: number; name: string; username: string }
}) {
  const [downloading, setDownloading] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [pages, setPages] = React.useState(1)
  const first = learner.name?.split(' ')[0] || inOrgWords('this learner')

  const download = async () => {
    if (!token || downloading) return
    setDownloading(true)
    try {
      await recordsApi.download(orgId, learner.id, token)
      toast.success('Records downloaded')
    } catch (error: any) {
      toast.error(error?.message || 'The records could not be downloaded.')
    } finally {
      setDownloading(false)
    }
  }

  return <section aria-label="Records request" className="space-y-4 rounded-2xl border border-border bg-card p-5">
    <div>
      <h2 className="flex items-center gap-2 text-base font-bold"><ShieldCheck size={18} aria-hidden="true" />Records request</h2>
      <p className="mt-1 text-sm text-muted-foreground">When a parent asks for {first}&rsquo;s records, download them here, check who has opened them, or delete {first} and their data.</p>
    </div>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" onClick={() => void download()} disabled={!token || downloading} className="h-10 gap-2 rounded-full px-4 font-semibold">
        {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} aria-hidden="true" />}Download records
      </Button>
      <Button type="button" variant="outline" onClick={() => setDeleting(true)} disabled={!token}
        className="h-10 gap-2 rounded-full border-red-200 px-4 font-semibold text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950">
        <Trash2 size={16} aria-hidden="true" />Delete learner and data
      </Button>
    </div>
    <p className="text-xs text-muted-foreground">The download is a zip: a PDF a parent can read with their profile, plans and answers, portfolio and badges, plus their Education Plan and Profile and the files they handed in. Notes staff wrote only for staff stay out.</p>

    <div className="border-t border-border pt-4">
      <h3 className="flex items-center gap-2 text-sm font-bold"><Eye size={16} aria-hidden="true" />Who opened their records</h3>
      <div className="mt-2">
        {Array.from({ length: pages }, (_, index) => <AccessPage key={index} orgId={orgId} userId={learner.id} token={token} offset={index * 50}
          last={index === pages - 1} more={() => setPages(pages + 1)} first={index === 0} name={first} />)}
      </div>
    </div>

    {deleting ? <DeleteLearner orgslug={orgslug} orgId={orgId} token={token} learner={learner} close={() => setDeleting(false)} /> : null}
  </section>
}

function AccessPage({ orgId, userId, token, offset, last, more, first, name }: {
  orgId: number; userId: number; token?: string; offset: number; last: boolean; more: () => void; first: boolean; name: string
}) {
  const { data, error, isLoading } = useSWR(token ? recordsKeys.access(orgId, userId, offset) : null, () => recordsApi.access(orgId, userId, token, offset), { revalidateOnFocus: false })
  if (isLoading) return <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
  if (error) return <p className="text-sm text-muted-foreground">{error.message || 'The access log couldn’t load.'}</p>
  const items = data?.items || []
  if (first && !items.length) return <p className="text-sm text-muted-foreground">No staff have opened {name}&rsquo;s records yet.</p>
  return <>
    <ul className="divide-y divide-border">{items.map((item) => <AccessRow key={item.id} item={item} />)}</ul>
    {last && data?.more ? <button type="button" onClick={more} className="mt-2 text-sm font-semibold text-muted-foreground underline hover:text-foreground">Show earlier</button> : null}
  </>
}

function AccessRow({ item }: { item: RecordsAccessItem }) {
  return <li className="flex items-start gap-3 py-2.5">
    <PersonAvatar user={{ ...item.by, id: item.by.id ?? 0 } as any} size="md" />
    <div className="min-w-0 flex-1">
      <p className="text-sm"><span className="font-semibold">{item.by.name}</span> <span className="text-muted-foreground">{item.label.charAt(0).toLowerCase() + item.label.slice(1)}</span></p>
      {item.detail ? <p className="truncate text-xs text-muted-foreground">{item.detail}</p> : null}
    </div>
    <time dateTime={item.at} className="shrink-0 text-xs text-muted-foreground">{when(item.at)}</time>
  </li>
}

function DeleteLearner({ orgslug, orgId, token, learner, close }: {
  orgslug: string; orgId: number; token?: string; learner: { id: number; name: string; username: string }; close: () => void
}) {
  const router = useRouter()
  const { mutate } = useSWRConfig()
  const { data: preview, error, isLoading } = useSWR(token ? recordsKeys.deletePreview(orgId, learner.id) : null, () => recordsApi.deletePreview(orgId, learner.id, token), { revalidateOnFocus: false })
  const [typed, setTyped] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const matches = typed.trim().replace(/^@/, '').toLowerCase() === learner.username.toLowerCase()

  const remove = async () => {
    if (!token || !matches || busy) return
    setBusy(true)
    try {
      const result = await recordsApi.remove(orgId, learner.id, typed, token)
      toast.success(result.detail || `${learner.name} was deleted`)
      await mutate((key) => typeof key === 'string' && key.startsWith(peopleKeys.directory(orgId).split('?')[0]))
      router.push(getUriWithOrg(orgslug, routePaths.org.admin.people.root()))
    } catch (problem: any) {
      toast.error(problem?.message || 'That didn’t work')
      setBusy(false)
    }
  }

  return <Dialog open onOpenChange={(open) => { if (!open && !busy) close() }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Delete {learner.name} and their data?</DialogTitle>
        <DialogDescription>Check what goes and what your organization keeps before you confirm. This can&rsquo;t be undone.</DialogDescription>
      </DialogHeader>
      {isLoading ? <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        : error || !preview ? <p className="text-sm text-muted-foreground">{error?.message || 'This couldn’t load.'}</p>
        : <div className="space-y-4 text-sm">
          {preview.can_delete ? <>
            <div>
              <h3 className="mb-1.5 font-bold">What&rsquo;s deleted</h3>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">{preview.removed.map((line) => <li key={line}>{line}</li>)}</ul>
            </div>
            <div>
              <h3 className="mb-1.5 font-bold">What your organization keeps, and why</h3>
              <ul className="space-y-2">{preview.kept.map((item) => <li key={item.what} className="rounded-xl bg-muted/60 px-3 py-2">
                <span className="block font-semibold">{item.what}</span>
                <span className="block text-xs text-muted-foreground">{item.why}</span>
              </li>)}</ul>
            </div>
            <p className="text-xs text-muted-foreground">Download their records first if the parent asked for a copy.</p>
            <label className="block">
              <span className="mb-1.5 block font-semibold">Type <span className="font-mono">@{learner.username}</span> to confirm</span>
              <Input value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" spellCheck={false} aria-label="Their username" placeholder={`@${learner.username}`} />
            </label>
          </> : <p className="rounded-xl bg-muted/60 px-3 py-2">{preview.blocked_reason}</p>}
        </div>}
      <DialogFooter className="gap-2 sm:gap-2">
        <Button type="button" variant="outline" onClick={close} disabled={busy} className="rounded-full">Cancel</Button>
        {preview?.can_delete ? <Button type="button" variant="destructive" onClick={() => void remove()} disabled={!matches || busy} className="gap-2 rounded-full">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} aria-hidden="true" />}Delete for good
        </Button> : null}
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
