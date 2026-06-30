<template>
  <div class="infinite-canvas-wrapper">
    <!-- 节点工具箱 -->
    <div class="workflow-palette">
      <div class="palette-title">
        <span class="palette-logo">🧩</span>
        <span>节点工具箱</span>
      </div>

      <div v-for="cat in store.PALETTE_CATEGORIES" :key="cat.key" class="node-category">
        <span class="cat-label" :style="{ color: cat.color, borderLeftColor: cat.color }">
          {{ cat.label }}
        </span>
        <button
          v-for="item in paletteByCategory(cat.key)"
          :key="item.label"
          class="node-btn"
          :class="'btn-' + cat.key"
          :style="{ '--cat-color': cat.color } as any"
          @click="addNodeAtCenter(cat.key, item.label)"
          :title="item.desc || item.label"
        >
          <span class="node-btn-icon">{{ item.icon }}</span>
          <span class="node-btn-label">{{ item.label }}</span>
        </button>
      </div>

      <div class="palette-actions">
        <el-button
          class="run-btn"
          size="small"
          type="primary"
          @click="runWorkflow"
          :loading="store.isWorkflowRunning"
          :disabled="store.isWorkflowRunning"
        >
          <span v-if="!store.isWorkflowRunning" class="run-btn-inner">
            <span class="run-icon">▶</span> 一键执行
          </span>
          <span v-else>执行中...</span>
        </el-button>
        <el-button size="small" @click="clearCanvas" :disabled="store.isWorkflowRunning">
          🗑 清空画布
        </el-button>
      </div>

      <!-- 执行日志 -->
      <div v-if="store.workflowLogs.length > 0" class="workflow-logs">
        <div class="logs-title">📋 执行日志</div>
        <div class="logs-list">
          <div
            v-for="(log, i) in store.workflowLogs"
            :key="i"
            class="log-line"
            :class="logLineClass(log)"
          >
            <span class="log-dot" :class="logLineClass(log)"></span>
            <span class="log-text">{{ log }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 无限画布 -->
    <div
      class="canvas-area"
      :class="{ 'canvas-grabbing': isDraggingCanvas, 'workflow-running': store.isWorkflowRunning }"
      ref="canvasContainerRef"
      @mousedown="onCanvasMouseDown"
      @wheel.prevent="onCanvasWheel"
      @contextmenu.prevent
    >
      <div
        class="canvas-content"
        :class="{ 'executing-pulse': store.isWorkflowRunning }"
        :style="{
          transform: `translate(${store.canvasOffset.x}px, ${store.canvasOffset.y}px) scale(${store.canvasScale})`,
          transformOrigin: '0 0'
        }"
      >
        <!-- 网格背景 -->
        <svg class="canvas-svg" :width="canvasW" :height="canvasH">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="var(--c-border, #eaecef)" stroke-width="0.5"/>
            </pattern>
            <pattern id="grid-major" width="200" height="200" patternUnits="userSpaceOnUse">
              <rect width="200" height="200" fill="url(#grid)"/>
              <path d="M 200 0 L 0 0 0 200" fill="none" stroke="var(--c-border-strong, #dcdfe6)" stroke-width="1"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid-major)" />
        </svg>

        <!-- 连线 -->
        <svg class="edges-svg" :width="canvasW" :height="canvasH" style="position:absolute;top:0;left:0;">
          <g v-for="edge in store.workflowEdges" :key="edge.id">
            <line
              :x1="getNodeCenter(edge.fromNodeId).x"
              :y1="getNodeCenter(edge.fromNodeId).y"
              :x2="getNodeCenter(edge.toNodeId).x"
              :y2="getNodeCenter(edge.toNodeId).y"
              stroke="transparent"
              stroke-width="14"
              style="cursor:pointer"
              @click.stop="deleteEdge(edge.id)"
              @mouseenter="hoveredEdgeId = edge.id"
              @mouseleave="hoveredEdgeId = null"
            />
            <line
              :x1="getNodeCenter(edge.fromNodeId).x"
              :y1="getNodeCenter(edge.fromNodeId).y"
              :x2="getNodeCenter(edge.toNodeId).x"
              :y2="getNodeCenter(edge.toNodeId).y"
              :stroke="hoveredEdgeId === edge.id ? 'var(--c-danger, #f56c6c)' : 'var(--c-primary, #409eff)'"
              :stroke-width="hoveredEdgeId === edge.id ? 3 : 2"
              marker-end="url(#arrowhead)"
              style="pointer-events:none; stroke-linecap: round;"
            />
          </g>
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" :fill="'var(--c-primary, #409eff)'"/>
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
            nodeStatusClass(node),
            { 'has-warning': nodeHasWarning(node) }
          ]"
          :style="{
            left: node.x + 'px',
            top: node.y + 'px',
            '--node-accent': categoryColor(node.type)
          } as any"
          @mousedown.stop="onNodeDragStart($event, node.id)"
          @click.stop="store.selectNode(node.id)"
        >
          <div class="node-header">
            <span class="node-icon">{{ nodeIcon(node) }}</span>
            <span class="node-label" :title="node.label">{{ node.label }}</span>
            <span v-if="node.config.result" class="node-status" :class="'status-' + node.config.result.status">
              {{ statusEmoji(node.config.result.status) }}
            </span>
          </div>
          <div class="node-body">
            <span class="node-type">{{ nodeTypeLabel(node.type) }}</span>
            <div v-if="node.config.result && node.config.result.status !== 'idle'" class="node-result">
              <template v-if="node.config.result.status === 'running'">
                <span class="running-dot"></span>执行中...
              </template>
              <template v-else-if="node.config.result.status === 'success'">
                {{ truncate(node.config.result.output, 40) }}
              </template>
              <template v-else-if="node.config.result.status === 'error'">
                <span class="result-error">{{ truncate(node.config.result.error || '未知错误', 36) }}</span>
              </template>
            </div>
            <!-- 重复度检查特有警告徽标 -->
            <div v-if="nodeHasWarning(node)" class="node-warning-badge" :title="warningTooltip(node)">
              ⚠️ {{ nodeWarningText(node) }}
            </div>
          </div>
          <div class="node-connector in" @mousedown.stop="startConnection(node.id, 'to')" title="输入"></div>
          <div class="node-connector out" @mousedown.stop="startConnection(node.id, 'from')" title="输出"></div>
          <button class="node-delete" @click.stop="store.removeNode(node.id)">×</button>
        </div>
      </div>

      <!-- 画布控制栏 -->
      <div class="canvas-controls">
        <el-button-group size="small">
          <el-button @click="store.setCanvasScale(Math.min(3, store.canvasScale + 0.1))">+</el-button>
          <el-button disabled>{{ Math.round(store.canvasScale * 100) }}%</el-button>
          <el-button @click="store.setCanvasScale(Math.max(0.3, store.canvasScale - 0.1))">-</el-button>
        </el-button-group>
        <el-button size="small" @click="resetView">重置视图</el-button>
      </div>

      <!-- 执行进度覆盖层 -->
      <div v-if="store.isWorkflowRunning" class="execution-overlay">
        <div class="exec-spinner"></div>
        <span>正在执行工作流...</span>
      </div>

      <!-- 连线提示 -->
      <div v-if="connectionFrom" class="connection-hint">
        已选择输出节点，请点击目标节点的<b>左侧</b>连接点完成连线（点击空白取消）
      </div>
    </div>

    <!-- 节点配置面板（右侧） -->
    <div v-if="selectedNode" class="config-panel">
      <div class="config-panel-header" :style="{ borderLeftColor: categoryColor(selectedNode.type) }">
        <span class="config-panel-icon">{{ nodeIcon(selectedNode) }}</span>
        <span class="config-panel-title">{{ selectedNode.label }}</span>
        <button class="config-panel-close" @click="store.selectNode(null)">×</button>
      </div>
      <div class="config-panel-body">
        <!-- 节点基础信息 -->
        <div class="config-group">
          <label class="config-label">节点名称</label>
          <el-input v-model="editNodeLabel" size="small" @change="saveNodeLabel" />
        </div>

        <!-- 计划执行 -->
        <template v-if="selectedNode.label === '计划执行' || selectedNode.label === '定时触发'">
          <div class="config-group">
            <label class="config-label">触发间隔（秒）</label>
            <el-input-number v-model="nodeConfig.interval" :min="1" :max="86400" size="small" @change="saveConfig" />
          </div>
          <div class="config-group">
            <label class="config-label">执行频率说明</label>
            <el-input v-model="nodeConfig.schedule" size="small" placeholder="如 每5分钟 / 每天9点" @change="saveConfig" />
          </div>
          <div class="config-group">
            <label class="config-label">Cron 表达式（可选）</label>
            <el-input v-model="nodeConfig.cron" size="small" placeholder="如 */5 * * * *" @change="saveConfig" />
          </div>
          <div class="config-tip">💡 计划触发器作为工作流起点，发出触发信号</div>
        </template>

        <!-- 读取字幕 -->
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

        <!-- 读取视频 / 读取文件 -->
        <template v-if="selectedNode.label === '读取视频' || selectedNode.label === '读取文件'">
          <div class="config-group">
            <label class="config-label">文件路径</label>
            <div class="config-file-input">
              <el-input v-model="nodeConfig.filePath" size="small" placeholder="点击右侧按钮选择文件" />
              <el-button size="small" @click="selectFileForNode">选择</el-button>
            </div>
          </div>
        </template>

        <!-- 批量读取 -->
        <template v-if="selectedNode.label === '批量读取' || selectedNode.label === '读取文件夹'">
          <div class="config-group">
            <label class="config-label">文件夹路径</label>
            <div class="config-file-input">
              <el-input v-model="nodeConfig.folderPath" size="small" placeholder="点击右侧按钮选择文件夹" />
              <el-button size="small" @click="selectFolderForNode">选择</el-button>
            </div>
          </div>
          <div class="config-group">
            <label class="config-label">文件类型</label>
            <el-select v-model="nodeConfig.fileTypes" size="small" @change="saveConfig">
              <el-option label="全部文件" value="all" />
              <el-option label="视频文件" value="video" />
              <el-option label="文本文件" value="text" />
              <el-option label="字幕文件" value="subtitle" />
            </el-select>
          </div>
          <div class="config-group">
            <label class="config-label">文件过滤（可选，逗号分隔）</label>
            <el-input v-model="nodeConfig.fileFilter" size="small" placeholder="如 *.txt, *.mp4" @change="saveConfig" />
          </div>
          <div class="config-group">
            <label class="config-label">包含子目录</label>
            <el-switch v-model="nodeConfig.recursive" size="small" @change="saveConfig" />
          </div>
        </template>

        <!-- 新建文档 -->
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

        <!-- AI文案生成 -->
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

        <!-- 文案润色 -->
        <template v-if="selectedNode.label === '文案润色'">
          <div class="config-group">
            <label class="config-label">目标平台</label>
            <el-select v-model="nodeConfig.polishPlatform" size="small" @change="saveConfig">
              <el-option label="抖音" value="douyin" />
              <el-option label="小红书" value="xiaohongshu" />
              <el-option label="视频号" value="shipinhao" />
              <el-option label="快手" value="kuaishou" />
            </el-select>
          </div>
          <div class="config-group">
            <label class="config-label">网感强度</label>
            <el-radio-group v-model="nodeConfig.polishIntensity" size="small" @change="saveConfig">
              <el-radio-button label="low">低</el-radio-button>
              <el-radio-button label="medium">中</el-radio-button>
              <el-radio-button label="high">高</el-radio-button>
            </el-radio-group>
          </div>
          <div class="config-group">
            <label class="config-label">模型选择（可选）</label>
            <el-select v-model="nodeConfig.modelId" size="small" placeholder="默认模型" clearable @change="saveConfig">
              <el-option v-for="m in availableModels" :key="m.id" :label="m.name" :value="m.id" />
            </el-select>
          </div>
          <div class="config-tip">✨ AI 将根据平台调性润色文案，增加网感与情绪钩子</div>
        </template>

        <!-- 爆款标题生成 -->
        <template v-if="selectedNode.label === '爆款标题生成'">
          <div class="config-group">
            <label class="config-label">目标平台</label>
            <el-select v-model="nodeConfig.titlePlatform" size="small" @change="saveConfig">
              <el-option label="抖音" value="douyin" />
              <el-option label="小红书" value="xiaohongshu" />
              <el-option label="视频号" value="shipinhao" />
              <el-option label="快手" value="kuaishou" />
            </el-select>
          </div>
          <div class="config-group">
            <label class="config-label">标题数量</label>
            <el-slider v-model="nodeConfig.titleCount" :min="3" :max="10" :step="1" show-stops @change="saveConfig" />
          </div>
          <div class="config-group">
            <label class="config-label">模型选择（可选）</label>
            <el-select v-model="nodeConfig.modelId" size="small" placeholder="默认模型" clearable @change="saveConfig">
              <el-option v-for="m in availableModels" :key="m.id" :label="m.name" :value="m.id" />
            </el-select>
          </div>
          <div class="config-tip">🔥 生成多个含数字/反差/悬念/利益点的爆款标题选项</div>
        </template>

        <!-- 文本处理 -->
        <template v-if="selectedNode.label === '文本处理'">
          <div class="config-group">
            <label class="config-label">操作类型</label>
            <el-select v-model="nodeConfig.operation" size="small" @change="saveConfig">
              <el-option label="格式整理" value="format" />
              <el-option label="文本替换" value="replace" />
              <el-option label="摘要截取" value="summarize" />
              <el-option label="行去重" value="dedup" />
              <el-option label="提取关键词" value="keywords" />
              <el-option label="自动摘要" value="abstract" />
              <el-option label="字数统计" value="wordcount" />
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

        <!-- 字幕生成 -->
        <template v-if="selectedNode.label === '字幕生成'">
          <div class="config-group">
            <label class="config-label">语速（字/分钟）</label>
            <el-slider v-model="nodeConfig.speechRate" :min="120" :max="450" :step="10" :marks="{ 180: '慢', 250: '中', 350: '快' }" @change="saveConfig" />
            <div class="config-tip">🎞 按标点分句，根据字数和语速自动估算时间戳，输出 SRT 字幕</div>
          </div>
        </template>

        <!-- 重复度检查 -->
        <template v-if="selectedNode.label === '重复度检查'">
          <div class="config-group">
            <label class="config-label">检查模式</label>
            <el-radio-group v-model="nodeConfig.dupMode" size="small" @change="saveConfig">
              <el-radio-button label="exact">精确重复</el-radio-button>
              <el-radio-button label="semantic">语义近似</el-radio-button>
              <el-radio-button label="clickbait">标题党</el-radio-button>
            </el-radio-group>
          </div>
          <div class="config-group">
            <label class="config-label">相似度阈值 (%)</label>
            <el-slider v-model="nodeConfig.dupThreshold" :min="30" :max="100" :step="5" :marks="{ 50: '宽松', 70: '默认', 90: '严格' }" @change="saveConfig" />
          </div>
          <div class="config-tip">🔍 本地算法检测，不调用 AI。精确模式使用字符 Jaccard 相似度；语义模式降低阈值并检测疑似重复；标题党模式检测夸张词汇。</div>
        </template>

        <!-- 保存文件 -->
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

        <!-- 导出剪映 -->
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

        <!-- 执行结果详情 -->
        <div v-if="selectedNode.config.result && selectedNode.config.result.status !== 'idle'" class="config-group result-group">
          <label class="config-label">执行结果</label>
          <div class="result-detail" :class="'result-' + selectedNode.config.result.status">
            <template v-if="selectedNode.config.result.status === 'success'">
              <template v-if="selectedNode.config.result.data?.report">
                <pre class="result-pre">{{ selectedNode.config.result.data.report }}</pre>
              </template>
              <template v-else-if="Array.isArray(selectedNode.config.result.data?.titles)">
                <div class="titles-list">
                  <div v-for="(t, i) in selectedNode.config.result.data.titles" :key="i" class="title-item">
                    <span class="title-idx">{{ i + 1 }}.</span>{{ t }}
                  </div>
                </div>
              </template>
              <template v-else>
                {{ selectedNode.config.result.data?.outputText || selectedNode.config.result.data?.content || selectedNode.config.result.output }}
              </template>
            </template>
            <template v-else-if="selectedNode.config.result.status === 'running'">
              <span class="running-dot"></span>正在执行...
            </template>
            <template v-else-if="selectedNode.config.result.status === 'error'">
              {{ selectedNode.config.result.error }}
            </template>
          </div>
          <!-- 重复度检查快捷指标 -->
          <div v-if="selectedNode.label === '重复度检查' && selectedNode.config.result.data" class="quality-stats">
            <div class="quality-stat">
              <span class="stat-label">重复率</span>
              <span class="stat-value" :class="qualityStatClass(selectedNode)">{{ selectedNode.config.result.data.rate }}%</span>
            </div>
            <div class="quality-stat">
              <span class="stat-label">重复段</span>
              <span class="stat-value">{{ selectedNode.config.result.data.duplicates?.length || 0 }}</span>
            </div>
            <div class="quality-stat">
              <span class="stat-label">标题党词</span>
              <span class="stat-value" :class="(selectedNode.config.result.data.clickbaitWords?.length || 0) > 0 ? 'stat-warn' : ''">{{ selectedNode.config.result.data.clickbaitWords?.length || 0 }}</span>
            </div>
            <div class="quality-stat">
              <span class="stat-label">状态</span>
              <span class="stat-value" :class="qualityStatClass(selectedNode)">{{ qualityLabel(selectedNode) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  useCreatorModeStore,
  type NodeConfig,
  type NodeCategory,
  NODE_PALETTE,
  PALETTE_CATEGORIES
} from '@/stores/creatorMode'
import { useChatStore } from '@/stores/chat'

const store = useCreatorModeStore()
const chatStore = useChatStore()

const canvasContainerRef = ref<HTMLElement | null>(null)
const canvasW = ref(4000)
const canvasH = ref(3000)

// 画布拖拽
const isDraggingCanvas = ref(false)
const isSpacePressed = ref(false)
const dragStart = reactive({ x: 0, y: 0 })
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

watch(() => store.selectedNodeId, (newId) => {
  const node = store.workflowNodes.find(n => n.id === newId)
  if (node) {
    editNodeLabel.value = node.label
    Object.assign(nodeConfig, { ...node.config })
    delete (nodeConfig as any).result
  }
})

const availableModels = computed(() => chatStore.models)

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

function paletteByCategory(cat: NodeCategory) {
  return NODE_PALETTE.filter(i => i.type === cat)
}

function categoryColor(type: string): string {
  const c = PALETTE_CATEGORIES.find(c => c.key === type)
  return c?.color || '#909399'
}

function nodeIcon(node: { type: string; label: string }): string {
  const item = NODE_PALETTE.find(p => p.label === node.label)
  if (item?.icon) return item.icon
  const icons: Record<string, string> = { trigger: '⏰', source: '📥', 'process-ai': '🤖', 'process-local': '⚙️', quality: '🔍', output: '📤' }
  return icons[node.type] || '📦'
}

function nodeTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    trigger: '触发器', source: '输入', 'process-ai': 'AI 处理', 'process-local': '本地处理',
    quality: '质检节点', output: '输出节点'
  }
  return labels[type] || type
}

function statusEmoji(status: string): string {
  const map: Record<string, string> = { running: '⏳', success: '✅', error: '❌', idle: '' }
  return map[status] || ''
}

function nodeStatusClass(node: any): string {
  if (!node.config?.result) return ''
  return 'status-' + node.config.result.status
}

function nodeHasWarning(node: any): boolean {
  if (node.label === '重复度检查' && node.config?.result?.data) {
    const d = node.config.result.data
    return d.qualityStatus === 'warn' || d.qualityStatus === 'fail'
  }
  return false
}

function nodeWarningText(node: any): string {
  if (node.label === '重复度检查' && node.config?.result?.data) {
    return `${node.config.result.data.rate}%`
  }
  return ''
}

function warningTooltip(node: any): string {
  if (node.label === '重复度检查' && node.config?.result?.data) {
    const d = node.config.result.data
    return d.summary || '存在重复或标题党问题'
  }
  return ''
}

function qualityStatClass(node: any): string {
  const s = node.config?.result?.data?.qualityStatus
  if (s === 'fail') return 'stat-fail'
  if (s === 'warn') return 'stat-warn'
  return 'stat-ok'
}

function qualityLabel(node: any): string {
  const s = node.config?.result?.data?.qualityStatus
  return s === 'pass' ? '通过' : s === 'warn' ? '警告' : s === 'fail' ? '不通过' : '-'
}

function logLineClass(log: string): string {
  if (log.includes('✗')) return 'log-error'
  if (log.includes('✓')) return 'log-success'
  if (log.includes('开始') || log.includes('完毕')) return 'log-info'
  const nodeLabels = NODE_PALETTE.map(p => p.label)
  for (const lbl of nodeLabels) {
    if (log.includes(lbl)) {
      const item = NODE_PALETTE.find(p => p.label === lbl)
      if (item) return 'log-cat log-cat-' + item.type
    }
  }
  return ''
}

function truncate(text: string, max: number): string {
  if (!text) return ''
  const oneLine = String(text).replace(/\s+/g, ' ').trim()
  return oneLine.length > max ? oneLine.slice(0, max) + '…' : oneLine
}

function addNodeAtCenter(type: NodeCategory, label: string) {
  // 基于当前画布偏移+缩放居中添加
  const container = canvasContainerRef.value
  let cx = 400, cy = 250
  if (container) {
    const rect = container.getBoundingClientRect()
    cx = (rect.width / 2 - store.canvasOffset.x) / store.canvasScale - 80
    cy = (rect.height / 2 - store.canvasOffset.y) / store.canvasScale - 40
    cx += (Math.random() - 0.5) * 120
    cy += (Math.random() - 0.5) * 80
  }
  store.addNode(type, label, Math.max(40, cx), Math.max(40, cy))
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
  return { x: node.x + 85, y: node.y + 40 }
}

// ===== 全局鼠标事件 =====

function onWindowMouseMove(e: MouseEvent) {
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

function onWindowMouseUp() {
  isDraggingCanvas.value = false
  nodeDragId = null
}

function onWindowKeyDown(e: KeyboardEvent) {
  if (e.code === 'Space' && !isSpacePressed.value) {
    const target = e.target as HTMLElement
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
    e.preventDefault()
    isSpacePressed.value = true
  }
}

function onWindowKeyUp(e: KeyboardEvent) {
  if (e.code === 'Space') isSpacePressed.value = false
}

onMounted(() => {
  window.addEventListener('mousemove', onWindowMouseMove)
  window.addEventListener('mouseup', onWindowMouseUp)
  window.addEventListener('keydown', onWindowKeyDown)
  window.addEventListener('keyup', onWindowKeyUp)
})

onUnmounted(() => {
  window.removeEventListener('mousemove', onWindowMouseMove)
  window.removeEventListener('mouseup', onWindowMouseUp)
  window.removeEventListener('keydown', onWindowKeyDown)
  window.removeEventListener('keyup', onWindowKeyUp)
})

// ===== 画布平移/缩放 =====

function isCanvasBackground(target: HTMLElement): boolean {
  if (target === canvasContainerRef.value) return true
  if (target.classList.contains('canvas-content') || target.classList.contains('canvas-svg')) return true
  const parent = target.parentElement
  if (parent && (parent.classList.contains('canvas-svg') || parent === canvasContainerRef.value)) return true
  return false
}

function onCanvasMouseDown(e: MouseEvent) {
  const target = e.target as HTMLElement

  if (e.button === 1) {
    isDraggingCanvas.value = true
    dragStart.x = e.clientX - store.canvasOffset.x
    dragStart.y = e.clientY - store.canvasOffset.y
    return
  }
  if (e.button === 0 && isSpacePressed.value) {
    isDraggingCanvas.value = true
    dragStart.x = e.clientX - store.canvasOffset.x
    dragStart.y = e.clientY - store.canvasOffset.y
    return
  }
  if (e.button === 0 && isCanvasBackground(target)) {
    isDraggingCanvas.value = true
    dragStart.x = e.clientX - store.canvasOffset.x
    dragStart.y = e.clientY - store.canvasOffset.y
    if (connectionFrom) connectionFrom = null
  }
}

function onCanvasWheel(e: WheelEvent) {
  if (e.ctrlKey || e.metaKey) {
    const rect = canvasContainerRef.value?.getBoundingClientRect()
    if (!rect) return
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    const oldScale = store.canvasScale
    const delta = e.deltaY > 0 ? -0.05 : 0.05
    const newScale = Math.max(0.3, Math.min(3, oldScale + delta))
    const scaleFactor = newScale / oldScale
    const newOffsetX = mouseX - (mouseX - store.canvasOffset.x) * scaleFactor
    const newOffsetY = mouseY - (mouseY - store.canvasOffset.y) * scaleFactor
    store.setCanvasScale(newScale)
    store.setCanvasOffset(newOffsetX, newOffsetY)
    return
  }
  const panSpeed = 1.5
  store.setCanvasOffset(
    store.canvasOffset.x - e.deltaX * panSpeed,
    store.canvasOffset.y - e.deltaY * panSpeed
  )
}

function onNodeDragStart(e: MouseEvent, nodeId: string) {
  nodeDragId = nodeId
  nodeDragStart.x = e.clientX
  nodeDragStart.y = e.clientY
}

function startConnection(nodeId: string, side: 'from' | 'to') {
  if (side === 'from') {
    connectionFrom = nodeId
    ElMessage.info('请点击目标节点的左侧（输入）连接点完成连线')
  } else if (connectionFrom && connectionFrom !== nodeId) {
    const edge = store.addEdge(connectionFrom, nodeId)
    connectionFrom = null
    if (edge) ElMessage.success('连线已创建')
    else ElMessage.warning('无法创建连线：连接已存在或会导致循环引用')
  }
}

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
    store.updateNodeConfig(store.selectedNodeId, {})
  }
}

function saveConfig() {
  if (!store.selectedNodeId) return
  const cfg: NodeConfig = { ...nodeConfig }
  delete (cfg as any).result
  store.updateNodeConfig(store.selectedNodeId, cfg)
}

async function selectFileForNode() {
  const api = (window as any).electronAPI
  if (api?.selectFile) {
    const result = await api.selectFile()
    if (result && result.filePath) { nodeConfig.filePath = result.filePath; saveConfig() }
  } else {
    ElMessage.warning('文件选择功能仅在 Electron 环境下可用')
  }
}

async function selectFolderForNode() {
  const api = (window as any).electronAPI
  if (api?.selectFolder) {
    const result = await api.selectFolder()
    if (result) { nodeConfig.folderPath = result; saveConfig() }
  } else {
    ElMessage.warning('文件夹选择功能仅在 Electron 环境下可用')
  }
}

async function selectOutputFolder() {
  const api = (window as any).electronAPI
  if (api?.selectFolder) {
    const result = await api.selectFolder()
    if (result) { nodeConfig.outputPath = result; saveConfig() }
  } else {
    ElMessage.warning('文件夹选择功能仅在 Electron 环境下可用')
  }
}

async function selectDraftFolder() {
  const api = (window as any).electronAPI
  if (api?.selectFolder) {
    const result = await api.selectFolder()
    if (result) { nodeConfig.draftPath = result; saveConfig() }
  } else {
    ElMessage.warning('文件夹选择功能仅在 Electron 环境下可用')
  }
}

async function selectDocOutputFolder() {
  const api = (window as any).electronAPI
  if (api?.selectFolder) {
    const result = await api.selectFolder()
    if (result) { nodeConfig.docOutputPath = result; saveConfig() }
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
  background: var(--c-bg, #f5f7fa);
  color: var(--c-text, #303133);
}

/* ===== 工具箱 ===== */
.workflow-palette {
  width: 216px;
  min-width: 216px;
  background: var(--c-bg-card, #ffffff);
  border-right: 1px solid var(--c-border, #e4e7ed);
  overflow-y: auto;
  padding: 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.palette-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--c-text, #303133);
  display: flex;
  align-items: center;
  gap: 6px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--c-border, #f0f2f5);
}
.palette-logo { font-size: 18px; }

.node-category {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.cat-label {
  font-size: 11px;
  color: var(--c-text-sec, #909399);
  text-transform: uppercase;
  letter-spacing: 1.2px;
  padding: 6px 0 2px 8px;
  font-weight: 600;
  border-left: 3px solid var(--c-primary, #409eff);
  line-height: 1;
}

.node-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  font-size: 12.5px;
  border: 1px solid var(--c-border, #e4e7ed);
  background: var(--c-bg, #fafbfc);
  border-radius: var(--radius-md, 8px);
  cursor: pointer;
  text-align: left;
  color: var(--c-text, #606266);
  transition: all 0.2s cubic-bezier(.4,0,.2,1);
  position: relative;
  overflow: hidden;
}
.node-btn::before {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 3px;
  background: var(--cat-color, var(--c-primary));
  opacity: 0;
  transition: opacity 0.2s;
}
.node-btn:hover {
  border-color: var(--cat-color, var(--c-primary));
  color: var(--cat-color, var(--c-primary));
  background: color-mix(in srgb, var(--cat-color, var(--c-primary)) 6%, transparent);
  transform: translateX(2px);
}
.node-btn:hover::before { opacity: 1; }
.node-btn-icon { font-size: 14px; width: 20px; text-align: center; }
.node-btn-label { flex: 1; font-weight: 500; }

.palette-actions {
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid var(--c-border, #f0f2f5);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.run-btn {
  font-weight: 600;
  position: relative;
  overflow: hidden;
}
.run-btn-inner {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.run-icon {
  display: inline-block;
  animation: pulse-glow 1.6s ease-in-out infinite;
}
@keyframes pulse-glow {
  0%, 100% { text-shadow: 0 0 0 transparent; transform: scale(1); }
  50% { text-shadow: 0 0 8px rgba(255,255,255,0.8); transform: scale(1.15); }
}

/* ===== 日志 ===== */
.workflow-logs {
  margin-top: 4px;
  padding-top: 10px;
  border-top: 1px solid var(--c-border, #f0f2f5);
}
.logs-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--c-text-sec, #909399);
  margin-bottom: 6px;
}
.logs-list {
  max-height: 240px;
  overflow-y: auto;
  font-size: 11px;
  font-family: 'Consolas', 'Courier New', 'Microsoft YaHei', monospace;
  line-height: 1.6;
  color: var(--c-text-sec, #606266);
  background: var(--c-bg, #fafbfc);
  border-radius: var(--radius-sm, 6px);
  padding: 6px 8px;
  border: 1px solid var(--c-border, #ebeef5);
}
.log-line {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 1px 0;
}
.log-dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-top: 6px;
  background: var(--c-text-sec, #c0c4cc);
}
.log-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.log-success .log-dot { background: var(--c-success, #67c23a); }
.log-success { color: var(--c-success, #67c23a); }
.log-error .log-dot { background: var(--c-danger, #f56c6c); }
.log-error { color: var(--c-danger, #f56c6c); }
.log-info .log-dot { background: var(--c-primary, #409eff); }
.log-info { color: var(--c-primary, #409eff); font-weight: 600; }
.log-cat-trigger .log-dot { background: var(--c-warning, #e6a23c); }
.log-cat-source .log-dot { background: var(--c-success, #67c23a); }
.log-cat-process-ai .log-dot { background: #9b59b6; }
.log-cat-process-local .log-dot { background: var(--c-primary, #409eff); }
.log-cat-quality .log-dot { background: var(--c-danger, #f56c6c); }
.log-cat-output .log-dot { background: #ff6b35; }

/* ===== 画布 ===== */
.canvas-area {
  flex: 1;
  overflow: hidden;
  position: relative;
  background: var(--c-bg, #f5f7fa);
  background-image:
    radial-gradient(circle at 1px 1px, var(--c-border, #e4e7ed) 1px, transparent 0);
  background-size: 20px 20px;
  cursor: default;
}
.canvas-area.canvas-grabbing { cursor: grabbing; }
.canvas-area.workflow-running { cursor: wait; }

.canvas-content {
  position: relative;
  width: 4000px;
  height: 3000px;
  transition: filter 0.3s;
}
.canvas-content.executing-pulse {
  animation: canvas-pulse 2s ease-in-out infinite;
}
@keyframes canvas-pulse {
  0%, 100% { filter: drop-shadow(0 0 0 transparent); }
  50% { filter: drop-shadow(0 0 14px rgba(64,158,255,0.18)); }
}

.canvas-svg { pointer-events: none; position: absolute; top: 0; left: 0; }
.edges-svg { pointer-events: auto; }

/* ===== 节点 ===== */
.wf-node {
  position: absolute;
  width: 170px;
  background: var(--c-bg-card, #ffffff);
  border: 2px solid var(--c-border, #e4e7ed);
  border-left: 4px solid var(--node-accent, var(--c-primary));
  border-radius: var(--radius-lg, 12px);
  cursor: move;
  box-shadow: var(--c-shadow, 0 2px 8px rgba(0,0,0,0.06));
  transition: transform 0.18s cubic-bezier(.4,0,.2,1), box-shadow 0.2s, border-color 0.2s;
  user-select: none;
}
.wf-node:hover {
  border-color: color-mix(in srgb, var(--node-accent) 60%, var(--c-border, #e4e7ed));
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0,0,0,0.10);
}
.wf-node.selected {
  border-color: var(--node-accent, var(--c-primary));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--node-accent) 25%, transparent),
              0 6px 18px color-mix(in srgb, var(--node-accent) 25%, transparent);
}

/* 状态样式 */
.wf-node.status-running {
  border-color: var(--c-warning, #e6a23c);
  animation: node-running 1s ease-in-out infinite;
}
@keyframes node-running {
  0%, 100% { box-shadow: 0 0 0 0 rgba(230,162,60,0.4); }
  50% { box-shadow: 0 0 0 6px rgba(230,162,60,0); }
}
.wf-node.status-success { border-color: var(--c-success, #67c23a); }
.wf-node.status-error { border-color: var(--c-danger, #f56c6c); animation: node-shake 0.4s; }
@keyframes node-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-3px); }
  75% { transform: translateX(3px); }
}
.wf-node.has-warning {
  border-color: var(--c-warning, #e6a23c);
  background: linear-gradient(135deg, color-mix(in srgb, var(--c-warning) 10%, var(--c-bg-card)) 0%, var(--c-bg-card, #fff) 80%);
}

.node-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 10px 6px;
}
.node-icon { font-size: 15px; }
.node-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--c-text, #303133);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
.node-status { font-size: 12px; flex-shrink: 0; }

.node-body {
  padding: 2px 10px 10px;
}
.node-type {
  font-size: 10.5px;
  color: var(--c-text-sec, #c0c4cc);
  letter-spacing: 0.5px;
}
.node-result {
  margin-top: 5px;
  font-size: 11px;
  color: var(--c-text, #606266);
  line-height: 1.45;
  max-height: 42px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.result-error { color: var(--c-danger, #f56c6c); }

.node-warning-badge {
  margin-top: 5px;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--c-warning, #e6a23c);
  background: color-mix(in srgb, var(--c-warning) 12%, var(--c-bg-card));
  border: 1px solid color-mix(in srgb, var(--c-warning) 25%, var(--c-border));
  border-radius: 4px;
  padding: 2px 6px;
  display: inline-block;
}

.running-dot {
  display: inline-block;
  width: 7px; height: 7px;
  background: var(--c-warning, #e6a23c);
  border-radius: 50%;
  margin-right: 5px;
  animation: blink 0.8s infinite;
  vertical-align: middle;
}
@keyframes blink { 0%,100%{opacity:1;} 50%{opacity:0.3;} }

.node-connector {
  position: absolute;
  top: 50%;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--c-bg-card, #fff);
  border: 2.5px solid var(--c-text-sec, #c0c4cc);
  cursor: crosshair;
  z-index: 2;
  transition: all 0.2s;
}
.node-connector:hover {
  background: var(--c-primary, #409eff);
  border-color: var(--c-primary, #409eff);
  transform: translateY(-50%) scale(1.3);
}
.node-connector.in  { left: -7px; transform: translateY(-50%); }
.node-connector.out { right: -7px; transform: translateY(-50%); }

.node-delete {
  position: absolute;
  top: -9px;
  right: -9px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1px solid var(--c-border, #e4e7ed);
  background: var(--c-bg-card, #fff);
  color: var(--c-text-sec, #909399);
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s, border-color 0.15s;
  z-index: 3;
}
.wf-node:hover .node-delete { opacity: 1; }
.node-delete:hover { color: var(--c-danger, #f56c6c); border-color: var(--c-danger, #f56c6c); transform: scale(1.1); }

/* ===== 控制栏 ===== */
.canvas-controls {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 8px;
  background: var(--c-bg-card, #fff);
  padding: 6px 12px;
  border-radius: var(--radius-lg, 12px);
  box-shadow: var(--c-shadow-strong, 0 4px 16px rgba(0,0,0,0.1));
  border: 1px solid var(--c-border, #e4e7ed);
  z-index: 10;
}

.execution-overlay {
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--c-primary, #409eff);
  color: var(--c-primary-text, #fff);
  padding: 10px 22px;
  border-radius: 24px;
  font-size: 13px;
  font-weight: 500;
  box-shadow: 0 6px 20px rgba(64,158,255,0.4);
  z-index: 20;
  animation: slide-down 0.4s cubic-bezier(.4,0,.2,1);
}
@keyframes slide-down {
  from { transform: translate(-50%, -30px); opacity: 0; }
  to { transform: translate(-50%, 0); opacity: 1; }
}
.exec-spinner {
  width: 14px; height: 14px;
  border: 2px solid rgba(255,255,255,0.4);
  border-top-color: var(--c-bg-card, #fff);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.connection-hint {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--c-bg-card, #fff);
  border: 1px solid var(--c-primary, #409eff);
  color: var(--c-primary, #409eff);
  padding: 8px 18px;
  border-radius: var(--radius-md, 8px);
  font-size: 12px;
  z-index: 10;
  box-shadow: 0 4px 12px rgba(64,158,255,0.2);
}

/* ===== 配置面板 ===== */
.config-panel {
  width: 280px;
  min-width: 280px;
  background: var(--c-bg-card, #fff);
  border-left: 1px solid var(--c-border, #e4e7ed);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
.config-panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px;
  border-bottom: 1px solid var(--c-border, #f0f2f5);
  border-left: 4px solid var(--c-primary, #409eff);
  position: sticky;
  top: 0;
  background: var(--c-bg-card, #fff);
  z-index: 1;
}
.config-panel-icon { font-size: 18px; }
.config-panel-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--c-text, #303133);
  flex: 1;
}
.config-panel-close {
  width: 24px; height: 24px;
  border-radius: 50%;
  border: 1px solid var(--c-border, #e4e7ed);
  background: var(--c-bg, #fafbfc);
  color: var(--c-text-sec, #909399);
  font-size: 14px;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s;
}
.config-panel-close:hover { color: var(--c-danger, #f56c6c); border-color: var(--c-danger, #f56c6c); }

.config-panel-body {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.config-group { display: flex; flex-direction: column; gap: 5px; }
.config-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--c-text, #606266);
}
.config-file-input { display: flex; gap: 4px; }
.config-file-input .el-input { flex: 1; }
.config-tip {
  font-size: 11px;
  color: var(--c-text-sec, #909399);
  background: var(--c-bg, #f4f6f9);
  padding: 6px 8px;
  border-radius: 6px;
  line-height: 1.5;
}

.result-group { border-top: 1px dashed var(--c-border, #ebeef5); padding-top: 10px; }
.result-detail {
  padding: 10px 12px;
  border-radius: var(--radius-md, 8px);
  font-size: 12px;
  line-height: 1.6;
  max-height: 280px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
.result-pre {
  margin: 0;
  font-family: 'Consolas', 'Courier New', 'Microsoft YaHei', monospace;
  font-size: 11.5px;
  white-space: pre-wrap;
  word-break: break-all;
}
.result-success {
  background: color-mix(in srgb, var(--c-success, #67c23a) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--c-success, #67c23a) 30%, transparent);
  color: var(--c-success, #5daf34);
}
.result-error {
  background: color-mix(in srgb, var(--c-danger, #f56c6c) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--c-danger, #f56c6c) 30%, transparent);
  color: var(--c-danger, #f56c6c);
}
.result-running {
  background: color-mix(in srgb, var(--c-warning, #e6a23c) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--c-warning, #e6a23c) 30%, transparent);
  color: var(--c-warning, #b88230);
}

.titles-list { display: flex; flex-direction: column; gap: 6px; }
.title-item {
  padding: 6px 8px;
  background: color-mix(in srgb, var(--c-bg-card) 70%, transparent);
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.5;
  display: flex;
  gap: 6px;
}
.title-idx {
  color: var(--c-primary, #409eff);
  font-weight: 700;
  flex-shrink: 0;
}

.quality-stats {
  margin-top: 8px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.quality-stat {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 8px;
  background: var(--c-bg, #f5f7fa);
  border-radius: 6px;
  font-size: 11.5px;
}
.stat-label { color: var(--c-text-sec, #909399); }
.stat-value { font-weight: 600; color: var(--c-text, #303133); }
.stat-value.stat-ok { color: var(--c-success, #67c23a); }
.stat-value.stat-warn { color: var(--c-warning, #e6a23c); }
.stat-value.stat-fail { color: var(--c-danger, #f56c6c); }

/* 字幕源概况 */
.config-hint {
  font-size: 11px;
  color: var(--c-warning, #e6a23c);
  padding: 4px 0;
}
.subtitle-summary {
  background: var(--c-bg, #f4f6f9);
  border: 1px solid var(--c-border, #ebeef5);
  border-radius: var(--radius-md, 8px);
  padding: 8px 10px;
}
.summary-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  line-height: 1.9;
  color: var(--c-text, #606266);
}
.summary-row span:last-child {
  font-weight: 600;
  color: var(--c-text, #303133);
}
.summary-videos {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--c-border, #ebeef5);
  max-height: 180px;
  overflow-y: auto;
}
.summary-video-item {
  font-size: 11px;
  color: var(--c-text, #606266);
  line-height: 1.7;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 滚动条美化 */
:deep(.el-scrollbar__bar),
.workflow-logs::-webkit-scrollbar,
.config-panel::-webkit-scrollbar,
.logs-list::-webkit-scrollbar,
.result-detail::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
:deep(.el-scrollbar__thumb),
.workflow-logs::-webkit-scrollbar-thumb,
.config-panel::-webkit-scrollbar-thumb,
.logs-list::-webkit-scrollbar-thumb,
.result-detail::-webkit-scrollbar-thumb {
  background: var(--c-border-strong, #dcdfe6);
  border-radius: 3px;
}

/* 响应式细节：节点内 connector 左右区分 */
.wf-node::after {
  content: '';
  position: absolute;
  left: 0; right: 0; top: 50%;
  height: 0;
  pointer-events: none;
}
</style>
