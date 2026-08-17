// Sending a private message runs through MAM's own form. We fetch the page MAM
// would have shown, drop the text in and submit it, so the quote stack plus
// every hidden field are exactly what the site expects.
import { mamFetch } from '@/lib/mam-fetch'

export interface SendDraft {
  receiverUid: string
  /** Message being answered. MAM then prefills the subject and quote stack. */
  replyToId?: string | null
  /** Used when MAM has nothing to prefill, so on a fresh subject. */
  subject?: string
  text: string
  /** The one message being answered. Null sends the text on its own. */
  quote?: { author: string; text: string } | null
  /** Where MAM sends the browser once the message is stored. */
  returnTo?: string
}

/** Why a send did not happen, so the caller can say something useful. */
export type SendResult =
  | { ok: true }
  | { ok: false; reason: 'no-form' | 'wrong-receiver' | 'network' }

const SEND_PATH = '/sendmessage.php'
const SEND_FORM = 'form[action*="takemessage" i]'
/** Marks our own copy of MAM's form, so a retry replaces it. */
const FORM_ID = 'colophon-pm-send'
/** Blank lines MAM leaves between a reply and the quoted history. */
const QUOTE_GAP = '<br /><br /><br />'

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** The separator MAM writes, so both sides read a quote the same way. One level
 * only: the reader already has the rest in their own sentbox. The author comes
 * in stripped of markup, so only the quoted text needs escaping. */
function quoteBlock(quote: { author: string; text: string }): string {
  return `${QUOTE_GAP}-------- ${quote.author} wrote: --------<br />${escapeHtml(quote.text)}`
}

function setHidden(form: HTMLFormElement, name: string, value: string) {
  const existing = form.querySelector<HTMLInputElement>(`input[name="${name}"]`)
  if (existing) {
    existing.value = value
    return
  }
  const el = document.createElement('input')
  el.type = 'hidden'
  el.name = name
  el.value = value
  form.appendChild(el)
}

export interface BuiltForm {
  form: HTMLFormElement
  submitter: HTMLInputElement | null
}

/** Fetches MAM's send form and fills it in. The form stays detached so the
 * caller decides when it goes out. */
export async function buildSendForm(draft: SendDraft): Promise<BuiltForm | SendResult> {
  const params = new URLSearchParams({ receiver: draft.receiverUid })
  if (draft.replyToId) params.set('replyto', draft.replyToId)

  let html: string
  try {
    const res = await mamFetch(`${SEND_PATH}?${params}`, { credentials: 'same-origin' })
    if (!res.ok) return { ok: false, reason: 'no-form' }
    html = await res.text()
  } catch {
    return { ok: false, reason: 'network' }
  }

  const doc = new DOMParser().parseFromString(html, 'text/html')
  const source = doc.querySelector<HTMLFormElement>(SEND_FORM)
  if (!source) return { ok: false, reason: 'no-form' }

  const form = document.importNode(source, true)
  form.id = FORM_ID
  form.style.display = 'none'
  // Imported nodes run their scripts once inserted, so drop any that came along.
  form.querySelectorAll('script').forEach((s) => s.remove())
  // A hidden form cannot show a validation bubble, so a required field MAM
  // filled differently than expected would abort the submit without a word.
  form.noValidate = true

  const msg = form.querySelector<HTMLTextAreaElement>('textarea[name="msg"]')
  if (!msg) return { ok: false, reason: 'no-form' }

  // Never post to whoever MAM happened to put in the form.
  const receiver = form.querySelector<HTMLInputElement>('input[name="receiver"]')
  if (receiver && receiver.value !== draft.receiverUid) return { ok: false, reason: 'wrong-receiver' }
  setHidden(form, 'receiver', draft.receiverUid)

  const subject = form.querySelector<HTMLInputElement>('input[name="subject"]')
  if (subject && !subject.value.trim() && draft.subject) subject.value = draft.subject
  // MAM prefills its whole stacked history. That is replaced by the single
  // message being answered. Without a target the text goes out on its own.
  msg.value = draft.quote ? draft.text + quoteBlock(draft.quote) : draft.text
  // A conversation only reads back in full while the sentbox keeps our side of
  // it, so the copy is forced on rather than left to the form's default.
  const save = form.querySelector<HTMLInputElement>('input[name="save"]')
  if (save) save.checked = true
  else setHidden(form, 'save', 'yes')
  if (draft.returnTo) setHidden(form, 'returnto', draft.returnTo)

  return { form, submitter: form.querySelector<HTMLInputElement>('input[type="submit"]') }
}

/** Submits through the submit button, so its name and value travel along. */
export async function sendMessage(draft: SendDraft): Promise<SendResult> {
  const built = await buildSendForm(draft)
  if ('ok' in built) return built
  document.getElementById(FORM_ID)?.remove()
  document.body.appendChild(built.form)
  built.form.requestSubmit(built.submitter ?? undefined)
  return { ok: true }
}
