import { useMemo } from 'react'
import { ArrowRight, ImageIcon } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { LegacyView } from '@/app/pages/legacy'
import { PageHeader } from '@/app/shell/bits'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface BannerData { images: string[]; links: { label: string; href: string }[] }

function extract(doc: Document): BannerData | null {
  const main = doc.querySelector('#mainBody')
  if (!main) return null
  const images = [...new Set(
    [...main.querySelectorAll<HTMLImageElement>('img')]
      .map((i) => i.getAttribute('src'))
      .filter((s): s is string => !!s && /banner|display\.php/i.test(s) && !/pic\/|icon|thumb|flag/i.test(s))
  )]
  const links = [...main.querySelectorAll<HTMLAnchorElement>('a[href*="winners.php"]')]
    .map((a) => ({ label: a.textContent?.replace(/\s+/g, ' ').trim() || 'View banners', href: a.getAttribute('href') ?? '#' }))
  return { images, links }
}

export function BannerWinnersView(props: PageProps) {
  const data = useMemo(() => extract(document), [])
  if (!data) return <LegacyView {...props} />

  if (data.images.length > 0) {
    return (
      <div className="grid gap-5">
        <PageHeader title="Previous banners" sub={`${data.images.length} winning banners.`} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.images.map((src, i) => (
            <a key={src + i} href={src} target="_blank" rel="noopener noreferrer" className="group overflow-hidden rounded-lg border bg-muted">
              <img src={src} alt={`Banner ${i + 1}`} loading="lazy" className="w-full transition-transform group-hover:scale-[1.02]" onError={(e) => { e.currentTarget.closest('a')?.remove() }} />
            </a>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-5">
      <PageHeader title="Previous banners" sub="Winning banners from past competitions." />
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-xl bg-brand-soft"><ImageIcon className="size-6 text-accent-foreground" /></span>
          <div>
            <div className="font-display text-[15px] font-semibold">Heads up: lots of full-size images</div>
            <p className="pt-0.5 text-[12.5px] text-muted-foreground">Each year's gallery loads a large number of banners. Open one only when your connection can spare the bandwidth.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {data.links.length > 0 ? (
              data.links.map((l) => (
                <Button key={l.href} asChild>
                  <a href={l.href}>{/proceed/i.test(l.label) ? 'View banners' : l.label} <ArrowRight /></a>
                </Button>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No banner galleries available.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
