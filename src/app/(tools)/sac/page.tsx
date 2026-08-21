import SacPageClient from './SacPageClient'

export const metadata = {
  title: 'SAC / RMV — DiveBlendr',
  description:
    'Measure your surface air consumption and respiratory minute volume from a logged dive.',
}

export default function SacPage() {
  return <SacPageClient />
}
