"use client"

import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type NodeTypes,
} from "reactflow"

interface FlowCanvasProps {
  nodes: Node[]
  edges: Edge[]
  nodeTypes?: NodeTypes
  onNodeClick?: NodeMouseHandler
  className?: string
  showMiniMap?: boolean
}

export function FlowCanvas({
  nodes,
  edges,
  nodeTypes,
  onNodeClick,
  className = "",
  showMiniMap = false,
}: FlowCanvasProps) {
  return (
    <div className={`h-[360px] w-full ${className}`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        minZoom={0.4}
        maxZoom={1.6}
        nodesDraggable
        nodesConnectable={false}
        panOnDrag
        zoomOnScroll
      >
        <Background color="rgba(255,255,255,0.06)" gap={24} size={1} />
        <Controls className="!bg-white/5 !border-white/10 !text-slate-100" />
        {showMiniMap && (
          <MiniMap
            className="!bg-slate-900/70"
            maskColor="rgba(15, 23, 42, 0.4)"
            nodeColor={() => "rgba(148, 163, 184, 0.6)"}
          />
        )}
      </ReactFlow>
    </div>
  )
}
