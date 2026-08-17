// MAM asks for upload access with a questionnaire: a flat form of written
// answers and checkbox groups. This reads that form into questions, keeping a
// handle on every original control so the POST stays MAM's own.
import { cleanHtml } from '@/lib/sanitize'
import { draftStore } from '@/lib/draft'
import { findSubmitter } from '@/lib/form-mirror'

/** How long an unsent questionnaire is offered back, in milliseconds. */
const DRAFT_TTL = 7 * 24 * 60 * 60 * 1000
const DRAFT_KEY = 'colophon:upload-quiz'

/** MAM numbers its questions in the text itself ("3) Which ONE ..."). */
const NUMBERED = /^\s*(\d+)\s*[).]\s*/

/** Controls a form carries for its own plumbing rather than for an answer. */
const PLUMBING = new Set(['hidden', 'submit', 'reset', 'button', 'image'])

/** Single-line types MAM could swap a textarea for. */
const LINE_TYPES = new Set(['text', 'email', 'url', 'number', 'tel', 'search', 'date'])

export type OpenControl = HTMLTextAreaElement | HTMLInputElement

export interface QuizOption {
  /** Its place in the question. A PHP array field gives every box in a group
   * the same name, so the name is no handle on a single option. */
  id: string
  label: string
  el: HTMLInputElement
}

export type QuizQuestion =
  | { kind: 'open'; id: string; number: number | null; prompt: string; el: OpenControl; required: boolean; multiline: boolean }
  | { kind: 'choice'; id: string; number: number | null; prompt: string; options: QuizOption[] }

export interface UploadQuiz {
  form: HTMLFormElement
  submitter: HTMLElement | null
  submitLabel: string
  title: string | null
  introHtml: string | null
  questions: QuizQuestion[]
}

export type QuizAnswers = Record<string, string | string[]>

export interface QuizDraft {
  answers: QuizAnswers
  step: number
}

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()

/** Radio buttons are deliberately absent. MAM's questionnaire has none. A group
 * of them holds one answer at a time rather than a set, so one showing up sends
 * the whole page to the mirrored form. */
function answerKind(el: Element): 'open' | 'choice' | null {
  if (el instanceof HTMLTextAreaElement) return 'open'
  if (el instanceof HTMLInputElement) {
    if (el.type === 'checkbox') return 'choice'
    if (LINE_TYPES.has(el.type)) return 'open'
  }
  return null
}

function isPlumbing(el: Element): boolean {
  return el instanceof HTMLInputElement && PLUMBING.has(el.type)
}

/** The label wrapped directly around one control. MAM leaves a stray outer
 * label open around the tail of the form, so only the innermost one counts. */
function ownLabel(el: Element, form: HTMLFormElement): HTMLLabelElement | null {
  for (let n = el.parentElement; n && n !== form.parentElement; n = n.parentElement) {
    if (n instanceof HTMLLabelElement) {
      const inside = [...n.querySelectorAll('input, textarea, select')].filter((c) => !isPlumbing(c))
      return inside.length === 1 ? n : null
    }
  }
  return null
}

function labelText(label: HTMLLabelElement): string {
  const clone = label.cloneNode(true) as HTMLElement
  clone.querySelectorAll('input, textarea, select').forEach((e) => e.remove())
  return clean(clone.textContent)
}

type Token = { text: string } | { el: Element; label: string }

/** Walks the form in document order. Anything wrapped in its own label comes
 * back as one token, everything else as the text between them, which is where
 * the prompt of a checkbox group lives. */
function tokenize(form: HTMLFormElement, owned: Map<Element, HTMLLabelElement>): Token[] {
  const byLabel = new Map([...owned].map(([el, label]) => [label, el]))
  const out: Token[] = []
  const visit = (node: Node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        out.push({ text: child.nodeValue ?? '' })
        continue
      }
      if (!(child instanceof HTMLElement)) continue
      const held = child instanceof HTMLLabelElement ? byLabel.get(child) : undefined
      if (held) {
        out.push({ el: held, label: labelText(child as HTMLLabelElement) })
        continue
      }
      if (isPlumbing(child)) continue
      if (answerKind(child)) {
        out.push({ el: child, label: '' })
        continue
      }
      if (child.tagName === 'BR') {
        out.push({ text: '\n' })
        continue
      }
      visit(child)
    }
  }
  visit(form)
  return out
}

/** Lifts the number MAM writes in front of a question, so the step counter and
 * the prompt do not both state it. */
function splitNumber(text: string): { number: number | null; prompt: string } {
  const hit = text.match(NUMBERED)
  if (!hit) return { number: null, prompt: text }
  return { number: Number(hit[1]), prompt: text.slice(hit[0].length).trim() }
}

/** The questions of a form. Null when a control stays outside the model, which
 * sends the page to the plain mirrored form instead so no field is ever quietly
 * dropped. */
export function readQuestions(form: HTMLFormElement): QuizQuestion[] | null {
  const owned = new Map<Element, HTMLLabelElement>()
  for (const el of form.querySelectorAll('input, textarea, select')) {
    if (isPlumbing(el)) continue
    const label = ownLabel(el, form)
    if (label) owned.set(el, label)
  }

  const questions: QuizQuestion[] = []
  const covered = new Set<Element>()
  let group: Extract<QuizQuestion, { kind: 'choice' }> | null = null
  let pending = ''

  for (const token of tokenize(form, owned)) {
    if ('text' in token) {
      pending += token.text
      continue
    }
    const head = clean(pending)
    pending = ''
    const kind = answerKind(token.el)

    if (kind === 'choice' && token.el instanceof HTMLInputElement) {
      const el = token.el
      if (head || !group) {
        group = { kind: 'choice', id: el.name, ...splitNumber(head), options: [] }
        questions.push(group)
      }
      group.options.push({ id: `${group.id}#${group.options.length}`, label: token.label || el.value, el })
      covered.add(el)
      continue
    }

    if (kind === 'open') {
      group = null
      const el = token.el as OpenControl
      questions.push({
        kind: 'open',
        id: el.name,
        ...splitNumber(clean(token.label) || head),
        el,
        required: el.required,
        multiline: el instanceof HTMLTextAreaElement,
      })
      covered.add(el)
    }
  }

  // form.elements also holds what the form claims through a form attribute plus
  // what sits in the surrounding table cell, which the tree walk never reaches.
  for (const el of form.elements) {
    const field = el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement
    if (!field || isPlumbing(el)) continue
    if (!covered.has(el)) return null
  }

  return questions.length ? questions : null
}

/** The whole questionnaire page: the intro MAM prints plus its questions. */
export function readUploadQuiz(main: HTMLElement | null): UploadQuiz | null {
  const form = main?.querySelector<HTMLFormElement>('form:not(#mainSearch)')
  if (!main || !form) return null
  const questions = readQuestions(form)
  if (!questions) return null

  const clone = main.cloneNode(true) as HTMLElement
  clone.querySelectorAll('form').forEach((f) => f.remove())
  // MAM sizes its own blocks in pixels, which is wider than our column and
  // would push the page sideways.
  for (const el of clone.querySelectorAll<HTMLElement>('[style]')) {
    el.style.removeProperty('width')
    el.style.removeProperty('min-width')
    el.style.removeProperty('max-width')
  }
  const introText = clean(clone.textContent)

  const submit = form.querySelector<HTMLInputElement>('input[type="submit"], button[type="submit"]')
  return {
    form,
    submitter: findSubmitter(form),
    submitLabel: clean(submit?.value || submit?.textContent) || 'Submit',
    title: [...main.querySelectorAll('.blockHead h4')].map((h) => clean(h.textContent)).find(Boolean) ?? null,
    introHtml: introText.length > 2 ? cleanHtml(clone) : null,
    questions,
  }
}

/** What the controls hold right now, so a reload keeps whatever MAM filled in. */
export function readAnswers(questions: QuizQuestion[]): QuizAnswers {
  const out: QuizAnswers = {}
  for (const q of questions) {
    out[q.id] = q.kind === 'open' ? q.el.value : q.options.filter((o) => o.el.checked).map((o) => o.id)
  }
  return out
}

/** Writes the answers back into MAM's own controls, which is what gets posted. */
export function writeAnswers(questions: QuizQuestion[], answers: QuizAnswers): void {
  for (const q of questions) {
    const value = answers[q.id]
    if (q.kind === 'open') {
      q.el.value = typeof value === 'string' ? value : ''
      continue
    }
    const picked = new Set(Array.isArray(value) ? value : [])
    for (const o of q.options) o.el.checked = picked.has(o.id)
  }
}

export function answerText(q: QuizQuestion, answers: QuizAnswers): string {
  const value = answers[q.id]
  if (q.kind === 'open') return typeof value === 'string' ? value.trim() : ''
  const picked = new Set(Array.isArray(value) ? value : [])
  return q.options.filter((o) => picked.has(o.id)).map((o) => o.label).join(', ')
}

export function isAnswered(q: QuizQuestion, answers: QuizAnswers): boolean {
  return answerText(q, answers).length > 0
}

export const uploadQuizDraft = draftStore<QuizDraft>(DRAFT_KEY, DRAFT_TTL, (d) =>
  !!d.answers && Object.values(d.answers).some((v) => (Array.isArray(v) ? v.length > 0 : v.trim().length > 0))
)
