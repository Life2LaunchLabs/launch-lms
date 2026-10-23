'use client'

import React from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Award, Briefcase, Check, CircleHelp, FileText, Folder, Heart, Inbox, Star, Target, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'

/** When each beat of a scene lands (ms after the scene starts). The last beat holds. */
const BEATS = [[0, 250, 650, 1000, 1350], [0, 350, 1300, 2100, 2900, 3700], [0, 500, 1300, 2000, 2800, 3500, 4300], [0, 700, 1100, 1500]]
const PLAN_STEPS: Array<[string, string, 'done' | 'review' | 'question' | null, number]> = [
  ['Take the interest quiz', 'Activity', 'done', 2], ['Pick three careers to explore', 'Decision', 'done', 3],
  ['Share your resume draft', 'Upload', 'review', 4], ['Interview a nurse', 'Event', 'question', 5], ['Write what you learned', 'Write-up', null, 99],
]

function useBeat(scene: number) {
  const still = useReducedMotion()
  const [beat, setBeat] = React.useState(0)
  React.useEffect(() => {
    // Reduced motion: each scene shows its last frame.
    if (still) { setBeat(BEATS[scene].length - 1); return }
    setBeat(0)
    const timers = BEATS[scene].map((at, index) => window.setTimeout(() => setBeat(index), at))
    return () => timers.forEach(window.clearTimeout)
  }, [scene, still])
  return beat
}

const pop = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 }, transition: { duration: 0.35 } }

/**
 * The tour: one continuous scene in four beats. Maya's profile; her plan with steps ticking and
 * the cards you'd get; those cards becoming the mentor chat; the phone opening into a celebration.
 */
export default function TourScene({ scene }: { scene: number }) {
  const beat = useBeat(scene)
  const celebrating = scene === 3
  return <div aria-hidden="true" className="relative h-full w-full overflow-hidden rounded-[28px] bg-[#2a6fb8]">
    <motion.div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: 'url(/images/start/sky.webp)' }}
      animate={{ scale: celebrating ? 1.08 : 1, filter: scene === 1 || scene === 2 ? 'saturate(0.6) brightness(0.9)' : 'none' }} transition={{ duration: 1 }} />
    <motion.div className="absolute left-1/2 top-1/2 overflow-hidden bg-white shadow-2xl"
      initial={false}
      animate={celebrating ? { width: '100%', height: '100%', borderRadius: 28, x: '-50%', y: '-50%', opacity: 0 } : { width: 280, height: 540, borderRadius: 36, x: '-50%', y: '-50%', opacity: 1 }}
      transition={{ duration: 0.8, ease: [0.65, 0, 0.35, 1] }}>
      <AnimatePresence mode="wait">
        {scene === 0 ? <motion.div key="profile" {...pop} className="h-full"><Profile beat={beat} /></motion.div>
          : scene === 1 ? <motion.div key="plan" {...pop} className="h-full"><Plan beat={beat} /></motion.div>
            : <motion.div key="chat" {...pop} className="h-full"><Chat beat={scene === 2 ? beat : 9} /></motion.div>}
      </AnimatePresence>
    </motion.div>
    {/* The cards a mentor gets while Maya works; in the next beat they become the chat. */}
    <div className="pointer-events-none absolute inset-y-0 right-3 hidden w-48 flex-col justify-center gap-3 sm:flex">
      <AnimatePresence>
        {scene === 1 && beat >= 2 ? <Note key="n1" color="#13B3A4" icon={<Check size={14} />} title="Step completed" detail="Maya · Interest quiz" /> : null}
        {scene === 1 && beat >= 4 ? <Note key="n2" color="#C77A0E" icon={<Inbox size={14} />} title="Waiting for your review" detail="Resume draft" /> : null}
        {scene === 1 && beat >= 5 ? <Note key="n3" color="#6B3FE0" icon={<CircleHelp size={14} />} title="Maya asked a question" detail="Interview a nurse" /> : null}
      </AnimatePresence>
    </div>
    <AnimatePresence>{celebrating ? <Celebration key="cel" beat={beat} /> : null}</AnimatePresence>
  </div>
}

function Note({ color, icon, title, detail }: { color: string; icon: React.ReactNode; title: string; detail: string }) {
  return <motion.div initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -120, scale: 0.9 }} transition={{ duration: 0.4 }}
    className="flex items-center gap-2 rounded-2xl bg-white/95 p-2.5 text-xs shadow-lg">
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white" style={{ background: color }}>{icon}</span>
    <span className="min-w-0"><b className="block">{title}</b><span className="text-muted-foreground">{detail}</span></span>
  </motion.div>
}

function Profile({ beat }: { beat: number }) {
  const at = (b: number) => ({ initial: { opacity: 0, y: 8 }, animate: beat >= b ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }, transition: { duration: 0.35 } })
  const plans: Array<[string, string, string, React.ReactNode, number]> = [
    ['Career Explorer', 'Step 1 of 5', '#0B8077', <Briefcase key="b" size={15} />, 20], ['Money Basics', '4 of 9 done', '#5E9A14', <Wallet key="w" size={15} />, 44], ['My portfolio', '6 things I’ve made', '#C8327D', <Folder key="f" size={15} />, 0],
  ]
  return <div className="flex h-full flex-col">
    <div className="bg-gradient-to-b from-[#2F66D6] to-[#5B8DEF] px-5 pb-5 pt-10 text-center text-white">
      <motion.div {...at(1)} className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/25 text-xl font-black">MR</motion.div>
      <motion.b {...at(2)} className="mt-2 block text-lg">Maya Rivera</motion.b>
      <motion.span {...at(2)} className="block text-xs text-white/80">Building my launch · Class of 2027</motion.span>
    </div>
    <div className="space-y-2.5 p-4">
      <motion.div {...at(3)} className="flex items-center gap-3 rounded-2xl bg-amber-50 p-3"><Target size={18} className="text-amber-600" />
        <span><small className="block text-[10px] font-bold uppercase text-amber-700">My goal</small><b className="text-sm">Become a registered nurse</b></span></motion.div>
      <motion.p {...at(4)} className="pt-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">My plans</motion.p>
      {plans.map(([title, sub, color, icon, pct]) => <motion.div key={title} {...at(4)} className="flex items-center gap-3 rounded-2xl border border-border p-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl text-white" style={{ background: color }}>{icon}</span>
        <span className="min-w-0 flex-1"><b className="block text-[13px]">{title}</b><span className="text-[11px] text-muted-foreground">{sub}</span>
          {pct ? <span className="mt-1 block h-1 rounded-full bg-muted"><i className="block h-1 rounded-full" style={{ width: `${pct}%`, background: color }} /></span> : null}</span>
      </motion.div>)}
    </div>
  </div>
}

function Plan({ beat }: { beat: number }) {
  const done = PLAN_STEPS.filter(([, , kind, at]) => kind === 'done' && beat >= at).length + 1
  return <div className="flex h-full flex-col">
    <div className="bg-[#0B8077] px-5 pb-4 pt-10 text-white">
      <small className="text-[11px] text-white/75">Maya’s plan · Stage 1</small>
      <b className="block text-lg">Career Explorer</b>
      <div className="mt-2 h-1.5 rounded-full bg-white/25"><motion.i className="block h-1.5 rounded-full bg-white" animate={{ width: `${done * 20}%` }} transition={{ duration: 0.5 }} /></div>
      <div className="mt-1 flex justify-between text-[11px] text-white/80"><span>{done} of 5</span><span>Due Fri</span></div>
    </div>
    <div className="space-y-2 p-3">
      {PLAN_STEPS.map(([title, kind, flag, at], index) => {
        const checked = index === 0 || (flag === 'done' && beat >= at)
        const flagged = flag && flag !== 'done' && beat >= at
        return <div key={title} className={cn('flex items-center gap-2.5 rounded-xl border p-2.5 transition-colors', checked ? 'border-emerald-200 bg-emerald-50' : flagged ? 'border-amber-200 bg-amber-50' : 'border-border')}>
          <motion.span animate={{ scale: checked ? [1, 1.25, 1] : 1 }} className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2', checked ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-border')}>
            {checked ? <Check size={12} strokeWidth={3} /> : null}</motion.span>
          <span className="min-w-0 flex-1"><b className="block truncate text-[12px]">{title}</b><span className="text-[10px] text-muted-foreground">{kind}</span></span>
          {flagged ? <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800">{flag === 'review' ? 'Needs review' : 'Question'}</span> : null}
        </div>
      })}
    </div>
  </div>
}

function Chat({ beat }: { beat: number }) {
  const show = (b: number) => beat >= b
  return <div className="flex h-full flex-col bg-[#f6f7f9]">
    <div className="flex items-center gap-2.5 border-b border-border bg-white px-4 pb-3 pt-9">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2F66D6] text-xs font-black text-white">MR</span>
      <span className="min-w-0 flex-1"><b className="block text-[13px]">Maya Rivera</b><span className="text-[10px] text-muted-foreground">Career Explorer · Stage 1</span></span>
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Live</span>
    </div>
    <div className="flex-1 space-y-2.5 overflow-hidden p-3 text-[12px]">
      <AnimatePresence>
        {show(1) ? <motion.p key="sys" {...pop} className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground"><Check size={12} />Maya finished Pick three careers</motion.p> : null}
        {show(2) ? <motion.div key="sub" {...pop} className="rounded-2xl bg-white p-3 shadow-sm">
          <small className="text-[10px] font-bold uppercase text-amber-700">{show(3) ? 'Approved' : 'Waiting for your review'}</small>
          <div className="mt-1.5 flex items-center gap-2 rounded-lg bg-muted/60 p-2"><FileText size={14} className="text-red-500" />Maya_Resume_draft.pdf</div>
          {show(3) ? <p className="mt-2 flex items-center gap-1 text-[11px] font-bold text-emerald-700"><Check size={12} />Approved · added to her portfolio</p>
            : <div className="mt-2 flex gap-2 text-[11px] font-bold"><span className="rounded-full border border-border px-2.5 py-1">Ask for changes</span><span className="rounded-full bg-emerald-600 px-2.5 py-1 text-white">Approve</span></div>}
        </motion.div> : null}
        {show(4) ? <motion.div key="q" {...pop} className="max-w-[85%] rounded-2xl rounded-bl-sm bg-white p-2.5 shadow-sm">Quick question for the nurse interview, what should I ask her?</motion.div> : null}
        {beat === 5 ? <motion.div key="typing" {...pop} className="ml-auto flex w-14 justify-center gap-1 rounded-2xl bg-[#2F66D6] p-2.5">{[0, 1, 2].map((dot) => <motion.i key={dot} className="h-1.5 w-1.5 rounded-full bg-white" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 0.9, repeat: Infinity, delay: dot * 0.15 }} />)}</motion.div> : null}
        {show(6) ? <motion.div key="a" {...pop} className="relative ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-[#2F66D6] p-2.5 text-white">Ask what surprised her most about the job. You’ve got this!
          <span className="absolute -bottom-2 left-2 flex h-5 w-5 items-center justify-center rounded-full bg-white text-rose-500 shadow"><Heart size={11} fill="currentColor" /></span></motion.div> : null}
      </AnimatePresence>
    </div>
    <div className="m-3 rounded-full border border-border bg-white px-3 py-2 text-[11px] text-muted-foreground">Message Maya</div>
  </div>
}

function Celebration({ beat }: { beat: number }) {
  const tiles: Array<[string, string, string, string]> = [
    ['Hospital job shadow', 'Project', 'url(/images/start/neon-work.webp)', 'left-[6%] top-[12%]'], ['What I’m good at', 'Reflection', 'url(/images/start/neon-traits.webp)', 'right-[6%] top-[14%]'],
    ['Resume', 'Upload', 'hsl(222 80% 95%)', 'left-[8%] bottom-[12%]'], ['Career Explorer', 'Badge', 'hsl(40 90% 92%)', 'right-[7%] bottom-[10%]'],
  ]
  return <motion.div className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
    {tiles.map(([title, kind, background, place], index) => <motion.div key={title} className={cn('absolute w-32 rounded-2xl bg-white p-1.5 shadow-xl sm:w-36', place)}
      initial={{ opacity: 0, scale: 0.6 }} animate={beat >= 2 ? { opacity: 1, scale: 1 } : {}} transition={{ delay: index * 0.08, type: 'spring', stiffness: 220, damping: 18 }}>
      <div className="flex aspect-[4/3] items-center justify-center rounded-xl bg-cover bg-center" style={{ background, backgroundSize: 'cover' }}>{index === 3 ? <Award className="text-amber-500" size={28} /> : null}</div>
      <b className="mt-1 block truncate px-1 text-[11px]">{title}</b><span className="block px-1 text-[10px] text-muted-foreground">{kind}</span>
    </motion.div>)}
    <motion.div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center text-white"
      initial={{ opacity: 0, scale: 0.5 }} animate={beat >= 1 ? { opacity: 1, scale: 1 } : {}} transition={{ type: 'spring', stiffness: 200, damping: 14 }}>
      <span className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-amber-500 shadow-2xl ring-8 ring-white/30"><Award size={44} /></span>
      <b className="mt-4 text-xl drop-shadow">Maya is Launch Ready</b>
      <span className="text-sm text-white/85 drop-shadow">Badge earned · added to her portfolio</span>
    </motion.div>
    {[[18, 30], [80, 26], [30, 76], [72, 70], [50, 12], [12, 56], [88, 52]].map(([x, y], index) => <motion.span key={index} className="absolute text-amber-200" style={{ left: `${x}%`, top: `${y}%` }}
      initial={{ opacity: 0 }} animate={beat >= 3 ? { opacity: [0, 1, 0], scale: [0.6, 1.2, 0.6] } : {}} transition={{ duration: 1.6, repeat: Infinity, delay: index * 0.25 }}><Star size={16} fill="currentColor" /></motion.span>)}
  </motion.div>
}
