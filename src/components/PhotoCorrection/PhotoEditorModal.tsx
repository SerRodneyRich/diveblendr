'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { MdClose, MdDownload, MdShare, MdAutoAwesome, MdTune, MdRotateRight, MdStar, MdStarBorder } from 'react-icons/md'
import { type EditingSettings, type CameraPreset, type ImageWithPreview } from '../../types/photoCorrection'
import { 
  applyImageEnhancement, 
  type EnhancementSettings, 
  getUnderwaterEnhancementPresets,
  estimateProcessingTime,
  createPreviewRegion,
  applyPreviewToCanvas,
  createPreviewOverlay
} from '../../utils/imageProcessing/imageEnhancement'

const DEFAULT_SETTINGS: EditingSettings = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  warmth: 0,
  tint: 0,
  highlights: 0,
  shadows: 0,
  vibrance: 0,
  clarity: 0,
  redBoost: 40,         // Underwater: boost reds
  blueReduction: -20,   // Underwater: reduce blues
  greenReduction: -10,  // Underwater: reduce greens
  // Enhancement defaults
  noiseReduction: 0,    // Disabled by default
  spatialSigma: 20,     // Medium spatial smoothing
  textureSigma: 30,     // Medium texture preservation
  sharpening: 0,        // Disabled by default
  sharpenRadius: 15,    // Medium radius
  sharpenThreshold: 10  // Low threshold for detail preservation
}

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

interface PhotoEditorModalProps {
  image: ImageWithPreview
  onClose: () => void
  onApplyToAll: (settings: EditingSettings) => void
  onSave: (processedImageUrl: string) => void
  onUpdateSettings: (imageId: string, settings: EditingSettings) => void
  onRotateImage: (imageId: string) => void
  favoritePresets?: Set<string>
  onToggleFavorite?: (presetId: string) => void
}

export default function PhotoEditorModal({ 
  image, 
  onClose, 
  onApplyToAll, 
  onSave,
  onUpdateSettings,
  onRotateImage,
  favoritePresets = new Set(),
  onToggleFavorite
}: PhotoEditorModalProps) {
  const [settings, setSettings] = useState<EditingSettings>({ ...DEFAULT_SETTINGS, ...image.settings })
  const [activeTab, setActiveTab] = useState<'presets' | 'manual' | 'enhance' | 'all-presets'>('presets')
  const [processedImageUrl, setProcessedImageUrl] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [enhancementProgress, setEnhancementProgress] = useState({ progress: 0, stage: '' })
  const [isEnhancing, setIsEnhancing] = useState(false)
  const [isPreviewMode, setIsPreviewMode] = useState(true)
  const [lastEnhancementSettings, setLastEnhancementSettings] = useState<EnhancementSettings | null>(null)
  const [baseProcessedCanvas, setBaseProcessedCanvas] = useState<HTMLCanvasElement | null>(null)
  const [cleanProcessedCanvas, setCleanProcessedCanvas] = useState<HTMLCanvasElement | null>(null)
  const [timeEstimate, setTimeEstimate] = useState(0)
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [previewRegion, setPreviewRegion] = useState<{ x: number, y: number, width: number, height: number } | null>(null)
  const [showPreviewOverlay, setShowPreviewOverlay] = useState(false)
  const [removedPresets, setRemovedPresets] = useState<Set<string>>(new Set())
  const [presetThumbnails, setPresetThumbnails] = useState<Map<string, string>>(new Map())
  const [isLoadingThumbnails, setIsLoadingThumbnails] = useState(false)
  const [enhancementAbortController, setEnhancementAbortController] = useState<AbortController | null>(null)
  const [isCanceling, setIsCanceling] = useState(false)

  // Sort presets with favorites first, matching main page behavior
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

  // Filter out removed presets for all-presets view
  const availablePresets = useMemo(() => {
    return sortedPresets.filter(preset => !removedPresets.has(preset.id))
  }, [sortedPresets, removedPresets])

  const applyPreset = useCallback((preset: CameraPreset) => {
    const newSettings = { ...DEFAULT_SETTINGS, ...preset.settings }
    setSettings(newSettings)
    onUpdateSettings(image.id, newSettings)
  }, [onUpdateSettings, image.id])

  // Generate thumbnail with preset applied
  const generateThumbnail = useCallback(async (preset: CameraPreset): Promise<string> => {
    console.log('generateThumbnail called for:', preset.name)
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        console.error('Canvas not supported')
        reject(new Error('Canvas not supported'))
        return
      }

      const img = new Image()
      // Don't set crossOrigin for data URLs
      if (!image.preview.startsWith('data:')) {
        img.crossOrigin = 'anonymous'
      }
      
      img.onload = () => {
        console.log('Image loaded successfully for:', preset.name)
        // Create thumbnail at 300px width max, maintaining aspect ratio
        const maxWidth = 300
        const aspectRatio = img.height / img.width
        const thumbnailWidth = Math.min(img.width, maxWidth)
        const thumbnailHeight = thumbnailWidth * aspectRatio

        canvas.width = thumbnailWidth
        canvas.height = thumbnailHeight
        ctx.drawImage(img, 0, 0, thumbnailWidth, thumbnailHeight)

        // Get image data for processing
        const imageData = ctx.getImageData(0, 0, thumbnailWidth, thumbnailHeight)
        const data = imageData.data
        const presetSettings = { ...DEFAULT_SETTINGS, ...preset.settings }

        // Apply preset adjustments
        for (let i = 0; i < data.length; i += 4) {
          let r = data[i]
          let g = data[i + 1]
          let b = data[i + 2]

          // Apply underwater corrections
          if (presetSettings.redBoost !== 0) {
            r = Math.min(255, Math.max(0, r * (1 + presetSettings.redBoost / 100)))
          }
          if (presetSettings.blueReduction !== 0) {
            b = Math.min(255, Math.max(0, b * (1 + presetSettings.blueReduction / 100)))
          }
          if (presetSettings.greenReduction !== 0) {
            g = Math.min(255, Math.max(0, g * (1 + presetSettings.greenReduction / 100)))
          }

          // Apply brightness
          if (presetSettings.brightness !== 0) {
            const brightness = presetSettings.brightness * 2.55
            r = Math.min(255, Math.max(0, r + brightness))
            g = Math.min(255, Math.max(0, g + brightness))
            b = Math.min(255, Math.max(0, b + brightness))
          }

          // Apply contrast
          if (presetSettings.contrast !== 0) {
            const contrast = (presetSettings.contrast + 100) / 100
            r = Math.min(255, Math.max(0, ((r - 128) * contrast) + 128))
            g = Math.min(255, Math.max(0, ((g - 128) * contrast) + 128))
            b = Math.min(255, Math.max(0, ((b - 128) * contrast) + 128))
          }

          // Apply saturation
          if (presetSettings.saturation !== 0) {
            const gray = 0.299 * r + 0.587 * g + 0.114 * b
            const saturation = (presetSettings.saturation + 100) / 100
            r = Math.min(255, Math.max(0, gray + (r - gray) * saturation))
            g = Math.min(255, Math.max(0, gray + (g - gray) * saturation))
            b = Math.min(255, Math.max(0, gray + (b - gray) * saturation))
          }

          data[i] = r
          data[i + 1] = g
          data[i + 2] = b
        }

        // Put processed data back and create data URL
        ctx.putImageData(imageData, 0, 0)
        const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.8)
        resolve(thumbnailUrl)
      }

      img.onerror = (error) => {
        console.error('Failed to load image for', preset.name, ':', error)
        reject(new Error('Failed to load image'))
      }
      img.src = image.preview
      console.log('Image src set to:', image.preview.substring(0, 50) + '...')
    })
  }, [image.preview])

  // Generate all thumbnails when entering all-presets mode
  const generateAllThumbnails = useCallback(async () => {
    if (activeTab !== 'all-presets' || isLoadingThumbnails) {
      console.log('Skipping thumbnail generation:', { activeTab, isLoadingThumbnails })
      return
    }
    
    console.log('Starting thumbnail generation for', availablePresets.length, 'presets')
    setIsLoadingThumbnails(true)
    const newThumbnails = new Map<string, string>()
    
    try {
      // Process thumbnails in batches to avoid overwhelming the browser
      const batchSize = 3
      for (let i = 0; i < availablePresets.length; i += batchSize) {
        const batch = availablePresets.slice(i, i + batchSize)
        console.log(`Processing batch ${i/batchSize + 1}:`, batch.map(p => p.name))
        
        const batchPromises = batch.map(async (preset) => {
          try {
            if (!presetThumbnails.has(preset.id)) {
              console.log('Generating thumbnail for:', preset.name)
              const thumbnailUrl = await generateThumbnail(preset)
              console.log('Generated thumbnail for:', preset.name)
              return { id: preset.id, url: thumbnailUrl }
            }
            return { id: preset.id, url: presetThumbnails.get(preset.id)! }
          } catch (error) {
            console.error('Error generating thumbnail for', preset.name, ':', error)
            return { id: preset.id, url: image.preview } // Fallback to original
          }
        })
        
        const batchResults = await Promise.all(batchPromises)
        batchResults.forEach(({ id, url }) => {
          newThumbnails.set(id, url)
        })
        
        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      
      console.log('Finished generating', newThumbnails.size, 'thumbnails')
      setPresetThumbnails(newThumbnails)
    } catch (error) {
      console.error('Failed to generate thumbnails:', error)
    } finally {
      setIsLoadingThumbnails(false)
    }
  }, [activeTab, availablePresets, presetThumbnails, generateThumbnail, isLoadingThumbnails, image.preview])

  // Remove preset from view
  const removePreset = useCallback((presetId: string) => {
    setRemovedPresets(prev => new Set([...prev, presetId]))
  }, [])
  
  const cancelEnhancement = useCallback(() => {
    if (enhancementAbortController && !isCanceling) {
      console.log('Cancel button clicked - aborting enhancement')
      setIsCanceling(true) // Immediate visual feedback
      setEnhancementProgress({ progress: 0, stage: 'Canceling...' })
      setTimeRemaining(0)
      
      // Abort the controller
      enhancementAbortController.abort()
      setEnhancementAbortController(null)
      
      // Keep showing canceling state for at least 1 second so user sees feedback
      setTimeout(() => {
        console.log('Cancel timeout - cleaning up states')
        setIsEnhancing(false)
        setIsCanceling(false)
        setEnhancementProgress({ progress: 0, stage: '' })
      }, 1000)
    }
  }, [enhancementAbortController, isCanceling])

  const updateSetting = useCallback((key: keyof EditingSettings, value: number) => {
    const newSettings = { ...settings, [key]: value }
    setSettings(newSettings)
    onUpdateSettings(image.id, newSettings)
    
    // Update time estimate when enhancement settings change
    if (['noiseReduction', 'spatialSigma', 'textureSigma', 'sharpening', 'sharpenRadius', 'sharpenThreshold'].includes(key)) {
      const enhancementSettings: EnhancementSettings = {
        noiseReduction: key === 'noiseReduction' ? value : (newSettings.noiseReduction || 0),
        spatialSigma: key === 'spatialSigma' ? value : (newSettings.spatialSigma || 20),
        textureSigma: key === 'textureSigma' ? value : (newSettings.textureSigma || 30),
        sharpening: key === 'sharpening' ? value : (newSettings.sharpening || 0),
        sharpenRadius: key === 'sharpenRadius' ? value : (newSettings.sharpenRadius || 15),
        sharpenThreshold: key === 'sharpenThreshold' ? value : (newSettings.sharpenThreshold || 10)
      }
      
      // Estimate based on a typical large image (3000x2000 pixels)
      const estimate = estimateProcessingTime(3000, 2000, enhancementSettings)
      setTimeEstimate(estimate)
      
      // Show overlay by default when enhancements are applied
      if (enhancementSettings.noiseReduction > 0 || enhancementSettings.sharpening > 0) {
        setShowPreviewOverlay(true)
      } else {
        setShowPreviewOverlay(false)
      }
    }
  }, [settings, onUpdateSettings, image.id])

  const applyPreset2 = useCallback((preset: Partial<EditingSettings>) => {
    console.log('Applying preset:', preset)
    const newSettings = { ...settings, ...preset }
    console.log('New settings:', newSettings)
    setSettings(newSettings)
    onUpdateSettings(image.id, newSettings)
    
    // Update time estimate for enhancement settings
    const hasEnhancementChanges = Object.keys(preset).some(key => 
      ['noiseReduction', 'spatialSigma', 'textureSigma', 'sharpening', 'sharpenRadius', 'sharpenThreshold'].includes(key)
    )
    
    if (hasEnhancementChanges) {
      const enhancementSettings: EnhancementSettings = {
        noiseReduction: newSettings.noiseReduction || 0,
        spatialSigma: newSettings.spatialSigma || 20,
        textureSigma: newSettings.textureSigma || 30,
        sharpening: newSettings.sharpening || 0,
        sharpenRadius: newSettings.sharpenRadius || 15,
        sharpenThreshold: newSettings.sharpenThreshold || 10
      }
      
      // Estimate based on a typical large image (3000x2000 pixels)
      const estimate = estimateProcessingTime(3000, 2000, enhancementSettings)
      setTimeEstimate(estimate)
      
      // Show overlay by default when enhancements are applied
      if (enhancementSettings.noiseReduction > 0 || enhancementSettings.sharpening > 0) {
        setShowPreviewOverlay(true)
      } else {
        setShowPreviewOverlay(false)
      }
    }
  }, [settings, onUpdateSettings, image.id])

  const togglePreviewOverlay = useCallback(() => {
    if (cleanProcessedCanvas && previewRegion) {
      setShowPreviewOverlay(prev => {
        const newValue = !prev
        // Use the clean canvas as base to avoid accumulating effects
        let displayCanvas = cleanProcessedCanvas
        if (newValue) {
          displayCanvas = createPreviewOverlay(cleanProcessedCanvas, previewRegion)
        }
        
        const updatedUrl = displayCanvas.toDataURL('image/jpeg', 0.9)
        setProcessedImageUrl(updatedUrl)
        return newValue
      })
    }
  }, [cleanProcessedCanvas, previewRegion])

const processImage = useCallback(
  async (forceFullReprocess = false) => {
    const enhancementSettings: EnhancementSettings = {
      noiseReduction: settings.noiseReduction || 0,
      spatialSigma: settings.spatialSigma || 20,
      textureSigma: settings.textureSigma || 30,
      sharpening: settings.sharpening || 0,
      sharpenRadius: settings.sharpenRadius || 15,
      sharpenThreshold: settings.sharpenThreshold || 10,
    };

    const needsEnhancement =
      enhancementSettings.noiseReduction > 0 ||
      enhancementSettings.sharpening > 0;
    const enhancementChanged =
      JSON.stringify(enhancementSettings) !==
      JSON.stringify(lastEnhancementSettings);

    let workingCanvas: HTMLCanvasElement;

    try {
      // --- QUICK EDITS ONLY ---
      if (!needsEnhancement) {
        setIsProcessing(true);

        // Always start from original for consistency
        workingCanvas = document.createElement("canvas");
        const ctx = workingCanvas.getContext("2d");
        if (!ctx) throw new Error("Canvas not supported");

        const img = new Image();
        img.crossOrigin = "anonymous";
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = image.preview;
        });

        workingCanvas.width = img.width;
        workingCanvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        // Apply color adjustments
        const imageData = ctx.getImageData(
          0,
          0,
          workingCanvas.width,
          workingCanvas.height
        );
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          let r = data[i],
            g = data[i + 1],
            b = data[i + 2];

          if (settings.redBoost)
            r = Math.min(255, r * (1 + settings.redBoost / 100));
          if (settings.blueReduction)
            b = Math.min(255, b * (1 + settings.blueReduction / 100));
          if (settings.greenReduction)
            g = Math.min(255, g * (1 + settings.greenReduction / 100));
          if (settings.brightness) {
            const br = settings.brightness * 2.55;
            r += br;
            g += br;
            b += br;
          }
          if (settings.contrast) {
            const c = (settings.contrast + 100) / 100;
            r = (r - 128) * c + 128;
            g = (g - 128) * c + 128;
            b = (b - 128) * c + 128;
          }
          if (settings.saturation) {
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;
            const s = (settings.saturation + 100) / 100;
            r = gray + (r - gray) * s;
            g = gray + (g - gray) * s;
            b = gray + (b - gray) * s;
          }

          data[i] = Math.min(255, Math.max(0, r));
          data[i + 1] = Math.min(255, Math.max(0, g));
          data[i + 2] = Math.min(255, Math.max(0, b));
        }
        ctx.putImageData(imageData, 0, 0);

        setProcessedImageUrl(workingCanvas.toDataURL("image/jpeg", 0.9));
        setCleanProcessedCanvas(workingCanvas);
        setBaseProcessedCanvas(workingCanvas);
      }

      // --- ENHANCEMENTS (Preview or Full Image) ---
      else {
        setIsEnhancing(true);

        // Either reuse base or start fresh
        if (baseProcessedCanvas && !enhancementChanged && !forceFullReprocess) {
          workingCanvas = document.createElement("canvas");
          workingCanvas.width = baseProcessedCanvas.width;
          workingCanvas.height = baseProcessedCanvas.height;
          workingCanvas
            .getContext("2d")!
            .drawImage(baseProcessedCanvas, 0, 0);
        } else {
          workingCanvas = document.createElement("canvas");
          const ctx = workingCanvas.getContext("2d")!;
          const img = new Image();
          img.crossOrigin = "anonymous";
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = image.preview;
          });
          workingCanvas.width = img.width;
          workingCanvas.height = img.height;
          ctx.drawImage(img, 0, 0);

          // Apply color corrections first
          const imageData = ctx.getImageData(
            0,
            0,
            workingCanvas.width,
            workingCanvas.height
          );
          // (apply same corrections as above here…)
          ctx.putImageData(imageData, 0, 0);

          setBaseProcessedCanvas(workingCanvas);
        }

        const estimate = estimateProcessingTime(
          workingCanvas.width,
          workingCanvas.height,
          enhancementSettings
        );
        setTimeEstimate(estimate);
        setTimeRemaining(estimate);

        if (
          !forceFullReprocess &&
          isPreviewMode &&
          (workingCanvas.width > 600 || workingCanvas.height > 600)
        ) {
          // --- Preview Branch ---
          const regionInfo = createPreviewRegion(workingCanvas, 400);
          const previewImageData = regionInfo.canvas
            .getContext("2d")!
            .getImageData(0, 0, regionInfo.width, regionInfo.height);

          setPreviewRegion({
            x: regionInfo.x,
            y: regionInfo.y,
            width: regionInfo.width,
            height: regionInfo.height,
          });
          setShowPreviewOverlay(true);

          await applyImageEnhancement(
            previewImageData,
            enhancementSettings,
            (progress, stage) => {
              setEnhancementProgress({ progress, stage });
              setTimeRemaining(
                Math.max(0, estimate * (1 - progress / 100))
              );
            }
          );

          regionInfo.canvas
            .getContext("2d")!
            .putImageData(previewImageData, 0, 0);
          applyPreviewToCanvas(
            workingCanvas,
            regionInfo.canvas,
            regionInfo.x,
            regionInfo.y
          );
        } else {
          // --- Full Image Branch ---
          const fullImageData = workingCanvas
            .getContext("2d")!
            .getImageData(0, 0, workingCanvas.width, workingCanvas.height);

          await applyImageEnhancement(
            fullImageData,
            enhancementSettings,
            (progress, stage) => {
              setEnhancementProgress({ progress, stage });
              setTimeRemaining(
                Math.max(0, estimate * (1 - progress / 100))
              );
            }
          );

          workingCanvas
            .getContext("2d")!
            .putImageData(fullImageData, 0, 0);
          setIsPreviewMode(false);
          // Don't automatically hide overlay when processing full image
          // Let user control it manually
        }

        setLastEnhancementSettings(enhancementSettings);
        setProcessedImageUrl(workingCanvas.toDataURL("image/jpeg", 0.9));
        setCleanProcessedCanvas(workingCanvas);
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('cancelled')) {
        console.log('Enhancement cancelled by user')
        // Don't update the image on cancellation - keep current state
      } else {
        console.error("Processing failed:", err);
        setProcessedImageUrl(image.preview);
      }
    } finally {
      setIsProcessing(false);
      // Only reset enhancing/canceling states if not already canceled via button
      // (the setTimeout in cancelEnhancement will handle cleanup)
      if (!isCanceling) {
        setIsEnhancing(false);
        setEnhancementAbortController(null);
      }
    }
  },
  [
    image,
    settings,
    baseProcessedCanvas,
    lastEnhancementSettings,
    isPreviewMode,
    isCanceling,
  ]
);


  const handleDownload = useCallback(() => {
    if (processedImageUrl) {
      const link = document.createElement('a')
      link.href = processedImageUrl
      
      // Generate a better filename with timestamp
      const timestamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
      const originalName = image.file.name.split('.')[0]
      const extension = image.file.name.split('.').pop()
      link.download = `${originalName}_edited_${timestamp}.${extension}`
      
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      // Trigger the onSave callback for additional handling
      onSave(processedImageUrl)
    }
  }, [processedImageUrl, image.file.name, onSave])

 const handleShare = useCallback(async () => {
  if (!processedImageUrl) {
    console.warn("No processed image to share.")
    return
  }

  if (!navigator.share) {
    alert("Sharing is not supported on this device/browser.")
    return
  }

  try {
    // Fetch the image blob
    const response = await fetch(processedImageUrl)
    const blob = await response.blob()
    const file = new File([blob], `edited_${image.file.name}`, { type: blob.type })

    // Try Web Share Level 2 (with files)
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: "Edited Underwater Photo",
        text: "Check out my edited underwater photo!",
        files: [file],
      })
    } else {
      // Fallback: share text only (works on Android/iOS)
      await navigator.share({
        title: "Edited Underwater Photo",
        text: "Check out my edited underwater photo!",
        url: processedImageUrl, // optional, may open in browser
      })
    }
  } catch (error: unknown) {
    // Handle user cancellation or errors
    const err = error as Error
    if (err?.name === "AbortError" || err?.message?.includes("cancel")) {
      console.log("Share canceled by user")
    } else {
      console.error("Sharing failed:", error)
      alert("Sharing failed. Please try again.")
    }
  }
}, [processedImageUrl, image.file.name])

  

  // Update settings when image changes
  useEffect(() => {
    setSettings({ ...DEFAULT_SETTINGS, ...image.settings })
  }, [image.id, image.settings])

  const lastProcessedSettingsRef = useRef<EditingSettings | null>(null)


  useEffect(() => {
    // Shallow compare (or deep if needed)
    if (JSON.stringify(settings) !== JSON.stringify(lastProcessedSettingsRef.current)) {
      lastProcessedSettingsRef.current = settings

      const timeoutId = setTimeout(() => {
        processImage(false)
      }, 100)

      return () => clearTimeout(timeoutId)
    }
  }, [settings, processImage])


  // Generate thumbnails when entering all-presets mode
  useEffect(() => {
    if (activeTab === 'all-presets') {
      generateAllThumbnails()
    }
  }, [activeTab]) // Remove generateAllThumbnails from deps to avoid infinite loop

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (e.target instanceof HTMLInputElement) return
      
      switch (e.key.toLowerCase()) {
        case 'escape':
          onClose()
          break
        case 's':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            handleDownload()
          }
          break
        case 'r':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            onRotateImage(image.id)
          }
          break
        case 'backspace':
        case 'delete':
          setSettings(DEFAULT_SETTINGS)
          onUpdateSettings(image.id, DEFAULT_SETTINGS)
          break
        case '1':
          setActiveTab('presets')
          break
        case '2':
          setActiveTab('manual')
          break
        case '3':
          setActiveTab('all-presets')
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, handleDownload, onRotateImage, image.id, onUpdateSettings])

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col md:flex-row">
      {/* Header - Mobile only */}
      <div className="md:hidden bg-black/80 backdrop-blur-sm border-b border-white/20 flex flex-col">
        <div className="flex justify-between items-center p-1">
          <span className="text-white text-sm font-medium truncate">{image.file.name}</span>
          <button
            onClick={onClose}
            className="bg-red-500/20 hover:bg-red-500/40 text-red-300 rounded-full p-1.5 transition-colors"
          >
            <MdClose className="w-4 h-4" />
          </button>
        </div>
        
        {/* Mobile Tab Navigation */}
        <div className="px-2 pb-2">
          <div className="flex gap-1 bg-white/10 rounded p-1">
            <button
              onClick={() => setActiveTab('presets')}
              className={`flex-1 py-1 px-1 rounded text-xs font-medium transition-colors ${
                activeTab === 'presets'
                  ? 'bg-blue-600 text-white'
                  : 'text-blue-200 hover:text-white hover:bg-white/10'
              }`}
            >
              Presets
            </button>
            <button
              onClick={() => setActiveTab('manual')}
              className={`flex-1 py-1 px-1 rounded text-xs font-medium transition-colors ${
                activeTab === 'manual'
                  ? 'bg-blue-600 text-white'
                  : 'text-blue-200 hover:text-white hover:bg-white/10'
              }`}
            >
              Manual
            </button>
            <button
              onClick={() => setActiveTab('enhance')}
              className={`flex-1 py-1 px-1 rounded text-xs font-medium transition-colors ${
                activeTab === 'enhance'
                  ? 'bg-blue-600 text-white'
                  : 'text-blue-200 hover:text-white hover:bg-white/10'
              }`}
            >
              Enhance
            </button>
            <button
              onClick={() => setActiveTab('all-presets')}
              className={`flex-1 py-1 px-1 rounded text-xs font-medium transition-colors ${
                activeTab === 'all-presets'
                  ? 'bg-blue-600 text-white'
                  : 'text-blue-200 hover:text-white hover:bg-white/10'
              }`}
            >
              All
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Header - Desktop only */}
        <div className="hidden md:block bg-black/60 backdrop-blur-sm ml-12 p-4 border-b border-white/20 flex-shrink-0">
          <div className="flex justify-between items-center">
            <div className="hidden lg:flex text-blue-200 text-xs space-x-4">
              <span>ESC: Close</span>
              <span>Ctrl+S: Save</span>
              <span>Ctrl+R: Rotate</span>
              <span>Del: Reset</span>
              <span>1/2/3: Switch tabs</span>
            </div>
            <div className="hidden md:flex gap-1 bg-white/10 rounded p-1">
              <button
                onClick={() => setActiveTab('presets')}
                className={`py-1 px-2 rounded text-xs font-medium transition-colors ${
                  activeTab === 'presets'
                    ? 'bg-blue-600 text-white'
                    : 'text-blue-200 hover:text-white hover:bg-white/10'
                }`}
              >
                Presets
              </button>
              <button
                onClick={() => setActiveTab('manual')}
                className={`py-1 px-2 rounded text-xs font-medium transition-colors ${
                  activeTab === 'manual'
                    ? 'bg-blue-600 text-white'
                    : 'text-blue-200 hover:text-white hover:bg-white/10'
                }`}
              >
                Manual
              </button>
              <button
                onClick={() => setActiveTab('enhance')}
                className={`py-1 px-2 rounded text-xs font-medium transition-colors ${
                  activeTab === 'enhance'
                    ? 'bg-blue-600 text-white'
                    : 'text-blue-200 hover:text-white hover:bg-white/10'
                }`}
              >
                Enhance
              </button>
              <button
                onClick={() => setActiveTab('all-presets')}
                className={`py-1 px-2 rounded text-xs font-medium transition-colors ${
                  activeTab === 'all-presets'
                    ? 'bg-blue-600 text-white'
                    : 'text-blue-200 hover:text-white hover:bg-white/10'
                }`}
              >
                All Presets
              </button>
            </div>
            <button
              onClick={onClose}
              className="bg-red-500/20 hover:bg-red-500/40 text-red-300 rounded-full p-2 transition-colors"
            >
              <MdClose className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Area */}
        {activeTab === 'all-presets' ? (
          // All Presets View - Full Main Area
          <div className="flex-1 flex flex-col min-h-0 relative p-4 max-h-full">
            <h3 className="text-white text-lg font-medium mb-4 flex-shrink-0">Compare All Presets - {image.file.name}</h3>
            
            {/* Loading Overlay */}
            {isLoadingThumbnails && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10 rounded">
                <div className="text-white text-center">
                  <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                  <div className="text-lg">Loading previews...</div>
                  <div className="text-sm text-blue-200 mt-1">Processing {availablePresets.length} filters</div>
                </div>
              </div>
            )}
            
            {/* Thumbnails Grid */}
            <div className="flex-1 overflow-y-auto touch-pan-y overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pb-4 px-1">
                {availablePresets.map((preset) => {
                  const thumbnailUrl = presetThumbnails.get(preset.id)
                  return (
                    <div
                      key={preset.id}
                      className="bg-white/5 rounded-lg border border-white/10 overflow-hidden relative group hover:border-white/20 transition-colors"
                    >
                      {/* Remove Button */}
                      <button
                        onClick={() => removePreset(preset.id)}
                        className="absolute top-2 right-2 z-20 bg-red-500/80 hover:bg-red-500 text-white rounded-full p-1.5 opacity-70 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                        title={`Remove ${preset.name}`}
                      >
                        <MdClose className="w-4 h-4" />
                      </button>
                      
                      {/* Thumbnail */}
                      <div className="aspect-square bg-black/40 flex items-center justify-center max-h-48 md:max-h-64">
                        {thumbnailUrl ? (
                          <img
                            src={thumbnailUrl}
                            alt={`${preset.name} preview`}
                            className="w-full h-full object-contain"
                            style={{
                              transform: `rotate(${image.rotation || 0}deg)`
                            }}
                          />
                        ) : (
                          <div className="text-center">
                            <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                            <div className="text-blue-200 text-xs">Processing...</div>
                          </div>
                        )}
                      </div>
                      
                      {/* Preset Info */}
                      <div className="p-3">
                        <div className="text-white text-sm font-medium truncate mb-1">
                          {preset.name}
                        </div>
                        <div className="text-xs bg-white/10 text-blue-200 px-2 py-1 rounded inline-block mb-3">
                          {preset.category}
                        </div>
                        
                        {/* Use Filter Button */}
                        <button
                          onClick={() => {
                            applyPreset(preset)
                            setActiveTab('manual') // Switch to manual tab after applying
                          }}
                          className="w-full bg-green-600 hover:bg-green-700 text-white text-sm py-2 px-3 rounded font-medium transition-colors"
                        >
                          Use this filter
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
              
              {availablePresets.length === 0 && (
                <div className="text-center text-blue-200 py-12">
                  <div className="text-lg mb-3">All presets removed!</div>
                  <button
                    onClick={() => setRemovedPresets(new Set())}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-sm py-2 px-4 rounded font-medium transition-colors"
                  >
                    Reset All Presets
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          // Normal Image + Controls - Scrollable on Mobile
          <div className="flex-1 flex md:flex-row flex-col min-h-0">
            {/* Main Image + Controls Scrollable Area - Mobile Only */}
            <div className="flex-1 md:flex md:items-center md:justify-center overflow-y-auto md:overflow-hidden touch-pan-y" style={{ WebkitOverflowScrolling: 'touch' }}>
              {/* Image Display */}
              <div className="flex-shrink-0 flex items-center justify-center p-4 bg-black/40 min-h-[40vh] md:min-h-0 md:flex-1">
                {isProcessing ? (
                  <div className="flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mr-2"></div>
                    <span className="text-white text-sm">Processing...</span>
                  </div>
                ) : (
                  <img
                    src={processedImageUrl || image.preview}
                    alt={image.file.name}
                    className="max-w-full max-h-full object-contain"
                    style={{
                      transform: `rotate(${image.rotation || 0}deg)`
                    }}
                  />
                )}
              </div>

              {/* Mobile Controls - Only visible on mobile, scrollable */}
              <div className="md:hidden bg-black/80 border-t border-white/20">
                {/* Action Buttons */}
                <div className="p-3 border-b border-white/20">
                  <div className="flex flex-wrap justify-center gap-2">
                    <button
                      onClick={handleDownload}
                      disabled={!processedImageUrl}
                      className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-3 py-2 rounded text-xs font-medium transition-colors flex items-center gap-1"
                    >
                      <MdDownload className="w-3 h-3" />
                      Save
                    </button>
                    <button
                      onClick={handleShare}
                      disabled={!processedImageUrl || !navigator.share}
                      className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white px-3 py-2 rounded text-xs font-medium transition-colors flex items-center gap-1"
                    >
                      <MdShare className="w-3 h-3" />
                      Share
                    </button>
                    <button
                      onClick={() => onApplyToAll(settings)}
                      className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-2 rounded text-xs font-medium transition-colors flex items-center gap-1"
                    >
                      <MdAutoAwesome className="w-3 h-3" />
                      Apply All
                    </button>
                    <button
                      onClick={() => {
                        setSettings(DEFAULT_SETTINGS)
                        onUpdateSettings(image.id, DEFAULT_SETTINGS)
                      }}
                      className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-2 rounded text-xs font-medium transition-colors flex items-center gap-1"
                    >
                      <MdTune className="w-3 h-3" />
                      Reset
                    </button>
                    <button
                      onClick={() => onRotateImage(image.id)}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded text-xs font-medium transition-colors flex items-center gap-1"
                    >
                      <MdRotateRight className="w-3 h-3" />
                      Rotate
                    </button>
                  </div>
                </div>

                {/* Mobile Content */}
                <div className="p-3">
                  {activeTab === 'presets' && (
                    <div>
                      <h3 className="text-white text-sm font-medium mb-3">Camera Presets</h3>
                      <div className="space-y-2 pb-4">
                        {sortedPresets.map((preset) => (
                          <div
                            key={preset.id}
                            className="flex items-start gap-2 bg-white/5 hover:bg-white/10 rounded border border-white/10 transition-colors"
                          >
                            <button
                              onClick={() => applyPreset(preset)}
                              className="flex-1 text-left p-3 min-w-0"
                            >
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="text-white text-sm font-medium">{preset.name}</span>
                                <span className="text-xs bg-white/10 text-blue-200 px-2 py-0.5 rounded flex-shrink-0">
                                  {preset.category}
                                </span>
                                {favoritePresets.has(preset.id) && (
                                  <MdStar className="w-3 h-3 text-yellow-400 flex-shrink-0" />
                                )}
                              </div>
                              <div className="text-blue-200 text-xs leading-relaxed">{preset.description}</div>
                            </button>
                            {onToggleFavorite && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onToggleFavorite(preset.id)
                                }}
                                className="p-3 hover:bg-white/10 rounded transition-colors flex-shrink-0"
                                title={favoritePresets.has(preset.id) ? 'Remove from favorites' : 'Add to favorites'}
                              >
                                {favoritePresets.has(preset.id) ? (
                                  <MdStar className="w-4 h-4 text-yellow-400" />
                                ) : (
                                  <MdStarBorder className="w-4 h-4 text-gray-400 hover:text-yellow-400" />
                                )}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {activeTab === 'enhance' && (
                    <div>
                      <h3 className="text-white text-sm font-medium mb-3">Noise Reduction & Sharpening (BETA - Could be Slow)</h3>

                      {/* Noise Reduction Section */}
                      <div className="mb-6">
                        <h4 className="text-blue-200 text-sm font-medium mb-3">Noise Reduction (High ISO)</h4>
                        <div className="space-y-4">
                          {[
                            { key: 'noiseReduction' as keyof EditingSettings, label: 'Noise Reduction', min: 0, max: 100 },
                            { key: 'spatialSigma' as keyof EditingSettings, label: 'Spatial Smoothing', min: 1, max: 50 },
                            { key: 'textureSigma' as keyof EditingSettings, label: 'Edge Preservation', min: 1, max: 100 }
                          ].map(({ key, label, min, max }) => (
                            <div key={key}>
                              <div className="flex justify-between items-center mb-2">
                                <label className="text-blue-200 text-sm">{label}</label>
                                <span className="text-white text-sm font-medium w-12 text-right">{settings[key]}</span>
                              </div>
                              <input
                                type="range"
                                min={min}
                                max={max}
                                value={settings[key]}
                                onChange={(e) => updateSetting(key, parseInt(e.target.value))}
                                className="w-full h-2 bg-white/20 rounded appearance-none slider"
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Sharpening Section */}
                      <div className="mb-6">
                        <h4 className="text-blue-200 text-sm font-medium mb-3">Sharpening (Underwater Detail)</h4>
                        <div className="space-y-4">
                          {[
                            { key: 'sharpening' as keyof EditingSettings, label: 'Sharpening Strength', min: 0, max: 200 },
                            { key: 'sharpenRadius' as keyof EditingSettings, label: 'Sharpening Radius', min: 1, max: 50 },
                            { key: 'sharpenThreshold' as keyof EditingSettings, label: 'Sharpening Threshold', min: 0, max: 100 }
                          ].map(({ key, label, min, max }) => (
                            <div key={key}>
                              <div className="flex justify-between items-center mb-2">
                                <label className="text-blue-200 text-sm">{label}</label>
                                <span className="text-white text-sm font-medium w-12 text-right">{settings[key]}</span>
                              </div>
                              <input
                                type="range"
                                min={min}
                                max={max}
                                value={settings[key]}
                                onChange={(e) => updateSetting(key, parseInt(e.target.value))}
                                className="w-full h-2 bg-white/20 rounded appearance-none slider"
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Underwater Photography Presets */}
                      <div className="mb-4">
                        <h4 className="text-blue-200 text-sm font-medium mb-3">Quick Presets</h4>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => {
                              updateSetting('noiseReduction', 0)
                              updateSetting('sharpening', 0)
                            }}
                            className="bg-gray-700 hover:bg-gray-600 text-white text-sm py-2 px-3 rounded transition-colors"
                          >
                            None
                          </button>
                          <button
                            onClick={() => {
                              updateSetting('noiseReduction', 25)
                              updateSetting('spatialSigma', 15)
                              updateSetting('textureSigma', 25)
                              updateSetting('sharpening', 40)
                              updateSetting('sharpenRadius', 10)
                              updateSetting('sharpenThreshold', 15)
                            }}
                            className="bg-green-700 hover:bg-green-600 text-white text-sm py-2 px-3 rounded transition-colors"
                          >
                            Light Enhancement
                          </button>
                          <button
                            onClick={() => {
                              updateSetting('noiseReduction', 40)
                              updateSetting('spatialSigma', 25)
                              updateSetting('textureSigma', 35)
                              updateSetting('sharpening', 70)
                              updateSetting('sharpenRadius', 20)
                              updateSetting('sharpenThreshold', 10)
                            }}
                            className="bg-blue-700 hover:bg-blue-600 text-white text-sm py-2 px-3 rounded transition-colors"
                          >
                            Moderate Enhancement
                          </button>
                          <button
                            onClick={() => {
                              updateSetting('noiseReduction', 60)
                              updateSetting('spatialSigma', 35)
                              updateSetting('textureSigma', 45)
                              updateSetting('sharpening', 100)
                              updateSetting('sharpenRadius', 25)
                              updateSetting('sharpenThreshold', 5)
                            }}
                            className="bg-orange-700 hover:bg-orange-600 text-white text-sm py-2 px-3 rounded transition-colors"
                          >
                            Heavy Enhancement
                          </button>
                        </div>
                      </div>
                      
                      <div className="text-sm text-blue-300 opacity-75 leading-relaxed bg-white/5 p-3 rounded">
                        <p className="mb-2">💡 <strong>Noise Reduction:</strong> Reduces grain from high ISO underwater shots while preserving important edges and details.</p>
                        <p><strong>Sharpening:</strong> Restores underwater detail lost due to water&apos;s optical effects. Use carefully to avoid artifacts.</p>
                      </div>
                    </div>
                  )}
                  
                  {activeTab === 'manual' && (
                    <div>
                      <h3 className="text-white text-sm font-medium mb-3">Manual Controls</h3>

                      {/* Basic Adjustments */}
                      <div className="space-y-4 pb-4">
                        {[
                          { key: 'brightness' as keyof EditingSettings, label: 'Brightness' },
                          { key: 'contrast' as keyof EditingSettings, label: 'Contrast' },
                          { key: 'saturation' as keyof EditingSettings, label: 'Saturation' },
                          { key: 'redBoost' as keyof EditingSettings, label: 'Red Boost', min: -50, max: 100 },
                          { key: 'blueReduction' as keyof EditingSettings, label: 'Blue Reduce', min: -100, max: 50 },
                          { key: 'greenReduction' as keyof EditingSettings, label: 'Green Reduce', min: -100, max: 50 }
                        ].map(({ key, label, min = -100, max = 100 }) => (
                          <div key={key}>
                            <div className="flex justify-between items-center mb-2">
                              <label className="text-blue-200 text-sm">{label}</label>
                              <span className="text-white text-sm font-medium w-12 text-right">{settings[key]}</span>
                            </div>
                            <input
                              type="range"
                              min={min}
                              max={max}
                              value={settings[key]}
                              onChange={(e) => updateSetting(key, parseInt(e.target.value))}
                              className="w-full h-2 bg-white/20 rounded appearance-none slider"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Desktop Controls Panel */}
            <div className="hidden md:flex w-80 bg-black/80 backdrop-blur-sm border-l border-white/20 flex-col">
              {/* Action Buttons */}
              <div className="p-3 border-b border-white/20">
                <div className="flex flex-wrap justify-center gap-1">
                  <button
                    onClick={handleDownload}
                    disabled={!processedImageUrl}
                    className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-2 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1"
                  >
                    <MdDownload className="w-3 h-3" />
                    Save
                  </button>
                  <button
                    onClick={handleShare}
                    disabled={!processedImageUrl || !navigator.share}
                    className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white px-2 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1"
                  >
                    <MdShare className="w-3 h-3" />
                    Share
                  </button>
                  <button
                    onClick={() => onApplyToAll(settings)}
                    className="bg-orange-600 hover:bg-orange-700 text-white px-2 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1"
                  >
                    <MdAutoAwesome className="w-3 h-3" />
                    Apply All
                  </button>
                  <button
                    onClick={() => {
                      setSettings(DEFAULT_SETTINGS)
                      onUpdateSettings(image.id, DEFAULT_SETTINGS)
                    }}
                    className="bg-gray-600 hover:bg-gray-700 text-white px-2 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1"
                  >
                    <MdTune className="w-3 h-3" />
                    Reset
                  </button>
                  <button
                    onClick={() => onRotateImage(image.id)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-2 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1"
                  >
                    <MdRotateRight className="w-3 h-3" />
                    Rotate
                  </button>
                </div>
              </div>

              {/* Desktop Content */}
              <div className="p-3 flex-1 overflow-y-auto">
                {activeTab === 'presets' && (
                  <div className="flex-1 flex flex-col min-h-0">
                    <h3 className="text-white text-sm font-medium mb-2 flex-shrink-0">Camera Presets</h3>
                    <div className="flex-1 overflow-y-auto touch-pan-y" style={{ WebkitOverflowScrolling: 'touch' }}>
                      <div className="space-y-2 pb-2">
                        {sortedPresets.map((preset) => (
                          <div
                            key={preset.id}
                            className="flex items-start gap-1 bg-white/5 hover:bg-white/10 rounded border border-white/10 transition-colors"
                          >
                            <button
                              onClick={() => applyPreset(preset)}
                              className="flex-1 text-left p-1.5 min-w-0"
                            >
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="text-white text-xs font-medium">{preset.name}</span>
                                <span className="text-xs bg-white/10 text-blue-200 px-2 py-0.5 rounded flex-shrink-0">
                                  {preset.category}
                                </span>
                                {favoritePresets.has(preset.id) && (
                                  <MdStar className="w-3 h-3 text-yellow-400 flex-shrink-0" />
                                )}
                              </div>
                              <div className="text-blue-200 text-xs leading-relaxed">{preset.description}</div>
                            </button>
                            {onToggleFavorite && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onToggleFavorite(preset.id)
                                }}
                                className="p-1.5 hover:bg-white/10 rounded transition-colors flex-shrink-0"
                                title={favoritePresets.has(preset.id) ? 'Remove from favorites' : 'Add to favorites'}
                              >
                                {favoritePresets.has(preset.id) ? (
                                  <MdStar className="w-4 h-4 text-yellow-400" />
                                ) : (
                                  <MdStarBorder className="w-4 h-4 text-gray-400 hover:text-yellow-400" />
                                )}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                
                {activeTab === 'enhance' && (
                  <div className="flex-1 overflow-y-auto touch-pan-y" style={{ WebkitOverflowScrolling: 'touch' }}>
                    <h3 className="text-white text-sm font-medium mb-2">Noise Reduction & Sharpening (BETA - Could be Slow)</h3>
                    
                    {/* Noise Reduction Section */}
                    <div className="mb-4">
                      <h4 className="text-blue-200 text-xs font-medium mb-2">Noise Reduction (High ISO)</h4>
                      <div className="space-y-1">
                        {[
                          { key: 'noiseReduction' as keyof EditingSettings, label: 'Noise Reduction', min: 0, max: 100 },
                          { key: 'spatialSigma' as keyof EditingSettings, label: 'Spatial Smoothing', min: 1, max: 50 },
                          { key: 'textureSigma' as keyof EditingSettings, label: 'Edge Preservation', min: 1, max: 100 }
                        ].map(({ key, label, min, max }) => (
                          <div key={key}>
                            <div className="flex justify-between items-center mb-1">
                              <label className="text-blue-200 text-xs">{label}</label>
                              <span className="text-white text-xs w-8 text-right">{settings[key]}</span>
                            </div>
                            <input
                              type="range"
                              min={min}
                              max={max}
                              value={settings[key]}
                              onChange={(e) => updateSetting(key, parseInt(e.target.value))}
                              className="w-full h-1.5 bg-white/20 rounded appearance-none slider"
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Sharpening Section */}
                    <div className="mb-4">
                      <h4 className="text-blue-200 text-xs font-medium mb-2">Sharpening (Underwater Detail)</h4>
                      <div className="space-y-1">
                        {[
                          { key: 'sharpening' as keyof EditingSettings, label: 'Sharpening Strength', min: 0, max: 200 },
                          { key: 'sharpenRadius' as keyof EditingSettings, label: 'Sharpening Radius', min: 1, max: 50 },
                          { key: 'sharpenThreshold' as keyof EditingSettings, label: 'Sharpening Threshold', min: 0, max: 100 }
                        ].map(({ key, label, min, max }) => (
                          <div key={key}>
                            <div className="flex justify-between items-center mb-1">
                              <label className="text-blue-200 text-xs">{label}</label>
                              <span className="text-white text-xs w-8 text-right">{settings[key]}</span>
                            </div>
                            <input
                              type="range"
                              min={min}
                              max={max}
                              value={settings[key]}
                              onChange={(e) => updateSetting(key, parseInt(e.target.value))}
                              className="w-full h-1.5 bg-white/20 rounded appearance-none slider"
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Underwater Photography Presets */}
                    <div className="mb-2">
                      <h4 className="text-blue-200 text-xs font-medium mb-2">Quick Presets</h4>
                      <div className="grid grid-cols-2 gap-1">
                        {(() => {
                          const presets = getUnderwaterEnhancementPresets()
                          const presetConfigs = [
                            { key: 'none', label: 'None', color: 'gray' },
                            { key: 'lightNoise', label: 'Light', color: 'green' },
                            { key: 'moderate', label: 'Moderate', color: 'blue' },
                            { key: 'heavyNoise', label: 'Heavy', color: 'orange' }
                          ]
                          
                          return presetConfigs.map(({ key, label, color }) => (
                            <button
                              key={key}
                              onClick={() => {
                                const preset = presets[key as keyof typeof presets]
                                applyPreset2(preset)
                              }}
                              className={`bg-${color}-700 hover:bg-${color}-600 text-white text-xs py-1 px-2 rounded transition-colors`}
                            >
                              {label}
                            </button>
                          ))
                        })()}
                      </div>
                    </div>
                    
                    {/* Preview Region Controls */}
                    {isPreviewMode && (settings.noiseReduction > 0 || settings.sharpening > 0) && (
                      <div className="mb-3 space-y-2">
                        {/* Show Preview Region Toggle */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={togglePreviewOverlay}
                            className={`flex-1 py-1 px-2 rounded text-xs transition-colors ${
                              showPreviewOverlay 
                                ? 'bg-blue-600 text-white' 
                                : 'bg-gray-600 hover:bg-gray-500 text-gray-200'
                            }`}
                          >
                            {showPreviewOverlay ? '🎯 Hide Region' : '🎯 Show Region'}
                          </button>
                        </div>
                        
                        {/* Apply to Full Image Button */}
                        <button
                          onClick={() => processImage(true)}
                          disabled={isEnhancing}
                          className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white font-medium py-2 px-4 rounded transition-colors"
                        >
                          {isEnhancing ? 'Processing...' : `Apply to Full Image (Est. ${timeEstimate}s)`}
                        </button>
                        <p className="text-xs text-green-300 mt-1 text-center">
                          ✨ Preview shows center region. Click to process entire image.
                        </p>
                      </div>
                    )}

                    <div className="text-xs text-blue-300 opacity-75 leading-relaxed">
                      <p className="mb-1">💡 <strong>Noise Reduction:</strong> Reduces grain from high ISO underwater shots while preserving edges.</p>
                      <p className="mb-2"><strong>Sharpening:</strong> Restores detail lost in water. Use carefully to avoid over-sharpening.</p>
                      {(settings.noiseReduction > 0 || settings.sharpening > 0) && (
                        <div className="text-xs text-blue-300 bg-blue-900/20 border border-blue-500/30 rounded p-2 mt-2">
                          <p className="mb-1">🚀 <strong>Preview Mode:</strong> Fast preview on center region first.</p>
                          <p>⏱️ <strong>Full Image:</strong> Estimated {timeEstimate} seconds for complete processing.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                {activeTab === 'manual' && (
                  <div className="flex-1 overflow-y-auto touch-pan-y" style={{ WebkitOverflowScrolling: 'touch' }}>
                    <h3 className="text-white text-sm font-medium mb-2">Manual</h3>

                    {/* Basic Adjustments */}
                    <div className="space-y-1 pb-2">
                      {[
                        { key: 'brightness' as keyof EditingSettings, label: 'Brightness' },
                        { key: 'contrast' as keyof EditingSettings, label: 'Contrast' },
                        { key: 'saturation' as keyof EditingSettings, label: 'Saturation' },
                        { key: 'redBoost' as keyof EditingSettings, label: 'Red Boost', min: -50, max: 100 },
                        { key: 'blueReduction' as keyof EditingSettings, label: 'Blue Reduce', min: -100, max: 50 },
                        { key: 'greenReduction' as keyof EditingSettings, label: 'Green Reduce', min: -100, max: 50 }
                      ].map(({ key, label, min = -100, max = 100 }) => (
                        <div key={key}>
                          <div className="flex justify-between items-center mb-1">
                            <label className="text-blue-200 text-xs">{label}</label>
                            <span className="text-white text-xs w-8 text-right">{settings[key]}</span>
                          </div>
                          <input
                            type="range"
                            min={min}
                            max={max}
                            value={settings[key]}
                            onChange={(e) => updateSetting(key, parseInt(e.target.value))}
                            className="w-full h-1.5 bg-white/20 rounded appearance-none slider"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
      
      {/* Enhancement Progress Overlay */}
      {isEnhancing && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-black/80 border border-blue-500/30 rounded-lg p-6 max-w-sm mx-4 text-center">
            <div className="mb-4">
              <div className={`w-12 h-12 border-4 ${isCanceling ? 'border-red-500/30 border-t-red-500' : 'border-blue-500/30 border-t-blue-500'} rounded-full ${isCanceling ? '' : 'animate-spin'} mx-auto mb-3`}></div>
              <h3 className="text-white font-medium text-lg mb-2">{isCanceling ? 'Canceling...' : 'Processing Image'}</h3>
              <p className="text-blue-200 text-sm mb-1">{enhancementProgress.stage}</p>
              {!isCanceling && (
                <>
                  <div className="w-full bg-white/20 rounded-full h-2 mb-2">
                    <div 
                      className="bg-blue-500 h-2 rounded-full transition-all duration-300" 
                      style={{ width: `${enhancementProgress.progress}%` }}
                    />
                  </div>
                  <p className="text-blue-300 text-xs">
                    {Math.round(enhancementProgress.progress)}% • {Math.round(timeRemaining)}s remaining
                  </p>
                </>
              )}
            </div>
            <div className={`text-xs ${isCanceling ? 'text-red-300 bg-red-900/20 border-red-500/30' : 'text-yellow-300 bg-yellow-900/20 border-yellow-500/30'} border rounded p-3 mb-3`}>
              <p className="mb-1">{isCanceling ? '🛑' : '⚠️'} <strong>{isCanceling ? 'Canceling...' : 'Please wait...'}</strong></p>
              <p>{isCanceling ? 'Stopping processing...' : (isPreviewMode ? 'Processing preview region...' : 'Processing full image...')}</p>
            </div>
            <button
              onClick={cancelEnhancement}
              disabled={isCanceling}
              className={`w-full font-medium py-2 px-4 rounded transition-colors ${
                isCanceling 
                  ? 'bg-gray-600 text-gray-300 cursor-not-allowed' 
                  : 'bg-red-600 hover:bg-red-700 text-white'
              }`}
            >
              {isCanceling ? 'Canceling...' : 'Cancel Processing'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}