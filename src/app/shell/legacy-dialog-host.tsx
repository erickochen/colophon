import { useEffect, useRef, useSyncExternalStore } from 'react'
import { toast } from '@/components/ui/toast'
import {
  DIALOG_SLOT,
  closeLegacyDialog,
  getLegacyDialog,
  installLegacyDialogBridge,
  subscribeLegacyDialog,
  type LegacyDialogAction,
} from '@/lib/legacy-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

/** The last action that actually does something carries the weight. */
function primaryOf(actions: LegacyDialogAction[]) {
  return [...actions].reverse().find((a) => a.run) ?? actions[actions.length - 1]
}

function variantFor(action: LegacyDialogAction, primary: LegacyDialogAction | undefined) {
  if (action !== primary) return 'ghost' as const
  // A dismiss-only footer stays quiet: the weight belongs to whatever the
  // dialog body itself offers (an upload button, a form).
  if (!action.run) return 'secondary' as const
  return /decline|delete|remove/i.test(action.label) ? ('destructive' as const) : ('default' as const)
}

export function LegacyDialogHost({ host }: { host: HTMLElement }) {
  const state = useSyncExternalStore(subscribeLegacyDialog, getLegacyDialog)
  const primaryRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    installLegacyDialogBridge(host, ({ tone, text }) => {
      if (tone === 'error') toast.error(text)
      else if (tone === 'success') toast.success(text)
      else toast(text)
    })
  }, [host])

  const actions = state?.actions ?? []
  const primary = primaryOf(actions)
  // Cancel-ish first, the committing action last: the reading order of the
  // sentence above it.
  const ordered = [...actions].sort((a, b) => Number(!!a.run) - Number(!!b.run))

  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && closeLegacyDialog()}>
      <DialogContent
        className="max-h-[85vh] gap-3 sm:max-w-xl"
        // Land on the committing action, not on Cancel.
        initialFocus={primaryRef}
      >
        <DialogHeader>
          <DialogTitle className="font-display">{state?.title || 'MyAnonaMouse'}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto text-[13.5px] leading-relaxed">
          {/* MAM's #dialog-message stays a light-DOM node so their jQuery keeps
           * finding it; we only provide the frame around it. */}
          <slot name={DIALOG_SLOT} />
        </div>
        <DialogFooter>
          {ordered.map((a) => (
            <Button
              key={a.label}
              ref={a === primary ? primaryRef : undefined}
              variant={variantFor(a, primary)}
              onClick={() => closeLegacyDialog(a)}
            >
              {a.label}
            </Button>
          ))}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
