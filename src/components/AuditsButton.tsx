'use client'

import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import AuditsModal from './AuditsModal'
import { HiShieldCheck } from 'react-icons/hi'

interface AuditsButtonProps {
  className?: string;
}

export const AuditsButton: React.FC<AuditsButtonProps> = ({ className }) => {
  const [isModalOpen, setIsModalOpen] = useState(false)

  return (
    <>
      {/* Audits Button - Simplified */}
      <button
        onClick={() => setIsModalOpen(true)}
        className={`${className}`}
        aria-label="View audit reports"
        title="Security & Accessibility Audits"
      >
        <HiShieldCheck className="w-6 h-6" />
      </button>
      
      {/* Audits Modal - Rendered as Portal */}
      {isModalOpen && typeof window !== 'undefined' && createPortal(
        <AuditsModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />,
        document.body
      )}
    </>
  )
}