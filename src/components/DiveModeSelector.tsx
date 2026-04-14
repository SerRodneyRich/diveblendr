type DiveMode = 'oc' | 'oc-trimix' | 'ccr' | 'ccr-trimix'

interface DiveModeSelectorProps {
  diveMode: DiveMode
  onDiveModeChange: (mode: DiveMode) => void
}

export default function DiveModeSelector({ diveMode, onDiveModeChange }: DiveModeSelectorProps) {
  const modes = [
    { mode: 'oc' as DiveMode, label: 'OC / Nitrox' },
    { mode: 'oc-trimix' as DiveMode, label: 'OC Trimix' },
    { mode: 'ccr' as DiveMode, label: 'CCR' },
    { mode: 'ccr-trimix' as DiveMode, label: 'CCR Trimix' }
  ]

  return (
    <div 
      className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4 sm:mb-6"
      role="group"
      aria-labelledby="dive-mode-heading"
    >
      <div id="dive-mode-heading" className="sr-only">Dive Mode Selection</div>
      {modes.map(({ mode, label }, index) => (
        <button
          key={mode}
          onClick={() => onDiveModeChange(mode)}
          tabIndex={index + 1}
          aria-pressed={diveMode === mode}
          aria-describedby={`dive-mode-${mode}-desc`}
          className={`min-h-[44px] p-2 sm:p-3 rounded font-semibold transition-colors text-sm sm:text-base focus:ring-2 focus:ring-yellow-400 focus:outline-none ${
            diveMode === mode
              ? 'bg-yellow-500 text-gray-900'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          {label}
          <span id={`dive-mode-${mode}-desc`} className="sr-only">
            {diveMode === mode ? 'Currently selected' : 'Not selected'}. 
            {mode === 'oc' && 'Open circuit diving with air or nitrox'}
            {mode === 'oc-trimix' && 'Open circuit diving with trimix gas mixes'}
            {mode === 'ccr' && 'Closed circuit rebreather diving'}
            {mode === 'ccr-trimix' && 'Closed circuit rebreather with trimix diluent'}
          </span>
        </button>
      ))}
    </div>
  )
}