'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { getUriWithOrg } from '@services/config/config'
import { getOrgLogoMediaDirectory } from '@services/media/media'
import { useTranslation } from 'react-i18next'
import { ArrowRight } from 'lucide-react'

type HeroTab = 'courses' | 'communities' | 'live'

const HERO_TABS: { id: HeroTab; label: string; image: string }[] = [
  {
    id: 'courses',
    label: 'Courses',
    image: 'https://images.unsplash.com/photo-1501504905252-473c47e087f8?w=1200&q=80',
  },
  {
    id: 'communities',
    label: 'Communities',
    image: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1200&q=80',
  },
  {
    id: 'live',
    label: 'Live Sessions',
    image: 'https://images.unsplash.com/photo-1588196749597-9ff075ee6b5b?w=1200&q=80',
  },
]

const TESTIMONIALS = [
  {
    name: 'Jordan Mills',
    role: 'Recent Graduate',
    quote: "Life2Launch gave me a real framework for figuring out what I actually wanted — not just a job, but a life. I went from completely lost to having a clear plan in six weeks.",
    image: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=400&q=80',
  },
  {
    name: 'Priya Nair',
    role: 'College Junior',
    quote: "I've taken a lot of courses, but nothing ever addressed the real stuff — like how to deal with fear, build identity, and actually take action. This did all of that.",
    image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&q=80',
  },
  {
    name: 'Marcus Okafor',
    role: 'Gap Year Student',
    quote: "The community alone was worth it. I found people who were going through the exact same thing and we kept each other accountable. Genuinely life-changing.",
    image: 'https://images.unsplash.com/photo-1506277886164-e25aa3f4ef7f?w=400&q=80',
  },
  {
    name: 'Sofia Reyes',
    role: 'First-Gen Student',
    quote: "Nobody in my family had done this before. Life2Launch was the guide I never had — practical, honest, and actually made for people like me.",
    image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&q=80',
  },
]

interface WelcomeClientProps {
  org: any
  orgslug: string
  onboardingCourse: any | null
}

export default function WelcomeClient({ org, orgslug, onboardingCourse }: WelcomeClientProps) {
  const { t } = useTranslation()
  const firstOnboardingActivity = onboardingCourse?.chapters?.[0]?.activities?.[0]
  const signupHref = firstOnboardingActivity
    ? getUriWithOrg(
        orgslug,
        `/onboarding/course/${onboardingCourse.course_uuid.replace('course_', '')}/activity/${firstOnboardingActivity.activity_uuid.replace('activity_', '')}`
      )
    : getUriWithOrg(orgslug, '/signup')
  const loginHref = getUriWithOrg(orgslug, '/login')
  const [activeTab, setActiveTab] = useState<HeroTab>('courses')
  const [activeTestimonial, setActiveTestimonial] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setActiveTestimonial((i) => (i + 1) % TESTIMONIALS.length)
    }, 5000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="h-full bg-white relative">
      {/* dot grid on entire page bg */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-[0.12]"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.8) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />

      {/* ── Hero ────────────────────────────────────────────────────── */}
      {/* -mt-[60px] so the section slides behind the fixed nav */}
      <div className="relative -mt-[60px]">
        {/* Background layers */}
        <div className="absolute inset-0 z-0 overflow-hidden">
          {/* Landscape photo */}
          <Image
            src="https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1800&q=80"
            alt=""
            fill
            priority
            className="object-cover object-center"
            sizes="100vw"
          />
          {/* Deep navy gradient over the photo */}
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(160deg, rgba(0,33,71,0.20) 0%, rgba(0,48,102,0.40) 40%, rgba(0,26,61,0.60) 100%)' }}
          />
          {/* Large grid */}
          <div
            className="absolute inset-0 opacity-[0.14]"
            style={{
              backgroundImage: `
                linear-gradient(rgba(120,165,255,0.6) 1px, transparent 1px),
                linear-gradient(90deg, rgba(120,165,255,0.6) 1px, transparent 1px),
                linear-gradient(rgba(120,165,255,0.3) 0.5px, transparent 0.5px),
                linear-gradient(90deg, rgba(120,165,255,0.3) 0.5px, transparent 0.5px)`,
              backgroundSize: '120px 120px, 120px 120px, 24px 24px, 24px 24px',
            }}
          />
          {/* Fade to white at the bottom */}
          <div className="absolute bottom-0 left-0 right-0 h-[400px] bg-gradient-to-t from-white via-white/70 to-transparent" />
        </div>

        {/* Hero content */}
        <div className="relative z-10 pt-28 md:pt-36 px-6 md:px-12 lg:px-20">
          <div className="max-w-5xl mx-auto">
            <h1 className="text-white font-black text-[36px] md:text-[60px] lg:text-[76px] leading-[1.05] tracking-tight max-w-4xl">
              YOUR LIFE.
              <br></br>
              YOUR WAY.
              <br></br>
              YOUR LAUNCH.
            </h1>

            {/* Flex row: divider line left + sub-copy right */}
            <div className="mt-8 md:mt-10 flex flex-col md:flex-row md:items-start gap-10 md:justify-end">
              <div className="flex-1 h-px bg-white/40 mt-3 hidden md:block" />
              <div className="max-w-lg">
                <p className="text-white/80 text-base md:text-lg leading-relaxed font-medium">
                    Gain the skills you need to launch with confidence and direction.
                  </p>
                <div className="flex flex-row gap-3 mt-8">
                  <Link
                    href={signupHref}
                    className="px-4 py-1.5 text-[15px] font-bold bg-white text-black rounded-lg hover:bg-white/90 transition-colors"
                  >
                    Get Started
                  </Link>
                  <Link
                    href={loginHref}
                    className="px-4 py-1.5 text-[15px] font-bold border border-white/30 text-white rounded-lg hover:bg-white/10 transition-colors"
                  >
                    {t('auth.login')}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Tab switcher ── */}
        <div className="relative z-10 mt-12 md:mt-16 px-6 md:px-12 lg:px-20 pb-0">
          <div className="max-w-5xl mx-auto">
            {/* Tab buttons */}
            <div className="flex gap-1 p-1 rounded-xl bg-white/10 backdrop-blur-sm w-fit mb-4">
              {HERO_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
                    activeTab === tab.id
                      ? 'bg-white text-black shadow-sm'
                      : 'text-white/70 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Image frame */}
            <div className="rounded-2xl aspect-[5/3] bg-white p-3 ring-1 ring-white/20 nice-shadow">
              <div className="relative rounded-lg overflow-hidden w-full h-full nice-shadow">
                {HERO_TABS.map((tab) => (
                  <Image
                    key={tab.id}
                    src={tab.image}
                    alt={tab.label}
                    fill
                    className={`object-cover object-top transition-opacity duration-500 ${
                      activeTab === tab.id ? 'opacity-100' : 'opacity-0'
                    }`}
                    sizes="(max-width: 768px) 100vw, 960px"
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom spacing so fade-to-white has room */}
        <div className="relative z-10 h-24 md:h-40" />
      </div>

      {/* ── Statement block ─────────────────────────────────────────── */}
      <div className="px-6 md:px-12 lg:px-20 mt-4 relative z-10">
        <div className="max-w-7xl mx-auto rounded-2xl nice-shadow overflow-hidden bg-white py-16 md:py-24 px-10 md:px-20 relative">
          
          <div className="max-w-3xl mx-auto relative z-10">
            <p className="text-black/30 text-2xl md:text-[32px] leading-[1.4] font-semibold">
              A new way to learn together.
            </p>
            <p className="mt-6 text-black text-2xl md:text-[32px] leading-[1.4] font-semibold">
              {/* {org?.name || 'This platform'} brings together{' '}
              <span className="inline-flex items-center align-middle rounded-xl px-2.5 py-1 gap-1.5 bg-blue-500 text-white text-[0.75em] font-bold">
                Courses
              </span>{' '}
              rich{' '}
              <span className="inline-flex items-center align-middle rounded-xl px-2.5 py-1 gap-1.5 bg-orange-500 text-white text-[0.75em] font-bold">
                Content
              </span>{' '}
              and interactive{' '}
              <span className="inline-flex items-center align-middle rounded-xl px-2.5 py-1 gap-1.5 bg-cyan-500 text-white text-[0.75em] font-bold">
                Activities
              </span>{' '}
              — all in one place. */}
              Life2Launch Core breaks down the life launching process into the fundamental domains - your {' '}
              <span className="inline-flex items-center align-middle rounded-xl px-2.5 py-1 gap-1.5 bg-yellow-500 text-white text-[0.75em] font-bold">
                Inner World
              </span>{' '}
              ,{' '}
              <span className="inline-flex items-center align-middle rounded-xl px-2.5 py-1 gap-1.5 bg-orange-500 text-white text-[0.75em] font-bold">
                Outer World
              </span>{' '}
              ,{' '}
              <span className="inline-flex items-center align-middle rounded-xl px-2.5 py-1 gap-1.5 bg-blue-500 text-white text-[0.75em] font-bold">
                Lifestyle Design
              </span>{' '}
              , and{' '}
              <span className="inline-flex items-center align-middle rounded-xl px-2.5 py-1 gap-1.5 bg-red-500 text-white text-[0.75em] font-bold">
                Taking Action
              </span>{' '}
            </p>
            <p className="mt-8 text-black text-2xl md:text-[32px] leading-[1.4] font-semibold whitespace-pre-line">
              {`Learn at your pace.\nGrow with a community.`}
            </p>
            <p className="mt-8 text-black/30 text-2xl md:text-[32px] leading-[1.4] font-semibold">
              Built to make learning simple, engaging, and effective.
            </p>
          </div>
        </div>
      </div>


      {/* ── founders block ─────────────────────────────────────────────── */}
      <div className="px-6 md:px-12 lg:px-20 mt-4 relative z-10">
        <div className="max-w-7xl mx-auto rounded-2xl nice-shadow overflow-hidden bg-[#001a3d]">
          <div className="grid grid-cols-1 lg:grid-cols-2 min-h-[360px]">
            {/* Left: copy + awards */}
            <div className="flex flex-col justify-center p-10 md:p-14 lg:p-16">
              <p className="text-xs font-bold uppercase tracking-widest text-white/30 mb-3">Who we are</p>
              <h2 className="text-white font-black text-[28px] md:text-[38px] leading-[1.1] tracking-tight">
                Created by Gen Z,<br />for Gen Z.
              </h2>
              <p className="mt-4 text-white/50 text-base md:text-lg leading-relaxed font-medium max-w-sm">
                We're changing the conversation around life launching.
              </p>
              {/* Award images */}
              <div className="mt-10 flex items-center gap-4 w-full">
                {[
                  'https://static.wixstatic.com/media/99f1c3_e088b66fb66b4d6bb4bf6728ca3cac22~mv2.png/v1/fill/w_281,h_281,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/Tech%20Start%20up%20People%E2%80%99s%20Choice%20(5).png',
                  'https://static.wixstatic.com/media/99f1c3_44bb98c276f746f68c6d1f1a0e9ec79b~mv2.png/v1/fill/w_204,h_204,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/Tech%20Start%20up%20People%E2%80%99s%20Choice%20(3).png',
                  'https://static.wixstatic.com/media/99f1c3_45f92e097e1940ba94a0dfec26c04b55~mv2.png/v1/fill/w_214,h_214,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/Tech%20Start%20up%20People%E2%80%99s%20Choice%20(6).png',
                ].map((src, i) => (
                  <div key={i} className="relative flex-1 aspect-square">
                    <Image
                      src={src}
                      alt="Award"
                      fill
                      className="object-contain"
                      sizes="33vw"
                      style={i === 1 ? { transform: 'scale(0.9)' } : undefined}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Right: founders photo */}
            <div className="relative min-h-[300px] lg:min-h-0 overflow-hidden">
              <Image
                src="https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=800&q=80"
                alt="Founders"
                fill
                className="object-cover object-center"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Spacer ──────────────────────────────────────────────────── */}
      <div className="h-4 md:h-6" />

      {/* ── Testimonials ─────────────────────────────────────────────── */}
      <div className="px-6 md:px-12 lg:px-20 mt-4 relative z-10">
        <div className="max-w-7xl mx-auto">
          <div className="rounded-2xl nice-shadow overflow-hidden bg-white">
            <div className="grid grid-cols-1 lg:grid-cols-2 lg:h-[480px]">
              {/* Left: person image in circle */}
              <div className="flex items-center justify-center bg-white p-8 h-64 lg:h-full">
                <div className="relative h-full aspect-square rounded-full overflow-hidden ring-1 ring-black/10 nice-shadow">
                  {TESTIMONIALS.map((t, i) => (
                    <Image
                      key={t.name}
                      src={t.image}
                      alt={t.name}
                      fill
                      className={`object-cover object-top transition-opacity duration-500 ${i === activeTestimonial ? 'opacity-100' : 'opacity-0'}`}
                      sizes="256px"
                    />
                  ))}
                </div>
              </div>

              {/* Right: quote */}
              <div className="flex flex-col p-10 md:p-12 lg:p-14 h-full">
                {/* Quote mark — fixed */}
                <svg className="text-black/10 mb-6 flex-shrink-0" width="48" height="48" viewBox="0 0 48 48" fill="currentColor">
                  <path d="M14 22c0-5.523 4.477-10 10-10V8C12.954 8 4 16.954 4 28v12h16V22h-6zm20 0c0-5.523 4.477-10 10-10V8c-11.046 0-20 8.954-20 20v12h16V22h-6z"/>
                </svg>

                {/* Quote text — grows but capped */}
                <p className="text-black text-xl md:text-2xl leading-[1.5] font-semibold overflow-hidden" style={{ display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical' }}>
                  {TESTIMONIALS[activeTestimonial].quote}
                </p>

                {/* Name + role — fixed */}
                <div className="mt-6 flex-shrink-0">
                  <p className="text-black font-bold text-[15px]">{TESTIMONIALS[activeTestimonial].name}</p>
                  <p className="text-black/40 text-sm">{TESTIMONIALS[activeTestimonial].role}</p>
                </div>

                {/* Spacer pushes avatars to bottom */}
                <div className="flex-1" />

                {/* Avatar switcher — fixed at bottom */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  {TESTIMONIALS.map((t, i) => (
                    <button
                      key={t.name}
                      onClick={() => setActiveTestimonial(i)}
                      className={`relative rounded-full overflow-hidden flex-shrink-0 transition-all duration-200 ${
                        i === activeTestimonial
                          ? 'w-12 h-12 ring-2 ring-black ring-offset-2'
                          : 'w-9 h-9 opacity-40 hover:opacity-70'
                      }`}
                    >
                      <Image src={t.image} alt={t.name} fill className="object-cover object-top" sizes="48px" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Spacer ──────────────────────────────────────────────────── */}
      <div className="h-4 md:h-6" />


      {/* ── Final CTA ────────────────────────────────────────────────── */}
      <div className="relative z-10 mt-4 pb-0">
        {/* Full-width background image */}
        <div className="absolute inset-0 overflow-hidden">
          <Image
            src="https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1800&q=80"
            alt=""
            fill
            className="object-cover object-center"
            sizes="100vw"
          />
          {/* Dark overlay */}
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(160deg, rgba(0,33,71,0.88) 0%, rgba(0,48,102,0.82) 40%, rgba(0,26,61,0.92) 100%)' }}
          />
          {/* Grid overlay */}
          <div
            className="absolute inset-0 opacity-[0.10] pointer-events-none"
            style={{
              backgroundImage: `
                linear-gradient(rgba(120,165,255,0.6) 1px, transparent 1px),
                linear-gradient(90deg, rgba(120,165,255,0.6) 1px, transparent 1px)`,
              backgroundSize: '80px 80px',
            }}
          />
        </div>

        <div className="relative z-10 px-10 md:px-20 py-24 md:py-36 flex flex-col items-center text-center">
          <h2 className="text-white font-black text-[32px] md:text-[48px] leading-[1.08] tracking-tight max-w-2xl">
            Ready to start learning?
          </h2>
          <p className="mt-4 text-white/60 text-base md:text-lg font-medium max-w-md">
            Join {org?.name || 'the community'} and start your journey today - it's free!
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-3">
            <Link
              href={signupHref}
              className="inline-flex items-center gap-2 px-6 py-2.5 text-[15px] font-bold bg-white text-black rounded-lg hover:bg-white/90 transition-colors"
            >
              {t('auth.sign_up')} <ArrowRight size={15} />
            </Link>
            <Link
              href={loginHref}
              className="inline-flex items-center px-6 py-2.5 text-[15px] font-bold border border-white/30 text-white rounded-lg hover:bg-white/10 transition-colors"
            >
              {t('auth.login')}
            </Link>
          </div>
        </div>
      </div>

    </div>
  )
}
