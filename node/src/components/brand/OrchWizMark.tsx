"use client"

type OrchWizMarkProps = {
  size: number
  className?: string
  alt?: string
}

export function OrchWizMark({ size, className, alt = "OrchWiz" }: OrchWizMarkProps) {
  return (
    // Intentionally a plain <img> so we can use an SVG mark without Next/Image SVG restrictions.
    <img
      src="/brand/orchwiz-mark.svg"
      alt={alt}
      width={size}
      height={size}
      draggable={false}
      className={`select-none ${className ?? "drop-shadow-[0_2px_10px_rgba(15,23,42,0.25)]"}`}
    />
  )
}
