/** Focused learner routes, after tenant routing has added an optional org prefix. */
export function isFocusedActivityPath(pathname: string | null): boolean {
  const path = (pathname || '').replace(/^\/orgs\/[^/]+(?=\/|$)/, '')
  return /^\/plans\/[^/]+\/objectives\/[^/]+\/activity\/?$/.test(path)
    || /^\/activity\/[^/]+(?:\/|$)/.test(path)
    || /^\/badges\/[^/]+\/chapter\/[^/]+(?:\/|$)/.test(path)
}
