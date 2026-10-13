'use client'

import { EmptyTab } from './PortfolioChecklist'
import Link from 'next/link'
import { useState } from 'react'
import { Award, Eye, EyeOff, Star } from 'lucide-react'
import toast from 'react-hot-toast'

import { Button } from '@components/ui/button'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { normalizeMediaUrl } from '@services/media/media'
import { updateMyPortfolioBadgeVisibility, updateMyPortfolioFeaturedBadges } from '@services/portfolio/portfolio'
import { BadgeThumbnailImage } from '@components/Objects/Thumbnails/BadgeThumbnailImage'
import type { Shell, PortfolioBadge, SetShell } from './portfolioTypes'

// Earned badges: featured on the front page, and all of them with feature and visibility controls.

export function SidebarBadge({ badge, orgslug }: { badge: PortfolioBadge; orgslug: string }) {
  return <Link href={getUriWithOrg(orgslug, routePaths.org.badgeDetail(String(badge.badge_uuid).replace(/^badge_/, '')))} className="group flex w-28 shrink-0 flex-col items-center gap-2 rounded-2xl p-1 text-center outline-none focus-visible:ring-2 focus-visible:ring-foreground">
    <span className="h-24 w-24 overflow-visible">{badge.thumbnail_image ? <BadgeThumbnailImage src={normalizeMediaUrl(badge.thumbnail_image)} alt="" hoverScale /> : <span className="flex h-full w-full items-center justify-center rounded-2xl bg-raised"><Award className="h-8 w-8 text-muted-foreground" /></span>}</span>
    <span className="line-clamp-2 text-sm font-extrabold leading-tight">{badge.name}</span>
  </Link>
}

export function BadgeCard({ badge, orgslug, compact = false, featured, hidden, onFeature, onVisibility }: { badge: PortfolioBadge; orgslug: string; compact?: boolean; featured?: boolean; hidden?: boolean; onFeature?: () => void; onVisibility?: () => void }) {
  const content = <><div className={`mx-auto ${compact ? 'h-28 w-28' : 'h-32 w-32 sm:h-36 sm:w-36'} overflow-visible`}>{badge.thumbnail_image ? <BadgeThumbnailImage src={normalizeMediaUrl(badge.thumbnail_image)} alt="" hoverScale /> : <div className="flex h-full w-full items-center justify-center"><Award className="h-10 w-10 text-muted-foreground" /></div>}</div><div className="mt-2"><h3 className={`${compact ? 'text-sm' : 'text-sm sm:text-base'} font-bold leading-tight`}>{badge.name}</h3><div className="mt-1 text-xs font-semibold text-muted-foreground">Earned</div></div></>
  return <div className={`group relative rounded-xl transition hover:bg-muted/60 ${hidden ? 'opacity-45 grayscale' : ''}`}><Link href={getUriWithOrg(orgslug, routePaths.org.badgeDetail(String(badge.badge_uuid).replace(/^badge_/, '')))} className="block p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground">{content}</Link>{onFeature && <button type="button" onClick={onFeature} aria-label={featured ? `Remove ${badge.name} from featured badges` : `Feature ${badge.name}`} className={`absolute right-1 top-1 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-background/90 shadow-sm transition hover:scale-105 ${featured ? 'text-amber-500 opacity-100' : 'text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100'}`}><Star className="h-5 w-5" fill={featured ? 'currentColor' : 'none'} /></button>}{onVisibility && <button type="button" onClick={onVisibility} aria-label={hidden ? `Show ${badge.name} publicly` : `Hide ${badge.name} from visitors`} className="absolute left-1 top-1 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow-sm transition hover:scale-105 hover:text-foreground">{hidden ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button>}</div>
}

export function BadgesView({ shell, setShell, owner, orgslug, token }: { shell: Shell; setShell: SetShell; owner: boolean; orgslug: string; token?: string }) {
  const earned = shell.badges?.earned || []
  const [selected, setSelected] = useState<string[]>(shell.badges?.featuredBadgeUuids || [])
  const [hidden, setHidden] = useState<string[]>(shell.badges?.hiddenBadgeUuids || [])
  const [savingUuid, setSavingUuid] = useState<string | null>(null)
  const toggle = async (uuid: string) => {
    if (!token) return
    const nextSelected = selected.includes(uuid) ? selected.filter((item) => item !== uuid) : [...selected, uuid]
    setSelected(nextSelected); setSavingUuid(uuid)
    try { const next = await updateMyPortfolioFeaturedBadges({ badge_uuids: nextSelected }, token); setShell(next) }
    catch (error: any) { setSelected(selected); toast.error(error?.message || 'Could not update featured badges') }
    finally { setSavingUuid(null) }
  }
  const toggleVisibility = async (uuid: string) => {
    if (!token) return
    const nextHidden = hidden.includes(uuid) ? hidden.filter((item) => item !== uuid) : [...hidden, uuid]
    setHidden(nextHidden); setSavingUuid(uuid)
    try { const next = await updateMyPortfolioBadgeVisibility({ hidden_badge_uuids: nextHidden, revision: shell.portfolio.revision }, token); setShell(next) }
    catch (error: any) { setHidden(hidden); toast.error(error?.message || 'Could not update badge visibility') }
    finally { setSavingUuid(null) }
  }
  if (owner && !earned.length) return <EmptyTab icon={Award} eyebrow="Your badges" title="Turn progress into proof" description="Badge plans help you practice skills, collect evidence, and show what you can do." examples={['Choose a skill to grow', 'Complete hands-on activities', 'Collect evidence of your project', 'Share verified achievements']} action="Find your first badge" href={routePaths.org.discover()} orgslug={orgslug} />
  return <div className="space-y-12">
    <section><div className="mb-5"><h2 className="text-2xl font-black">Earned badges</h2>{owner && <p className="mt-1 text-sm text-muted-foreground">Star badges for your overview. Use the eye control to hide a badge from visitors.</p>}</div>{earned.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{earned.map((badge) => <div key={badge.badge_uuid} className={savingUuid === badge.badge_uuid ? 'pointer-events-none opacity-70' : ''}><BadgeCard badge={badge} orgslug={orgslug} featured={selected.includes(badge.badge_uuid)} hidden={hidden.includes(badge.badge_uuid)} onFeature={owner ? () => toggle(badge.badge_uuid) : undefined} onVisibility={owner ? () => toggleVisibility(badge.badge_uuid) : undefined} /></div>)}</div> : <div className="rounded-2xl border border-dashed border-border py-14 text-center"><Award className="mx-auto h-10 w-10 text-muted-foreground" /><p className="mt-3 font-semibold">Your earned badges will appear here.</p><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Start a badge plan to practice a skill and collect evidence you can share.</p>{owner && <Button asChild className="mt-6"><Link href={getUriWithOrg(orgslug, routePaths.org.discover())}>Find a badge</Link></Button>}</div>}</section>
  </div>
}
