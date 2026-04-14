import { safeRound, RoundingType } from '../utils/safeRounding'
import { calculateMOD } from '../utils/endModCalculations'
import { useUnitConversion } from '../hooks/useUnitConversion'

interface Recommendation {
  type: string
  mix: string
  details: string
  o2: number
  he: number
  n2: number
  error: boolean
  math?: string
}

interface RecParams {
  targetMod: number
  maxEnd: number
  desiredPPO2: number
}

interface RecommendationCardProps {
  recommendation: Recommendation
  index: number
  recParams: RecParams
  onApply: (o2: number, he: number, n2: number) => void
  onShowMath: (title: string, content: string) => void
}

export default function RecommendationCard({ 
  recommendation: rec, 
  index, 
  recParams, 
  onApply, 
  onShowMath 
}: RecommendationCardProps) {
  const { convertDepth } = useUnitConversion();
  const calculateMODForRecommendation = (o2Percent: number, gasType: string) => {
    if (o2Percent <= 0) return 'N/A'
    // Use appropriate PPO2 based on gas type
    const maxPPO2 = (gasType === 'Deco Gas' || gasType === 'Oxygen Deco' || gasType === 'Shallow Bailout') ? 1.6 : 
                    (gasType === 'Bailout Gas' || gasType === 'Bailout Gas (Hypoxic)') ? 1.4 : 
                    recParams.desiredPPO2  // Use user's desired PPO2 for bottom gas
    
    
    try {
      const mixture = { oxygen: o2Percent, helium: 0, nitrogen: 100 - o2Percent }
      const mod = calculateMOD(mixture, maxPPO2)
      
      
      return mod > 0 ? mod : 0
    } catch {
      return 'N/A'
    }
  }
  
  const mod = calculateMODForRecommendation(rec.o2, rec.type)

  return (
    <div
      key={index}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('.math-btn') && !rec.error) {
          onApply(rec.o2, rec.he, rec.n2)
        }
      }}
      className={`p-2 sm:p-3 rounded-lg cursor-pointer transition-all relative ${
        rec.error
          ? 'bg-red-900/50 border border-red-600'
          : 'bg-gray-800/80 border border-gray-600 hover:border-yellow-400 hover:bg-gray-700/80'
      }`}
    >
      <div className="flex justify-between items-center mb-2">
        <div className="text-xs sm:text-xs font-medium text-yellow-400 uppercase tracking-wide">{rec.type}</div>
        {rec.math && (
          <button
            className="math-btn bg-yellow-500 text-gray-900 rounded-full min-w-[44px] min-h-[44px] flex items-center justify-center text-sm font-bold hover:bg-yellow-400 transition-colors flex-shrink-0 focus:ring-2 focus:ring-yellow-300 focus:outline-none"
            onClick={(e) => {
              e.stopPropagation()
              onShowMath(`${rec.type} - ${rec.mix}`, rec.math || '')
            }}
            title="Show calculation equations"
            aria-label="Show calculation equations for this gas mix"
          >
            📊
          </button>
        )}
      </div>
      
      <div className={`text-base sm:text-lg font-bold mb-2 ${rec.error ? 'text-red-400' : 'text-gray-100'}`}>
        {rec.mix}
      </div>
      
      {!rec.error && rec.o2 > 0 && (
        <div className="mb-2">
          <div className="text-xs text-gray-400 mb-1">MOD @ {(rec.type === 'Deco Gas' || rec.type === 'Oxygen Deco' || rec.type === 'Shallow Bailout') ? '1.6' : (rec.type === 'Bailout Gas' || rec.type === 'Bailout Gas (Hypoxic)') ? '1.4' : recParams.desiredPPO2}:</div>
          <div className="text-sm font-semibold text-blue-400">{typeof mod === 'number' ? convertDepth(mod).formatted : mod}</div>
        </div>
      )}
      
      {!rec.error && rec.o2 > 0 && (
        <div className="mb-2">
          <div className="text-xs text-gray-400 mb-1">Composition:</div>
          <div className="flex gap-2 text-xs">
            <span className="text-green-400">O₂: {safeRound(rec.o2, RoundingType.O2, 0)}%</span>
            {rec.he > 0 && <span className="text-purple-400">He: {safeRound(rec.he, RoundingType.HE, 0)}%</span>}
            <span className="text-gray-400">N₂: {safeRound(rec.n2, RoundingType.N2, 0)}%</span>
          </div>
        </div>
      )}
      
      <div className="text-xs text-gray-500">
        {rec.details.split('\n').slice(rec.error ? 0 : 1).join(' • ')}
      </div>
    </div>
  )
}