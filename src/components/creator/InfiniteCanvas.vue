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
        <button class="node-btn" @click="addNodeAtCenter('source', '读取文件夹')">📁 读取文件夹</button>
        <button class="node-btn" @click="addNodeAtCenter('source', '新建文档')">📝 新建文档</button>
        <button class="node-btn" @click="addNodeAtCenter('source', '读取字幕')">💬 读取字幕</button>
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
        <el-button size="small" type="primary" @click="runWorkflow" :loading="store.isWorkflowRunning" :disabled="store.isWorkflowRunning">
          执行工作流
        </el-button>
        <el-button size="small" @click="resumeWorkflow" :disabled="store.isWorkflowRunning" v-if="hasCheckpoint">
          <el-icon><RefreshRight /></el-icon> 恢复执行
        </el-button>
        <el-button size="small" @click="clearCanvas" :disabled="store.isWorkflowRunning">清空画布</el-button>
      </div>

      <!-- 执行日志 -->
      <div v-if="store.workflowLogs.length > 0" class="workflow-logs">
        <div class="logs-title">执行日志</div>
        <div class="logs-list">
          <div v-for="(log, i) in store.workflowLogs" :key="i" class="log-line" :class="{ 'log-error': log.includes('✗'), 'log-success': log.includes('✓') }">
            {{ log }}
          </div>
        </div>
      </div>
    </div>

    <!-- 无限画布 -->
    <div
      class="canvas-area"
      :class="{ 'canvas-grabbing': isDraggingCanvas }"
      ref="canvasContainerRef"
      @mousedown="onCanvasMouseDown"
      @wheel.prevent="onCanvasWheel"
      @contextmenu.prevent
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

        <!-- 连线（可点击删除） -->
        <svg class="edges-svg" :width="canvasW" :height="canvasH" style="position:absolute;top:0;left:0;">
          <g v-for="edge in store.workflowEdges" :key="edge.id">
            <!-- 透明宽线用于点击 -->
            <line
              :x1="getNodeCenter(edge.fromNodeId).x"
              :y1="getNodeCenter(edge.fromNodeId).y"
              :x2="getNodeCenter(edge.toNodeId).x"
              :y2="getNodeCenter(edge.toNodeId).y"
              stroke="transparent"
              stroke-width="12"
              style="cursor:pointer"
              @click.stop="deleteEdge(edge.id)"
              @mouseenter="hoveredEdgeId = edge.id"
              @mouseleave="hoveredEdgeId = null"
            />
            <!-- 可视连线 -->
            <line
              :x1="getNodeCenter(edge.fromNodeId).x"
              :y1="getNodeCenter(edge.fromNodeId).y"
              :x2="getNodeCenter(edge.toNodeId).x"
              :y2="getNodeCenter(edge.toNodeId).y"
              :stroke="hoveredEdgeId === edge.id ? '#f56c6c' : '#409eff'"
              :stroke-width="hoveredEdgeId === edge.id ? 3 : 2"
              marker-end="url(#arrowhead)"
              style="pointer-events:none"
            />
          </g>
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#409eff"/>
            </marker>
            <marker id="arrowhead-red" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#f56c6c"/>
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
            { selected: store.selectedNodeId === node.id },
            nodeStatusClass(node)
          ]"
          :style="{ left: node.x + 'px', top: node.y + 'px' }"
          @mousedown.stop="onNodeDragStart($event, node.id)"
          @click.stop="store.selectNode(node.id)"
        >
          <div class="node-header">
            <span class="node-icon">{{ nodeIcon(node.type) }}</span>
            <span class="node-label">{{ node.label }}</span>
            <!-- Agent 模式徽章 -->
            <span v-if="supportsAgentMode(node) && getAgentConfig(node).mode !== 'automatic'" class="node-agent-badge" :title="'Agent 模式: ' + (getAgentConfig(node).mode === 'interactive' ? '交互' : '审核')">
              🧠
            </span>
            <!-- 执行状态指示器 -->
            <span v-if="node.config.result" class="node-status" :class="'status-' + node.config.result.status">
              {{ statusEmoji(node.config.result.status) }}
            </span>
          </div>
          <div class="node-body">
            <span class="node-type">{{ nodeTypeLabel(node.type) }}</span>
            <!-- 执行结果摘要 -->
            <div v-if="node.config.result && node.config.result.status !== 'idle'" class="node-result">
              <template v-if="node.config.result.status === 'running'">执行中...</template>
              <template v-else-if="node.config.result.status === 'success'">{{ truncate(node.config.result.output, 50) }}</template>
              <template v-else-if="node.config.result.status === 'error'">
                <span class="result-error">{{ truncate(node.config.result.error || '未知错误', 40) }}</span>
                <el-button size="small" type="warning" text class="node-retry-btn" @click.stop="retryNode(node.id)">
                  重试
                </el-button>
              </template>
            </div>
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

      <!-- 连线提示 -->
      <div v-if="connectionFrom" class="connection-hint">
        已选择起始节点，请点击目标节点的左侧连接点完成连线（点击空白取消）
      </div>
    </div>

    <!-- 节点配置面板（右侧） -->
    <div v-if="selectedNode" class="config-panel">
      <div class="config-panel-header">
        <span class="config-panel-title">{{ selectedNode.label }} 配置</span>
        <button class="config-panel-close" @click="store.selectNode(null)">×</button>
      </div>
      <div class="config-panel-body">
        <!-- 节点基础信息 -->
        <div class="config-group">
          <label class="config-label">节点名称</label>
          <el-input v-model="editNodeLabel" size="small" @change="saveNodeLabel" />
        </div>

        <!-- 触发器：定时触发 -->
        <template v-if="selectedNode.label === '定时触发'">
          <div class="config-group">
            <label class="config-label">触发间隔（秒）</label>
            <el-input-number v-model="nodeConfig.interval" :min="1" :max="3600" size="small" @change="saveConfig" />
          </div>
          <div class="config-group">
            <label class="config-label">Cron 表达式（可选）</label>
            <el-input v-model="nodeConfig.cron" size="small" placeholder="如 */5 * * * *" @change="saveConfig" />
          </div>
        </template>

        <!-- 数据源：读取字幕 -->
        <template v-if="selectedNode.label === '读取字幕'">
          <div class="config-group">
            <label class="config-label">字幕源概况</label>
            <div class="subtitle-summary">
              <template v-if="videosWithSubtitles.length > 0">
                <div class="summary-row">
                  <span>已识别视频</span>
                  <span>{{ videosWithSubtitles.length }} 个</span>
                </div>
                <div class="summary-row">
                  <span>字幕总数</span>
                  <span>{{ totalSubtitleCount }} 条</span>
                </div>
                <div class="summary-videos">
                  <div v-for="v in videosWithSubtitles" :key="v.id" class="summary-video-item">
                    📹 {{ v.name }} ({{ v.subtitleCount }} 条)
                  </div>
                </div>
              </template>
              <div v-else class="config-hint">
                暂无可用字幕，请先在「工作状态」中为视频进行语音识别
              </div>
            </div>
          </div>
        </template>

        <!-- 数据源：读取视频 / 读取文件 -->
        <template v-if="selectedNode.label === '读取视频' || selectedNode.label === '读取文件'">
          <div class="config-group">
            <label class="config-label">文件路径</label>
            <div class="config-file-input">
              <el-input v-model="nodeConfig.filePath" size="small" placeholder="点击右侧按钮选择文件" />
              <el-button size="small" @click="selectFileForNode">选择</el-button>
            </div>
          </div>
        </template>

        <!-- 数据源：读取文件夹 -->
        <template v-if="selectedNode.label === '读取文件夹'">
          <div class="config-group">
            <label class="config-label">文件夹路径</label>
            <div class="config-file-input">
              <el-input v-model="nodeConfig.folderPath" size="small" placeholder="点击右侧按钮选择文件夹" />
              <el-button size="small" @click="selectFolderForNode">选择</el-button>
            </div>
          </div>
          <div class="config-group">
            <label class="config-label">文件过滤（可选）</label>
            <el-input v-model="nodeConfig.fileFilter" size="small" placeholder="如 *.txt, *.mp4 留空则全部" @change="saveConfig" />
          </div>
          <div class="config-group">
            <label class="config-label">包含子目录</label>
            <el-switch v-model="nodeConfig.recursive" size="small" @change="saveConfig" />
          </div>
        </template>

        <!-- 数据源：新建文档 -->
        <template v-if="selectedNode.label === '新建文档'">
          <div class="config-group">
            <label class="config-label">文件名</label>
            <el-input v-model="nodeConfig.docFileName" size="small" placeholder="如 文案初稿.txt" @change="saveConfig" />
          </div>
          <div class="config-group">
            <label class="config-label">输出目录</label>
            <div class="config-file-input">
              <el-input v-model="nodeConfig.docOutputPath" size="small" placeholder="选择输出目录" />
              <el-button size="small" @click="selectDocOutputFolder">选择</el-button>
            </div>
          </div>
          <div class="config-group">
            <label class="config-label">文件类型</label>
            <el-select v-model="nodeConfig.docFileType" size="small" @change="saveConfig">
              <el-option label="纯文本 (.txt)" value="txt" />
              <el-option label="Markdown (.md)" value="md" />
              <el-option label="JSON (.json)" value="json" />
              <el-option label="字幕 (.srt)" value="srt" />
              <el-option label="CSV (.csv)" value="csv" />
            </el-select>
          </div>
          <div class="config-group">
            <label class="config-label">初始内容（可选）</label>
            <el-input
              v-model="nodeConfig.docContent"
              type="textarea"
              :rows="3"
              placeholder="留空则创建空白文件"
              @change="saveConfig"
            />
          </div>
        </template>

        <!-- 处理：AI文案生成 -->
        <template v-if="selectedNode.label === 'AI文案生成'">
          <div class="config-group">
            <label class="config-label">AI 提示词</label>
            <el-input
              v-model="nodeConfig.prompt"
              type="textarea"
              :rows="4"
              placeholder="输入文案生成的提示词，例如：为以上内容生成5条短视频文案"
              @change="saveConfig"
            />
          </div>
          <div class="config-group">
            <label class="config-label">模型选择</label>
            <el-select v-model="nodeConfig.modelId" size="small" placeholder="默认模型" clearable @change="saveConfig">
              <el-option v-for="m in availableModels" :key="m.id" :label="m.name" :value="m.id" />
            </el-select>
          </div>
        </template>

        <!-- 处理：文本处理 -->
        <template v-if="selectedNode.label === '文本处理'">
          <div class="config-group">
            <label class="config-label">操作类型</label>
            <el-select v-model="nodeConfig.operation" size="small" @change="saveConfig">
              <el-option label="文本替换" value="replace" />
              <el-option label="格式整理" value="format" />
              <el-option label="摘要截取" value="summarize" />
            </el-select>
          </div>
          <template v-if="nodeConfig.operation === 'replace'">
            <div class="config-group">
              <label class="config-label">查找模式（正则）</label>
              <el-input v-model="nodeConfig.pattern" size="small" placeholder="如 [\s]+" @change="saveConfig" />
            </div>
            <div class="config-group">
              <label class="config-label">替换为</label>
              <el-input v-model="nodeConfig.replacement" size="small" placeholder="如 （空格）" @change="saveConfig" />
            </div>
          </template>
        </template>

        <!-- 处理：格式转换 -->
        <template v-if="selectedNode.label === '格式转换'">
          <div class="config-group">
            <label class="config-label">目标格式</label>
            <el-select v-model="nodeConfig.targetFormat" size="small" @change="saveConfig">
              <el-option label="纯文本 (TXT)" value="txt" />
              <el-option label="JSON" value="json" />
              <el-option label="Markdown" value="md" />
              <el-option label="字幕 (SRT)" value="srt" />
            </el-select>
          </div>
        </template>

        <!-- 输出：保存文件 -->
        <template v-if="selectedNode.label === '保存文件'">
          <div class="config-group">
            <label class="config-label">输出目录</label>
            <div class="config-file-input">
              <el-input v-model="nodeConfig.outputPath" size="small" placeholder="选择输出目录" />
              <el-button size="small" @click="selectOutputFolder">选择</el-button>
            </div>
          </div>
          <div class="config-group">
            <label class="config-label">文件名</label>
            <el-input v-model="nodeConfig.fileName" size="small" placeholder="output.txt" @change="saveConfig" />
          </div>
        </template>

        <!-- 输出：导出剪映 -->
        <template v-if="selectedNode.label === '导出剪映'">
          <div class="config-group">
            <label class="config-label">项目名称</label>
            <el-input v-model="nodeConfig.projectName" size="small" placeholder="输入剪映项目名称" @change="saveConfig" />
          </div>
          <div class="config-group">
            <label class="config-label">草稿目录（可选）</label>
            <div class="config-file-input">
              <el-input v-model="nodeConfig.draftPath" size="small" placeholder="默认使用剪映草稿目录" />
              <el-button size="small" @click="selectDraftFolder">选择</el-button>
            </div>
          </div>
        </template>

        <!-- Agent 配置（支持 agent 模式的节点） -->
        <template v-if="selectedNode && supportsAgentMode(selectedNode)">
          <div class="config-divider"></div>
          <div class="config-group">
            <label class="config-label config-label-section">🤖 Agent 配置</label>
          </div>
          <div class="config-group">
            <label class="config-label">运行模式</label>
            <el-select v-model="agentConfig.mode" size="small" @change="saveAgentConfig">
              <el-option label="自动模式" value="automatic" />
              <el-option label="交互模式" value="interactive" />
              <el-option label="审核模式" value="review" />
            </el-select>
            <span class="config-hint">
              {{ agentConfig.mode === 'automatic' ? '直接生成，出错自动重试' : agentConfig.mode === 'interactive' ? '生成后展示，支持反馈修改' : '生成后暂停，等待人工确认' }}
            </span>
          </div>
          <div class="config-group">
            <label class="config-label">最大重试次数</label>
            <el-input-number v-model="agentConfig.maxRetries" :min="0" :max="10" size="small" @change="saveAgentConfig" />
          </div>
          <div class="config-group" v-if="agentConfig.mode === 'interactive' || agentConfig.mode === 'review'">
            <label class="config-label">最大对话轮次</label>
            <el-input-number v-model="agentConfig.maxTurns" :min="1" :max="10" size="small" @change="saveAgentConfig" />
          </div>
          <div class="config-group config-checkbox">
            <el-checkbox v-model="agentConfig.enableCheckpoint" size="small" @change="saveAgentConfig">
              启用检查点（断点续传）
            </el-checkbox>
          </div>
          <div class="config-group config-checkbox" v-if="agentConfig.mode === 'review'">
            <el-checkbox v-model="agentConfig.requireConfirmation" size="small" @change="saveAgentConfig">
              完成后需要用户确认
            </el-checkbox>
          </div>
        </template>

        <!-- 执行结果详情 -->
        <div v-if="selectedNode.config.result && selectedNode.config.result.status !== 'idle'" class="config-group">
          <label class="config-label">执行结果</label>
          <div class="result-detail" :class="'result-' + selectedNode.config.result.status">
            <template v-if="selectedNode.config.result.status === 'success'">
              <div class="result-output">{{ selectedNode.config.result.output }}</div>
              <div v-if="selectedNode.config.result.data?.agentTurns" class="agent-turns-summary">
                <el-divider />
                <span class="turns-label">Agent 对话轮次: {{ (selectedNode.config.result.data.agentTurns || []).length }} 轮</span>
                <div v-for="(turn, ti) in (selectedNode.config.result.data.agentTurns || [])" :key="ti" class="turn-entry" :class="'turn-' + turn.role">
                  <span class="turn-role">{{ turn.role === 'assistant' ? '🤖 AI' : turn.role === 'user' ? '👤 用户' : '⚙️ 系统' }}</span>
                  <span class="turn-content">{{ truncate(turn.content, 100) }}</span>
                </div>
              </div>
            </template>
            <template v-else-if="selectedNode.config.result.status === 'error'">
              {{ selectedNode.config.result.error }}
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- Agent 审核对话框 -->
    <el-dialog
      v-model="showReviewDialog"
      :title="'Agent 审核 — ' + reviewData.nodeLabel"
      width="650px"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      :show-close="false"
      destroy-on-close
    >
      <div class="review-info">
        <span class="review-turn">第 {{ reviewData.turn }}/{{ reviewData.maxTurns }} 轮</span>
      </div>
      <div class="review-content">
        <div class="review-label">AI 生成内容：</div>
        <div class="review-text">{{ reviewData.output }}</div>
      </div>
      <div class="review-feedback" v-if="!reviewApproved">
        <div class="review-label">修改意见（通过则留空）：</div>
        <el-input
          v-model="reviewFeedback"
          type="textarea"
          :rows="3"
          placeholder="输入修改意见，例如：让语气更活泼一些、缩短到 200 字以内..."
        />
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="submitReview(true)" type="primary">
            通过审核
          </el-button>
          <el-button @click="submitReview(false)" type="warning" :disabled="!reviewFeedback.trim()">
            提交修改意见
          </el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useCreatorModeStore, type NodeConfig } from '@/stores/creatorMode'
import { useChatStore } from '@/stores/chat'
import { useEventBus } from '@/services/eventBus'
import { loadCheckpoint, getAgentConfig, setAgentConfig, supportsAgentMode, submitAgentReview, cancelAgentReview, type AgentConfig } from '@/services/creatorAgent'

const store = useCreatorModeStore()
const chatStore = useChatStore()
const { on, emit } = useEventBus()

const canvasContainerRef = ref<HTMLElement | null>(null)
const canvasW = ref(3000)
const canvasH = ref(2000)

// 画布拖拽
const isDraggingCanvas = ref(false)
const isSpacePressed = ref(false)
const dragStart = reactive({ x: 0, y: 0 })
let dragButton = 0           // 0=左键, 1=中键
let nodeDragId: string | null = null
let nodeDragStart = { x: 0, y: 0 }
let connectionFrom: string | null = null
const hoveredEdgeId = ref<string | null>(null)

// 节点配置面板
const editNodeLabel = ref('')
const nodeConfig = reactive<NodeConfig>({})

const selectedNode = computed(() => {
  return store.workflowNodes.find(n => n.id === store.selectedNodeId) || null
})

// 检查点状态
const hasCheckpoint = computed(() => loadCheckpoint() !== null)

// Agent 配置
const agentConfig = reactive<AgentConfig>({
  mode: 'automatic',
  maxRetries: 2,
  enableCheckpoint: true,
  requireConfirmation: false,
  maxTurns: 3
})

// Agent 审核对话框
const showReviewDialog = ref(false)
const reviewApproved = ref(false)
const reviewFeedback = ref('')
const reviewData = reactive({
  nodeId: '',
  nodeLabel: '',
  output: '',
  turn: 1,
  maxTurns: 3
})

function submitReview(approved: boolean) {
  if (!approved && !reviewFeedback.value.trim()) return
  submitAgentReview(reviewData.nodeId, approved, approved ? undefined : reviewFeedback.value.trim())
  showReviewDialog.value = false
  reviewFeedback.value = ''
  reviewApproved.value = false
}

// 当选中节点变化时，同步配置面板
watch(() => store.selectedNodeId, (newId) => {
  const node = store.workflowNodes.find(n => n.id === newId)
  if (node) {
    editNodeLabel.value = node.label
    Object.assign(nodeConfig, { ...node.config })
    delete (nodeConfig as any).result // 不显示 result 在编辑中
    // 同步 Agent 配置
    const ac = getAgentConfig(node)
    Object.assign(agentConfig, ac)
  }
})

// 可用模型列表（从全局模型管理读取）
const availableModels = computed(() => chatStore.models)

// 有字幕的视频列表
const videosWithSubtitles = computed(() => {
  return store.importedVideos
    .filter(v => v.subtitles.length > 0)
    .map(v => ({
      id: v.id,
      name: v.name,
      subtitleCount: v.subtitles.length,
      subtitles: v.subtitles
    }))
})

const totalSubtitleCount = computed(() =>
  videosWithSubtitles.value.reduce((sum, v) => sum + v.subtitleCount, 0)
)

function nodeIcon(type: string): string {
  const icons: Record<string, string> = { trigger: '⏰', source: '📥', process: '⚙️', output: '📤' }
  return icons[type] || '📦'
}

function nodeTypeLabel(type: string): string {
  const labels: Record<string, string> = { trigger: '触发器', source: '数据源', process: '处理节点', output: '输出节点' }
  return labels[type] || type
}

function statusEmoji(status: string): string {
  const map: Record<string, string> = { running: '⏳', success: '✅', error: '❌' }
  return map[status] || ''
}

function nodeStatusClass(node: any): string {
  if (!node.config.result) return ''
  return 'status-' + node.config.result.status
}

function truncate(text: string, max: number): string {
  if (!text) return ''
  return text.length > max ? text.slice(0, max) + '...' : text
}

function addNodeAtCenter(type: 'trigger' | 'source' | 'process' | 'output', label: string) {
  const x = 200 + Math.random() * 400
  const y = 100 + Math.random() * 300
  store.addNode(type, label, x, y)
  ElMessage.success(`已添加节点: ${label}`)
}

function clearCanvas() {
  ElMessageBox.confirm('确定要清空画布吗？所有节点和连线将被删除。', '确认', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    store.workflowNodes.length = 0
    store.workflowEdges.length = 0
    store.selectedNodeId = null
    ElMessage.success('画布已清空')
  }).catch(() => {})
}

function getNodeCenter(nodeId: string): { x: number; y: number } {
  const node = store.workflowNodes.find(n => n.id === nodeId)
  if (!node) return { x: 0, y: 0 }
  return { x: node.x + 80, y: node.y + 40 }
}

// ===== 全局鼠标事件（在 window 上捕获，确保拖出画布也不丢失） =====

function onWindowMouseMove(e: MouseEvent) {
  // 画布平移
  if (isDraggingCanvas.value) {
    store.setCanvasOffset(e.clientX - dragStart.x, e.clientY - dragStart.y)
  }
  // 节点拖拽
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

function onWindowMouseUp(_e: MouseEvent) {
  isDraggingCanvas.value = false
  nodeDragId = null
  dragButton = 0
}

// ===== 键盘事件（空格键临时切为拖拽模式） =====

function onWindowKeyDown(e: KeyboardEvent) {
  if (e.code === 'Space' && !isSpacePressed.value) {
    // 仅在画布区域内触发，避免干扰输入框
    const target = e.target as HTMLElement
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
    e.preventDefault()
    isSpacePressed.value = true
  }
}

function onWindowKeyUp(e: KeyboardEvent) {
  if (e.code === 'Space') {
    isSpacePressed.value = false
  }
}

onMounted(() => {
  window.addEventListener('mousemove', onWindowMouseMove)
  window.addEventListener('mouseup', onWindowMouseUp)
  window.addEventListener('keydown', onWindowKeyDown)
  window.addEventListener('keyup', onWindowKeyUp)

  // ===== 事件驱动框架：监听工作流执行事件 =====
  on('creator:workflow:executionStarted', ({ totalNodes }) => {
    ElMessage.info(`工作流开始执行，共 ${totalNodes} 个节点`)
  })

  on('creator:workflow:nodeExecutionStarted', ({ label }) => {
    // 画布自动追踪正在执行的节点，无需手动轮询
  })

  on('creator:workflow:nodeExecutionCompleted', ({ label, result }) => {
    if (result.status === 'error') {
      ElMessage.error(`节点「${label}」执行失败: ${result.error}`)
    }
  })

  // Agent 审核请求
  on('creator:workflow:agentReviewRequested', ({ nodeId, nodeLabel, output, turn, maxTurns }) => {
    reviewData.nodeId = nodeId
    reviewData.nodeLabel = nodeLabel
    reviewData.output = output
    reviewData.turn = turn
    reviewData.maxTurns = maxTurns
    reviewFeedback.value = ''
    reviewApproved.value = false
    showReviewDialog.value = true
  })
})

onUnmounted(() => {
  window.removeEventListener('mousemove', onWindowMouseMove)
  window.removeEventListener('mouseup', onWindowMouseUp)
  window.removeEventListener('keydown', onWindowKeyDown)
  window.removeEventListener('keyup', onWindowKeyUp)
})

// ===== 画布平移/缩放 =====

/** 判断点击是否落在画布空白区域（可触发平移） */
function isCanvasBackground(target: HTMLElement): boolean {
  if (target === canvasContainerRef.value) return true
  // 检查是否是 canvas-content 本身或其下的 svg/rect
  if (target.classList.contains('canvas-content') || target.classList.contains('canvas-svg')) return true
  // 落在 svg 内的 rect/pattern 等子元素
  const parent = target.parentElement
  if (parent && (parent.classList.contains('canvas-svg') || parent === canvasContainerRef.value)) return true
  return false
}

function onCanvasMouseDown(e: MouseEvent) {
  const target = e.target as HTMLElement

  // 中键按下 → 平移（传统画布操作）
  if (e.button === 1) {
    isDraggingCanvas.value = true
    dragButton = 1
    dragStart.x = e.clientX - store.canvasOffset.x
    dragStart.y = e.clientY - store.canvasOffset.y
    return
  }

  // 左键按下 + 空格键 → 平移
  if (e.button === 0 && isSpacePressed.value) {
    isDraggingCanvas.value = true
    dragButton = 0
    dragStart.x = e.clientX - store.canvasOffset.x
    dragStart.y = e.clientY - store.canvasOffset.y
    return
  }

  // 左键按下在画布空白区域 → 平移
  if (e.button === 0 && isCanvasBackground(target)) {
    isDraggingCanvas.value = true
    dragButton = 0
    dragStart.x = e.clientX - store.canvasOffset.x
    dragStart.y = e.clientY - store.canvasOffset.y
    // 点击空白取消连线
    if (connectionFrom) {
      connectionFrom = null
    }
  }
}

function onCanvasWheel(e: WheelEvent) {
  // Ctrl + 滚轮 → 缩放（以鼠标位置为中心）
  if (e.ctrlKey || e.metaKey) {
    const rect = canvasContainerRef.value?.getBoundingClientRect()
    if (!rect) return
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const oldScale = store.canvasScale
    const delta = e.deltaY > 0 ? -0.05 : 0.05
    const newScale = Math.max(0.3, Math.min(3, oldScale + delta))

    // 以鼠标位置为中心缩放
    const scaleFactor = newScale / oldScale
    const newOffsetX = mouseX - (mouseX - store.canvasOffset.x) * scaleFactor
    const newOffsetY = mouseY - (mouseY - store.canvasOffset.y) * scaleFactor

    store.setCanvasScale(newScale)
    store.setCanvasOffset(newOffsetX, newOffsetY)
    return
  }

  // 普通滚轮 → 垂直/水平平移
  const panSpeed = 1.5
  store.setCanvasOffset(
    store.canvasOffset.x - e.deltaX * panSpeed,
    store.canvasOffset.y - e.deltaY * panSpeed
  )
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
    ElMessage.info('请点击目标节点的左侧连接点完成连线')
  } else if (connectionFrom && connectionFrom !== nodeId) {
    const edge = store.addEdge(connectionFrom, nodeId)
    connectionFrom = null
    if (edge) {
      ElMessage.success('连线已创建')
    } else {
      ElMessage.warning('无法创建连线：连接已存在或会导致循环引用')
    }
  }
}

// 删除连线
function deleteEdge(edgeId: string) {
  ElMessageBox.confirm('确定要删除这条连线吗？', '确认', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'info'
  }).then(() => {
    store.removeEdge(edgeId)
    ElMessage.success('连线已删除')
  }).catch(() => {})
}

// ===== 节点配置面板 =====
function saveNodeLabel() {
  if (!store.selectedNodeId || !editNodeLabel.value.trim()) return
  const node = store.workflowNodes.find(n => n.id === store.selectedNodeId)
  if (node) {
    node.label = editNodeLabel.value.trim()
    // 手动触发 save
    store.updateNodeConfig(store.selectedNodeId, {})
  }
}

function saveConfig() {
  if (!store.selectedNodeId) return
  const cfg: NodeConfig = { ...nodeConfig }
  delete (cfg as any).result
  store.updateNodeConfig(store.selectedNodeId, cfg)
  // 同步 Agent 配置
  const node = store.workflowNodes.find(n => n.id === store.selectedNodeId)
  if (node && supportsAgentMode(node)) {
    setAgentConfig(node, { ...agentConfig })
  }
}

function saveAgentConfig() {
  if (!store.selectedNodeId) return
  const node = store.workflowNodes.find(n => n.id === store.selectedNodeId)
  if (node) {
    setAgentConfig(node, { ...agentConfig })
  }
}

async function retryNode(nodeId: string) {
  try {
    await store.retryNode(nodeId)
  } catch (e: any) {
    ElMessage.error(`重试失败: ${e.message || e}`)
  }
}

async function resumeWorkflow() {
  try {
    await store.resumeWorkflow()
  } catch (e: any) {
    ElMessage.error(`恢复执行失败: ${e.message || e}`)
  }
}

async function selectFileForNode() {
  const api = (window as any).electronAPI
  if (api?.selectFile) {
    const result = await api.selectFile()
    if (result && result.filePath) {
      nodeConfig.filePath = result.filePath
      saveConfig()
    }
  } else {
    ElMessage.warning('文件选择功能仅在 Electron 环境下可用')
  }
}

async function selectFolderForNode() {
  const api = (window as any).electronAPI
  if (api?.selectFolder) {
    const result = await api.selectFolder()
    if (result) {
      nodeConfig.folderPath = result
      saveConfig()
    }
  } else {
    ElMessage.warning('文件夹选择功能仅在 Electron 环境下可用')
  }
}

async function selectOutputFolder() {
  const api = (window as any).electronAPI
  if (api?.selectFolder) {
    const result = await api.selectFolder()
    if (result) {
      nodeConfig.outputPath = result
      saveConfig()
    }
  } else {
    ElMessage.warning('文件夹选择功能仅在 Electron 环境下可用')
  }
}

async function selectDraftFolder() {
  const api = (window as any).electronAPI
  if (api?.selectFolder) {
    const result = await api.selectFolder()
    if (result) {
      nodeConfig.draftPath = result
      saveConfig()
    }
  } else {
    ElMessage.warning('文件夹选择功能仅在 Electron 环境下可用')
  }
}

async function selectDocOutputFolder() {
  const api = (window as any).electronAPI
  if (api?.selectFolder) {
    const result = await api.selectFolder()
    if (result) {
      nodeConfig.docOutputPath = result
      saveConfig()
    }
  } else {
    ElMessage.warning('文件夹选择功能仅在 Electron 环境下可用')
  }
}

// ===== 工作流执行 =====
async function runWorkflow() {
  if (store.workflowNodes.length === 0) {
    ElMessage.warning('画布中没有节点，请先添加节点')
    return
  }
  try {
    await store.executeWorkflow()
    ElMessage.success('工作流执行完毕')
  } catch (e: any) {
    ElMessage.error('工作流执行出错: ' + (e.message || String(e)))
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
  width: 200px;
  min-width: 200px;
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
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* 执行日志 */
.workflow-logs {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #f0f2f5;
}

.logs-title {
  font-size: 11px;
  font-weight: 600;
  color: #909399;
  margin-bottom: 4px;
}

.logs-list {
  max-height: 200px;
  overflow-y: auto;
  font-size: 11px;
  font-family: 'Consolas', 'Courier New', monospace;
  line-height: 1.6;
  color: #606266;
}

.log-line {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.log-success { color: #67c23a; }
.log-error { color: #f56c6c; }

/* 画布 */
.canvas-area {
  flex: 1;
  overflow: hidden;
  position: relative;
  background: #fafbfc;
  cursor: default;
}

.canvas-area.canvas-grabbing {
  cursor: grabbing;
}

.canvas-content {
  position: relative;
  width: 3000px;
  height: 2000px;
}

.canvas-svg {
  pointer-events: none;
}

.edges-svg {
  pointer-events: auto;
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
  transition: border-color 0.15s, box-shadow 0.15s;
}

.wf-node:hover { border-color: #c0c4cc; }
.wf-node.selected { border-color: #409eff; box-shadow: 0 2px 12px rgba(64,158,255,0.2); }

.node-trigger { border-left: 3px solid #e6a23c; }
.node-source { border-left: 3px solid #67c23a; }
.node-process { border-left: 3px solid #409eff; }
.node-output { border-left: 3px solid #f56c6c; }

/* 节点执行状态 */
.wf-node.status-running { border-color: #e6a23c; box-shadow: 0 0 8px rgba(230,162,60,0.3); }
.wf-node.status-success { border-color: #67c23a; box-shadow: 0 0 8px rgba(103,194,58,0.2); }
.wf-node.status-error { border-color: #f56c6c; box-shadow: 0 0 8px rgba(245,108,108,0.3); }

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
  flex: 1;
}

.node-status {
  font-size: 12px;
  flex-shrink: 0;
}

.node-body {
  padding: 6px 10px;
}

.node-type {
  font-size: 11px;
  color: #c0c4cc;
}

.node-result {
  margin-top: 4px;
  font-size: 11px;
  color: #303133;
  line-height: 1.4;
  max-height: 36px;
  overflow: hidden;
}

.result-error { color: #f56c6c; }

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

/* 连线提示 */
.connection-hint {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  background: #ecf5ff;
  border: 1px solid #409eff;
  color: #409eff;
  padding: 6px 16px;
  border-radius: 6px;
  font-size: 12px;
  z-index: 10;
}

/* 节点配置面板（右侧） */
.config-panel {
  width: 260px;
  min-width: 260px;
  background: #fff;
  border-left: 1px solid #e4e7ed;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.config-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid #f0f2f5;
  position: sticky;
  top: 0;
  background: #fff;
  z-index: 1;
}

.config-panel-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.config-panel-close {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1px solid #e4e7ed;
  background: #fff;
  color: #909399;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.config-panel-close:hover { color: #f56c6c; border-color: #f56c6c; }

.config-panel-body {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.config-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.config-label {
  font-size: 12px;
  font-weight: 500;
  color: #606266;
}

.config-file-input {
  display: flex;
  gap: 4px;
}
.config-file-input .el-input { flex: 1; }

.result-detail {
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.6;
  max-height: 200px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.result-success {
  background: #f0f9eb;
  border: 1px solid #e1f3d8;
  color: #67c23a;
}

.result-error {
  background: #fef0f0;
  border: 1px solid #fde2e2;
  color: #f56c6c;
}

/* 字幕源概况 */
.config-hint {
  font-size: 11px;
  color: #e6a23c;
  padding: 4px 0;
}

.subtitle-summary {
  background: #fafbfc;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 8px 10px;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  line-height: 1.8;
  color: #606266;
}

.summary-row span:last-child {
  font-weight: 600;
  color: #303133;
}

.summary-videos {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid #ebeef5;
  max-height: 180px;
  overflow-y: auto;
}

.summary-video-item {
  font-size: 11px;
  color: #606266;
  line-height: 1.6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Agent 节点徽章 */
.node-agent-badge {
  font-size: 12px;
  flex-shrink: 0;
  cursor: help;
}

/* 节点重试按钮 */
.node-retry-btn {
  margin-top: 4px;
  font-size: 11px;
  padding: 2px 8px;
}

/* 配置面板分隔线 */
.config-divider {
  height: 1px;
  background: #e4e7ed;
  margin: 4px 0;
}

/* 配置面板 checkbox 项 */
.config-checkbox {
  flex-direction: row;
  align-items: center;
}

/* 配置面板 section 标题 */
.config-label-section {
  font-size: 13px;
  font-weight: 600;
  color: #409eff;
}

/* 配置面板 hint */
.config-hint {
  font-size: 11px;
  color: #909399;
  line-height: 1.4;
}

/* 执行结果输出 */
.result-output {
  white-space: pre-wrap;
  word-break: break-word;
}

/* Agent 对话轮次 */
.agent-turns-summary {
  margin-top: 8px;
  font-size: 11px;
}

.turns-label {
  font-weight: 600;
  color: #409eff;
  display: block;
  margin-bottom: 6px;
}

.turn-entry {
  padding: 4px 6px;
  margin-bottom: 4px;
  border-radius: 4px;
  background: #f5f7fa;
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.turn-entry.turn-assistant {
  background: #ecf5ff;
  border-left: 2px solid #409eff;
}

.turn-entry.turn-user {
  background: #f0f9eb;
  border-left: 2px solid #67c23a;
}

.turn-entry.turn-system {
  background: #fdf6ec;
  border-left: 2px solid #e6a23c;
}

.turn-role {
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
  color: #606266;
}

.turn-content {
  color: #303133;
  line-height: 1.4;
}

/* Agent 审核对话框 */
.review-info {
  margin-bottom: 12px;
}

.review-turn {
  font-size: 13px;
  font-weight: 600;
  color: #409eff;
  background: #ecf5ff;
  padding: 4px 12px;
  border-radius: 12px;
}

.review-content {
  margin-bottom: 16px;
}

.review-label {
  font-size: 13px;
  font-weight: 500;
  color: #303133;
  margin-bottom: 8px;
}

.review-text {
  padding: 12px;
  background: #fafbfc;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  font-size: 14px;
  line-height: 1.7;
  max-height: 300px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.review-feedback {
  margin-top: 16px;
}
</style>
