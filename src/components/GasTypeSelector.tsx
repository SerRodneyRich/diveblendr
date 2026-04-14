type GasType = 'nitrox' | 'trimix'

interface GasTypeSelectorProps {
  gasType: GasType
  onGasTypeChange: (type: GasType) => void
}

export default function GasTypeSelector({ gasType, onGasTypeChange }: GasTypeSelectorProps) {
  return (
    <div className="flex space-x-2 sm:space-x-4 mb-4 sm:mb-6">
      <button
        onClick={() => onGasTypeChange('nitrox')}
        className={`min-h-[44px] px-3 sm:px-4 py-2 rounded text-sm sm:text-base focus:ring-2 focus:ring-yellow-400 focus:outline-none ${gasType === 'nitrox' ? 'bg-yellow-500 text-gray-900' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
        aria-pressed={gasType === 'nitrox'}
        aria-label="Select Nitrox gas type"
      >
        Nitrox
      </button>
      <button
        onClick={() => onGasTypeChange('trimix')}
        className={`min-h-[44px] px-3 sm:px-4 py-2 rounded text-sm sm:text-base focus:ring-2 focus:ring-yellow-400 focus:outline-none ${gasType === 'trimix' ? 'bg-yellow-500 text-gray-900' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
        aria-pressed={gasType === 'trimix'}
        aria-label="Select Trimix gas type"
      >
        Trimix
      </button>
    </div>
  )
}