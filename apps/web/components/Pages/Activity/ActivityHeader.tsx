'use client'
import React, { useState, useRef, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ListTree, ChevronRight, MoreVertical, X, Check, FileText, Video, StickyNote, Backpack, Link2, Code2 } from 'lucide-react'
import { SiX, SiWhatsapp, SiReddit } from '@icons-pack/react-simple-icons'
import { Linkedin } from 'lucide-react'
import { getUriWithOrg, getAPIUrl, routePaths } from '@services/config/config'
import { useOrg, useOrgMembership } from '@components/Contexts/OrgContext'
import { markActivityAsComplete } from '@services/courses/activity'
import {
  findCourseRun,
  isCourseActivityCompleted,
} from '@services/courses/progress'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { mutate } from 'swr'
import { useTranslation } from 'react-i18next'

interface ActivityHeaderProps {
  course: any
  activity: any
  activityid: string
  courseuuid: string
  orgslug: string
  trailData?: any
  guestMode?: boolean
  publicGuestMode?: boolean
}

export default function ActivityHeader({ course, activity, activityid, courseuuid, orgslug, trailData, guestMode = false, publicGuestMode = false }: ActivityHeaderProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const org = useOrg() as any
  const session = useLHSession() as any
  const { isUserPartOfTheOrg } = useOrgMembership()
  const [isSticky, setIsSticky] = useState(false)
  const [chaptersOpen, setChaptersOpen] = useState(false)
  const [dotsOpen, setDotsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [embedCopied, setEmbedCopied] = useState(false)
  const [activityUrl, setActivityUrl] = useState('')
  const sentinelRef = useRef<HTMLDivElement>(null)
  const chaptersRef = useRef<HTMLDivElement>(null)
  const dotsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setActivityUrl(window.location.href)
  }, [])

  // Detect when the in-flow header has scrolled out of view
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => setIsSticky(!entry.isIntersecting),
      { rootMargin: '-60px 0px 0px 0px', threshold: 0 }
    )
    if (sentinelRef.current) observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (chaptersRef.current && !chaptersRef.current.contains(e.target as Node)) {
        setChaptersOpen(false)
      }
      if (dotsRef.current && !dotsRef.current.contains(e.target as Node)) {
        setDotsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const { allActivities, currentIndex } = useMemo(() => {
    let allActivities: any[] = []
    let currentIndex = -1
    const cleanActId = activityid.replace('activity_', '')

    course.chapters.forEach((chapter: any, chIdx: number) => {
      chapter.activities.forEach((act: any) => {
        const cleanUuid = act.activity_uuid?.replace('activity_', '')
        allActivities.push({ ...act, cleanUuid, chapterIndex: chIdx, chapterId: chapter.id, chapterName: chapter.name })
        if (cleanUuid === cleanActId) {
          currentIndex = allActivities.length - 1
        }
      })
    })

    return { allActivities, currentIndex }
  }, [course, activityid])

  const nextActivity = currentIndex >= 0 && currentIndex < allActivities.length - 1
    ? allActivities[currentIndex + 1]
    : null
  const cleanCourseUuid = courseuuid.replace('course_', '')
  const courseRun = useMemo(() => findCourseRun(trailData, course), [trailData, course])
  const isGuestLearner = guestMode || publicGuestMode

  const { completedCount, totalCount } = useMemo(() => {
    const completedCount = allActivities.filter((act: any) =>
      isCourseActivityCompleted(courseRun, act.id)
    ).length
    return { completedCount, totalCount: allActivities.length }
  }, [allActivities, courseRun])

  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0

  const isActivityDone = (act: any) => {
    return isCourseActivityCompleted(courseRun, act.id)
  }

  const isActivityCurrent = (act: any) =>
    act.activity_uuid?.replace('activity_', '') === activityid.replace('activity_', '')

  const handleNext = async () => {
    if (isLoading) return
    if (!isGuestLearner && !isUserPartOfTheOrg) return
    setIsLoading(true)
    const nextActivityPath = nextActivity
      ? routePaths.org.courseActivity(cleanCourseUuid, nextActivity.cleanUuid)
      : isGuestLearner
        ? `${routePaths.org.courseActivityEnd(cleanCourseUuid)}?guest_completed=1`
        : routePaths.org.courseActivityEnd(cleanCourseUuid)
    try {
      if (!(activity.activity_type === 'TYPE_QUIZ' && activity.details?.quiz_mode === 'graded')) {
        await markActivityAsComplete(orgslug, course.course_uuid, activity.activity_uuid, session.data?.tokens?.access_token)
        await mutate(`${getAPIUrl()}trail/org/${org?.id}/trail`)
      }
    } catch (_) {}
    router.push(getUriWithOrg(orgslug, nextActivityPath))
    setIsLoading(false)
  }

  const getActivityTypeIcon = (type: string) => {
    switch (type) {
      case 'TYPE_VIDEO': return <Video size={10} />
      case 'TYPE_DYNAMIC': return <StickyNote size={10} />
      case 'TYPE_ASSIGNMENT': return <Backpack size={10} />
      default: return <FileText size={10} />
    }
  }

  const cleanActivityId = activity.activity_uuid
    ? activity.activity_uuid.replace('activity_', '')
    : activityid.replace('activity_', '')
  const shareText = `Check out this activity: ${activity.name}`
  const encodedUrl = encodeURIComponent(activityUrl)
  const encodedText = encodeURIComponent(shareText)
  const embeddableTypes = ['TYPE_DYNAMIC', 'TYPE_VIDEO', 'TYPE_DOCUMENT']
  const isEmbeddable = embeddableTypes.includes(activity.activity_type)

  const getEmbedCode = () => {
    if (typeof window === 'undefined') return ''
    const baseUrl = window.location.origin
    return `<iframe src="${baseUrl}/embed/${orgslug}/course/${cleanCourseUuid}/activity/${cleanActivityId}" width="100%" height="600" frameborder="0" allowfullscreen></iframe>`
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(activityUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (_) {}
  }

  const copyEmbed = async () => {
    try {
      await navigator.clipboard.writeText(getEmbedCode())
      setEmbedCopied(true)
      setTimeout(() => setEmbedCopied(false), 2000)
    } catch (_) {}
  }

  const shareLinks = [
    {
      name: 'LinkedIn',
      icon: Linkedin,
      color: 'hover:bg-[#0A66C2] hover:text-white',
      url: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    },
    {
      name: 'X',
      icon: SiX,
      color: 'hover:bg-black hover:text-white',
      url: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`,
    },
    {
      name: 'WhatsApp',
      icon: SiWhatsapp,
      color: 'hover:bg-[#25D366] hover:text-white',
      url: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
    },
    {
      name: 'Reddit',
      icon: SiReddit,
      color: 'hover:bg-[#FF4500] hover:text-white',
      url: `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedText}`,
    },
  ]

  // Shared header row — rendered in-flow (transparent) and in the sticky overlay
  const headerRow = (
    <div className="flex items-center py-3 gap-3 sm:gap-4">

      {/* LEFT: Chapters button + dropdown */}
      <div className="relative flex-shrink-0" ref={chaptersRef}>
        <button
          onClick={() => setChaptersOpen(!chaptersOpen)}
          className="bg-white rounded-full px-3 sm:px-5 nice-shadow flex items-center space-x-2 p-2.5 text-gray-700 hover:bg-gray-50 transition-colors duration-200"
          aria-label={t('courses.chapters')}
        >
          <ListTree size={17} />
          <span className="text-xs font-bold hidden sm:inline">{t('courses.chapters')}</span>
        </button>

        {chaptersOpen && (
          <div
            className="absolute left-0 top-full mt-2 w-[280px] sm:w-72 max-h-[70vh] overflow-y-auto bg-white rounded-lg shadow-xl border border-gray-200 py-1 animate-in fade-in duration-200"
            style={{ zIndex: 'var(--z-dropdown)' }}
          >
            <div className="px-3 py-2.5 border-b border-gray-100 flex items-center justify-between gap-2">
              <Link
                href={getUriWithOrg(orgslug, routePaths.org.course(cleanCourseUuid))}
                className="font-semibold text-sm text-gray-900 hover:text-teal-600 transition-colors truncate"
                onClick={() => setChaptersOpen(false)}
              >
                {course.name}
              </Link>
              <button
                onClick={() => setChaptersOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 flex-shrink-0"
              >
                <X size={14} />
              </button>
            </div>

            <div className="py-0.5">
              {course.chapters.map((chapter: any, chIdx: number) => {
                const completedInChapter = chapter.activities.filter((a: any) => isActivityDone(a)).length
                return (
                  <div key={chapter.id}>
                    <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                      {t('courses.chapter')} {chIdx + 1} — {completedInChapter}/{chapter.activities.length}
                    </div>
                    {chapter.activities.map((act: any) => {
                      const isDone = isActivityDone(act)
                      const isCurrent = isActivityCurrent(act)
                      const cleanActUuid = act.activity_uuid?.replace('activity_', '')
                      return (
                        <Link
                          key={act.activity_uuid}
                          href={getUriWithOrg(orgslug, routePaths.org.courseActivity(cleanCourseUuid, cleanActUuid))}
                          prefetch={false}
                          onClick={() => setChaptersOpen(false)}
                          className={`flex items-center gap-2 px-3 py-2 text-xs transition-colors ${
                            isCurrent ? 'bg-gray-50 text-gray-900 font-medium' : 'text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          <div className={`w-[6px] h-[6px] rounded-full shrink-0 ${
                            isDone ? 'bg-teal-500' : isCurrent ? 'bg-gray-500 animate-pulse' : 'bg-zinc-200'
                          }`} />
                          <span className="text-neutral-400">{getActivityTypeIcon(act.activity_type)}</span>
                          <span className="truncate">{act.name}</span>
                          {isDone && <Check size={12} className="text-teal-500 ml-auto shrink-0" />}
                        </Link>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* CENTER: Course title + progress bar */}
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <p className="font-semibold text-gray-900 text-base truncate">{course.name}</p>
        <div className="flex items-center gap-2 mt-1 max-w-[320px]">
          <div className="flex-1 bg-zinc-200/80 rounded-full h-[4px] overflow-hidden">
            <div
              className="h-full bg-teal-500 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="text-[10px] text-gray-500 font-medium shrink-0">{completedCount}/{totalCount}</span>
        </div>
      </div>

      {/* RIGHT: Next button + dots menu */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {(guestMode || isUserPartOfTheOrg) && (
          <button
            onClick={handleNext}
            disabled={isLoading}
            className={`flex items-center gap-1 rounded-md px-2 sm:px-3 py-2 transition-colors ${
              !nextActivity
                ? 'bg-teal-600 text-white hover:bg-teal-700'
                : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
            } ${isLoading ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <div className="hidden sm:flex flex-col items-end leading-tight">
              <span className="text-[10px] font-bold uppercase opacity-70">
                {nextActivity ? t('common.next') : t('common.complete')}
              </span>
              <span className="text-xs font-semibold truncate max-w-[120px] sm:max-w-[160px]">
                {nextActivity ? nextActivity.name : course.name}
              </span>
            </div>
            <ChevronRight size={17} className="shrink-0" />
          </button>
        )}

        <div className="relative flex-shrink-0" ref={dotsRef}>
          <button
            onClick={() => setDotsOpen(!dotsOpen)}
            className="p-2 rounded-full bg-white nice-shadow text-gray-600 hover:bg-gray-50 transition-colors"
            aria-label="More options"
          >
            <MoreVertical size={16} />
          </button>

          {dotsOpen && (
            <div
              className="absolute right-0 top-full mt-2 bg-white rounded-lg nice-shadow py-1 min-w-[180px]"
              style={{ zIndex: 'var(--z-dropdown)' }}
            >
              {shareLinks.map((link) => {
                const Icon = link.icon
                return (
                  <a
                    key={link.name}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setDotsOpen(false)}
                    className={`flex items-center gap-2.5 px-3 py-2 text-sm text-neutral-600 transition-all duration-200 ${link.color}`}
                  >
                    <Icon size={16} />
                    <span>{link.name}</span>
                  </a>
                )
              })}
              <div className="border-t border-gray-100 my-1" />
              <button
                onClick={copyLink}
                className={`flex items-center gap-2.5 w-full px-3 py-2 text-sm transition-all duration-200 ${
                  copied ? 'bg-green-500 text-white' : 'text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                {copied ? <Check size={16} /> : <Link2 size={16} />}
                <span>{copied ? t('activities.link_copied') : t('activities.copy_link')}</span>
              </button>
              {isEmbeddable && (
                <button
                  onClick={copyEmbed}
                  className={`flex items-center gap-2.5 w-full px-3 py-2 text-sm transition-all duration-200 ${
                    embedCopied ? 'bg-green-500 text-white' : 'text-neutral-600 hover:bg-neutral-100'
                  }`}
                >
                  {embedCopied ? <Check size={16} /> : <Code2 size={16} />}
                  <span>{embedCopied ? t('activities.embed_code_copied') : t('activities.embed')}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

    </div>
  )

  return (
    <>
      {/* In-flow version: no background, becomes invisible when sticky kicks in */}
      <div ref={sentinelRef} className={isSticky ? 'invisible' : ''}>
        {headerRow}
      </div>

      {/* Sticky version: fixed at top with white bg + slide animation */}
      {isSticky && (
        <div
          className="fixed top-[60px] left-0 right-0 bg-white/95 backdrop-blur-xl border-b border-gray-100 nice-shadow animate-in fade-in slide-in-from-top duration-200"
          style={{ zIndex: 'var(--z-drag-overlay)' }}
        >
          <div className="max-w-(--breakpoint-2xl) mx-auto px-4 sm:px-6 lg:px-8">
            {headerRow}
          </div>
        </div>
      )}
    </>
  )
}
