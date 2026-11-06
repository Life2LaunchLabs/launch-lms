'use client'

import { useSearchParams } from 'next/navigation'
import { useLayoutEffect, useRef, useState } from 'react'
import { Pencil } from 'lucide-react'
import toast from 'react-hot-toast'

import { Button } from '@components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@components/ui/dialog'
import { useSection } from './v2/stack/SectionStack'
import { updateMyPortfolio } from '@services/portfolio/portfolio'
import type { SetShell, Shell } from './portfolioTypes'

// The bio on the portfolio's About tile, edited in place.

export function AboutSection({ shell, setShell, owner, token }: { shell: Shell; setShell: SetShell; owner: boolean; token?: string }) {
  const searchParams = useSearchParams()
  const [editing, setEditing] = useState(owner && searchParams.get('edit') === 'about')
  const [draft, setDraft] = useState(shell.portfolio.short_bio || '')
  const [saving, setSaving] = useState(false)
  const bio = shell.portfolio.short_bio || ''
  // In a section with a set height the bio shows what fits, fading out, and the rest opens in a dialog.
  const clamp = Boolean(useSection('about')?.fixed)
  const textRef = useRef<HTMLDivElement>(null)
  const [cut, setCut] = useState(false)
  const [reading, setReading] = useState(false)
  useLayoutEffect(() => {
    const el = textRef.current
    if (!clamp || !el) { setCut(false); return }
    const check = () => setCut(el.scrollHeight > el.clientHeight + 2)
    check()
    const watch = new ResizeObserver(check)
    watch.observe(el)
    return () => watch.disconnect()
  }, [clamp, bio])
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
  return <section aria-label="Bio" className={`group/bio relative ${clamp ? 'flex min-h-0 flex-1 flex-col' : ''}`}>
    {bio ? <div ref={textRef} className={clamp ? 'min-h-16 flex-1 overflow-hidden' : ''} style={cut ? { maskImage: 'linear-gradient(to bottom, #000 calc(100% - 56px), transparent)', WebkitMaskImage: 'linear-gradient(to bottom, #000 calc(100% - 56px), transparent)' } : undefined}><p className="max-w-3xl whitespace-pre-line text-lg leading-8 text-foreground/90">{bio}</p></div>
      : <button type="button" data-bio-start onClick={start} className="w-full rounded-2xl border-2 border-dashed border-border px-5 py-6 text-left text-base text-muted-foreground transition hover:border-[var(--org-primary-color)] hover:text-foreground">Write a short bio: who you are, what you’re working toward, what you care about.</button>}
    {cut ? <button type="button" onClick={() => setReading(true)} className="mt-1 w-fit shrink-0 rounded-lg px-2 py-1 text-sm font-bold text-[var(--org-primary-color)] hover:bg-raised">Read more</button> : null}
    <Dialog open={reading} onOpenChange={setReading}><DialogContent className="max-h-[85dvh] max-w-xl overflow-y-auto"><DialogHeader><DialogTitle>About me</DialogTitle></DialogHeader><p className="whitespace-pre-line text-lg leading-8">{bio}</p></DialogContent></Dialog>
    {owner && bio ? <button type="button" data-bio-start onClick={start} className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-bold text-muted-foreground transition hover:bg-raised hover:text-foreground" aria-label="Edit bio"><Pencil className="h-3.5 w-3.5" />Edit bio</button> : null}
  </section>
}
