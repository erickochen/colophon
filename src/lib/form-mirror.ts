// FormMirror: parse an original MAM form into a typed field model. Our UI
// renders shadcn controls that write straight into the ORIGINAL (hidden)
// elements, then submits the original form - the POST stays byte-identical.
import { cleanHtml } from '@/lib/sanitize'

export type MirrorControl =
  | { kind: 'radio'; name: string; options: { value: string; label: string; el: HTMLInputElement }[]; value: string | null }
  | { kind: 'checkbox'; name: string; label: string; el: HTMLInputElement; checked: boolean }
  | { kind: 'select'; name: string; el: HTMLSelectElement; options: { value: string; label: string; group?: string }[]; value: string }
  | { kind: 'text'; name: string; el: HTMLInputElement; value: string; inputType: string; placeholder: string | null }
  | { kind: 'textarea'; name: string; el: HTMLTextAreaElement; value: string }
  | { kind: 'file'; name: string; el: HTMLInputElement }

export interface MirrorRow {
  kind: 'field' | 'section'
  label: string
  noteHtml: string | null
  controls: MirrorControl[]
}

/** Radio pair that is really an on/off setting -> render as a Switch.
 * Only when BOTH labels are generic (yes/no-like): descriptive sentence labels
 * carry the actual explanation and must stay visible as full options. */
export function asBooleanRadio(c: MirrorControl): { on: { value: string; el: HTMLInputElement }; off: { value: string; el: HTMLInputElement } } | null {
  if (c.kind !== 'radio' || c.options.length !== 2) return null
  const norm = (s: string) => s.toLowerCase().replace(/[:.]/g, '').trim()
  const truthy = new Set(['yes', '1', 'true', 'on', 'enabled', 'enable', 'full width', 'allow'])
  const falsy = new Set(['no', '0', 'false', 'off', 'disabled', 'disable'])
  const generic = (o: { value: string; label: string }) => {
    const l = norm(o.label)
    return !l || l === norm(o.value) || truthy.has(l) || falsy.has(l)
  }
  const [a, b] = c.options
  if (!generic(a) || !generic(b)) return null
  const score = (o: { value: string; label: string }) => {
    if (truthy.has(norm(o.value)) || truthy.has(norm(o.label))) return 1
    if (falsy.has(norm(o.value)) || falsy.has(norm(o.label))) return -1
    return 0
  }
  const sa = score(a)
  const sb = score(b)
  if (sa === 1 && sb === -1) return { on: a, off: b }
  if (sa === -1 && sb === 1) return { on: b, off: a }
  return null
}

/** A 2-option select that is really an allow/deny (or yes/no) toggle -> Switch.
 * Returns the on/off option values plus a short label derived from the wording. */
export function asBooleanSelect(c: MirrorControl): { onValue: string; offValue: string; label: string } | null {
  if (c.kind !== 'select' || c.options.length !== 2) return null
  const norm = (s: string) => s.toLowerCase().replace(/[:.]/g, '').trim()
  const on = /^(allow|yes|on|enable|enabled|show|true|receive)\b/
  const off = /^(don'?t|do not|no|off|disable|disabled|hide|false|never)\b/
  const [a, b] = c.options
  let onOpt: { value: string; label: string } | null = null
  let offOpt: { value: string; label: string } | null = null
  if (on.test(norm(a.label)) && off.test(norm(b.label))) { onOpt = a; offOpt = b }
  else if (on.test(norm(b.label)) && off.test(norm(a.label))) { onOpt = b; offOpt = a }
  if (!onOpt || !offOpt) return null
  const label = (onOpt.label.match(/(?:send me|receive|to me)\s+(.+)$/i)?.[1] ?? onOpt.label.replace(/^(allow|enable|show|yes,?)\s+/i, '')).trim()
  return { onValue: onOpt.value, offValue: offOpt.value, label: leadCap(label) }
}

/** Lift the first letter of a label taken from mid-sentence ("...send me
 * points"). Words that carry their own capitals stay untouched: "FL wedges",
 * "eBook". */
function leadCap(s: string): string {
  const first = s[0] ?? ''
  if (first !== first.toLowerCase() || first === first.toUpperCase()) return s
  const rest = s.split(/\s/)[0].slice(1)
  return rest === rest.toLowerCase() ? first.toUpperCase() + s.slice(1) : s
}

/** Strip label decorations MAM uses around raw inputs ("No:", "yes  "). */
export function cleanLabel(s: string): string {
  return s.replace(/\s+/g, ' ').replace(/[:：]\s*$/, '').trim()
}

/** Readable label for a control that carries none in the markup (flat forms
 * where a textarea just sits there). Derived from the field name; a few MAM
 * names read badly humanised, so map those. */
const NAME_LABELS: Record<string, string> = {
  msg: 'Message', message: 'Message', body: 'Message', comment: 'Comment',
  text: 'Comment', subject: 'Subject', title: 'Title', reason: 'Reason',
}
export function humanizeFieldName(raw: string): string {
  const inner = raw.replace(/.*\[([^\]]+)\].*/, '$1') // tor[mainCat] -> mainCat
  if (NAME_LABELS[inner.toLowerCase()]) return NAME_LABELS[inner.toLowerCase()]
  return inner
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
}

/** Label for a loose control: the text beside it (flat forms put "<b>Subject:</b>
 * <input>"), falling back to a readable form of its name. */
function looseFieldLabel(el: Element, form: HTMLFormElement): string {
  const around = cleanLabel(textAround(el, form))
  return around || humanizeFieldName((el as HTMLInputElement).name || '')
}

/** Text of an element with spaces inserted at element boundaries, so adjacent
 * inline nodes ("<b>Descriptions</b>on search") don't fuse ("Descriptionson"). */
function spacedText(el: Element | null | undefined): string {
  if (!el) return ''
  let out = ''
  for (const n of el.childNodes) {
    if (n.nodeType === Node.TEXT_NODE) out += n.nodeValue ?? ''
    else if (n.nodeType === Node.ELEMENT_NODE) {
      const e = n as Element
      if (e.matches(INPUT_SEL + ', button')) continue
      out += ' ' + spacedText(e) + ' '
    }
  }
  return out.replace(/\s+/g, ' ').trim()
}

export interface MirrorForm {
  el: HTMLFormElement
  title: string | null
  rows: MirrorRow[]
  /** The form's submit button. Submitting through it keeps its name/value in the
   * POST (submit=Donate Points, PlayLotto), which server actions gate on.
   * Null when the form has none. */
  submitter: HTMLElement | null
}

const INPUT_SEL = 'input, select, textarea'

/** The button that submits this form, so submitMirror can reproduce the exact
 * POST the native click makes. `input[type=submit]` also covers named buttons
 * like PlayLotto; a bare <button> in a form defaults to type=submit. */
export function findSubmitter(form: HTMLFormElement): HTMLElement | null {
  return form.querySelector<HTMLElement>('input[type="submit"], button[type="submit"], button:not([type])')
}

function textAround(input: Element, cell: Element): string {
  // label[for] wins
  const id = input.getAttribute('id')
  if (id) {
    const forLabel = cell.querySelector(`label[for="${CSS.escape(id)}"]`)
    if (forLabel?.textContent?.trim()) return forLabel.textContent.replace(/\s+/g, ' ').trim()
  }
  const wrap = input.closest('label')
  if (wrap?.textContent?.trim()) return wrap.textContent.replace(/\s+/g, ' ').trim()

  // text following the input up to the next control/br
  let out = ''
  let node: Node | null = input.nextSibling
  while (node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element
      if (el.matches(INPUT_SEL) || el.matches('br')) break
      out += el.textContent ?? ''
    } else out += node.textContent ?? ''
    node = node.nextSibling
  }
  out = out.replace(/\s+/g, ' ').trim()
  if (out) return out

  // otherwise text before it (e.g. "No: <input>")
  let pre = ''
  node = input.previousSibling
  while (node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element
      if (el.matches(INPUT_SEL) || el.matches('br')) break
      pre = (el.textContent ?? '') + pre
    } else pre = (node.textContent ?? '') + pre
    node = node.previousSibling
  }
  return pre.replace(/\s+/g, ' ').replace(/[:.]$/, '').trim()
}

/** A control MAM hides with inline display:none/visibility:hidden is not active
 * yet: cascading forms reveal fields step by step, like the ticket message box
 * that appears once a topic is picked. Those stay out of the mirror. */
function isInlineHidden(el: Element, stop: Element): boolean {
  for (let n: Element | null = el; n && n !== stop.parentElement; n = n.parentElement) {
    const s = (n as HTMLElement).style
    if (s && (s.display === 'none' || s.visibility === 'hidden')) return true
  }
  return false
}

function controlsInCell(cell: Element): MirrorControl[] {
  const out: MirrorControl[] = []
  const radios = new Map<string, { value: string; label: string; el: HTMLInputElement }[]>()

  for (const el of cell.querySelectorAll<HTMLElement>(INPUT_SEL)) {
    if (isInlineHidden(el, cell)) continue
    if (el instanceof HTMLInputElement) {
      const type = el.type
      const name = el.name
      if (type === 'hidden' || type === 'submit' || type === 'reset' || type === 'button' || type === 'image') continue
      if (type === 'radio') {
        const list = radios.get(name) ?? []
        list.push({ value: el.value, label: textAround(el, cell) || el.value, el })
        radios.set(name, list)
        continue
      }
      if (type === 'checkbox') {
        out.push({ kind: 'checkbox', name, label: textAround(el, cell), el, checked: el.checked })
        continue
      }
      if (type === 'file') {
        out.push({ kind: 'file', name, el })
        continue
      }
      out.push({ kind: 'text', name, el, value: el.value, inputType: type || 'text', placeholder: el.getAttribute('placeholder') })
    } else if (el instanceof HTMLSelectElement) {
      out.push({
        kind: 'select',
        name: el.name,
        el,
        options: [...el.options].map((o) => ({
          value: o.value,
          label: o.textContent?.replace(/ /g, ' ').trim() ?? o.value,
          group: o.closest('optgroup')?.getAttribute('label') ?? undefined,
        })),
        value: el.value,
        // multiple selects are rare on MAM; treated as single for now
      })
    } else if (el instanceof HTMLTextAreaElement) {
      out.push({ kind: 'textarea', name: el.name, el, value: el.value })
    }
  }

  for (const [name, options] of radios) {
    out.push({ kind: 'radio', name, options, value: options.find((o) => o.el.checked)?.value ?? null })
  }
  return out
}

/** Cell copy without its controls: explanatory text rendered under the field. */
function noteHtml(cell: Element, usedLabels: string[]): string | null {
  const clone = cell.cloneNode(true) as HTMLElement
  clone.querySelectorAll(INPUT_SEL + ', label').forEach((e) => e.remove())
  // In-page anchor menus (lists of #links) are page furniture, not help text.
  clone.querySelectorAll('li').forEach((li) => {
    const a = li.querySelector('a[href^="#"]')
    if (a && li.textContent?.trim() === a.textContent?.trim()) li.remove()
  })
  clone.querySelectorAll('ul, ol').forEach((l) => {
    if (!l.textContent?.trim()) l.remove()
  })
  // Option labels were plain text nodes around the inputs - drop the copies.
  const labelSet = new Set(usedLabels.map((l) => l.toLowerCase().replace(/[:.]$/, '').trim()).filter(Boolean))
  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT)
  const drop: Text[] = []
  for (let t = walker.nextNode() as Text | null; t; t = walker.nextNode() as Text | null) {
    const norm = t.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    if (!norm) continue
    const stripped = norm.toLowerCase().replace(/[:.]$/, '').trim()
    if (labelSet.has(stripped)) {
      drop.push(t)
      continue
    }
    // "yes no" style runs: every word is a used label
    const words = stripped.split(/\s+/)
    if (words.length <= 6 && words.every((w) => labelSet.has(w))) drop.push(t)
  }
  drop.forEach((t) => t.remove())
  while (clone.firstChild && ((clone.firstChild.nodeType === 3 && !clone.firstChild.textContent?.trim()) || (clone.firstChild.nodeType === 1 && (clone.firstChild as Element).tagName === 'BR'))) {
    clone.firstChild.remove()
  }
  const html = cleanHtml(clone)
  if (!html) return null
  const textLen = clone.textContent?.replace(/\s+/g, ' ').trim().length ?? 0
  return textLen > 2 ? html : null
}

export function parseForm(form: HTMLFormElement, titleEl?: Element | null, retried = false): MirrorForm {
  const rows: MirrorRow[] = []

  // Legacy markup nests the <form> in a table cell, leaving its rows outside the
  // form node, so widen the scan to the surrounding table. Never widen into the
  // page-layout table (it wraps #mainBody) or the whole body becomes one field.
  const mainBody = form.ownerDocument.querySelector('#mainBody')
  const nearTable = form.closest('table')
  const scope: Element =
    form.querySelector('tr') ? form
    : nearTable && (!mainBody || mainBody.contains(nearTable)) ? nearTable
    : form
  const owns = (el: Element) =>
    ((el as HTMLInputElement).form ?? el.closest('form')) === form

  for (const tr of scope.querySelectorAll('tr')) {
    const cells = [...tr.querySelectorAll(':scope > td, :scope > th')]
    if (cells.length === 0) continue
    // Rows that merely CONTAIN a nested table are containers - their inner
    // rows are visited by this same loop; consuming both duplicates fields.
    // Their label cell becomes a section heading for the nested fields.
    if (cells.some((c) => c.querySelector('tr'))) {
      const labelText = cells
        .filter((c) => !c.querySelector('tr'))
        .map((c) => spacedText(c))
        .find(Boolean)
      if (labelText && labelText.length <= 80 && rows.at(-1)?.label !== cleanLabel(labelText)) {
        rows.push({ kind: 'section', label: cleanLabel(labelText), noteHtml: null, controls: [] })
      }
      continue
    }
    const controlCell = cells.find((c) => [...c.querySelectorAll(INPUT_SEL)].some(owns))
    if (!controlCell) {
      // Section heading: one effective text cell (a colspan band). Multi-cell
      // header rows are table column captions, not sections.
      const texts = cells.map((c) => spacedText(c)).filter(Boolean)
      const text = texts.join(' ')
      if (texts.length === 1 && text.length <= 80 && rows.at(-1)?.label !== cleanLabel(text)) {
        rows.push({ kind: 'section', label: cleanLabel(text), noteHtml: null, controls: [] })
      }
      continue
    }
    const labelCell = cells.find((c) => c !== controlCell && !!c.textContent?.trim())
    const controls = controlsInCell(controlCell)
    if (!controls.length) continue
    const usedLabels = controls.flatMap((c) =>
      c.kind === 'radio' ? c.options.map((o) => o.label) : c.kind === 'checkbox' ? [c.label] : []
    )
    // Sibling cells beyond label+control (format hints, defaults in matrix
    // tables) become part of the description so no information is lost.
    const extraTexts = cells
      .filter((c) => c !== controlCell && c !== labelCell)
      .map((c) => c.textContent?.replace(/\s+/g, ' ').trim() ?? '')
      .filter(Boolean)
    let note = noteHtml(controlCell, usedLabels)
    if (extraTexts.length) {
      const extras = `<span>${extraTexts.join(' · ')}</span>`
      note = note ? `${extras}<br/>${note}` : extras
    }
    rows.push({
      kind: 'field',
      label: cleanLabel(spacedText(labelCell)),
      noteHtml: note,
      controls,
    })
  }
  // Trailing/leading sections with no fields under them are noise.
  while (rows.length && rows.at(-1)!.kind === 'section') rows.pop()

  // Controls living outside table rows (flat forms: sendmessage, comment,
  // newRequest): collect the leftovers. Each becomes its OWN labelled row -
  // lumping them into one anonymous row is what left subject/body as bare,
  // label-less boxes.
  const seen = new Set(rows.flatMap((r) => r.controls.map((c) => ('el' in c ? c.el : null))))
  const seenRadioNames = new Set(rows.flatMap((r) => r.controls.filter((c) => c.kind === 'radio').map((c) => c.name)))
  let hasLoose = false
  for (const el of form.querySelectorAll<HTMLElement>(INPUT_SEL)) {
    if (el instanceof HTMLInputElement && ['hidden', 'submit', 'reset', 'button', 'image'].includes(el.type)) continue
    if (seen.has(el as never)) continue
    if (el instanceof HTMLInputElement && el.type === 'radio' && seenRadioNames.has(el.name)) continue
    hasLoose = true
    break
  }
  if (hasLoose) {
    const controls = controlsInCell(form)
    const already = new Set(rows.flatMap((r) => r.controls.map((c) => c.name + ':' + c.kind)))
    const fresh = controls.filter((c) => !already.has(c.name + ':' + c.kind))
    for (const c of fresh) {
      // Radios carry their option labels; checkboxes carry their own text.
      // Everything else needs a label lifted from the text beside the control.
      const label =
        c.kind === 'radio' ? ''
        : c.kind === 'checkbox' ? cleanLabel(c.label)
        : looseFieldLabel(c.el, form)
      rows.push({ kind: 'field', label, noteHtml: null, controls: [c] })
    }
  }

  // Zero visible fields means every control sits inline-hidden (a rich-text
  // editor or another script tucked them away). Unhide and parse once more,
  // so the form never renders as an empty card.
  if (!retried && !rows.some((r) => r.kind === 'field')) {
    let changed = false
    for (const el of scope.querySelectorAll<HTMLElement>(INPUT_SEL)) {
      if (!owns(el)) continue
      if (el instanceof HTMLInputElement && ['hidden', 'submit', 'reset', 'button', 'image'].includes(el.type)) continue
      for (let n: HTMLElement | null = el; n && n !== scope.parentElement; n = n.parentElement) {
        const s = n.style
        if (s.display === 'none') { s.removeProperty('display'); changed = true }
        if (s.visibility === 'hidden') { s.removeProperty('visibility'); changed = true }
      }
      if (el.getAttribute('aria-hidden') === 'true') el.removeAttribute('aria-hidden')
    }
    if (changed) return parseForm(form, titleEl, true)
  }

  return { el: form, title: titleEl?.textContent?.trim() ?? null, rows, submitter: findSubmitter(form) }
}

export function submitMirror(form: MirrorForm) {
  form.el.requestSubmit(form.submitter)
}
