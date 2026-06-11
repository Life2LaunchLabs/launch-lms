import React from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Award, Check, Clock, Sparkles, Target, Trophy } from 'lucide-react'
import { getServerSession } from '@/lib/auth/server'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { getPublicCourseBadgeClass } from '@services/courses/certifications'
import { normalizeMediaUrl } from '@services/media/media'

type BadgeInvitePageProps = {
  params: Promise<{ orgslug: string; uuid: string }>
}

type BadgeClass = {
  name?: string
  description?: string
  image?: string
  criteria?: {
    narrative?: string
  }
  issuer?: {
    name?: string
  }
  'extensions:invite'?: Record<string, string>
  'extensions:courseAbout'?: string
  'extensions:courseLearnings'?: string
  'extensions:courseTags'?: string
}

const normalizeCourseUuid = (uuid: string) =>
  uuid.startsWith('course_') ? uuid : `course_${uuid}`

async function getBadgeClass(uuid: string): Promise<BadgeClass | null> {
  const response = await getPublicCourseBadgeClass(normalizeCourseUuid(uuid))
  if (!response.success) return null
  return response.data as BadgeClass
}

function parseLearnings(learnings?: string) {
  if (!learnings) return []

  try {
    const parsed = JSON.parse(learnings)
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => typeof item === 'string' ? item : item?.text)
        .filter(Boolean)
    }
  } catch {}

  return learnings
    .split(/\n|,|\|/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseTags(tags?: string) {
  if (!tags) return []
  return tags
    .split(/\||,/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 3)
}

export async function generateMetadata({ params }: BadgeInvitePageProps): Promise<Metadata> {
  const { orgslug, uuid } = await params
  const org = await getOrganizationContextInfo(orgslug, {
    revalidate: 1800,
    tags: ['organizations'],
  })
  const badgeClass = await getBadgeClass(uuid)
  const invite = badgeClass?.['extensions:invite'] || {}
  const title = invite.badge_invite_headline || badgeClass?.name || 'Badge invite'
  const description = invite.badge_invite_subheadline || badgeClass?.description || org?.description || ''
  const image = normalizeMediaUrl(badgeClass?.image)

  return {
    title: `${title} - ${org?.name || 'Launch LMS'}`,
    description,
    alternates: {
      canonical: getCanonicalInviteUrl(orgslug, uuid),
    },
    openGraph: {
      title,
      description,
      images: image ? [{ url: image, alt: badgeClass?.name || title }] : undefined,
      type: 'website',
    },
  }
}

function getCanonicalInviteUrl(orgslug: string, uuid: string) {
  return getUriWithOrg(orgslug, routePaths.org.badgeInvite(uuid))
}

export default async function BadgeInvitePage({ params }: BadgeInvitePageProps) {
  const { orgslug, uuid } = await params
  const session = await getServerSession()

  if (session) {
    redirect(getUriWithOrg(orgslug, routePaths.org.course(uuid)))
  }

  const [org, badgeClass] = await Promise.all([
    getOrganizationContextInfo(orgslug, { revalidate: 1800, tags: ['organizations'] }),
    getBadgeClass(uuid),
  ])

  if (!badgeClass) notFound()

  const invite = badgeClass['extensions:invite'] || {}
  const badgeName = badgeClass.name || 'Badge'
  const headline = invite.badge_invite_headline || `Earn the ${badgeName}`
  const subheadline = invite.badge_invite_subheadline || badgeClass.description || badgeClass['extensions:courseAbout'] || 'Build proof of your progress with a badge you can share.'
  const eyebrow = invite.badge_invite_eyebrow || 'Badge invite available'
  const primaryStat = invite.badge_invite_primary_stat || 'Portfolio-ready proof'
  const secondaryStat = invite.badge_invite_secondary_stat || 'Self-paced path'
  const testimonial = invite.badge_invite_testimonial || `This badge gives learners a clear way to show what they have practiced, completed, and can bring into the real world.`
  const badgeImageUrl = normalizeMediaUrl(badgeClass.image)
  const learnings = parseLearnings(badgeClass['extensions:courseLearnings'])
  const tags = parseTags(badgeClass['extensions:courseTags'])
  const criteria = badgeClass.criteria?.narrative || 'Complete the required badge activities.'
  const signupHref = getUriWithOrg(orgslug, routePaths.auth.signup({ next: routePaths.org.course(uuid) }))
  const loginHref = getUriWithOrg(orgslug, routePaths.auth.login({ next: routePaths.org.course(uuid) }))

  const unlockItems = learnings.length > 0
    ? learnings.slice(0, 4)
    : [
        criteria,
        'A shareable Open Badges credential for your profile.',
        'A guided learning path built around visible progress.',
      ]

  return (
    <main className="min-h-screen bg-[#f7faf6] text-gray-950">
      <section className="relative overflow-hidden border-b border-black/5 bg-[#eef5ef]">
        <div className="mx-auto grid min-h-[620px] w-full max-w-7xl items-center gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(360px,520px)] lg:px-10">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#f9dc76] px-3 py-1 text-xs font-bold uppercase tracking-normal text-[#3f3a15]">
              <Sparkles size={13} />
              {eyebrow}
            </div>
            <h1 className="mt-5 text-4xl font-black leading-[1.02] tracking-normal sm:text-5xl lg:text-6xl">
              {headline}
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-gray-700 sm:text-lg">
              {subheadline}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href={signupHref}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#42c900] px-7 text-sm font-bold text-black shadow-sm transition-colors hover:bg-[#39b300]"
              >
                Claim your invite
                <Check size={17} />
              </Link>
              <Link
                href={loginHref}
                className="inline-flex h-12 items-center justify-center rounded-lg border border-black/10 bg-white px-7 text-sm font-bold text-gray-800 transition-colors hover:bg-gray-50"
              >
                Log in
              </Link>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[520px]">
            <div className="aspect-square w-full overflow-hidden rounded-sm bg-white shadow-[0_24px_80px_rgba(24,57,35,0.14)] ring-1 ring-black/5">
              {badgeImageUrl ? (
                <img
                  src={badgeImageUrl}
                  alt={badgeName}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-white text-[#42c900]">
                  <Award size={120} strokeWidth={1.25} />
                </div>
              )}
            </div>
            <div className="absolute -bottom-4 left-4 rounded-xl bg-white px-4 py-3 shadow-[0_16px_36px_rgba(15,23,42,0.16)] ring-1 ring-black/5 sm:left-[-18px]">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                  <Clock size={18} />
                </div>
                <div>
                  <p className="text-sm font-bold">{badgeName}</p>
                  <p className="text-xs text-gray-500">Ready to unlock</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-black/5 bg-white">
        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-5 px-5 py-8 text-center sm:grid-cols-3 sm:px-8">
          <Stat value={primaryStat} label="Credential value" />
          <Stat value={secondaryStat} label="Learning path" />
          <Stat value={org?.name || badgeClass.issuer?.name || 'Launch LMS'} label="Issuer" />
        </div>
      </section>

      <section className="bg-white px-5 py-16 sm:px-8">
        <div className="mx-auto max-w-5xl text-center">
          <h2 className="text-2xl font-black tracking-normal sm:text-3xl">Why this badge matters</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-gray-600">
            A badge is more than a completion mark. It is a focused signal of practice, evidence, and momentum.
          </p>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            <FeatureCard icon={<Target size={20} />} title="Focused practice" text="Work through a guided path with clear outcomes and visible progress." />
            <FeatureCard icon={<Trophy size={20} />} title="Shareable proof" text="Earn a credential designed for profiles, portfolios, and professional conversations." />
            <FeatureCard icon={<Award size={20} />} title="Trusted issuer" text={`Issued by ${org?.name || badgeClass.issuer?.name || 'your learning organization'}.`} />
          </div>
        </div>
      </section>

      <section className="border-y border-black/5 bg-[#fbfaf9] px-5 py-16 sm:px-8">
        <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(320px,460px)]">
          <div>
            <h2 className="text-2xl font-black tracking-normal">What you will unlock</h2>
            <div className="mt-6 space-y-4">
              {unlockItems.map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#42c900] text-black">
                    <Check size={13} />
                  </div>
                  <p className="text-sm leading-6 text-gray-700">{item}</p>
                </div>
              ))}
            </div>
            {tags.length > 0 && (
              <div className="mt-7 flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-gray-600 ring-1 ring-black/10">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-[0_18px_55px_rgba(15,23,42,0.12)] ring-1 ring-black/5">
            <div className="rounded-lg bg-[#42c900] px-4 py-3 text-sm font-bold text-black">
              Badge path: {badgeName}
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-100">
              <div className="h-full w-[68%] rounded-full bg-[#1e7610]" />
            </div>
            <div className="mt-5 space-y-3">
              {unlockItems.slice(0, 3).map((item, index) => (
                <div key={`${item}-${index}`} className="rounded-lg border border-black/5 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white px-5 py-14 text-center sm:px-8">
        <p className="mx-auto max-w-2xl text-sm italic leading-6 text-gray-600">
          "{testimonial}"
        </p>
      </section>

      <section className="px-5 pb-16 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center rounded-[28px] bg-[#1f7200] px-6 py-14 text-center text-white sm:px-10">
          <h2 className="text-3xl font-black tracking-normal sm:text-4xl">Ready to start your journey?</h2>
          <p className="mt-4 max-w-xl text-sm leading-6 text-white/85">
            Create your account to begin the badge path and turn your progress into a credential you can share.
          </p>
          <Link
            href={signupHref}
            className="mt-8 inline-flex h-12 min-w-[260px] items-center justify-center rounded-lg bg-white px-7 text-sm font-bold text-[#1f7200] shadow-sm transition-colors hover:bg-gray-50"
          >
            Get started for free
          </Link>
          <p className="mt-4 text-xs text-white/70">No credit card required</p>
        </div>
      </section>
    </main>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-2xl font-black text-[#1f7200]">{value}</p>
      <p className="mt-1 text-xs font-semibold text-gray-500">{label}</p>
    </div>
  )
}

function FeatureCard({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-lg border border-black/10 bg-white p-5 text-left">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#eef5ef] text-[#1f7200]">
        {icon}
      </div>
      <h3 className="mt-5 text-base font-black">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-gray-600">{text}</p>
    </div>
  )
}
