import { memo } from 'react'
import RecommendationCard from './RecommendationCard'

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

interface RecommendationsGridProps {
  recommendations: Recommendation[]
  recParams: RecParams
  onApplyRecommendation: (o2: number, he: number, n2: number) => void
  onShowMath: (title: string, content: string) => void
  isLoading?: boolean
}

const RecommendationsGrid = memo(function RecommendationsGrid({ 
  recommendations, 
  recParams, 
  onApplyRecommendation, 
  onShowMath,
  isLoading = false
}: RecommendationsGridProps) {
  const LoadingCard = () => (
    <div className="p-4 bg-gray-800/80 border border-gray-600 rounded-lg animate-pulse">
      <div className="h-4 bg-gray-700 rounded mb-3"></div>
      <div className="h-6 bg-gray-700 rounded mb-2"></div>
      <div className="h-3 bg-gray-700 rounded mb-1"></div>
      <div className="h-3 bg-gray-700 rounded w-2/3"></div>
    </div>
  )

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <LoadingCard key={index} />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
      {recommendations.map((rec, index) => (
        <RecommendationCard
          key={index}
          recommendation={rec}
          index={index}
          recParams={recParams}
          onApply={onApplyRecommendation}
          onShowMath={onShowMath}
        />
      ))}
    </div>
  )
})

export default RecommendationsGrid