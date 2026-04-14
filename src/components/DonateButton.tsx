'use client'

import React, { useState, useEffect } from 'react'
import { DiCoffeescript } from 'react-icons/di'
import DonateModal from './DonateModal'

interface DonateButtonProps {
  className?: string
}

export default function DonateButton({ className = '' }: DonateButtonProps) {
  const [hasDonated, setHasDonated] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    // Check if user has already donated
    const donatedStatus = localStorage.getItem('diveblendr_donated')
    if (donatedStatus === 'true') {
      setHasDonated(true)
    }
  }, [])

  const handleDonate = async () => {
    setIsLoading(true)
    
    try {
      // Check if user is offline
      if (!navigator.onLine) {
        alert('Donations require an internet connection. Please connect to the internet and try again. DiveBlendr works offline, but donations need to go through Stripe!')
        setIsLoading(false)
        return
      }
      
      // Single payment link that allows custom amounts
      // Create this in Stripe dashboard with "Customer chooses price" option
      const paymentUrl = process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK || 'https://donate.stripe.com/fZu3cx2SybaOaVN8tz18c00'
      
      // Add success URL parameter to redirect back to thank you page
      const successUrl = encodeURIComponent(`${window.location.origin}/thank-you?session_id=stripe_payment`)
      const fullUrl = `${paymentUrl}?success_url=${successUrl}`
      
      // Redirect to Stripe Payment Link
      window.location.href = fullUrl
    } catch (error) {
      console.error('Error processing donation:', error)
      alert('Sorry, there was an error processing your donation. Please check your internet connection and try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleButtonClick = () => {
    if (!hasDonated) {
      setShowModal(true)
    }
  }

  if (hasDonated) {
    return (
      <button
        className={`w-12 h-12 flex items-center justify-center rounded-full bg-teal-600 text-white cursor-default ${className}`}
        title="Thank you for your donation!"
        disabled
      >
        <DiCoffeescript className="w-6 h-6" />
      </button>
    )
  }

  return (
    <>
      <button
        onClick={handleButtonClick}
        disabled={isLoading}
        className={`w-12 h-12 flex items-center justify-center rounded-full bg-teal-600 text-white hover:bg-teal-700 transition-colors duration-200 ${
          isLoading ? 'opacity-50 cursor-not-allowed' : ''
        } ${className}`}
        title="Support DiveBlendr Development"
      >
        <DiCoffeescript className="w-6 h-6" />
      </button>

      <DonateModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onDonate={() => handleDonate()}
        isLoading={isLoading}
      />
    </>
  )
}