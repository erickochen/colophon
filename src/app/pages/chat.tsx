import { useMemo, useState } from 'react'
import { MessageCircle, LifeBuoy } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { LegacyView } from '@/app/pages/legacy'
import { PageHeader } from '@/app/shell/bits'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'

/** IRC gateway: our buttons submit the original form; the live chat iframe is
 * adopted into our shell via a slot. */
export function ChatView({ page, host }: PageProps) {
  const available = useMemo(() => !!document.querySelector('#ircChatForm'), [])
  const [channel, setChannel] = useState<string | null>(null)
  if (!available) return <LegacyView page={page} host={host} />

  function join(value: 'help' | 'anonamouse.net', label: string) {
    const form = document.querySelector<HTMLFormElement>('#ircChatForm')
    // MAM submits with <button name="channels" value="…">, not an <input>.
    const btn = form?.querySelector<HTMLElement>(`[name="channels"][value="${value}"]`)
    const frame = document.querySelector<HTMLIFrameElement>('#ircChat')
    if (!form || !btn || !frame) {
      toast.error('IRC form is not available.')
      return
    }
    btn.click()
    frame.setAttribute('slot', 'irc')
    frame.style.cssText = 'width:100%;height:70vh;border:0;display:block'
    host.appendChild(frame)
    setChannel(label)
  }

  return (
    <div className="grid gap-4">
      <PageHeader title="IRC chat" sub={`Chatting as ${page.user.name} on irc.myanonamouse.net`} />
      {!channel ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Card className="py-6">
            <CardContent className="grid justify-items-start gap-3">
              <span className="flex size-11 items-center justify-center rounded-lg bg-brand-soft"><MessageCircle className="size-5 text-accent-foreground" /></span>
              <div>
                <div className="font-display text-[16px] font-semibold">#anonamouse.net</div>
                <p className="pt-0.5 text-[12.5px] text-muted-foreground">The main channel for books, banter and everything in between.</p>
              </div>
              <Button onClick={() => join('anonamouse.net', '#anonamouse.net')}>Join the chat</Button>
            </CardContent>
          </Card>
          <Card className="py-6">
            <CardContent className="grid justify-items-start gap-3">
              <span className="flex size-11 items-center justify-center rounded-lg bg-brand-soft"><LifeBuoy className="size-5 text-accent-foreground" /></span>
              <div>
                <div className="font-display text-[16px] font-semibold">#help</div>
                <p className="pt-0.5 text-[12.5px] text-muted-foreground">Stuck with your client or account? Staff hangs out here.</p>
              </div>
              <Button variant="outline" onClick={() => join('help', '#help')}>Get support</Button>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="overflow-hidden py-0">
          <CardContent className="p-0">
            <div className="flex items-center justify-between bg-muted/40 px-4 py-2">
              <span className="text-[13px] font-medium">{channel}</span>
              <a href="/chathelp.php" className="text-[12px] text-brand underline">Use your own IRC client instead</a>
            </div>
            <slot name="irc" />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
