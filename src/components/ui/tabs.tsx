import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react'
import { Tabs as TabsPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'

export const Tabs = TabsPrimitive.Root

export const TabsList = forwardRef<ElementRef<typeof TabsPrimitive.List>, ComponentPropsWithoutRef<typeof TabsPrimitive.List>>(
  ({ className, ...props }, ref) => (
    <TabsPrimitive.List
      ref={ref}
      className={cn('grid w-full grid-cols-3 gap-2 rounded-2xl border border-border bg-muted p-2', className)}
      {...props}
    />
  ),
)
TabsList.displayName = TabsPrimitive.List.displayName

export const TabsTrigger = forwardRef<ElementRef<typeof TabsPrimitive.Trigger>, ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>>(
  ({ className, ...props }, ref) => (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        'flex min-h-14 items-center justify-center gap-2 rounded-xl px-3 py-3 text-base font-extrabold text-muted-foreground transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm',
        className,
      )}
      {...props}
    />
  ),
)
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

export const TabsContent = forwardRef<ElementRef<typeof TabsPrimitive.Content>, ComponentPropsWithoutRef<typeof TabsPrimitive.Content>>(
  ({ className, ...props }, ref) => (
    <TabsPrimitive.Content ref={ref} className={cn('mt-7 focus-visible:outline-none', className)} {...props} />
  ),
)
TabsContent.displayName = TabsPrimitive.Content.displayName
