import ModCheckTool from '@/components/modcheck/ModCheckTool'

export const metadata = {
  title: 'MOD check — DiveBlendr',
  description:
    'Check a gas you already have: maximum operating depth at your working and deco ppO₂ limits, hypoxic floor, END, gas density and CNS loading.',
}

/**
 * MOD check — the inverse of best mix.
 *
 * Best mix asks "what should I fill for this depth?"; this page asks "I have
 * this tank — how deep can I take it, and is it safe for the dive I am
 * planning?" Everything it reports is derived from `src/lib`, and every
 * threshold comes from the diver's own configured limits.
 */
export default function ModCheckPage() {
  return <ModCheckTool />
}
