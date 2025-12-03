"use client"

import { useEffect, useState, useRef } from "react"
import gsap from "gsap"

interface ScrambleTextProps {
  text: string
  className?: string
  /** Delay in milliseconds before animation starts */
  delayMs?: number
  /** Duration of the scramble animation in seconds */
  duration?: number
}

const GLYPHS = "!@#$%^&*()_+-=<>?/\\[]{}Xx"

/**
 * Scramble text animation component.
 * Characters rapidly flip through random glyphs before locking
 * left-to-right into the final text.
 */
export function ScrambleText({
  text,
  className,
  delayMs = 0,
  duration = 0.9,
}: ScrambleTextProps) {
  const [displayText, setDisplayText] = useState("")
  const containerRef = useRef<HTMLSpanElement>(null)
  const hasAnimated = useRef(false)

  useEffect(() => {
    // Prevent re-animation on re-renders
    if (hasAnimated.current) return
    if (!text) {
      setDisplayText("")
      return
    }

    hasAnimated.current = true
    
    // Start with scrambled text
    const scrambledStart = text
      .split("")
      .map(() => GLYPHS[Math.floor(Math.random() * GLYPHS.length)])
      .join("")
    setDisplayText(scrambledStart)

    // Track which characters have "locked in"
    const lockedIndices = new Set<number>()
    const finalChars = text.split("")
    const totalChars = finalChars.length

    // Calculate timing: each character locks ~equally spaced across duration
    const lockInterval = duration / totalChars

    // Start the animation after the specified delay
    const timeoutId = setTimeout(() => {
      // Rapid scramble effect using GSAP ticker
      const scrambleObj = { progress: 0 }
      
      gsap.to(scrambleObj, {
        progress: 1,
        duration,
        ease: "power2.out",
        onUpdate: () => {
          // Determine how many characters should be locked based on progress
          const numLocked = Math.floor(scrambleObj.progress * totalChars)
          
          // Lock new characters left-to-right
          for (let i = 0; i < numLocked; i++) {
            lockedIndices.add(i)
          }
          
          // Build display string
          const newDisplay = finalChars
            .map((char, i) => {
              if (lockedIndices.has(i)) {
                return char // Locked character
              }
              // Still scrambling - pick random glyph
              return GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
            })
            .join("")
          
          setDisplayText(newDisplay)
        },
        onComplete: () => {
          // Ensure final text is exactly correct
          setDisplayText(text)
        },
      })
    }, delayMs)

    return () => {
      clearTimeout(timeoutId)
      gsap.killTweensOf(containerRef.current)
    }
  }, [text, delayMs, duration])

  return (
    <span ref={containerRef} className={className}>
      {displayText}
    </span>
  )
}

