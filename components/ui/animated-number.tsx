"use client"

import { useEffect, useRef } from "react"
import { motion, useSpring, useTransform, useMotionValue, useInView } from "motion/react"

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

  return (
    <motion.span 
      ref={ref} 
      className={className}
    >
      {displayValue}
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

  return (
    <motion.span 
      ref={ref} 
      className={className}
    >
      {displayValue}
    </motion.span>
  )
}

