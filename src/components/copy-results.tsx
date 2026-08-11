// Copies the fetched page as plain text, the MAM+ plaintext feature. On purpose
// this takes the raw page, not the visually filtered subset.
import { Copy } from 'lucide-react'
import { plaintextResults, type PlaintextRow } from '@/lib/plaintext'
import { useFeature } from '@/lib/settings'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'

export function CopyResultsButton({ rows, decode }: { rows: PlaintextRow[]; decode?: boolean }) {
  const [on] = useFeature('plainCopy')
  if (!on) return null

  async function copy() {
    try {
      await navigator.clipboard.writeText(plaintextResults(rows, { decode }))
      toast.success(`Copied ${rows.length} result${rows.length === 1 ? '' : 's'}`)
    } catch {
      toast.error('The clipboard did not take it. Try again.')
    }
  }

  return (
    <Button
      variant="outline"
      size="xs"
      disabled={rows.length === 0}
      onClick={() => void copy()}
      className="h-[26px] gap-1.5 rounded-[7px] px-2.5 text-[12px]"
    >
      <Copy className="size-3 text-muted-foreground" />
      Copy as text
    </Button>
  )
}
