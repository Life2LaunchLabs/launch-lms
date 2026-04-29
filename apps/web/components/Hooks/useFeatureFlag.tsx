import { useOrg } from '@components/Contexts/OrgContext'
import { useMemo } from 'react'

type FeatureType = {
  path: string[]
  defaultValue?: boolean
}

function useFeatureFlag(feature: FeatureType) {
  const org = useOrg() as any

  const isEnabled = useMemo(() => {
    if (org?.config?.config) {
      let currentValue = org.config.config
      for (const key of feature.path) {
        if (currentValue && typeof currentValue === 'object') {
          currentValue = currentValue[key]
        } else {
          return !!feature.defaultValue
        }
      }
      return !!currentValue
    }
    return !!feature.defaultValue
  }, [org, feature])

  return isEnabled
}

export default useFeatureFlag