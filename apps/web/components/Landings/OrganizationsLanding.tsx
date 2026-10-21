import Link from 'next/link'
import { Check } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import badgesImage from 'public/landing/badges.png'
import heroImage from 'public/landing/hero.png'
import { AssignmentMock, ChecklistMock, CoverageMock, FeedMock, MarketplaceMock } from './OrganizationsLandingMocks'

export type OrganizationsLandingLinks = { createOrg: string; learnerHome: string; login: string }

const EYEBROW = 'text-sm font-extrabold uppercase tracking-[0.08em] text-[var(--org-primary-color)]'
const H2 = 'text-balance text-[32px] font-black leading-[1.08] tracking-[-0.03em] text-gray-900 sm:text-[44px]'
const LEAD = 'mt-5 text-pretty text-lg leading-8 text-gray-600'

const PROBLEMS = [
  { problem: "Everyone is on a different page, and you can't tell who's stuck.", answer: 'Every learner works through the same stages, and you see where each one is at a glance.' },
  { problem: 'Work arrives by email, text and shared docs, and feedback gets lost.', answer: 'Turn-ins land in one feed per learner. Review, comment and approve right there.' },
  { problem: 'Proving requirements means a scramble at report time.', answer: 'Plan steps link to your requirements, so coverage and evidence build up as learners work.' },
]

const STEPS = [
  { title: 'Name your organization', body: "Sign in with Google or email and give it a name. That's the whole setup." },
  { title: 'Pick a plan', body: 'Grab one from the Marketplace or build your own.' },
  { title: 'Add your learners', body: 'Invite by email or share a join link. Each learner gets their own copy of the plan.' },
]

const TIERS = [
  { name: 'Free', blurb: 'For one person helping a few learners.', items: ['25 active learners', '2 staff', 'Build and hand out plans', 'A feed with every learner', 'Requirement reports on your learners'], cta: 'Create your organization' },
  { name: 'Full', blurb: 'For programs with groups and several staff.', items: ['200 active learners', '12 staff', 'Groups, group plans and group chats', 'Bulk invites and CSV', 'Everything in Free'], cta: 'Start free, try Full for 30 days', featured: true },
  { name: 'Enterprise', blurb: 'For schools, districts and employers at scale.', items: ['Unlimited learners and staff', 'Single sign-on', 'Advanced reporting', 'Audit logs and API access', 'Everything in Full'], cta: 'Start free, then ask us' },
]

function Feature({ eyebrow, title, children, picture, flip }: { eyebrow: string; title: string; children: React.ReactNode; picture: React.ReactNode; flip?: boolean }) {
  return (
    <section className="px-6 py-14 sm:py-20">
      <div className={cn('mx-auto flex max-w-[1200px] flex-wrap items-center gap-12 lg:gap-16', flip && 'flex-wrap-reverse')}>
        {flip ? <div className="min-w-0 flex-[1_1_480px]">{picture}</div> : null}
        <div className="min-w-0 flex-[1_1_380px]">
          <p className={EYEBROW}>{eyebrow}</p>
          <h2 className={cn(H2, 'mt-3')}>{title}</h2>
          {children}
        </div>
        {flip ? null : <div className="min-w-0 flex-[1_1_480px]">{picture}</div>}
      </div>
    </section>
  )
}

/**
 * The marketing page for people who run learning for others: parents, teachers, coaches and
 * programs. It lives beside the learner landing, in the default org's colors, and sends people
 * to create their own organization.
 */
export default function OrganizationsLanding({ links }: { links: OrganizationsLandingLinks }) {
  const create = buttonVariants({ variant: 'brand', size: 'cta', className: 'text-[15px]' })
  return (
    <main className="overflow-hidden bg-white text-gray-900">
      <section className="bg-[linear-gradient(180deg,#ffffff_0%,#f3f6fc_100%)] px-6 pb-20 pt-14 sm:pb-24 sm:pt-20">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-12 lg:gap-16">
          <div className="min-w-0 flex-[1_1_440px]">
            <p className="inline-flex items-center gap-2 rounded-full bg-[color-mix(in_srgb,var(--org-primary-color)_12%,white)] px-3 py-1.5 text-[13px] font-bold text-gray-800">
              <span className="h-2 w-2 rounded-full bg-[#2e9d6a]" />For parents, teachers, coaches and programs
            </p>
            <h1 className="mt-5 text-balance text-[40px] font-black leading-[1.02] tracking-[-0.035em] sm:text-[60px] lg:text-[66px]">
              Hand out one plan. <span className="text-[var(--org-primary-color)]">See every learner</span> move.
            </h1>
            <p className="mt-6 max-w-[540px] text-pretty text-lg leading-8 text-gray-600 sm:text-[19px]">
              Give your learners a plan with clear steps, review their work in one place, and show which requirements they've met, with the evidence attached.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3.5">
              <Link href={links.createOrg} className={create}>Create your organization, free</Link>
              <Link href="#how-it-works" className={buttonVariants({ variant: 'surface', size: 'cta', className: 'px-6 text-[15px]' })}>See how it works</Link>
            </div>
            <p className="mt-4 text-sm text-gray-500">Free for up to 25 learners. Set up in about a minute.</p>
          </div>
          <div className="min-w-0 flex-[1_1_480px]"><AssignmentMock /></div>
        </div>
      </section>

      <section className="bg-[#111318] px-6 py-20 text-white sm:py-24">
        <div className="mx-auto max-w-[1200px]">
          <h2 className="max-w-[760px] text-balance text-[32px] font-black leading-[1.1] tracking-[-0.03em] sm:text-[46px]">Running learning for others shouldn't mean living in spreadsheets.</h2>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {PROBLEMS.map((item) => (
              <div key={item.problem} className="rounded-[22px] border border-white/10 bg-white/[0.04] p-7">
                <p className="text-[21px] font-bold leading-snug">{item.problem}</p>
                <p className="mt-3.5 text-[15px] leading-relaxed text-gray-300">{item.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div id="how-it-works" className="pt-10 sm:pt-16">
        <Feature eyebrow="Start fast" title="Grab a plan that already works." picture={<MarketplaceMock />}>
          <p className={LEAD}>Browse ready-made plans from other organizations, with their badges and the requirements they cover. Use one as-is, or copy it and make it yours in the plan builder.</p>
          <ul className="mt-6 flex flex-col gap-3 font-semibold">
            {['Stages and steps, ready to hand out', 'Filter by topic, badge or requirement framework', 'New versions arrive when you choose to apply them'].map((point) => (
              <li key={point} className="flex items-center gap-2.5"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#d6efe2] text-[#1d6b48]"><Check size={14} strokeWidth={3} /></span>{point}</li>
            ))}
          </ul>
        </Feature>
        <Feature flip eyebrow="Stay close" title="One feed per learner. Every turn-in, every note." picture={<FeedMock />}>
          <p className={LEAD}>Learners turn in work from their plan. It shows up in their feed, where you review, approve or send it back with a note. Staff, parents and mentors you invite see the same conversation.</p>
          <p className="mt-4 leading-7 text-gray-600">Home shows what's waiting on you today, so nothing sits for a week.</p>
        </Feature>
        <Feature eyebrow="Show the proof" title="Requirements covered, with the evidence attached." picture={<CoverageMock />}>
          <p className={LEAD}>Add your state standards or your own competencies, link plan steps to them, and see coverage before anyone starts. As learners finish steps, their work becomes the evidence. Print a report for a learner or a whole group when you need it.</p>
        </Feature>
        <Feature flip eyebrow="Make it count" title="Badges your learners keep." picture={<img src={badgesImage.src} alt="Hand-drawn badges: a star, a crown and a lightning bolt" className="mx-auto h-auto w-full max-w-[420px]" />}>
          <p className={LEAD}>Finishing a plan can earn a badge. It lands in the learner's own portfolio, which they own and can share long after they've moved on from your program.</p>
        </Feature>
      </div>

      <section className="mt-10 bg-[#f3f6fc] px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-[1200px]">
          <div className="mx-auto max-w-[720px] text-center">
            <p className={EYEBROW}>Get going today</p>
            <h2 className={cn(H2, 'mt-3 sm:text-[50px]')}>From sign-up to your first plan in minutes.</h2>
          </div>
          <div className="mt-14 flex flex-wrap items-center gap-10">
            <ol className="flex min-w-0 flex-[1_1_420px] flex-col gap-4">
              {STEPS.map((step, index) => (
                <li key={step.title} className="flex gap-4 rounded-[20px] bg-white p-5">
                  <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl font-black', index === 0 ? 'bg-[var(--org-primary-color)] text-[var(--org-on-primary-color)]' : index === 1 ? 'bg-[#bfe3d1]' : 'bg-[#f1e3bf]')}>{index + 1}</span>
                  <span><span className="block text-lg font-bold">{step.title}</span><span className="mt-1 block leading-relaxed text-gray-600">{step.body}</span></span>
                </li>
              ))}
            </ol>
            <div className="min-w-0 flex-[1_1_440px]"><ChecklistMock /></div>
          </div>
        </div>
      </section>

      <section className="px-6 py-20 sm:py-28">
        <div className="mx-auto max-w-[1200px]">
          <div className="mx-auto max-w-[720px] text-center">
            <h2 className={cn(H2, 'sm:text-[50px]')}>Start free. Grow when you need to.</h2>
            <p className={LEAD}>Free covers a family, a tutor or a small program. Try Full for 30 days whenever you need groups and more room.</p>
          </div>
          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {TIERS.map((tier) => (
              <div key={tier.name} className={cn('relative flex flex-col rounded-[26px] p-7', tier.featured ? 'bg-gray-900 text-white shadow-[0_30px_60px_-28px_rgba(23,35,80,0.55)]' : 'border-2 border-gray-200')}>
                {tier.featured ? <span className="absolute -top-3.5 left-7 rounded-full bg-[#bfe3d1] px-3 py-1.5 text-xs font-extrabold uppercase tracking-wide text-gray-900">Try it 30 days</span> : null}
                <p className="text-[26px] font-black">{tier.name}</p>
                <p className={cn('mt-2 text-[15px] leading-relaxed', tier.featured ? 'text-gray-300' : 'text-gray-600')}>{tier.blurb}</p>
                <ul className="mt-6 flex flex-col gap-2.5 text-[15px]">
                  {tier.items.map((item) => <li key={item} className="flex items-start gap-2"><Check size={16} strokeWidth={3} className={cn('mt-0.5 shrink-0', tier.featured ? 'text-[#bfe3d1]' : 'text-[#2e9d6a]')} />{item}</li>)}
                </ul>
                <Link href={links.createOrg} className={cn('mt-auto block pt-8')}>
                  <span className={cn(tier.featured ? buttonVariants({ variant: 'surface', size: 'cta', className: 'w-full border-0' }) : buttonVariants({ variant: tier.name === 'Free' ? 'brand' : 'surface', size: 'cta', className: 'w-full' }))}>{tier.cta}</span>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 pb-20">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-8 overflow-hidden rounded-[40px] bg-[var(--org-primary-color)] p-8 text-[var(--org-on-primary-color)] sm:p-14">
          <div className="min-w-0 flex-[1_1_420px]">
            <h2 className="text-balance text-[36px] font-black leading-[1.02] tracking-[-0.035em] sm:text-[56px]">Your first plan is a minute away.</h2>
            <p className="mt-4 max-w-[480px] text-lg leading-8 opacity-85">Create your organization, pick a plan, and send your learners the link today.</p>
            <Link href={links.createOrg} className={buttonVariants({ variant: 'surface', size: 'cta', className: 'mt-8 border-0 text-[15px]' })}>Create your organization, free</Link>
          </div>
          <div className="flex min-w-0 flex-[1_1_320px] justify-center">
            <img src={heroImage.src} alt="Hand-drawn laptop showing a learner profile with badges and projects" className="h-auto w-full max-w-[360px] rotate-3" />
          </div>
        </div>
        <p className="mx-auto mt-8 max-w-[1200px] text-center text-sm text-gray-500">
          Here to learn yourself? <Link href={links.learnerHome} className="font-bold text-[var(--org-primary-color)] underline-offset-4 hover:underline">Go to the learner site</Link>
          <span aria-hidden="true"> · </span>
          <Link href={links.login} className="font-semibold text-gray-600 underline-offset-4 hover:underline">Sign in</Link>
        </p>
      </section>
    </main>
  )
}
