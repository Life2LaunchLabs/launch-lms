'use client'

import React from 'react'
import useSWR, { mutate } from 'swr'
import { toast } from 'react-hot-toast'
import { Award, BriefcaseBusiness, Compass, GraduationCap, Rocket } from 'lucide-react'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select'
import { getAPIUrl } from '@services/config/config'
import { getOrgCourses } from '@services/courses/courses'
import { updateOrgOnboardingConfig, type OnboardingConfig } from '@services/settings/org'
import { revalidateTags } from '@services/utils/ts/requests'

const GOALS = [
  { id: 'employment', label: 'Employment', icon: BriefcaseBusiness },
  { id: 'higher_education', label: 'Education', icon: GraduationCap },
  { id: 'self_starting', label: 'Self start', icon: Rocket },
  { id: 'not_sure', label: 'Not sure', icon: Compass },
] as const

const EMPTY_VALUE = '__none__'

type GoalId = typeof GOALS[number]['id']

function normalizeCourseUuid(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return trimmed.startsWith('course_') ? trimmed : `course_${trimmed}`
}

function getInitialRecommendations(org: any): Record<GoalId, string[]> {
  const config = org?.config?.config || {}
  const onboarding = config?.customization?.onboarding || config?.onboarding || {}
  const recommended = onboarding?.recommended_badges || {}
  return GOALS.reduce((acc, goal) => {
    acc[goal.id] = Array.from({ length: 3 }, (_, index) =>
      typeof recommended?.[goal.id]?.[index] === 'string' ? recommended[goal.id][index] : ''
    )
    return acc
  }, {} as Record<GoalId, string[]>)
}

export default function OrgEditOnboarding() {
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const org = useOrg() as any
  const [recommendations, setRecommendations] = React.useState<Record<GoalId, string[]>>(() =>
    getInitialRecommendations(org)
  )
  const [saving, setSaving] = React.useState(false)

  const { data: orgCourses } = useSWR(
    org?.slug && accessToken ? ['org-onboarding-courses', org.slug, accessToken] : null,
    () => getOrgCourses(org.slug, null, accessToken, true),
    { revalidateOnFocus: false }
  )

  React.useEffect(() => {
    setRecommendations(getInitialRecommendations(org))
  }, [org])

  const updateGoalBadge = (goal: GoalId, index: number, value: string) => {
    setRecommendations((current) => ({
      ...current,
      [goal]: current[goal].map((badge, badgeIndex) =>
        badgeIndex === index ? (value === EMPTY_VALUE ? '' : normalizeCourseUuid(value)) : badge
      ),
    }))
  }

  const save = async () => {
    setSaving(true)
    const loadingToast = toast.loading('Saving onboarding defaults')
    try {
      const payload: OnboardingConfig = {
        recommended_badges: GOALS.reduce((acc, goal) => {
          acc[goal.id] = recommendations[goal.id].map(normalizeCourseUuid).filter(Boolean).slice(0, 3)
          return acc
        }, {} as OnboardingConfig['recommended_badges']),
      }
      await updateOrgOnboardingConfig(org.id, payload, accessToken)
      await revalidateTags(['organizations'], org.slug)
      mutate(`${getAPIUrl()}orgs/slug/${org.slug}`)
      toast.success('Onboarding defaults saved', { id: loadingToast })
    } catch (error) {
      toast.error('Could not save onboarding defaults', { id: loadingToast })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="sm:mx-10 mx-0 rounded-xl bg-white nice-shadow">
      <div className="mx-3 my-3 flex flex-col gap-1 rounded-md bg-gray-50 px-5 py-3">
        <h1 className="text-xl font-bold text-gray-800">Onboarding defaults</h1>
        <p className="text-sm text-gray-500">
          Choose the three badges shown to new learners after they select a next step.
        </p>
      </div>

      <div className="mx-5 grid gap-4 pb-6 lg:grid-cols-2">
        {GOALS.map((goal) => {
          const Icon = goal.icon
          return (
            <section key={goal.id} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="mb-4 flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-700">
                  <Icon className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-gray-950">{goal.label}</h2>
                  <p className="text-xs text-gray-500">Recommended badges</p>
                </div>
              </div>
              <div className="space-y-3">
                {[0, 1, 2].map((index) => {
                  const value = recommendations[goal.id][index] || ''
                  return (
                    <div key={`${goal.id}-${index}`}>
                      <Label htmlFor={`${goal.id}-${index}`}>Badge {index + 1}</Label>
                      {Array.isArray(orgCourses) && orgCourses.length ? (
                        <Select
                          value={value || EMPTY_VALUE}
                          onValueChange={(nextValue) => updateGoalBadge(goal.id, index, nextValue)}
                        >
                          <SelectTrigger id={`${goal.id}-${index}`} className="mt-1">
                            <SelectValue placeholder="Select a badge" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={EMPTY_VALUE}>None</SelectItem>
                            {orgCourses.map((course: any) => (
                              <SelectItem key={course.course_uuid} value={course.course_uuid}>
                                {course.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          id={`${goal.id}-${index}`}
                          value={value}
                          onChange={(event) => updateGoalBadge(goal.id, index, event.target.value)}
                          placeholder="course_..."
                          className="mt-1"
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>

      <div className="flex justify-end border-t border-gray-100 px-5 py-4">
        <Button type="button" onClick={save} disabled={saving || !accessToken}>
          <Award className="mr-2 h-4 w-4" />
          Save recommendations
        </Button>
      </div>
    </div>
  )
}
