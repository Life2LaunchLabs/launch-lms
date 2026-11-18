'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'react-hot-toast'
import { ArrowRight, Bookmark, GitBranch, Loader2 } from 'lucide-react'
import useLifePlan from '@components/Goals/phases/useLifePlan'
import { holdRoute } from '@components/Goals/phases/MapParts'
import { addRoute, routesFor, type CareerLike } from '@components/Goals/phases/careers'
import { current, monthText, normalize } from '@components/Goals/phases/graph'
import { getUriWithOrg } from '@services/config/config'
import { saveResource } from '@services/resources/resources'
import { cn } from '@/lib/utils'

import { tr } from '@/lib/tr'
/**
 * Put a career on the learner's plan map: pick which way to get there, then place it on the map (it opens holding
 * the route, and you tap or drag where it goes). Coming from a phase's "Start from a career", it goes right after
 * that phase. The steps go on the map as dashed ideas (quick to add, quick to drop), the last one doing this career.
 * Whatever they pick, the career is saved to their library first, so it is never lost on the way (FEED-155); with no
 * plan yet, saving it is the main choice and starting a plan is optional.
 */
export default function AddToPlans({ career, token, orgslug, after: wanted, resourceUuid, saved = false, onSavedChange, onClose }: {
  career: CareerLike; token: string; orgslug: string; after?: string | null
  /** The career's resource, saved to the learner's library whatever they choose here. */
  resourceUuid?: string; saved?: boolean; onSavedChange?: () => void
  onClose: () => void
}) {
  const router = useRouter()
  const { doc, isLoading, change, busy } = useLifePlan(token)
  const plan = React.useMemo(() => (doc && doc.phases.length ? normalize(doc) : null), [doc])
  const routes = React.useMemo(() => routesFor(career), [career])
  const [after, setAfter] = React.useState<string | null>(null)
  const [route, setRoute] = React.useState(0)
  const chosen = after || (plan && (plan.phases.find((p) => p.id === wanted)?.id || current(plan)?.id || plan.phases[plan.phases.length - 1].id)) || null
  const from = plan?.phases.find((p) => p.id === chosen)

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); onClose() } }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const [keeping, setKeeping] = React.useState(false)
  /** Save the career to their library; a failure says so but never stands in the way of planning. */
  const keep = async () => {
    if (saved || !resourceUuid) return true
    setKeeping(true)
    try {
      const result: any = await saveResource(resourceUuid, { add_to_default_channel: false }, token)
      if (result?.success === false) throw new Error()
      onSavedChange?.()
      return true
    } catch {
      toast.error(tr('discover.resource_sheet.couldn_t_save_it_try', 'Couldn’t save it. Try again.'))
      return false
    } finally {
      setKeeping(false)
    }
  }
  const saveOnly = async () => {
    if (await keep()) {
      toast.success(tr('discover.resource_sheet.saved_to_my_library', 'Saved to My library'))
      onClose()
    }
  }

  const add = async () => {
    await keep()
    // No plan yet: the route waits while they set up their first phase, which then opens the map holding it.
    if (!plan) {
      holdRoute(career.title, routes[route].steps)
      router.push(getUriWithOrg(orgslug, '/first-phase'))
      return
    }
    if (!wanted) {
      holdRoute(career.title, routes[route].steps)
      router.push(getUriWithOrg(orgslug, '/plans?map&hold=1'))
      return
    }
    if (!chosen) return
    let ids: string[] = []
    const saved = await change((next) => {
      const result = addRoute(normalize(next), chosen, routes[route].steps)
      Object.assign(next, result.doc)
      ids = result.ids
    })
    if (saved && ids[0]) router.push(getUriWithOrg(orgslug, `/plans?phase=${encodeURIComponent(ids[0])}`))
  }

  return <div className="fixed inset-0 flex items-end justify-center sm:items-center sm:p-6" style={{ zIndex: 'calc(var(--z-modal) + 1)' }}>
    <div aria-hidden="true" className="absolute inset-0 bg-black/45" onClick={onClose} />
    <div role="dialog" aria-modal="true" aria-labelledby="add-to-plans-title" className="relative flex max-h-[92dvh] w-full flex-col gap-4 overflow-y-auto rounded-t-[28px] bg-card p-5 pb-[max(20px,env(safe-area-inset-bottom))] text-foreground sm:max-w-[520px] sm:rounded-[28px]">
      <div><small className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">{tr('careers.add_to_plans.add_to_my_plans', 'Add to my plans')}</small><b id="add-to-plans-title" className="block text-[19px] leading-tight">{career.title}</b></div>
      {isLoading ? <div className="flex h-24 items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" aria-label={tr('careers.add_to_plans.loading_your_plan', 'Loading your plan')} /></div>
        : <>
          {!plan ? <p className="m-0 text-[14px] text-muted-foreground">{tr('careers.add_to_plans.save_it_now_plan_later', 'Save it to your library now and find it again any time. To put it on a plan map, start your plan with where you are now: a few questions, then this career goes after it.')}</p> : null}
          {wanted && plan ? <div className="flex flex-col gap-2">
            <span className="text-[14px] font-extrabold">{tr('careers.add_to_plans.after_which_phase', 'After which phase?')}</span>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={tr('careers.add_to_plans.after_which_phase_2', 'After which phase')}>
              {plan.phases.filter((phase) => !phase.pass).map((phase) => <button key={phase.id} type="button" role="radio" aria-checked={phase.id === chosen} onClick={() => setAfter(phase.id)}
                className={cn('flex flex-col items-start rounded-2xl border-2 px-3 py-1.5 text-left text-[13px] font-extrabold', phase.id === chosen ? 'border-[var(--org-primary-color)] bg-[color-mix(in_srgb,var(--org-primary-color)_12%,transparent)]' : 'border-border bg-card', phase.idea && 'border-dashed')}>
                {phase.title}{phase.starts ? <small className="text-[11px] font-bold text-muted-foreground">{monthText(phase.starts)}</small> : null}
              </button>)}
            </div>
          </div> : null}
          <div className="flex flex-col gap-2" role="radiogroup" aria-label={tr('careers.add_to_plans.how_to_get_there', 'How to get there')}>
            <span className="text-[14px] font-extrabold">{tr('careers.add_to_plans.how_to_get_there', 'How to get there')}</span>
            {routes.map((option, index) => <button key={index} type="button" role="radio" aria-checked={route === index} onClick={() => setRoute(index)}
              className={cn('flex flex-col gap-1.5 rounded-2xl border-2 p-3 text-left', route === index ? 'border-[var(--org-primary-color)] bg-[color-mix(in_srgb,var(--org-primary-color)_8%,transparent)]' : 'border-border bg-card')}>
              <b className="text-[13.5px]">{option.common ? tr('careers.add_to_plans.most_common', 'Most common') : tr('careers.add_to_plans.another_way', 'Another way')}</b>
              <span className="flex flex-wrap items-center gap-1.5">
                {from && wanted ? <span className="rounded-xl border-2 border-border px-2 py-1 text-[12.5px] font-extrabold text-muted-foreground">{from.title}</span> : null}
                {option.steps.map((step, stepIndex) => <React.Fragment key={stepIndex}>
                  <ArrowRight size={14} className="text-muted-foreground" aria-hidden="true" />
                  <span className="rounded-xl border-2 border-dashed border-foreground px-2 py-1 text-[12.5px] font-extrabold">{step.title}{step.years && stepIndex < option.steps.length - 1 ? <small className="ml-1 font-bold text-muted-foreground">{tr('careers.add_to_plans.years_yr', '{{years}} yr', { years: step.years })}</small> : null}</span>
                </React.Fragment>)}
              </span>
              {option.why ? <span className="text-[12.5px] text-muted-foreground">{option.why}</span> : null}
            </button>)}
          </div>
          <p className="m-0 text-[12.5px] text-muted-foreground">{tr('careers.add_to_plans.these_go_on_your_map', 'These go on your map as dashed ideas: quick to add, quick to drop. Rename them, pick a school, or fill them in later. Training lengths come from what O*NET lists for this career.')}</p>
          {!plan ? <button type="button" onClick={() => void saveOnly()} disabled={keeping || busy}
            className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--org-primary-color)] text-sm font-extrabold uppercase tracking-wide text-[var(--org-on-primary-color)] shadow-[0_4px_0_color-mix(in_srgb,var(--org-primary-color)_68%,#000)] disabled:opacity-50">
            {keeping ? <Loader2 size={16} className="animate-spin" /> : <Bookmark size={16} className={cn(saved && 'fill-current')} aria-hidden="true" />}{saved ? tr('careers.add_to_plans.saved_done', 'Saved. Done') : tr('careers.add_to_plans.save_it_for_now', 'Save it for now')}
          </button> : null}
          <div className="flex gap-2.5">
            <button type="button" onClick={onClose} className="h-12 flex-1 rounded-2xl text-sm font-bold text-muted-foreground hover:bg-muted">{tr('careers.add_to_plans.cancel', 'Cancel')}</button>
            <button type="button" onClick={() => void add()} disabled={busy || keeping || (Boolean(plan) && !chosen)}
              className={cn('flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl text-sm font-extrabold uppercase tracking-wide disabled:opacity-50', plan
                ? 'bg-[var(--org-primary-color)] text-[var(--org-on-primary-color)] shadow-[0_4px_0_color-mix(in_srgb,var(--org-primary-color)_68%,#000)]'
                : 'border-2 border-border bg-card text-foreground hover:bg-muted')}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <GitBranch size={16} />}{!plan ? tr('careers.add_to_plans.start_my_plan', 'Start my plan') : wanted ? tr('careers.add_to_plans.add_as_ideas', 'Add as ideas') : tr('careers.add_to_plans.place_on_my_map', 'Place on my map')}
            </button>
          </div>
        </>}
    </div>
  </div>
}
