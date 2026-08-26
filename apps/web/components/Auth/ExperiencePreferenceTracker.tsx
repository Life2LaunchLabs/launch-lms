'use client'

import { useEffect } from 'react'

export const EXPERIENCE_PREFERENCE_KEY = 'launch-lms-last-experience'

export default function ExperiencePreferenceTracker({ side, orgslug }: { side: 'user' | 'admin'; orgslug: string }) {
  useEffect(() => {
    window.localStorage.setItem(EXPERIENCE_PREFERENCE_KEY, JSON.stringify({ side, orgslug }))
  }, [orgslug, side])
  return null
}
