const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

export function isManagedHost(host: string, configuredDomain: string): boolean {
  if (!/^[a-zA-Z0-9.:-]{1,253}$/.test(host)) return false
  try {
    const parsed = new URL(`https://${host.toLowerCase()}`)
    const base = new URL(`https://${configuredDomain.toLowerCase()}`)
    if (parsed.port !== base.port) return false
    if (parsed.hostname === base.hostname) return true
    const suffix = `.${base.hostname}`
    return parsed.hostname.endsWith(suffix) && LABEL.test(parsed.hostname.slice(0, -suffix.length))
  } catch {
    return false
  }
}

export function safeHandoffPath(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//') && path.length <= 2048 &&
    !path.includes('\\') && !Array.from(path).some(character => {
      const code = character.charCodeAt(0)
      return code < 32 || code === 127
    })
}
