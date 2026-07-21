'use client'

import Link from 'next/link'
import { Award, CheckCircle2, ChevronRight } from 'lucide-react'
import { SafeImage } from '@components/Objects/SafeImage'
import { getUriWithOrg } from '@services/config/config'

export default function LearningBadgeOverview({ orgslug, badgePath }: { orgslug: string; badgePath: any }) {
  const badge = badgePath?.badge || {}
  const activities = badgePath?.activities || []
  const completed = Boolean(badgePath?.run?.award || badgePath?.run?.status === 'completed')

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8">
      <section className="overflow-hidden rounded-2xl bg-card shadow-sm">
        <div className="grid gap-8 p-6 md:grid-cols-[260px_1fr] md:p-8">
          <div className="flex aspect-square items-center justify-center overflow-hidden rounded-2xl bg-muted text-lime-500">
            {badge.thumbnail_image ? <SafeImage src={badge.thumbnail_image} alt={badge.name || 'Badge'} className="h-full w-full object-cover" /> : <Award size={72} strokeWidth={1.4} />}
          </div>
          <div className="flex flex-col justify-center">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <Award size={15} /> Learning badge
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-foreground sm:text-4xl">{badge.name}</h1>
            <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">{badge.description || badge.about || 'Complete the learning path to earn this badge.'}</p>
            {completed ? <div className="mt-5 inline-flex w-fit items-center gap-2 rounded-full bg-green-50 px-3 py-1.5 text-sm font-bold text-green-700"><CheckCircle2 size={17} /> Badge earned</div> : null}
          </div>
        </div>
      </section>
      <section className="mt-8">
        <h2 className="text-xl font-black text-foreground">Learning path</h2>
        <div className="mt-4 space-y-3">
          {activities.map((activity: any, index: number) => (
            <Link key={activity.activity_uuid} href={getUriWithOrg(orgslug, `/badges/${badge.badge_uuid}/chapter/${activity.activity_uuid}`)} className="flex items-center gap-4 rounded-xl bg-card p-4 shadow-sm transition hover:-translate-y-0.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-black">{index + 1}</span>
              <div className="min-w-0 flex-1"><h3 className="font-bold text-foreground">{activity.title}</h3><p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{activity.description || `${activity.pages?.length || 0} pages`}</p></div>
              <ChevronRight className="text-muted-foreground" size={20} />
            </Link>
          ))}
          {!activities.length ? <div className="rounded-xl border-2 border-dashed border-border p-10 text-center text-sm text-muted-foreground">No learning activities are available yet.</div> : null}
        </div>
      </section>
    </main>
  )
}
