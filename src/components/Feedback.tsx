'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import emailjs from '@emailjs/browser'
// import { useGoogleReCaptcha } from 'react-google-recaptcha-v3'

interface FeedbackProps {
  className?: string
  onFeedbackStateChange?: (isOpen: boolean) => void
}

export default function Feedback({ className = '', onFeedbackStateChange }: FeedbackProps) {
  // const { executeRecaptcha } = useGoogleReCaptcha()
  const [showFeedback, setShowFeedback] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)
  const [showFeedbackForm, setShowFeedbackForm] = useState(false)
  const [showAboutMe, setShowAboutMe] = useState(false)
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [feedbackEmail, setFeedbackEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle')

  useEffect(() => {
    onFeedbackStateChange?.(showFeedback)
  }, [showFeedback, onFeedbackStateChange])

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!feedbackMessage.trim()) {
      alert('Please enter your feedback message.')
      return
    }

    // if (!executeRecaptcha) {
    //   alert('reCAPTCHA is not available. Please refresh the page and try again.')
    //   return
    // }

    setIsSubmitting(true)
    setSubmitStatus('idle')

    try {
      // Execute reCAPTCHA v3 verification
      // const recaptchaToken = await executeRecaptcha('feedback_submit')
      
      // if (!recaptchaToken) {
      //   throw new Error('reCAPTCHA verification failed')
      // }
      // EmailJS configuration
      await emailjs.send(
        process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID || '',
        process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID || '',
        {
          message: feedbackMessage,
          reply_to: feedbackEmail || 'no-reply@example.com',
          from_name: feedbackEmail || 'Anonymous User',
          to_email: process.env.NEXT_PUBLIC_EMAILJS_RECIPIENT || ''
        },
        process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY || ''
      )

      setSubmitStatus('success')
      setFeedbackMessage('')
      setFeedbackEmail('')
    } catch (error) {
      console.error('Failed to send feedback:', error)
      // if (error instanceof Error && error.message.includes('reCAPTCHA')) {
      //   setSubmitStatus('error')
      //   alert('Security verification failed. Please refresh the page and try again.')
      // } else {
        setSubmitStatus('error')
      // }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      {/* Feedback Button - Simplified */}
      <button
        onClick={() => setShowFeedback(true)}
        className={`${className}`}
        aria-label="Open feedback"
        title="Feedback & About"
      >
        <span className="text-xl font-bold">?</span>
      </button>

      {/* Feedback Modal - Rendered as Portal */}
      {showFeedback && typeof window !== 'undefined' && createPortal(
        <div 
          className="fixed inset-0 bg-black bg-opacity-75 z-[9999] flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowFeedback(false)
            }
          }}
        >
          <div className="bg-gray-800 border border-gray-600 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-auto">
            {/* Header */}
            <div className="flex justify-between items-center p-4 sm:p-6 border-b border-gray-600">
              <h2 className="text-xl sm:text-2xl font-bold text-yellow-400">About DiveBlendr</h2>
              <button
                onClick={() => setShowFeedback(false)}
                className="min-w-[44px] min-h-[44px] bg-gray-600 hover:bg-gray-500 text-white rounded-full flex items-center justify-center transition-colors text-lg font-bold focus:ring-2 focus:ring-yellow-400 focus:outline-none"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            
            {/* Content */}
            <div className="p-4 sm:p-6 space-y-4 text-gray-200 leading-relaxed">
              <div className="relative">
                <div className="float-left mr-4 mb-2 w-32 h-32 rounded-full border-2 border-gray-600 shadow-lg overflow-hidden bg-gray-700">
                  <Image 
                    src="/photos/me.jpg" 
                    alt="Technical Diver" 
                    width={128} 
                    height={128}
                    className="w-full h-full object-cover"
                    style={{objectPosition: '60% 70%'}}
                  />
                </div>
                <p>
                  Diveblendr is very much a passion project and is unlikely to cover all facets of the complex sport of technical diving. 
                  It was born out of the need for tools that surpass a general calculator AND don&apos;t require you to purchase subscriptions to the &quot;best in class&quot; software.
                </p>
                
                <p className="pt-2">
                  While the app may expand to dive planning and other tools, it is only built by one avid coder / diver.
                </p>
                
                <p className="pt-2">
                  With instructor preferences and changing best practices, this tool aims to show you the math and make recommendations. 
                  These don&apos;t substitute proper knowledge, buddy checks and diving within your limits.
                </p>
                
                <p className="pt-2">
                  If there is enough constructive feedback, apps for both android and iOS can be developed. Since the app is (and will always be) free, 
                  the cost to provide it through the App stores is limiting unless there is demonstrated demand for the app.
                </p>
              </div>
              
              {/* About Me Section */}
              <div className="border-t border-gray-600 pt-4">
                <button
                  onClick={() => setShowAboutMe(!showAboutMe)}
                  className="flex items-center justify-between w-full min-h-[44px] text-left font-semibold text-yellow-400 hover:text-yellow-300 transition-colors focus:ring-2 focus:ring-yellow-400 focus:outline-none rounded px-2 py-1"
                  aria-expanded={showAboutMe}
                  aria-controls="about-me-content"
                >
                  <span>👤 About Me</span>
                  <span className={`transform transition-transform ${showAboutMe ? 'rotate-180' : ''}`}>
                    ▼
                  </span>
                </button>
                
                {showAboutMe && (
                  <div className="mt-4 space-y-4">
                    <div className="bg-gray-700 p-4 rounded border-l-4 border-amber-400">
                      <p className="text-gray-200">
                        I have always loved diving but work prevented me from taking a serious approach to diving until around 2022.  Since then I took time off work, finally got my divemaster and fell into the world of tech diving....and then rebreather.  I dive the JJCCR and have MOD 2 certification.  This means that while I am pretty good with up to MOD 2 theory and execution, my knowledge of MOD 3 and beyond may need some help in the math on this site.

                        I love math, and by extension coding.  Therefore the theory and ability to transform the need for math into cogent tools was all too obvious.  Initially I built Diveblendr for my wife and I to use on our own computers, but then realized how in need many of these tools were for everyone else.  So hopefully it is beneficial for all who find themselves here.
                      </p>
                      
                      <div className="mt-4 pt-4 border-t border-gray-600">
                        <table className="w-full text-sm">
                          <tbody>
                            <tr className="border-b border-gray-600">
                              <td className="py-2 pr-4 text-gray-400 font-medium">Rebreather:</td>
                              <td className="py-2 text-gray-200">JJ-CCR</td>
                            </tr>
                            <tr className="border-b border-gray-600">
                              <td className="py-2 pr-4 text-gray-400 font-medium">Certification:</td>
                              <td className="py-2 text-gray-200">TDI MOD 2 - Mixed Gas Air Diluent</td>
                            </tr>
                            <tr>
                              <td className="py-2 pr-4 text-gray-400 font-medium">First Dive:</td>
                              <td className="py-2 text-gray-200">1999</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              <p className="font-semibold text-yellow-200 bg-gray-700 p-4 rounded border-l-4 border-yellow-400">
                <strong>If you have feedback, we&apos;d love to hear from you below. 
                Your feedback will help make this a better, and FREE resource for all. This will also make technical diving SAFER with tools to educate others and validate the proper mixes.</strong>
              </p>
              
              {/* Collapsible Feedback Form */}
              <div className="border-t border-gray-600 pt-4">
                <button
                  onClick={() => setShowFeedbackForm(!showFeedbackForm)}
                  className="flex items-center justify-between w-full min-h-[44px] text-left font-semibold text-yellow-400 hover:text-yellow-300 transition-colors focus:ring-2 focus:ring-yellow-400 focus:outline-none rounded px-2 py-1"
                  aria-expanded={showFeedbackForm}
                  aria-controls="feedback-form-content"
                >
                  <span>📝 Leave Feedback Here</span>
                  <span className={`transform transition-transform ${showFeedbackForm ? 'rotate-180' : ''}`}>
                    ▼
                  </span>
                </button>
                
                {showFeedbackForm && (
                  <div className="mt-4 space-y-4">
                    <form onSubmit={handleSubmitFeedback} className="space-y-4">
                      <div>
                        <label htmlFor="feedback-message" className="block text-sm font-medium text-gray-300 mb-2">
                          Your feedback *
                        </label>
                        <textarea
                          id="feedback-message"
                          value={feedbackMessage}
                          onChange={(e) => setFeedbackMessage(e.target.value)}
                          placeholder="Please share your thoughts, suggestions, or report any issues...please be very specific about blends, guidance, or warnings that need to be changed!"
                          className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-gray-200 placeholder-gray-500 focus:border-yellow-400 focus:outline-none resize-vertical min-h-[100px]"
                          required
                        />
                      </div>
                      
                      <div>
                        <label htmlFor="feedback-email" className="block text-sm font-medium text-gray-300 mb-2">
                          Your email (optional)
                        </label>
                        <input
                          type="email"
                          id="feedback-email"
                          value={feedbackEmail}
                          onChange={(e) => setFeedbackEmail(e.target.value)}
                          placeholder="your@email.com (only if you want a response)"
                          className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-gray-200 placeholder-gray-500 focus:border-yellow-400 focus:outline-none"
                        />
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <button
                          type="submit"
                          disabled={isSubmitting || !feedbackMessage.trim()}
                          className={`min-h-[44px] px-6 py-2 rounded font-semibold transition-colors focus:ring-2 focus:ring-yellow-300 focus:outline-none ${
                            isSubmitting || !feedbackMessage.trim()
                              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                              : 'bg-yellow-500 text-gray-900 hover:bg-yellow-400 cursor-pointer'
                          }`}
                        >
                          {isSubmitting ? 'Sending...' : 'Send Feedback'}
                        </button>
                        
                        {submitStatus === 'success' && (
                          <span className="text-green-400 text-sm">✅ Feedback sent successfully!</span>
                        )}
                        {submitStatus === 'error' && (
                          <span className="text-red-400 text-sm">❌ Failed to send feedback. Please try again.</span>
                        )}
                      </div>
                    </form>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}