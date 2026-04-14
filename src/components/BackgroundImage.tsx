'use client'

import { useEffect, useState } from 'react'

interface BackgroundImageProps {
  onImageLoaded?: () => void
}

export default function BackgroundImage({ onImageLoaded }: BackgroundImageProps) {
  const [backgroundImage, setBackgroundImage] = useState('')
  const [imageLoaded, setImageLoaded] = useState(false)

  useEffect(() => {
    const photos = [
      '/photos/photo1.jpg',
      '/photos/photo2.jpg',
      '/photos/photo3.jpg',
      '/photos/photo4.jpg',
      '/photos/photo5.jpg',
      '/photos/photo6.jpg',
      '/photos/photo7.jpg',
      '/photos/photo8.jpg',
      '/photos/photo9.jpg'
    ]
    const randomPhoto = photos[Math.floor(Math.random() * photos.length)]
    
    // Preload the image
    const img = new Image()
    img.onload = () => {
      setImageLoaded(true)
      onImageLoaded?.()
    }
    img.src = randomPhoto
    setBackgroundImage(randomPhoto)
    
     
  }, [])

  if (!backgroundImage || !imageLoaded) return null

  return (
    <div 
      className="fixed inset-0 w-screen h-screen bg-cover bg-center opacity-15"
      style={{backgroundImage: `url(${backgroundImage})`}}
    />
  )
}