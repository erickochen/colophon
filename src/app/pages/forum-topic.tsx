import { useMemo, useState } from 'react'
import { Bell, BellRing, Flag, Mail, Pencil, Quote, Send } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { extractTopic, type TopicPost } from '@/lib/extract/forum'
import { LegacyView } from '@/app/pages/legacy'
import { Crumbs, Pager, RichHtml } from '@/app/shell/bits'
import { initials } from '@/lib/format'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { BBComposer } from '@/components/bb-composer'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from '@/components/ui/toast'

function Post({ p, onQuote }: { p: TopicPost; onQuote: (p: TopicPost) => void }) {
  return (
    <Card id={`post-${p.pid}`} className="gap-0 overflow-hidden py-0">
      <div className="flex items-center justify-between gap-3 bg-muted/40 px-6 py-2.5">
        <div className="flex min-w-0 items-baseline gap-2 text-[12.5px]">
          <a href={p.permalink} className="font-mono text-[11px] text-muted-foreground hover:underline">#{p.pid}</a>
          {p.author && <a href={p.author.href} className="truncate font-semibold hover:underline">{p.author.name}</a>}
          {p.authorTitle && <span className="truncate text-muted-foreground">({p.authorTitle})</span>}
        </div>
        <span className="shrink-0 text-[11.5px] text-muted-foreground" title={p.at ?? ''}>
          {p.rel ?? p.at ?? ''}
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
          <RichHtml html={p.bodyHtml} />
          {p.edited && <p className="mt-3 text-[11px] italic text-muted-foreground">{p.edited}</p>}
          {p.sig && (
            <>
              <div className="my-3" />
              <p className="text-[11.5px] italic text-muted-foreground [overflow-wrap:anywhere]">{p.sig}</p>
            </>
          )}
          <div className="mt-3 flex justify-end gap-1">
            {p.editHref && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button asChild variant="ghost" size="icon" className="size-7 text-muted-foreground">
                    <a href={p.editHref}><Pencil className="size-3.5" /></a>
                  </Button>
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

/** getQuote.php returns the post body as HTML; flatten it to readable text while
 * keeping paragraph/line breaks, so the quote reads cleanly in the composer. */
function quoteBodyToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.body.querySelectorAll('br').forEach((br) => br.replaceWith('\n'))
  doc.body.querySelectorAll('p, div, li').forEach((el) => el.append('\n'))
  return (doc.body.textContent ?? '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
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
  const [reply, setReply] = useState('')
  const [subscribed, setSubscribed] = useState(readSubscribed)
  const [subBusy, setSubBusy] = useState(false)
  if (!data) return <LegacyView {...props} />

  // Quote via MAM's own getQuote endpoint (same format as its native button),
  // but append into OUR composer state so it is visible and stacks for
  // multi-quote. Bypasses MAM's addTextToEditor, which targets the removed
  // TinyMCE and so dropped the quote entirely.
  async function quotePost(p: TopicPost) {
    try {
      const r = await fetch(`/forums/json/getQuote.php?pid=${p.pid}`, { credentials: 'include' })
      const q = await r.json()
      if (!q?.success) {
        toast.error(q?.msg || 'Quote is not available.')
        return
      }
      const text = quoteBodyToText(String(q.body ?? ''))
      const block = `[quote=${q.username}#p${q.pid}]\n${text}\n[/quote]\n\n`
      setReply((prev) => (prev.trim() ? `${prev.replace(/\n+$/, '')}\n\n${block}` : block))
      toast.success(`Quoted ${q.username}`)
      props.host.shadowRoot?.getElementById('quick-reply')?.scrollIntoView({ behavior: 'smooth' })
    } catch {
      toast.error('Quote is not available.')
    }
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
    form.submit()
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
      <div className="grid gap-3">
        {data.posts.map((p) => <Post key={p.pid} p={p} onQuote={quotePost} />)}
      </div>
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
