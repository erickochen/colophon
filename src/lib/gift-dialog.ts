// The gift and wedge dialogs live at shell level rather than inside the row that
// opened them: a shoutbox refresh unmounts rows, which would close an open dialog.

import type { GiftSurface } from '@/lib/giftmam'

export type GiftKind = 'points' | 'wedge'

export interface GiftRequest {
  kind: GiftKind
  uid: string
  name: string
  /** Which GiftMAM switch governs this one, so turning it off closes the dialog. */
  surface: GiftSurface
}

type Listener = () => void

let request: GiftRequest | null = null
const listeners = new Set<Listener>()

function emit() {
  listeners.forEach((fn) => fn())
}

export function openGiftDialog(next: GiftRequest): void {
  request = next
  emit()
}

export function closeGiftDialog(): void {
  if (!request) return
  request = null
  emit()
}

export const subscribeGiftDialog = (fn: Listener) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export const getGiftDialog = () => request
