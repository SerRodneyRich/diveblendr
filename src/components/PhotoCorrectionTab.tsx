'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import ImageUploader from '@/components/PhotoCorrection/ImageUploader'
import PhotoEditorModal from '@/components/PhotoCorrection/PhotoEditorModal'
import { UnderwaterProcessor } from '@/utils/imageProcessing/UnderwaterProcessor'
import { type EditingSettings, type ImageWithPreview } from '@/types/photoCorrection'
import { MdRotateRight, MdClose, MdStar, MdStarBorder } from 'react-icons/md'
import { useUnitConversion } from '@/hooks/useUnitConversion'

// Import the same camera presets from the main photo correction page
const CAMERA_PRESETS = [
  // GoPro Hero11 Black Priority Presets
  {
    id: 'hero11-tropical-clear-shallow',
    name: 'Hero11: Tropical Clear (0-15ft)',
    description: 'Crystal clear tropical waters with abundant sunlight',
    category: 'Hero11 Black',
    settings: {
      redBoost: 15,
      blueReduction: -8,
      greenReduction: -5,
      contrast: 10,
      brightness: 5,
      saturation: 8,
      vibrance: 0,
      warmth: 0,
      tint: 0,
      highlights: 0,
      shadows: 0,
      clarity: 0
    }
  },
  {
    id: 'hero11-tropical-clear-mid',
    name: 'Hero11: Tropical Clear (15-30ft)',
    description: 'Good visibility tropical waters with natural light',
    category: 'Hero11 Black',
    settings: {
      redBoost: 25,
      blueReduction: -12,
      greenReduction: -8,
      contrast: 15,
      brightness: 8,
      saturation: 12,
      vibrance: 0,
      warmth: 0,
      tint: 0,
      highlights: 0,
      shadows: 0,
      clarity: 0
    }
  }
  // Note: Adding just 2 presets for the tab view - full list available in photo-correction page
]

export default function PhotoCorrectionTab() {
  const { convertDepth, preferences } = useUnitConversion()
  const [selectedImages, setSelectedImages] = useState<ImageWithPreview[]>([])
  const [editingImage, setEditingImage] = useState<ImageWithPreview | null>(null)
  const [favoritePresets, setFavoritePresets] = useState<Set<string>>(new Set())
  const [showPresetsModal, setShowPresetsModal] = useState(false)
  const processorRef = useRef<UnderwaterProcessor | null>(null)

  // Convert depth ranges in preset names for display
  const convertPresetName = useCallback((name: string) => {
    if (preferences.depth === 'meters') {
      // Convert ft ranges to meters
      return name
        .replace(/\(0-15ft\)/, `(0-${convertDepth(15, 0).value}m)`)
        .replace(/\(15-30ft\)/, `(${convertDepth(15, 0).value}-${convertDepth(30, 0).value}m)`)
    }
    return name
  }, [convertDepth, preferences.depth])

  // Initialize processor
  const getProcessor = useCallback(() => {
    if (!processorRef.current) {
      processorRef.current = new UnderwaterProcessor()
    }
    return processorRef.current
  }, [])

  // Handle image upload
  const handleImagesSelected = useCallback((files: File[]) => {
    const newImages = files.map(file => ({
      file,
      preview: URL.createObjectURL(file),
      id: Math.random().toString(36).substring(7),
      rotation: 0
    }))
    setSelectedImages(prev => [...prev, ...newImages])
  }, [])

  // Handle image removal
  const handleRemoveImage = useCallback((id: string) => {
    setSelectedImages(prev => prev.filter(img => img.id !== id))
    if (editingImage?.id === id) {
      setEditingImage(null)
    }
  }, [editingImage])

  // Handle edit
  const handleEdit = (image: ImageWithPreview) => {
    setEditingImage(image)
  }

  // Handle rotation
  const handleRotateImage = useCallback((imageId: string) => {
    setSelectedImages(prev =>
      prev.map(img =>
        img.id === imageId
          ? { ...img, rotation: ((img.rotation || 0) + 90) % 360 }
          : img
      )
    )
  }, [])

  // Handle settings update
  const handleUpdateSettings = useCallback((imageId: string, settings: Partial<EditingSettings>) => {
    setSelectedImages(prev => 
      prev.map(img => 
        img.id === imageId 
          ? { ...img, settings }
          : img
      )
    )
  }, [])

  // Handle save
  const handleSave = useCallback((processedImageUrl: string) => {
    console.log('Image saved successfully')
  }, [])

  // Handle apply to all
  const handleApplyToAll = useCallback(async (settings: Partial<EditingSettings>) => {
    console.log('Applying settings to all images:', settings)
    
    // Apply settings to all images
    setSelectedImages(prev => 
      prev.map(img => ({
        ...img,
        settings: { ...img.settings, ...settings } as Partial<EditingSettings>,
        processed: undefined
      }))
    )
  }, [])

  // Handle preset apply
  const handleApplyPreset = useCallback(async (presetSettings: Partial<EditingSettings>) => {
    if (selectedImages.length === 0) return
    
    console.log('Applying preset to all images:', presetSettings)
    await handleApplyToAll(presetSettings)
    setShowPresetsModal(false)
  }, [selectedImages.length, handleApplyToAll])

  // Handle favorite toggle
  const handleToggleFavorite = useCallback((presetId: string) => {
    setFavoritePresets(prev => {
      const newFavorites = new Set(prev)
      if (newFavorites.has(presetId)) {
        newFavorites.delete(presetId)
      } else {
        newFavorites.add(presetId)
      }
      return newFavorites
    })
  }, [])

  // Cleanup processor on unmount
  useEffect(() => {
    return () => {
      if (processorRef.current) {
        processorRef.current.dispose()
      }
    }
  }, [])

  return (
    <div className="max-w-7xl mx-auto">
      <div className="bg-gray-800/95 backdrop-blur-sm rounded-lg border border-gray-700 p-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-blue-400 mb-2">
            Underwater Photo Editor
          </h1>
          <p className="text-gray-300 max-w-2xl mx-auto">
            Professional underwater photo correction for diving and marine photography.
            Upload your images to enhance colors, reduce blue/green cast, and optimize for underwater conditions.
          </p>
        </div>

        {/* Image Uploader */}
        <div className="mb-8">
          <ImageUploader onImagesSelected={handleImagesSelected} />
        </div>

        {/* Image Grid */}
        {selectedImages.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-white">
                Uploaded Images ({selectedImages.length})
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowPresetsModal(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium transition-colors text-sm"
                >
                  Apply Preset to All
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {selectedImages.map((image) => (
                <div key={image.id} className="bg-gray-700 rounded-lg overflow-hidden border border-gray-600">
                  <div className="relative aspect-square">
                    <img
                      src={image.preview}
                      alt={image.file.name}
                      className="w-full h-full object-cover"
                      style={{
                        transform: `rotate(${image.rotation || 0}deg)`
                      }}
                    />
                    <button
                      onClick={() => handleRemoveImage(image.id)}
                      className="absolute top-2 right-2 bg-red-500/80 hover:bg-red-500 text-white rounded-full p-1.5 transition-colors"
                    >
                      <MdClose className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="p-3">
                    <div className="text-sm text-gray-300 truncate mb-2">
                      {image.file.name}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(image)}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleRotateImage(image.id)}
                        className="bg-gray-600 hover:bg-gray-500 text-white p-1.5 rounded transition-colors"
                      >
                        <MdRotateRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Editor Modal */}
        {editingImage && (
          <PhotoEditorModal
            image={editingImage}
            onClose={() => setEditingImage(null)}
            onSave={handleSave}
            onUpdateSettings={handleUpdateSettings}
            onApplyToAll={handleApplyToAll}
            onRotateImage={handleRotateImage}
            favoritePresets={favoritePresets}
            onToggleFavorite={handleToggleFavorite}
          />
        )}

        {/* Preset Selection Modal */}
        {showPresetsModal && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-gray-800 rounded-lg border border-gray-600 max-w-md w-full max-h-[80vh] overflow-hidden">
              <div className="p-4 border-b border-gray-600">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-white">Choose Preset</h3>
                  <button
                    onClick={() => setShowPresetsModal(false)}
                    className="text-gray-400 hover:text-white"
                  >
                    <MdClose className="w-6 h-6" />
                  </button>
                </div>
              </div>
              <div className="p-4 overflow-y-auto">
                <div className="space-y-2">
                  {CAMERA_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => handleApplyPreset(preset.settings)}
                      className="w-full text-left p-3 bg-gray-700 hover:bg-gray-600 rounded border border-gray-600 transition-colors"
                    >
                      <div className="font-medium text-white">{convertPresetName(preset.name)}</div>
                      <div className="text-sm text-gray-300 mt-1">{preset.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Help Text */}
        {selectedImages.length === 0 && (
          <div className="text-center text-gray-400">
            <p>Upload your underwater photos to get started with professional color correction.</p>
          </div>
        )}
      </div>
    </div>
  )
}