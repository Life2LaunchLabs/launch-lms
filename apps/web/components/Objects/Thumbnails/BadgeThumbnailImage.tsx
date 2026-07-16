import { cn } from '@/lib/utils'
import React from 'react'

type BadgeThumbnailImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  containerClassName?: string
  imageClassName?: string
  hoverScale?: boolean
}

export function BadgeThumbnailImage({
  src,
  alt = '',
  containerClassName,
  imageClassName,
  hoverScale = false,
  className,
  ...props
}: BadgeThumbnailImageProps) {
  return (
    <div className={cn('flex h-full w-full items-center justify-center overflow-visible', containerClassName)}>
      <img
        src={src}
        alt={alt}
        className={cn(
          'badge-sticker-image h-full w-full object-contain p-[9%]',
          hoverScale && 'transition-transform duration-300 group-hover:scale-[1.03]',
          imageClassName,
          className
        )}
        {...props}
      />
    </div>
  )
}
