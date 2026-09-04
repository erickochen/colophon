import { useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState, type ComponentType } from 'react'
import {
  Bold, Braces, ChevronDown, Code, Eye, FileCode2, Image as ImageIcon, Italic, Link2, List,
  ListOrdered, Palette, PencilLine, Quote, Strikethrough, Type, Underline,
} from 'lucide-react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { POST_SPACING, QUOTE_CLASSES, RichHtml } from '@/app/shell/bits'
import { postPreview } from '@/lib/mam-api'
import { cleanHtml } from '@/lib/sanitize'
import { spliceBlock } from '@/lib/insert-block'
import { cn } from '@/lib/utils'

/* BBCode set from /tags.php - the toolbar inserts exactly these tags, so the
 * submitted text is identical to what MAM's own editor produces. */

const COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'brown', 'gray', 'black']
const SIZES = [1, 2, 3, 4, 5, 6, 7]
const SIZE_PX: Record<number, string> = { 1: '10px', 2: '13px', 3: '16px', 4: '18px', 5: '24px', 6: '32px', 7: '48px' }

/** "name#p123" -> "name in post #123 wrote:", matching MAM's server-rendered
 * quote heading. A bare name gives "name wrote:". */
function quoteAttribution(who: string): string {
  const m = who.match(/^(.*?)#p?(\d+)$/)
  return m ? `${m[1].trim()} in post #${m[2]} wrote:` : `${who.trim()} wrote:`
}

const WYSIWYG_KEY = 'colophon:wysiwyg'

/** Cache MAM's "Disable WYSIWYG" preference when its radio is on this page. */
export function cacheWysiwygPref(doc: Document) {
  const checked = doc.querySelector<HTMLInputElement>('input[name="disableWysiwyg"]:checked')
  if (checked) localStorage.setItem(WYSIWYG_KEY, checked.value === 'yes' ? 'off' : 'on')
}

/** Whether MAM's rich editor is on. TinyMCE loads only when the preference is
 * enabled, so its presence is the reliable per-page signal and beats the cached
 * pref, which can be stale. Only the rich toolbar depends on this. */
function wysiwygEnabled(): boolean {
  // Test the value, not the key: preventWysiwyg() defines window.tinymce as an
  // accessor up front, so `'tinymce' in window` is true even where MAM never
  // loaded the editor - which would force rich mode on readers who disabled it.
  const mce = (window as Window & { tinymce?: unknown }).tinymce
  if (document.querySelector('script[src*="tiny" i], .tox-tinymce') || mce != null) return true
  const cached = localStorage.getItem(WYSIWYG_KEY)
  return cached ? cached === 'on' : true
}

/** Class the write surface styles a picture with once it turns out not to load.
 * It is stripped on the way out, so it never travels into a post. The style
 * rules spell the name out, since Tailwind reads static text only: rename this
 * and the rules go with it. */
const MISSING_IMG_CLASS = 'bb-img-missing'

/** Says out loud what the dashed box means, for the pointer and for a reader
 * who only hears the picture's name. Kept out of the post like the class. */
const MISSING_IMG_TITLE = 'Only the name shows here. Preview shows the picture.'

/** File name out of an image address, for the alt text. A picture on a host
 * MAM's image policy blocks shows nothing at all in the editor, so that name is
 * what marks the spot it sits in. Unlike the marker, this alt is part of the
 * post: a reader whose picture fails gets the name instead of a blank. */
export function imageLabel(url: string): string {
  try {
    const u = new URL(url)
    const last = u.pathname.split('/').filter(Boolean).at(-1)
    return decodeURIComponent(last || u.hostname)
  } catch {
    return 'image'
  }
}

const attrText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const imgTag = (url: string) => `<img src="${url}" alt="${attrText(imageLabel(url))}"/>`

/** MAM post source (HTML with BBCode mixed in) -> HTML for the local preview.
 * Converts the BBCode tags, keeps any real HTML the body already has (edited
 * posts, quoted bodies), then sanitizes, so the preview matches what MAM will
 * render instead of showing raw tags. */
export function bbToHtml(src: string): string {
  let s = src
  const passes = 4
  for (let i = 0; i < passes; i++) {
    s = s
      .replace(/\[b\]([\s\S]*?)\[\/b\]/gi, '<strong>$1</strong>')
      .replace(/\[i\]([\s\S]*?)\[\/i\]/gi, '<em>$1</em>')
      .replace(/\[u\]([\s\S]*?)\[\/u\]/gi, '<u>$1</u>')
      .replace(/\[s\]([\s\S]*?)\[\/s\]/gi, '<s>$1</s>')
      .replace(/\[sup\]([\s\S]*?)\[\/sup\]/gi, '<sup>$1</sup>')
      .replace(/\[sub\]([\s\S]*?)\[\/sub\]/gi, '<sub>$1</sub>')
      .replace(/\[color=([#a-zA-Z0-9]{1,20})\]([\s\S]*?)\[\/color\]/gi, '<span style="color:$1">$2</span>')
      .replace(/\[size=([1-7])\]([\s\S]*?)\[\/size\]/gi, (_, n: string, t: string) => `<span style="font-size:${SIZE_PX[Number(n)]}">${t}</span>`)
      .replace(/\[font=([a-zA-Z0-9 ,-]{1,60})\]([\s\S]*?)\[\/font\]/gi, '<span style="font-family:$1">$2</span>')
      .replace(/\[(left|right|center|justify)\]([\s\S]*?)\[\/\1\]/gi, '<div style="text-align:$1">$2</div>')
      // Render like the post view (div.quote) so the preview matches 1:1.
      .replace(/\[quote=([^\]\n]{1,80})\]([\s\S]*?)\[\/quote\]/gi, (_, who: string, body: string) => `<div class="quote"><span>${quoteAttribution(who)}</span>${body}</div>`)
      .replace(/\[quote\]([\s\S]*?)\[\/quote\]/gi, '<div class="quote">$1</div>')
      .replace(/\[code\]([\s\S]*?)\[\/code\]/gi, '<pre data-kind="code">$1</pre>')
      .replace(/\[pre\]([\s\S]*?)\[\/pre\]/gi, '<pre>$1</pre>')
      .replace(/\[(u|o)l\]([\s\S]*?)\[\/\1l\]/gi, (_, k: string, body: string) => {
        const items = body.split(/\[\*\]|\[li\]/).map((x) => x.replace(/\[\/li\]/gi, '').trim()).filter(Boolean)
        return `<${k}l>${items.map((x) => `<li>${x}</li>`).join('')}</${k}l>`
      })
      .replace(/\[img=(https?:\/\/[^\]\s"']+?\.(?:gif|jpe?g|png)[^\]\s"']*)\]/gi, (_, url: string) => imgTag(url))
      .replace(/\[img\](https?:\/\/[^\]\s"']+?\.(?:gif|jpe?g|png)[^\]\s"']*)\[\/img\]/gi, (_, url: string) => imgTag(url))
      .replace(/\[url=(https?:\/\/[^\]\s"']{1,500})\]([\s\S]*?)\[\/url\]/gi, '<a href="$1" target="_blank" rel="noopener noreferrer">$2</a>')
      .replace(/\[url\](https?:\/\/[^\]\s"']{1,500})\[\/url\]/gi, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/\[email\]([^\]\s"']{1,200})\[\/email\]/gi, '<a href="mailto:$1">$1</a>')
  }
  // Newlines that only pad block tags are HTML layout; collapse those, turn the
  // rest into <br> (plain-text line breaks), then sanitize the whole fragment.
  // DOMParser parses in an inert document, so embedded images do not load here.
  s = s.replace(/>\s*\n\s*</g, '><').replace(/\n/g, '<br/>')
  return cleanHtml(new DOMParser().parseFromString(s, 'text/html').body) ?? ''
}

/** Server HTML -> cleaned fragment for RichHtml, parsed in an inert document.
 * Preview links open a new tab, so a click cannot drop the unsent draft. */
function serverHtml(html: string): string {
  const body = new DOMParser().parseFromString(html, 'text/html').body
  for (const a of body.querySelectorAll('a')) {
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
  }
  return cleanHtml(body) ?? ''
}

/** An emptied contentEditable keeps a stray <br> or empty wrapper, so a plain
 * whitespace test would still send a body to the preview endpoint. */
function isBlankSource(src: string): boolean {
  return !src.replace(/<br\s*\/?>/gi, '').replace(/<\/?(?:div|p)>/gi, '').replace(/&nbsp;/gi, ' ').trim()
}

/** Editor HTML on its way out: Chrome's leftover transparent spans go, plus our
 * own marker on a picture that failed to load. The parse is inert, so nothing in
 * the fragment loads. */
const TRANSPARENT_BG = 'rgba(0, 0, 0, 0)'

function cleanOutgoing(html: string): string {
  if (!html.includes(TRANSPARENT_BG) && !html.includes(MISSING_IMG_CLASS)) return html
  const body = new DOMParser().parseFromString(html, 'text/html').body
  for (const span of [...body.querySelectorAll<HTMLElement>('span[style]')]) {
    if (span.style.length === 1 && span.style.backgroundColor === TRANSPARENT_BG) {
      span.replaceWith(...span.childNodes)
    }
  }
  for (const img of body.querySelectorAll<HTMLElement>(`img.${MISSING_IMG_CLASS}`)) {
    img.classList.remove(MISSING_IMG_CLASS)
    if (!img.getAttribute('class')) img.removeAttribute('class')
    // Only ours goes: a title the author wrote themselves stays put.
    if (img.getAttribute('title') === MISSING_IMG_TITLE) img.removeAttribute('title')
  }
  return body.innerHTML
}

/** A tool carries both its BBCode wrap (plain textarea mode) and its execCommand
 * mapping (WYSIWYG mode). `ask` opens the insert dialog instead of wrapping. */
interface ToolAction {
  icon: ComponentType<{ className?: string }>
  label: string
  pre?: string
  post?: string
  block?: boolean
  cmd?: string
  arg?: string
  ask?: InsertKind
}

type InsertKind = 'link' | 'image'

/** Accepts what people paste, refuses anything that is not a web address.
 * A bare host gets https, so "example.com/page" lands as a working link. The
 * host has to carry a dot, which keeps a stray word out of a post as a link
 * that goes nowhere. Spaces are out for the same reason. */
function webUrl(raw: string): string | null {
  const s = raw.trim()
  if (!s || /\s/.test(s)) return null
  const full = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`
  return /^https?:\/\/[^\s/?#]+\.[^\s/?#]+/i.test(full) ? full : null
}

const MAIN_TOOLS: ToolAction[] = [
  { icon: Bold, label: 'Bold', pre: '[b]', post: '[/b]', cmd: 'bold' },
  { icon: Italic, label: 'Italic', pre: '[i]', post: '[/i]', cmd: 'italic' },
  { icon: Underline, label: 'Underline', pre: '[u]', post: '[/u]', cmd: 'underline' },
  { icon: Strikethrough, label: 'Strikethrough', pre: '[s]', post: '[/s]', cmd: 'strikeThrough' },
]
const INSERT_TOOLS: ToolAction[] = [
  { icon: Link2, label: 'Link', ask: 'link' },
  { icon: ImageIcon, label: 'Image', ask: 'image' },
  { icon: Quote, label: 'Quote', pre: '[quote]', post: '[/quote]', block: true, cmd: 'formatBlock', arg: 'blockquote' },
  // "Code block", not "Code": the toolbar wraps a block, while the Code view in
  // the top right swaps the whole surface for its raw markup.
  { icon: Code, label: 'Code block', pre: '[code]', post: '[/code]', block: true, cmd: 'formatBlock', arg: 'pre' },
  { icon: List, label: 'Bullet list', pre: '[ul]\n[*] ', post: '\n[/ul]', block: true, cmd: 'insertUnorderedList' },
  { icon: ListOrdered, label: 'Numbered list', pre: '[ol]\n[*] ', post: '\n[/ol]', block: true, cmd: 'insertOrderedList' },
]
const MORE_TOOLS: { label: string; pre: string; post: string; cmd?: string; arg?: string }[] = [
  { label: 'Superscript', pre: '[sup]', post: '[/sup]', cmd: 'superscript' },
  { label: 'Subscript', pre: '[sub]', post: '[/sub]', cmd: 'subscript' },
  { label: 'Preformatted', pre: '[pre]', post: '[/pre]', cmd: 'formatBlock', arg: 'pre' },
  { label: 'Center', pre: '[center]', post: '[/center]', cmd: 'justifyCenter' },
  { label: 'Align right', pre: '[right]', post: '[/right]', cmd: 'justifyRight' },
  { label: 'Justify', pre: '[justify]', post: '[/justify]', cmd: 'justifyFull' },
  { label: 'Font', pre: '[font=Georgia]', post: '[/font]', cmd: 'fontName', arg: 'Georgia' },
  { label: 'Email link', pre: '[email]', post: '[/email]', cmd: 'createLink', arg: 'mailto:' },
]

/** Lets a page put the caret in the write surface, for instance right after
 * picking the message to answer. */
export interface ComposerHandle {
  focus: () => void
  /** Drops post source in where the caret was left, so a quote lands at the
   * spot the reader picked. A box that has not been written in yet takes it at
   * the end. */
  insert: (source: string) => void
}

type PreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; html: string }
  | { status: 'server-error'; message: string }
  | { status: 'error' }

export function BBComposer({
  value,
  onChange,
  placeholder,
  className,
  minHeightClass = 'min-h-28',
  ref,
  'aria-describedby': describedBy,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
  minHeightClass?: string
  ref?: React.Ref<ComposerHandle>
  'aria-describedby'?: string
}) {
  const [enabled] = useState(wysiwygEnabled)
  const wysiwyg = enabled
  // 'preview' is the server-rendered view; 'source' is the raw markup behind
  // the rich editor and only exists in that mode.
  const [tab, setTab] = useState<'write' | 'preview' | 'source'>('write')
  const [preview, setPreview] = useState<PreviewState>({ status: 'idle' })
  const taRef = useRef<HTMLTextAreaElement>(null)
  const edRef = useRef<HTMLDivElement>(null)
  const pvRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const lastEmit = useRef<string | null>(null)
  const savedRange = useRef<Range | null>(null)
  // Link and image both go through one dialog: a URL plus, for a link, the
  // words to show. Opening it drops the selection, so both surfaces park theirs.
  const [ask, setAsk] = useState<InsertKind | null>(null)
  // The dialog stays mounted while it fades out, so its words come from the
  // kind it was opened with rather than from the state that just cleared.
  const askKind = useRef<InsertKind>('link')
  const [askUrl, setAskUrl] = useState('')
  const [askText, setAskText] = useState('')
  const [askError, setAskError] = useState<string | null>(null)
  const plainSel = useRef<[number, number]>([0, 0])
  // A textarea keeps its caret through a blur, but a box nobody has typed in
  // reports 0, which would put an arriving quote in front of the text.
  const plainTouched = useRef(false)
  // Quotes that arrived while Preview or Code was open. A list, so a second one
  // does not quietly take the place of the first.
  const pending = useRef<string[]>([])
  const askUrlId = useId()
  const askTextId = useId()
  const askErrorId = useId()
  // Which toolbar button the shortcut returns to.
  const barAt = useRef(0)
  // The visible hint only shows from md up, so the shortcut also travels to
  // screen readers as a description of the write surface.
  const hintId = useId()
  const describe = describedBy ? `${describedBy} ${hintId}` : hintId
  // contentEditable keeps a stray <br> when emptied, so :empty is unreliable for
  // a CSS placeholder; track emptiness ourselves and overlay the placeholder.
  const [empty, setEmpty] = useState(true)
  const syncEmpty = () => {
    const el = edRef.current
    setEmpty(!!el && !el.textContent?.trim() && !el.querySelector('img'))
  }

  useImperativeHandle(ref, () => ({
    // The write surface may be unmounted (Preview tab active), so switch back
    // first and focus once the node is there.
    focus: () => {
      setTab('write')
      requestAnimationFrame(() => (edRef.current ?? taRef.current)?.focus())
    },
    insert: (source: string) => {
      if (tab === 'write') return insertSource(source)
      // The write surface is not mounted in the other views, so the block waits
      // for the switch. Coming back rebuilds the surface, which drops the saved
      // caret, so it joins at the end there.
      pending.current.push(source)
      setTab('write')
    },
  }))

  // Whatever arrived while another view was open, once the surface is back.
  useEffect(() => {
    if (tab !== 'write') return
    // A freshly mounted textarea holds the whole draft but reports a caret at 0,
    // so the box counts as unwritten-in again until someone puts one there.
    plainTouched.current = false
    if (!pending.current.length) return
    const waiting = pending.current
    pending.current = []
    // One insert for the lot: each call reads the same `value` prop, so a second
    // one would write over the first.
    insertSource(waiting.join('\n\n'))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on the switch only
  }, [tab])

  // Plain textarea auto-grow so a long post never edits through a tiny window;
  // minHeightClass sets the floor, max-height the ceiling.
  useLayoutEffect(() => {
    const ta = taRef.current
    // The same textarea backs plain-mode writing and the rich mode's Code view.
    if (!ta || tab !== (wysiwyg ? 'source' : 'write')) return
    ta.style.height = 'auto'
    ta.style.height = `${ta.scrollHeight}px`
  }, [value, tab, wysiwyg])

  // WYSIWYG: reflect external value changes (mount, revert, quote insert) into the
  // editable, but never on the user's own keystrokes: that keeps the caret put.
  useLayoutEffect(() => {
    if (!wysiwyg || tab !== 'write') return
    const el = edRef.current
    if (!el || value === lastEmit.current) return
    el.innerHTML = value ? bbToHtml(value) : ''
    lastEmit.current = value
    // Fresh nodes, so a range saved on the old ones points at nothing.
    savedRange.current = null
    syncEmpty()
  }, [value, wysiwyg, tab])

  // Coming back from the Code view the editable is a freshly mounted empty node
  // whose `value` may be untouched, which the effect above skips. Refill on every
  // switch into the rich surface.
  useLayoutEffect(() => {
    if (!wysiwyg || tab !== 'write') return
    const el = edRef.current
    if (!el) return
    el.innerHTML = value ? bbToHtml(value) : ''
    lastEmit.current = value
    // The refilled surface holds fresh nodes; a range saved on the previous
    // nodes is detached, so restoring it would make execCommand a no-op.
    savedRange.current = null
    syncEmpty()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on a view switch
  }, [tab])

  // Each view puts different buttons in the bar, so the remembered spot starts over.
  useEffect(() => {
    barAt.current = 0
  }, [tab])

  // selectionchange catches every way of selecting, a drag that lets go outside the
  // surface included, where mouseup lands on another element. The handler writes a
  // ref only, so it never re-renders the editor while a selection is being made.
  useEffect(() => {
    if (!wysiwyg || tab !== 'write') return
    const onChangeSel = () => saveSel()
    document.addEventListener('selectionchange', onChangeSel)
    return () => document.removeEventListener('selectionchange', onChangeSel)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads refs only
  }, [wysiwyg, tab])

  // An <img> that failed to load takes no room at all, so mark those instead.
  // The error event does not bubble, hence the capture phase plus a sweep for
  // pictures that were done loading before this ran.
  useEffect(() => {
    if (!wysiwyg || tab !== 'write') return
    const el = edRef.current
    if (!el) return
    const mark = (img: HTMLImageElement) => {
      img.classList.add(MISSING_IMG_CLASS)
      if (!img.title) img.title = MISSING_IMG_TITLE
    }
    const onError = (e: Event) => {
      if (e.target instanceof HTMLImageElement) mark(e.target)
    }
    el.addEventListener('error', onError, true)
    for (const img of el.querySelectorAll('img')) {
      if (img.complete && img.naturalWidth === 0) mark(img)
    }
    return () => el.removeEventListener('error', onError, true)
    // The sweep only has to run where the surface was just filled from value;
    // after that the listener has it. Keeping value out of this list spares a
    // walk over every picture per keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wysiwyg, tab])

  // Fetch on every switch into Preview: the source only changes in the other
  // views, so a switch is the only moment a refresh is needed. The cleanup
  // aborts the request when the view moves on before the answer is in.
  useEffect(() => {
    if (tab !== 'preview') return
    if (isBlankSource(value)) {
      setPreview({ status: 'idle' })
      return
    }
    const ctrl = new AbortController()
    setPreview({ status: 'loading' })
    postPreview(value, ctrl.signal)
      .then((r) => setPreview(r.ok ? { status: 'done', html: serverHtml(r.html) } : { status: 'server-error', message: r.message }))
      .catch(() => {
        if (!ctrl.signal.aborted) setPreview({ status: 'error' })
      })
    return () => ctrl.abort()
  }, [tab, value])

  /** What is selected inside the write surface right now, null when the selection
   * sits elsewhere. The shadow root answers first: for a selection made inside it the
   * document API reports a collapsed range anchored outside the root. */
  function liveRange(): Range | null {
    const el = edRef.current
    if (!el) return null
    const root = el.getRootNode() as Node & { getSelection?: () => Selection | null }
    const own = root !== document ? root.getSelection?.() : null
    const sel = own?.rangeCount ? own : document.getSelection()
    if (!sel?.rangeCount) return null
    const r = sel.getRangeAt(0)
    return el.contains(r.startContainer) && el.contains(r.endContainer) ? r : null
  }
  function saveSel() {
    const r = liveRange()
    if (r) savedRange.current = r.cloneRange()
  }
  /** Hands focus back to whatever surface this view shows, caret included. The
   * saved range steps in only when the surface holds no selection of its own or
   * when a popup collapsed one to a caret, so a command acts on whatever is
   * selected at that moment. */
  function focusSurface() {
    const el = edRef.current ?? taRef.current ?? pvRef.current
    if (!el) return
    const live = liveRange()
    const saved = savedRange.current
    el.focus()
    if (!edRef.current || !saved) return
    if (live && (!live.collapsed || saved.collapsed)) return
    const sel = document.getSelection()
    if (!sel) return
    sel.removeAllRanges()
    sel.addRange(saved)
  }
  function emitWys() {
    const el = edRef.current
    if (!el) return
    // Cleaned on the way out only, so the nodes the caret sits in stay untouched.
    const html = cleanOutgoing(el.innerHTML)
    lastEmit.current = html
    onChange(html)
    syncEmpty()
  }
  function exec(cmd: string, arg?: string) {
    if (!edRef.current) return
    focusSurface()
    document.execCommand(cmd, false, arg)
    saveSel()
    emitWys()
  }

  function insert(pre: string, post: string) {
    const ta = taRef.current
    if (!ta) return
    const { selectionStart: a, selectionEnd: b } = ta
    const sel = value.slice(a, b)
    const next = value.slice(0, a) + pre + sel + post + value.slice(b)
    onChange(next)
    requestAnimationFrame(() => {
      ta.focus()
      // No selection: place the caret between the tags; else keep wrap selected.
      const caret = sel ? a + pre.length + sel.length + post.length : a + pre.length
      ta.setSelectionRange(sel ? a + pre.length : caret, caret)
    })
  }

  /** Writes over the piece of plain text the dialog was opened on. */
  function replacePlain(text: string) {
    const [from, to] = plainSel.current
    onChange(value.slice(0, from) + text + value.slice(to))
    requestAnimationFrame(() => {
      const ta = taRef.current
      if (!ta) return
      ta.focus()
      const caret = from + text.length
      ta.setSelectionRange(caret, caret)
    })
  }

  /** Drops a node where the caret was. The saved range survives the dialog and
   * the focus does not, so this leaves execCommand out of it. */
  function insertRich(node: Node) {
    const el = edRef.current
    if (!el) return
    // A fragment is emptied by the insert, so the node the caret goes behind is
    // read while it still has one.
    const tail = node.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? node.lastChild : node
    if (!tail) return
    const r = savedRange.current
    if (r && el.contains(r.startContainer) && el.contains(r.endContainer)) {
      r.deleteContents()
      r.insertNode(node)
    } else {
      el.appendChild(node)
    }
    const after = document.createRange()
    after.setStartAfter(tail)
    after.collapse(true)
    savedRange.current = after
    emitWys()
    requestAnimationFrame(() => {
      el.focus()
      const sel = document.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(after)
    })
  }

  /** Post source (a quote) into the plain textarea, at the caret it was left
   * at. */
  function insertPlainSource(source: string) {
    const ta = taRef.current
    // The end of whatever is selected, never the span of it: a quote joins the
    // draft rather than taking the place of a selection left lying around.
    const at = ta && plainTouched.current ? ta.selectionEnd : value.length
    const { text, caret } = spliceBlock(value, at, source)
    onChange(text)
    requestAnimationFrame(() => {
      const el = taRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(caret, caret)
    })
  }

  /** Same for the rich surface: the source becomes real nodes and lands on the
   * saved caret. */
  function insertSource(source: string) {
    if (!wysiwyg) return insertPlainSource(source)
    // Behind the selection rather than over it. insertRich deletes what the
    // range covers, which is right for the link dialog plus wrong for a quote.
    savedRange.current?.collapse(false)
    const holder = document.createElement('div')
    holder.innerHTML = bbToHtml(source)
    // A block sitting against the next one leaves nowhere to type between them.
    holder.appendChild(document.createElement('br'))
    const frag = document.createDocumentFragment()
    frag.append(...holder.childNodes)
    insertRich(frag)
  }

  /** Opens the insert dialog with whatever is selected as the starting text. */
  function openInsert(kind: InsertKind) {
    askKind.current = kind
    if (wysiwyg) {
      // Text comes from what is selected right now. An older range keeps its
      // caret but loses its extent, so a selection the reader has left behind
      // is written next to rather than over.
      const live = liveRange()
      if (live) savedRange.current = live.cloneRange()
      else savedRange.current?.collapse(true)
      setAskText(live?.toString() ?? '')
    } else {
      const ta = taRef.current
      const from = ta?.selectionStart ?? value.length
      const to = ta?.selectionEnd ?? from
      plainSel.current = [from, to]
      setAskText(value.slice(from, to))
    }
    setAskUrl('')
    setAskError(null)
    setAsk(kind)
  }

  function confirmInsert() {
    const url = webUrl(askUrl)
    if (!url) return setAskError('That is not a web address. It needs a host, like https://example.com/page.')
    const kind = ask
    setAsk(null)
    if (kind === 'image') {
      // An image joins the text rather than replacing it, so it lands behind
      // whatever was selected.
      if (!wysiwyg) {
        plainSel.current = [plainSel.current[1], plainSel.current[1]]
        return replacePlain(`[img=${url}]`)
      }
      savedRange.current?.collapse(false)
      const img = document.createElement('img')
      img.src = url
      img.alt = imageLabel(url)
      return insertRich(img)
    }
    const text = askText.trim() || url
    if (!wysiwyg) return replacePlain(`[url=${url}]${text}[/url]`)
    const a = document.createElement('a')
    a.href = url
    a.textContent = text
    insertRich(a)
  }

  function apply(t: ToolAction) {
    if (t.ask) return openInsert(t.ask)
    if (!wysiwyg) return insert(t.pre ?? '', t.post ?? '')
    if (t.cmd) exec(t.cmd, t.arg)
  }

  function barButtons(): HTMLButtonElement[] {
    return [...(barRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])].filter((b) => !b.disabled)
  }

  /** Alt+F10 reaches the toolbar from the text, the shortcut MAM's own editor
   * carries. It keeps the toolbar out of the tab order, so Tab moves from the
   * field above straight into the message. */
  function onSurfaceKeyDown(e: React.KeyboardEvent) {
    if (!e.altKey || e.key !== 'F10') return
    const btns = barButtons()
    if (!btns.length) return
    e.preventDefault()
    saveSel()
    btns[Math.min(barAt.current, btns.length - 1)].focus()
  }

  /** Arrows walk the toolbar, Escape hands the caret back. */
  function onBarKeyDown(e: React.KeyboardEvent) {
    const btns = barButtons()
    const root = barRef.current?.getRootNode() as ShadowRoot | Document | undefined
    const at = btns.indexOf(root?.activeElement as HTMLButtonElement)
    if (at < 0) return
    const go = (n: number) => {
      e.preventDefault()
      barAt.current = (n + btns.length) % btns.length
      btns[barAt.current].focus()
    }
    if (e.key === 'ArrowRight') go(at + 1)
    else if (e.key === 'ArrowLeft') go(at - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(btns.length - 1)
    else if (e.key === 'Escape') {
      e.preventDefault()
      // Escape here only leaves the toolbar. Pages around the composer use the
      // same key to drop a reply target, so it must not travel further.
      e.stopPropagation()
      barAt.current = at
      focusSurface()
    }
  }

  const iconBtn = (t: ToolAction) => (
    <Tooltip key={t.label}>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          tabIndex={-1}
          aria-label={t.label}
          className="size-7 text-muted-foreground hover:text-foreground"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => apply(t)}
        >
          <t.icon aria-hidden="true" className="size-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t.label}</TooltipContent>
    </Tooltip>
  )

  return (
    <div className={cn('group overflow-hidden rounded-lg border border-input-line bg-background transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50', className)}>
      <div
        ref={barRef}
        role="toolbar"
        aria-label="Editor toolbar"
        aria-orientation="horizontal"
        // Capture phase: the tooltip on a button answers Escape first and keeps
        // the focus on itself, so the bar has to see the key before it does.
        onKeyDownCapture={onBarKeyDown}
        className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 px-2 py-1.5"
      >
        {/* Formatting toolbar shows when MAM's editor pref is on. In that mode the
            write surface is WYSIWYG; otherwise it's a BBCode textarea + preview.
            Hidden in the Code view: execCommand has no editable to act on there. */}
        {enabled && tab === 'write' && (
          <>
            {MAIN_TOOLS.map(iconBtn)}

        <Popover>
          <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="icon" tabIndex={-1} aria-label="Text color" className="size-7 text-muted-foreground hover:text-foreground" title="Text color" onMouseDown={saveSel}>
            <Palette aria-hidden="true" className="size-3.5" />
          </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="start">
            <div className="grid grid-cols-5 gap-1.5">
              {COLORS.map((c) => (
                <Button
                  key={c}
                  variant="ghost"
                  size="icon"
                  title={c}
                  aria-label={c}
                  onClick={() => (wysiwyg ? exec('foreColor', c) : insert(`[color=${c}]`, '[/color]'))}
                  className="size-6 rounded-full border border-black/10 transition-transform hover:scale-110"
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" tabIndex={-1} aria-label="Text size" className="size-7 text-muted-foreground hover:text-foreground" title="Text size" onMouseDown={saveSel}>
              <Type aria-hidden="true" className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {SIZES.map((n) => (
              <DropdownMenuItem key={n} onClick={() => (wysiwyg ? exec('fontSize', String(n)) : insert(`[size=${n}]`, '[/size]'))}>
                <span style={{ fontSize: SIZE_PX[n] }}>Size {n}</span>{n === 2 && <span className="ml-1 text-10 text-muted-foreground">default</span>}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <span role="separator" aria-orientation="vertical" className="mx-1 h-4 w-px bg-border" />
        {INSERT_TOOLS.map(iconBtn)}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="sm" tabIndex={-1} className="h-7 gap-1 px-1.5 text-11 text-muted-foreground hover:text-foreground" onMouseDown={saveSel}>
              <Braces aria-hidden="true" className="size-3.5" /> more <ChevronDown aria-hidden="true" className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {MORE_TOOLS.map((t) => (
              <DropdownMenuItem
                key={t.label}
                onClick={() => {
                  if (!wysiwyg) insert(t.pre, t.post)
                  else if (t.cmd) exec(t.cmd, t.arg)
                }}
              >
                {t.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
          </>
        )}

        {/* Preview is server-rendered through /jsonPostTest.php in both modes. The
            rich editor keeps its raw-markup Code view as a third option. */}
        <div className="ml-auto flex items-center gap-2">
          <span aria-hidden="true" className="hidden text-10-5 text-muted-foreground opacity-0 transition-opacity group-focus-within:opacity-100 md:inline">
            Alt+F10 for the toolbar
          </span>
          <ToggleGroup
            type="single"
            aria-label="What the box shows"
            value={tab}
            onValueChange={(v) => v && setTab(v as typeof tab)}
            spacing={0.5}
            className="rounded-md bg-muted/70 p-0.5"
          >
            {(wysiwyg
              ? ([['write', PencilLine, 'Write'], ['preview', Eye, 'Preview'], ['source', FileCode2, 'Code']] as const)
              : ([['write', PencilLine, 'Write'], ['preview', Eye, 'Preview']] as const)
            ).map(([key, Icon, label]) => (
              <ToggleGroupItem
                key={key}
                value={key}
                className="h-6 gap-1 px-2 text-11-5 text-muted-foreground data-pressed:bg-background data-pressed:font-medium data-pressed:shadow-sm"
              >
                <Icon aria-hidden="true" className="size-3" /> {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      <span id={hintId} className="sr-only">Press Alt+F10 to reach the formatting toolbar.</span>

      {tab === 'preview' ? (
        <div
          ref={pvRef}
          role="region"
          aria-label="Preview"
          tabIndex={0}
          aria-describedby={describe}
          aria-keyshortcuts="Alt+F10"
          onKeyDown={onSurfaceKeyDown}
          className={cn('px-3.5 py-2.5 outline-none', minHeightClass)}
          aria-busy={preview.status === 'loading'}
        >
          {preview.status === 'loading' ? (
            <p role="status" className="text-13 text-muted-foreground">Rendering preview&hellip;</p>
          ) : preview.status === 'error' ? (
            <>
              <p role="status" className="mb-2 text-12 text-muted-foreground">Server preview unavailable, this is the local approximation.</p>
              <RichHtml html={bbToHtml(value)} className={POST_SPACING} />
            </>
          ) : preview.status === 'server-error' ? (
            <p role="status" className="text-13 text-muted-foreground">{preview.message}</p>
          ) : preview.status === 'done' ? (
            <RichHtml html={preview.html} className={POST_SPACING} />
          ) : (
            <p className="text-13 text-muted-foreground">Nothing to preview yet.</p>
          )}
        </div>
      ) : wysiwyg && tab === 'source' ? (
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          placeholder={placeholder}
          aria-label={placeholder}
          aria-describedby={describe}
          aria-keyshortcuts="Alt+F10"
          onKeyDown={onSurfaceKeyDown}
          className={cn('block w-full resize-none overflow-y-auto bg-transparent px-3.5 py-2.5 font-mono text-12-5 leading-relaxed outline-none placeholder:text-muted-foreground max-h-[70vh]', minHeightClass)}
        />
      ) : wysiwyg ? (
        <div className="relative">
          {empty && placeholder && (
            <div className="pointer-events-none absolute left-3.5 top-2.5 text-13-5 text-muted-foreground">{placeholder}</div>
          )}
          <div
            ref={edRef}
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-label={placeholder}
            aria-describedby={describe}
            aria-keyshortcuts="Alt+F10"
            onInput={emitWys}
            onKeyDown={onSurfaceKeyDown}
            onKeyUp={saveSel}
            onMouseUp={saveSel}
            className={cn(
              'block w-full overflow-y-auto bg-transparent px-3.5 py-2.5 text-13-5 leading-normal outline-none max-h-[70vh]',
              '[&_a]:font-medium [&_a]:text-brand [&_a]:underline [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5',
              '[&_img]:max-w-full [&_img]:rounded-sm',
              // A picture that cannot load reads as its file name in a dashed
              // box. The base layer puts every picture on its own block, which a
              // box the size of its own name has no use for.
              '[&_.bb-img-missing]:inline-block [&_.bb-img-missing]:w-auto',
              '[&_.bb-img-missing]:rounded [&_.bb-img-missing]:border [&_.bb-img-missing]:border-dashed [&_.bb-img-missing]:border-muted-foreground/35',
              '[&_.bb-img-missing]:bg-muted/40 [&_.bb-img-missing]:px-2 [&_.bb-img-missing]:py-1 [&_.bb-img-missing]:align-middle',
              '[&_.bb-img-missing]:text-11-5 [&_.bb-img-missing]:text-muted-foreground',
              '[&_blockquote]:my-1 [&_blockquote]:rounded-md [&_blockquote]:bg-muted [&_blockquote]:px-3 [&_blockquote]:py-1.5 [&_blockquote]:text-muted-foreground',
              QUOTE_CLASSES,
              '[&_pre]:my-1 [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-2 [&_pre]:font-mono [&_pre]:text-12-5',
              minHeightClass
            )}
          />
        </div>
      ) : (
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          aria-describedby={describe}
          aria-keyshortcuts="Alt+F10"
          onKeyDown={onSurfaceKeyDown}
          onFocus={() => (plainTouched.current = true)}
          className={cn('block w-full resize-none overflow-y-auto bg-transparent px-3.5 py-2.5 text-13-5 outline-none placeholder:text-muted-foreground max-h-[70vh]', minHeightClass)}
        />
      )}

      <Dialog open={ask !== null} onOpenChange={(open) => !open && setAsk(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{askKind.current === 'image' ? 'Insert an image' : 'Insert a link'}</DialogTitle>
            <DialogDescription>
              {askKind.current === 'image'
                ? 'The address of an image that is already online. Preview shows how it lands in the post.'
                : 'Where it goes plus the words that carry it.'}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              confirmInsert()
            }}
          >
            <FieldGroup>
              <Field data-invalid={askError ? true : undefined}>
                <FieldLabel htmlFor={askUrlId} className="text-13-5">
                  {askKind.current === 'image' ? 'Image address' : 'Link address'}
                </FieldLabel>
                <Input
                  id={askUrlId}
                  autoFocus
                  value={askUrl}
                  placeholder="https://"
                  className="text-13"
                  aria-invalid={askError ? true : undefined}
                  aria-describedby={askError ? askErrorId : undefined}
                  onChange={(e) => {
                    setAskUrl(e.target.value)
                    setAskError(null)
                  }}
                />
                <FieldError id={askErrorId} className="text-12">{askError}</FieldError>
              </Field>
              {askKind.current === 'link' && (
                <Field>
                  <FieldLabel htmlFor={askTextId} className="text-13-5">Text to show</FieldLabel>
                  <Input
                    id={askTextId}
                    value={askText}
                    placeholder="Leave empty to show the address itself"
                    className="text-13"
                    onChange={(e) => setAskText(e.target.value)}
                  />
                </Field>
              )}
            </FieldGroup>
            <DialogFooter className="mt-5">
              <DialogClose render={<Button type="button" variant="outline">Cancel</Button>} />
              <Button type="submit">Insert</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
