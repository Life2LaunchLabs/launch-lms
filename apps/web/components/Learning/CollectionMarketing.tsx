'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { updateLearningBadgeCollection } from '@services/learning/learning'

type Endorser = { name: string; logo_url?: string; url?: string }

/** The collection's Marketing: a credibility statement and the organizations endorsing the set, shown on badge and collection pages. */
export default function CollectionMarketing({ collection }: { collection: any }) {
  const router = useRouter()
  const session = useLHSession() as any
  const token = session.data?.tokens?.access_token
  const metadata = collection.collection_metadata || {}
  const [credibility, setCredibility] = React.useState<string>(metadata.credibility || '')
  const [endorsers, setEndorsers] = React.useState<Endorser[]>(metadata.endorsers || [])
  const [saving, setSaving] = React.useState(false)
  const update = (index: number, patch: Partial<Endorser>) => setEndorsers(endorsers.map((item, i) => (i === index ? { ...item, ...patch } : item)))

  const save = async () => {
    setSaving(true)
    try {
      const cleaned = endorsers.map((item) => ({ name: item.name.trim(), logo_url: item.logo_url?.trim() || undefined, url: item.url?.trim() || undefined })).filter((item) => item.name)
      await updateLearningBadgeCollection(collection.collection_uuid, { collection_metadata: { ...metadata, credibility: credibility.trim(), endorsers: cleaned } }, token)
      toast.success('Marketing saved')
      router.refresh()
    } catch (error: any) {
      toast.error(error?.message || 'Could not save marketing')
    } finally {
      setSaving(false)
    }
  }

  return <section className="rounded-xl bg-white p-6 nice-shadow">
    <h2 className="text-lg font-black">Marketing</h2>
    <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Why learners and employers should trust this set. Shown on every badge in it and on the collection page.</p>
    <label className="mt-5 block text-sm font-bold" htmlFor="collection-credibility">Credibility statement</label>
    <textarea id="collection-credibility" value={credibility} onChange={(event) => setCredibility(event.target.value)} rows={2} maxLength={240}
      placeholder="Built on the employability skills local employers hire for." className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
    <div className="mt-5 flex items-center justify-between gap-3">
      <span className="text-sm font-bold">Endorsed by</span>
      <button type="button" onClick={() => setEndorsers([...endorsers, { name: '' }])} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold hover:bg-muted"><Plus size={13} />Add endorser</button>
    </div>
    <div className="mt-2 flex flex-col gap-2">
      {endorsers.length ? endorsers.map((endorser, index) => <div key={index} className="flex flex-wrap items-center gap-2">
        <input aria-label="Endorser name" value={endorser.name} onChange={(event) => update(index, { name: event.target.value })} placeholder="Organization name" className="h-9 min-w-[10rem] flex-1 rounded-md border border-border bg-background px-3 text-sm" />
        <input aria-label="Endorser logo URL" value={endorser.logo_url || ''} onChange={(event) => update(index, { logo_url: event.target.value })} placeholder="Logo image URL (optional)" className="h-9 min-w-[10rem] flex-1 rounded-md border border-border bg-background px-3 text-sm" />
        <input aria-label="Endorser website" value={endorser.url || ''} onChange={(event) => update(index, { url: event.target.value })} placeholder="Website (optional)" className="h-9 min-w-[10rem] flex-1 rounded-md border border-border bg-background px-3 text-sm" />
        <button type="button" onClick={() => setEndorsers(endorsers.filter((_, i) => i !== index))} aria-label={`Remove ${endorser.name || 'endorser'}`} className="rounded-md p-2 text-muted-foreground hover:bg-red-50 hover:text-red-700"><Trash2 size={15} /></button>
      </div>) : <p className="text-sm text-muted-foreground">No endorsers yet.</p>}
    </div>
    <button type="button" onClick={save} disabled={saving} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? <Loader2 size={14} className="animate-spin" /> : null}Save marketing</button>
  </section>
}
