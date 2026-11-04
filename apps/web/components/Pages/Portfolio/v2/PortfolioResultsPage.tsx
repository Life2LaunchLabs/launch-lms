'use client'

import { useState } from 'react'
import { Plus, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'

import { useLHSession } from '@components/Contexts/LHSessionContext'
import { Button } from '@components/ui/button'
import { getUriWithOrg } from '@services/config/config'
import { getMyPortfolio } from '@services/portfolio/portfolio'
import { results as resultsApi } from '@services/portfolio/records'
import { DetailHeader, RowControls } from './PortfolioDetail'
import { EmptyAdd } from './parts'
import { INTEREST_QUIZ, PriceTag, RESULT_KINDS, ResultDialog, TakeIt } from './ResultDialog'
import { ResultPicture } from './ResultView'
import { RESULT_TEMPLATES, isFree, templateOf } from './resultTemplates'
import type { PortfolioResult, Shell } from '../portfolioTypes'

// What I'm like, on its own page: every result as a card, drawn the way its test shows it, with the star to
// feature it on the front page and the eye to hide it. Below, the tests you haven't added, each with a big
// way to take it (free or paid, said plainly) and a way to copy in a result you already have.

const SOURCES: Record<string, string> = { [INTEREST_QUIZ]: 'From the interest quiz', manual: 'Added by you', plan: 'From a plan', import: 'Imported' }
const month = (value?: string | null) => value ? new Date(`${value.slice(0, 7)}-01T12:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : ''

function ResultCard({ result, onOpen, onFeature, onHide }: { result: PortfolioResult; onOpen: () => void; onFeature: () => void; onHide: () => void }) {
  const template = templateOf(result)
  const kind = RESULT_KINDS.find((item) => item.value === result.kind)?.label || ''
  const hidden = result.visibility === 'private'
  const same = result.summary === String(result.data?.type ?? '') || template?.input === 'chips'
  return <li className="group/row relative grid min-w-0 content-start gap-3 rounded-3xl border-2 border-border bg-card p-5 shadow-[0_4px_0_hsl(var(--border))]" data-result-card>
    <div className="flex min-w-0 items-start gap-2">
      <span className={`min-w-0 flex-1 ${hidden ? 'opacity-55' : ''}`}>
        <small className="block text-xs font-bold uppercase tracking-wide text-muted-foreground">{template ? kind : kind || 'Result'}</small>
        <b className="block truncate text-[17px] font-extrabold">{result.name}</b>
      </span>
      <RowControls name={result.name} featured={result.featured} hidden={hidden} onFeature={onFeature} onHide={onHide} />
    </div>
    <button type="button" onClick={onOpen} aria-label={`Open ${result.name}`} className={`grid min-w-0 justify-items-center gap-3 rounded-2xl bg-muted/50 p-4 text-center transition hover:bg-muted ${hidden ? 'opacity-55' : ''}`}>
      <ResultPicture result={result} />
      {same ? null : <b className="text-[15px] font-extrabold leading-snug">{result.summary || result.name}</b>}
    </button>
    <small className="text-xs font-semibold text-muted-foreground">{[SOURCES[result.source] || '', month(result.taken_on)].filter(Boolean).join(' · ')}</small>
  </li>
}

export function PortfolioResultsPage({ initialShell, orgslug }: { initialShell: Shell; orgslug: string }) {
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const [shell, setShell] = useState(initialShell)
  const [editor, setEditor] = useState<{ result?: PortfolioResult; template?: string; kind?: PortfolioResult['kind'] } | null>(null)
  const quizHref = getUriWithOrg(orgslug, '/portfolio/interests')
  // An older skills line (from before the chips, or an import) keeps its own row of chips below.
  const legacy = (item: PortfolioResult) => item.kind === 'skills' && !templateOf(item)
  const items = (shell.results || []).filter((item) => !legacy(item))
  const skills = (shell.results || []).filter(legacy)
  const taken = new Set(items.map((item) => templateOf(item)?.id).filter(Boolean))
  const more = RESULT_TEMPLATES.filter((item) => !taken.has(item.id))

  const reload = async () => { if (token) setShell(await getMyPortfolio(token)) }
  async function change(result: PortfolioResult, payload: Partial<PortfolioResult>) {
    if (!token) return
    setShell((current) => ({ ...current, results: (current.results || []).map((item) => item.result_uuid === result.result_uuid ? { ...item, ...payload } : item) }))
    try { await resultsApi.update(result.result_uuid, payload, token) } catch (error: any) { toast.error(error?.message || 'Could not save that'); void reload() }
  }

  return <main className="min-h-screen bg-background pb-20 text-foreground" data-portfolio-v2="results">
    <div className="mx-auto max-w-[960px] px-4 pt-4 sm:px-6 sm:pt-6">
      <DetailHeader href={getUriWithOrg(orgslug, '/portfolio')} owner color="violet" icon={Sparkles} title="What I’m like"><Button type="button" variant="brand" className="h-10" onClick={() => setEditor({})}><Plus className="h-4 w-4" />Add a result</Button></DetailHeader>
      {items.length ? <ul className="grid gap-4 sm:grid-cols-2" aria-label="Your results">{items.map((item) => <ResultCard key={item.result_uuid} result={item}
        onOpen={() => setEditor({ result: item })} onFeature={() => void change(item, { featured: !item.featured })}
        onHide={() => void change(item, { visibility: item.visibility === 'private' ? 'public' : 'private' })} />)}</ul>
        : <EmptyAdd title="Take the interest quiz" hint="30 quick questions about work you might enjoy, then careers that fit. Free, about 5 minutes." href={quizHref} />}

      {skills.length ? <section className="mt-8 grid gap-3" aria-label="Skills">
        <h2 className="text-lg font-extrabold">Skills</h2>
        <button type="button" onClick={() => setEditor({ result: skills[0] })} className="flex flex-wrap gap-1.5 rounded-2xl border-2 border-border bg-card p-4 text-left hover:bg-muted/40">{skills.flatMap((item) => item.summary.split(/[,;·]/).map((part) => part.trim()).filter(Boolean)).map((skill) => <span key={skill} className="inline-flex h-8 items-center rounded-full bg-muted px-3 text-[13px] font-bold">{skill}</span>)}</button>
      </section> : null}

      {more.length ? <section className="mt-10 grid gap-4" aria-label="Tests to take">
        <div><h2 className="text-lg font-extrabold">Tests to take</h2><p className="text-sm font-semibold text-muted-foreground">Take one, then copy your result in. Paid tests cost money on the site that runs them.</p></div>
        <ul className="grid gap-4 sm:grid-cols-2">{more.map((item) => {
          const free = isFree(item)
          return <li key={item.id} className="grid content-start gap-3 rounded-3xl border-2 border-dashed border-border p-5" data-test-card>
            <div className="flex items-start gap-2"><span className="min-w-0 flex-1"><b className="block text-[16px] font-extrabold">{item.name}</b><small className="block text-[13px] font-semibold text-muted-foreground">{item.blurb}</small></span><PriceTag free={free} /></div>
            {item.input === 'chips' ? <Button type="button" variant="brand" className="h-12 w-full justify-between text-[15px]" onClick={() => setEditor({ template: item.id })}><span className="inline-flex items-center gap-2"><Plus className="h-4 w-4" />Pick yours · 2 min</span><PriceTag free /></Button> : <>
              <TakeIt template={item} quizHref={quizHref} />
              <button type="button" onClick={() => setEditor({ template: item.id })} className="w-fit rounded-lg px-1 text-sm font-bold text-muted-foreground hover:text-foreground">Already took it? Add your result</button>
            </>}
          </li>
        })}</ul>
      </section> : null}
    </div>
    <ResultDialog key={editor?.result?.result_uuid || `new-${editor?.template || editor?.kind || ''}`} open={Boolean(editor)} onOpenChange={(open) => { if (!open) setEditor(null) }}
      result={editor?.result} template={editor?.template} kind={editor?.kind} token={token} onSaved={async () => { setEditor(null); await reload() }} />
  </main>
}
