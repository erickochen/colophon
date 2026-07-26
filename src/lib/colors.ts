let ctx: CanvasRenderingContext2D | null | undefined

/* MAM paints usernames in saturated class colors that fight the paper
 * palette. Map any CSS color onto the nearest muted user tint by hue;
 * near-grays fall back to muted-foreground. */
export function mutedUserColor(input: string | null | undefined): string {
  if (!input) return 'var(--brand)'
  ctx ??= document.createElement('canvas').getContext('2d')
  if (!ctx) return 'var(--brand)'
  ctx.fillStyle = '#000'
  ctx.fillStyle = input
  const hex = String(ctx.fillStyle)
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return 'var(--brand)'
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  if (d < 0.08) return 'var(--muted-foreground)'
  let hue = 0
  if (max === r) hue = ((g - b) / d) % 6
  else if (max === g) hue = (b - r) / d + 2
  else hue = (r - g) / d + 4
  hue = (hue * 60 + 360) % 360
  const targets: Array<[number, string]> = [
    [40, 'var(--user-1)'],
    [150, 'var(--user-4)'],
    [240, 'var(--user-2)'],
    [320, 'var(--user-3)'],
  ]
  let best = targets[0]
  let bestDist = 361
  for (const t of targets) {
    const dist = Math.min(Math.abs(hue - t[0]), 360 - Math.abs(hue - t[0]))
    if (dist < bestDist) { bestDist = dist; best = t }
  }
  return best[1]
}
