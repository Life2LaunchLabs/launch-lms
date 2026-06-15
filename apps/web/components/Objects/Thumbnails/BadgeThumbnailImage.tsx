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
          'h-full w-full object-contain p-[6%] drop-shadow-[0_6px_0_rgba(31,41,55,0.45)]',
          hoverScale && 'transition-transform duration-300 group-hover:scale-[1.03]',
          imageClassName,
          className
        )}
        {...props}
      />
    </div>
  )
}
