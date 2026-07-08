function cleanBadgeId(value?: string | null) {
  return String(value || '').replace(/^badge_/, '')
}

export function cleanLearningCollectionId(value?: string | null) {
  return String(value || '')
    .replace(/^badge_collection_migrated_/, '')
    .replace(/^badge_collection_/, '')
    .replace(/^collection_badge_migrated_/, '')
    .replace(/^collection_/, '')
}

function getBadgeStatus(badge: any) {
  return badge?.status || 'draft'
}

function getLearningActivityType(activity: any) {
  const firstPageType = activity?.pages?.[0]?.page_type
  if (firstPageType === 'video') return 'TYPE_VIDEO'
  if (firstPageType === 'multiple_choice' || firstPageType === 'text_input' || firstPageType === 'question_response') return 'TYPE_QUIZ'
  return 'TYPE_DYNAMIC'
}

function isLearningActivityComplete(activity: any, run: any) {
  const requiredPages = (activity?.pages || []).filter((page: any) => page.required !== false)
  if (!requiredPages.length) return false
  const progressByPage = new Map<string, any>(
    (run?.page_progress || []).map((progress: any) => [progress.page_uuid, progress])
  )
  return requiredPages.every((page: any) => progressByPage.get(page.page_uuid)?.complete === true)
}

export function learningPathToLegacyRun(badgePath: any) {
  const badge = badgePath?.badge
  const run = badgePath?.run
  if (!badge || !run) return null

  const completedActivities = (badgePath.activities || []).filter((activity: any) =>
    isLearningActivityComplete(activity, run)
  )

  return {
    id: run.id,
    course_id: badge.id,
    course_uuid: badge.badge_uuid,
    course_total_steps: (badgePath.activities || []).length,
    update_date: run.completed_at || run.started_at,
    course: {
      id: badge.id,
      course_uuid: badge.badge_uuid,
      name: badge.name,
    },
    steps: completedActivities.map((activity: any) => ({
      activity_id: activity.id,
      course_id: badge.id,
      complete: true,
      data: {
        course: {
          id: badge.id,
          course_uuid: badge.badge_uuid,
        },
      },
    })),
  }
}

export function learningPathToLegacyCourse(badgePath: any, org?: any) {
  const badge = badgePath?.badge || {}
  const badgeUuid = badge.badge_uuid || `badge_${cleanBadgeId(badge.id)}`
  const status = getBadgeStatus(badge)

  return {
    ...badge,
    id: badge.id,
    course_uuid: badgeUuid,
    name: badge.name,
    description: badge.description,
    about: badge.about,
    thumbnail_image: badge.thumbnail_image,
    thumbnail_image_url: badge.thumbnail_image,
    owner_org_id: badge.org_id || org?.id,
    owner_org_uuid: org?.org_uuid || '',
    owner_org_name: org?.name || '',
    status,
    coming_soon: status === 'coming_soon',
    authors: [],
    learnings: [],
    seo: badge.badge_metadata?.seo || {},
    chapters: (badgePath.activities || []).map((activity: any, index: number) => ({
      id: activity.id,
      chapter_uuid: activity.activity_uuid,
      name: activity.title,
      description: activity.description,
      thumbnail_image: activity.thumbnail_image,
      order: activity.order ?? index + 1,
      activities: [{
        id: activity.id,
        activity_uuid: activity.activity_uuid,
        name: activity.title,
        description: activity.description,
        thumbnail_image: activity.thumbnail_image,
        activity_type: getLearningActivityType(activity),
        content: {},
        published: activity.published,
      }],
    })),
  }
}

export function learningCollectionsToLegacyCollections(collections: any[], org?: any) {
  return (collections || []).map((collection: any) => ({
    ...collection,
    _learning_collection: true,
    learning_collection_uuid: collection.collection_uuid,
    collection_uuid: `collection_${cleanLearningCollectionId(collection.collection_uuid)}`,
    owner_org_uuid: org?.org_uuid || '',
    courses: (collection.badges || []).map((badge: any) => {
      const status = getBadgeStatus(badge)
      return {
        ...badge,
        _learning_badge: true,
        id: badge.id,
        course_uuid: badge.badge_uuid,
        name: badge.name,
        description: badge.description,
        about: badge.about,
        thumbnail_image: badge.thumbnail_image,
        thumbnail_image_url: badge.thumbnail_image,
        owner_org_id: badge.org_id || org?.id,
        owner_org_uuid: org?.org_uuid || '',
        owner_org_name: org?.name || '',
        status,
        coming_soon: status === 'coming_soon',
        authors: [],
      }
    }),
  }))
}
