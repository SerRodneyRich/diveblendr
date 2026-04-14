'use client'

import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { DiCoffeescript } from 'react-icons/di'
import { FaTimes } from 'react-icons/fa'
import { GiScubaTanks } from 'react-icons/gi'

interface DonateModalProps {
  isOpen: boolean
  onClose: () => void
  onDonate: () => void
  isLoading: boolean
}

export default function DonateModal({ isOpen, onClose, onDonate, isLoading }: DonateModalProps) {
  if (!isOpen || typeof document === 'undefined') return null

  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine

  const handleDonate = () => {
    onDonate()
  }

  const modalContent = (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-teal-600 rounded-full flex items-center justify-center">
                <DiCoffeescript className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Support DiveBlendr</h2>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <FaTimes className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="space-y-6">
            <div className="text-center">
              <GiScubaTanks className="w-16 h-16 text-teal-600 mx-auto mb-4" />
              <p className="text-gray-700 leading-relaxed">
                DiveBlendr is entirely a <strong>passion project</strong>, and thankfully doesn&apos;t cost much to host or run. 
                But coffee does help fuel the coding... or Sofnolime for CCR diving! 🤿
              </p>
            </div>

            <div className="bg-teal-50 rounded-xl p-4">
              <p className="text-teal-800 text-sm text-center">
                <strong>There is no expectation of donation.</strong> This button is simply here for those 
                who are compelled and like what I&apos;m building.
              </p>
            </div>

            <div className="bg-blue-50 rounded-xl p-4">
              <p className="text-blue-800 text-sm text-center">
                You&apos;ll be taken to Stripe where you can <strong>choose your own amount</strong> - 
                from a coffee ☕ to a case of Sofnolime 📦, whatever feels right!
              </p>
            </div>

            {isOffline && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                <p className="text-orange-800 text-sm text-center">
                  <strong>⚠️ You&apos;re currently offline.</strong> Donations require an internet connection to process through Stripe. DiveBlendr works great offline, but donations need connectivity!
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex space-x-3">
              <button
                onClick={onClose}
                className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Maybe Later
              </button>
              <button
                onClick={handleDonate}
                disabled={isLoading || isOffline}
                className={`flex-1 px-6 py-3 bg-teal-600 text-white rounded-lg font-semibold transition-colors flex items-center justify-center space-x-2 ${
                  isLoading || isOffline
                    ? 'opacity-50 cursor-not-allowed' 
                    : 'hover:bg-teal-700'
                }`}
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span>Processing...</span>
                  </>
                ) : isOffline ? (
                  <>
                    <DiCoffeescript className="w-5 h-5" />
                    <span>Offline - Connect to Donate</span>
                  </>
                ) : (
                  <>
                    <DiCoffeescript className="w-5 h-5" />
                    <span>Support Development</span>
                  </>
                )}
              </button>
            </div>

            <p className="text-xs text-gray-500 text-center">
              Secure payment processing by Stripe. You&apos;ll be redirected to complete your donation.
            </p>
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}