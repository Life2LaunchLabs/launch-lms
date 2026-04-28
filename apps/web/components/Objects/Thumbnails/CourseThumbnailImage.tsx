type Props = {
  src: string
  alt?: string
  hoverScale?: boolean
}

export function CourseThumbnailImage({ src, alt = '', hoverScale = false }: Props) {
  return (
    <>
      <img
        src={src}
        alt=""
        aria-hidden
        className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl"
      />
      <div className="absolute inset-0 bg-black/20" />
      <img
        src={src}
        alt={alt}
        className={`relative z-10 w-full h-full object-contain drop-shadow-[0_2px_20px_rgba(0,0,0,0.55)]${hoverScale ? ' transition-transform duration-500 group-hover:scale-105' : ''}`}
      />
    </>
  )
}
