'use client'

import type { ComponentType } from 'react'
import { Award, BookOpen, BriefcaseBusiness, GraduationCap, HandHeart, Lightbulb, Mountain, Palette, ShieldCheck, Sparkles, Trophy, Wrench } from 'lucide-react'
import { PALETTE, type TileColor } from './parts'

// Stand-in covers until a learner adds a photo: each kind of thing gets its own picture, so experience,
// projects and credentials never look alike and each experience type is told apart at a glance.

type Look = { icon: ComponentType<{ className?: string; strokeWidth?: number }>; color: TileColor; label: string; also?: ComponentType<{ className?: string; strokeWidth?: number }>[] }

/** Each experience type, its picture and its color. Older type names sit with the type that replaced them. */
export const EXPERIENCE_LOOKS: Record<string, Look> = {
  work_career: { icon: BriefcaseBusiness, color: 'teal', label: 'Work & Career' },
  education: { icon: GraduationCap, color: 'blue', label: 'Education' },
  leadership_service: { icon: HandHeart, color: 'orange', label: 'Leadership & Service' },
  learning_experiences: { icon: BookOpen, color: 'violet', label: 'Learning' },
  teams_activities: { icon: Trophy, color: 'lime', label: 'Teams & Activities' },
  awards_recognition: { icon: Award, color: 'amber', label: 'Awards' },
  challenges_milestones: { icon: Mountain, color: 'sky', label: 'Milestones' },
  other: { icon: Sparkles, color: 'pink', label: 'Experience' },
}
const LEGACY: Record<string, string> = { employment: 'work_career', volunteering: 'leadership_service', training: 'learning_experiences', experience: 'other' }
export const experienceLook = (type?: string) => EXPERIENCE_LOOKS[LEGACY[type || ''] || type || ''] || EXPERIENCE_LOOKS.other

const PROJECT: Look = { icon: Lightbulb, color: 'pink', label: 'Project', also: [Palette, Wrench] }
const CREDENTIAL: Look = { icon: ShieldCheck, color: 'blue', label: 'Credential' }

/** A photo when there is one; otherwise the kind's own picture. */
export function KindCover({ url, kind, type, className = '' }: { url?: string; kind: 'experience' | 'project' | 'credential'; type?: string; className?: string }) {
  if (url) return <img src={url} alt="" className={`h-full w-full object-cover ${className}`} />
  const look = kind === 'project' ? PROJECT : kind === 'credential' ? CREDENTIAL : experienceLook(type)
  const [face, edge, soft] = PALETTE[look.color]
  const Icon = look.icon
  const pattern = kind === 'project'
    ? `radial-gradient(circle at 1px 1px, rgba(255,255,255,.28) 1.4px, transparent 0) 0 0/18px 18px`
    : kind === 'credential' ? `repeating-linear-gradient(135deg, rgba(255,255,255,.12) 0 10px, transparent 10px 22px)`
    : `radial-gradient(circle at 18% 22%, ${soft}55 0 18%, transparent 19%)`
  return <div aria-hidden="true" className={`relative h-full w-full overflow-hidden ${className}`} style={{ background: `${pattern}, linear-gradient(140deg, ${face}, ${edge})` }}>
    <span className="absolute -left-[12%] bottom-[-30%] aspect-square w-[55%] rounded-full bg-white/10" />
    <Icon strokeWidth={1.6} className="absolute bottom-[-12%] right-[-4%] h-[88%] w-auto rotate-[-12deg] text-white/30" />
    {(look.also || []).map((Extra, index) => <Extra key={index} strokeWidth={2} className={`absolute h-[22%] w-auto text-white/35 ${index ? 'left-[30%] top-[14%] rotate-[14deg]' : 'left-[8%] top-[46%] rotate-[-10deg]'}`} />)}
  </div>
}
