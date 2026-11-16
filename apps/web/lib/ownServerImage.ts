// Pictures from other websites (resource covers on Discover, link previews, hero images) are shown
// through Next's image route on Life2Launch's own server, so the other site sees our server, never a
// learner's browser or address. The student data page says so (lib/legal/facts.ts OUTSIDE_IMAGES).

const WIDTH = 1080 // one of Next's default image sizes
const QUALITY = 75 // Next's default allowed quality

/** The address to show an image from: our own image route for an outside http(s) picture, the same address otherwise. */
export function ownServerImage<T extends string | null | undefined>(src: T): T | string {
  if (!src || !/^https?:\/\//i.test(src)) return src
  if (typeof window !== 'undefined') {
    try {
      if (new URL(src).origin === window.location.origin) return src
    } catch {
      return src
    }
  }
  return `/_next/image?url=${encodeURIComponent(src)}&w=${WIDTH}&q=${QUALITY}`
}
