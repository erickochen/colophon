// Leaving a comment runs through MAM's own form. We fetch the page it lives on,
// drop the text in plus submit that form, so every field the site expects
// travels along even when it grows one later.
import { mamFetch } from '@/lib/mam-fetch'

const ADD_PATH = '/comment.php?action=add'
/** Marks our copy of MAM's form, so a retry replaces it. */
const FORM_ID = 'colophon-comment-post'

export type CommentResult = { ok: true } | { ok: false; reason: 'no-form' | 'wrong-torrent' | 'network' }

/** Posts one comment. The browser leaves the page on success, the way MAM's own
 * form does. */
export async function postComment(tid: number, text: string): Promise<CommentResult> {
  const page = `${ADD_PATH}&tid=${tid}`

  let html: string
  try {
    const res = await mamFetch(page, { credentials: 'same-origin' })
    if (!res.ok) return { ok: false, reason: 'no-form' }
    html = await res.text()
  } catch {
    return { ok: false, reason: 'network' }
  }

  const doc = new DOMParser().parseFromString(html, 'text/html')
  const source = doc.querySelector<HTMLFormElement>('form[action*="comment.php"]')
  if (!source) return { ok: false, reason: 'no-form' }

  // Never post against whatever torrent the served form happens to name.
  const target = source.querySelector<HTMLInputElement>('input[name="tid"]')
  if (!target || target.value !== String(tid)) return { ok: false, reason: 'wrong-torrent' }

  const form = document.importNode(source, true)
  const body = form.querySelector<HTMLTextAreaElement>('textarea[name="text"]')
  if (!body) return { ok: false, reason: 'no-form' }
  body.value = text

  // MAM writes the action as a bare filename, which a parsed document resolves
  // against the page we are on: from /t/<id> that lands on /t/comment.php. It
  // has to resolve against the page the form came from instead.
  form.action = new URL(source.getAttribute('action') ?? page, new URL(page, location.href)).href
  form.id = FORM_ID
  form.style.display = 'none'
  // Imported nodes run their scripts once inserted, so drop any that came along.
  form.querySelectorAll('script').forEach((s) => s.remove())
  // A hidden form cannot show a validation bubble, so a field MAM fills
  // differently than expected would abort the submit without a word.
  form.noValidate = true

  document.getElementById(FORM_ID)?.remove()
  document.body.appendChild(form)
  form.requestSubmit(form.querySelector<HTMLInputElement>('input[type="submit"]') ?? undefined)
  return { ok: true }
}
