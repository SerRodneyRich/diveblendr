'use client'

import { useEffect, useRef } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

interface MathJaxProps {
  content: string
}

// Render all $$...$$ and $...$ delimiters in a DOM element using KaTeX
function renderMath(el: HTMLElement) {
  // Process display math $$...$$ first, then inline $...$
  const delimiters: { left: string; right: string; display: boolean }[] = [
    { left: '$$', right: '$$', display: true },
    { left: '\\[', right: '\\]', display: true },
    { left: '$', right: '$', display: false },
    { left: '\\(', right: '\\)', display: false },
  ]

  // Walk all text nodes and replace math delimiters with rendered KaTeX spans
  function processNode(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || ''
      let remaining = text
      let result = ''
      let changed = false

      while (remaining.length > 0) {
        let matched = false
        for (const { left, right, display } of delimiters) {
          if (remaining.startsWith(left)) {
            const end = remaining.indexOf(right, left.length)
            if (end !== -1) {
              const formula = remaining.slice(left.length, end)
              try {
                result += katex.renderToString(formula, {
                  displayMode: display,
                  throwOnError: false,
                  output: 'html',
                })
              } catch {
                result += remaining.slice(0, end + right.length)
              }
              remaining = remaining.slice(end + right.length)
              changed = true
              matched = true
              break
            }
          }
        }
        if (!matched) {
          result += remaining[0]
          remaining = remaining.slice(1)
        }
      }

      if (changed && node.parentNode) {
        const span = document.createElement('span')
        span.innerHTML = result
        node.parentNode.replaceChild(span, node)
      }
    } else if (
      node.nodeType === Node.ELEMENT_NODE &&
      (node as Element).tagName !== 'SCRIPT' &&
      (node as Element).tagName !== 'STYLE'
    ) {
      // Clone child list because we mutate during iteration
      Array.from(node.childNodes).forEach(processNode)
    }
  }

  processNode(el)
}

export default function MathJax({ content }: MathJaxProps) {
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (contentRef.current) {
      renderMath(contentRef.current)
    }
  }, [content])

  return (
    <div
      ref={contentRef}
      className="text-gray-200 leading-relaxed"
      dangerouslySetInnerHTML={{ __html: content }}
    />
  )
}
