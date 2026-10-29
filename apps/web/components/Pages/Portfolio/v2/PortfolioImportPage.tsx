'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Check, Download, Lock } from 'lucide-react'
import toast from 'react-hot-toast'

import { useLHSession } from '@components/Contexts/LHSessionContext'
import { Button } from '@components/ui/button'
import { getUriWithOrg } from '@services/config/config'
import { listImports, previewImport, runImport, type ImportPreview, type ImportResult, type ImportSource, type PastImport } from '@services/portfolio/records'
import { DetailHeader } from './PortfolioDetail'

// Bring in from another app: pick the export, see what's in it, choose what to keep. A one-time copy.

const SOURCES: Array<{ source: ImportSource; title: string; how: string; accept: string }> = [
  { source: 'cis', title: 'Oregon CIS', how: 'In Oregon CIS, open Account settings and choose "Download my data". Upload the zip it gives you.', accept: '.zip,.xlsx' },
  { source: 'linkedin', title: 'LinkedIn', how: 'In LinkedIn, open Settings, then Data privacy, then "Get a copy of your data". Upload the zip LinkedIn emails you.', accept: '.zip' },
]
const GROUPS: Array<[string, string]> = [['experience', 'Experience'], ['projects', 'Projects'], ['credentials', 'Credentials'], ['results', "What I'm like"], ['people', 'My people'], ['links', 'Links'], ['documents', 'Documents']]
const groupLabel = (key: string) => GROUPS.find(([group]) => group === key)?.[1] || key
const count = (counts: Record<string, number>) => Object.values(counts).reduce((sum, value) => sum + value, 0)

export function PortfolioImportPage({ orgslug }: { orgslug: string }) {
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const [file, setFile] = useState<{ source: ImportSource; file: File } | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [done, setDone] = useState<ImportResult | null>(null)
  const [past, setPast] = useState<PastImport[]>([])
  const [busy, setBusy] = useState(false)
  const inputs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => {
    if (token) listImports(token).then(setPast).catch(() => undefined)
  }, [token, done])

  async function choose(source: ImportSource, chosen?: File) {
    if (!chosen || !token) return
    setBusy(true)
    try {
      const found = await previewImport(source, chosen, token)
      setFile({ source, file: chosen })
      setPreview(found)
      setPicked(new Set(found.items.filter((item) => !item.already).map((item) => item.key)))
    } catch (error: any) { toast.error(error?.message || 'Could not read this file') } finally { setBusy(false) }
  }

  async function bringIn() {
    if (!file || !token) return
    setBusy(true)
    try { setDone(await runImport(file.source, file.file, [...picked], token)); setPreview(null) } catch (error: any) { toast.error(error?.message || 'Could not bring this in') } finally { setBusy(false) }
  }

  const reset = () => { setFile(null); setPreview(null); setDone(null) }
  const toggle = (key: string) => setPicked((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next })
  const keptRows = preview ? count(preview.kept) : 0

  return <main className="min-h-screen bg-background pb-24 text-foreground" data-portfolio-v2="import">
    <div className="mx-auto max-w-[760px] px-4 pt-4 sm:px-6 sm:pt-6">
      <DetailHeader href={getUriWithOrg(orgslug, '/portfolio')} owner color="sky" icon={Download} title="Bring in your history" />

      {done ? <section className="rounded-3xl border border-border bg-card p-6 text-center">
        <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-emerald-500 text-white"><Check className="h-6 w-6" /></span>
        <h2 className="text-xl font-extrabold">{count(done.added) ? `Added ${count(done.added)} ${count(done.added) === 1 ? 'thing' : 'things'} to your portfolio` : 'Nothing new to add'}</h2>
        <p className="mt-1 text-[15px] text-muted-foreground">{Object.entries(done.added).map(([group, value]) => `${groupLabel(group)} ${value}`).join(' · ')}</p>
        {count(done.kept) ? <p className="mt-2 text-sm text-muted-foreground">Your saved careers, reflections and plan progress are kept for when your plans can use them.</p> : null}
        <div className="mt-5 flex flex-wrap justify-center gap-2"><Button asChild variant="brand"><Link href={getUriWithOrg(orgslug, '/portfolio')}>See my portfolio</Link></Button><Button type="button" variant="surface" onClick={reset}>Bring in something else</Button></div>
      </section>

      : preview ? <section>
        <p className="mb-4 px-1 text-[15px] text-muted-foreground">Here&apos;s what we found in your {preview.label} export. Untick anything you don&apos;t want. This is a one-time copy; change anything later.</p>
        {GROUPS.map(([group, label]) => {
          const items = preview.items.filter((item) => item.group === group)
          if (!items.length) return null
          return <div key={group} className="mb-4 rounded-3xl border border-border bg-card p-2">
            <h2 className="px-3 pb-1 pt-2 text-[13px] font-extrabold uppercase tracking-wide text-muted-foreground">{label}</h2>
            <ul>{items.map((item) => <li key={item.key}><label className={`flex min-w-0 items-center gap-3 rounded-2xl px-3 py-2.5 ${item.already ? 'opacity-60' : 'cursor-pointer hover:bg-muted'}`}>
              <input type="checkbox" className="h-5 w-5 shrink-0 accent-[var(--org-primary-color)]" checked={!item.already && picked.has(item.key)} disabled={item.already} onChange={() => toggle(item.key)} />
              <span className="min-w-0"><b className="block truncate text-[15px] font-extrabold">{item.title}</b><small className="block truncate text-[13px] font-semibold text-muted-foreground">{item.already ? 'Already in your portfolio' : item.detail}</small></span>
            </label></li>)}</ul>
          </div>
        })}
        <p className="mb-2 flex items-start gap-2 px-1 text-sm text-muted-foreground"><Lock className="mt-0.5 h-4 w-4 shrink-0" />People and documents are only for you. Test scores start private.</p>
        {keptRows ? <p className="mb-2 px-1 text-sm text-muted-foreground">We&apos;ll also keep {keptRows} rows of saved careers, reflections and plan progress for when your plans can use them.</p> : null}
        {preview.skipped.length ? <p className="mb-2 px-1 text-sm text-muted-foreground">Can&apos;t bring in {preview.skipped.join(', ')}. Only PDFs and pictures come in as documents.</p> : null}
        <div className="mt-5 flex gap-2"><Button type="button" variant="brand" className="h-11 flex-1" disabled={busy || !picked.size} onClick={bringIn}>{busy ? 'Bringing it in…' : `Bring in ${picked.size}`}</Button><Button type="button" variant="surface" className="h-11" onClick={reset}>Cancel</Button></div>
      </section>

      : <section className="grid gap-3">
        <p className="px-1 text-[15px] text-muted-foreground">Coming from another app? Bring in your experience, credentials, results and people. You pick what comes in.</p>
        {SOURCES.map((option) => <div key={option.source} className="rounded-3xl border border-border bg-card p-5">
          <h2 className="text-lg font-extrabold">{option.title}</h2>
          <p className="mb-3 mt-1 text-[14.5px] text-muted-foreground">{option.how}</p>
          <input ref={(node) => { inputs.current[option.source] = node }} type="file" accept={option.accept} className="hidden" aria-label={`${option.title} export`} onChange={(event) => { choose(option.source, event.target.files?.[0]); event.target.value = '' }} />
          <Button type="button" variant="brand" disabled={busy} onClick={() => inputs.current[option.source]?.click()}>{busy ? 'Reading…' : `Upload from ${option.title}`}</Button>
        </div>)}
        {past.length ? <div className="px-1 pt-2 text-sm text-muted-foreground"><b className="font-extrabold text-foreground">Brought in before</b>{past.map((item) => <p key={item.import_uuid}>{item.label} · {item.creation_date ? new Date(item.creation_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''} · {count(item.added)} added</p>)}</div> : null}
      </section>}
    </div>
  </main>
}
