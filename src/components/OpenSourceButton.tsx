'use client'

import React, { useState } from 'react'
import { FaGithub, FaCodeBranch, FaBug, FaComments } from 'react-icons/fa'
import { HiOutlineCode } from 'react-icons/hi'
import { Banner, Button, Card, Modal } from '@/components/ui'

const REPO = 'https://github.com/SerRodneyRich/Diveblendr'

interface OpenSourceButtonProps {
  className?: string
  /** If true, renders no button — the modal is controlled externally. */
  forceOpen?: boolean
  onClose?: () => void
}

function ContributeRow({
  icon,
  accent,
  title,
  children,
}: {
  icon: React.ReactNode
  accent: string
  title: string
  children: React.ReactNode
}) {
  return (
    <Card padding="sm" className="flex gap-3">
      <span aria-hidden="true" className={`mt-0.5 shrink-0 ${accent}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-text">{title}</p>
        <div className="mt-1 text-sm text-text-muted">{children}</div>
      </div>
    </Card>
  )
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent underline underline-offset-2 hover:text-accent-strong"
    >
      {children}
    </a>
  )
}

export default function OpenSourceButton({
  className = '',
  forceOpen,
  onClose,
}: OpenSourceButtonProps) {
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
          className={className}
          aria-label="About DiveBlendr and how to contribute"
          title="Open source"
        >
          <FaGithub className="h-6 w-6" />
        </button>
      )}

      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title="DiveBlendr is open source"
        size="lg"
        footer={
          <Button
            variant="primary"
            leadingIcon={<FaGithub className="h-4 w-4" />}
            onClick={() => window.open(REPO, '_blank', 'noopener,noreferrer')}
          >
            View repository
          </Button>
        }
      >
        <div className="space-y-5 text-sm leading-relaxed text-text-muted">
          <p>
            Every calculation, every safety check and every line of code is publicly available
            for review, improvement and contribution. Technical diving deserves transparent,
            community-verified tools.
          </p>

          <Card padding="sm">
            <p className="text-xs text-text-subtle">Repository</p>
            <p className="mt-0.5 break-all font-mono text-sm text-accent">
              github.com/SerRodneyRich/Diveblendr
            </p>
          </Card>

          {/* §4c: owner-requested provenance note, mirroring NOTICE.md. */}
          <section>
            <h3 className="mb-1.5 text-h4 font-semibold text-text">
              Built with humans and AI
            </h3>
            <p>
              DiveBlendr is written by its maintainer — a JJ-CCR / TDI MOD 2 technical diver —
              together with Anthropic&apos;s Claude. That is stated plainly because divers
              deserve to know the provenance of a tool they plan life-support gas with.
            </p>
            <p className="mt-2">
              Provenance is not a substitute for verification in either direction: human-written
              dive software has shipped fatal errors, and so can AI-assisted software. What makes
              a calculation here trustworthy is that it is <strong>checkable</strong> — every
              formula cites a published standard, every calculation module is unit-tested against
              hand-derived values, and all of it is in the repository for anyone to audit.
            </p>
          </section>

          <section>
            <h3 className="mb-2 flex items-center gap-2 text-h4 font-semibold text-text">
              <HiOutlineCode aria-hidden="true" className="h-4 w-4" />
              How to contribute
            </h3>
            <div className="space-y-2">
              <ContributeRow
                icon={<FaBug className="h-4 w-4" />}
                accent="text-info"
                title="Report an issue"
              >
                Found a calculation error, a UX problem or a bug? Open an{' '}
                <ExternalLink href={`${REPO}/issues`}>issue on GitHub</ExternalLink>. Describe
                what you expected versus what happened — screenshots and dive scenarios help.
              </ContributeRow>

              <ContributeRow
                icon={<FaCodeBranch className="h-4 w-4" />}
                accent="text-success"
                title="Submit a pull request"
              >
                Fork the repo, branch, commit, push, then open a pull request describing what
                you changed and why. Pull requests touching gas calculations must cite the
                diving standard or physics equation used.
              </ContributeRow>

              <ContributeRow
                icon={<FaComments className="h-4 w-4" />}
                accent="text-he"
                title="Discussions and ideas"
              >
                Have a suggestion that isn&apos;t quite a bug? Use the{' '}
                <ExternalLink href={`${REPO}/discussions`}>discussions tab</ExternalLink> to
                propose new tools or ask about the math.
              </ContributeRow>
            </div>
          </section>

          <Banner severity="warning" title="Safety note">
            All gas calculation changes must be reviewed carefully and cited against accepted
            diving standards (NOAA, TDI, IANTD, PADI). Conservative rounding — O₂ down, He up —
            must be preserved.
          </Banner>
        </div>
      </Modal>
    </>
  )
}
