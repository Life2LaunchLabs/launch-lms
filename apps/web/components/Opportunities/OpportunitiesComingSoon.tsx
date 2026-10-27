import React from 'react'
import { Building2, GraduationCap, Mail, MapPin, UserRound } from 'lucide-react'

/** Opportunities before it exists: what it will be, laid out like the Plans welcome. */
export default function OpportunitiesComingSoon() {
  return <div className="min-h-full w-full bg-[#f8f8f8]">
    <section className="mx-auto grid min-h-[calc(100vh-120px)] max-w-[1180px] items-center gap-7 px-4 py-7 sm:px-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-12">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.06em] text-[#B4500F]">Coming soon</p>
        <h1 className="mt-3 text-[clamp(34px,4vw,52px)] font-extrabold leading-[1.02] tracking-[-0.04em]">Opportunities</h1>
        <p className="mt-3.5 max-w-[460px] text-[17px] leading-normal text-muted-foreground">Connect your learners with the people near them who’ll talk, show them around, or hire them. Their portfolio does the introducing.</p>
        <div className="mt-7 grid max-w-[440px] gap-2.5">
          <Who color="#2F66D6" icon={<GraduationCap size={24} />} title="Schools and programs" detail="Choose where opportunities come from and keep staff in every conversation" />
          <Who color="#0B8077" icon={<Building2 size={24} />} title="Workforce boards and employers" detail="Post opportunities for one shop or fifty, by hand, CSV or feed" />
        </div>
        <p className="mt-5 max-w-[440px] text-[13.5px] text-muted-foreground">We’re shaping this with schools and workforce partners now.</p>
      </div>
      <div className="grid gap-3.5">
        <Feature tone="bg-[hsl(30_100%_94%)] text-[hsl(20_70%_18%)]" color="#E0650F" icon={<MapPin size={19} />} title="Local, not a job board"
          detail="A short list of nearby people and places: a talk, a visit, a project, a job. Learners ask with a note, not a hundred applications."
          art={<Mini>{([['#E0650F', 'Ask a welder anything', '4 mi'], ['#C77A0E', 'Equipment yard tour', '7 mi'], ['#C8327D', 'Design the 5K shirt', '$150']] as const).map(([color, label, meta]) =>
            <div key={label} className="flex items-center gap-2 rounded-lg bg-[hsl(200_22%_96%)] p-1.5"><i className="h-5 w-5 shrink-0 rounded-md" style={{ background: color }} />{label}<span className="ml-auto text-[10.5px] font-medium text-muted-foreground">{meta}</span></div>)}</Mini>} />
        <Feature flip tone="bg-[hsl(190_60%_94%)] text-[hsl(195_60%_14%)]" color="#0B8077" icon={<Mail size={19} />} title="Hosts answer from email"
          detail="A small business owner gets one email when a learner reaches out, and answers with a tap. No account needed."
          art={<Mini chat>
            <span>Maya would like 20 minutes of your time</span>
            <span className="grid grid-cols-2 gap-1.5"><b className="rounded-md bg-[#E0650F] py-1 text-center text-white">Yes, let’s talk</b><b className="rounded-md bg-[hsl(200_22%_94%)] py-1 text-center">Not right now</b></span>
          </Mini>} />
        <Feature tone="bg-[hsl(255_70%_95%)] text-[hsl(255_40%_20%)]" color="#6B3FE0" icon={<UserRound size={19} />} title="The portfolio does the introducing"
          detail="Learners choose the projects and badges a host sees, so the work they’ve put in is what opens the door."
          art={<Mini>
            <div className="flex items-center gap-2 p-1"><span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-[#6B3FE0] text-[9px] font-bold text-white">MT</span>Maya Torres, junior</div>
            {['Trailer hitch rebuild', 'Intro to MIG Welding badge'].map((label) => <div key={label} className="rounded-lg bg-[hsl(200_22%_96%)] p-1.5">{label}</div>)}
          </Mini>} />
      </div>
    </section>
  </div>
}

function Who({ color, icon, title, detail }: { color: string; icon: React.ReactNode; title: string; detail: string }) {
  return <div className="flex w-full items-center gap-4 rounded-[18px] border-[1.5px] border-border bg-card px-[18px] py-4">
    <span className="grid h-12 w-12 flex-none place-items-center rounded-[14px] text-white" style={{ background: color }}>{icon}</span>
    <span className="min-w-0"><b className="block text-base">{title}</b><span className="text-[13.5px] text-muted-foreground">{detail}</span></span>
  </div>
}

function Feature({ tone, color, icon, title, detail, art, flip }: { tone: string; color: string; icon: React.ReactNode; title: string; detail: string; art: React.ReactNode; flip?: boolean }) {
  return <div className={`grid min-h-[150px] items-center gap-5 overflow-hidden rounded-[22px] px-6 py-[22px] sm:grid-cols-[minmax(0,1fr)_210px] ${tone} ${flip ? 'sm:grid-cols-[210px_minmax(0,1fr)]' : ''}`}>
    <div className={flip ? 'sm:order-2' : ''}>
      <span className="mb-2.5 grid h-[38px] w-[38px] place-items-center rounded-full text-white" style={{ background: color }}>{icon}</span>
      <h3 className="text-lg font-bold">{title}</h3>
      <p className="mt-1.5 text-sm leading-[1.45] opacity-80">{detail}</p>
    </div>
    <div aria-hidden="true">{art}</div>
  </div>
}

function Mini({ children, chat }: { children: React.ReactNode; chat?: boolean }) {
  return <div className={`grid rounded-xl bg-white text-[11.5px] font-semibold text-[hsl(200_30%_9%)] shadow-[0_10px_24px_rgba(15,30,40,0.12)] ${chat ? 'gap-2 p-3' : 'gap-1.5 p-2.5'}`}>{children}</div>
}
