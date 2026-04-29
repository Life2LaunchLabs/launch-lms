export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { getOrganizationContextInfo } from '@services/organizations/orgs'

type PageProps = { params: Promise<{ orgslug: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { orgslug } = await params
  const org = await getOrganizationContextInfo(orgslug, { revalidate: 0, tags: ['organizations'] })
  return {
    title: org?.name ? `Welcome to ${org.name}` : 'Welcome',
    description: org?.description || '',
  }
}

export default async function WelcomePage({ params }: PageProps) {
  const { orgslug } = await params

  // Authenticated users go straight to the home page
  const session = await getServerSession()
  if (session) {
    redirect('/')
  }

  const quickstartHref = getUriWithOrg(orgslug, routePaths.org.quickstart())
  const loginHref = getUriWithOrg(orgslug, routePaths.auth.login())

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#1265c7] text-white">
      <Image
        src="/welcome_background.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="pointer-events-none select-none object-cover"
      />

      <section className="relative z-10 flex min-h-screen items-center justify-center overflow-hidden px-6 py-10 text-center sm:px-8 sm:py-12 xl:px-10 xl:py-5">
        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-0 h-[310px] -translate-y-[42%] sm:h-[520px] xl:h-[600px] xl:-translate-y-1/2">
          <Image
            src="/welcome_cards.png"
            alt=""
            width={1920}
            height={659}
            priority
            sizes="(max-width: 1023px) 175vw, 100vw"
            className="absolute left-1/2 top-1/2 w-[175vw] max-w-none -translate-x-1/2 -translate-y-1/2 select-none sm:w-[150vw] xl:w-[max(100vw,1180px)]"
          />
        </div>

        <div className="relative z-10 flex w-full max-w-[310px] flex-col items-center gap-7 sm:max-w-[560px] sm:gap-9 xl:block xl:h-[480px] xl:w-[1180px] xl:max-w-none xl:text-left">
          <div className="w-full xl:absolute xl:left-[80px] xl:top-[42px] xl:w-[390px]">
            <h1 className="text-[42px] font-black uppercase leading-[1.12] tracking-normal sm:text-[58px] md:text-[64px] xl:text-[48px]">
              Welcome to
              <br />
              the journey
              <br />
              of a lifetime.
            </h1>
            <div className="mx-auto mt-3 h-[3px] w-[78%] rounded-full bg-white/90 sm:mt-4 xl:mx-0 xl:ml-[32%] xl:w-[50%]" />
          </div>

          <Image
            src="/welcome_phone.png"
            alt="LaunchPad app preview"
            width={901}
            height={1103}
            priority
            sizes="(max-width: 639px) 220px, (max-width: 1023px) 340px, 420px"
            className="h-auto w-[220px] select-none translate-x-[-15%] translate-y-[10%] sm:w-[340px] xl:absolute xl:left-[45%] xl:top-[0px] xl:w-[455px] xl:translate-y-0 xl:-translate-x-1/2"
          />

          <div className="w-full xl:absolute xl:bottom-[20px] xl:right-0 xl:w-[360px]">
            <p className="text-[23px] font-medium leading-[1.38] tracking-normal text-white sm:text-[32px] sm:leading-[1.42] xl:text-[26px] xl:leading-[1.42]">
              The LaunchPad brings
              <br className="hidden sm:block" />
              <span className="bg-[#b96b5c]/80 px-1">resources</span>,{' '}
              <span className="bg-[#059eab]/85 px-1">learning</span>, and
              <br className="hidden sm:block" />
              <span className="bg-[#9a6473]/85 px-1">connection</span> together into
              <br className="hidden sm:block" />
              one platform, so you can
              <br className="hidden sm:block" />
              launch your life in one place.
            </p>
          </div>

          <div className="flex w-full flex-col items-center gap-3 sm:max-w-[520px] xl:absolute xl:bottom-[36px] xl:left-1/2 xl:w-[420px] xl:-translate-x-1/2">
            <Link
              href={quickstartHref}
              className="flex h-12 w-full items-center justify-center rounded-full bg-[#ff443c] px-8 text-center text-[20px] font-extrabold leading-none text-white shadow-[0_18px_42px_rgba(8,47,110,0.3)] ring-1 ring-white/60 transition-colors hover:bg-[#ff554e] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white sm:h-14 sm:text-[24px] xl:h-14 xl:text-[24px]"
            >
              Get Started
            </Link>

            <Link
              href={loginHref}
              className="flex h-8 w-[190px] items-center justify-center rounded-full border border-white bg-[#0d78d9]/40 px-6 text-xs font-bold text-white shadow-[0_10px_30px_rgba(8,47,110,0.25)] transition-colors hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white xl:w-[220px]"
            >
              Log In
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
