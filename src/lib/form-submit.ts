import { cleanLabel, humanizeFieldName } from '@/lib/form-mirror'
import { markInvalid } from '@/lib/invalid-anchor'
import { toast } from '@/components/ui/toast'

/** How many field names a message lists before it starts summarising. */
const NAMED_FIELDS = 3

/** The label MAM puts beside a control, for naming it back to the reader. */
function labelFor(el: Element): string {
  const cell = el.closest('tr')?.querySelector('td, th')
  const text = cell && !cell.contains(el) ? cleanLabel(cell.textContent ?? '') : ''
  return text || humanizeFieldName((el as HTMLInputElement).name || '')
}

/** Submits the original form, unless a value fails its own pattern. A browser
 * refuses to focus a hidden invalid control, so it blocks the submit silently.
 * The check runs here instead: rows that mirror an invalid control get marked
 * in place, anything unmapped is named in the toast. */
export function submitGuarded(form: HTMLFormElement, submitter?: HTMLElement | null): boolean {
  if (form.checkValidity()) {
    form.requestSubmit(submitter instanceof HTMLElement ? submitter : undefined)
    return true
  }
  const bad = [...form.querySelectorAll<HTMLElement>(':invalid')]
  const marked = markInvalid(bad)
  if (marked > 0) {
    toast.error(marked === 1 ? 'One field needs a different value' : `${marked} fields need a different value`, {
      description: 'Fix the highlighted fields, then save again.',
    })
    return false
  }
  const names = bad.slice(0, NAMED_FIELDS).map(labelFor)
  const rest = bad.length - names.length
  if (bad.length === 1) {
    toast.error(`${names[0]} is not in the format this field accepts`)
  } else {
    toast.error('Some values are not in the format their fields accept', {
      description: names.join(', ') + (rest > 0 ? ` plus ${rest} more` : ''),
    })
  }
  return false
}
