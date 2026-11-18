export const DEVICE_FRAMES = {
  mobile: { width: 390, height: 760 },
  desktop: { width: 960, height: 640 },
}

export const MOBILE_FRAME_CAP = 30

// The phone frame's bezel stays dark in both themes, like a real device. Admin dark mode turns
// `bg-black` into the light primary color (styles/admin-dark.css), so it is a literal color.
export const DEVICE_BEZEL_CLASS = 'bg-[#0b0b0c]'
