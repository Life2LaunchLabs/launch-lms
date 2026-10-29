'use client'

import Link from 'next/link'
import { BriefcaseBusiness, EyeOff, FolderOpen, GraduationCap, IdCard, Link2, ShieldCheck, Sparkles, User, Users } from 'lucide-react'

import { BadgeMedal } from '@components/Badges/BadgeMedal'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { normalizeMediaUrl } from '@services/media/media'
import { AboutSection } from '../PortfolioOverview'
import { SOCIAL_OPTIONS, socialHandle, shellSocials } from '../PortfolioHeaderParts'
import { timelineDateLabel, timelineTypeLabels, type TimelineEntry } from '../Timeline'
import { Cover, EmptyAdd, PALETTE, PersonDot, Tile, colorFor } from './parts'
import type { Credential, PortfolioBadge, PortfolioResult, Project, Quote, SetShell, Shell } from '../portfolioTypes'

// The front page sections, in the prototype's order. "Where I'm headed" comes with the plans redesign.

// eslint-disable-next-line no-unused-vars
type EditResult = (result?: PortfolioResult) => void
type TileProps = { shell: Shell; setShell: SetShell; owner: boolean; orgslug: string; username?: string; token?: string; onEditLinks?: () => void; onEditResult?: EditResult }

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const featuredFirst = <T extends { featured?: boolean }>(items: T[]) => [...items].sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)))

function AboutTile({ shell, setShell, owner, token, onEditLinks }: TileProps) {
  const socials = shellSocials(shell)
  if (!owner && !shell.portfolio.short_bio && !socials.length) return null
  return <Tile color="amber" icon={User} title="About me" wide>
    <div className="grid gap-5 md:grid-cols-2">
      <AboutSection shell={shell} setShell={setShell} owner={owner} token={token} />
      <div className="grid content-start gap-1.5">
        {socials.length ? <ul className="grid gap-1.5" aria-label="Links">{socials.map((social) => <li key={social.type}>
          <a href={/^https?:\/\//i.test(social.url) ? social.url : `https://${social.url}`} target="_blank" rel="noreferrer" className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2 rounded-[10px] bg-muted px-2.5 py-2 text-[13.5px] transition hover:bg-raised">
            <Link2 className="h-4 w-4 text-muted-foreground" /><b className="truncate font-extrabold">{socialHandle(social.type, social.url) || social.url}</b><small className="text-xs font-semibold text-muted-foreground">{SOCIAL_OPTIONS.find((option) => option.type === social.type)?.label || social.type}</small>
          </a>
        </li>)}</ul> : null}
        {owner && onEditLinks ? <button type="button" onClick={onEditLinks} className="inline-flex w-fit items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-bold text-muted-foreground transition hover:bg-raised hover:text-foreground"><Link2 className="h-3.5 w-3.5" />{socials.length ? 'Edit links' : 'Add links'}</button> : null}
      </div>
    </div>
  </Tile>
}

function ExperienceTile({ shell, owner, orgslug, username }: TileProps) {
  const entries = featuredFirst(shell.timeline || [])
  if (!owner && !entries.length) return null
  const href = (entry: TimelineEntry) => getUriWithOrg(orgslug, owner ? `/portfolio/timeline/${entry.timeline_uuid}` : `/user/${username}/timeline/${entry.slug}`)
  return <Tile color="teal" icon={BriefcaseBusiness} title="Experience" count={entries.length || null} href={getUriWithOrg(orgslug, owner ? '/portfolio/timeline' : `/user/${username}/timeline`)} wide>
    {entries.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{entries.slice(0, 4).map((entry) => <Link key={entry.timeline_uuid} href={href(entry)} className="group/item grid min-w-0 content-start gap-1">
      <div className="relative mb-1 aspect-[4/3] overflow-hidden rounded-xl transition group-hover/item:-translate-y-0.5">
        <Cover url={entry.cover_url ? normalizeMediaUrl(entry.cover_url) : ''} seed={entry.timeline_uuid} label={timelineTypeLabels[entry.entry_type]} />
        {entry.is_current ? <span className="absolute right-2 top-2 rounded-full bg-[#0B7D73] px-2 py-0.5 text-[11px] font-extrabold text-white">Now</span> : null}
      </div>
      <b className="line-clamp-2 text-[13.5px] font-extrabold leading-tight">{entry.title}</b>
      <small className="truncate text-xs font-semibold text-muted-foreground">{entry.organization}</small>
      <small className="truncate text-xs font-semibold text-muted-foreground">{timelineDateLabel(entry)}</small>
    </Link>)}</div> : <EmptyAdd title="Add where you are right now" hint="School, a job, a team or a club. Start with one." href={getUriWithOrg(orgslug, '/portfolio/timeline/new')} />}
  </Tile>
}

function ProjectsTile({ shell, owner, orgslug, username }: TileProps) {
  const projects = featuredFirst(shell.projects || [])
  if (!owner && !projects.length) return null
  const href = (project: Project) => getUriWithOrg(orgslug, owner ? `/portfolio/projects/${project.project_uuid}` : `/user/${username}/projects/${project.slug}`)
  return <Tile color="pink" icon={FolderOpen} title="Projects" count={projects.length || null} href={getUriWithOrg(orgslug, owner ? '/portfolio/projects' : `/user/${username}/projects`)}>
    {projects.length ? <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-[repeat(auto-fill,minmax(120px,1fr))]">{projects.slice(0, 3).map((project) => <Link key={project.project_uuid} href={href(project)} className="group/item grid min-w-0 content-start gap-1.5">
      <div className="aspect-[4/5] overflow-hidden rounded-2xl transition group-hover/item:-translate-y-0.5"><Cover url={project.cover_url ? normalizeMediaUrl(project.cover_url) : ''} seed={project.project_uuid} /></div>
      <b className="line-clamp-2 text-[12.5px] font-extrabold leading-tight">{project.title}</b>
    </Link>)}</div> : <EmptyAdd title="Add something you made" hint="Art, video, code, a build. A photo and a line is enough." href={getUriWithOrg(orgslug, routePaths.org.portfolioProjectsNew())} />}
  </Tile>
}

export function CredentialFace({ credential }: { credential: Credential }) {
  if (credential.photo_url) return <span className="block aspect-[1.586] w-full overflow-hidden rounded-[10px]"><img src={normalizeMediaUrl(credential.photo_url)} alt="" className="h-full w-full object-cover" /></span>
  const diploma = credential.kind === 'diploma'
  const [face, edge] = PALETTE[colorFor(credential.name)]
  const Icon = diploma ? GraduationCap : credential.kind === 'card' ? IdCard : ShieldCheck
  return <span className={`relative grid aspect-[1.586] w-full content-between overflow-hidden rounded-[10px] p-2 text-left text-[9.5px] font-extrabold ${diploma ? 'bg-[#fbf5e6] text-[#5a3d12]' : 'text-white'}`} style={diploma ? undefined : { background: `linear-gradient(135deg, ${face}, ${edge})` }}>
    <Icon className="h-3.5 w-3.5" /><span>{diploma ? (credential.issued_on ? 'Diploma' : 'In progress') : credential.verification_status === 'photo_on_file' ? 'Photo on file' : ''}</span>
  </span>
}

function CredentialsTile({ shell, owner, orgslug, username }: TileProps) {
  const badges: PortfolioBadge[] = shell.badges?.featured?.length ? shell.badges.featured : shell.badges?.earned || []
  const credentials = featuredFirst((shell.credentials || []).filter((item) => item.kind !== 'test_score'))
  if (!owner && !badges.length && !credentials.length) return null
  const items = [...credentials.filter((item) => item.featured), ...badges.map((badge) => ({ badge })), ...credentials.filter((item) => !item.featured)].slice(0, 6)
  const total = (shell.badges?.earned?.length || 0) + credentials.length
  return <Tile color="blue" icon={ShieldCheck} title="Credentials & badges" count={total || null} href={getUriWithOrg(orgslug, owner ? '/portfolio/badges' : `/user/${username}/badges`)}>
    {items.length ? <div className="grid grid-cols-3 gap-x-2.5 gap-y-3 sm:grid-cols-[repeat(auto-fill,minmax(110px,1fr))]">{items.map((item) => 'badge' in item
      ? <Link key={item.badge.award_uuid} href={getUriWithOrg(orgslug, routePaths.org.badgeAward(item.badge.code))} className="grid min-w-0 justify-items-center gap-1.5 text-center"><BadgeMedal badge={{ image_url: normalizeMediaUrl(item.badge.image_url || '') || '', icon: item.badge.icon, color: item.badge.color }} size={56} /><b className="line-clamp-2 text-xs font-bold leading-tight">{item.badge.name}</b></Link>
      : <div key={item.credential_uuid} className="grid min-w-0 justify-items-center gap-1.5 text-center"><CredentialFace credential={item} /><b className="line-clamp-2 text-xs font-bold leading-tight">{item.name}</b></div>)}
    </div> : null}
    {owner && !credentials.length ? <EmptyAdd title="Add a card or diploma" hint="Food handler, CPR, a diploma…" href={`${getUriWithOrg(orgslug, '/portfolio/badges')}?add=credential`} /> : null}
  </Tile>
}

function ResultsTile({ shell, owner, onEditResult }: TileProps) {
  const items = featuredFirst(shell.results || [])
  if (!owner && !items.length) return null
  return <Tile color="violet" icon={Sparkles} title="What I’m like" count={items.length || null}>
    {items.length ? <ul className="grid gap-2.5">{items.slice(0, 4).map((item) => <li key={item.result_uuid} className={`min-w-0 ${item.visibility === 'private' ? 'opacity-55' : ''}`}>
      {owner && onEditResult ? <button type="button" onClick={() => onEditResult(item)} className="w-full rounded-xl text-left hover:bg-muted/60"><ResultLine result={item} /></button> : <ResultLine result={item} />}
    </li>)}</ul> : null}
    {owner && onEditResult ? items.length ? <button type="button" onClick={() => onEditResult()} className="w-fit rounded-lg px-2 py-1 text-sm font-bold text-muted-foreground hover:bg-raised hover:text-foreground">Add another</button>
      : <EmptyAdd title="Add what you’ve learned about yourself" hint="Your interest type, strengths or work values" onClick={() => onEditResult()} /> : null}
  </Tile>
}

function ResultLine({ result }: { result: PortfolioResult }) {
  return <span className="block px-1 py-0.5"><span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">{result.name}{result.visibility === 'private' ? <EyeOff className="h-3 w-3" aria-label="Hidden from visitors" /> : null}</span><b className="block text-[17px] font-extrabold leading-snug">{result.summary || result.name}</b></span>
}

function QuoteCard({ quote }: { quote: Quote }) {
  return <figure className="grid min-w-0 content-start gap-2.5">
    <blockquote className="text-[15px] font-semibold leading-normal">“{quote.body}”</blockquote>
    <figcaption className="flex min-w-0 items-center gap-2"><PersonDot name={quote.name} /><span className="min-w-0"><b className="block truncate text-sm font-extrabold">{quote.name}</b><small className="block truncate text-xs font-semibold text-muted-foreground">{quote.role_label}</small></span></figcaption>
  </figure>
}

function PeopleTile({ shell, owner, orgslug, wide = true }: TileProps & { wide?: boolean }) {
  const quotes = featuredFirst(shell.quotes || []).filter((quote) => quote.body && quote.status !== 'requested').slice(0, 2)
  const people = shell.contacts || []
  if (!owner && !quotes.length) return null
  return <Tile color="orange" icon={Users} title={owner ? 'My people' : 'What people say'} count={owner ? people.length || null : null} href={owner ? getUriWithOrg(orgslug, '/portfolio/people') : undefined} wide={wide}>
    {owner && people.length ? <div className="flex items-center gap-3">
      <span className="flex">{people.slice(0, 5).map((person, index) => <span key={person.contact_uuid} className={index ? '-ml-2.5' : ''}><PersonDot name={person.name} className="h-8 w-8 border-2 border-card text-[11px]" /></span>)}</span>
      <span><b className="block text-sm font-extrabold">{people.length} {people.length === 1 ? 'person' : 'people'} in your corner</b><small className="block text-[12.5px] font-semibold text-muted-foreground">{count((shell.quotes || []).length, 'quote')} · {count(people.filter((person) => person.is_reference).length, 'reference')}</small></span>
    </div> : null}
    {quotes.length ? <div className="grid gap-3.5 sm:grid-cols-2">{quotes.map((quote) => <QuoteCard key={quote.quote_uuid} quote={quote} />)}</div>
      : owner ? <EmptyAdd title="Ask someone for a quote" hint="A boss, coach or teacher. They don’t need an account." href={getUriWithOrg(orgslug, '/portfolio/people')} /> : null}
  </Tile>
}

/** The tiles in order. A visitor doesn't see a section with nothing in it. */
export function PortfolioTiles(props: TileProps) {
  // "What I'm like" pairs with My people; without it, My people takes the whole row.
  const results = props.owner || Boolean(props.shell.results?.length)
  return <>
    <AboutTile {...props} />
    <ExperienceTile {...props} />
    <ProjectsTile {...props} />
    <CredentialsTile {...props} />
    <ResultsTile {...props} />
    <PeopleTile {...props} wide={!results} />
  </>
}
