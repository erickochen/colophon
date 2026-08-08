import { useCallback, useEffect, useRef } from 'react'

/** Forms whose next navigation is deliberate: a native form.submit() fires no
 * submit event, so callers flag it here before the guard would step in. */
const deliberate = new WeakSet<HTMLFormElement>()

export function allowNavigation(form: HTMLFormElement) {
  deliberate.add(form)
}

/** Every value in the form as one comparable string. Our controls write into
 * the original elements without firing events, so change listeners would miss
 * most edits; comparing the whole form catches them all. */
function signature(form: HTMLFormElement): string {
  const parts: string[] = []
  for (const el of form.elements) {
    const c = el as HTMLInputElement
    if (!c.name || c.disabled) continue
    switch (c.type) {
      case 'submit':
      case 'reset':
      case 'button':
      case 'image':
        continue
      case 'checkbox':
      case 'radio':
        parts.push(`${c.name}=${c.checked ? 1 : 0}`)
        break
      case 'file':
        parts.push(`${c.name}=${c.files?.length ?? 0}`)
        break
      default:
        parts.push(`${c.name}=${c.value}`)
    }
  }
  return parts.join('')
}

/** Warns before typed changes are thrown away. `isDirty` drives the caller's own
 * links plus `leave` navigates past the guard once the reader has chosen. The
 * browser prompt covers every other way off the page. */
export function useUnsavedGuard(form: HTMLFormElement | null): {
  isDirty: () => boolean
  leave: (href: string) => void
} {
  const initial = useRef<string | null>(null)
  const leaving = useRef(false)

  useEffect(() => {
    if (!form) return
    initial.current = signature(form)
    leaving.current = false

    // A submit navigates by design, so the prompt has to stand down for it.
    const onSubmit = () => { leaving.current = true }
    const onUnload = (e: BeforeUnloadEvent) => {
      if (leaving.current || deliberate.has(form) || initial.current === null) return
      if (signature(form) !== initial.current) e.preventDefault()
    }
    form.addEventListener('submit', onSubmit)
    window.addEventListener('beforeunload', onUnload)
    return () => {
      form.removeEventListener('submit', onSubmit)
      window.removeEventListener('beforeunload', onUnload)
    }
  }, [form])

  const isDirty = useCallback(
    () => !!form && initial.current !== null && !leaving.current && signature(form) !== initial.current,
    [form]
  )

  const leave = useCallback((href: string) => {
    leaving.current = true
    location.href = href
  }, [])

  return { isDirty, leave }
}
