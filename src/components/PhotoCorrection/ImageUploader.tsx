'use client'

import { useCallback, useState } from 'react'
import { processMultipleImages, formatCompressionStats, type CompressionResult } from '@/utils/imageCompression'

interface ImageUploaderProps {
  onImagesSelected: (files: File[]) => void
  maxFiles?: number
  maxSize?: number // in MB
  fillHeight?: boolean
}

export default function ImageUploader({ 
  onImagesSelected, 
  maxFiles = 10, 
  maxSize = 500, // Increased to 500MB to handle large RAW files
  fillHeight = false
}: ImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isCompressing, setIsCompressing] = useState(false)
  const [compressionStats, setCompressionStats] = useState<string[]>([])
  const [showCompressionStats, setShowCompressionStats] = useState(false)

  const validateFiles = useCallback((files: FileList) => {
    const validFiles: File[] = []
    const errors: string[] = []

    Array.from(files).forEach(file => {
      const fileName = file.name.toLowerCase()
      
      // Check for GPR files first and provide helpful guidance
      if (fileName.endsWith('.gpr')) {
        errors.push(`${file.name} is a GoPro RAW file. Please convert to JPEG or PNG first using Adobe DNG Converter (free) or similar tools. Browser-based editing of RAW files is not yet supported.`)
        return
      }

      // Check file size (convert MB to bytes)
      if (file.size > maxSize * 1024 * 1024) {
        errors.push(`${file.name} is larger than ${maxSize}MB`)
        return
      }

      // Check supported formats
      const supportedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']
      const supportedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.heic']
      
      const hasValidType = supportedTypes.includes(file.type)
      const hasValidExtension = supportedExtensions.some(ext => fileName.endsWith(ext))
      
      // Accept files that either have valid MIME type OR valid extension
      if (!hasValidType && !hasValidExtension) {
        errors.push(`${file.name} format not supported. Use JPG, PNG, WebP, or HEIC`)
        return
      }
      
      // For non-image MIME types, only allow if it's a recognized extension
      if (!file.type.startsWith('image/') && !hasValidExtension) {
        errors.push(`${file.name} is not a supported image file`)
        return
      }

      validFiles.push(file)
    })

    // Check max files limit
    if (validFiles.length > maxFiles) {
      errors.push(`Maximum ${maxFiles} files allowed`)
      return { validFiles: validFiles.slice(0, maxFiles), errors }
    }

    return { validFiles, errors }
  }, [maxFiles, maxSize])

  const handleFiles = useCallback(async (files: FileList) => {
    const { validFiles, errors } = validateFiles(files)
    
    if (errors.length > 0) {
      setError(errors.join(', '))
      setTimeout(() => setError(null), 5000) // Clear error after 5 seconds
    } else {
      setError(null)
    }

    if (validFiles.length > 0) {
      setIsCompressing(true)
      setCompressionStats([])
      
      try {
        const { processedFiles, compressionStats } = await processMultipleImages(validFiles)
        
        // Collect compression statistics for display
        const statsMessages: string[] = []
        compressionStats.forEach((stat, index) => {
          if (stat) {
            const filename = validFiles[index].name
            const statsText = formatCompressionStats(stat)
            statsMessages.push(`${filename}: ${statsText}`)
          }
        })
        
        if (statsMessages.length > 0) {
          setCompressionStats(statsMessages)
          setShowCompressionStats(true)
          // Auto-hide compression stats after 8 seconds
          setTimeout(() => setShowCompressionStats(false), 8000)
        }
        
        onImagesSelected(processedFiles)
      } catch (compressionError) {
        console.error('Compression failed:', compressionError)
        // Fall back to original files if compression fails
        onImagesSelected(validFiles)
        setError('Image compression failed, using original files')
        setTimeout(() => setError(null), 5000)
      } finally {
        setIsCompressing(false)
      }
    }
  }, [validateFiles, onImagesSelected])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (!isCompressing) {
      setIsDragging(true)
    }
  }, [isCompressing])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    
    if (!isCompressing) {
      const files = e.dataTransfer.files
      if (files.length > 0) {
        handleFiles(files)
      }
    }
  }, [handleFiles, isCompressing])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      handleFiles(files)
    }
    // Clear the input so the same file can be selected again
    e.target.value = ''
  }, [handleFiles])

  const handleCameraCapture = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      handleFiles(files)
    }
    e.target.value = ''
  }, [handleFiles])

  return (
    <div 
      className={`border border-dashed rounded-lg p-3 text-center transition-all duration-200 mb-4 ${
        fillHeight ? 'lg:h-full lg:flex lg:flex-col lg:justify-center' : ''
      } ${
        isDragging 
          ? 'border-blue-400 bg-blue-500/10' 
          : error 
            ? 'border-red-400 bg-red-500/10'
            : 'border-white/40 hover:border-white/60'
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="text-white/80 mb-2">
        <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
        </svg>
      </div>

      {error && (
        <div className="bg-red-500/20 border border-red-400 rounded p-1 mb-2 text-red-200 text-xs">
          {error}
        </div>
      )}

      {isCompressing && (
        <div className="bg-blue-500/20 border border-blue-400 rounded p-2 mb-2 text-blue-200 text-xs">
          <div className="flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
            Optimizing images for faster editing...
          </div>
        </div>
      )}

      {showCompressionStats && compressionStats.length > 0 && (
        <div className="bg-green-500/20 border border-green-400 rounded p-2 mb-2 text-green-200 text-xs">
          <div className="font-medium mb-1">📸 Images automatically optimized:</div>
          {compressionStats.map((stat, index) => (
            <div key={index} className="text-xs opacity-90">
              {stat}
            </div>
          ))}
          <button 
            onClick={() => setShowCompressionStats(false)}
            className="mt-1 text-xs text-green-300 hover:text-green-100 underline"
          >
            Hide
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2 justify-center">
        {/* File Browser Button */}
        <label className={`px-3 py-1 rounded font-medium transition-colors text-xs ${
          isCompressing 
            ? 'bg-gray-600 text-gray-300 cursor-not-allowed' 
            : 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
        }`}>
          {isCompressing ? 'Processing...' : 'Add Photos'}
          <input
            type="file"
            multiple
            accept="image/*"
            onChange={handleFileInput}
            className="hidden"
            disabled={isCompressing}
          />
        </label>

        {/* Camera Capture Button (Mobile) */}
        <label className={`px-3 py-1 rounded font-medium transition-colors sm:hidden text-xs ${
          isCompressing 
            ? 'bg-gray-600 text-gray-300 cursor-not-allowed' 
            : 'bg-green-600 hover:bg-green-700 text-white cursor-pointer'
        }`}>
          {isCompressing ? 'Processing...' : 'Camera'}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleCameraCapture}
            className="hidden"
            disabled={isCompressing}
          />
        </label>
      </div>

      <p className="text-xs text-blue-200 mt-1 opacity-75">
        JPG, PNG, WebP, HEIC • Max {maxSize}MB
      </p>
    </div>
  )
}