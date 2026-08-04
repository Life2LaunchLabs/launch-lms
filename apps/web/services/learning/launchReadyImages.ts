import identityImage from '../../public/images/launch-ready/identity.png'
import profileImage from '../../public/images/launch-ready/profile.png'
import timelineImage from '../../public/images/launch-ready/timeline.png'
import workImage from '../../public/images/launch-ready/work.png'
import traitsImage from '../../public/images/launch-ready/traits.png'
import linksImage from '../../public/images/launch-ready/links.png'
import launchImage from '../../public/images/launch-ready/launch.png'

const bundledImages: Record<string, string> = {
  '/images/launch-ready/identity.png': identityImage.src,
  '/images/launch-ready/profile.png': profileImage.src,
  '/images/launch-ready/timeline.png': timelineImage.src,
  '/images/launch-ready/work.png': workImage.src,
  '/images/launch-ready/traits.png': traitsImage.src,
  '/images/launch-ready/links.png': linksImage.src,
  '/images/launch-ready/launch.png': launchImage.src,
}

export function resolveLearningActivityImage(src?: string | null) {
  const value = String(src || '')
  return bundledImages[value] || value
}
