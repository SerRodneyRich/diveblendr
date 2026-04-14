import { useUnitConversion } from '../hooks/useUnitConversion'

type GasType = 'nitrox' | 'trimix'

interface GasParams {
  oxygen: number
  helium: number
  nitrogen: number
  mod: number
  ppo2: number
  end: number
  tankSizeL: number
  selectedTankId?: string
}

interface ParameterControlsProps {
  gasType: GasType
  gasParams: GasParams
  lockedParameters: Set<string>
  onParameterUpdate: (param: string, value: number) => void
  onToggleLock: (param: string) => void
}

export default function ParameterControls({ 
  gasType, 
  gasParams, 
  lockedParameters, 
  onParameterUpdate, 
  onToggleLock 
}: ParameterControlsProps) {
  const { getUnitLabels, getConversionRanges } = useUnitConversion();
  const unitLabels = getUnitLabels();
  const ranges = getConversionRanges();

  const parameters = [
    { param: 'oxygen', label: 'Oxygen (O₂) %', min: 10, max: gasType === 'trimix' ? Math.max(10, 100 - gasParams.helium) : 100, step: 0.1 },
    ...(gasType === 'trimix' ? [{ param: 'helium', label: 'Helium (He) %', min: 0, max: Math.max(0, 100 - gasParams.oxygen), step: 0.1 }] : []),
    { param: 'nitrogen', label: 'Nitrogen (N₂) %', min: 0, max: 90, step: 0.1, inactive: true },
    { param: 'mod', label: `MOD (${unitLabels.depth})`, min: ranges.depth.min, max: ranges.depth.max, step: 0.1 },
    { param: 'ppo2', label: 'PPO₂', min: 0.16, max: 1.6, step: 0.01 },
    { param: 'end', label: `END (${unitLabels.depth})`, min: ranges.depth.min, max: ranges.depth.max, step: 0.1 }
  ]

  return (
    <div className="space-y-2">
      {parameters.map(({ param, label, min, max, step, inactive }) => (
        <div key={param} className={`bg-gray-700 p-2 rounded ${lockedParameters.has(param) || inactive ? 'opacity-70' : ''}`}>
          <div className="flex items-center space-x-1 sm:space-x-2">
            <label 
              htmlFor={`${param}-range`}
              className="text-yellow-400 font-semibold text-sm whitespace-nowrap min-w-0 flex-shrink-0"
            >
              {label}
            </label>
            {!inactive && (
              <button
                onClick={() => onToggleLock(param)}
                aria-label={`${lockedParameters.has(param) ? 'Unlock' : 'Lock'} ${label} parameter`}
                aria-pressed={lockedParameters.has(param)}
                className={`px-2 py-1 text-xs rounded focus:ring-2 focus:ring-yellow-400 focus:outline-none whitespace-nowrap ${
                  lockedParameters.has(param)
                    ? 'bg-yellow-500 text-gray-900'
                    : 'bg-gray-600 text-gray-300 border border-gray-500 hover:bg-gray-500'
                }`}
              >
                {lockedParameters.has(param) ? 'LOCKED' : 'LOCK'}
              </button>
            )}
            {inactive && (
              <span className="px-1.5 py-0.5 text-xs bg-gray-600 text-gray-400 rounded whitespace-nowrap">
                CALCULATED
              </span>
            )}
            <input
              type="range"
              id={`${param}-range`}
              min={min}
              max={max}
              step={step}
              value={gasParams[param as keyof GasParams]}
              onChange={(e) => onParameterUpdate(param, Number(e.target.value) || 0)}
              className="flex-1 h-2 mx-1 sm:mx-2 min-w-0"
              disabled={lockedParameters.has(param) || inactive}
              aria-label={`${label} slider`}
              aria-describedby={`${param}-help`}
              aria-valuemin={min}
              aria-valuemax={max}
              aria-valuenow={Number(gasParams[param as keyof GasParams])}
              aria-valuetext={`${Number(gasParams[param as keyof GasParams] || 0).toFixed(param === 'ppo2' ? 2 : 1)} ${param === 'ppo2' ? '' : param.includes('mod') || param.includes('end') ? unitLabels.depth : 'percent'}`}
            />
            <input
              type="number"
              id={`${param}-input`}
              min={min}
              max={max}
              step={step}
              value={gasParams[param as keyof GasParams]}
              onChange={(e) => onParameterUpdate(param, Number(e.target.value) || 0)}
              className="w-16 sm:w-20 h-8 bg-gray-900 border-2 border-yellow-400 rounded px-1 sm:px-2 text-yellow-400 font-bold text-center text-xs sm:text-sm focus:ring-2 focus:ring-yellow-300 focus:outline-none flex-shrink-0"
              disabled={lockedParameters.has(param) || inactive}
              aria-label={`${label} input field`}
              aria-describedby={`${param}-help`}
            />
            <div id={`${param}-help`} className="sr-only">
              {inactive 
                ? `${label} is automatically calculated based on other parameters` 
                : `Adjust ${label} between ${min} and ${max}. Current value: ${Number(gasParams[param as keyof GasParams] || 0).toFixed(param === 'ppo2' ? 2 : 1)}`
              }
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}