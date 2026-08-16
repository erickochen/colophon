"use client"

import * as React from "react"
import { motion, useSpring, useTransform, type SpringOptions } from "motion/react"

import { cn } from "@/lib/utils"

export type AnimatedNumberProps = {
  value: number
  className?: string
  springOptions?: SpringOptions
  as?: React.ElementType
}

/** Counts toward its value on a spring (Motion Primitives). */
export function AnimatedNumber({ value, className, springOptions, as = "span" }: AnimatedNumberProps) {
  const MotionComponent = React.useMemo(() => motion.create(as as keyof React.JSX.IntrinsicElements), [as])

  const spring = useSpring(value, springOptions)
  const display = useTransform(spring, (current) => Math.round(current).toLocaleString("en-US"))

  React.useEffect(() => {
    spring.set(value)
  }, [spring, value])

  return <MotionComponent className={cn("tabular-nums", className)}>{display}</MotionComponent>
}
