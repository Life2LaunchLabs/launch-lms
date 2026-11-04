'use client'

import { useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { Pencil } from 'lucide-react'
import toast from 'react-hot-toast'

import { Button } from '@components/ui/button'
import { updateMyPortfolio } from '@services/portfolio/portfolio'
import type { SetShell, Shell } from './portfolioTypes'

// The bio on the portfolio's About tile, edited in place.

export function AboutSection({ shell, setShell, owner, token }: { shell: Shell; setShell: SetShell; owner: boolean; token?: string }) {
  const searchParams = useSearchParams()
  const [editing, setEditing] = useState(owner && searchParams.get('edit') === 'about')
  const [draft, setDraft] = useState(shell.portfolio.short_bio || '')
  const [saving, setSaving] = useState(false)
  const bio = shell.portfolio.short_bio || ''
  const start = () => { setDraft(bio); setEditing(true) }
  const save = async () => {
    if (!token) return
    setSaving(true)
    try {
      const next = await updateMyPortfolio({ revision: shell.portfolio.revision, short_bio: draft.trim() }, token)
      setShell(next); setEditing(false); toast.success('Bio updated')
    } catch (error: any) { toast.error(error?.message || 'Could not update your bio') }
    finally { setSaving(false) }
  }
  if (!owner && !bio) return null
  if (editing) return <section aria-label="Bio" className="flex flex-col gap-3">
    <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape' && !saving) { event.preventDefault(); setEditing(false) } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); save() } }} rows={5} autoFocus aria-label="Bio" placeholder="Tell people a little about yourself, in your own voice…" className="w-full resize-y rounded-2xl border-2 border-border bg-card p-4 text-base leading-7 outline-none focus:border-[var(--org-primary-color)]" />
    <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button><Button type="button" variant="brand" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save bio'}</Button></div>
  </section>
  return <section aria-label="Bio" className="group/bio relative">
    {bio ? <p className="max-w-3xl whitespace-pre-line text-lg leading-8 text-foreground/90">{bio}</p>
      : <button type="button" data-bio-start onClick={start} className="w-full rounded-2xl border-2 border-dashed border-border px-5 py-6 text-left text-base text-muted-foreground transition hover:border-[var(--org-primary-color)] hover:text-foreground">Write a short bio: who you are, what you’re working toward, what you care about.</button>}
    {owner && bio ? <button type="button" data-bio-start onClick={start} className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-bold text-muted-foreground transition hover:bg-raised hover:text-foreground" aria-label="Edit bio"><Pencil className="h-3.5 w-3.5" />Edit bio</button> : null}
  </section>
}
