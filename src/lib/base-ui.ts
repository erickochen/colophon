import * as React from 'react'

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
