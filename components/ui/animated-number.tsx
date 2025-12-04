"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { motion, useSpring, useTransform, useMotionValue, useInView } from "motion/react"
import gsap from "gsap"

const GLYPHS = "!@#$%^&*0123456789"

interface AnimatedNumberProps {
  value: number
  className?: string
  formatOptions?: Intl.NumberFormatOptions
  duration?: number
  /** Whether to animate on mount from 0 */
  animateOnMount?: boolean
  /** Suffix to append (e.g., "W", "L", "%") */
  suffix?: string
  /** Prefix to prepend (e.g., "$") */
  prefix?: string
}

export function AnimatedNumber({
  value,
  className,
  formatOptions,
  duration = 0.8,
  animateOnMount = true,
  suffix = "",
  prefix = "",
}: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const isInView = useInView(ref, { once: false, margin: "-50px" })
  const motionValue = useMotionValue(animateOnMount ? 0 : value)
  const [isHovering, setIsHovering] = useState(false)
  const [hoverText, setHoverText] = useState<string | null>(null)
  const isAnimating = useRef(false)
  
  const springValue = useSpring(motionValue, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  })

  const displayValue = useTransform(springValue, (latest) => {
    const formatted = new Intl.NumberFormat("en-US", formatOptions).format(Math.round(latest))
    return `${prefix}${formatted}${suffix}`
  })

  useEffect(() => {
    if (isInView) {
      motionValue.set(value)
    }
  }, [isInView, motionValue, value])

  const handleMouseEnter = useCallback(() => {
    if (isAnimating.current) return
    isAnimating.current = true
    setIsHovering(true)
    
    const finalText = `${prefix}${new Intl.NumberFormat("en-US", formatOptions).format(value)}${suffix}`
    const chars = finalText.split("")
    const lockedIndices = new Set<number>()
    
    // Start scrambled
    setHoverText(chars.map(() => GLYPHS[Math.floor(Math.random() * GLYPHS.length)]).join(""))
    
    const scrambleObj = { progress: 0 }
    gsap.to(scrambleObj, {
      progress: 1,
      duration: 0.4,
      ease: "power2.out",
      onUpdate: () => {
        const numLocked = Math.floor(scrambleObj.progress * chars.length)
        for (let i = 0; i < numLocked; i++) lockedIndices.add(i)
        
        setHoverText(
          chars.map((char, i) => 
            lockedIndices.has(i) ? char : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
          ).join("")
        )
      },
      onComplete: () => {
        setHoverText(null)
        setIsHovering(false)
        isAnimating.current = false
      },
    })
  }, [value, prefix, suffix, formatOptions])

  return (
    <motion.span 
      ref={ref} 
      className={className}
      onMouseEnter={handleMouseEnter}
      style={{ cursor: "default" }}
    >
      {hoverText ?? displayValue}
    </motion.span>
  )
}

interface AnimatedPercentProps {
  value: number
  total: number
  className?: string
  duration?: number
}

export function AnimatedPercent({
  value,
  total,
  className,
  duration = 0.8,
}: AnimatedPercentProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const isInView = useInView(ref, { once: false, margin: "-50px" })
  const percent = total === 0 ? 0 : Math.round((value / total) * 100)
  const [hoverText, setHoverText] = useState<string | null>(null)
  const isAnimating = useRef(false)
  
  const motionValue = useMotionValue(0)
  
  const springValue = useSpring(motionValue, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  })

  const displayValue = useTransform(springValue, (latest) => {
    return `${Math.round(latest)}%`
  })

  useEffect(() => {
    if (isInView) {
      motionValue.set(percent)
    }
  }, [isInView, motionValue, percent])

  const handleMouseEnter = useCallback(() => {
    if (isAnimating.current) return
    isAnimating.current = true
    
    const finalText = `${percent}%`
    const chars = finalText.split("")
    const lockedIndices = new Set<number>()
    
    // Start scrambled
    setHoverText(chars.map(() => GLYPHS[Math.floor(Math.random() * GLYPHS.length)]).join(""))
    
    const scrambleObj = { progress: 0 }
    gsap.to(scrambleObj, {
      progress: 1,
      duration: 0.4,
      ease: "power2.out",
      onUpdate: () => {
        const numLocked = Math.floor(scrambleObj.progress * chars.length)
        for (let i = 0; i < numLocked; i++) lockedIndices.add(i)
        
        setHoverText(
          chars.map((char, i) => 
            lockedIndices.has(i) ? char : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
          ).join("")
        )
      },
      onComplete: () => {
        setHoverText(null)
        isAnimating.current = false
      },
    })
  }, [percent])

  return (
    <motion.span 
      ref={ref} 
      className={className}
      onMouseEnter={handleMouseEnter}
      style={{ cursor: "default" }}
    >
      {hoverText ?? displayValue}
    </motion.span>
  )
}

