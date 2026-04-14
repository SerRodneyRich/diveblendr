import { useUnitConversion } from '../hooks/useUnitConversion'

type DiveMode = 'oc' | 'oc-trimix' | 'ccr' | 'ccr-trimix'

interface RecParams {
  targetMod: number
  maxEnd: number
  desiredPPO2: number
}

interface RecommendationControlsProps {
  diveMode: DiveMode
  recParams: RecParams
  onRecParamsChange: (params: RecParams) => void
}

export default function RecommendationControls({ diveMode, recParams, onRecParamsChange }: RecommendationControlsProps) {
  const { convertDepth, parseDepthInput, getUnitLabels, getConversionRanges } = useUnitConversion();
  const unitLabels = getUnitLabels();
  const ranges = getConversionRanges();

  const updateParam = (key: keyof RecParams, value: number) => {
    // Convert depth values from user input to metric for internal storage
    if (key === 'targetMod' || key === 'maxEnd') {
      const metricValue = parseDepthInput(value);
      onRecParamsChange({ ...recParams, [key]: metricValue });
    } else {
      onRecParamsChange({ ...recParams, [key]: value });
    }
  }

  return (
    <div className={`grid gap-3 sm:gap-4 mb-4 sm:mb-6 ${(diveMode === 'oc-trimix' || diveMode === 'ccr-trimix') ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1 md:grid-cols-2'}`}>
      <div className="bg-gray-700 p-3 sm:p-4 rounded">
        <label htmlFor="target-mod-range" className="block text-yellow-400 font-semibold mb-2 text-sm sm:text-base">Target MOD ({unitLabels.depth})</label>
        <input
          type="range"
          id="target-mod-range"
          min={ranges.depth.min}
          max={ranges.depth.max}
          value={convertDepth(recParams.targetMod).value}
          onChange={(e) => updateParam('targetMod', Number(e.target.value) || 0)}
          className="w-full mb-2 focus:ring-2 focus:ring-yellow-400 focus:outline-none"
          tabIndex={5}
          aria-label="Target Maximum Operating Depth slider"
          aria-describedby="target-mod-help"
          aria-valuemin={ranges.depth.min}
          aria-valuemax={ranges.depth.max}
          aria-valuenow={convertDepth(recParams.targetMod).value}
          aria-valuetext={`${convertDepth(recParams.targetMod).value} ${unitLabels.depth}`}
        />
        <input
          type="number"
          id="target-mod-input"
          min={ranges.depth.min}
          max={ranges.depth.max}
          value={convertDepth(recParams.targetMod).value}
          onChange={(e) => updateParam('targetMod', Number(e.target.value) || 0)}
          className="w-full bg-gray-900 border-2 border-yellow-400 rounded px-2 sm:px-3 py-1.5 sm:py-2 text-yellow-400 font-bold text-center text-sm sm:text-base focus:ring-2 focus:ring-yellow-400 focus:outline-none"
          tabIndex={6}
          aria-label="Target Maximum Operating Depth input"
          aria-describedby="target-mod-help"
        />
        <div id="target-mod-help" className="sr-only">
          Set your target maximum operating depth between {ranges.depth.min} and {ranges.depth.max} {unitLabels.depth}. Current value: {convertDepth(recParams.targetMod).value.toFixed(1)} {unitLabels.depth}.
        </div>
      </div>

      {(diveMode === 'oc-trimix' || diveMode === 'ccr-trimix') && (
        <div className="bg-gray-700 p-3 sm:p-4 rounded">
          <label htmlFor="max-end-range" className="block text-yellow-400 font-semibold mb-2 text-sm sm:text-base">Max END ({unitLabels.depth})</label>
          <input
            type="range"
            id="max-end-range"
            min="20"
            max="40"
            value={convertDepth(recParams.maxEnd).value}
            onChange={(e) => updateParam('maxEnd', Number(e.target.value) || 0)}
            className="w-full mb-2 focus:ring-2 focus:ring-yellow-400 focus:outline-none"
            tabIndex={7}
            aria-label="Maximum Equivalent Narcotic Depth slider"
            aria-describedby="max-end-help"
            aria-valuemin={20}
            aria-valuemax={40}
            aria-valuenow={convertDepth(recParams.maxEnd).value}
            aria-valuetext={`${convertDepth(recParams.maxEnd).value} ${unitLabels.depth}`}
          />
          <input
            type="number"
            id="max-end-input"
            min="20"
            max="40"
            value={convertDepth(recParams.maxEnd).value}
            onChange={(e) => updateParam('maxEnd', Number(e.target.value) || 0)}
            className="w-full bg-gray-900 border-2 border-yellow-400 rounded px-2 sm:px-3 py-1.5 sm:py-2 text-yellow-400 font-bold text-center text-sm sm:text-base focus:ring-2 focus:ring-yellow-400 focus:outline-none"
            tabIndex={8}
            aria-label="Maximum Equivalent Narcotic Depth input"
            aria-describedby="max-end-help"
          />
          <div id="max-end-help" className="sr-only">
            Set your maximum acceptable narcotic depth between 20 and 40 {unitLabels.depth}. Current value: {convertDepth(recParams.maxEnd).value.toFixed(1)} {unitLabels.depth}.
          </div>
        </div>
      )}

      <div className="bg-gray-700 p-3 sm:p-4 rounded">
        <label htmlFor="ppo2-range" className="block text-yellow-400 font-semibold mb-2 text-sm sm:text-base">
          Desired PPO₂
          {diveMode === 'oc' && <span className="text-gray-400 text-xs ml-2">(Nominally 1.4)</span>}
          {diveMode === 'ccr' && <span className="text-gray-400 text-xs ml-2">(Nominally 1.2-1.3)</span>}
          {(diveMode === 'oc-trimix' || diveMode === 'ccr-trimix') && <span className="text-gray-400 text-xs ml-2">(Nominally 1.1)</span>}
        </label>
        <input
          type="range"
          id="ppo2-range"
          min="0.9"
          max={diveMode === 'ccr' || diveMode === 'ccr-trimix' ? "1.4" : "1.6"}
          step="0.1"
          value={recParams.desiredPPO2}
          onChange={(e) => updateParam('desiredPPO2', Number(e.target.value) || 0)}
          className="w-full mb-2 focus:ring-2 focus:ring-yellow-400 focus:outline-none"
          tabIndex={9}
          aria-label="Desired Partial Pressure of Oxygen slider"
          aria-describedby="ppo2-help"
          aria-valuemin={1.0}
          aria-valuemax={diveMode === 'ccr' || diveMode === 'ccr-trimix' ? 1.4 : 1.6}
          aria-valuenow={recParams.desiredPPO2}
          aria-valuetext={`${recParams.desiredPPO2}`}
        />
        <input
          type="number"
          id="ppo2-input"
          min="1.0"
          max={diveMode === 'ccr' || diveMode === 'ccr-trimix' ? "1.4" : "1.6"}
          step="0.1"
          value={recParams.desiredPPO2}
          onChange={(e) => updateParam('desiredPPO2', Number(e.target.value) || 0)}
          className="w-full bg-gray-900 border-2 border-yellow-400 rounded px-2 sm:px-3 py-1.5 sm:py-2 text-yellow-400 font-bold text-center text-sm sm:text-base focus:ring-2 focus:ring-yellow-400 focus:outline-none"
          tabIndex={10}
          aria-label="Desired Partial Pressure of Oxygen input"
          aria-describedby="ppo2-help"
        />
        <div id="ppo2-help" className="sr-only">
          Set your desired partial pressure of oxygen between 1.0 and {diveMode === 'ccr' || diveMode === 'ccr-trimix' ? '1.4' : '1.6'}. 
          {diveMode === 'oc' && ' Recommended value is 1.4 for open circuit diving.'}
          {diveMode === 'ccr' && ' Recommended range is 1.2-1.3 for CCR diving.'}
          {(diveMode === 'oc-trimix' || diveMode === 'ccr-trimix') && ' Recommended value is 1.1 for trimix diving.'}
          Current value: {recParams.desiredPPO2}.
        </div>
      </div>
    </div>
  )
}