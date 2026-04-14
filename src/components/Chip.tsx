interface ChipProps {
  label: string
  variant?: 'rebreather' | 'technical' | 'trimix' | 'training' | 'forum' | 'equipment' | 'publication' | 'recommended' | 'other'
  size?: 'sm' | 'md'
  onClick?: () => void
  isSelected?: boolean
}

export default function Chip({ 
  label, 
  variant = 'other', 
  size = 'sm', 
  onClick, 
  isSelected = false 
}: ChipProps) {
  const getChipStyles = () => {
    const baseClasses = `inline-flex items-center rounded-full font-medium transition-colors ${
      size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'
    }`
    
    const variantStyles = {
      rebreather: isSelected 
        ? 'bg-purple-600 text-white border-purple-500' 
        : 'bg-purple-900 text-purple-200 border-purple-600',
      technical: isSelected 
        ? 'bg-blue-600 text-white border-blue-500' 
        : 'bg-blue-900 text-blue-200 border-blue-600',
      trimix: isSelected 
        ? 'bg-green-600 text-white border-green-500' 
        : 'bg-green-900 text-green-200 border-green-600',
      training: isSelected 
        ? 'bg-yellow-600 text-black border-yellow-500' 
        : 'bg-yellow-900 text-yellow-200 border-yellow-600',
      forum: isSelected 
        ? 'bg-orange-600 text-white border-orange-500' 
        : 'bg-orange-900 text-orange-200 border-orange-600',
      equipment: isSelected 
        ? 'bg-red-600 text-white border-red-500' 
        : 'bg-red-900 text-red-200 border-red-600',
      publication: isSelected 
        ? 'bg-indigo-600 text-white border-indigo-500' 
        : 'bg-indigo-900 text-indigo-200 border-indigo-600',
      recommended: isSelected 
        ? 'bg-amber-600 text-black border-amber-500' 
        : 'bg-amber-900 text-amber-200 border-amber-600',
      other: isSelected 
        ? 'bg-gray-600 text-white border-gray-500' 
        : 'bg-gray-700 text-gray-300 border-gray-500'
    }
    
    const clickableStyles = onClick 
      ? 'cursor-pointer hover:opacity-80 border' 
      : 'border'
    
    return `${baseClasses} ${variantStyles[variant]} ${clickableStyles}`
  }

  return (
    <span
      className={getChipStyles()}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {label}
    </span>
  )
}