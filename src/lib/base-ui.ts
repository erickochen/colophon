import * as React from 'react'
import { mergeProps } from '@base-ui/react/merge-props'

// Radix-era call sites pass asChild; Base UI expects a render element.
// Translate here so the app keeps its existing markup.
export function withAsChild<P extends { asChild?: boolean; children?: React.ReactNode }>(
  props: P
): Omit<P, 'asChild'> & { render?: React.ReactElement } {
  const { asChild, children, ...rest } = props
  if (asChild && React.isValidElement(children)) {
    return { ...rest, render: children } as Omit<P, 'asChild'> & { render?: React.ReactElement }
  }
  return { ...rest, children } as Omit<P, 'asChild'> & { render?: React.ReactElement }
}

type SlotProps = React.HTMLAttributes<HTMLElement> & {
  ref?: React.Ref<HTMLElement>
  [key: string]: unknown
}

function composeRefs<T>(...refs: Array<React.Ref<T> | undefined>): React.RefCallback<T> {
  return (node) => {
    for (const ref of refs) {
      if (typeof ref === 'function') ref(node)
      else if (ref) (ref as React.RefObject<T | null>).current = node
    }
  }
}

// Drop-in for Radix's Slot.Root: merges own props into the single child element.
function SlotRoot(props: SlotProps) {
  const { children, ref, ...slotProps } = props
  if (!React.isValidElement(children)) {
    return React.Children.count(children) > 1 ? React.Children.only(null) : null
  }
  const childProps = children.props as Record<string, unknown>
  const merged = mergeProps<'div'>(slotProps as never, childProps as never) as Record<string, unknown>
  const childRef = childProps.ref as React.Ref<HTMLElement> | undefined
  if (ref || childRef) merged.ref = composeRefs(ref, childRef)
  else delete merged.ref
  return React.cloneElement(children, merged)
}

export const Slot = { Root: SlotRoot }
