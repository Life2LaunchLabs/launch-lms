import identityImage from '../../public/images/launch-ready/identity.png'
import profileImage from '../../public/images/launch-ready/profile.png'
import journeyImage from '../../public/images/launch-ready/journey.png'
import workImage from '../../public/images/launch-ready/work.png'
import traitsImage from '../../public/images/launch-ready/traits.png'
import linksImage from '../../public/images/launch-ready/links.png'
import themeImage from '../../public/images/launch-ready/theme.png'
import launchImage from '../../public/images/launch-ready/launch.png'

const bundledImages: Record<string, string> = {
  '/images/launch-ready/identity.png': identityImage.src,
  '/images/launch-ready/profile.png': profileImage.src,
  '/images/launch-ready/journey.png': journeyImage.src,
  '/images/launch-ready/work.png': workImage.src,
  '/images/launch-ready/traits.png': traitsImage.src,
  '/images/launch-ready/links.png': linksImage.src,
  '/images/launch-ready/theme.png': themeImage.src,
  '/images/launch-ready/launch.png': launchImage.src,
}

export function resolveLearningActivityImage(src?: string | null) {
  const value = String(src || '')
  return bundledImages[value] || value
}
