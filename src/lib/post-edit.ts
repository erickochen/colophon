// Editing a post runs through MAM's own form, the way a comment does. We fetch
// the page that form lives on, so the composer starts from the raw source
// rather than from the rendered post.
import { mamFetch } from '@/lib/mam-fetch'

const EDIT_PATH = '/forums.php?action=editpost'
/** Marks our copy of MAM's form. One id per post, so a fetch for another post
 * cannot detach the form an open editor is holding. */
const formId = (pid: string | number) => `colophon-post-edit-${pid}`

export const postEditUrl = (pid: string | number) => `${EDIT_PATH}&postid=${pid}`

export interface PostSource {
  /** Raw body as the member typed it, BBCode and HTML mixed. */
  body: string
  /** Label MAM puts on its own submit button. */
  submitLabel: string
  /** MAM's form, imported into this document, hidden, ready to submit. */
  form: HTMLFormElement
}

export async function fetchPostSource(pid: string | number): Promise<PostSource> {
  const page = postEditUrl(pid)
  const res = await mamFetch(page, { credentials: 'same-origin' })
  if (!res.ok) throw new Error(`Edit form unavailable (${res.status})`)
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html')
  const source = doc.querySelector<HTMLFormElement>('form[name="edit"], form[action*="editpost" i]')
  const area = source?.querySelector<HTMLTextAreaElement>('textarea[name="body"]')
  if (!source || !area) throw new Error('Edit form unavailable')
  // Never edit whatever post the served form happens to name.
  const served = source.getAttribute('action')?.match(/postid=(\d+)/)?.[1]
  if (served !== String(pid)) throw new Error('Edit form names another post')

  const form = document.importNode(source, true)
  // Imported nodes run their scripts once inserted, so drop any that came along.
  form.querySelectorAll('script').forEach((s) => s.remove())
  form.action = new URL(source.getAttribute('action') ?? page, new URL(page, location.href)).href
  form.id = formId(pid)
  form.style.display = 'none'
  // A hidden form cannot show a validation bubble, so a field MAM fills
  // differently than expected would abort the submit without a word.
  form.noValidate = true
  document.getElementById(formId(pid))?.remove()
  document.body.appendChild(form)

  const submit = form.querySelector<HTMLInputElement>('input[type="submit"]')
  return { body: area.value, submitLabel: submit?.value || 'Update post', form }
}

/** Takes the hidden form off the page again. */
export function dropPostSource(pid: string | number): void {
  document.getElementById(formId(pid))?.remove()
}

/** Sends the edit through MAM's own submit button, so the browser lands back on
 * the topic the way its own edit page does. */
export function sendPostEdit(source: PostSource, body: string): void {
  const area = source.form.querySelector<HTMLTextAreaElement>('textarea[name="body"]')
  if (!area) throw new Error('Edit form unavailable')
  // A form off the document submits nothing plus says nothing, so a second open
  // having replaced this one has to surface rather than swallow the text.
  if (!source.form.isConnected) throw new Error('Edit form is detached')
  area.value = body
  source.form.requestSubmit(source.form.querySelector<HTMLInputElement>('input[type="submit"]') ?? undefined)
}
