import { useImperativeHandle, useLayoutEffect, useRef, useState, type ComponentType } from 'react'
import {
  Bold, Braces, ChevronDown, Code, Eye, FileCode2, Image as ImageIcon, Italic, Link2, List,
  ListOrdered, Palette, PencilLine, Quote, Strikethrough, Type, Underline,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { POST_SPACING, QUOTE_CLASSES, RichHtml } from '@/app/shell/bits'
import { cleanHtml } from '@/lib/sanitize'
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

const WYSIWYG_KEY = 'muisstil:wysiwyg'

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
      .replace(/\[img=(https?:\/\/[^\]\s"']+?\.(?:gif|jpe?g|png)[^\]\s"']*)\]/gi, '<img src="$1" alt=""/>')
      .replace(/\[img\](https?:\/\/[^\]\s"']+?\.(?:gif|jpe?g|png)[^\]\s"']*)\[\/img\]/gi, '<img src="$1" alt=""/>')
      .replace(/\[url=(https?:\/\/[^\]\s"']{1,500})\]([\s\S]*?)\[\/url\]/gi, '<a href="$1" target="_blank" rel="noopener noreferrer">$2</a>')
      .replace(/\[url\](https?:\/\/[^\]\s"']{1,500})\[\/url\]/gi, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/\[email\]([^\]\s"']{1,200})\[\/email\]/gi, '<a href="mailto:$1">$1</a>')
  }
  // Newlines that only pad block tags are HTML layout; collapse those, turn the
  // rest into <br> (plain-text line breaks), then sanitize the whole fragment.
  s = s.replace(/>\s*\n\s*</g, '><').replace(/\n/g, '<br/>')
  const div = document.createElement('div')
  div.innerHTML = s
  return cleanHtml(div) ?? ''
}

/** A tool carries both its BBCode wrap (plain textarea mode) and its execCommand
 * mapping (WYSIWYG mode). `prompt` marks tools that ask for a URL first. */
interface ToolAction {
  icon: ComponentType<{ className?: string }>
  label: string
  pre: string
  post: string
  block?: boolean
  cmd?: string
  arg?: string
  prompt?: string
}

const MAIN_TOOLS: ToolAction[] = [
  { icon: Bold, label: 'Bold', pre: '[b]', post: '[/b]', cmd: 'bold' },
  { icon: Italic, label: 'Italic', pre: '[i]', post: '[/i]', cmd: 'italic' },
  { icon: Underline, label: 'Underline', pre: '[u]', post: '[/u]', cmd: 'underline' },
  { icon: Strikethrough, label: 'Strikethrough', pre: '[s]', post: '[/s]', cmd: 'strikeThrough' },
]
const INSERT_TOOLS: ToolAction[] = [
  { icon: Link2, label: 'Link', pre: '[url=https://]', post: '[/url]', cmd: 'createLink', prompt: 'Link URL' },
  { icon: ImageIcon, label: 'Image', pre: '[img=https://', post: ']', cmd: 'insertImage', prompt: 'Image URL' },
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
}

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
  // 'source' is the raw-markup view behind the rich editor; 'preview' is the
  // rendered view behind the plain BBCode textarea. Never both: which pair the
  // toggle offers depends on the mode.
  const [tab, setTab] = useState<'write' | 'preview' | 'source'>('write')
  const taRef = useRef<HTMLTextAreaElement>(null)
  const edRef = useRef<HTMLDivElement>(null)
  const lastEmit = useRef<string | null>(null)
  const savedRange = useRef<Range | null>(null)
  // contentEditable keeps a stray <br> when emptied, so :empty is unreliable for
  // a CSS placeholder; track emptiness ourselves and overlay the placeholder.
  const [empty, setEmpty] = useState(true)
  const syncEmpty = () => {
    const el = edRef.current
    setEmpty(!!el && !el.textContent?.trim() && !el.querySelector('img'))
  }

  useImperativeHandle(ref, () => ({
    focus: () => (edRef.current ?? taRef.current)?.focus(),
  }))

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
    syncEmpty()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on a view switch
  }, [tab])

  function saveSel() {
    const sel = document.getSelection()
    if (sel && sel.rangeCount && edRef.current?.contains(sel.anchorNode)) {
      savedRange.current = sel.getRangeAt(0).cloneRange()
    }
  }
  function emitWys() {
    const el = edRef.current
    if (!el) return
    lastEmit.current = el.innerHTML
    onChange(el.innerHTML)
    syncEmpty()
  }
  function exec(cmd: string, arg?: string) {
    const el = edRef.current
    if (!el) return
    el.focus()
    // Popovers/dropdowns steal focus and collapse the selection; restore it.
    const sel = document.getSelection()
    if (savedRange.current && sel) {
      sel.removeAllRanges()
      sel.addRange(savedRange.current)
    }
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

  function apply(t: ToolAction) {
    if (!wysiwyg) return insert(t.pre, t.post)
    if (t.prompt) {
      const url = window.prompt(t.prompt, 'https://')
      if (url && t.cmd) exec(t.cmd, url)
      return
    }
    if (t.cmd) exec(t.cmd, t.arg)
  }

  const iconBtn = (t: ToolAction) => (
    <Tooltip key={t.label}>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
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
    <div className={cn('overflow-hidden rounded-lg border border-input bg-background transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50', className)}>
      <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 px-2 py-1.5">
        {/* Formatting toolbar shows when MAM's editor pref is on. In that mode the
            write surface is WYSIWYG; otherwise it's a BBCode textarea + preview.
            Hidden in the Code view: execCommand has no editable to act on there. */}
        {enabled && tab === 'write' && (
          <>
            {MAIN_TOOLS.map(iconBtn)}

        <Popover>
          <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground" title="Text color" onMouseDown={saveSel}>
            <Palette className="size-3.5" />
          </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="start">
            <div className="grid grid-cols-5 gap-1.5">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={c}
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
            <Button type="button" variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground" title="Text size" onMouseDown={saveSel}>
              <Type className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {SIZES.map((n) => (
              <DropdownMenuItem key={n} onClick={() => (wysiwyg ? exec('fontSize', String(n)) : insert(`[size=${n}]`, '[/size]'))}>
                <span style={{ fontSize: SIZE_PX[n] }}>Size {n}</span>{n === 2 && <span className="ml-1 text-[10px] text-muted-foreground">default</span>}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="mx-1 h-4 w-px bg-border" />
        {INSERT_TOOLS.map(iconBtn)}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-1.5 text-[11px] text-muted-foreground hover:text-foreground" onMouseDown={saveSel}>
              <Braces className="size-3.5" /> more <ChevronDown className="size-3" />
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

        {/* Second view depends on the mode: the rich editor already renders the
            result, so its counterpart is the raw markup; the plain textarea shows
            markup already, so its counterpart is the rendered preview. */}
        <div className="ml-auto flex items-center gap-0.5 rounded-md bg-muted/70 p-0.5">
          {(wysiwyg
            ? ([['write', PencilLine, 'Write'], ['source', FileCode2, 'Code']] as const)
            : ([['write', PencilLine, 'Write'], ['preview', Eye, 'Preview']] as const)
          ).map(([key, Icon, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                'flex items-center gap-1 rounded px-2 py-0.5 text-[11.5px] transition-colors',
                tab === key ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="size-3" /> {label}
            </button>
          ))}
        </div>
      </div>

      {wysiwyg && tab === 'source' ? (
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          placeholder={placeholder}
          aria-label={placeholder}
          aria-describedby={describedBy}
          className={cn('block w-full resize-none overflow-y-auto bg-transparent px-3.5 py-2.5 font-mono text-[12.5px] leading-relaxed outline-none placeholder:text-muted-foreground max-h-[70vh]', minHeightClass)}
        />
      ) : wysiwyg ? (
        <div className="relative">
          {empty && placeholder && (
            <div className="pointer-events-none absolute left-3.5 top-2.5 text-[13.5px] text-muted-foreground">{placeholder}</div>
          )}
          <div
            ref={edRef}
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-label={placeholder}
            aria-describedby={describedBy}
            onInput={emitWys}
            onKeyUp={saveSel}
            onMouseUp={saveSel}
            className={cn(
              'block w-full overflow-y-auto bg-transparent px-3.5 py-2.5 text-[13.5px] leading-normal outline-none max-h-[70vh]',
              '[&_a]:font-medium [&_a]:text-brand [&_a]:underline [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5',
              '[&_blockquote]:my-1 [&_blockquote]:rounded-md [&_blockquote]:bg-muted/60 [&_blockquote]:px-3 [&_blockquote]:py-1.5 [&_blockquote]:text-muted-foreground',
              QUOTE_CLASSES,
              '[&_pre]:my-1 [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-2 [&_pre]:font-mono [&_pre]:text-[12.5px]',
              minHeightClass
            )}
          />
        </div>
      ) : tab === 'write' ? (
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          aria-describedby={describedBy}
          className={cn('block w-full resize-none overflow-y-auto bg-transparent px-3.5 py-2.5 text-[13.5px] outline-none placeholder:text-muted-foreground max-h-[70vh]', minHeightClass)}
        />
      ) : (
        <div className={cn('px-3.5 py-2.5', minHeightClass)}>
          {value.trim()
            ? <RichHtml html={bbToHtml(value)} className={POST_SPACING} />
            : <p className="text-[13px] text-muted-foreground">Nothing to preview yet.</p>}
        </div>
      )}
    </div>
  )
}
