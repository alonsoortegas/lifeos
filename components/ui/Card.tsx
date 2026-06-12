import React from 'react'

interface CardProps {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

export default function Card({ children, className = '', style }: CardProps) {
  return (
    <div className={`panel rounded-2xl ${className}`} style={style}>
      {children}
    </div>
  )
}
