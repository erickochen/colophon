import { useEffect, useId, useRef, useState } from 'react'
import { plantHook, useQuickie } from '@/lib/quickie'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

// The button itself comes from quiCKIE and keeps its own emoji, so this only
// draws the box around it. Focus lands on the slotted link, which is why the
// ring hangs off focus-within.
// quiCKIE marks a button while its "click every one of these" preset fires it.
const SEND_ALL_CLASS = 'leftClickAllTriggered'

const BOX =
  'inline-flex shrink-0 items-center justify-center bg-muted text-muted-foreground shadow-xs ' +
  'transition-[opacity,color,background-color] hover:bg-primary hover:text-primary-foreground ' +
  'focus-within:ring-[3px] focus-within:ring-ring dark:bg-input/40'

/** quiCKIE's send-to-client button for one torrent, shown through a slot so the
 * button stays quiCKIE's to handle. `mark` swaps its face the way quiCKIE marks
 * its own freeleech button; `onSend` fires on the plain left click it answers by
 * sending, so the page can follow a spend it never made itself. */
export function QuickieAction({
  url, label, mark, onSend, className,
}: {
  url: string
  label: string
  mark?: string
  onSend?: () => void
  className?: string
}) {
  const name = `quickie${useId().replace(/\W/g, '')}`
  const reserve = useQuickie()
  const [filled, setFilled] = useState(false)
  // Taking down the hook means waiting out the next sweep, so a caller handing
  // over a fresh closure each render must not cost the reader their button.
  const send = useRef(onSend)
  send.current = onSend

  useEffect(() => {
    const take = plantHook(url, (wrap) => {
      wrap.setAttribute('slot', name)
      const link = wrap.querySelector('a')
      // Its own title is a dump of every client setting, so give the link a
      // name a screen reader can read out.
      link?.setAttribute('aria-label', label)
      if (link && mark) link.textContent = mark
      // Modifiers mean settings or open-the-client, neither of which sends. Its
      // own send-them-all preset dispatches a plain Event, where every mouse
      // field is undefined and this class is what picks the branch.
      link?.addEventListener('mouseup', (e) => {
        const plain = e.button === 0 && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey
        if (plain || link.classList.contains(SEND_ALL_CLASS)) send.current?.()
      })
      setFilled(true)
    })
    return () => {
      take?.()
      setFilled(false)
    }
  }, [url, name, label, mark])

  // Space of the same size while the next sweep is coming, so the row it sits
  // in does not shift once the button lands.
  if (!filled) return reserve ? <div className={cn('shrink-0', className)} /> : null
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn(BOX, className)}>
          <slot name={name} />
        </div>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
