"use client"

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
  nodesDraggable?: boolean
  nodesConnectable?: boolean
  onConnect?: OnConnect
  onDrop?: (event: React.DragEvent) => void
  onDragOver?: (event: React.DragEvent) => void
  connectionLineStyle?: React.CSSProperties
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
  nodesDraggable = true,
  nodesConnectable = false,
  onConnect,
  onDrop,
  onDragOver,
  connectionLineStyle,
}: FlowCanvasProps) {
  return (
    <div
      className={`h-[360px] w-full ${className}`}
      onDrop={onDrop}
      onDragOver={onDragOver}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
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
          />
        )}
      </ReactFlow>
    </div>
  )
}
