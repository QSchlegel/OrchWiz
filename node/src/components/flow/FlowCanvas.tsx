"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Connection,
  type ConnectionMode,
  type Edge,
  type Node,
  type NodeDragHandler,
  type NodeMouseHandler,
  type NodeTypes,
  type OnConnect,
  type OnNodesChange,
  type ReactFlowInstance,
} from "reactflow"

interface FlowCanvasProps {
  nodes: Node[]
  edges: Edge[]
  nodeTypes?: NodeTypes
  onNodeClick?: NodeMouseHandler
  onPaneClick?: (event: React.MouseEvent) => void
  onInit?: (instance: ReactFlowInstance) => void
  onNodesChange?: OnNodesChange
  onNodeDragStop?: NodeDragHandler
  className?: string
  showMiniMap?: boolean
  miniMapWidth?: number
  miniMapHeight?: number
  nodesDraggable?: boolean
  nodesConnectable?: boolean
  onConnect?: OnConnect
  onDrop?: (event: React.DragEvent) => void
  onDragOver?: (event: React.DragEvent) => void
  connectionLineStyle?: React.CSSProperties
}

function nodeTypesHaveSameEntries(previous: NodeTypes, next: NodeTypes) {
  const previousKeys = Object.keys(previous)
  const nextKeys = Object.keys(next)
  if (previousKeys.length !== nextKeys.length) {
    return false
  }

  return nextKeys.every((key) => previous[key] === next[key])
}

export function FlowCanvas({
  nodes,
  edges,
  nodeTypes,
  onNodeClick,
  onPaneClick,
  onInit,
  onNodesChange,
  onNodeDragStop,
  className = "",
  showMiniMap = false,
  miniMapWidth = 180,
  miniMapHeight = 120,
  nodesDraggable = true,
  nodesConnectable = false,
  onConnect,
  onDrop,
  onDragOver,
  connectionLineStyle,
}: FlowCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const stableNodeTypesRef = useRef<NodeTypes | undefined>(nodeTypes)
  const [canRenderFlow, setCanRenderFlow] = useState(false)

  const stableNodeTypes = useMemo(() => {
    if (!nodeTypes) {
      stableNodeTypesRef.current = undefined
      return undefined
    }

    const previousNodeTypes = stableNodeTypesRef.current
    if (previousNodeTypes && nodeTypesHaveSameEntries(previousNodeTypes, nodeTypes)) {
      return previousNodeTypes
    }

    stableNodeTypesRef.current = nodeTypes
    return nodeTypes
  }, [nodeTypes])

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const updateDimensions = () => {
      const { width, height } = container.getBoundingClientRect()
      setCanRenderFlow(width > 0 && height > 0)
    }

    updateDimensions()

    if (typeof ResizeObserver === "undefined") {
      return
    }

    const resizeObserver = new ResizeObserver(() => {
      updateDimensions()
    })
    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className={`h-[360px] w-full ${className}`}
      onDrop={onDrop}
      onDragOver={onDragOver}
    >
      {canRenderFlow && (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={stableNodeTypes}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onInit={onInit}
          onNodesChange={onNodesChange}
          onNodeDragStop={onNodeDragStop}
          onConnect={onConnect}
          fitView
          fitViewOptions={{ padding: 0.18 }}
          minZoom={0.4}
          maxZoom={1.6}
          nodesDraggable={nodesDraggable}
          nodesConnectable={nodesConnectable}
          connectionLineStyle={connectionLineStyle}
          panOnDrag
          zoomOnScroll
        >
          <Background color="var(--flow-grid-color)" gap={24} size={1} />
          <Controls className="flow-theme-controls" />
          {showMiniMap && (
            <MiniMap
              className="flow-theme-minimap"
              maskColor="var(--flow-minimap-mask)"
              nodeColor={() => "var(--flow-minimap-node)"}
              style={{ width: miniMapWidth, height: miniMapHeight }}
            />
          )}
        </ReactFlow>
      )}
    </div>
  )
}
