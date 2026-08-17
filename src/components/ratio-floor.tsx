// The one control behind the ratio guard: the ratio a download may not take you
// under. Plain text rather than type=number, because a number input hands React
// an empty string halfway through typing "1.5" and rejects values off its step.
import { useId, useState } from 'react'
import { useRatioFloor } from '@/lib/settings'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/** Empty clears the guard; anything else has to read as a number above 0. */
function readDraft(text: string): { ok: boolean; value: number | null } {
  const t = text.trim()
  if (t === '') return { ok: true, value: null }
  if (!/^\d*\.?\d*$/.test(t) || t === '.') return { ok: false, value: null }
  const n = Number(t)
  if (!Number.isFinite(n) || n <= 0) return { ok: false, value: null }
  return { ok: true, value: n }
}

/** Typed text that is not a usable number stays a local draft, so a half typed
 * value never switches the guard off behind the reader's back. */
export function RatioFloorInput({
  id, className, disabled, align = 'end', 'aria-describedby': describedBy,
}: {
  id?: string
  className?: string
  disabled?: boolean
  align?: 'start' | 'end'
  /** SettingRow injects this, so the note stays tied to the field. */
  'aria-describedby'?: string
}) {
  const [floor, setFloor] = useRatioFloor()
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? (floor != null ? String(floor) : '')
  const ok = readDraft(shown).ok
  const hintId = useId()
  // Start keeps the default stretch, so the field fills the popover width.
  return (
    <div className={cn('grid gap-1', align === 'end' && 'justify-items-end')}>
      <Input
        id={id}
        inputMode="decimal"
        aria-label="Minimum ratio"
        aria-invalid={!ok}
        aria-describedby={ok ? describedBy : hintId}
        placeholder="no limit"
        value={shown}
        disabled={disabled}
        className={cn('h-8', className)}
        onFocus={() => setDraft(floor != null ? String(floor) : '')}
        onBlur={() => {
          // Emptying the field only counts once the reader leaves it, so
          // clearing it to retype does not drop the guard mid keystroke.
          if (draft != null && draft.trim() === '') setFloor(null)
          setDraft(null)
        }}
        onChange={(e) => {
          setDraft(e.target.value)
          const parsed = readDraft(e.target.value)
          if (parsed.value != null) setFloor(parsed.value)
        }}
      />
      {!ok && (
        <span id={hintId} className="text-[11.5px] text-destructive">
          A number above 0
        </span>
      )}
    </div>
  )
}
