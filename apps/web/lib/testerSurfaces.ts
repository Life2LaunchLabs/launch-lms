// Which tester tools a site shows (DEV-27). Production leaves every switch off, so none of them
// render there; unstable turns them on. Each surface asks here instead of reading its own setting.
//
// - Operations feedback bar (the life2launch.dev loader): NEXT_PUBLIC_OPERATIONS_SURFACE_ENABLED.
// - User tests (test-persona bar, test login links): NEXT_PUBLIC_USER_TESTS_ENABLED, which
//   server-wrapper.js publishes from LAUNCHLMS_USER_TESTS_ENABLED, the same switch as the API's.

/** Reads a setting by key, with a fallback: getConfig in services/config, or a stand-in in tests. */
export type ReadSetting = typeof import('@services/config/config').getConfig

export type TesterSurface = 'operations' | 'userTests'

const SWITCHES: Record<TesterSurface, string> = {
  operations: 'NEXT_PUBLIC_OPERATIONS_SURFACE_ENABLED',
  userTests: 'NEXT_PUBLIC_USER_TESTS_ENABLED',
}

/** True only when the surface's switch is exactly "true"; anything else, including unset, is off. */
export function testerSurfaceEnabled(surface: TesterSurface, read: ReadSetting): boolean {
  return read(SWITCHES[surface], '').trim().toLowerCase() === 'true'
}

export const TESTER_SWITCHES = SWITCHES
