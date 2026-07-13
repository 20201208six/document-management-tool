<template>
  <div class="graph-full">
    <div
      class="canvas-zone"
      ref="canvasRef"
      @mousedown="onCanvasMouseDown"
      @mousemove="onCanvasMouseMove"
      @mouseup="onMouseUp"
      @wheel.prevent="onWheel"
    >
      <svg class="svg-layer" :width="canvasWidth" :height="canvasHeight" :viewBox="`${-panX} ${-panY} ${canvasWidth} ${canvasHeight}`">
        <!-- 连线 -->
        <line
          v-for="edge in edges"
          :key="edge.id"
          :x1="getCX(edge.source)"
          :y1="getCY(edge.source)"
          :x2="getCX(edge.target)"
          :y2="getCY(edge.target)"
          class="edge-line"
          @click.stop="removeEdge(edge.id)"
        />
        <!-- 拖拽中的临时线 -->
        <line
          v-if="connecting"
          :x1="getCX(connecting.from)"
          :y1="getCY(connecting.from)"
          :x2="mouseX + panX"
          :y2="mouseY + panY"
          class="edge-line edge-temp"
        />
        <!-- 节点 -->
        <g
          v-for="node in nodes"
          :key="node.id"
          :transform="`translate(${node.x}, ${node.y})`"
          class="node-group"
          :data-node-id="node.id"
        >
          <!-- 连接手柄（四个方向的小圆点） -->
          <circle
            class="handle handle-top"
            cx="0" cy="-39" r="6"
            @mousedown.stop="startConnect($event, node.id)"
          />
          <circle
            class="handle handle-right"
            cx="83" cy="0" r="6"
            @mousedown.stop="startConnect($event, node.id)"
          />
          <circle
            class="handle handle-bottom"
            cx="0" cy="39" r="6"
            @mousedown.stop="startConnect($event, node.id)"
          />
          <circle
            class="handle handle-left"
            cx="-83" cy="0" r="6"
            @mousedown.stop="startConnect($event, node.id)"
          />

          <!-- 节点主体（拖拽区域） -->
          <rect
            :x="-80" :y="-36" width="160" height="72" rx="12"
            :fill="node.color + '15'"
            :stroke="node.color"
            stroke-width="2"
            @mousedown.stop="onNodeDragStart($event, node.id)"
          />
          <text class="node-icon" :x="-70" :y="-4" font-size="20">{{ node.icon }}</text>
          <text class="node-label" :x="-44" :y="2" font-size="13" font-weight="600" fill="#303133">{{ node.label }}</text>
          <text class="node-desc" :x="-44" :y="18" font-size="10" fill="#909399">{{ node.desc }}</text>
        </g>
      </svg>

      <div class="canvas-toolbar">
        <el-button size="small" @click="resetNodes">重置位置</el-button>
        <el-button size="small" type="danger" text @click="clearEdges">清空连线</el-button>
      </div>
      <div class="canvas-zoom">缩放 {{ Math.round(zoom * 100) }}%</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useDataGraphStore, NODE_TYPE_META } from '@/stores/dataGraph'
import type { GraphNodeType } from '@/stores/dataGraph'

const graphStore = useDataGraphStore()

type ModeNode = { id: string; type: GraphNodeType; icon: string; label: string; desc: string; color: string; x: number; y: number }

const nodes = ref<ModeNode[]>([
  { id: 'basic',   type: 'basic',   ...NODE_TYPE_META.basic,   desc: '文件管理 / 对话 / 书签', x: 200, y: 180 },
  { id: 'creator', type: 'creator', ...NODE_TYPE_META.creator, desc: '视频剪辑 / 工作流', x: 520, y: 180 },
  { id: 'unique',  type: 'unique',  ...NODE_TYPE_META.unique,  desc: '文稿分析 / 账号管理', x: 200, y: 400 },
  { id: 'canvas',  type: 'canvas',  ...NODE_TYPE_META.canvas,  desc: '数据连接画布', x: 520, y: 400 },
])

// 连线
interface Edge { id: string; source: string; target: string }
const edges = ref<Edge[]>([])

function addEdge(a: string, b: string) {
  if (a === b) return
  const exists = edges.value.find(e =>
    (e.source === a && e.target === b) || (e.source === b && e.target === a)
  )
  if (exists) return
  edges.value.push({ id: `e_${a}_${b}`, source: a, target: b })
}
function removeEdge(id: string) {
  edges.value = edges.value.filter(e => e.id !== id)
}
function clearEdges() {
  edges.value = []
}
function resetNodes() {
  nodes.value = [
    { id: 'basic',   type: 'basic',   ...NODE_TYPE_META.basic,   desc: '文件管理 / 对话 / 书签', x: 200, y: 180 },
    { id: 'creator', type: 'creator', ...NODE_TYPE_META.creator, desc: '视频剪辑 / 工作流', x: 520, y: 180 },
    { id: 'unique',  type: 'unique',  ...NODE_TYPE_META.unique,  desc: '文稿分析 / 账号管理', x: 200, y: 400 },
    { id: 'canvas',  type: 'canvas',  ...NODE_TYPE_META.canvas,  desc: '数据连接画布', x: 520, y: 400 },
  ]
}

function getCX(id: string) { return nodes.value.find(n => n.id === id)?.x || 0 }
function getCY(id: string) { return nodes.value.find(n => n.id === id)?.y || 0 }

// ===== 连接交互 =====
const connecting = ref<{ from: string } | null>(null)

function startConnect(_e: MouseEvent, nodeId: string) {
  connecting.value = { from: nodeId }
  draggingNodeId.value = null
}

function finishConnect(clientX: number, clientY: number) {
  if (!connecting.value) return false

  const el = document.elementFromPoint(clientX, clientY)
  const gEl = el?.closest('[data-node-id]')
  if (gEl) {
    const targetId = (gEl as HTMLElement).dataset.nodeId
    if (targetId && targetId !== connecting.value.from) {
      addEdge(connecting.value.from, targetId)
      connecting.value = null
      return true
    }
  }

  connecting.value = null
  return false
}

// ===== 拖拽节点 =====
const canvasRef = ref<HTMLElement>()
const canvasWidth = 4000
const canvasHeight = 3000
const panX = ref(0)
const panY = ref(0)
const zoom = ref(1)
const mouseX = ref(0)
const mouseY = ref(0)

const draggingNodeId = ref<string | null>(null)
let dragOffsetX = 0
let dragOffsetY = 0
let isPanning = false
let panStartX = 0
let panStartY = 0

function onNodeDragStart(e: MouseEvent, nodeId: string) {
  connecting.value = null
  draggingNodeId.value = nodeId
  const node = nodes.value.find(n => n.id === nodeId)
  dragOffsetX = e.clientX / zoom.value - (node?.x || 0) + panX.value
  dragOffsetY = e.clientY / zoom.value - (node?.y || 0) + panY.value
}

function onCanvasMouseDown(e: MouseEvent) {
  // 先尝试完成连线
  if (connecting.value) {
    if (finishConnect(e.clientX, e.clientY)) return
  }

  const target = e.target as HTMLElement
  if (target === canvasRef.value || target.classList.contains('svg-layer')) {
    isPanning = true
    panStartX = e.clientX / zoom.value + panX.value
    panStartY = e.clientY / zoom.value + panY.value
  }
}

function onCanvasMouseMove(e: MouseEvent) {
  mouseX.value = e.clientX / zoom.value
  mouseY.value = e.clientY / zoom.value

  if (draggingNodeId.value) {
    const node = nodes.value.find(n => n.id === draggingNodeId.value)
    if (node) {
      node.x = Math.round(e.clientX / zoom.value + panX.value - dragOffsetX)
      node.y = Math.round(e.clientY / zoom.value + panY.value - dragOffsetY)
    }
  }
  if (isPanning) {
    panX.value = panStartX - e.clientX / zoom.value
    panY.value = panStartY - e.clientY / zoom.value
  }
}

function onMouseUp(e: MouseEvent) {
  // 松手时尝试完成连线
  if (connecting.value) {
    finishConnect(e.clientX, e.clientY)
  }
  draggingNodeId.value = null
  isPanning = false
}

function onWheel(e: WheelEvent) {
  const delta = e.deltaY > 0 ? 0.9 : 1.1
  zoom.value = Math.max(0.3, Math.min(2, zoom.value * delta))
}

// ===== 持久化 =====
const STORAGE_KEY = 'datagraph-edges'

onMounted(() => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) edges.value = JSON.parse(saved)
  } catch {}
})

watch(edges, (val) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(val))
  graphStore.clearAll()
  for (const n of nodes.value) {
    graphStore.upsertNode({ id: n.id, type: n.type, label: n.label, sourceId: n.id, preview: n.desc })
  }
  for (const e of val) {
    graphStore.connectNodes(e.source, e.target)
  }
}, { deep: true })
</script>

<style scoped>
.graph-full {
  display: flex;
  height: 100%;
}
.canvas-zone {
  flex: 1;
  position: relative;
  background: #fafbfc;
  overflow: hidden;
  cursor: grab;
}
.canvas-zone:active {
  cursor: grabbing;
}
.svg-layer {
  display: block;
}

/* 连线 */
.edge-line {
  stroke: #909399;
  stroke-width: 3;
  stroke-dasharray: 8 4;
  cursor: pointer;
  transition: stroke 0.15s;
}
.edge-line:hover {
  stroke: #f56c6c;
  stroke-dasharray: none;
}
.edge-temp {
  stroke: #409eff;
  stroke-dasharray: 4 4;
  opacity: 0.6;
}

/* 节点 */
.node-group {
  cursor: default;
  transition: filter 0.1s;
}
.node-group:hover {
  filter: drop-shadow(0 2px 6px rgba(0,0,0,0.1));
}
.node-icon { text-anchor: start; pointer-events: none; }
.node-label { text-anchor: start; pointer-events: none; }
.node-desc { text-anchor: start; pointer-events: none; }

/* 连接手柄 */
.handle {
  fill: #c0c4cc;
  stroke: #fff;
  stroke-width: 2;
  cursor: crosshair;
  transition: fill 0.15s, r 0.15s;
}
.handle:hover {
  fill: #409eff;
  r: 8;
}

/* 工具栏 */
.canvas-toolbar {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 12px;
  background: rgba(255,255,255,0.95);
  padding: 6px 16px;
  border-radius: 20px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}
.canvas-zoom {
  position: absolute;
  top: 8px;
  right: 12px;
  font-size: 11px;
  color: #909399;
  background: rgba(255,255,255,0.9);
  padding: 2px 8px;
  border-radius: 10px;
}
</style>
