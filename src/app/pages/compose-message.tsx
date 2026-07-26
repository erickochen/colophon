import { useEffect, useMemo, useState } from 'react'
import { CornerUpLeft, Mail, Quote, Send } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { SimpleFormView } from '@/app/pages/simple-form'
import { BBComposer } from '@/components/bb-composer'
import { PageHeader, RichHtml, UserLink } from '@/app/shell/bits'
import { initials, relTime } from '@/lib/format'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/toast'

const REPLY_KEY = 'muisstil:reply'

export interface ReplyContext {
  receiver: string
  subject: string
  fromName: string | null
  fromColor: string | null
  fromHref: string | null
  date: string | null
  bodyHtml: string | null
  at: number
}

/** Called from the mailbox Reply button: stash the message being answered so the
 * compose page (a full navigation away) can show it and prefill the subject. */
export function stashReply(ctx: Omit<ReplyContext, 'at'>) {
  try {
    sessionStorage.setItem(REPLY_KEY, JSON.stringify({ ...ctx, at: Date.now() }))
  } catch {
    /* sessionStorage full/blocked: reply still works, just without context. */
  }
}

function parseReply(receiver: string | null): ReplyContext | null {
  if (!receiver) return null
  try {
    const raw = sessionStorage.getItem(REPLY_KEY)
    if (!raw) return null
    const ctx = JSON.parse(raw) as ReplyContext
    // Only when it belongs to this recipient and is fresh (a stale stash must
    // not turn a brand-new message into a fake reply).
    if (ctx.receiver !== receiver || Date.now() - ctx.at > 30 * 60_000) return null
    return ctx
  } catch {
    return null
  }
}

const htmlToText = (html: string | null): string => {
  if (!html) return ''
  // DOMParser never executes scripts or loads resources - safe for extracting
  // the plain text of an already-sanitized fragment.
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return doc.body.textContent?.replace(/\n{3,}/g, '\n\n').trim() ?? ''
}

/** Compose or reply to a private message (/sendmessage.php). A reply lands on
 * the same blank form, so we show the message being answered and prefill
 * "Re: …", while submitting MAM's original form unchanged. */
export function ComposeMessageView(props: PageProps) {
  const model = useMemo(() => {
    const main = props.page.mainContent
    const form = main?.querySelector<HTMLFormElement>('form[action*="takemessage" i], form[method="post" i]')
    if (!form) return null
    const subjectEl = form.querySelector<HTMLInputElement>('input[name="subject"]')
    const msgEl = form.querySelector<HTMLTextAreaElement>('textarea[name="msg"], textarea[name="message"], textarea')
    if (!subjectEl || !msgEl) return null
    const saveEl = form.querySelector<HTMLInputElement>('input[name="save"]')
    const receiverEl = form.querySelector<HTMLInputElement>('input[name="receiver"]')
    const recipientA = main?.querySelector<HTMLAnchorElement>('h1 a[href^="/u/"], h1 a')
    return {
      form,
      subjectEl,
      msgEl,
      saveEl,
      receiver: receiverEl?.value ?? new URLSearchParams(location.search).get('receiver'),
      recipientName: recipientA?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
      recipientHref: recipientA?.getAttribute('href') ?? null,
    }
  }, [props.page.mainContent])

  // Read the stash once for this recipient; clear it after mount so a later
  // visit to the same person is a fresh message, not a stale reply.
  const [reply] = useState<ReplyContext | null>(() => (model ? parseReply(model.receiver) : null))
  useEffect(() => {
    try { sessionStorage.removeItem(REPLY_KEY) } catch { /* ignore */ }
  }, [])

  const initialSubject = useMemo(() => {
    if (!model) return ''
    if (model.subjectEl.value.trim()) return model.subjectEl.value
    if (reply?.subject) {
      const s = reply.subject.trim()
      return /^re:/i.test(s) ? s : `Re: ${s}`
    }
    return ''
  }, [model, reply])

  const [subject, setSubject] = useState(initialSubject)
  const [body, setBody] = useState(() => model?.msgEl.value ?? '')
  const [save, setSave] = useState(() => model?.saveEl?.checked ?? true)

  // Keep the original DOM in sync from the start (subject may be prefilled).
  useEffect(() => {
    if (model) model.subjectEl.value = initialSubject
  }, [model, initialSubject])

  if (!model) return <SimpleFormView {...props} />

  const recipientName = model.recipientName ?? reply?.fromName ?? 'member'
  const isReply = !!reply

  function setSubjectSynced(v: string) {
    setSubject(v)
    model!.subjectEl.value = v
  }
  function setBodySynced(v: string) {
    setBody(v)
    model!.msgEl.value = v
  }
  function toggleSave(v: boolean) {
    setSave(v)
    if (model!.saveEl) model!.saveEl.checked = v
  }

  function quoteOriginal() {
    if (!reply) return
    const text = htmlToText(reply.bodyHtml)
    if (!text) {
      toast.info('Nothing to quote from that message.')
      return
    }
    const author = reply.fromName ?? 'them'
    const block = `[quote=${author}]${text}[/quote]\n\n`
    setBodySynced(body ? `${block}${body}` : block)
    toast.success('Original message quoted')
  }

  function submit() {
    if (!subject.trim()) {
      toast.warning('Add a subject before sending.')
      return
    }
    if (!body.trim()) {
      toast.warning('Your message is empty.')
      return
    }
    model!.form.requestSubmit()
  }

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4">
      <PageHeader
        title={isReply ? 'Reply' : 'New message'}
        sub={
          <span className="inline-flex items-center gap-1.5">
            {isReply ? 'Replying to' : 'To'}{' '}
            <UserLink name={recipientName} href={model.recipientHref} color={reply?.fromColor} className="text-foreground" />
          </span>
        }
      />

      {reply && (
        <Collapsible defaultOpen>
          <Card className="gap-0 overflow-hidden border-brand/30 bg-brand-soft/30 py-0">
            <CollapsibleTrigger className="flex w-full items-center gap-3 px-5 py-3 text-left">
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg bg-brand/15 text-[11px] text-brand">{initials(recipientName)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[13px] font-medium">
                  <CornerUpLeft className="size-3.5 text-brand" />
                  {reply.subject || '(no subject)'}
                </div>
                <div className="truncate text-[11.5px] text-muted-foreground">
                  {recipientName}
                  {reply.date && <> · {relTime(reply.date)}</>}
                </div>
              </div>
              <Badge variant="secondary" className="shrink-0 bg-background/60 text-[10px] uppercase tracking-wide">Original</Badge>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="border-t border-brand/15 px-5 py-4">
                {reply.bodyHtml ? (
                  <RichHtml html={reply.bodyHtml} className="max-h-64 overflow-y-auto text-[13px] text-foreground/80" />
                ) : (
                  <p className="text-[13px] text-muted-foreground">That message had no body.</p>
                )}
                <Button variant="outline" size="sm" className="mt-3 h-7 text-[12px]" onClick={quoteOriginal}>
                  <Quote /> Quote in reply
                </Button>
              </div>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      <Card>
        <CardContent className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="pm-subject" className="text-[12.5px] text-muted-foreground">Subject</Label>
            <Input
              id="pm-subject"
              value={subject}
              onChange={(e) => setSubjectSynced(e.target.value)}
              placeholder="What is this about?"
              className="h-10"
              autoFocus={!isReply}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-[12.5px] text-muted-foreground">Message</Label>
            <BBComposer value={body} onChange={setBodySynced} placeholder={`Write to ${recipientName}…`} minHeightClass="min-h-48" />
          </div>
        </CardContent>
      </Card>

      <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-xl bg-background/95 px-4 py-2.5 shadow-lg backdrop-blur">
        {model.saveEl ? (
          <Label className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
            <Switch checked={save} onCheckedChange={toggleSave} /> Keep a copy in Sent
          </Label>
        ) : (
          <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground"><Mail className="size-3.5" /> Private message</span>
        )}
        <Button size="sm" onClick={submit}><Send /> Send message</Button>
      </div>
    </div>
  )
}
