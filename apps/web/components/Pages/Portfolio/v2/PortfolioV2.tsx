'use client'

import Link from 'next/link'
import { type CSSProperties, type Dispatch, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Download, Eye, FileText, Globe2, Lock, Palette, SlidersHorizontal, Trophy, X } from 'lucide-react'
import { useTheme } from 'next-themes'
import toast from 'react-hot-toast'

import { useLHSession } from '@components/Contexts/LHSessionContext'
import { openCandidatePanel } from '@components/Candidate/CandidateExperience'
import { signOut } from '@components/Contexts/AuthContext'
import MediaPickerDialog from '@components/Objects/Media/MediaPickerDialog'
import { Button } from '@components/ui/button'
import { useAsk } from '@components/ui/ask-dialog'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { applyMediaAssetToUserAvatar, type MediaAsset } from '@services/media/library'
import { getUserAvatarMediaDirectory } from '@services/media/media'
import { getMyPortfolio, publishMyPortfolio, unpublishMyPortfolio } from '@services/portfolio/portfolio'
import { markProgressSeen, updateConnectRequests, updateMyLayout, type LayoutChange } from '@services/portfolio/records'
import { normalizeMediaUrl } from '@services/media/media'
import { PortfolioShareButton } from '../PortfolioShareDialog'
import { PortfolioVisitorBar } from '../PortfolioVisitorBar'
import { VerificationMenu } from '../PortfolioHeaderParts'
import { HighlightsDialog, LinksDialog, ProfileDialog } from './PortfolioDialogs'
import { TILE_SECTIONS, hasSection } from './PortfolioTiles'
import { SectionStack } from './stack/SectionStack'
import { FeatureDialog, FeatureSection, featureChoices, resolveFeatures } from './stack/FeatureSection'
import { ALL_SECTIONS, LOOK_NAMES, REQUIRED, SECTION_LABELS, type Row, copyRows, lookOf, mergeHidden, norm, sameRows, suggested, visibleRows } from './stack/model'
import type { SectionType } from '@services/portfolio/records'
import { ResultDialog } from './ResultDialog'
import { SKILLS_VALUES } from './resultTemplates'
import { LookDialog } from './LookDialog'
import { WelcomeDialog } from './WelcomeDialog'
import { BANNERS, accentVars, applyLook, modeOf, storedAccent, storedLook } from '@components/Looks/looks'
import { EmptyAdd, QuestMark, SectionTools, SpotTip, Tile, initials } from './parts'
import { PortfolioHeader, cornerClass } from './PortfolioHeader'
import { shellSocials } from '../PortfolioHeaderParts'
import { MasteryBadge, QuestBanner, QuestButton } from './QuestBar'
import { questPath, spotPaths, spotsFor, stageOf, type Quest } from './progress'
import type { PortfolioLayout, PortfolioResult, Shell } from '../portfolioTypes'

import { tr } from '@/lib/tr'
// The new portfolio front page (V5 prototype): a stacked header, the highlights band, then the sections as
// tiles in a grid or a list. Quests, the résumé builder and the editors come in later phases.

function Avatar({ url, name, size = 'h-[92px] w-[92px] text-[32px]' }: { url?: string; name: string; size?: string }) {
  return <span className={`grid shrink-0 place-items-center overflow-hidden rounded-full bg-[linear-gradient(140deg,#FFC56B,#EC4F9A_60%,#8B5CF6)] font-extrabold text-white ${size}`}>
    {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : initials(name)}
  </span>
}

/** The owner's corner: Settings, which holds the look. A quest step for the look marks both the button and the item. */
function SettingsMenu({ orgslug, onLook, onUnpublish, connect, onConnect, className, spot }: { orgslug: string; onLook: () => void; onUnpublish?: () => void; connect: boolean; onConnect: Dispatch<boolean>; className: string; spot?: string }) {
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><button type="button" aria-label={tr('portfolio.portfolio_v2.settings', 'Settings')} className={`${className} ${spot ? 'ring-4 ring-[#ffc21a]' : ''}`}><SlidersHorizontal className="h-[15px] w-[15px]" /><span className="max-sm:hidden">{tr('portfolio.portfolio_v2.settings', 'Settings')}</span></button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-60 rounded-2xl p-2">
      <DropdownMenuItem onSelect={onLook} className={`rounded-xl px-3 py-2 ${spot ? 'bg-[#ffc21a]/20' : ''}`}><Palette className="h-4 w-4" /><span className="flex-1">{tr('portfolio.portfolio_v2.look_and_layout', 'Look and layout')}</span>{spot ? <QuestMark className="h-[18px] w-[18px]" /> : null}</DropdownMenuItem>
      <DropdownMenuSeparator />
      {/* Off until the learner turns it on: visitors with an account can then send a request with a note. */}
      <DropdownMenuCheckboxItem checked={connect} onCheckedChange={(on) => onConnect(on === true)} onSelect={(event) => event.preventDefault()} className="rounded-xl py-2">
        <span className="flex flex-col"><span>{tr('portfolio.portfolio_v2.let_people_ask_to_connect', 'Let people ask to connect')}</span><small className="text-xs text-muted-foreground">{tr('portfolio.portfolio_v2.visitors_with_an_account_can', 'Visitors with an account can send you a request')}</small></span>
      </DropdownMenuCheckboxItem>
      {onUnpublish ? <DropdownMenuItem onSelect={onUnpublish} className="rounded-xl px-3 py-2">{tr('portfolio.portfolio_v2.make_my_portfolio_private', 'Make my portfolio private')}</DropdownMenuItem> : null}
      <DropdownMenuItem asChild className="rounded-xl px-3 py-2"><Link href={getUriWithOrg(orgslug, '/portfolio/documents')}>{tr('portfolio.portfolio_documents_page.my_documents', 'My documents')}</Link></DropdownMenuItem>
      <DropdownMenuItem asChild className="rounded-xl px-3 py-2"><Link href={getUriWithOrg(orgslug, routePaths.owner.account.root())}>{tr('portfolio.portfolio_v2.account_settings', 'Account settings')}</Link></DropdownMenuItem>
      {/* Phones have no side navigation, so feedback and sign out live here too. */}
      <DropdownMenuItem onSelect={() => openCandidatePanel('feedback')} className="rounded-xl px-3 py-2 md:hidden">{tr('portfolio.portfolio_v2.feedback', 'Feedback')}</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => signOut({ callbackUrl: '/' })} className="rounded-xl px-3 py-2 text-red-600 focus:text-red-600 md:hidden">{tr('portfolio.portfolio_v2.sign_out', 'Sign out')}</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
}

/** The welcome sheet shows once per browser, on a portfolio nothing has been unlocked on yet. */
const WELCOME_KEY = 'portfolio-welcome-seen'
let welcomeNow: boolean | undefined // read once per page load, so a second render (dev strict mode) gives the same answer
function firstWelcome() {
  if (typeof window === 'undefined') return false
  if (welcomeNow === undefined) {
    try { welcomeNow = !window.localStorage.getItem(WELCOME_KEY); window.localStorage.setItem(WELCOME_KEY, '1') } catch { welcomeNow = false }
  }
  return welcomeNow
}

export function PortfolioV2({ initialShell, orgslug, username, owner = false, preview = false }: { initialShell: Shell; orgslug: string; username?: string; owner?: boolean; preview?: boolean }) {
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const [shell, setShell] = useState(initialShell)
  const [profileOpen, setProfileOpen] = useState(false)
  const [highlightsOpen, setHighlightsOpen] = useState(false)
  const [avatarOpen, setAvatarOpen] = useState(false)
  const [linksOpen, setLinksOpen] = useState(false)
  const [resultEditor, setResultEditor] = useState<{ result?: PortfolioResult; kind?: PortfolioResult['kind']; template?: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const ask = useAsk()
  const router = useRouter()
  const [questOpen, setQuestOpen] = useState(true)
  const [questList, setQuestList] = useState(false)
  const [lookOpen, setLookOpen] = useState(false)
  const [featureOpen, setFeatureOpen] = useState(false)
  const { setTheme, resolvedTheme } = useTheme()
  const editing = owner && !preview
  const [welcomeOpen, setWelcomeOpen] = useState(() => editing && !(initialShell.progress?.seen || []).length && !initialShell.portfolio.published_at && firstWelcome())
  const layout: PortfolioLayout = shell.layout || { header: 'left', sections: 'grid' }
  const look = layout.look || null
  const accent = layout.accent || null
  const mode = modeOf(layout)
  // Visitors see it light or dark as the owner chose; "System" follows the visitor's device.
  const dark = mode === 'dark' || (mode === 'system' && resolvedTheme === 'dark')
  const bannerImage = layout.banner === 'image' && layout.banner_image ? normalizeMediaUrl(layout.banner_image.url) || layout.banner_image.url : ''
  const bannerCss = BANNERS.find((item) => item.id === layout.banner && item.id !== 'look')?.css
  // The learner's look themes the whole app; on another device it arrives with their portfolio.
  useEffect(() => {
    if (!owner || (!look && !accent) || (storedLook() === look && storedAccent() === accent)) return
    const newLook = storedLook() !== look
    applyLook(look, accent)
    if (newLook) setTheme(mode)
  }, [owner, look, accent, mode, setTheme])
  const centered = layout.header === 'center'
  const name = shell.identity?.shown_name || shell.portfolio.display_name || username || tr('lit.portfolio_v2.your_portfolio', 'Your portfolio')
  // Without a name the portfolio would be headed by the username, which can come from an email.
  const hasName = Boolean(shell.identity?.preferred_name || shell.identity?.first_name || shell.portfolio.display_name)
  const avatarUrl = shell.portfolio.avatar_image ? getUserAvatarMediaDirectory(shell.portfolio.user_uuid, shell.portfolio.avatar_image) : ''
  const now = (shell.timeline || []).find((entry) => entry.is_current)
  const nowLabel = now ? [now.title, now.organization].filter(Boolean).join(' at ') : ''
  const highlights = shell.highlights || []
  const published = Boolean(shell.portfolio.published_at)
  const resumeHref = getUriWithOrg(orgslug, owner ? '/portfolio/resume' : `/user/${username}/resume`)
  // Quests unlock sharing, then the résumé, then the mastery badge. Only the owner sees them.
  const stage = editing ? stageOf(shell) : null
  const past = (n: number) => !stage || stage.kind === 'mastered' || stage.quest.n > n
  const spots = stage && questOpen ? spotsFor(stage) : {}
  const spotLinks = stage && questOpen ? spotPaths(stage, shell) : {}
  const page = (path: string) => router.push(getUriWithOrg(orgslug, path))

  // A quest item opens where it's done; a dialog opened for one carries its "!" on the button that finishes it.
  const [mark, setMark] = useState<string>()
  function questItem(key: string) {
    const item = stage && stage.kind !== 'mastered' ? stage.quest.items.find((one) => one.key === key) : undefined
    if (!item) return
    const path = questPath(item, shell)
    if (path) return page(path)
    setMark(item.label)
    const go: Record<string, () => void> = {
      name: () => setProfileOpen(true), contact: () => setProfileOpen(true), photo: () => setAvatarOpen(true), links: () => setLinksOpen(true), skills: () => setResultEditor({ template: SKILLS_VALUES }),
      bio: () => document.querySelector('[aria-label="About me"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      proven: () => page(routePaths.org.discover()), look: () => setLookOpen(true),
      like: () => document.querySelector('[aria-label="What I’m like"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    }
    go[key]?.()
  }

  async function seeUnlock(quest: Quest, then?: () => unknown) {
    if (!token) return
    try {
      const { seen } = await markProgressSeen(quest.n, token)
      setShell((current) => ({ ...current, progress: { seen }, mastered: seen.includes(3) }))
      setQuestOpen(true); setQuestList(false)
      await then?.()
    } catch (error: any) { toast.error(error?.message || tr('portfolio.resume_builder.could_not_save_that', 'Could not save that')) }
  }

  const saves = useRef(0)
  async function changeLayout(next: LayoutChange) {
    if (!token) return
    const merged = { ...layout, ...next, accent: 'accent' in next ? next.accent || null : layout.accent }
    if (next.look || 'accent' in next) applyLook(merged.look || null, merged.accent)
    if (next.mode || (next.look && !layout.mode)) setTheme(modeOf(merged))
    const previous = shell
    const { banner_image_uuid: _photo, ...shown } = next // eslint-disable-line no-unused-vars
    setShell({ ...shell, layout: { ...layout, ...shown, accent: merged.accent } })
    // Only the latest answer replaces the layout, so quick changes in a row don't undo each other.
    const ticket = ++saves.current
    try { const saved = await updateMyLayout(next, token); if (ticket === saves.current) setShell((current) => ({ ...current, layout: saved.layout })) }
    catch (error: any) { if (ticket === saves.current) setShell(previous); toast.error(error?.message || tr('portfolio.portfolio_v2.could_not_change_the_layout', 'Could not change the layout')) }
  }

  async function publish() {
    if (!token) return
    setBusy(true)
    try { setShell(await publishMyPortfolio({ revision: shell.portfolio.revision, privacy_confirmed: true }, token)); toast.success(tr('portfolio.portfolio_v2.your_portfolio_is_public', 'Your portfolio is public')) }
    catch (error: any) { toast.error(error?.message || tr('portfolio.portfolio_v2.could_not_make_your_portfolio', 'Could not make your portfolio public')) } finally { setBusy(false) }
  }

  async function setConnect(on: boolean) {
    if (!token) return
    setShell((current) => ({ ...current, connect_requests: on }))
    try {
      await updateConnectRequests(on, token)
      toast.success(on ? tr('portfolio.portfolio_v2.people_can_ask_to_connect', 'People can ask to connect') : tr('portfolio.portfolio_v2.requests_to_connect_are_off', 'Requests to connect are off'))
    } catch (error: any) {
      setShell((current) => ({ ...current, connect_requests: !on }))
      toast.error(error?.message || tr('portfolio.portfolio_v2.that_didn_t_save', 'That didn’t save'))
    }
  }

  async function unpublish() {
    if (!token || !(await ask.confirm({ title: tr('portfolio.portfolio_v2.make_your_portfolio_private', 'Make your portfolio private?'), body: tr('lit.portfolio_v2.only_you_and_the_people', 'Only you and the people you added will see it. You can make it public again later.'), action: tr('lit.portfolio_v2.make_private', 'Make private') }))) return
    setBusy(true)
    try { setShell(await unpublishMyPortfolio(shell.portfolio.revision, token)); toast.success(tr('portfolio.portfolio_v2.your_portfolio_is_private', 'Your portfolio is private')) }
    catch (error: any) { toast.error(error?.message || tr('portfolio.portfolio_v2.could_not_make_your_portfolio_2', 'Could not make your portfolio private')) } finally { setBusy(false) }
  }

  async function saveAvatar(asset: MediaAsset) {
    if (!token) return
    const user = await applyMediaAssetToUserAvatar(asset.asset_uuid, token)
    setShell((current) => ({ ...current, portfolio: { ...current.portfolio, avatar_image: user.avatar_image || asset.url } }))
    setAvatarOpen(false)
    toast.success(tr('portfolio.portfolio_v2.photo_updated', 'Photo updated'))
  }

  // ── The section stack: the learner's own, or the look's suggestion. Sections with nothing to show are left out. ──
  const lookId = lookOf(layout)
  const choices = featureChoices(shell, orgslug, owner, username)
  const slides = resolveFeatures(layout.features || [], choices)
  const present = (type: SectionType) => type === 'feature' ? slides.length > 0 : hasSection(type, shell, editing)
  const stored: Row[] = layout.stack ? copyRows(layout.stack) : suggested(lookId)
  const rows = visibleRows(stored, present)
  const custom = Boolean(layout.stack)
  const titleOf = (type: SectionType) => layout.names?.[type] || LOOK_NAMES[lookId][type]
  const saveStack = (next: Row[]) => { const clean = norm(copyRows(next)); void changeLayout({ stack: sameRows(clean, suggested(lookId)) ? null : clean }) }
  const onMove = (next: Row[]) => saveStack(mergeHidden(next, stored, present))
  const removeSection = (type: SectionType) => type === 'feature' ? void changeLayout({ features: [] }) : saveStack(stored.map((row) => row.filter((item) => item.type !== type)))
  const addSection = (type: SectionType) => {
    if (type === 'feature') { setFeatureOpen(true); return }
    saveStack([...stored, [{ type, u: 6 }]])
    window.setTimeout(() => document.querySelector(`[data-sec="${type}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120)
  }
  const changeFeatures = (features: NonNullable<LayoutChange['features']>) => {
    // The first thing featured brings the section back, at the top if the learner's own stack had taken it out.
    const stack = features.length && custom && !stored.some((row) => row.some((item) => item.type === 'feature')) ? norm([[{ type: 'feature', u: 6 }], ...stored]) : undefined
    void changeLayout({ features, ...(stack ? { stack } : {}) })
  }
  const rename = (type: SectionType) => (value: string) => {
    const names = { ...(layout.names || {}) }
    if (!value || value === LOOK_NAMES[lookId][type]) delete names[type]; else names[type] = value.slice(0, 40)
    void changeLayout({ names })
  }
  const setHeights = (types: SectionType[], px: number, phone: boolean) => {
    const key = phone ? `${lookId}:phone` : lookId
    const heights = { ...(layout.heights || {}), [key]: { ...(layout.heights?.[key] || {}) } }
    types.forEach((type) => { heights[key][type] = px })
    void changeLayout({ heights })
  }
  const addable = ALL_SECTIONS.filter((type) => type === 'feature' ? !slides.length : !stored.some((row) => row.some((item) => item.type === type)))
  // Bio and experience are always on the page; the rest can be taken out (and come back from the adds below).
  const controls = (type: SectionType) => REQUIRED.includes(type) ? null
    : <button type="button" data-sec-tool onClick={() => removeSection(type)} aria-label={tr('portfolio.portfolio_v2.take_out_titleof', 'Take out {{titleOf}}', { titleOf: titleOf(type) })} title={tr('portfolio.portfolio_v2.take_this_section_out', 'Take this section out')} className="relative z-[2] grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-raised hover:text-foreground"><X className="h-4 w-4" /></button>
  // One click from the page: each section's pencil opens what edits it.
  const edits: Partial<Record<SectionType, () => void>> = {
    feature: () => setFeatureOpen(true), highlights: () => setHighlightsOpen(true),
    about: () => document.querySelector<HTMLElement>('[data-sec="about"] [data-bio-start]')?.click(),
    experience: () => page('/portfolio/timeline'), projects: () => page('/portfolio/projects'), credentials: () => page('/portfolio/badges'),
    results: () => page('/portfolio/results'), people: () => page('/portfolio/people'), headed: () => page('/plans'),
  }
  const tileProps = { spots, spotLinks, shell, setShell, owner: editing, orgslug, username, token, onEditLinks: () => setLinksOpen(true), onEditResult: (result?: PortfolioResult) => setResultEditor({ result }) }
  const renderSection = (type: SectionType) => {
    if (type === 'feature') return <div className="relative flex min-w-0 flex-col [&>*]:flex-1" data-feature-wrap><SectionTools section="feature" label={titleOf('feature')} /><FeatureSection slides={slides} autoplay={Boolean(layout.feature_autoplay)} /></div>
    // Empty highlights on the page is a section like the others, with its add inside.
    if (type === 'highlights' && !highlights.length) return <Tile section="highlights" color="violet" icon={Trophy} title={tr('portfolio.portfolio_dialogs.highlights', 'Highlights')} wide>
      <EmptyAdd title={tr('portfolio.portfolio_v2.add_highlights', 'Add highlights')} hint={tr('portfolio.portfolio_v2.the_numbers_people_notice_first', 'The numbers people notice first, like hours worked, a GPA or a win')} onClick={() => setHighlightsOpen(true)} />
    </Tile>
    if (type === 'highlights') return <div className="group relative flex min-w-0 flex-col" data-highlights-section>
      <SectionTools section="highlights" label={titleOf('highlights')} />
      {highlights.length ? <section aria-label={tr('portfolio.portfolio_dialogs.highlights', 'Highlights')} className="@container relative grid grid-cols-2 gap-3 @md:grid-cols-[repeat(auto-fit,minmax(140px,1fr))]">
        {highlights.map((item, index) => <div key={index} data-item data-highlight className="min-w-0 rounded-2xl border-2 border-border bg-card px-4 py-3 shadow-[0_4px_0_hsl(var(--border))]"><b className="block truncate text-[21px] font-extrabold leading-[1.1] tabular-nums">{item.value}</b><span className="mt-0.5 block text-[13px] font-semibold text-muted-foreground">{item.label}</span></div>)}
      </section> : <EmptyAdd title={tr('portfolio.portfolio_v2.add_highlights', 'Add highlights')} hint={tr('portfolio.portfolio_v2.the_numbers_people_notice_first', 'The numbers people notice first, like hours worked, a GPA or a win')} onClick={() => setHighlightsOpen(true)} />}
    </div>
    return TILE_SECTIONS[type]?.(tileProps) ?? null
  }

  const questButton = stage ? <QuestButton stage={stage} open={questOpen} onToggle={() => setQuestOpen(!questOpen)} /> : null
  const ownerActions = <>
    {/* Adding happens in each section; the row's first action brings in what the learner already has. */}
    <Button asChild variant="brand" className="h-10 flex-1 px-3 sm:flex-none sm:px-4"><Link prefetch={false} href={getUriWithOrg(orgslug, '/portfolio/import')}><Download className="h-4 w-4" />{tr('portfolio.portfolio_v2.import_from', 'Import from…')}</Link></Button>
    {!past(1) ? questButton : shell.portfolio.email_verified === false && !published
      ? <VerificationMenu email={shell.portfolio.email} token={token} setShell={setShell} onPublish={publish} busy={busy} />
      : <PortfolioShareButton orgslug={orgslug} username={username} displayName={name} published={published} onPublish={publish} busy={busy} className="h-10 flex-1 px-3 text-sm sm:flex-none sm:px-4" />}
    {!past(1) ? null : !past(2) ? questButton : <Button asChild variant="surface" className="h-10 flex-1 px-3 sm:flex-none sm:px-4"><Link href={resumeHref}><FileText className="h-4 w-4" />{tr('portfolio.resume_builder.r_sum', 'Résumé')}</Link></Button>}
    {past(2) ? questButton : null}
    <Button asChild variant="surface" size="icon" className="h-10 w-10 shrink-0" aria-label={tr('portfolio.portfolio_v2.preview_as_a_visitor', 'Preview as a visitor')} title={tr('portfolio.portfolio_v2.preview_as_a_visitor', 'Preview as a visitor')}><Link href={getUriWithOrg(orgslug, '/portfolio/preview')}><Eye className="h-4 w-4" /></Link></Button>
  </>

  // Professional puts the header in a column beside everything else.
  const side = lookId === 'professional'
  const cornerFor = (onBanner: boolean) => <SettingsMenu orgslug={orgslug} className={cornerClass(onBanner)} spot={spots.settings} onLook={() => setLookOpen(true)} onUnpublish={published ? unpublish : undefined} connect={Boolean(shell.connect_requests)} onConnect={setConnect} />
  const quest = stage && questOpen ? <QuestBanner stage={stage} list={questList} onList={() => setQuestList(!questList)} busy={busy}
    onClose={() => stage.kind === 'unlocked' ? void seeUnlock(stage.quest) : setQuestOpen(false)} onItem={questItem}
    onUnlock={(next) => seeUnlock(next, next.n === 1 ? publish : next.n === 2 ? () => router.push(resumeHref) : undefined)} /> : null
  const ADD_HINTS: Record<SectionType, string> = {
    highlights: tr('lit.portfolio_v2.the_numbers_people_notice_first', 'The numbers people notice first, like hours worked, a GPA or a win'), feature: tr('lit.portfolio_v2.put_a_project_a_quote', 'Put a project, a quote or a link up top'),
    about: 'A few lines about you', experience: tr('lit.portfolio_v2.jobs_volunteering_teams_and_clubs', 'Jobs, volunteering, teams and clubs'), projects: tr('lit.portfolio_v2.things_you_made_with_a', 'Things you made, with a photo and a line'),
    credentials: tr('lit.portfolio_v2.cards_certificates_and_badges', 'Cards, certificates and badges'), results: tr('lit.portfolio_v2.quiz_and_test_results_that', 'Quiz and test results that say what you’re like'), headed: tr('lit.portfolio_v2.where_you_are_now_and', 'Where you are now, and what’s next'),
    people: tr('lit.portfolio_v2.quotes_from_people_who_know', 'Quotes from people who know your work'),
  }
  const header = <PortfolioHeader look={lookId} name={name} hasName={hasName} avatarUrl={avatarUrl} headline={shell.portfolio.headline} now={nowLabel} place={shell.portfolio.location_label || ''}
    socials={shellSocials(shell)} spots={spots} editing={editing} centered={centered} onProfile={() => setProfileOpen(true)}
    banner={{ image: bannerImage, css: bannerCss, fallback: look || accent ? 'bg-[linear-gradient(120deg,var(--look-a),var(--look-b)_60%,var(--look-c))]' : 'bg-[linear-gradient(120deg,color-mix(in_srgb,var(--org-primary-color)_90%,#000),color-mix(in_srgb,var(--org-primary-color)_55%,#EC4F9A)_55%,#F5A524)]' }}
    marks={<>{shell.mastered ? <MasteryBadge /> : null}{editing ? <span data-pf-chip className="inline-flex h-7 items-center gap-1 rounded-full bg-muted px-2.5 text-xs font-bold text-muted-foreground">{published ? <Globe2 className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}{published ? tr('portfolio.portfolio_v2.public', 'Public') : tr('portfolio.portfolio_v2.private', 'Private')}</span> : null}</>}
    corner={editing && !side ? cornerFor : undefined}
    actions={editing ? ownerActions : !owner ? <>
      {/* The résumé is the learner's to unlock first; until then visitors don't get one. */}
      {shell.resume_unlocked ? <Button asChild variant="brand" className="h-10"><Link href={resumeHref}><FileText className="h-4 w-4" />{tr('portfolio.resume_builder.r_sum', 'Résumé')}</Link></Button> : null}
      {username ? <PortfolioVisitorBar orgslug={orgslug} username={username} token={token} shell={shell} /> : null}
    </> : null} />

  // Visitors see the portfolio in its owner's look, whatever theme they use.
  return <main className={`min-h-screen bg-background pb-20 text-foreground ${look && dark ? 'dark' : ''}`} data-portfolio-v2 data-look={look || undefined} data-accent={accent ? '' : undefined} style={accentVars(accent) as CSSProperties}>
    {owner ? ask.dialog : null}
    {preview ? <div className="border-b border-border px-4 py-3"><div className="mx-auto flex max-w-[960px] flex-wrap items-center justify-between gap-3">
      <div><b className="text-sm font-extrabold">{tr('portfolio.portfolio_v2.visitor_preview', 'Visitor preview')}</b><p className="text-xs text-muted-foreground">{tr('portfolio.portfolio_v2.this_is_how_people_see', 'This is how people see your portfolio')}{published ? '' : tr('portfolio.portfolio_v2.once_it_s_public', ' once it’s public')}.</p></div>
      <Button asChild variant="surface" size="sm"><Link href={getUriWithOrg(orgslug, '/portfolio')}><ArrowLeft className="h-4 w-4" />{tr('portfolio.portfolio_v2.back_to_editing', 'Back to editing')}</Link></Button>
    </div></div> : null}
    <div className={`mx-auto px-4 pt-4 sm:px-6 sm:pt-6 ${side ? 'max-w-[1140px] md:grid md:grid-cols-[290px_minmax(0,1fr)] md:items-start md:gap-7' : 'max-w-[960px]'}`}>
      {side && editing ? <div className="mb-3 flex flex-wrap justify-end gap-1.5 md:hidden">{cornerFor(false)}</div> : null}
      {/* Professional's column: the profile, then the quest under it, so its arrow points up at its button. */}
      {side ? <div className={`grid min-w-0 content-start ${questList ? '' : 'md:sticky md:top-4'}`}>{header}{quest}</div> : header}
      <div className="min-w-0 max-md:mt-2">
        {/* Professional's corner sits over the stack: still the page's top right. */}
        {side && editing ? <div className="relative mb-3 flex flex-wrap justify-end gap-1.5 max-md:hidden">{cornerFor(false)}{spots.settings ? <SpotTip label={spots.settings} className="absolute right-0 top-[40px]" /> : null}</div> : null}
      {side ? null : quest}

      <div className="mt-[22px]" data-layout="stack">
        <SectionStack look={lookId} rows={rows} editing={editing} render={renderSection} onMove={onMove} onHeight={setHeights}
          heightOf={(type, phone) => layout.heights?.[phone ? `${lookId}:phone` : lookId]?.[type] || null}
          context={(type) => ({ editing, look: lookId, title: titleOf(type), rename: rename(type), controls: controls(type), edit: editing ? edits[type] : undefined })} />
      </div>
      {/* Sections not on the page come back from here, each drawn like any empty section's add. */}
      {editing && addable.length ? <section aria-label={tr('portfolio.portfolio_v2.add_a_section', 'Add a section')} className="mt-[var(--stack-gy,16px)] grid gap-3 sm:grid-cols-2">
        {addable.map((type) => <EmptyAdd key={type} title={`Add ${(layout.names?.[type] || LOOK_NAMES[lookId][type] || SECTION_LABELS[type]).toLowerCase()}`} hint={ADD_HINTS[type]} onClick={() => addSection(type)} />)}
      </section> : null}
      </div>
    </div>
    {editing ? <>
      <ProfileDialog mark={mark} open={profileOpen} onOpenChange={(open) => { setProfileOpen(open); if (!open) setMark(undefined) }} shell={shell} setShell={setShell} token={token} avatar={<Avatar url={avatarUrl} name={name} size="h-20 w-20 text-[28px] border-0" />} onAvatarClick={() => setAvatarOpen(true)} />
      <ResultDialog key={resultEditor?.result?.result_uuid || `new-${resultEditor?.template || resultEditor?.kind || ''}`} open={Boolean(resultEditor)} onOpenChange={(open) => { if (!open) setResultEditor(null) }} result={resultEditor?.result} kind={resultEditor?.kind} template={resultEditor?.template} token={token} onSaved={async () => { setResultEditor(null); if (token) setShell(await getMyPortfolio(token)) }} />
      <LookDialog open={lookOpen} onOpenChange={setLookOpen} layout={layout} onSuggested={custom ? () => void changeLayout({ stack: null, heights: Object.fromEntries(Object.entries(layout.heights || {}).filter(([key]) => key.split(':')[0] !== lookId)) }) : undefined} mode={mode} dark={dark} onChange={(next) => void changeLayout(next)} spot={spots.settings} userId={Number(shell.portfolio.user_id)} token={token} />
      <WelcomeDialog open={welcomeOpen} onOpenChange={setWelcomeOpen} onStart={() => { setWelcomeOpen(false); setQuestOpen(true); setQuestList(true) }} />
      <LinksDialog mark={mark} open={linksOpen} onOpenChange={(open) => { setLinksOpen(open); if (!open) setMark(undefined) }} shell={shell} setShell={setShell} token={token} />
      <FeatureDialog open={featureOpen} onOpenChange={setFeatureOpen} items={layout.features || []} autoplay={Boolean(layout.feature_autoplay)} choices={choices} onChange={changeFeatures} onAutoplay={(on) => void changeLayout({ feature_autoplay: on })} />
      <HighlightsDialog open={highlightsOpen} onOpenChange={setHighlightsOpen} shell={shell} setShell={setShell} token={token} />
      <MediaPickerDialog open={avatarOpen} onOpenChange={setAvatarOpen} title={tr('portfolio.look_dialog.your_photo', 'Your photo')} description={tr('portfolio.credential_dialog.upload_a_photo_or_choose', 'Upload a photo or choose one from your media library.')} owner={{ type: 'user', id: Number(shell.portfolio.user_id) }} mediaType="image" accessToken={token} onSave={saveAvatar} />
    </> : null}
  </main>
}
