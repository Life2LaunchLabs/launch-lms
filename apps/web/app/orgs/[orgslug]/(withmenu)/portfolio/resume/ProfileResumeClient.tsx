'use client'

import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react'
import Link from 'next/link'
import { toast } from 'react-hot-toast'
import {
  ArrowLeft,
  Award,
  Briefcase,
  Edit3,
  GraduationCap,
  Globe,
  Instagram,
  Link as LinkIcon,
  Linkedin,
  Mail,
  User,
  Youtube,
} from 'lucide-react'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Textarea } from '@components/ui/textarea'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { updateProfile } from '@services/settings/portfolio'
import {
  normalizeAchievements as normalizeBadgeAchievements,
  useFeaturedBadges,
} from '@components/Objects/Portfolio/ProfileAchievements'
import ContentPageHeader from '@components/Objects/StyledElements/Headers/ContentPageHeader'
import ResumePrintButton from './ResumePrintButton'

type ResumeTimelineEntry = {
  id: string
  category: 'work' | 'education' | 'life'
  title: string
  description?: string
  startDate: string
  endDate?: string
  isOngoing?: boolean
  employer?: string
  institution?: string
}

type ResumeFeaturedCard = {
  id: string
  slug: string
  title: string
  body?: string
  actionUrl?: string
}

type ProfileResumeClientProps = {
  initialUser: any
  orgslug: string
  accessToken?: string
  mode: 'owner' | 'public'
  profileUsername?: string
}

type EditableTextProps = {
  value: string
  canEdit: boolean
  className?: string
  placeholder?: string
  multiline?: boolean
  // eslint-disable-next-line no-unused-vars
  onSave: (value: string) => void
}

const SOCIAL_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  website: Globe,
  linkedin: Linkedin,
  instagram: Instagram,
  youtube: Youtube,
  x: LinkIcon,
}

function parseProfileValue(profile: any) {
  if (!profile) return {}
  if (typeof profile === 'string') {
    try {
      return JSON.parse(profile)
    } catch {
      return {}
    }
  }
  return { ...profile }
}

function normalizeTimeline(timeline: any): ResumeTimelineEntry[] {
  if (!Array.isArray(timeline)) return []
  return timeline
    .map((entry: any) => ({
      id: entry.id || `${entry.category || 'timeline'}-${entry.startDate || Math.random()}`,
      category: entry.category === 'education' || entry.category === 'life' ? entry.category : 'work',
      title: entry.title || '',
      description: entry.description || '',
      startDate: typeof entry.startDate === 'string' ? entry.startDate : '',
      endDate: typeof entry.endDate === 'string' ? entry.endDate : '',
      isOngoing: Boolean(entry.isOngoing),
      employer: entry.employer || '',
      institution: entry.institution || '',
    }))
    .filter((entry) => entry.title || entry.startDate)
    .sort((a, b) => b.startDate.localeCompare(a.startDate))
}

function normalizeFeatured(featured: any): ResumeFeaturedCard[] {
  if (!Array.isArray(featured?.cards)) return []
  return featured.cards
    .map((card: any) => ({
      id: card.id || `${card.title || 'project'}-${Math.random()}`,
      slug: card.slug || card.id || '',
      title: card.title || '',
      body: card.body || card.subtext || '',
      actionUrl: card.actionUrl || card.url || '',
    }))
    .filter((card: ResumeFeaturedCard) => card.title || card.body)
}

function formatMonth(value?: string) {
  if (!value) return ''
  const match = /^(\d{4})-(\d{2})/.exec(value)
  if (!match) return value
  const year = Number(match[1])
  const month = Number(match[2])
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(new Date(year, month - 1, 1))
}

function formatDateRange(entry: ResumeTimelineEntry) {
  const start = formatMonth(entry.startDate)
  const end = entry.isOngoing ? 'Present' : formatMonth(entry.endDate)
  if (start && end) return `${start} - ${end}`
  return start || end
}

function formatCredentialDate(value?: string) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(parsed)
}

function getTimelineDetailKey(entry: ResumeTimelineEntry) {
  if (entry.category === 'education') return 'institution'
  if (entry.category === 'work') return 'employer'
  return null
}

function EditableText({ value, canEdit, className = '', placeholder = '', multiline = false, onSave }: EditableTextProps) {
  const [draft, setDraft] = useState(value)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    setDraft(value)
  }, [value])

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea || !multiline) return
    textarea.style.height = 'auto'
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [draft, multiline])

  if (!canEdit) {
    return value ? <span className={className}>{value}</span> : null
  }

  const sharedClassName = [
    'resume-editable h-auto min-h-0 w-full border-0 bg-transparent p-0 leading-[inherit] shadow-none outline-none ring-0 focus-visible:ring-0 focus-visible:ring-offset-0',
    className,
  ].join(' ')

  const save = () => {
    const nextValue = draft.trim()
    if (nextValue !== value) onSave(nextValue)
  }

  if (multiline) {
    return (
      <Textarea
        ref={textareaRef}
        value={draft}
        placeholder={placeholder}
        rows={Math.max(1, draft.split('\n').length)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={save}
        className={`${sharedClassName} resize-none overflow-hidden`}
      />
    )
  }

  return (
    <Input
      value={draft}
      placeholder={placeholder}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={save}
      className={sharedClassName}
    />
  )
}

const ResumeSection = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="break-inside-avoid">
    <h2 className="border-b border-border pb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
      {title}
    </h2>
    <div className="mt-3 space-y-4">{children}</div>
  </section>
)

export default function ProfileResumeClient({
  initialUser,
  orgslug,
  accessToken,
  mode,
  profileUsername,
}: ProfileResumeClientProps) {
  const session = useLHSession() as any
  const [user, setUser] = useState(initialUser)
  const [saving, setSaving] = useState(false)
  const canEdit = mode === 'owner' && Boolean(accessToken)
  const profile = useMemo(() => parseProfileValue(user.profile), [user.profile])
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || 'Resume'
  const socials = Array.isArray(profile.header?.socials) ? profile.header.socials.filter((social: any) => social?.url || canEdit) : []
  const timeline = normalizeTimeline(profile.timeline)
  const work = timeline.filter((entry) => entry.category === 'work')
  const education = timeline.filter((entry) => entry.category === 'education')
  const life = timeline.filter((entry) => entry.category === 'life')
  const badgeAchievements = useMemo(() => normalizeBadgeAchievements(profile.achievements), [profile.achievements])
  const { badges: featuredBadges } = useFeaturedBadges(badgeAchievements, orgslug)
  const featured = normalizeFeatured(profile.featured)

  const persistUser = async (nextUser: any) => {
    if (!accessToken || !canEdit) return
    setUser(nextUser)
    setSaving(true)
    try {
      const res = await updateProfile(nextUser, nextUser.id, accessToken)
      if (!res.success) throw new Error(res.HTTPmessage)
      setUser(res.data)
      await session?.update?.(true)
      toast.success('Resume saved')
    } catch {
      setUser(user)
      toast.error('Could not save resume')
    } finally {
      setSaving(false)
    }
  }

  const updateUserField = (field: 'first_name' | 'last_name' | 'bio', value: string) => {
    void persistUser({ ...user, [field]: value })
  }

  const updateProfileField = (nextProfile: any) => {
    void persistUser({ ...user, profile: nextProfile })
  }

  const updateTimelineEntry = (entryId: string, patch: Partial<ResumeTimelineEntry>) => {
    updateProfileField({
      ...profile,
      timeline: (profile.timeline || []).map((entry: ResumeTimelineEntry) =>
        entry.id === entryId ? { ...entry, ...patch } : entry
      ),
    })
  }

  const updateSocial = (type: string, url: string) => {
    updateProfileField({
      ...profile,
      header: {
        ...(profile.header || {}),
        socials: (profile.header?.socials || []).map((social: any) =>
          social.type === type ? { ...social, url } : social
        ),
      },
    })
  }

  const portfolioHref = (card: ResumeFeaturedCard) => {
    const slug = card.slug || card.id
    return getUriWithOrg(
      orgslug,
      mode === 'owner'
        ? routePaths.org.portfolioPost(slug)
        : routePaths.org.userPortfolioPost(profileUsername || user.username, slug)
    )
  }

  return (
    <>
      <style jsx global>{`
        @media print {
          @page {
            size: auto;
            margin: 0.45in;
          }

          html,
          body {
            background: #fff !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          nav,
          footer,
          [aria-label='Dashboard mobile actions'],
          [data-resume-no-print='true'],
          .resume-no-print {
            display: none !important;
          }

          .resume-print-root {
            min-height: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
            background: #fff !important;
          }

          .resume-print-page {
            display: grid !important;
            grid-template-columns: 280px minmax(0, 1fr) !important;
            gap: 2rem !important;
            margin: 0 !important;
            width: 100% !important;
            max-width: none !important;
            padding: 2.5rem !important;
            border: 1px solid #e5e7eb !important;
            box-shadow: none !important;
            min-height: auto !important;
          }

          .resume-print-page aside {
            border-right: 1px solid #e5e7eb !important;
            padding-right: 2rem !important;
          }

          .resume-print-main {
            row-gap: 1.75rem !important;
          }

          .resume-editable {
            pointer-events: none !important;
          }

          .resume-print-page-number {
            display: block !important;
            position: fixed;
            bottom: 0;
            right: 0;
            font-size: 10px;
            color: #6b7280;
          }

          .resume-print-page-number::after {
            content: counter(page);
          }

          body > * {
            background: #fff !important;
          }
        }
      `}</style>
      <main className="resume-print-root min-h-screen px-4 py-6 sm:px-6 lg:px-8 print:bg-card print:px-0 print:py-0">
        <div className="resume-no-print mx-auto flex w-full max-w-5xl flex-col gap-4">
          <ContentPageHeader
            orgslug={orgslug}
            tabs={[
              {
                href: mode === 'owner' ? routePaths.org.portfolio() : routePaths.org.user(profileUsername || user.username),
                label: 'Portfolio',
              },
              {
                href: mode === 'owner' ? routePaths.org.portfolioTimeline() : routePaths.org.userTimeline(profileUsername || user.username),
                label: 'Timeline',
              },
              {
                href: mode === 'owner' ? routePaths.org.portfolioResume() : routePaths.org.userResume(profileUsername || user.username),
                label: 'Resume',
                active: true,
              },
            ]}
            noHorizontalBleed
          />
          <div className="flex items-center justify-between gap-3">
            <Button asChild variant="ghost">
              <Link href={getUriWithOrg(orgslug, mode === 'owner' ? routePaths.org.portfolio() : routePaths.org.user(profileUsername || user.username))}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to profile
              </Link>
            </Button>
            <div className="flex items-center gap-3">
              {saving ? <span className="text-sm font-medium text-muted-foreground">Saving...</span> : null}
              <ResumePrintButton />
            </div>
          </div>
        </div>

        <article className="resume-print-page mx-auto mt-5 grid w-full max-w-5xl gap-6 rounded-lg border border-border bg-card p-6 shadow-sm sm:grid-cols-[280px_minmax(0,1fr)] sm:p-10">
          <aside className="space-y-6 border-border sm:border-r sm:pr-8 print:pr-6">
            <header>
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-950 text-white">
                <User className="h-6 w-6" />
              </div>
              <div className="mt-5 grid gap-1">
                {canEdit ? (
                  <>
                    <EditableText
                      value={user.first_name || ''}
                      canEdit={canEdit}
                      placeholder="First name"
                      className="text-4xl font-semibold leading-tight text-foreground"
                      onSave={(value) => updateUserField('first_name', value)}
                    />
                    <EditableText
                      value={user.last_name || ''}
                      canEdit={canEdit}
                      placeholder="Last name"
                      className="text-4xl font-semibold leading-tight text-foreground"
                      onSave={(value) => updateUserField('last_name', value)}
                    />
                  </>
                ) : (
                  <h1 className="text-4xl font-semibold leading-tight text-foreground">{name}</h1>
                )}
              </div>
            </header>

            <section className="space-y-3">
              {user.email ? (
                <a href={`mailto:${user.email}`} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                  <Mail className="h-4 w-4" />
                  <span className="min-w-0 truncate">{user.email}</span>
                </a>
              ) : null}
              {socials.map((social: any) => {
                const SocialIcon = SOCIAL_ICONS[social.type] || LinkIcon
                const socialContent = (
                  <>
                    <SocialIcon className="h-4 w-4 shrink-0" />
                    <EditableText
                      value={social.url || ''}
                      canEdit={canEdit}
                      placeholder="https://..."
                      className="min-w-0 truncate text-sm text-muted-foreground"
                      onSave={(value) => updateSocial(social.type, value)}
                    />
                  </>
                )
                if (!canEdit && social.url) {
                  return (
                    <a
                      key={`${social.type}-${social.url}`}
                      href={social.url}
                      className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                    >
                      {socialContent}
                    </a>
                  )
                }
                return (
                  <div key={`${social.type}-${social.url}`} className="flex items-center gap-2 text-sm text-muted-foreground">
                    {socialContent}
                  </div>
                )
              })}
            </section>

            {featuredBadges.length ? (
              <ResumeSection title="Badges">
                <div className="space-y-3">
                  {featuredBadges.slice(0, 6).map((badge) => (
                    <div key={badge.id} className="break-inside-avoid">
                      <p className="font-medium leading-snug text-foreground">{badge.title}</p>
                      <div className="mt-0.5 space-y-0.5 text-xs leading-5 text-muted-foreground">
                        <p>
                          <span className="font-medium text-muted-foreground">Issuer:</span> {badge.organization}
                        </p>
                        {badge.receivedDate ? (
                          <p>
                            <span className="font-medium text-muted-foreground">Issued:</span> {formatCredentialDate(badge.receivedDate)}
                          </p>
                        ) : null}
                        <p className="break-all">
                          <span className="font-medium text-muted-foreground">Verify:</span>{' '}
                          <Link href={badge.href} className="text-muted-foreground underline decoration-gray-300 underline-offset-2">
                            {badge.href}
                          </Link>
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </ResumeSection>
            ) : null}
          </aside>

          <div className="resume-print-main space-y-7">
            {(user.bio || canEdit) ? (
              <ResumeSection title="Portfolio">
                <EditableText
                  value={user.bio || ''}
                  canEdit={canEdit}
                  multiline
                  placeholder="Write a profile summary"
                  className="text-base leading-6 text-muted-foreground"
                  onSave={(value) => updateUserField('bio', value)}
                />
              </ResumeSection>
            ) : null}

            <ResumeSection title="Experience">
              {work.length ? work.map((entry) => {
                const detailKey = getTimelineDetailKey(entry)
                return (
                  <div key={entry.id} className="grid gap-1 sm:grid-cols-[1fr_auto] sm:gap-x-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <Briefcase className="h-4 w-4 text-muted-foreground" />
                        <EditableText
                          value={entry.title}
                          canEdit={canEdit}
                          className="font-semibold text-foreground"
                          onSave={(value) => updateTimelineEntry(entry.id, { title: value })}
                        />
                      </div>
                      {detailKey ? (
                        <EditableText
                          value={entry[detailKey] || ''}
                          canEdit={canEdit}
                          placeholder={detailKey === 'employer' ? 'Employer' : 'Institution'}
                          className="mt-0.5 text-sm font-medium text-muted-foreground"
                          onSave={(value) => updateTimelineEntry(entry.id, { [detailKey]: value })}
                        />
                      ) : null}
                      <EditableText
                        value={entry.description || ''}
                        canEdit={canEdit}
                        multiline
                        placeholder="Description"
                        className="mt-1.5 leading-6 text-muted-foreground"
                        onSave={(value) => updateTimelineEntry(entry.id, { description: value })}
                      />
                    </div>
                    <p className="text-sm font-medium text-muted-foreground sm:text-right">{formatDateRange(entry)}</p>
                  </div>
                )
              }) : (
                <p className="text-sm text-muted-foreground">Add work entries to your profile timeline to fill this section.</p>
              )}
            </ResumeSection>

            {featured.length ? (
              <ResumeSection title="Selected Work">
                {featured.slice(0, 4).map((card) => (
                  <Link
                    key={card.id}
                    href={portfolioHref(card)}
                    className="group -mx-3 block rounded-md px-3 py-2 transition-colors hover:bg-muted"
                  >
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-foreground">{card.title}</h3>
                      {canEdit ? <Edit3 className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 print:hidden" /> : null}
                    </div>
                    {card.body ? <p className="mt-1.5 leading-6 text-muted-foreground">{card.body}</p> : null}
                  </Link>
                ))}
              </ResumeSection>
            ) : null}

            {education.length ? (
              <ResumeSection title="Education">
                {education.map((entry) => (
                  <div key={entry.id} className="grid gap-1 sm:grid-cols-[1fr_auto] sm:gap-x-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <GraduationCap className="h-4 w-4 text-muted-foreground" />
                        <EditableText
                          value={entry.title}
                          canEdit={canEdit}
                          className="font-semibold text-foreground"
                          onSave={(value) => updateTimelineEntry(entry.id, { title: value })}
                        />
                      </div>
                      <EditableText
                        value={entry.institution || ''}
                        canEdit={canEdit}
                        placeholder="Institution"
                        className="mt-0.5 text-sm font-medium text-muted-foreground"
                        onSave={(value) => updateTimelineEntry(entry.id, { institution: value })}
                      />
                      <EditableText
                        value={entry.description || ''}
                        canEdit={canEdit}
                        multiline
                        placeholder="Description"
                        className="mt-1.5 leading-6 text-muted-foreground"
                        onSave={(value) => updateTimelineEntry(entry.id, { description: value })}
                      />
                    </div>
                    <p className="text-sm font-medium text-muted-foreground sm:text-right">{formatDateRange(entry)}</p>
                  </div>
                ))}
              </ResumeSection>
            ) : null}

            {life.length ? (
              <ResumeSection title="Additional Experience">
                {life.map((entry) => (
                  <div key={entry.id} className="grid gap-1 sm:grid-cols-[1fr_auto] sm:gap-x-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <Award className="h-4 w-4 text-muted-foreground" />
                        <EditableText
                          value={entry.title}
                          canEdit={canEdit}
                          className="font-semibold text-foreground"
                          onSave={(value) => updateTimelineEntry(entry.id, { title: value })}
                        />
                      </div>
                      <EditableText
                        value={entry.description || ''}
                        canEdit={canEdit}
                        multiline
                        placeholder="Description"
                        className="mt-1.5 leading-6 text-muted-foreground"
                        onSave={(value) => updateTimelineEntry(entry.id, { description: value })}
                      />
                    </div>
                    <p className="text-sm font-medium text-muted-foreground sm:text-right">{formatDateRange(entry)}</p>
                  </div>
                ))}
              </ResumeSection>
            ) : null}
          </div>
        </article>
        <div className="resume-print-page-number hidden" />
      </main>
    </>
  )
}
