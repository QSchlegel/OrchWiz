"use client"

import Image from "next/image"

type OrchWizMarkProps = {
  size: number
  className?: string
  alt?: string
}

export function OrchWizMark({ size, className, alt = "OrchWiz" }: OrchWizMarkProps) {
  return (
    <Image
      src="/brand/orchwiz-mark.png"
      alt={alt}
      width={size}
      height={size}
      className={`select-none ${className ?? "drop-shadow-[0_2px_10px_rgba(15,23,42,0.25)]"}`}
      priority
    />
  )
}

