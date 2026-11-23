'use client'

import React from 'react'
import Link from 'next/link'
import { BriefcaseBusiness, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@components/ui/dialog'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { normalizeMediaUrl } from '@services/media/media'
import type { PortfolioConfig, PortfolioPart, PortfolioStepItem, Step } from '@services/goals/types'
import type { ConfigPanelProps, StepCardProps, StepDefinition } from './registry'
import { CardNote, Feedback, FinishControls, StepIntro } from './shared'

import { tr } from '@/lib/tr'

// A portfolio step: "have at least N of these in your portfolio" (DEV-115). It finishes on its own.

/** The parts a step can count, as builders and learners read them. */
export const PORTFOLIO_PARTS: Record<PortfolioPart, { one: string; many: string; hint: string }> = {
  get projects() { return { one: tr('goals.portfolio.project', 'project'), many: tr('goals.portfolio.projects', 'projects'), hint: tr('goals.portfolio.projects_hint', 'Projects') } },
  get timeline() { return { one: tr('goals.portfolio.timeline_entry', 'timeline entry'), many: tr('goals.portfolio.timeline_entries', 'timeline entries'), hint: tr('goals.portfolio.timeline_hint', 'Timeline entries, like jobs or teams') } },
  get results() { return { one: tr('goals.portfolio.result', 'result'), many: tr('goals.portfolio.results', 'results'), hint: tr('goals.portfolio.results_hint', 'Results in What I’m like, like a strengths test') } },
  get traits() { return { one: tr('goals.portfolio.trait', 'skill or value'), many: tr('goals.portfolio.traits', 'skills and values'), hint: tr('goals.portfolio.traits_hint', 'Skills and values they tap in What I’m like') } },
  get credentials() { return { one: tr('goals.portfolio.credential', 'credential'), many: tr('goals.portfolio.credentials', 'credentials'), hint: tr('goals.portfolio.credentials_hint', 'Certificates, cards and test scores') } },
  get recommendations() { return { one: tr('goals.portfolio.recommendation', 'recommendation'), many: tr('goals.portfolio.recommendations', 'recommendations'), hint: tr('goals.portfolio.recommendations_hint', 'Recommendations from people who know them') } },
  get badges() { return { one: tr('goals.portfolio.badge', 'badge'), many: tr('goals.portfolio.badges', 'badges'), hint: tr('goals.portfolio.badges_hint', 'Badges they hold') } },
  get welcome() { return { one: tr('goals.portfolio.welcome', 'welcome'), many: tr('goals.portfolio.welcome', 'welcome'), hint: tr('goals.portfolio.welcome_hint', 'Their welcome, written') } },
  get launch() { return { one: tr('goals.portfolio.live_portfolio', 'live portfolio'), many: tr('goals.portfolio.live_portfolio', 'live portfolio'), hint: tr('goals.portfolio.launch_hint', 'Their portfolio, launched') } },
}
const SINGLE: PortfolioPart[] = ['welcome', 'launch']
const humanize = (value: string) => value.replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase())
/** What narrows each part, the same lists the API checks. */
export const PORTFOLIO_FILTERS: Partial<Record<PortfolioPart, string[]>> = {
  results: ['strengths', 'interests', 'personality', 'values', 'skills', 'other'],
  timeline: ['employment', 'education', 'volunteering', 'training', 'experience', 'work_career', 'leadership_service', 'learning_experiences', 'teams_activities', 'awards_recognition', 'challenges_milestones', 'other'],
  credentials: ['card', 'certificate', 'diploma', 'test_score'],
  traits: ['strength', 'value'],
}
// Older steps name a one-off check; the builder shows each as the part it means.
const LEGACY: Record<NonNullable<PortfolioConfig['check']>, PortfolioPart> = { welcome: 'welcome', timeline: 'timeline', project: 'projects', traits: 'traits', launch: 'launch', badges: 'badges' }

export const partOf = (config: PortfolioConfig): PortfolioPart => config.part || (config.check ? LEGACY[config.check] : 'projects')

/** "3 projects", "a strengths result", "your welcome": what the step asks for, in a sentence. */
export function portfolioAsk(config: PortfolioConfig): string {
  const part = partOf(config)
  const words = PORTFOLIO_PARTS[part]
  if (SINGLE.includes(part)) return part === 'welcome' ? tr('goals.portfolio.ask_welcome', 'Write your welcome') : tr('goals.portfolio.ask_launch', 'Launch your portfolio')
  const count = config.part ? config.count || 1 : 1
  const kind = config.filter ? `${humanize(config.filter).toLowerCase()} ` : ''
  return tr('goals.portfolio.ask_count', 'At least {{count}} {{kind}}{{what}}', { count, kind, what: count === 1 ? words.one : words.many })
}

/** "2 of 3", or "4 counting, 3 needed" once there are more than enough: never a count that hides items (DEV-210). */
export function portfolioTally(have: number, needed: number): string {
  return have > needed ? tr('goals.portfolio.have_over_needed', '{{have}} counting, {{needed}} needed', { have, needed }) : tr('goals.portfolio.have_of_needed', '{{have}} of {{needed}}', { have, needed })
}

export function ItemThumb({ item }: { item: PortfolioStepItem }) {
  return item.image_url ? <img src={normalizeMediaUrl(item.image_url)} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
    : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-muted text-[var(--plan-accent)]"><BriefcaseBusiness size={17} aria-hidden="true" /></span>
}

/** One item, opened: what staff review, and what the learner sees they're showing. */
export function ItemDialog({ item, onClose }: { item: PortfolioStepItem | null; onClose: () => void }) {
  return <Dialog open={!!item} onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg overflow-auto">
      <DialogTitle className="pr-8 text-lg">{item?.title}</DialogTitle>
      {item ? <div className="flex flex-col gap-3 text-sm">
        {item.subtitle || item.date ? <p className="text-muted-foreground">{[item.subtitle, item.date].filter(Boolean).join(' · ')}</p> : null}
        {item.image_url ? <img src={normalizeMediaUrl(item.image_url)} alt="" className="max-h-72 w-full rounded-xl object-cover" /> : null}
        {item.summary ? <p className="whitespace-pre-wrap leading-6">{item.summary}</p> : null}
        {item.detail.map((line, index) => <p key={index} className="whitespace-pre-wrap leading-6">{line}</p>)}
        {!item.summary && !item.detail.length ? <p className="text-muted-foreground">{tr('goals.portfolio.nothing_more', 'Nothing more is written on this one.')}</p> : null}
      </div> : null}
    </DialogContent>
  </Dialog>
}

function PortfolioCard(props: StepCardProps<'portfolio'>) {
  const { step, orgslug, actions, canWork, staff } = props
  const [opened, setOpened] = React.useState<PortfolioStepItem | null>(null)
  const ref = step.reference
  const ask = portfolioAsk(step.config)
  const done = step.status === 'completed' || step.status === 'excused' || step.status === 'submitted'
  if (!ref?.items) {
    // An older one-off check.
    return <div className="flex flex-col gap-3">
      <StepIntro step={step} />
      <CardNote icon={BriefcaseBusiness}>{tr('goals.linked.value_this_finishes_itself_when', '{{value}}. This finishes itself when your portfolio has it.', { value: ask })}</CardNote>
      {!done && !step.locked && !staff ? <Button asChild variant="surface" className="self-start"><Link href={getUriWithOrg(orgslug, routePaths.org.portfolio())}>{tr('goals.linked.open_my_portfolio', 'Open my portfolio')}</Link></Button> : null}
      {staff ? <FinishControls {...props} finishesItself /> : null}
    </div>
  }
  const needed = ref.needed || 1
  const have = ref.have || 0
  const learner = canWork && !staff
  const hidden = ref.items.filter((item) => item.hidden).map((item) => item.key)
  const toggle = (item: PortfolioStepItem) => actions.hidePortfolioItems?.(item.hidden ? hidden.filter((key) => key !== item.key) : [...hidden, item.key])
  const percent = Math.min(100, Math.round((have / needed) * 100))
  const tally = portfolioTally(have, needed)
  return <div className="flex flex-col gap-3">
    <StepIntro step={step} />
    <Feedback step={step} />
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm"><b>{ask}</b><span className="shrink-0 text-xs font-bold text-muted-foreground">{tally}</span></div>
      <div role="progressbar" aria-label={ask} aria-valuemin={0} aria-valuemax={needed} aria-valuenow={Math.min(have, needed)} className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-[var(--plan-face)] transition-all" style={{ width: `${percent}%` }} />
      </div>
    </div>
    {ref.items.length ? <div className="flex flex-col gap-1.5">
      <p className="text-xs font-extrabold text-muted-foreground">{learner ? tr('goals.portfolio.what_counts', 'What counts') : tr('goals.portfolio.linked_items', 'From their portfolio')}</p>
      <ul className="flex flex-col gap-1.5">
        {ref.items.map((item) => {
          const lastShowing = done && !item.hidden && have <= needed
          return <li key={item.key} className={cn('flex items-center gap-2 rounded-xl border bg-background p-1.5 pr-2', item.hidden && 'border-dashed')}>
            <button type="button" onClick={() => setOpened(item)} className={cn('flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 text-left hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--plan-accent)]', item.hidden && 'opacity-55')}>
              <ItemThumb item={item} />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 break-words text-sm font-bold">{item.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{item.hidden ? tr('goals.portfolio.hidden_from_step', 'Hidden from this step') : [item.subtitle, item.date].filter(Boolean).join(' · ') || tr('goals.portfolio.open_it', 'Open it')}</span>
              </span>
            </button>
            {learner && actions.hidePortfolioItems ? <button type="button" disabled={actions.busy || lastShowing} onClick={() => void toggle(item)}
              title={lastShowing ? tr('goals.portfolio.keep_enough', 'Keep at least {{needed}} showing', { needed }) : undefined}
              aria-label={item.hidden ? tr('goals.portfolio.show_item', 'Count {{title}} again', { title: item.title }) : tr('goals.portfolio.hide_item', 'Hide {{title}} from this step', { title: item.title })}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40">
              {item.hidden ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}<span className="hidden sm:inline">{item.hidden ? tr('goals.portfolio.hidden', 'Hidden') : tr('goals.portfolio.counts', 'Counts')}</span>
            </button> : null}
          </li>
        })}
      </ul>
      {learner ? <p className="text-xs text-muted-foreground">{tr('goals.portfolio.hide_note', 'Hidden items don’t count here, and staff don’t see them on this step. Items you keep private in your portfolio never count.')}</p> : null}
    </div> : <CardNote icon={BriefcaseBusiness}>{learner ? tr('goals.portfolio.nothing_yet_learner', 'Nothing yet. Add to your portfolio and it shows up here.') : tr('goals.portfolio.nothing_yet_staff', 'Nothing in their portfolio counts yet.')}</CardNote>}
    {learner && !done && !step.locked ? <Button asChild variant="surface" className="self-start"><Link href={getUriWithOrg(orgslug, routePaths.org.portfolio())}>{tr('goals.linked.open_my_portfolio', 'Open my portfolio')}</Link></Button> : null}
    {staff ? <FinishControls {...props} finishesItself /> : null}
    <ItemDialog item={opened} onClose={() => setOpened(null)} />
  </div>
}

/** Which part of the portfolio counts, and how many. Every list opens in the app's own themed menu. */
function PortfolioConfigPanel({ config, onChange }: ConfigPanelProps<'portfolio'>) {
  const part = partOf(config)
  const filters = PORTFOLIO_FILTERS[part]
  const count = config.part ? config.count || 1 : 1
  const set = (next: Partial<PortfolioConfig>) => {
    const merged = { part, count, filter: config.filter, ...next }
    onChange({ part: merged.part, ...(SINGLE.includes(merged.part) ? {} : { count: Math.max(1, Math.min(50, merged.count || 1)) }), ...(merged.filter && PORTFOLIO_FILTERS[merged.part]?.includes(merged.filter) ? { filter: merged.filter } : {}) })
  }
  return <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]">
    <div className="flex min-w-0 flex-col gap-1">
      <Label htmlFor="portfolio-part">{tr('goals.portfolio.what_counts_label', 'What counts')}</Label>
      <Select value={part} onValueChange={(value) => set({ part: value as PortfolioPart, filter: undefined })}>
        <SelectTrigger id="portfolio-part" className="w-full bg-background"><SelectValue /></SelectTrigger>
        <SelectContent>{(Object.keys(PORTFOLIO_PARTS) as PortfolioPart[]).map((key) => <SelectItem key={key} value={key}>{PORTFOLIO_PARTS[key].hint}</SelectItem>)}</SelectContent>
      </Select>
    </div>
    {SINGLE.includes(part) ? null : <div className="flex flex-col gap-1">
      <Label htmlFor="portfolio-count">{tr('goals.portfolio.at_least', 'At least')}</Label>
      <Input id="portfolio-count" type="number" min={1} max={50} value={count} onChange={(event) => set({ count: Number(event.target.value) || 1 })} />
    </div>}
    {filters ? <div className="flex min-w-0 flex-col gap-1 sm:col-span-2">
      <Label htmlFor="portfolio-filter">{tr('goals.portfolio.which_kind', 'Which kind')}</Label>
      <Select value={config.filter || 'any'} onValueChange={(value) => set({ filter: value === 'any' ? undefined : value })}>
        <SelectTrigger id="portfolio-filter" className="w-full bg-background"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="any">{tr('goals.portfolio.any_kind', 'Any kind')}</SelectItem>
          {filters.map((key) => <SelectItem key={key} value={key}>{humanize(key)}</SelectItem>)}
        </SelectContent>
      </Select>
    </div> : null}
    <p className="text-xs text-muted-foreground sm:col-span-2">{tr('goals.portfolio.builder_note', 'Done as soon as their portfolio has enough, even if it did before they got here. They see what counts and can hide items from the step.')}</p>
  </div>
}

export const portfolio: StepDefinition<'portfolio'> = {
  type: 'portfolio',
  get label() { return tr('goals.linked.portfolio', 'Portfolio') },
  color: '#46566B',
  get hint() { return tr('goals.portfolio.hint', 'Have enough of a part of their portfolio, like 3 projects or a strengths test.') },
  get example() { return tr('lit.linked.add_two_projects_to_your', 'Add two projects to your portfolio') },
  icon: BriefcaseBusiness,
  statusLine: (step: Step<'portfolio'>) => step.reference?.items ? portfolioTally(step.reference.have || 0, step.reference.needed || 1) : portfolioAsk(step.config),
  CardBody: PortfolioCard,
  ConfigPanel: PortfolioConfigPanel,
  defaultConfig: () => ({ part: 'projects', count: 1 }),
  finishesItself: true,
}
