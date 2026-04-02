import { getCoreCapabilities } from '@services/config/config'

/**
 * Legacy compatibility hook retained while the frontend finishes migrating
 * away from EE naming. Core capabilities are now the source of truth.
 */
export const useEEStatus = () => {
  return { isEE: false, isLoading: false, capabilities: getCoreCapabilities() }
}
