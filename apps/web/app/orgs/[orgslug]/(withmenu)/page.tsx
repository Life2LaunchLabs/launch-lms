export const dynamic = 'force-dynamic'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { buttonVariants } from '@/components/ui/button'
import { getServerSession } from '@/lib/auth/server'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import announcementsImage from 'public/landing/announcements.png'
import badgesImage from 'public/landing/badges.png'
import ctaImage from 'public/landing/cta.png'
import heroImage from 'public/landing/hero.png'
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
    redirect(getUriWithOrg(orgslug, routePaths.org.portfolio()))
  }

  const signupHref = getUriWithOrg(orgslug, routePaths.auth.signup())
  const loginHref = getUriWithOrg(orgslug, routePaths.auth.login())
  const sections = [
    {
      title: 'earn badges',
      body: 'demonstrate your skills with badges that employers actually care about.',
      imageSrc: badgesImage.src,
      imageAlt: 'Badges graphic',
    },
    {
      title: 'customize your portfolio',
      body: 'share your story with an easy portfolio builder',
      imageSrc: portfolioImage.src,
      imageAlt: 'Portfolio builder graphic',
    },
    {
      title: 'stay tuned!',
      body: 'the launchpad is still under development. Thanks for your support as we work to revolutionize the life launching landscape!',
      imageSrc: announcementsImage.src,
      imageAlt: 'Announcements graphic',
    },
  ]

  return (
    <main className="min-h-screen overflow-hidden bg-card text-[#3c3f43]">
      <section className="mx-auto grid h-[calc(100dvh-60px)] w-full max-w-[1188px] place-items-center gap-5 overflow-hidden px-7 py-4 text-center sm:gap-7 sm:py-6 md:grid-cols-[1.04fr_0.96fr] md:gap-12 md:px-10 md:py-8">
        <div className="w-full">
          <LandingImage className="mx-auto h-[210px] w-[210px] sm:h-[280px] sm:w-[280px] md:h-[424px] md:w-[424px]" src={heroImage.src} alt="Hero art" />
        </div>
        <div className="flex w-full max-w-[540px] flex-col items-center">
          <h1 className="text-balance text-center text-[32px] font-black leading-[1.2] tracking-normal text-foreground/80">
            Showcase your skills and build your brand - for free!
          </h1>
          <div className="mt-5 flex w-full max-w-[420px] flex-col gap-3 sm:mt-7 sm:gap-4">
            <Link
              href={signupHref}
              className={buttonVariants({ variant: 'cta', size: 'cta', className: 'w-full text-[15px]' })}
            >
              Get Started
            </Link>
            <Link
              href={loginHref}
              className={buttonVariants({ variant: 'ctaSecondary', size: 'cta', className: 'w-full px-6 text-[15px] sm:px-8' })}
            >
              I Already Have an Account
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
              className={`mx-auto grid min-h-[460px] w-full max-w-[1080px] place-items-center gap-10 overflow-visible px-7 py-16 text-center sm:py-20 md:max-h-[530px] md:grid-cols-2 md:px-10 md:text-left lg:min-h-0 lg:w-[988px] lg:max-w-[988px] lg:gap-[101px] lg:px-0 lg:py-0 ${isReversed ? 'lg:grid-cols-[473px_414px]' : 'lg:grid-cols-[414px_473px]'}`}
            >
              <div className={isReversed ? 'md:order-2 lg:w-[414px]' : 'lg:w-[414px]'}>
                <LandingImage
                  className={`mx-auto h-[260px] w-[260px] sm:h-[320px] sm:w-[320px] lg:h-[530px] lg:w-[530px] ${isReversed ? 'lg:mx-0' : 'lg:mx-0 lg:-ml-[116px]'}`}
                  src={section.imageSrc}
                  alt={section.imageAlt}
                />
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
                className={buttonVariants({ variant: 'cta', size: 'cta' })}
              >
                sign up
              </Link>
              <Link
                href={loginHref}
                className={buttonVariants({ variant: 'ctaSecondary', size: 'cta', className: 'border-border text-foreground/80 shadow-[0_4px_0_hsl(var(--border))]' })}
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
