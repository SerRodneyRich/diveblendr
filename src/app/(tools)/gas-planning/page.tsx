import GasPlanningPageClient from './GasPlanningPageClient'

export const metadata = {
  title: 'Gas planning — DiveBlendr',
  description:
    'Usable bottom time, turn pressure and minimum gas from your RMV, depth, cylinder and reserve strategy.',
}

export default function GasPlanningPage() {
  return <GasPlanningPageClient />
}
