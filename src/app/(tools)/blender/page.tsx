import GasBlender from '@/components/GasBlender'

export const metadata = {
  title: 'Gas blender — DiveBlendr',
  description:
    'Partial-pressure blend procedure for nitrox and trimix, from arbitrary banked supply gases, with drain and feasibility checking.',
}

/**
 * The gas blender, on its own route.
 *
 * Previously a redirect stub into the calculator's `#blender` tab; the tool now
 * owns its URL and its state, so a blend survives navigating to another tool
 * and back within the shell.
 */
export default function BlenderPage() {
  return <GasBlender />
}
