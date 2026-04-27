type TrailStepLike = {
  activity_id?: number | null
  course_id?: number | null
  complete?: boolean | null
  data?: {
    course?: {
      id?: number | null
      course_uuid?: string | null
      uuid?: string | null
    } | null
  } | null
}

type TrailRunLike = {
  course_id?: number | null
  course_uuid?: string | null
  course?: {
    id?: number | null
    course_uuid?: string | null
    uuid?: string | null
  } | null
  steps?: TrailStepLike[] | null
}

type CourseLike = {
  id?: number | null
  course_uuid?: string | null
  chapters?: Array<{
    activities?: Array<{
      id?: number | null
    }>
  }>
}

function stripCoursePrefix(value?: string | null) {
  if (!value) return null
  return value.replace('course_', '')
}

function getRunCourseUuid(run?: TrailRunLike | null) {
  if (!run) return null

  return stripCoursePrefix(
    run.course_uuid ||
      run.course?.course_uuid ||
      run.course?.uuid ||
      run.steps?.[0]?.data?.course?.course_uuid ||
      run.steps?.[0]?.data?.course?.uuid ||
      null
  )
}

function getRunCourseId(run?: TrailRunLike | null) {
  if (!run) return null

  return (
    run.course_id ||
    run.course?.id ||
    run.steps?.[0]?.course_id ||
    run.steps?.[0]?.data?.course?.id ||
    null
  )
}

export function findCourseRun(
  trailData: { runs?: TrailRunLike[] | null } | null | undefined,
  course: CourseLike | null | undefined
) {
  const runs = trailData?.runs || []
  const targetCourseUuid = stripCoursePrefix(course?.course_uuid)
  const targetCourseId = course?.id ?? null

  return (
    runs.find((run) => {
      const runCourseUuid = getRunCourseUuid(run)
      if (targetCourseUuid && runCourseUuid === targetCourseUuid) return true

      const runCourseId = getRunCourseId(run)
      if (targetCourseId && runCourseId === targetCourseId) return true

      return false
    }) || null
  )
}

export function isTrailStepCompleted(step?: TrailStepLike | null) {
  return Boolean(step && step.complete !== false)
}

export function isCourseActivityCompleted(
  run: TrailRunLike | null | undefined,
  activityId: number | null | undefined
) {
  if (!run || !activityId) return false

  return Boolean(
    run.steps?.find(
      (step) => step.activity_id === activityId && isTrailStepCompleted(step)
    )
  )
}

export function getCompletedCourseStepCount(run: TrailRunLike | null | undefined) {
  if (!run?.steps?.length) return 0
  return run.steps.filter((step) => isTrailStepCompleted(step)).length
}

export function getCourseCompletionSummary(
  course: CourseLike | null | undefined,
  run: TrailRunLike | null | undefined
) {
  const allActivities =
    course?.chapters?.flatMap((chapter) => chapter.activities || []) || []

  const totalActivities = allActivities.length
  const completedActivities = allActivities.filter((activity) =>
    isCourseActivityCompleted(run, activity.id)
  ).length

  return {
    totalActivities,
    completedActivities,
    isCompleted:
      totalActivities > 0 && completedActivities >= totalActivities,
  }
}
