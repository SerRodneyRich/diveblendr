'use client'

import { useEffect, useRef } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import type { MathDerivation } from '@/lib/recommendations'

/**
 * The one renderer for a recommendation's derivation.
 *
 * The engine emits {@link MathDerivation} — labelled steps whose `formula`,
 * `substitution` and `result` are bare LaTeX with no delimiters and no markup.
 * This component owns every rendering decision: display mode, error handling,
 * and the surrounding layout. Nothing in `src/lib` knows that KaTeX exists.
 *
 * This replaces `MathJax.tsx`, which took an HTML blob and set it with
 * `dangerouslySetInnerHTML` after walking text nodes for `$$` delimiters. The
 * blobs were assembled inline in the calculator page alongside the arithmetic,
 * which is how a derivation and its result came to disagree.
 */
function Tex({ latex, display }: { latex: string; display: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!ref.current) return
    katex.render(latex, ref.current, {
      displayMode: display,
      throwOnError: false,
      output: 'html',
    })
  }, [latex, display])

  // The pre-render fallback is the raw LaTeX, which is still readable, so a
  // failed hydration degrades to something rather than to nothing.
  return (
    <span
      ref={ref}
      className="font-mono text-sm text-text"
    >
      {latex}
    </span>
  )
}

export interface MathStepsProps {
  derivation: MathDerivation
  /**
   * Lay the steps out in two columns from `lg` up.
   *
   * For a long derivation — the MOD check runs to ten steps, because it has to
   * show four competing limits before it can show which one wins — a single
   * column means scrolling a modal to compare the very numbers being compared.
   * Steps stay in reading order down each column via CSS columns, so the
   * sequence survives.
   */
  columns?: boolean
}

/** Renders a derivation as a numbered sequence of formula → substitution → result. */
export default function MathSteps({ derivation, columns = false }: MathStepsProps) {
  return (
    <div
      className={
        columns
          ? 'space-y-5 lg:columns-2 lg:gap-8 lg:space-y-0 [&>section]:mb-5 [&>section]:break-inside-avoid'
          : 'space-y-5'
      }
    >
      {derivation.steps.map((step, i) => (
        <section key={i} className="space-y-2">
          {step.label && (
            <h4 className="text-sm font-semibold text-brand-strong">{step.label}</h4>
          )}

          {(step.formula || step.substitution || step.result) && (
            <div className="overflow-x-auto rounded-sm border border-border bg-surface-2 px-3 py-2">
              <div className="min-w-fit space-y-1">
                {step.formula && <Tex latex={step.formula} display />}
                {step.substitution && <Tex latex={step.substitution} display />}
                {step.result && <Tex latex={step.result} display />}
              </div>
            </div>
          )}

          {step.note && <p className="text-sm text-text-muted">{step.note}</p>}
        </section>
      ))}
    </div>
  )
}
