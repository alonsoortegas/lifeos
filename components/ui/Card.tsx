import React from 'react'

interface CardProps {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

export default function Card({ children, className = '', style }: CardProps) {
  return (
    <div
      className={`bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl ${className}`}
      style={style}
    >
      {children}
    </div>
  )
}
