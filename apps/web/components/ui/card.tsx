import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const cardVariants = cva(
  "rounded-3xl border-2 bg-card text-card-foreground transition-all",
  {
    variants: {
      variant: {
        default:
          "border-border shadow-none",
        interactive:
          "cursor-pointer border-border shadow-none hover:-translate-y-0.5 active:translate-y-0.5",
        subtle:
          "border-border bg-muted shadow-none",
        filled:
          "border-[var(--org-primary-color)] bg-[var(--org-primary-color)] text-[var(--org-on-primary-color)] shadow-none",
        flat:
          "border-border shadow-none",
      },
      size: {
        default: "p-7",
        sm: "p-5",
        lg: "p-9",
        none: "p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {
  asChild?: boolean
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "div"
    return (
      <Comp
        ref={ref}
        className={cn(cardVariants({ variant, size, className }))}
        {...props}
      />
    )
  }
)
Card.displayName = "Card"

export { Card, cardVariants }
