"use client"

import { useEffect, useState, ReactNode } from "react"
import RGL from "react-grid-layout"
import "react-grid-layout/css/styles.css"
import "react-resizable/css/styles.css"

export interface LayoutItem {
  i: string
  x: number
  y: number
  w: number
  h: number
  minW?: number
  minH?: number
  maxW?: number
  maxH?: number
}

interface GridLayoutWrapperProps {
  children: ReactNode
  layout: LayoutItem[]
  cols?: number
  rowHeight?: number
  width: number
  onLayoutChange?: (layout: LayoutItem[]) => void
  draggableHandle?: string
  isResizable?: boolean
  isDraggable?: boolean
  margin?: [number, number]
  className?: string
}

export function GridLayoutWrapper({
  children,
  layout,
  cols = 12,
  rowHeight = 50,
  width,
  onLayoutChange,
  draggableHandle,
  isResizable = true,
  isDraggable = true,
  margin = [8, 8],
  className,
}: GridLayoutWrapperProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <div className="animate-pulse bg-muted/50 h-full w-full rounded-lg" />
  }

  // Cast to any to bypass type issues with @types/react-grid-layout
  const GridLayout = RGL as any

  return (
    <GridLayout
      className={className}
      layout={layout}
      cols={cols}
      rowHeight={rowHeight}
      width={width}
      onLayoutChange={onLayoutChange}
      draggableHandle={draggableHandle}
      isResizable={isResizable}
      isDraggable={isDraggable}
      margin={margin}
    >
      {children}
    </GridLayout>
  )
}
