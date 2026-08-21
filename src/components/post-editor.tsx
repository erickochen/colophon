// One post, open for editing inside its own topic. The text stays in here
// rather than in the topic: RichHtml writes with dangerouslySetInnerHTML, so a
// state change up there replaces every post body plus wipes a reader's
// selection while they are quoting.
import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Loader2, Save, X } from 'lucide-react'
import { BBComposer, type ComposerHandle } from '@/components/bb-composer'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { draftStore } from '@/lib/draft'
import { spliceBlock } from '@/lib/insert-block'
import { dropPostSource, fetchPostSource, postEditUrl, sendPostEdit, type PostSource } from '@/lib/post-edit'

/** Long enough to survive a closed tab, short enough that an old revision does
 * not come back weeks later. */
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000

/** One store per post. A draft holding nothing is not worth offering back. */
const store = (pid: string | number) =>
  draftStore<{ body: string }>(`colophon:post-edit:${pid}`, DRAFT_TTL_MS, (d) => typeof d.body === 'string' && d.body.trim().length > 0)

export interface PostEditorHandle {
  /** Puts a block in where the caret was left, the way a quote arrives. Answers
   * 'queued' while the source is still on the wire plus 'unavailable' once that
   * load has failed, so the caller never reports a landing that cannot happen. */
  insert: (block: string) => 'added' | 'queued' | 'unavailable'
  /** Throws the kept text away, so reopening the post starts from its source. */
  discard: () => void
}

/** One block after another, spaced the way an insert at the caret spaces them. */
const joined = (prev: string, block: string) => spliceBlock(prev, prev.length, block).text

export function PostEditor({
  pid,
  onClose,
  dirtyRef,
  ref,
}: {
  pid: string | number
  onClose: () => void
  /** Set on every keystroke, so the topic can ask "unsaved?" without rendering. */
  dirtyRef: React.RefObject<boolean>
  ref?: React.Ref<PostEditorHandle>
}) {
  const [source, setSource] = useState<PostSource | null>(null)
  const [failed, setFailed] = useState(false)
  const [text, setText] = useState('')
  const original = useRef('')
  const draft = useRef(store(pid))
  // Quotes that arrive while the source is still on the wire. Writing them into
  // the text now would make them the whole post, since the source is not there
  // yet to hold them.
  const queued = useRef<string[]>([])
  const composer = useRef<ComposerHandle>(null)

  useEffect(() => {
    let live = true
    void fetchPostSource(pid, () => live).then(
      (s) => {
        if (!live) return
        original.current = s.body
        const kept = draft.current.read()?.body ?? null
        const start = queued.current.reduce(joined, kept ?? s.body)
        queued.current = []
        setSource(s)
        setText(start)
        dirtyRef.current = start !== s.body
        if (start !== s.body) draft.current.write({ body: start })
      },
      () => {
        if (!live) return
        // Not a redirect: one in the same tick means nobody reads the message.
        // The way out stays a link the reader takes when they want it.
        setFailed(true)
      }
    )
    return () => {
      live = false
      // A form left on the page would outlive the editor that owns it.
      dropPostSource(pid)
    }
  }, [pid, dirtyRef])

  function change(next: string) {
    setText(next)
    dirtyRef.current = next !== original.current
    draft.current.write({ body: next })
  }

  // Quoting while an edit is open has to land in this editor rather than in the
  // reply box at the foot of the topic. Discarding has to reach the kept text,
  // or the next open offers back what was just thrown away.
  useImperativeHandle(ref, () => ({
    insert: (block: string) => {
      // Nothing drains the queue once the load has failed, so say so instead.
      if (failed) return 'unavailable'
      // The source decides where a quote goes. Until it lands, the block waits.
      if (!source) {
        queued.current.push(block)
        return 'queued'
      }
      // The queue is drained by the load alone, so past that point a missing
      // composer has nothing left to wait for.
      if (!composer.current) return 'unavailable'
      // The composer knows where the caret is; its change handler writes the
      // result back through here.
      composer.current.insert(block)
      return 'added'
    },
    discard: () => {
      queued.current = []
      draft.current.clear()
      dirtyRef.current = false
    },
  }))

  function save() {
    if (!source) return
    if (!text.trim()) {
      toast.warning('The post would be empty.')
      return
    }
    try {
      sendPostEdit(source, text)
    } catch {
      toast.error('Could not send the edit. Your text is still here.')
      return
    }
    // The guard stands down, but the kept text stays: requestSubmit only starts
    // the navigation, so a post MAM refuses would land on its error page with
    // nothing left to paste back. The draft TTL takes it from here. On a landed
    // edit that text equals the source anyway.
    dirtyRef.current = false
  }

  if (failed) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-6 text-[12.5px] text-muted-foreground">
        <span>The editor did not load.</span>
        <Button variant="link" size="sm" asChild className="h-auto p-0 text-[12.5px]">
          <a href={postEditUrl(pid)}>Edit on MAM instead</a>
        </Button>
        <Button variant="link" size="sm" className="h-auto p-0 text-[12.5px]" onClick={onClose}>
          Back to the post
        </Button>
      </div>
    )
  }

  if (!source) {
    // The way back matters here: a stalled fetch would otherwise hide this post
    // plus its quotable text until the reader reloads the page.
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-6 text-[12.5px] text-muted-foreground">
        <span className="flex items-center gap-2">
          <Loader2 className="size-3.5 animate-spin" /> Loading the editor…
        </span>
        <Button variant="link" size="sm" className="h-auto p-0 text-[12.5px]" onClick={onClose}>
          Cancel
        </Button>
      </div>
    )
  }

  return (
    <div className="grid gap-2.5">
      <BBComposer ref={composer} value={text} onChange={change} placeholder="Revise your post…" />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X /> Cancel
        </Button>
        <Button size="sm" onClick={save}>
          <Save /> {source.submitLabel}
        </Button>
      </div>
    </div>
  )
}
