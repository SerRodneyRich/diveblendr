import Link from 'next/link'
import { Card, MessageBar, StatCard } from '@/components/ui'

export const metadata = {
  title: 'Dive planner — DiveBlendr',
  description:
    'Decompression dive planning with Bühlmann ZHL-16C and gradient factors. In development.',
}

/**
 * Placeholder for the Phase 4 planner.
 *
 * The route exists now so the navigation, the landing page and the URL space
 * are already shaped around it — Phase 4 fills this page in rather than
 * restructuring the app around a new tool.
 */
export default function PlannerPage() {
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-h3 font-semibold text-text">Dive planner</h2>
        <p className="text-sm text-text-muted">Full decompression schedules — Bühlmann ZHL-16C with gradient factors.</p>
      </header>

      <Card>
        <h3 className="text-h3 font-semibold text-text">What it will do</h3>
        <p className="mt-1 text-sm text-text-muted">
          A planned dive produces the numbers below, with every one traceable to a published
          formula.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Runtime" value="—" unit="min" hint="Total including deco" />
          <StatCard label="TTS" value="—" unit="min" hint="Time to surface" />
          <StatCard label="CNS" value="—" unit="%" hint="Oxygen toxicity" />
          <StatCard label="OTU" value="—" hint="Pulmonary exposure" />
        </div>
        <ul className="mt-4 grid gap-2 text-sm text-text-muted sm:grid-cols-2">
          <li>Multi-level profiles with per-segment gases</li>
          <li>Gradient factors (GF low / GF high)</li>
          <li>CCR diluent and setpoint planning</li>
          <li>Bailout schedules and lost-gas contingency</li>
          <li>Gas required per cylinder, with reserves</li>
          <li>Isobaric counterdiffusion checks on gas switches</li>
        </ul>
      </Card>

      <p className="text-sm text-text-muted">
        In the meantime,{' '}
        <Link href="/mix/" className="text-accent underline underline-offset-2">
          best mix
        </Link>{' '}
        and{' '}
        <Link href="/blender/" className="text-accent underline underline-offset-2">
          the gas blender
        </Link>{' '}
        are ready to use.
      </p>

      <MessageBar
        items={[
          {
            id: 'in-development',
            severity: 'warning',
            title: 'In development',
            message:
              'The decompression engine is being built and validated against independent implementations before it plans anyone\u2019s dive. Nothing here is usable yet.',
          },
        ]}
      />
    </div>
  )
}
