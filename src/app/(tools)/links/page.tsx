import { HiOutlineArrowUpRight } from 'react-icons/hi2'
import { Card, CardHeader, MessageBar } from '@/components/ui'
import { resourceGroups, resourceCount } from '@/components/links/resources'

export const metadata = {
  title: 'Links — DiveBlendr',
  description:
    'Curated technical diving resources: training agencies, decompression research, gas blending suppliers, instruments and rebreather manufacturers.',
}

/**
 * Reference page. Deliberately plain: a diver comes here to leave for
 * somewhere else, so the page is a scannable index rather than a showcase.
 *
 * Static content, so this stays a server component — no client bundle.
 */
export default function LinksPage() {
  const hasUnverified = resourceGroups.some((g) =>
    g.resources.some((r) => r.unverified)
  )

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-h3 font-semibold text-text">Links</h2>
        <p className="text-sm text-text-muted">{resourceCount} technical diving resources, grouped by what you came for.
            Every link was fetched and checked; dead ones have been removed.</p>
      </header>

      <nav aria-label="Sections" className="flex flex-wrap gap-2">
        {resourceGroups.map((group) => (
          <a
            key={group.id}
            href={`#${group.id}`}
            className="rounded-sm border border-border bg-surface-1 px-3 py-1.5 text-sm text-text-muted transition-colors motion-reduce:transition-none hover:border-border-strong hover:text-text"
          >
            {group.title}
          </a>
        ))}
      </nav>

      {resourceGroups.map((group) => (
        <section key={group.id} id={group.id} className="scroll-mt-20">
          <Card>
            <CardHeader title={group.title} description={group.blurb} />
            <ul className="divide-y divide-border">
              {group.resources.map((resource) => (
                <li key={resource.url} className="py-3 first:pt-0 last:pb-0">
                  <a
                    href={resource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group inline-flex items-baseline gap-1.5 font-medium text-brand transition-colors motion-reduce:transition-none hover:text-brand-strong hover:underline underline-offset-2"
                  >
                    {resource.name}
                    <HiOutlineArrowUpRight
                      aria-hidden="true"
                      className="h-3.5 w-3.5 shrink-0 self-center text-text-subtle"
                    />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                  {resource.unverified && (
                    <span className="ml-2 align-middle text-xs text-text-subtle">
                      not machine-verified
                    </span>
                  )}
                  <p className="mt-0.5 text-sm text-text-muted">{resource.description}</p>
                  <p className="mt-0.5 font-mono text-xs text-text-subtle">
                    {displayHost(resource.url)}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ))}

      <p className="text-sm text-text-subtle">
        DiveBlendr is not affiliated with any organisation listed here, and a listing
        is not an endorsement of a course, a product or a supplier.
      </p>

      <MessageBar
        items={
          hasUnverified
            ? [
                {
                  id: 'unverified',
                  severity: 'info',
                  title: 'Marked links',
                  message: (
                    <>
                      A few sites refuse automated requests and answer with an error to
                      anything that is not a browser. Those are marked{' '}
                      <span className="text-text-subtle">not machine-verified</span> — they
                      load normally when you click them, but the check could not confirm it.
                    </>
                  ),
                },
              ]
            : []
        }
      />
    </div>
  )
}

/** The bare hostname, so a diver can see where a link goes before following it. */
function displayHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
