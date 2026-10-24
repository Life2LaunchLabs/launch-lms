'use client'

import { EmptyTab } from './PortfolioChecklist'
import Link from 'next/link'
import { useState } from 'react'
import { Award, Eye, EyeOff, Star } from 'lucide-react'
import toast from 'react-hot-toast'

import { Button } from '@components/ui/button'
import { BadgeMedal } from '@components/Badges/BadgeMedal'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { normalizeMediaUrl } from '@services/media/media'
import { updateMyPortfolioBadgeVisibility, updateMyPortfolioFeaturedBadges } from '@services/portfolio/portfolio'
import type { Shell, PortfolioBadge, SetShell, WorkingToward } from './portfolioTypes'

// Earned badges: featured on the front page, and all of them with feature and visibility controls; then the plans that will earn one.

const medal = (badge: PortfolioBadge | WorkingToward) => ({ image_url: normalizeMediaUrl(badge.image_url || '') || '', icon: badge.icon, color: badge.color })
const awardHref = (orgslug: string, badge: PortfolioBadge) => getUriWithOrg(orgslug, routePaths.org.badgeAward(badge.award_uuid))

export function SidebarBadge({ badge, orgslug }: { badge: PortfolioBadge; orgslug: string }) {
  return <Link href={awardHref(orgslug, badge)} className="group flex w-28 shrink-0 flex-col items-center gap-2 rounded-2xl p-1 text-center outline-none focus-visible:ring-2 focus-visible:ring-foreground">
    <span className="transition-transform duration-300 group-hover:scale-105"><BadgeMedal badge={medal(badge)} size={96} /></span>
    <span className="line-clamp-2 text-sm font-extrabold leading-tight">{badge.name}</span>
  </Link>
}

export function BadgeCard({ badge, orgslug, compact = false, featured, hidden, onFeature, onVisibility }: { badge: PortfolioBadge; orgslug: string; compact?: boolean; featured?: boolean; hidden?: boolean; onFeature?: () => void; onVisibility?: () => void }) {
  const content = <><div className="flex justify-center transition-transform duration-300 group-hover:scale-105"><BadgeMedal badge={medal(badge)} size={compact ? 112 : 128} /></div><div className="mt-2"><h3 className={`${compact ? 'text-sm' : 'text-sm sm:text-base'} font-bold leading-tight`}>{badge.name}</h3><div className="mt-1 text-xs font-semibold text-muted-foreground">{badge.issuer ? `From ${badge.issuer.name}` : 'Earned'}</div></div></>
  return <div className={`group relative rounded-xl text-center transition hover:bg-muted/60 ${hidden ? 'opacity-45 grayscale' : ''}`}><Link href={awardHref(orgslug, badge)} className="block p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground">{content}</Link>{onFeature && <button type="button" onClick={onFeature} aria-label={featured ? `Remove ${badge.name} from featured badges` : `Feature ${badge.name}`} className={`absolute right-1 top-1 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-background/90 shadow-sm transition hover:scale-105 ${featured ? 'text-amber-500 opacity-100' : 'text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100'}`}><Star className="h-5 w-5" fill={featured ? 'currentColor' : 'none'} /></button>}{onVisibility && <button type="button" onClick={onVisibility} aria-label={hidden ? `Show ${badge.name} publicly` : `Hide ${badge.name} from visitors`} className="absolute left-1 top-1 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow-sm transition hover:scale-105 hover:text-foreground">{hidden ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button>}</div>
}

/** A plan that will earn a badge: the badge greyed out until it's earned, and how far along the plan is. */
function WorkingTowardCard({ item, orgslug }: { item: WorkingToward; orgslug: string }) {
  const percent = item.total ? Math.round((item.done * 100) / item.total) : 0
  return <Link href={getUriWithOrg(orgslug, routePaths.org.plan(item.goal_uuid))} className="group flex items-center gap-4 rounded-2xl border border-border p-4 no-underline transition hover:bg-muted/60">
    <span className="opacity-60 grayscale transition group-hover:opacity-100 group-hover:grayscale-0"><BadgeMedal badge={medal(item)} size={64} /></span>
    <span className="flex min-w-0 flex-1 flex-col gap-1">
      <strong className="truncate text-foreground">{item.name}</strong>
      <span className="truncate text-xs font-semibold text-muted-foreground">{item.plan_title} · {item.done} of {item.total} steps</span>
      <span className="block h-2 overflow-hidden rounded-full bg-raised"><span className="block h-full rounded-full bg-[var(--org-primary-color)]" style={{ width: `${percent}%` }} /></span>
    </span>
  </Link>
}

export function BadgesView({ shell, setShell, owner, orgslug, token }: { shell: Shell; setShell: SetShell; owner: boolean; orgslug: string; token?: string }) {
  const earned = shell.badges?.earned || []
  const workingToward = shell.badges?.working_toward || []
  const [selected, setSelected] = useState<string[]>(shell.badges?.featuredAwardUuids || [])
  const [hidden, setHidden] = useState<string[]>(shell.badges?.hiddenAwardUuids || [])
  const [savingUuid, setSavingUuid] = useState<string | null>(null)
  const toggle = async (uuid: string) => {
    if (!token) return
    const nextSelected = selected.includes(uuid) ? selected.filter((item) => item !== uuid) : [...selected, uuid]
    setSelected(nextSelected); setSavingUuid(uuid)
    try { const next = await updateMyPortfolioFeaturedBadges({ award_uuids: nextSelected }, token); setShell(next) }
    catch (error: any) { setSelected(selected); toast.error(error?.message || 'Could not update featured badges') }
    finally { setSavingUuid(null) }
  }
  const toggleVisibility = async (uuid: string) => {
    if (!token) return
    const nextHidden = hidden.includes(uuid) ? hidden.filter((item) => item !== uuid) : [...hidden, uuid]
    setHidden(nextHidden); setSavingUuid(uuid)
    try { const next = await updateMyPortfolioBadgeVisibility({ hidden_award_uuids: nextHidden, revision: shell.portfolio.revision }, token); setShell(next) }
    catch (error: any) { setHidden(hidden); toast.error(error?.message || 'Could not update badge visibility') }
    finally { setSavingUuid(null) }
  }
  if (owner && !earned.length && !workingToward.length) return <EmptyTab icon={Award} eyebrow="Your badges" title="Turn progress into proof" description="Plans that earn a badge help you practice skills, collect evidence, and show what you can do." examples={['Choose a skill to grow', 'Complete hands-on activities', 'Collect evidence of your project', 'Share verified achievements']} action="Find a plan" href={routePaths.org.discover()} orgslug={orgslug} />
  return <div className="space-y-12">
    <section><div className="mb-5"><h2 className="text-2xl font-black">Earned badges</h2>{owner && earned.length ? <p className="mt-1 text-sm text-muted-foreground">Star badges for your overview. Use the eye control to hide a badge from visitors.</p> : null}</div>{earned.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{earned.map((badge) => <div key={badge.award_uuid} className={savingUuid === badge.award_uuid ? 'pointer-events-none opacity-70' : ''}><BadgeCard badge={badge} orgslug={orgslug} featured={selected.includes(badge.award_uuid)} hidden={hidden.includes(badge.award_uuid)} onFeature={owner ? () => toggle(badge.award_uuid) : undefined} onVisibility={owner ? () => toggleVisibility(badge.award_uuid) : undefined} /></div>)}</div> : <div className="rounded-2xl border border-dashed border-border py-14 text-center"><Award className="mx-auto h-10 w-10 text-muted-foreground" /><p className="mt-3 font-semibold">Badges you earn will appear here.</p><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Finish a plan that earns a badge to collect evidence you can share.</p>{owner && <Button asChild className="mt-6"><Link href={getUriWithOrg(orgslug, routePaths.org.discover())}>Find a plan</Link></Button>}</div>}</section>
    {workingToward.length ? <section><div className="mb-5"><h2 className="text-2xl font-black">Working toward</h2><p className="mt-1 text-sm text-muted-foreground">Your plans that earn a badge when you finish them.</p></div><div className="grid gap-3 md:grid-cols-2">{workingToward.map((item) => <WorkingTowardCard key={item.goal_uuid} item={item} orgslug={orgslug} />)}</div></section> : null}
  </div>
}
