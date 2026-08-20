import { useEffect, useMemo, useRef, useState } from 'react'
import { Bell, BellRing, Flag, Mail, Pencil, Quote, Send } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { extractTopic, type TopicPost } from '@/lib/extract/forum'
import { LegacyView } from '@/app/pages/legacy'
import { Crumbs, Pager, POST_SPACING, RichHtml } from '@/app/shell/bits'
import { initials, localDateTime, utcTitle } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { BBComposer } from '@/components/bb-composer'
import { PostEditor, type PostEditorHandle } from '@/components/post-editor'
import { SelectionQuote } from '@/components/quote-selection'
import { useFeature } from '@/lib/settings'
import type { BubbleSelection } from '@/components/conversation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from '@/components/ui/toast'
import { GiftActions } from '@/components/giftmam-actions'
import { uidFromHref } from '@/lib/giftmam'
import { scrollIntoView } from '@/lib/motion'
import { mamFetch } from '@/lib/mam-fetch'
import { submitNative } from '@/lib/form-submit'

/** Post images can finish loading after the first paint and push the target
 * down, so the anchor jump runs once more after this pause. */
const ANCHOR_SETTLE_MS = 400

function Post({
  p, onQuote, myUid, editing, inlineEdit, onEdit, dirtyRef, editorRef,
}: {
  p: TopicPost
  onQuote: (p: TopicPost) => void
  myUid: string | null
  editing: boolean
  inlineEdit: boolean
  onEdit: (pid: string | null) => void
  dirtyRef: React.RefObject<boolean>
  editorRef: React.Ref<PostEditorHandle>
}) {
  // Your own posts sit in the same list. Gifting yourself goes nowhere.
  const authorUid = uidFromHref(p.author?.href ?? null)
  const giftUid = authorUid && authorUid !== myUid ? authorUid : null
  return (
    // data-bubble marks the post as one quotable block, the same way a message
    // bubble does, so a highlight inside it can be quoted on its own. The post
    // being edited drops the mark: quoting your own draft into itself is not an
    // offer worth making.
    <Card
      id={`post-${p.pid}`}
      data-bubble={editing ? undefined : p.pid}
      className="scroll-mt-18 gap-0 overflow-hidden py-0"
    >
      <div className="flex items-center justify-between gap-3 bg-muted/40 px-6 py-2.5">
        <div className="flex min-w-0 items-baseline gap-2 text-[12.5px]">
          <a href={p.permalink} className="font-mono text-[11px] text-muted-foreground hover:underline">#{p.pid}</a>
          {p.author && <a href={p.author.href} className="truncate font-semibold hover:underline">{p.author.name}</a>}
          {p.authorTitle && <span className="truncate text-muted-foreground">({p.authorTitle})</span>}
        </div>
        <span className="shrink-0 text-[11.5px] text-muted-foreground" title={utcTitle(p.at)}>
          {p.rel ?? localDateTime(p.at)}
        </span>
      </div>
      <CardContent className="grid gap-4 px-6 py-4 sm:grid-cols-[150px_minmax(0,1fr)]">
        <div className="hidden content-start justify-items-center gap-1.5 text-center sm:grid">
          <Avatar className="size-20 rounded-lg">
            {p.avatar && <AvatarImage src={p.avatar} alt="" />}
            <AvatarFallback className="rounded-lg font-display text-lg">{initials(p.author?.name ?? '?')}</AvatarFallback>
          </Avatar>
          {p.klass && <span className="text-[11.5px] font-medium">{p.klass}</span>}
          <div className="font-mono text-[10.5px] leading-relaxed text-muted-foreground">
            {p.stats.posts && <>{p.stats.posts} posts<br /></>}
            {p.stats.ratio && <>ratio {p.stats.ratio}<br /></>}
            {p.stats.ul && <>↑ {p.stats.ul}<br /></>}
            {p.stats.dl && <>↓ {p.stats.dl}</>}
          </div>
        </div>
        <div className="min-w-0">
          {editing ? (
            <PostEditor pid={p.pid} onClose={() => onEdit(null)} dirtyRef={dirtyRef} ref={editorRef} />
          ) : (
            <RichHtml html={p.bodyHtml} className={POST_SPACING} />
          )}
          {!editing && p.edited && <p className="mt-3 text-[11px] italic text-muted-foreground">{p.edited}</p>}
          {!editing && p.sigHtml && (
            <RichHtml
              html={p.sigHtml}
              className={cn(POST_SPACING, 'mt-5 border-t pt-3 text-[12px] text-muted-foreground [&_img]:max-h-28')}
            />
          )}
          <div className={cn('mt-3 flex justify-end gap-1', editing && 'hidden')}>
            {p.editHref && (
              <Tooltip>
                <TooltipTrigger asChild>
                  {inlineEdit ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground"
                      aria-label="Edit this post"
                      onClick={() => onEdit(String(p.pid))}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                  ) : (
                    <Button asChild variant="ghost" size="icon" className="size-7 text-muted-foreground">
                      <a href={p.editHref}><Pencil className="size-3.5" /></a>
                    </Button>
                  )}
                </TooltipTrigger>
                <TooltipContent>Edit this post</TooltipContent>
              </Tooltip>
            )}
            {p.pmHref && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button asChild variant="ghost" size="icon" className="size-7 text-muted-foreground">
                    <a href={p.pmHref}><Mail className="size-3.5" /></a>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Send a PM</TooltipContent>
              </Tooltip>
            )}
            {giftUid && <GiftActions uid={giftUid} name={p.author?.name ?? 'this member'} surface="forum" />}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost" size="icon" className="size-7 text-muted-foreground"
                  onClick={() => onQuote(p)}
                >
                  <Quote className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Quote this post</TooltipContent>
            </Tooltip>
            {p.reportHref && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button asChild variant="ghost" size="icon" className="size-7 text-muted-foreground">
                    <a href={p.reportHref}><Flag className="size-3.5" /></a>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Report to staff</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/** Header line of a rendered quote block: "name in post #123 wrote:". */
const QUOTE_ATTRIBUTION = /^(.+?)(?: in post #(\d+))? wrote:$/

/** getQuote.php returns the post body as rendered HTML, with editor padding
 * (non-breaking spaces) and earlier quotes as nested div.quote blocks. Rebuild
 * those as BBCode and flatten to text, so the quote posts back intact. */
function quoteBodyToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  // Whitespace-only text nodes holding a raw newline are block formatting, not
  // content; dropping them keeps every block join a single line break.
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
  const noise: Text[] = []
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (/^[ \t]*[\r\n][ \t\r\n]*$/.test(node.nodeValue ?? '')) noise.push(node as Text)
  }
  noise.forEach((node) => node.remove())
  doc.body.querySelectorAll('div.quote').forEach((quote) => {
    const span = quote.querySelector(':scope > span:first-child')
    const attribution = span?.textContent?.trim().match(QUOTE_ATTRIBUTION)
    if (span && attribution) span.remove()
    const open = !attribution
      ? '[quote]'
      : attribution[2]
        ? `[quote=${attribution[1]}#p${attribution[2]}]`
        : `[quote=${attribution[1]}]`
    quote.prepend(`${open}\n`)
    quote.append('\n[/quote]')
  })
  doc.body.querySelectorAll('br').forEach((br) => br.replaceWith('\n'))
  doc.body.querySelectorAll('p, div, li').forEach((el) => el.append('\n'))
  return (doc.body.textContent ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/(\[quote(?:=[^\]\n]{1,80})?\])\n{2,}/gi, '$1\n')
    .replace(/\n{2,}(\[\/quote\])/gi, '\n$1')
    .trim()
}

/** MAM's own toggle: "Subscribe to thread" vs "Unsubscribe to thread". */
const subInput = () => document.querySelector<HTMLInputElement>('input[name="subThread"]')
const readSubscribed = () => {
  const el = subInput()
  return el ? !/^subscribe/i.test(el.value.trim()) : false
}

/** MAM's "Quick jump" forum picker at the foot of a topic (a GET form whose
 * <select name="forumid"> options are forum ids). We render it as a Select that
 * navigates to our canonical board route. */
function useForumJump() {
  return useMemo(() => {
    const sel = document.querySelector<HTMLSelectElement>('form[name="jump"] select[name="forumid"], select[name="forumid"]')
    if (!sel) return null
    const opt = (o: HTMLOptionElement) => ({ value: o.value, label: o.textContent?.replace(/\s+/g, ' ').trim() ?? o.value })
    const groups = [...sel.querySelectorAll('optgroup')].map((og) => ({
      label: og.getAttribute('label') ?? '',
      options: [...og.querySelectorAll<HTMLOptionElement>('option')].map(opt).filter((o) => o.value),
    }))
    const loose = [...sel.querySelectorAll<HTMLOptionElement>(':scope > option')].map(opt).filter((o) => o.value)
    return groups.length || loose.length ? { groups, loose } : null
  }, [])
}

export function ForumTopicView(props: PageProps) {
  const data = useMemo(() => extractTopic(document), [])
  const jump = useForumJump()
  const myUid = props.page.user.uid != null ? String(props.page.user.uid) : null
  const [reply, setReply] = useState('')
  const [subscribed, setSubscribed] = useState(readSubscribed)
  const [subBusy, setSubBusy] = useState(false)
  const posts = useRef<HTMLDivElement>(null)
  const [inlineEdit] = useFeature('inlineEdit')
  const [editingPid, setEditingPid] = useState<string | null>(null)
  // A ref rather than state: the topic asks about unsaved text without a render,
  // which would replace every post body plus drop a reader's selection.
  const dirty = useRef(false)
  const [ask, setAsk] = useState<{ next: string | null } | null>(null)
  const editor = useRef<PostEditorHandle | null>(null)

  // The URL's #<pid> points at an anchor in MAM's hidden page, which the
  // browser cannot scroll to. Jump to our card for that post instead.
  useEffect(() => {
    const jump = () => {
      const pid = location.hash.replace(/^#p?/, '')
      if (!/^\d+$/.test(pid)) return
      props.host.shadowRoot?.getElementById(`post-${pid}`)?.scrollIntoView({ block: 'start' })
    }
    const raf = requestAnimationFrame(jump)
    const settle = window.setTimeout(jump, ANCHOR_SETTLE_MS)
    window.addEventListener('hashchange', jump)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(settle)
      window.removeEventListener('hashchange', jump)
    }
  }, [])

  if (!data) return <LegacyView {...props} />

  // Every quote lands in OUR composer state, so a reply can stack as many as it
  // likes. MAM's own addTextToEditor targets the removed TinyMCE and dropped
  // the quote entirely.
  function addQuote(who: string, pid: string | number, text: string) {
    const block = `[quote=${who}#p${pid}]\n${text}\n[/quote]\n\n`
    // An open editor is where the writing is happening, so the quote goes there
    // rather than into the reply box at the foot of the topic.
    if (editingPid && editor.current) {
      const landed = editor.current.append(block)
      if (landed === 'added') toast.success(`Quoted ${who}`)
      else toast.info(`Quoting ${who}`, { description: 'It goes in as soon as the editor is ready.' })
      scrollIntoView(props.host.shadowRoot?.getElementById(`post-${editingPid}`))
      return
    }
    setReply((prev) => (prev.trim() ? `${prev.replace(/\n+$/, '')}\n\n${block}` : block))
    toast.success(`Quoted ${who}`)
    scrollIntoView(props.host.shadowRoot?.getElementById('quick-reply'))
  }

  // A whole post comes from MAM's own getQuote endpoint, in the format its
  // native button produces.
  async function quotePost(p: TopicPost) {
    try {
      const r = await mamFetch(`/forums/json/getQuote.php?pid=${p.pid}`, { credentials: 'include' })
      const q = await r.json()
      if (!q?.success) {
        toast.error(q?.msg || 'Quote is not available.')
        return
      }
      addQuote(String(q.username), q.pid, quoteBodyToText(String(q.body ?? '')))
    } catch {
      toast.error('Quote is not available.')
    }
  }

  // A highlight is already the text we want, so it needs no fetch. The author
  // comes from the post the highlight sits in.
  function quoteSelection(selection: BubbleSelection) {
    const post = data?.posts.find((p) => String(p.pid) === selection.navKey)
    addQuote(post?.author?.name ?? 'Anonymous', selection.navKey, selection.text)
  }

  /** Opening an editor, moving it plus closing it all pass through here, so
   * unsaved text is asked about once whichever way it goes. */
  function wantEdit(next: string | null) {
    if (dirty.current) {
      setAsk({ next })
      return
    }
    setEditingPid(next)
  }

  function submitReply() {
    const body = document.querySelector<HTMLTextAreaElement>('form[name="compose"] textarea[name="body"]')
    const form = document.querySelector<HTMLFormElement>('form[name="compose"]')
    if (!body || !form) {
      toast.error('Reply form is not available (topic may be locked).')
      return
    }
    // Merge whatever MAM's quote-JS put in the original box with our draft.
    const original = body.value.trim()
    body.value = [original, reply.trim()].filter(Boolean).join('\n')
    if (body.value.trim().length === 0) {
      toast.warning('Write something first.')
      return
    }
    submitNative(form)
  }

  function subscribe() {
    const btn = subInput()
    if (!btn) {
      toast.error('Subscribe is not available on this topic.')
      return
    }
    setSubBusy(true)
    btn.click()
    // MAM's ajax rewrites the button's value on success; watch it rather than
    // guessing the new state and give up quietly if the call never lands.
    let tries = 0
    const timer = window.setInterval(() => {
      const now = readSubscribed()
      if (now !== subscribed || ++tries > 25) {
        window.clearInterval(timer)
        setSubscribed(now)
        setSubBusy(false)
      }
    }, 200)
  }

  return (
    <div className="grid gap-4">
      <Crumbs items={data.crumbs} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-[24px] font-semibold leading-tight tracking-tight">{data.title}</h1>
        <Button
          variant={subscribed ? 'secondary' : 'outline'}
          size="sm"
          className="h-8 text-[12.5px]"
          onClick={subscribe}
          disabled={subBusy}
        >
          {subscribed ? <BellRing className="text-brand" /> : <Bell />}
          {subscribed ? 'Subscribed' : 'Subscribe'}
        </Button>
      </div>
      <Pager pages={data.pages} prevHref={data.prevHref} nextHref={data.nextHref} />
      <div ref={posts} className="grid gap-3">
        {data.posts.map((p) => (
          <Post
            key={p.pid}
            p={p}
            onQuote={quotePost}
            myUid={myUid}
            editing={editingPid === String(p.pid)}
            inlineEdit={inlineEdit}
            onEdit={wantEdit}
            dirtyRef={dirty}
            editorRef={editor}
          />
        ))}
      </div>
      <AlertDialog open={!!ask} onOpenChange={(open) => !open && setAsk(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Throw away your changes?</AlertDialogTitle>
            <AlertDialogDescription>This post has edits you have not saved yet.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                // The editor is still mounted here, so this reaches the kept
                // text before the component goes.
                editor.current?.discard()
                dirty.current = false
                setEditingPid(ask?.next ?? null)
                setAsk(null)
              }}
            >
              Throw away
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Only worth offering where the quote has somewhere to land: the reply
          box plus any editor open on one of these posts. */}
      <SelectionQuote scope={posts} onQuote={quoteSelection} disabled={!data.quickReply && !editingPid} />
      <Pager pages={data.pages} prevHref={data.prevHref} nextHref={data.nextHref} />
      {data.quickReply && (
        <Card id="quick-reply">
          <CardContent className="grid gap-2.5">
            <h2 className="font-display text-[15px] font-semibold">Write a reply</h2>
            <BBComposer value={reply} onChange={setReply} placeholder="Join the conversation…" />
            <div className="flex justify-end">
              <Button onClick={submitReply}><Send /> Post reply</Button>
            </div>
          </CardContent>
        </Card>
      )}
      {jump && (
        <div className="flex items-center justify-end gap-2 pt-1 text-[12.5px] text-muted-foreground">
          <span>Jump to forum</span>
          <Select onValueChange={(v) => v && location.assign(`/f/b/${v}`)}>
            <SelectTrigger size="sm" className="w-60"><SelectValue placeholder="Choose a forum…" /></SelectTrigger>
            <SelectContent className="max-h-72">
              {jump.loose.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              {jump.groups.map((g) => (
                <SelectGroup key={g.label}>
                  <SelectLabel>{g.label}</SelectLabel>
                  {g.options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}
