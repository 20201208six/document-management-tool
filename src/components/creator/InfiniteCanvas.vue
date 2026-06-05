<template>
  <div class="infinite-canvas-wrapper">
    <!-- 节点工具箱 -->
    <div class="workflow-palette">
      <div class="palette-title">工具箱</div>
      <div class="node-category">
        <span class="cat-label">触发器</span>
        <button class="node-btn" @click="addNodeAtCenter('trigger', '定时触发')">⏰ 定时触发</button>
      </div>
      <div class="node-category">
        <span class="cat-label">数据源</span>
        <button class="node-btn" @click="addNodeAtCenter('source', '读取视频')">📹 读取视频</button>
        <button class="node-btn" @click="addNodeAtCenter('source', '读取文件')">📄 读取文件</button>
      </div>
      <div class="node-category">
        <span class="cat-label">处理</span>
        <button class="node-btn" @click="addNodeAtCenter('process', 'AI文案生成')">🤖 AI文案生成</button>
        <button class="node-btn" @click="addNodeAtCenter('process', '文本处理')">📝 文本处理</button>
        <button class="node-btn" @click="addNodeAtCenter('process', '格式转换')">🔄 格式转换</button>
      </div>
      <div class="node-category">
        <span class="cat-label">输出</span>
        <button class="node-btn" @click="addNodeAtCenter('output', '保存文件')">💾 保存文件</button>
        <button class="node-btn" @click="addNodeAtCenter('output', '导出剪映')">🎬 导出剪映</button>
      </div>

      <div class="palette-actions">
        <el-button size="small" @click="clearCanvas">清空画布</el-button>
      </div>
    </div>

    <!-- 无限画布 -->
    <div
      class="canvas-area"
      ref="canvasContainerRef"
      @mousedown="onCanvasMouseDown"
      @mousemove="onCanvasMouseMove"
      @mouseup="onCanvasMouseUp"
      @wheel.prevent="onCanvasWheel"
    >
      <div
        class="canvas-content"
        :style="{
          transform: `translate(${store.canvasOffset.x}px, ${store.canvasOffset.y}px) scale(${store.canvasScale})`,
          transformOrigin: '0 0'
        }"
      >
        <!-- 网格背景 -->
        <svg class="canvas-svg" :width="canvasW" :height="canvasH">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#f0f2f5" stroke-width="0.5"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        <!-- 连线 -->
        <svg class="edges-svg" :width="canvasW" :height="canvasH" style="position:absolute;top:0;left:0;pointer-events:none">
          <line
            v-for="edge in store.workflowEdges"
            :key="edge.id"
            :x1="getNodeCenter(edge.fromNodeId).x"
            :y1="getNodeCenter(edge.fromNodeId).y"
            :x2="getNodeCenter(edge.toNodeId).x"
            :y2="getNodeCenter(edge.toNodeId).y"
            stroke="#409eff"
            stroke-width="2"
            marker-end="url(#arrowhead)"
          />
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#409eff"/>
            </marker>
          </defs>
        </svg>

        <!-- 节点 -->
        <div
          v-for="node in store.workflowNodes"
          :key="node.id"
          class="wf-node"
          :class="[
            'node-' + node.type,
            { selected: store.selectedNodeId === node.id }
          ]"
          :style="{ left: node.x + 'px', top: node.y + 'px' }"
          @mousedown.stop="onNodeDragStart($event, node.id)"
          @click.stop="store.selectNode(node.id)"
        >
          <div class="node-header">
            <span class="node-icon">{{ nodeIcon(node.type) }}</span>
            <span class="node-label">{{ node.label }}</span>
          </div>
          <div class="node-body">
            <span class="node-type">{{ nodeTypeLabel(node.type) }}</span>
          </div>
          <div class="node-connector left" @mousedown.stop="startConnection(node.id, 'from')"></div>
          <div class="node-connector right" @mousedown.stop="startConnection(node.id, 'to')"></div>
          <button class="node-delete" @click.stop="store.removeNode(node.id)">×</button>
        </div>
      </div>

      <!-- 画布控制栏 -->
      <div class="canvas-controls">
        <el-button-group size="small">
          <el-button @click="store.setCanvasScale(store.canvasScale + 0.1)">+</el-button>
          <el-button disabled>{{ Math.round(store.canvasScale * 100) }}%</el-button>
          <el-button @click="store.setCanvasScale(store.canvasScale - 0.1)">-</el-button>
        </el-button-group>
        <el-button size="small" @click="resetView">重置视图</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { useCreatorModeStore } from '@/stores/creatorMode'

const store = useCreatorModeStore()

const canvasContainerRef = ref<HTMLElement | null>(null)
const canvasW = ref(3000)
const canvasH = ref(2000)

// 画布拖拽
const isDraggingCanvas = ref(false)
const dragStart = reactive({ x: 0, y: 0 })
let nodeDragId: string | null = null
let nodeDragStart = { x: 0, y: 0 }
let connectionFrom: string | null = null

function nodeIcon(type: string): string {
  const icons: Record<string, string> = { trigger: '⏰', source: '📥', process: '⚙️', output: '📤' }
  return icons[type] || '📦'
}

function nodeTypeLabel(type: string): string {
  const labels: Record<string, string> = { trigger: '触发器', source: '数据源', process: '处理节点', output: '输出节点' }
  return labels[type] || type
}

function addNodeAtCenter(type: 'trigger' | 'source' | 'process' | 'output', label: string) {
  const x = 200 + Math.random() * 400
  const y = 100 + Math.random() * 300
  store.addNode(type, label, x, y)
  ElMessage.success(`已添加节点: ${label}`)
}

function clearCanvas() {
  store.workflowNodes.length = 0
  store.workflowEdges.length = 0
  store.selectedNodeId = null
}

function getNodeCenter(nodeId: string): { x: number; y: number } {
  const node = store.workflowNodes.find(n => n.id === nodeId)
  if (!node) return { x: 0, y: 0 }
  return { x: node.x + 80, y: node.y + 40 }
}

// 画布平移
function onCanvasMouseDown(e: MouseEvent) {
  if (e.target === canvasContainerRef.value || (e.target as HTMLElement).classList.contains('canvas-svg')) {
    isDraggingCanvas.value = true
    dragStart.x = e.clientX - store.canvasOffset.x
    dragStart.y = e.clientY - store.canvasOffset.y
  }
}

function onCanvasMouseMove(e: MouseEvent) {
  if (isDraggingCanvas.value) {
    store.setCanvasOffset(e.clientX - dragStart.x, e.clientY - dragStart.y)
  }
  if (nodeDragId) {
    const node = store.workflowNodes.find(n => n.id === nodeDragId)
    if (node) {
      const dx = (e.clientX - nodeDragStart.x) / store.canvasScale
      const dy = (e.clientY - nodeDragStart.y) / store.canvasScale
      store.updateNodePosition(nodeDragId, node.x + dx, node.y + dy)
      nodeDragStart.x = e.clientX
      nodeDragStart.y = e.clientY
    }
  }
}

function onCanvasMouseUp() {
  isDraggingCanvas.value = false
  nodeDragId = null
}

function onCanvasWheel(e: WheelEvent) {
  const delta = e.deltaY > 0 ? -0.05 : 0.05
  store.setCanvasScale(store.canvasScale + delta)
}

// 节点拖拽
function onNodeDragStart(e: MouseEvent, nodeId: string) {
  nodeDragId = nodeId
  nodeDragStart.x = e.clientX
  nodeDragStart.y = e.clientY
}

// 连线
function startConnection(nodeId: string, side: 'from' | 'to') {
  if (side === 'from') {
    connectionFrom = nodeId
  } else if (connectionFrom && connectionFrom !== nodeId) {
    store.addEdge(connectionFrom, nodeId)
    connectionFrom = null
    ElMessage.success('连线已创建')
  }
}

function resetView() {
  store.setCanvasOffset(0, 0)
  store.setCanvasScale(1)
}
</script>

<style scoped>
.infinite-canvas-wrapper {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* 工具箱 */
.workflow-palette {
  width: 180px;
  min-width: 180px;
  background: #fff;
  border-right: 1px solid #e4e7ed;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.palette-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 4px;
}

.node-category {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cat-label {
  font-size: 11px;
  color: #909399;
  text-transform: uppercase;
  letter-spacing: 1px;
  padding: 4px 0;
}

.node-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  font-size: 12px;
  border: 1px solid #e4e7ed;
  background: #fafafa;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
  color: #606266;
  transition: all 0.15s;
}

.node-btn:hover {
  border-color: #409eff;
  color: #409eff;
  background: #ecf5ff;
}

.palette-actions {
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid #f0f2f5;
}

/* 画布 */
.canvas-area {
  flex: 1;
  overflow: hidden;
  position: relative;
  background: #fafbfc;
}

.canvas-content {
  position: relative;
  width: 3000px;
  height: 2000px;
}

.canvas-svg, .edges-svg {
  pointer-events: none;
}

/* 节点 */
.wf-node {
  position: absolute;
  width: 160px;
  background: #fff;
  border: 2px solid #e4e7ed;
  border-radius: 8px;
  cursor: move;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  transition: border-color 0.15s;
}

.wf-node:hover { border-color: #c0c4cc; }
.wf-node.selected { border-color: #409eff; box-shadow: 0 2px 12px rgba(64,158,255,0.2); }

.node-trigger { border-left: 3px solid #e6a23c; }
.node-source { border-left: 3px solid #67c23a; }
.node-process { border-left: 3px solid #409eff; }
.node-output { border-left: 3px solid #f56c6c; }

.node-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid #f5f7fa;
}

.node-icon { font-size: 14px; }
.node-label {
  font-size: 13px;
  font-weight: 500;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-body {
  padding: 6px 10px;
}

.node-type {
  font-size: 11px;
  color: #c0c4cc;
}

.node-connector {
  position: absolute;
  top: 50%;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #c0c4cc;
  border: 2px solid #fff;
  cursor: crosshair;
  z-index: 1;
}

.node-connector.left { left: -5px; transform: translateY(-50%); }
.node-connector.right { right: -5px; transform: translateY(-50%); }
.node-connector:hover { background: #409eff; }

.node-delete {
  position: absolute;
  top: -8px;
  right: -8px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1px solid #e4e7ed;
  background: #fff;
  color: #909399;
  font-size: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s;
}

.wf-node:hover .node-delete { opacity: 1; }
.node-delete:hover { color: #f56c6c; border-color: #f56c6c; }

/* 控制栏 */
.canvas-controls {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 8px;
  background: #fff;
  padding: 6px 12px;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
}
</style>
