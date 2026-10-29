'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowLeft, Check, ChevronDown, Eye, FileText, Globe2, Lock, Pencil, Plus, SlidersHorizontal } from 'lucide-react'
import toast from 'react-hot-toast'

import { useLHSession } from '@components/Contexts/LHSessionContext'
import MediaPickerDialog from '@components/Objects/Media/MediaPickerDialog'
import { Button } from '@components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { applyMediaAssetToUserAvatar, type MediaAsset } from '@services/media/library'
import { getUserAvatarMediaDirectory } from '@services/media/media'
import { getMyPortfolio, publishMyPortfolio, unpublishMyPortfolio } from '@services/portfolio/portfolio'
import { updateMyLayout } from '@services/portfolio/records'
import { PortfolioShareButton } from '../PortfolioShareDialog'
import { PortfolioVisitorBar } from '../PortfolioVisitorBar'
import { VerificationMenu } from '../PortfolioHeaderParts'
import { EXPERIENCE_TYPES } from '../ExperienceEditor'
import { HighlightsDialog, LinksDialog, ProfileDialog } from './PortfolioDialogs'
import { PortfolioTiles } from './PortfolioTiles'
import { ResultDialog } from './ResultDialog'
import { EmptyAdd, initials } from './parts'
import { previewHref } from './previewSwitch'
import type { PortfolioLayout, PortfolioResult, Shell } from '../portfolioTypes'

// The new portfolio front page (V5 prototype): a stacked header, the highlights band, then the sections as
// tiles in a grid or a list. Quests, the résumé builder and the editors come in later phases.

function Avatar({ url, name, size = 'h-[92px] w-[92px] text-[32px]' }: { url?: string; name: string; size?: string }) {
  return <span className={`grid shrink-0 place-items-center overflow-hidden rounded-full border-[5px] border-background bg-[linear-gradient(140deg,#FFC56B,#EC4F9A_60%,#8B5CF6)] font-extrabold text-white ${size}`}>
    {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : initials(name)}
  </span>
}

// eslint-disable-next-line no-unused-vars
type LayoutChange = (next: Partial<PortfolioLayout>) => void

function LayoutMenu({ layout, onChange, orgslug, onUnpublish }: { layout: PortfolioLayout; onChange: LayoutChange; orgslug: string; onUnpublish?: () => void }) {
  const option = (label: string, on: boolean, next: Partial<PortfolioLayout>) => <DropdownMenuItem onSelect={() => onChange(next)} className="flex items-center justify-between rounded-xl px-3 py-2">{label}{on ? <Check className="h-4 w-4" /> : null}</DropdownMenuItem>
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><button type="button" className="absolute right-3 top-3 z-[2] inline-flex h-[34px] items-center gap-1.5 rounded-full bg-black/50 px-3 text-[12.5px] font-bold text-white backdrop-blur transition hover:bg-black/60"><SlidersHorizontal className="h-[15px] w-[15px]" />Settings</button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-60 rounded-2xl p-2">
      <DropdownMenuLabel className="px-3 text-xs uppercase tracking-wide text-muted-foreground">Header</DropdownMenuLabel>
      {option('Left', layout.header === 'left', { header: 'left' })}
      {option('Centered', layout.header === 'center', { header: 'center' })}
      <DropdownMenuLabel className="px-3 text-xs uppercase tracking-wide text-muted-foreground">Sections</DropdownMenuLabel>
      {option('Grid', layout.sections === 'grid', { sections: 'grid' })}
      {option('List', layout.sections === 'list', { sections: 'list' })}
      <DropdownMenuSeparator />
      {onUnpublish ? <DropdownMenuItem onSelect={onUnpublish} className="rounded-xl px-3 py-2">Make my portfolio private</DropdownMenuItem> : null}
      <DropdownMenuItem asChild className="rounded-xl px-3 py-2"><Link href={getUriWithOrg(orgslug, '/portfolio/documents')}>My documents</Link></DropdownMenuItem>
      <DropdownMenuItem asChild className="rounded-xl px-3 py-2"><Link href={getUriWithOrg(orgslug, routePaths.owner.account.root())}>Account settings</Link></DropdownMenuItem>
      <DropdownMenuItem asChild className="rounded-xl px-3 py-2"><Link href={previewHref(getUriWithOrg(orgslug, '/portfolio'), false)}>Back to the current portfolio</Link></DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
}

export function PortfolioV2({ initialShell, orgslug, username, owner = false, preview = false }: { initialShell: Shell; orgslug: string; username?: string; owner?: boolean; preview?: boolean }) {
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const [shell, setShell] = useState(initialShell)
  const [profileOpen, setProfileOpen] = useState(false)
  const [highlightsOpen, setHighlightsOpen] = useState(false)
  const [avatarOpen, setAvatarOpen] = useState(false)
  const [linksOpen, setLinksOpen] = useState(false)
  const [resultEditor, setResultEditor] = useState<{ result?: PortfolioResult } | null>(null)
  const [busy, setBusy] = useState(false)
  const editing = owner && !preview
  const layout: PortfolioLayout = shell.layout || { header: 'left', sections: 'grid' }
  const centered = layout.header === 'center'
  const name = shell.identity?.shown_name || shell.portfolio.display_name || username || 'Your portfolio'
  const avatarUrl = shell.portfolio.avatar_image ? getUserAvatarMediaDirectory(shell.portfolio.user_uuid, shell.portfolio.avatar_image) : ''
  const now = (shell.timeline || []).find((entry) => entry.is_current)
  const meta = [now ? [now.title, now.organization].filter(Boolean).join(' at ') : '', shell.portfolio.location_label].filter(Boolean).join(' · ')
  const highlights = shell.highlights || []
  const published = Boolean(shell.portfolio.published_at)
  const resumeHref = getUriWithOrg(orgslug, owner ? '/portfolio/resume' : `/user/${username}/resume`)

  async function changeLayout(next: Partial<PortfolioLayout>) {
    if (!token) return
    const previous = shell
    setShell({ ...shell, layout: { ...layout, ...next } })
    try { const saved = await updateMyLayout(next, token); setShell((current) => ({ ...current, layout: saved.layout })) }
    catch (error: any) { setShell(previous); toast.error(error?.message || 'Could not change the layout') }
  }

  async function publish() {
    if (!token) return
    setBusy(true)
    try { setShell(await publishMyPortfolio({ revision: shell.portfolio.revision, privacy_confirmed: true }, token)); toast.success('Your portfolio is public') }
    catch (error: any) { toast.error(error?.message || 'Could not make your portfolio public') } finally { setBusy(false) }
  }

  async function unpublish() {
    if (!token || !window.confirm('Make your portfolio private? You can make it public again later.')) return
    setBusy(true)
    try { setShell(await unpublishMyPortfolio(shell.portfolio.revision, token)); toast.success('Your portfolio is private') }
    catch (error: any) { toast.error(error?.message || 'Could not make your portfolio private') } finally { setBusy(false) }
  }

  async function saveAvatar(asset: MediaAsset) {
    if (!token) return
    const user = await applyMediaAssetToUserAvatar(asset.asset_uuid, token)
    setShell((current) => ({ ...current, portfolio: { ...current.portfolio, avatar_image: user.avatar_image || asset.url } }))
    setAvatarOpen(false)
    toast.success('Photo updated')
  }

  const ownerActions = <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="brand" className="h-10 flex-1 px-3 sm:flex-none sm:px-4"><Plus className="h-4 w-4" />Add<ChevronDown className="h-4 w-4" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60 rounded-2xl p-2">
        <DropdownMenuLabel className="px-3 text-xs uppercase tracking-wide text-muted-foreground">Experience</DropdownMenuLabel>
        {EXPERIENCE_TYPES.map((type) => <DropdownMenuItem key={type.value} asChild className="rounded-xl px-3 py-2"><Link href={`${getUriWithOrg(orgslug, '/portfolio/timeline')}?experience=${type.value}`}>{type.label}</Link></DropdownMenuItem>)}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="rounded-xl px-3 py-2"><Link href={getUriWithOrg(orgslug, routePaths.org.portfolioProjectsNew())}>A project</Link></DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setHighlightsOpen(true)} className="rounded-xl px-3 py-2">A highlight</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    {shell.portfolio.email_verified === false && !published
      ? <VerificationMenu email={shell.portfolio.email} token={token} setShell={setShell} onPublish={publish} busy={busy} />
      : <PortfolioShareButton orgslug={orgslug} username={username} displayName={name} published={published} onPublish={publish} busy={busy} className="h-10 flex-1 px-3 text-sm sm:flex-none sm:px-4" />}
    <Button asChild variant="surface" className="h-10 flex-1 px-3 sm:flex-none sm:px-4"><Link href={resumeHref}><FileText className="h-4 w-4" />Résumé</Link></Button>
    <Button asChild variant="surface" size="icon" className="h-10 w-10 shrink-0" aria-label="Preview as a visitor" title="Preview as a visitor"><Link href={previewHref(getUriWithOrg(orgslug, '/portfolio/preview'), true)}><Eye className="h-4 w-4" /></Link></Button>
  </>

  return <main className="min-h-screen bg-background pb-20 text-foreground" data-portfolio-v2>
    {preview ? <div className="border-b border-border px-4 py-3"><div className="mx-auto flex max-w-[960px] flex-wrap items-center justify-between gap-3">
      <div><b className="text-sm font-extrabold">Visitor preview</b><p className="text-xs text-muted-foreground">This is how people see your portfolio{published ? '' : ' once it’s public'}.</p></div>
      <Button asChild variant="surface" size="sm"><Link href={previewHref(getUriWithOrg(orgslug, '/portfolio'), true)}><ArrowLeft className="h-4 w-4" />Back to editing</Link></Button>
    </div></div> : null}
    <div className="mx-auto max-w-[960px] px-4 pt-4 sm:px-6 sm:pt-6">
      <header>
        <div className="relative h-[110px] overflow-hidden rounded-3xl bg-[linear-gradient(120deg,color-mix(in_srgb,var(--org-primary-color)_90%,#000),color-mix(in_srgb,var(--org-primary-color)_55%,#EC4F9A)_55%,#F5A524)] sm:h-[150px]">
          <div className="absolute inset-0 bg-[url('/texture_overlay.png')] bg-cover opacity-25 mix-blend-overlay" aria-hidden="true" />
          {editing ? <LayoutMenu layout={layout} onChange={changeLayout} orgslug={orgslug} onUnpublish={published ? unpublish : undefined} /> : null}
        </div>
        <div className={`relative -mt-[46px] px-1 sm:-mt-14 sm:px-[22px] ${centered ? 'text-center' : ''}`}>
          {editing ? <button type="button" onClick={() => setProfileOpen(true)} aria-label="Edit your profile" className="group relative inline-block rounded-full outline-none focus-visible:ring-2 focus-visible:ring-foreground"><Avatar url={avatarUrl} name={name} /><span className="absolute bottom-1 right-1 grid h-7 w-7 place-items-center rounded-full border-2 border-background bg-foreground text-background opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100"><Pencil className="h-3.5 w-3.5" /></span></button> : <Avatar url={avatarUrl} name={name} />}
          <div className="min-w-0 pt-2.5">
            <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${centered ? 'justify-center' : ''}`}>
              <h1 className="break-words text-[clamp(26px,3vw,34px)] font-extrabold leading-[1.1] tracking-[-0.02em]">{name}</h1>
              {editing ? <span className="inline-flex h-7 items-center gap-1 rounded-full bg-muted px-2.5 text-xs font-bold text-muted-foreground">{published ? <Globe2 className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}{published ? 'Public' : 'Private'}</span> : null}
            </div>
            {shell.portfolio.headline ? <p className={`mt-1 line-clamp-2 max-w-[60ch] text-base ${centered ? 'mx-auto' : ''}`}>{shell.portfolio.headline}</p>
              : editing ? <button type="button" onClick={() => setProfileOpen(true)} className="mt-1 text-base italic text-muted-foreground hover:text-foreground">Add a one-line intro (optional)</button> : null}
            {meta ? <p className="mt-1 truncate text-[13.5px] font-semibold text-muted-foreground">{meta}</p> : null}
            <div className={`mt-3.5 flex gap-2 ${editing ? 'flex-nowrap [&>*]:min-w-0' : 'flex-wrap'} ${centered ? 'justify-center' : ''}`}>
              {editing ? ownerActions : !owner ? <>
                <Button asChild variant="brand" className="h-10"><Link href={resumeHref}><FileText className="h-4 w-4" />Résumé</Link></Button>
                {username ? <PortfolioVisitorBar orgslug={orgslug} username={username} token={token} shell={shell} /> : null}
              </> : null}
            </div>
          </div>
        </div>
      </header>

      {highlights.length ? <section aria-label="Highlights" className="relative mt-[22px] grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))] max-sm:[&>div:last-of-type:nth-of-type(odd)]:col-span-2">
        {highlights.map((item, index) => <div key={index} className="min-w-0 rounded-2xl border-2 border-border bg-card px-4 py-3 shadow-[0_4px_0_hsl(var(--border))]"><b className="block truncate text-[21px] font-extrabold leading-[1.1] tabular-nums">{item.value}</b><span className="mt-0.5 block text-[13px] font-semibold text-muted-foreground">{item.label}</span></div>)}
        {editing ? <button type="button" onClick={() => setHighlightsOpen(true)} aria-label="Edit highlights" title="Edit highlights" className="absolute -right-2 -top-3 grid h-[30px] w-[30px] place-items-center rounded-full border-2 border-border bg-card text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button> : null}
      </section> : editing ? <div className="mt-[22px]"><EmptyAdd title="Add highlights" hint="The numbers people notice first, like hours worked, a GPA or a win" onClick={() => setHighlightsOpen(true)} /></div> : null}

      <div className={`mt-4 grid gap-4 ${layout.sections === 'grid' ? 'md:grid-cols-2 md:[&>[data-wide]]:col-span-2' : ''}`} data-layout={layout.sections}>
        <PortfolioTiles shell={shell} setShell={setShell} owner={editing} orgslug={orgslug} username={username} token={token} onEditLinks={() => setLinksOpen(true)} onEditResult={(result) => setResultEditor({ result })} />
      </div>
    </div>
    {editing ? <>
      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} shell={shell} setShell={setShell} token={token} avatar={<Avatar url={avatarUrl} name={name} size="h-20 w-20 text-[28px] border-0" />} onAvatarClick={() => setAvatarOpen(true)} />
      <ResultDialog key={resultEditor?.result?.result_uuid || 'new'} open={Boolean(resultEditor)} onOpenChange={(open) => { if (!open) setResultEditor(null) }} result={resultEditor?.result} token={token} onSaved={async () => { setResultEditor(null); if (token) setShell(await getMyPortfolio(token)) }} />
      <LinksDialog open={linksOpen} onOpenChange={setLinksOpen} shell={shell} setShell={setShell} token={token} />
      <HighlightsDialog open={highlightsOpen} onOpenChange={setHighlightsOpen} shell={shell} setShell={setShell} token={token} />
      <MediaPickerDialog open={avatarOpen} onOpenChange={setAvatarOpen} title="Your photo" description="Upload a photo or choose one from your media library." owner={{ type: 'user', id: Number(shell.portfolio.user_id) }} mediaType="image" accessToken={token} onSave={saveAvatar} />
    </> : null}
  </main>
}
