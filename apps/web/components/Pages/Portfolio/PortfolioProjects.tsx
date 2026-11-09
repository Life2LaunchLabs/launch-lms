'use client'

import Link from 'next/link'
import type { CSSProperties } from 'react'
import { useTheme } from 'next-themes'
import { Pencil } from 'lucide-react'
import { accentVars, modeOf } from '@components/Looks/looks'
import type { PortfolioLayout } from '@services/portfolio/records'

import { Button } from '@components/ui/button'
import ContentPageHeader from '@components/Objects/StyledElements/Headers/ContentPageHeader'
import { getUriWithOrg } from '@services/config/config'
import { normalizeMediaUrl } from '@services/media/media'
import type { Project } from './portfolioTypes'

import { tr } from '@/lib/tr'
// Projects: the grid, featured cards, the editor page and a project's own page.

export function ProjectCardView({ item, href, preview = false }: { item: Project; href?: string; preview?: boolean }) { const card = <div className="group min-w-0"><div className="aspect-[4/3] overflow-hidden rounded-xl bg-muted">{item.cover_url ? <img src={normalizeMediaUrl(item.cover_url)} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" /> : <div className="flex h-full items-center justify-center px-4 text-center text-sm font-semibold text-muted-foreground">{item.title || tr('portfolio.portfolio_projects.your_projects', 'Your projects')}</div>}</div><h3 className="mt-3 line-clamp-2 text-sm font-bold leading-snug sm:text-base">{item.title || tr('portfolio.portfolio_projects.your_projects', 'Your projects')}</h3>{(item.summary || String(item.blocks.find((block) => block.block_type === 'text')?.data?.text || '')) && <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{item.summary || String(item.blocks.find((block) => block.block_type === 'text')?.data?.text || '')}</p>}{preview && <span className="sr-only">{tr('portfolio.portfolio_projects.preview_of_your_project_card', 'Preview of your Project card')}</span>}</div>; return href ? <Link href={href}>{card}</Link> : card }

export function formatProjectDate(start?: string, end?: string) { if (!start && !end) return ''; const format = (value: string) => new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' }).format(new Date(`${value}T00:00:00`)); if (start && end) return `${format(start)} – ${format(end)}`; return start ? format(start) : `Through ${format(end!)}` }
/**
 * A project's own page as visitors see it, in its owner's look. Same facts in every look, told its own way
 * (styles/looks.css): Playful is chunky and rounded, Gallery sets the title huge over a square, full-bleed
 * picture, and Volt puts the title on the photo.
 */
export function ProjectDetail({ project, orgslug, owner, layout }: { project: Project; portfolio: any; orgslug: string; owner: boolean; username?: string; layout?: PortfolioLayout | null }) {
  const { resolvedTheme } = useTheme()
  const gallery = project.blocks.filter((block) => block.block_type === 'image' && block.data.asset_uuid !== project.cover_asset_uuid)
  const story = project.blocks.find((block) => block.block_type === 'text')
  const look = layout?.look || null
  const mode = layout ? modeOf(layout) : 'system'
  const dark = mode === 'dark' || (mode === 'system' && resolvedTheme === 'dark')
  const when = formatProjectDate(project.start_date, project.end_date)
  const title = <div data-pj-title><h1 className="text-3xl font-black sm:text-5xl">{project.title}</h1>{project.subtitle || when ? <p className="mt-2 text-sm font-semibold text-muted-foreground">{[project.subtitle, when].filter(Boolean).join(' · ')}</p> : null}</div>
  return <main data-project-detail data-look={look || undefined} data-accent={layout?.accent ? '' : undefined} className={`min-h-screen ${look && dark ? 'dark' : ''}`} style={accentVars(layout?.accent) as CSSProperties}>
    <div className="mx-auto max-w-4xl px-4 pb-16 sm:px-6">
      <ContentPageHeader orgslug={orgslug} backLabel={tr('lit.portfolio_projects.projects', 'Projects')} noHorizontalBleed />
      {owner && <div className="mb-4 flex justify-end"><Button asChild variant="outline"><Link href={`${getUriWithOrg(orgslug, '/portfolio/projects')}?editProject=${encodeURIComponent(project.project_uuid)}`}><Pencil className="mr-2 h-4 w-4" />{tr('portfolio.portfolio_projects.edit', 'Edit')}</Link></Button></div>}
      <article className="grid gap-8">
        {project.cover_url ? <div data-pj-hero className="relative aspect-[16/9] overflow-hidden rounded-3xl border-2 border-border bg-muted shadow-[0_4px_0_hsl(var(--border))]"><img src={normalizeMediaUrl(project.cover_url)} alt="" className="h-full w-full object-cover" /><div data-pj-over className="hidden">{title}</div></div> : null}
        <div data-pj-head className={project.cover_url ? '' : 'block'}>{title}</div>
        {story?.data?.text && <div data-pj-story className="prose prose-lg max-w-3xl whitespace-pre-wrap dark:prose-invert">{story.data.text}</div>}
        {gallery.length > 0 && <div data-pj-gallery className="grid gap-3 sm:grid-cols-2">{gallery.map((block, index) => <img key={block.block_uuid || index} src={normalizeMediaUrl(block.data.url)} alt={block.data.caption || ''} className="w-full rounded-2xl object-cover" />)}</div>}
      </article>
    </div>
  </main>
}
