'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import BackgroundImage from '@/components/BackgroundImage'
import GlobalUIComponents from '@/components/GlobalUIComponents'
import ImageUploader from '@/components/PhotoCorrection/ImageUploader'
import PhotoEditorModal from '@/components/PhotoCorrection/PhotoEditorModal'
import { UnderwaterProcessor, type ProcessingResult } from '@/utils/imageProcessing/UnderwaterProcessor'
import { type EditingSettings, type ImageWithPreview } from '@/types/photoCorrection'
import { MdRotateRight, MdClose, MdStar, MdStarBorder } from 'react-icons/md'

// Comprehensive GoPro underwater presets based on professional research
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
  },
  {
    id: 'hero11-tropical-deep',
    name: 'Hero11: Tropical Deep (30-60ft)',
    description: 'Deeper tropical waters where reds are significantly lost',
    category: 'Hero11 Black',
    settings: {
      redBoost: 35,
      blueReduction: -18,
      greenReduction: -12,
      contrast: 20,
      brightness: 12,
      saturation: 15,
      vibrance: 0,
      warmth: 0,
      tint: 0,
      highlights: 0,
      shadows: 0,
      clarity: 0
    }
  },
  {
    id: 'hero11-tropical-very-deep',
    name: 'Hero11: Tropical Very Deep (60ft+)',
    description: 'Deep diving where artificial light is recommended',
    category: 'Hero11 Black',
    settings: {
      redBoost: 45,
      blueReduction: -25,
      greenReduction: -15,
      contrast: 25,
      brightness: 15,
      saturation: 18,
      vibrance: 0,
      warmth: 0,
      tint: 0,
      highlights: 0,
      shadows: 0,
      clarity: 0
    }
  },
  // GoPro Hero12 Black Presets
  {
    id: 'hero12-hdr-clear',
    name: 'Hero12: HDR Clear (0-20ft)',
    description: 'Hero12 HDR capabilities in shallow clear water',
    category: 'Hero12 Black',
    settings: {
      redBoost: 18,
      blueReduction: -10,
      greenReduction: -6,
      contrast: 8,
      brightness: 3,
      saturation: 10,
      vibrance: 0,
      warmth: 0,
      tint: 0,
      highlights: 0,
      shadows: 0,
      clarity: 0
    }
  },
  {
    id: 'hero12-temperate-mid',
    name: 'Hero12: Temperate Water (20-40ft)',
    description: 'Cooler waters with different color characteristics',
    category: 'Hero12 Black',
    settings: {
      redBoost: 30,
      blueReduction: -15,
      greenReduction: -18,
      contrast: 18,
      brightness: 10,
      saturation: 14,
      vibrance: 0,
      warmth: 0,
      tint: 0,
      highlights: 0,
      shadows: 0,
      clarity: 0
    }
  },
  // GoPro Hero10 Black Presets
  {
    id: 'hero10-caribbean-reef',
    name: 'Hero10: Caribbean Reef (10-25ft)',
    description: 'Typical reef diving depths with good ambient light',
    category: 'Hero10 Black',
    settings: {
      redBoost: 22,
      blueReduction: -14,
      greenReduction: -9,
      contrast: 16,
      brightness: 7,
      saturation: 11,
      vibrance: 0,
      warmth: 0,
      tint: 0,
      highlights: 0,
      shadows: 0,
      clarity: 0
    }
  },
  {
    id: 'hero10-pacific-deep',
    name: 'Hero10: Pacific Deep Blue (25-50ft)',
    description: 'Deep blue Pacific waters with limited red light',
    category: 'Hero10 Black',
    settings: {
      redBoost: 38,
      blueReduction: -20,
      greenReduction: -14,
      contrast: 22,
      brightness: 14,
      saturation: 16,
      vibrance: 0,
      warmth: 0,
      tint: 0,
      highlights: 0,
      shadows: 0,
      clarity: 0
    }
  },
  // Water Condition Specific
  {
    id: 'murky-green-water',
    name: 'Murky Green Water',
    description: 'Poor visibility conditions common in temperate waters',
    category: 'Water Conditions',
    settings: {
      redBoost: 40,
      blueReduction: -10,
      greenReduction: -25,
      contrast: 30,
      brightness: 20,
      saturation: 20,
      vibrance: 0,
      warmth: 0,
      tint: 0,
      highlights: 0,
      shadows: 0,
      clarity: 0
    }
  },
  {
    id: 'kelp-forest-temperate',
    name: 'Kelp Forest/Temperate (15-35ft)',
    description: 'Kelp forest environments with filtered sunlight',
    category: 'Water Conditions',
    settings: {
      redBoost: 32,
      blueReduction: -16,
      greenReduction: -20,
      contrast: 18,
      brightness: 12,
      saturation: 14,
      vibrance: 0,
      warmth: 0,
      tint: 0,
      highlights: 0,
      shadows: 0,
      clarity: 0
    }
  },
  // Lighting Conditions
  {
    id: 'natural-light-surface',
    name: 'Natural Light Surface (0-10ft)',
    description: 'Snorkeling conditions with full sun penetration',
    category: 'Lighting',
    settings: {
      redBoost: 8,
      blueReduction: -5,
      greenReduction: -3,
      contrast: 5,
      brightness: 2,
      saturation: 5,
      vibrance: 0,
      warmth: 0,
      tint: 0,
      highlights: 0,
      shadows: 0,
      clarity: 0
    }
  },
  {
    id: 'mixed-artificial-natural',
    name: 'Mixed Artificial/Natural Light',
    description: 'Using strobes or video lights with ambient light',
    category: 'Lighting',
    settings: {
      redBoost: 12,
      blueReduction: -8,
      greenReduction: -6,
      contrast: 12,
      brightness: 4,
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
    id: 'artificial-light-only',
    name: 'Artificial Light Only',
    description: 'Video lights or strobes as primary light source',
    category: 'Lighting',
    settings: {
      redBoost: 5,
      blueReduction: -12,
      greenReduction: -8,
      contrast: 8,
      brightness: 6,
      saturation: 6,
      vibrance: 0,
      warmth: 0,
      tint: 0,
      highlights: 0,
      shadows: 0,
      clarity: 0
    }
  },
  // Quick Fixes
  {
    id: 'quick-correction',
    name: 'Quick Correction',
    description: 'Fast correction for immediate sharing',
    category: 'Quick Fix',
    settings: {
      redBoost: 20,
      blueReduction: -12,
      greenReduction: 0,
      contrast: 15,
      brightness: 0,
      saturation: 10,
      vibrance: 0,
      warmth: 0,
      tint: 0,
      highlights: 0,
      shadows: 0,
      clarity: 15
    }
  },
  {
    id: 'social-media-preset',
    name: 'Social Media Optimized',
    description: 'Optimized for Instagram/Facebook sharing',
    category: 'Quick Fix',
    settings: {
      redBoost: 18,
      blueReduction: -10,
      greenReduction: 0,
      contrast: 20,
      brightness: 0,
      saturation: 15,
      vibrance: 12,
      warmth: 0,
      tint: 0,
      highlights: 0,
      shadows: 0,
      clarity: 20
    }
  },
  // Extreme Conditions
  {
    id: 'backup-recovery',
    name: 'Extreme Recovery',
    description: 'Maximum correction for challenging footage',
    category: 'Emergency',
    settings: {
      redBoost: 60,
      blueReduction: -30,
      greenReduction: -20,
      contrast: 50,
      brightness: 25,
      saturation: 35,
      vibrance: 0,
      warmth: 0,
      tint: 0,
      highlights: 0,
      shadows: 0,
      clarity: 0
    }
  }
]


export default function PhotoCorrection() {
  const [imageLoaded, setImageLoaded] = useState(false)
  const [selectedImages, setSelectedImages] = useState<ImageWithPreview[]>([])
  const [editingImage, setEditingImage] = useState<ImageWithPreview | null>(null)
  const [showPresetsModal, setShowPresetsModal] = useState(false)
  const [batchProgress, setBatchProgress] = useState<{isProcessing: boolean, current: number, total: number, currentImage: string} | null>(null)
  const [favoritePresets, setFavoritePresets] = useState<Set<string>>(new Set())
  const processorRef = useRef<UnderwaterProcessor | null>(null)

  // Initialize processor
  const getProcessor = useCallback(() => {
    if (!processorRef.current) {
      processorRef.current = new UnderwaterProcessor()
    }
    return processorRef.current
  }, [])

  // Load favorite presets from localStorage on mount
  useEffect(() => {
    const savedFavorites = localStorage.getItem('diveblendr_favorite_presets')
    if (savedFavorites) {
      setFavoritePresets(new Set(JSON.parse(savedFavorites)))
    }
  }, [])

  // Toggle favorite preset
  const toggleFavoritePreset = useCallback((presetId: string) => {
    setFavoritePresets(prev => {
      const newFavorites = new Set(prev)
      if (newFavorites.has(presetId)) {
        newFavorites.delete(presetId)
      } else {
        newFavorites.add(presetId)
      }
      
      // Save to localStorage
      localStorage.setItem('diveblendr_favorite_presets', JSON.stringify([...newFavorites]))
      
      return newFavorites
    })
  }, [])

  // Sort presets with favorites first
  const sortedPresets = useMemo(() => {
    return [...CAMERA_PRESETS].sort((a, b) => {
      const aIsFavorite = favoritePresets.has(a.id)
      const bIsFavorite = favoritePresets.has(b.id)
      
      // Favorites first
      if (aIsFavorite && !bIsFavorite) return -1
      if (bIsFavorite && !aIsFavorite) return 1
      
      // Then by category
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category)
      }
      
      // Finally by name
      return a.name.localeCompare(b.name)
    })
  }, [favoritePresets])

  const handleImagesSelected = (files: File[]) => {
    const newImages = files.map(file => ({
      file,
      preview: URL.createObjectURL(file),
      id: Math.random().toString(36).substring(7),
      rotation: 0
    }))
    
    setSelectedImages(prev => [...prev, ...newImages])
    console.log('Selected images:', files)
  }

  const rotateImage = (id: string) => {
    setSelectedImages(prev => 
      prev.map(img => {
        if (img.id === id) {
          const currentRotation = img.rotation || 0
          const newRotation = (currentRotation + 90) % 360
          return { 
            ...img, 
            rotation: newRotation,
            // Clear processed image when rotating to force reprocessing
            processed: undefined
          }
        }
        return img
      })
    )
  }

  const removeImage = (id: string) => {
    setSelectedImages(prev => {
      const imageToRemove = prev.find(img => img.id === id)
      if (imageToRemove) {
        URL.revokeObjectURL(imageToRemove.preview)
        // Also clean up processed image URL if it exists
        if (imageToRemove.processed) {
          URL.revokeObjectURL(imageToRemove.processed.url)
        }
      }
      return prev.filter(img => img.id !== id)
    })
  }

  const handleEdit = (image: ImageWithPreview) => {
    setEditingImage(image)
  }

  const handleApplyToAll = useCallback(async (settings: Partial<EditingSettings>) => {
    console.log('Applying settings to all images:', settings)
    
    // Apply settings to all images and mark them for processing
    setSelectedImages(prev => 
      prev.map(img => ({
        ...img,
        settings: { ...img.settings, ...settings } as Partial<EditingSettings>,
        // Clear processed version so they get reprocessed with new settings
        processed: undefined
      }))
    )
    
    // Process all images with the new settings
    const processor = getProcessor()
    const imagesToProcess = selectedImages.filter(img => img.file)
    
    console.log(`Batch processing ${imagesToProcess.length} images with applied settings`)
    
    // Set up progress tracking
    setBatchProgress({
      isProcessing: true,
      current: 0,
      total: imagesToProcess.length,
      currentImage: ''
    })
    
    // Process sequentially to avoid overwhelming the system
    for (let i = 0; i < imagesToProcess.length; i++) {
      const image = imagesToProcess[i]
      try {
        // Update progress
        setBatchProgress(prev => prev ? {
          ...prev,
          current: i,
          currentImage: image.file.name
        } : null)
        
        // Mark as processing
        setSelectedImages(prev => 
          prev.map(img => 
            img.id === image.id 
              ? { ...img, processing: true }
              : img
          )
        )
        
        // Convert settings to CorrectionParams format
        const correctionParams = {
          redBoost: 1 + ((settings.redBoost || 0) / 100),
          blueReduction: 1 + ((settings.blueReduction || 0) / 100),
          greenReduction: 1 + ((settings.greenReduction || 0) / 100),
          contrast: 1 + ((settings.contrast || 0) / 100),
          brightness: (settings.brightness || 0) / 100,
          saturation: 1 + ((settings.saturation || 0) / 100),
          depth: 20
        }
        
        const result = await processor.processImage(image.file, {
          method: 'canvas',
          corrections: correctionParams,
          preset: 'custom'
        })

        if (result.success && result.processedImageUrl) {
          setSelectedImages(prev => 
            prev.map(img => 
              img.id === image.id 
                ? { 
                    ...img, 
                    processing: false,
                    processed: {
                      url: result.processedImageUrl!,
                      result
                    }
                  }
                : img
            )
          )
          console.log(`Applied settings to ${image.file.name}`)
        } else {
          console.error(`Failed to apply settings to ${image.file.name}:`, result.error)
          setSelectedImages(prev => 
            prev.map(img => 
              img.id === image.id 
                ? { ...img, processing: false }
                : img
            )
          )
        }
      } catch (error) {
        console.error(`Error applying settings to ${image.file.name}:`, error)
        setSelectedImages(prev => 
          prev.map(img => 
            img.id === image.id 
              ? { ...img, processing: false }
              : img
          )
        )
      }
      
      // Small delay between processing
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    // Clear progress tracking
    setBatchProgress(null)
    console.log('Batch application of settings completed')
  }, [selectedImages, getProcessor])

  const handleSave = useCallback((processedImageUrl: string) => {
    console.log('Image saved successfully')
    
    try {
      // Only store essential metadata, not the actual image data to avoid quota exceeded
      const savedImages = JSON.parse(sessionStorage.getItem('diveblendr_saved_images') || '[]')
      
      // Clean up old entries to prevent quota exceeded (keep only last 5)
      if (savedImages.length >= 5) {
        savedImages.splice(0, savedImages.length - 4)
      }
      
      // Store only metadata, not the actual image URL
      savedImages.push({
        timestamp: new Date().toISOString(),
        originalName: 'edited_image',
        size: Math.round(processedImageUrl.length / 1024) + 'KB' // Approximate size for logging
      })
      
      sessionStorage.setItem('diveblendr_saved_images', JSON.stringify(savedImages))
      console.log('Image save logged to session storage')
    } catch (error) {
      console.warn('Failed to log save metadata (storage full):', error)
      // Clear old saves if storage is still full
      try {
        sessionStorage.removeItem('diveblendr_saved_images')
        console.log('Cleared save history due to storage limit')
      } catch (clearError) {
        console.error('Failed to clear storage:', clearError)
      }
    }
  }, [])

  const handleUpdateSettings = useCallback((imageId: string, settings: Partial<EditingSettings>) => {
    setSelectedImages(prev => 
      prev.map(img => 
        img.id === imageId 
          ? { ...img, settings }
          : img
      )
    )
  }, [])

  const handleProcess = useCallback(async (image: ImageWithPreview) => {
    try {
      // Mark as processing
      setSelectedImages(prev => 
        prev.map(img => 
          img.id === image.id 
            ? { ...img, processing: true }
            : img
        )
      )

      console.log('Processing image:', image.file.name)
      const processor = getProcessor()
      
      const result = await processor.processImage(image.file, {
        preset: 'auto',
        method: 'auto',
        onProgress: (progress) => {
          console.log(`Processing ${image.file.name}: ${progress.toFixed(1)}%`)
        }
      })

      if (result.success && result.processedImageUrl) {
        // Update with processed result
        setSelectedImages(prev => 
          prev.map(img => 
            img.id === image.id 
              ? { 
                  ...img, 
                  processing: false,
                  processed: {
                    url: result.processedImageUrl!,
                    result
                  }
                }
              : img
          )
        )
        console.log(`Successfully processed ${image.file.name} in ${result.processingTime.toFixed(0)}ms using ${result.method}`)
      } else {
        console.error('Processing failed:', result.error)
        // Mark as not processing on failure
        setSelectedImages(prev => 
          prev.map(img => 
            img.id === image.id 
              ? { ...img, processing: false }
              : img
          )
        )
      }
    } catch (error) {
      console.error('Error processing image:', error)
      // Mark as not processing on error
      setSelectedImages(prev => 
        prev.map(img => 
          img.id === image.id 
            ? { ...img, processing: false }
            : img
        )
      )
    }
  }, [getProcessor])

  const handleApplyPreset = useCallback(async (presetSettings: Partial<EditingSettings>) => {
    if (selectedImages.length === 0) return
    
    console.log('Applying preset to all images:', presetSettings)
    await handleApplyToAll(presetSettings)
    setShowPresetsModal(false)
  }, [selectedImages, handleApplyToAll])

  const handleProcessAll = useCallback(async () => {
    const imagesToProcess = selectedImages.filter(img => !img.processed && !img.processing)
    
    console.log(`Starting batch processing of ${imagesToProcess.length} images`)
    
    // Set up progress tracking
    setBatchProgress({
      isProcessing: true,
      current: 0,
      total: imagesToProcess.length,
      currentImage: ''
    })
    
    // Process images sequentially to avoid overwhelming the system
    for (let i = 0; i < imagesToProcess.length; i++) {
      const image = imagesToProcess[i]
      try {
        // Update progress
        setBatchProgress(prev => prev ? {
          ...prev,
          current: i,
          currentImage: image.file.name
        } : null)
        
        // Mark as processing
        setSelectedImages(prev => 
          prev.map(img => 
            img.id === image.id 
              ? { ...img, processing: true }
              : img
          )
        )

        console.log('Processing image:', image.file.name)
        const processor = getProcessor()
        
        const result = await processor.processImage(image.file, {
          preset: 'auto',
          method: 'auto',
          onProgress: (progress) => {
            console.log(`Processing ${image.file.name}: ${progress.toFixed(1)}%`)
          }
        })

        if (result.success && result.processedImageUrl) {
          // Update with processed result
          setSelectedImages(prev => 
            prev.map(img => 
              img.id === image.id 
                ? { 
                    ...img, 
                    processing: false,
                    processed: {
                      url: result.processedImageUrl!,
                      result
                    }
                  }
                : img
            )
          )
          console.log(`Successfully processed ${image.file.name} in ${result.processingTime.toFixed(0)}ms using ${result.method}`)
        } else {
          console.error('Processing failed:', result.error)
          setSelectedImages(prev => 
            prev.map(img => 
              img.id === image.id 
                ? { ...img, processing: false }
                : img
            )
          )
        }
      } catch (error) {
        console.error('Error processing image:', error)
        setSelectedImages(prev => 
          prev.map(img => 
            img.id === image.id 
              ? { ...img, processing: false }
              : img
          )
        )
      }
      
      // Small delay between processing to prevent UI blocking
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    // Clear progress tracking
    setBatchProgress(null)
    console.log('Batch processing completed')
  }, [selectedImages, getProcessor])

  const handleNavigationChange = useCallback((tab: string) => {
    // Navigate to calculator with specific tab
    window.location.href = `/calculator#${tab}`
  }, [])

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-blue-900 via-blue-800 to-black cursor-default">
      <BackgroundImage onImageLoaded={() => setImageLoaded(true)} />
      
      {/* Global UI Components for navigation */}
      <GlobalUIComponents 
        activeTab="photo-editor" 
        onTabChange={handleNavigationChange}
      />
      
      {/* Loading state */}
      {!imageLoaded && (
        <div className="fixed inset-0 bg-gradient-to-b from-blue-900 via-blue-800 to-black flex items-center justify-center z-50">
          <div className="text-white text-lg">Loading...</div>
        </div>
      )}
      
      {/* Main content - only show when image is loaded */}
      {imageLoaded && (
        <>
          {/* Scrollable Content */}
          <div className="relative z-10 pb-20"> {/* Bottom padding for fixed buttons */}
            <div className="max-w-6xl mx-auto p-4">
              <div className="bg-black/20 backdrop-blur-sm rounded-2xl p-4 border border-white/10">
                {/* Photo Upload Area with Workflow Guide */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
                  {/* Upload Area - Expanded and Centered */}
                  <div className="lg:min-h-[320px] flex items-center">
                    <div className="w-full">
                      <ImageUploader onImagesSelected={handleImagesSelected} fillHeight />
                    </div>
                  </div>
                  
                  {/* Workflow Guide */}
                  <div className="bg-blue-500/10 border border-blue-400/20 rounded-lg p-4">
                    <h3 className="text-blue-300 font-semibold text-lg mb-3">📋 Recommended Workflow</h3>
                    <div className="space-y-2.5 text-sm text-blue-100">
                      <div className="flex items-start gap-2">
                        <span className="text-blue-400 font-bold">1.</span>
                        <div>
                          <span className="font-medium">Upload Photos:</span> Select your underwater images from camera or gallery
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-blue-400 font-bold">2.</span>
                        <div>
                          <span className="font-medium">Process All:</span> Use algorithms for automatic correction as a starting point
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-blue-400 font-bold">3.</span>
                        <div>
                          <span className="font-medium">Explore Presets:</span> Try &ldquo;All Presets&rdquo; view or individual camera presets
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-blue-400 font-bold">4.</span>
                        <div>
                          <span className="font-medium">Apply Enhancements:</span> Use noise reduction & sharpening for high-quality results
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-blue-400 font-bold">5.</span>
                        <div>
                          <span className="font-medium">Fine-tune Manually:</span> Use manual controls for final adjustments
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 p-2 bg-yellow-500/10 border border-yellow-400/20 rounded text-xs text-yellow-200">
                      💡 <strong>Tip:</strong> Each step builds on the previous one for best results!
                    </div>
                  </div>
                </div>

                {/* Show selected images as list */}
                {selectedImages.length > 0 && (
                  <div className="space-y-3 mt-6">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-white text-lg font-semibold">
                        Photos ({selectedImages.length})
                      </h3>
                      <button
                        onClick={() => {
                          selectedImages.forEach(img => URL.revokeObjectURL(img.preview))
                          setSelectedImages([])
                        }}
                        className="text-red-300 hover:text-red-200 text-xs px-3 py-2 bg-red-500/20 rounded border border-red-400/30 hover:bg-red-500/30 transition-colors ml-4"
                      >
                        Clear All
                      </button>
                    </div>
                    
                    <div className="space-y-2">
                      {selectedImages.map((image) => (
                        <div key={image.id} className="bg-white/5 rounded-lg border border-white/10 hover:border-white/20 transition-colors">
                          <div className="flex items-center p-3 gap-3">
                            {/* Image Preview */}
                            <div className="flex-shrink-0 relative">
                              <img
                                src={image.processed ? image.processed.url : image.preview}
                                alt={image.file.name}
                                className="w-16 h-16 object-cover rounded"
                                style={{
                                  transform: `rotate(${image.rotation || 0}deg)`
                                }}
                                onLoad={() => {
                                  console.log(`Loaded preview for ${image.file.name}`)
                                }}
                              />
                              {image.processing && (
                                <div className="absolute inset-0 bg-black/60 rounded flex items-center justify-center">
                                  <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                                </div>
                              )}
                              {image.processed && (
                                <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                                  <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                </div>
                              )}
                            </div>
                            
                            {/* Image Info */}
                            <div className="flex-1 min-w-0">
                              <div className="text-white font-medium truncate text-sm" title={image.file.name}>
                                {image.file.name}
                              </div>
                              <div className="flex items-center gap-2 text-xs mt-1">
                                <span className="text-blue-200">
                                  {(image.file.size / (1024 * 1024)).toFixed(1)} MB
                                </span>
                                {image.processing && (
                                  <span className="text-yellow-300 sm:inline hidden">Processing...</span>
                                )}
                                {image.processed && (
                                  <span className="text-green-300 sm:inline hidden">
                                    Processed ({image.processed.result.processingTime.toFixed(0)}ms)
                                  </span>
                                )}
                              </div>
                              {/* Mobile status - below filename */}
                              <div className="sm:hidden text-xs mt-1">
                                {image.processing && (
                                  <span className="text-yellow-300">Processing...</span>
                                )}
                                {image.processed && (
                                  <span className="text-green-300">
                                    Processed ({image.processed.result.processingTime.toFixed(0)}ms)
                                  </span>
                                )}
                              </div>
                            </div>
                            
                            {/* Action Buttons */}
                            <div className="flex-shrink-0 flex items-center gap-1">
                              {/* Rotation Button */}
                              <button
                                onClick={() => rotateImage(image.id)}
                                className="bg-gray-700 hover:bg-gray-600 text-white p-1.5 rounded transition-colors mr-2"
                                title="Rotate 90°"
                              >
                                <MdRotateRight className="w-4 h-4" />
                              </button>
                              
                              <button
                                onClick={() => handleEdit(image)}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-xs font-medium transition-colors"
                                title="Edit image"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => removeImage(image.id)}
                                className="bg-red-500/20 hover:bg-red-500/40 text-red-300 rounded p-1.5 transition-colors"
                                title="Remove image"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Batch Progress Indicator */}
          {batchProgress && batchProgress.isProcessing && (
            <div className="fixed top-0 left-0 right-0 z-30 bg-black/90 backdrop-blur-sm border-b border-white/20">
              <div className="max-w-4xl mx-auto p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white text-sm font-medium">
                    Processing Images ({batchProgress.current + 1}/{batchProgress.total})
                  </span>
                  <span className="text-blue-200 text-sm">
                    {Math.round(((batchProgress.current + 1) / batchProgress.total) * 100)}%
                  </span>
                </div>
                <div className="w-full bg-white/20 rounded-full h-2">
                  <div 
                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${((batchProgress.current + 1) / batchProgress.total) * 100}%` }}
                  />
                </div>
                {batchProgress.currentImage && (
                  <div className="text-blue-200 text-xs mt-2 truncate">
                    Current: {batchProgress.currentImage}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Fixed Bottom Buttons */}
          <div className="fixed bottom-0 left-0 right-0 z-20 bg-black/60 backdrop-blur-sm border-t border-white/10">
            <div className="max-w-4xl mx-auto p-3">
              <div className="flex gap-2 justify-center">
                <button 
                  onClick={handleProcessAll}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
                  disabled={selectedImages.length === 0 || selectedImages.some(img => img.processing)}
                >
                  Process All ({selectedImages.length})
                </button>
                <button 
                  onClick={() => setShowPresetsModal(true)}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
                  disabled={selectedImages.length === 0}
                >
                  Presets
                </button>
              </div>
            </div>
          </div>

          {/* Photo Editor Modal */}
          {editingImage && (
            <PhotoEditorModal
              image={editingImage}
              onClose={() => setEditingImage(null)}
              onApplyToAll={handleApplyToAll}
              onSave={handleSave}
              onUpdateSettings={handleUpdateSettings}
              onRotateImage={rotateImage}
              favoritePresets={favoritePresets}
              onToggleFavorite={toggleFavoritePreset}
            />
          )}

          {/* Presets Modal */}
          {showPresetsModal && (
            <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-black/80 backdrop-blur-sm rounded-2xl border border-white/20 max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="p-4 border-b border-white/20 flex justify-between items-center flex-shrink-0">
                  <h2 className="text-white text-lg font-semibold">Camera Presets</h2>
                  <button
                    onClick={() => setShowPresetsModal(false)}
                    className="bg-red-500/20 hover:bg-red-500/40 text-red-300 rounded-full p-2 transition-colors"
                  >
                    <MdClose className="w-5 h-5" />
                  </button>
                </div>
                
                {/* Presets List */}
                <div className="flex-1 overflow-y-auto">
                  <div className="p-4">
                    <p className="text-blue-200 text-sm mb-4">
                      Apply optimized settings to all {selectedImages.length} images. ⭐ Star your favorites!
                    </p>
                    <div className="space-y-2">
                      {sortedPresets.map((preset) => (
                        <div
                          key={preset.id}
                          className="flex items-start gap-2 bg-white/5 hover:bg-white/10 rounded border border-white/10 transition-colors"
                        >
                          <button
                            onClick={() => handleApplyPreset(preset.settings)}
                            className="flex-1 text-left p-3 min-w-0"
                          >
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="text-white font-medium text-sm">{preset.name}</span>
                              <span className="text-xs bg-white/10 text-blue-200 px-2 py-0.5 rounded flex-shrink-0">
                                {preset.category}
                              </span>
                              {favoritePresets.has(preset.id) && (
                                <MdStar className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                              )}
                            </div>
                            <div className="text-blue-200 text-xs leading-relaxed">{preset.description}</div>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleFavoritePreset(preset.id)
                            }}
                            className="p-3 hover:bg-white/10 rounded transition-colors flex-shrink-0"
                            title={favoritePresets.has(preset.id) ? 'Remove from favorites' : 'Add to favorites'}
                          >
                            {favoritePresets.has(preset.id) ? (
                              <MdStar className="w-5 h-5 text-yellow-400" />
                            ) : (
                              <MdStarBorder className="w-5 h-5 text-gray-400 hover:text-yellow-400" />
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}