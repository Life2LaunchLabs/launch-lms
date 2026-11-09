'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Plus, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'

import { useLHSession } from '@components/Contexts/LHSessionContext'
import { Button } from '@components/ui/button'
import { getUriWithOrg } from '@services/config/config'
import { getMyPortfolio } from '@services/portfolio/portfolio'
import { results as resultsApi } from '@services/portfolio/records'
import { DetailHeader, RowControls } from './PortfolioDetail'
import { EmptyAdd } from './parts'
import { INTEREST_QUIZ, PICTURE_SORT, PriceTag, RESULT_KINDS, ResultDialog, TakeIt } from './ResultDialog'
import { ResultPicture } from './ResultView'
import { RESULT_TEMPLATES, isFree, templateOf } from './resultTemplates'
import type { PortfolioResult, Shell } from '../portfolioTypes'

import { tr } from '@/lib/tr'
// What I'm like, on its own page: every result as a card, drawn the way its test shows it, with the star to
// feature it on the front page and the eye to hide it. Below, the tests you haven't added, each with a big
// way to take it (free or paid, said plainly) and a way to copy in a result you already have.

const SOURCES: Record<string, string> = { get [INTEREST_QUIZ]() { return tr('lit.portfolio_results_page.from_the_interest_quiz', 'From the interest quiz') }, get [PICTURE_SORT]() { return tr('lit.portfolio_results_page.from_the_picture_sort', 'From the picture sort') }, get manual() { return tr('lit.portfolio_results_page.added_by_you', 'Added by you') }, get plan() { return tr('lit.portfolio_results_page.from_a_plan', 'From a plan') }, get import() { return tr('lit.portfolio_results_page.imported', 'Imported') }, get cis() { return tr('lit.portfolio_results_page.from_oregon_cis', 'From Oregon CIS') }, get linkedin() { return tr('lit.portfolio_results_page.from_linkedin', 'From LinkedIn') }, get resume() { return tr('lit.portfolio_results_page.from_your_r_sum', 'From your résumé') } }
// An imported skill is one skill with a name; its summary is a description. A typed line lists several in its summary.
const skillChips = (item: PortfolioResult) => ['cis', 'linkedin', 'resume'].includes(item.source) ? [item.name] : item.summary.split(/[,;·]/)
const month = (value?: string | null) => value ? new Date(`${value.slice(0, 7)}-01T12:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : ''

function ResultCard({ result, onOpen, onFeature, onHide }: { result: PortfolioResult; onOpen: () => void; onFeature: () => void; onHide: () => void }) {
  const template = templateOf(result)
  const kind = RESULT_KINDS.find((item) => item.value === result.kind)?.label || ''
  const hidden = result.visibility === 'private'
  const same = result.summary === String(result.data?.type ?? '') || template?.input === 'chips'
  return <li className="group/row relative grid min-w-0 content-start gap-3 rounded-3xl border-2 border-border bg-card p-5 shadow-[0_4px_0_hsl(var(--border))]" data-result-card>
    <div className="flex min-w-0 items-start gap-2">
      <span className={`min-w-0 flex-1 ${hidden ? 'opacity-55' : ''}`}>
        <small className="block text-xs font-bold uppercase tracking-wide text-muted-foreground">{template ? kind : kind || tr('portfolio.portfolio_results_page.result', 'Result')}</small>
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
  // ?open=<template> (from Explore's "Pick your skills") opens that test: the learner's own result, else a new one.
  const opening = useSearchParams()?.get('open')
  const [editor, setEditor] = useState<{ result?: PortfolioResult; template?: string; kind?: PortfolioResult['kind'] } | null>(() => {
    if (!opening || !RESULT_TEMPLATES.some((item) => item.id === opening)) return null
    const own = (initialShell.results || []).find((item) => templateOf(item)?.id === opening)
    return own ? { result: own } : { template: opening }
  })
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
    try { await resultsApi.update(result.result_uuid, payload, token) } catch (error: any) { toast.error(error?.message || tr('portfolio.resume_builder.could_not_save_that', 'Could not save that')); void reload() }
  }

  return <main className="min-h-screen bg-background pb-20 text-foreground" data-portfolio-v2="results">
    <div className="mx-auto max-w-[960px] px-4 pt-4 sm:px-6 sm:pt-6">
      <DetailHeader href={getUriWithOrg(orgslug, '/portfolio')} owner color="violet" icon={Sparkles} title={tr('portfolio.portfolio_tiles.what_i_m_like', 'What I’m like')}><Button type="button" variant="brand" className="h-10" onClick={() => setEditor({})}><Plus className="h-4 w-4" />{tr('portfolio.portfolio_results_page.add_a_result', 'Add a result')}</Button></DetailHeader>
      {items.length ? <ul className="grid gap-4 sm:grid-cols-2" aria-label={tr('portfolio.portfolio_results_page.your_results', 'Your results')}>{items.map((item) => <ResultCard key={item.result_uuid} result={item}
        onOpen={() => setEditor({ result: item })} onFeature={() => void change(item, { featured: !item.featured })}
        onHide={() => void change(item, { visibility: item.visibility === 'private' ? 'public' : 'private' })} />)}</ul>
        : <EmptyAdd title={tr('portfolio.portfolio_tiles.take_the_interest_quiz', 'Take the interest quiz')} hint={tr('portfolio.portfolio_results_page.answer_30_quick_questions_or', 'Answer 30 quick questions or sort pictures of work you might enjoy, then see careers that fit. Free, about 5 minutes.')} href={quizHref} />}

      {skills.length ? <section className="mt-8 grid gap-3" aria-label={tr('portfolio.portfolio_results_page.skills', 'Skills')}>
        <h2 className="text-lg font-extrabold">{tr('portfolio.portfolio_results_page.skills', 'Skills')}</h2>
        <button type="button" onClick={() => setEditor({ result: skills[0] })} className="flex flex-wrap gap-1.5 rounded-2xl border-2 border-border bg-card p-4 text-left hover:bg-muted/40">{skills.flatMap((item) => skillChips(item).map((part) => part.trim()).filter(Boolean)).map((skill) => <span key={skill} className="inline-flex h-8 items-center rounded-full bg-muted px-3 text-[13px] font-bold">{skill}</span>)}</button>
      </section> : null}

      {more.length ? <section className="mt-10 grid gap-4" aria-label={tr('portfolio.portfolio_results_page.tests_to_take', 'Tests to take')}>
        <div><h2 className="text-lg font-extrabold">{tr('portfolio.portfolio_results_page.tests_to_take', 'Tests to take')}</h2><p className="text-sm font-semibold text-muted-foreground">{tr('portfolio.portfolio_results_page.take_one_then_copy_your', 'Take one, then copy your result in. Paid tests cost money on the site that runs them.')}</p></div>
        <ul className="grid gap-4 sm:grid-cols-2">{more.map((item) => {
          const free = isFree(item)
          return <li key={item.id} className="grid content-start gap-3 rounded-3xl border-2 border-dashed border-border p-5" data-test-card>
            <div className="flex items-start gap-2"><span className="min-w-0 flex-1"><b className="block text-[16px] font-extrabold">{item.name}</b><small className="block text-[13px] font-semibold text-muted-foreground">{item.blurb}</small></span><PriceTag free={free} /></div>
            {item.input === 'chips' ? <Button type="button" variant="brand" className="h-12 w-full justify-between text-[15px]" onClick={() => setEditor({ template: item.id })}><span className="inline-flex items-center gap-2"><Plus className="h-4 w-4" />{tr('portfolio.portfolio_results_page.pick_yours_2_min', 'Pick yours · 2 min')}</span><PriceTag free /></Button> : <>
              <TakeIt template={item} quizHref={quizHref} />
              <button type="button" onClick={() => setEditor({ template: item.id })} className="w-fit rounded-lg px-1 text-sm font-bold text-muted-foreground hover:text-foreground">{tr('portfolio.portfolio_results_page.already_took_it_add_your', 'Already took it? Add your result')}</button>
            </>}
          </li>
        })}</ul>
      </section> : null}
    </div>
    <ResultDialog key={editor?.result?.result_uuid || `new-${editor?.template || editor?.kind || ''}`} open={Boolean(editor)} onOpenChange={(open) => { if (!open) setEditor(null) }}
      result={editor?.result} template={editor?.template} kind={editor?.kind} token={token} onSaved={async () => { setEditor(null); await reload() }} />
  </main>
}
