'use client'

import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { FaGithub, FaCodeBranch, FaBug, FaComments } from 'react-icons/fa'
import { HiOutlineCode } from 'react-icons/hi'

interface OpenSourceButtonProps {
  className?: string
  /** If true, renders no button — modal is controlled externally via forceOpen */
  forceOpen?: boolean
  onClose?: () => void
}

export default function OpenSourceButton({ className = '', forceOpen, onClose }: OpenSourceButtonProps) {
  const [showModal, setShowModal] = useState(false)
  const isOpen = forceOpen ?? showModal

  const handleClose = () => {
    setShowModal(false)
    onClose?.()
  }

  return (
    <>
      {!forceOpen && (
        <button
          onClick={() => setShowModal(true)}
          className={`${className}`}
          aria-label="Open Source Info"
          title="Open Source"
        >
          <FaGithub className="h-6 w-6" />
        </button>
      )}

      {isOpen && typeof window !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 bg-black bg-opacity-75 z-[9999] flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose()
          }}
        >
          <div className="bg-gray-800 border border-gray-600 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-auto">
            {/* Header */}
            <div className="flex justify-between items-center p-4 sm:p-6 border-b border-gray-600">
              <div className="flex items-center gap-3">
                <FaGithub className="h-7 w-7 text-yellow-400" />
                <h2 className="text-xl sm:text-2xl font-bold text-yellow-400">DiveBlendr is Open Source</h2>
              </div>
              <button
                onClick={handleClose}
                className="min-w-[44px] min-h-[44px] bg-gray-600 hover:bg-gray-500 text-white rounded-full flex items-center justify-center transition-colors text-lg font-bold focus:ring-2 focus:ring-yellow-400 focus:outline-none"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div className="p-4 sm:p-6 space-y-5 text-gray-200 leading-relaxed">

              {/* Intro */}
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-20 h-20 rounded-full border-2 border-gray-600 shadow-lg overflow-hidden bg-gray-700">
                  <img
                    src="/photos/me.jpg"
                    alt="Technical Diver"
                    className="w-full h-full object-cover"
                    style={{ objectPosition: '60% 70%' }}
                  />
                </div>
                <div>
                  <p>
                    DiveBlendr is now fully open source! Every calculation, every safety check, every line of code
                    is publicly available for review, improvement, and contribution. Technical diving deserves
                    transparent, community-verified tools.
                  </p>
                  <p className="mt-2 text-gray-400 text-sm">
                    Built by a technical diver (JJ-CCR, TDI MOD 2), for technical divers. The math is open — if
                    you see something wrong, you can fix it.
                  </p>
                </div>
              </div>

              {/* Repo link */}
              <div className="bg-gray-900 rounded-lg p-4 border border-gray-600 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-gray-400 mb-1">GitHub Repository</p>
                  <p className="font-mono text-yellow-300 text-sm break-all">github.com/SerRodneyRich/Diveblendr</p>
                </div>
                <a
                  href="https://github.com/SerRodneyRich/Diveblendr"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-gray-900 font-semibold rounded-lg transition-colors text-sm"
                >
                  <FaGithub className="w-4 h-4" />
                  View Repo
                </a>
              </div>

              {/* How to contribute */}
              <div>
                <h3 className="text-yellow-400 font-semibold text-base mb-3 flex items-center gap-2">
                  <HiOutlineCode className="w-5 h-5" />
                  How to Contribute
                </h3>
                <div className="space-y-3">

                  <div className="bg-gray-700 rounded-lg p-4 border-l-4 border-blue-400">
                    <div className="flex items-start gap-3">
                      <FaBug className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-blue-300">Report Issues</p>
                        <p className="text-sm text-gray-300 mt-1">
                          Found a calculation error, a UX problem, or a bug? Open an{' '}
                          <a
                            href="https://github.com/SerRodneyRich/Diveblendr/issues"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-yellow-400 hover:text-yellow-300 underline"
                          >
                            Issue on GitHub
                          </a>. Describe what you expected vs. what happened — screenshots and dive scenarios help a lot.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-700 rounded-lg p-4 border-l-4 border-green-400">
                    <div className="flex items-start gap-3">
                      <FaCodeBranch className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-green-300">Submit a Pull Request</p>
                        <p className="text-sm text-gray-300 mt-1">
                          Want to fix something or add a feature? Here&apos;s the basic flow:
                        </p>
                        <ol className="text-sm text-gray-300 mt-2 space-y-1 list-decimal list-inside">
                          <li><strong>Fork</strong> the repo — creates your own copy on GitHub</li>
                          <li><strong>Clone</strong> your fork locally and create a new branch (<code className="bg-gray-900 px-1 rounded text-yellow-300">git checkout -b my-fix</code>)</li>
                          <li><strong>Make your changes</strong>, then commit (<code className="bg-gray-900 px-1 rounded text-yellow-300">git commit -m &quot;fix: description&quot;</code>)</li>
                          <li><strong>Push</strong> your branch (<code className="bg-gray-900 px-1 rounded text-yellow-300">git push origin my-fix</code>)</li>
                          <li>Open a <strong>Pull Request</strong> from your fork back to the main repo — describe what you changed and why</li>
                        </ol>
                        <p className="text-sm text-gray-400 mt-2">
                          PRs for gas calculations must include references to the diving standards or physics equations used.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-700 rounded-lg p-4 border-l-4 border-purple-400">
                    <div className="flex items-start gap-3">
                      <FaComments className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-purple-300">Discussions & Ideas</p>
                        <p className="text-sm text-gray-300 mt-1">
                          Have a suggestion that&apos;s not quite a bug? Use the{' '}
                          <a
                            href="https://github.com/SerRodneyRich/Diveblendr/discussions"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-yellow-400 hover:text-yellow-300 underline"
                          >
                            Discussions tab
                          </a>{' '}
                          to propose new tools, ask about the math, or share your dive stories.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Safety note */}
              <div className="bg-yellow-900/40 border border-yellow-600/50 rounded-lg p-4 text-sm">
                <p className="text-yellow-200">
                  <strong>Safety note:</strong> All gas calculation changes must be reviewed carefully and
                  cited against accepted diving standards (NOAA, TDI, IANTD, PADI). Conservative rounding
                  (O₂ rounds down, He rounds up) must be preserved.
                </p>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
