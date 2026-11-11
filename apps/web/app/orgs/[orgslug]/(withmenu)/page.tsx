export const dynamic = 'force-dynamic'
import type { Metadata } from 'next'
import type React from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { buttonVariants } from '@/components/ui/button'
import { getServerSession } from '@/lib/auth/server'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import badgesImage from 'public/landing/badges.png'
import ctaImage from 'public/landing/cta.png'
import portfolioImage from 'public/landing/portfolio-graphic.png'

type PageProps = { params: Promise<{ orgslug: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { orgslug } = await params
  const org = await getOrganizationContextInfo(orgslug, { revalidate: 0, tags: ['organizations'] })
  return {
    title: org?.name ? `Welcome to ${org.name}` : 'Welcome',
    description: org?.description || '',
  }
}

const OrgHomePage = async ({ params }: PageProps) => {
  const { orgslug } = await params
  const session = await getServerSession()

  if (session) {
    redirect(getUriWithOrg(orgslug, routePaths.org.home()))
  }

  const signupHref = getUriWithOrg(orgslug, routePaths.auth.signup())
  const loginHref = getUriWithOrg(orgslug, routePaths.auth.login())
  const forOrganizationsHref = getUriWithOrg(orgslug, routePaths.org.forOrganizations())
  const sections: { title: string; body: string; art: React.ReactNode }[] = [
    {
      title: 'see what it costs',
      body: 'Every phase gets a budget. Tuition, rent, pay and aid start from real estimates for where you’ll be, and you can change any of them. Your savings and debt add up across the whole plan, so you see where the money gets tight before you get there.',
      art: <BudgetArt />,
    },
    {
      title: 'turn plans into goals',
      body: 'Break a phase into goals with clear steps, like applying for aid or finishing a training. Earn badges along the way that show what you can do.',
      art: <LandingImage className="mx-auto h-[260px] w-[260px] sm:h-[320px] sm:w-[320px] lg:h-[460px] lg:w-[460px]" src={badgesImage.src} alt="" />,
    },
    {
      title: 'share your story',
      body: 'Collect your badges and work in a portfolio you can share with schools, employers or anyone else.',
      art: <LandingImage className="mx-auto h-[260px] w-[260px] sm:h-[320px] sm:w-[320px] lg:h-[460px] lg:w-[460px]" src={portfolioImage.src} alt="" />,
    },
  ]

  return (
    <main className="min-h-screen overflow-hidden bg-card text-[#3c3f43]">
      <section className="mx-auto grid min-h-[calc(100dvh-60px)] w-full max-w-[1188px] place-items-center gap-6 px-4 sm:px-7 py-4 text-center sm:gap-7 sm:py-6 md:grid-cols-[1.04fr_0.96fr] md:gap-12 md:px-10 md:py-8">
        <div className="w-full">
          <PlanArt />
        </div>
        <div className="flex w-full max-w-[540px] flex-col items-center">
          <h1 className="text-balance text-center text-[32px] font-black leading-[1.15] tracking-normal text-foreground/80 sm:text-[40px]">
            Plan your next chapter, and what it will cost
          </h1>
          <p className="mt-3 text-pretty text-center text-base font-semibold leading-7 text-[#777] sm:mt-4 sm:text-lg">
            Lay out school, work, a gap year or whatever comes next on one timeline. Each phase comes with a budget, so you can compare paths and see your money year by year. Free.
          </p>
          <div className="mt-5 flex w-full max-w-[420px] flex-col gap-3 sm:mt-7 sm:gap-4">
            <Link
              href={signupHref}
              className={buttonVariants({ variant: 'brand', size: 'cta', className: 'w-full text-[15px]' })}
            >
              Get Started
            </Link>
            <Link
              href={loginHref}
              className={buttonVariants({ variant: 'surface', size: 'cta', className: 'w-full px-6 text-[15px] sm:px-8' })}
            >
              I Already Have an Account
            </Link>
            <Link
              href={forOrganizationsHref}
              className="text-center text-sm font-semibold text-[#777] underline-offset-4 transition-colors hover:text-[#27323d] hover:underline"
            >
              Running learning for others? <span className="text-[var(--org-primary-color)]">See how it works</span>
            </Link>
          </div>
        </div>
      </section>

      <section className="border-t border-[#e5e5e5]">
        {sections.map((section, index) => {
          const isReversed = index % 2 === 1
          return (
            <div
              key={section.title}
              className={`mx-auto grid w-full max-w-[1080px] place-items-center gap-10 overflow-visible px-7 py-16 text-center sm:py-20 md:grid-cols-2 md:px-10 md:text-left lg:w-[988px] lg:max-w-[988px] lg:gap-[101px] lg:px-0 lg:py-24 ${isReversed ? 'lg:grid-cols-[473px_414px]' : 'lg:grid-cols-[414px_473px]'}`}
            >
              <div className={isReversed ? 'w-full md:order-2 lg:w-[414px]' : 'w-full lg:w-[414px]'} aria-hidden="true">
                {section.art}
              </div>
              <div className={`mx-auto max-w-[500px] lg:w-[473px] lg:max-w-[473px] ${isReversed ? 'md:order-1' : ''}`}>
                <h2 className="text-balance text-[40px] font-black leading-[1.12] tracking-normal text-[var(--org-primary-color)] sm:text-[48px]">
                  {section.title}
                </h2>
                <p className="mt-5 text-pretty text-lg font-semibold leading-8 tracking-normal text-[#777]">
                  {section.body}
                </p>
              </div>
            </div>
          )
        })}
      </section>

      <section className="isolate min-h-[520px] overflow-y-visible overflow-x-clip bg-card px-7 py-20 text-center sm:min-h-[560px] sm:py-24">
        <div className="mx-auto flex max-w-[1728px] flex-col items-center overflow-visible">
          <div className="relative z-10 mx-auto flex max-w-[720px] flex-col items-center">
            <h2 className="text-balance text-[42px] font-black leading-[1.15] tracking-normal text-[#27323d] sm:text-[64px]">
              get started today
            </h2>
            <div className="mt-8 flex w-full max-w-[420px] flex-col gap-4 sm:flex-row sm:justify-center">
              <Link
                href={signupHref}
                className={buttonVariants({ variant: 'brand', size: 'cta' })}
              >
                sign up
              </Link>
              <Link
                href={loginHref}
                className={buttonVariants({ variant: 'surface', size: 'cta', className: 'border-border text-foreground/80 shadow-[0_4px_0_hsl(var(--border))]' })}
              >
                login
              </Link>
            </div>
          </div>
          <div className="pointer-events-none relative z-0 -ml-[120px] -mt-[90px] self-start opacity-45 lg:-ml-[220px] lg:-mt-[240px]">
            <CtaBackgroundImage />
          </div>
        </div>
      </section>
    </main>
  )
}

/** The hero picture: a plan drawn as phases on a timeline, with savings running underneath. Decorative. */
const PlanArt = () => {
  const years = ['2026', '2027', '2028', '2029', '2030']
  return (
    <div aria-hidden="true" className="mx-auto w-full max-w-[460px] rounded-[28px] bg-[#eef2f8] p-4 text-left shadow-[0_6px_0_#d9e0ea] sm:p-6">
      <div className="flex items-center justify-between text-xs font-extrabold text-[#27323d]/70">
        <span>My plan</span>
        <span className="rounded-full bg-white px-2.5 py-1 text-[#27323d]">2 paths</span>
      </div>
      <div className="mt-3 grid grid-cols-5 gap-1 text-[10px] font-bold text-[#27323d]/50 sm:text-[11px]">
        {years.map((y) => <span key={y}>{y}</span>)}
      </div>
      <div className="mt-1.5 grid grid-cols-5 gap-1.5 text-[11px] font-extrabold sm:text-xs">
        <PhaseBlock className="col-span-1 row-span-2 bg-[#27323d] text-white">High school</PhaseBlock>
        <PhaseBlock className="col-span-3 bg-[var(--org-primary-color,#3b6fd8)] text-white">College</PhaseBlock>
        <PhaseBlock className="col-span-1 row-span-2 bg-[#ecd9b0] text-[#27323d]">First job</PhaseBlock>
        <PhaseBlock className="col-span-1 bg-[#b9e0c9] text-[#27323d]">Gap year</PhaseBlock>
        <PhaseBlock className="col-span-2 border-2 border-dashed border-[#27323d]/25 bg-white/60 text-[#27323d]/70">Training</PhaseBlock>
      </div>
      <div className="mt-4 rounded-2xl bg-white p-3">
        <div className="flex items-baseline justify-between text-[11px] font-extrabold text-[#27323d]/70 sm:text-xs">
          <span>Savings</span>
          <span className="text-[#2f8a57]">+$4,200 by 2030</span>
        </div>
        <svg viewBox="0 0 300 70" className="mt-2 h-14 w-full sm:h-16" preserveAspectRatio="none">
          <line x1="0" y1="44" x2="300" y2="44" stroke="#27323d" strokeOpacity="0.15" strokeDasharray="4 4" />
          <path d="M0 36 L60 30 L120 46 L180 56 L240 40 L300 18 L300 70 L0 70 Z" fill="var(--org-primary-color,#3b6fd8)" fillOpacity="0.12" />
          <polyline points="0,36 60,30 120,46 180,56 240,40 300,18" fill="none" stroke="var(--org-primary-color,#3b6fd8)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx="300" cy="18" r="4" fill="var(--org-primary-color,#3b6fd8)" />
        </svg>
      </div>
    </div>
  )
}

const PhaseBlock = ({ className, children }: { className: string; children: React.ReactNode }) => (
  <div className={`flex min-h-10 items-center rounded-xl px-2 py-2 leading-tight sm:min-h-12 sm:px-3 ${className}`}>{children}</div>
)

/** A phase's budget, drawn: what goes out, what comes in, and the year's total. Decorative. */
const BudgetArt = () => {
  const rows: [string, string, boolean][] = [
    ['Tuition and fees', '−$11,900', false],
    ['Rent and food', '−$9,600', false],
    ['Grants', '+$7,400', true],
    ['Part-time job', '+$8,600', true],
  ]
  return (
    <div className="mx-auto w-full max-w-[400px] rounded-[28px] bg-[#eef2f8] p-5 text-left shadow-[0_6px_0_#d9e0ea] sm:p-6">
      <p className="text-xs font-extrabold text-[#27323d]/60">College · first year</p>
      <p className="mt-1 text-2xl font-black text-[#27323d]">Budget</p>
      <ul className="mt-4 grid gap-2">
        {rows.map(([label, amount, income]) => (
          <li key={label} className="flex items-center justify-between rounded-xl bg-white px-3 py-2.5 text-sm font-bold text-[#27323d]">
            <span>{label}</span>
            <span className={income ? 'text-[#2f8a57]' : 'text-[#27323d]/80'}>{amount}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between border-t-2 border-dashed border-[#27323d]/15 px-1 pt-3 text-sm font-black text-[#27323d]">
        <span>Each year</span>
        <span>−$5,500</span>
      </div>
    </div>
  )
}

const LandingImage = ({ className, src, alt }: { className?: string; src: string; alt: string }) => (
  <div className={`relative overflow-hidden rounded-[28px] ${className || ''}`}>
    <img src={src} alt={alt} className="absolute inset-0 h-full w-full object-cover" />
  </div>
)

const CtaBackgroundImage = () => (
  <div
    aria-hidden="true"
    className="relative aspect-[2/1] w-[1200px] max-w-none overflow-hidden rounded-[32px] lg:w-[1948px]"
  >
    <img src={ctaImage.src} alt="" className="absolute inset-0 h-full w-full object-cover" />
  </div>
)

export default OrgHomePage
