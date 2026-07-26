// Shared bits for the bespoke Preferences views. Every control writes into the
// ORIGINAL (hidden) form element; the Save bar submits the original #prefForm so
// the POST stays byte-identical to MAM's.
import { useState, type ReactNode } from 'react'
import { RotateCcw, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

/** Sticky footer: submit resubmits the original form, revert resets it. Matches
 * the bar in form-mirror-view.tsx. `onAfterRevert` lets the view remount so the
 * shadcn controls re-read the reset originals. */
export function SaveBar({
  form, onAfterRevert, submitLabel = 'Save changes', extra,
}: { form: HTMLFormElement; onAfterRevert?: () => void; submitLabel?: string; extra?: ReactNode }) {
  return (
    <div className="sticky bottom-4 z-10 mt-1 flex items-center justify-end gap-2 rounded-xl bg-background/95 px-3 py-2.5 shadow-lg backdrop-blur">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          form.reset()
          onAfterRevert?.()
          toast.info('Changes reverted')
        }}
      >
        <RotateCcw /> Revert
      </Button>
      {extra}
      <Button size="sm" onClick={() => form.requestSubmit()}>
        <Save /> {submitLabel}
      </Button>
    </div>
  )
}

/** Card shell with the shared header geometry used across prefs cards. */
export function PrefCard({
  title, note, children, className, contentClassName,
}: { title?: ReactNode; note?: ReactNode; children: ReactNode; className?: string; contentClassName?: string }) {
  return (
    <Card className={cn('gap-0 py-0', className)}>
      {(title || note) && (
        <CardHeader className="!py-3.5">
          {title && <CardTitle>{title}</CardTitle>}
          {note && <p className="pt-0.5 text-[12px] leading-normal text-muted-foreground">{note}</p>}
        </CardHeader>
      )}
      <CardContent className={cn('grid gap-4 px-6 py-5', contentClassName)}>{children}</CardContent>
    </Card>
  )
}

/** Label + explanation on the left, control on the shared right alignment line. */
export function SettingRow({
  title, note, children, dense,
}: { title?: ReactNode; note?: ReactNode; children: ReactNode; dense?: boolean }) {
  return (
    <div className={cn('grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-8', dense ? 'py-1.5' : 'py-1')}>
      <div className="min-w-0">
        {title && <div className="text-[13.5px] font-medium leading-snug">{title}</div>}
        {note && <p className="pt-1 text-[12px] leading-normal text-muted-foreground">{note}</p>}
      </div>
      <div className="flex shrink-0 justify-end">{children}</div>
    </div>
  )
}

/** A shadcn NativeSelect mirroring an original <select>: writes .value and fires
 * a change event so any MAM listeners on the hidden element still run. */
export function MirrorSelect({
  el, onChange, className, size = 'sm',
}: { el: HTMLSelectElement; onChange?: () => void; className?: string; size?: 'sm' | 'default' }) {
  const [v, setV] = useState(el.value)
  return (
    <NativeSelect
      size={size}
      value={v}
      className={cn('text-[13px]', className)}
      onChange={(e) => {
        setV(e.target.value)
        el.value = e.target.value
        el.dispatchEvent(new Event('change', { bubbles: true }))
        onChange?.()
      }}
    >
      {[...el.options].map((o, i) => (
        <NativeSelectOption key={i} value={o.value}>
          {o.textContent}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  )
}
