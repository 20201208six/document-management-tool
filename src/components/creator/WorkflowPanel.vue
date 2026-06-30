<template>
  <div class="workflow-panel">
    <!-- 左侧：对话列表 -->
    <div class="wf-sidebar" :class="{ collapsed: sidebarCollapsed }">
      <div class="sidebar-header">
        <span v-if="!sidebarCollapsed" class="sidebar-title">对话列表</span>
        <el-button size="small" circle @click="sidebarCollapsed = !sidebarCollapsed">
          <el-icon><ArrowLeft v-if="!sidebarCollapsed" /><ArrowRight v-else /></el-icon>
        </el-button>
      </div>
      <el-button
        v-if="!sidebarCollapsed"
        type="primary"
        size="small"
        style="width:100%;margin-bottom:8px"
        @click="newConversation"
      >
        <el-icon><Plus /></el-icon> 新建对话
      </el-button>
      <div v-if="!sidebarCollapsed" class="conversation-list">
        <div
          v-for="conv in conversations"
          :key="conv.id"
          class="conv-item"
          :class="{ active: conv.id === activeConvId }"
          @click="switchConversation(conv.id)"
        >
          <div class="conv-title">{{ conv.title || '未命名对话' }}</div>
          <div class="conv-time">{{ formatConvTime(conv.createdAt) }}</div>
          <el-button size="small" text type="danger" @click.stop="deleteConversation(conv.id)">
            <el-icon><Delete /></el-icon>
          </el-button>
        </div>
        <div v-if="conversations.length === 0" class="conv-empty">
          暂无对话，点击上方按钮新建
        </div>
      </div>
    </div>

    <!-- 右侧：工作区 -->
    <div class="wf-main">
      <div class="wf-header">
        <el-icon class="wf-header-icon"><MagicStick /></el-icon>
        <span class="wf-header-title">官方 AI 工作流 — 基于字幕数据智能生成短视频文案</span>
        <div class="wf-header-actions">
          <span v-if="sourceList.length > 0" class="wf-header-stat">
            已选 {{ selectedSourceIds.length }}/{{ sourceList.length }} 个来源
          </span>
          <el-button size="small" @click="refreshSources" :loading="scanning">
            <el-icon><Refresh /></el-icon> 刷新数据
          </el-button>
        </div>
      </div>

      <!-- 步骤指示器 -->
      <div class="wf-stepper">
        <div
          v-for="(step, idx) in steps"
          :key="step.key"
          class="step-item"
          :class="{
            active: currentStepIndex === idx,
            done: currentStepIndex > idx,
            pending: currentStepIndex < idx
          }"
        >
          <div class="step-dot">
            <el-icon v-if="currentStepIndex > idx" :size="12"><Check /></el-icon>
            <span v-else>{{ idx + 1 }}</span>
          </div>
          <div class="step-meta">
            <div class="step-label">{{ step.label }}</div>
            <div class="step-sub">{{ step.sub }}</div>
          </div>
          <div v-if="idx < steps.length - 1" class="step-line" :class="{ filled: currentStepIndex > idx }"></div>
        </div>
      </div>

      <div class="wf-body">
        <!-- 左侧：输入区（步骤 1-4） -->
        <div class="wf-left">
          <!-- 数据源选择 -->
          <div class="wf-card">
            <div class="card-title">
              <span class="step-badge">1</span>步骤 1：选择字幕数据源
            </div>

            <div v-if="!hasStoragePath" class="source-hint source-hint-warn">
              <el-icon><InfoFilled /></el-icon>
              未设置字幕存储目录，请先在「工作状态」→「字幕管理」中配置
            </div>
            <div v-else-if="sourceList.length === 0 && !scanning" class="source-hint source-hint-warn">
              <el-icon><InfoFilled /></el-icon>
              存储目录中没有字幕数据，请先在「工作状态」中导入视频并完成语音识别
            </div>

            <div v-else class="source-list">
              <div
                v-for="src in sourceList"
                :key="src.id"
                class="source-item"
                :class="{ selected: selectedSourceIds.has(src.id) }"
                @click="toggleSource(src.id)"
              >
                <el-checkbox
                  :model-value="selectedSourceIds.has(src.id)"
                  @click.stop
                  @change="toggleSource(src.id)"
                />
                <el-icon :size="16" class="source-icon"><VideoCamera /></el-icon>
                <span class="source-name">{{ src.name }}</span>
                <span class="source-sub-count">{{ src.subtitleCount }} 条字幕</span>
              </div>
            </div>

            <div v-if="sourceList.length > 0" class="source-actions">
              <el-button size="small" text @click="selectAllSources">全选</el-button>
              <el-button size="small" text @click="deselectAllSources">取消全选</el-button>
            </div>
          </div>

          <!-- 选题 -->
          <div class="wf-card">
            <div class="card-title">
              <span class="step-badge">2</span>步骤 2：选题 / 文案方向
            </div>
            <el-input
              v-model="currentConv.topic"
              type="textarea"
              :rows="2"
              resize="none"
              placeholder="描述您想要生成的文案方向，例如：&#10;「做一个关于时间管理的励志短视频脚本」"
            />
          </div>

          <!-- 新增：文案风格 -->
          <div class="wf-card">
            <div class="card-title">
              <span class="step-badge">3</span>步骤 3：文案风格 · 网感配置
            </div>

            <div class="param-block">
              <div class="param-title">文案风格</div>
              <div class="style-grid">
                <div
                  v-for="s in styleOptions"
                  :key="s.id"
                  class="style-chip"
                  :class="{ active: currentConv.copyStyle === s.id }"
                  @click="selectStyle(s.id)"
                >
                  <span class="style-chip-emoji">{{ s.emoji }}</span>
                  <span class="style-chip-label">{{ s.label }}</span>
                </div>
              </div>
            </div>

            <div class="param-block">
              <div class="param-title">
                <span>网感强度</span>
                <span class="param-val-tag">{{ vibeLabel }}</span>
              </div>
              <div class="param-slider-wrap">
                <span class="param-edge">保守</span>
                <el-slider
                  v-model="currentConv.vibeLevel"
                  :min="1"
                  :max="5"
                  :step="1"
                  :marks="vibeMarks"
                  size="small"
                  style="flex:1"
                  @change="onConvDirty"
                />
                <span class="param-edge">炸裂</span>
              </div>
            </div>

            <div class="param-block">
              <div class="param-title">目标平台</div>
              <div class="platform-row">
                <el-radio-group v-model="currentConv.platform" size="small" @change="onConvDirty">
                  <el-radio-button v-for="p in platformOptions" :key="p.id" :value="p.id">
                    {{ p.label }}
                  </el-radio-button>
                </el-radio-group>
              </div>
            </div>

            <div class="param-block param-block-last">
              <div class="hook-switch-row">
                <div>
                  <div class="param-title" style="margin-bottom:2px">
                    <el-icon :color="'var(--c-warning)'"><Warning /></el-icon>
                    黄金 3 秒钩子
                  </div>
                  <div class="param-desc">开启后强制前 3 秒使用强钩子（悬念 / 反差 / 痛点 / 数字 / 提问）</div>
                </div>
                <el-switch v-model="currentConv.goldenHook" @change="onConvDirty" />
              </div>
            </div>
          </div>

          <!-- 输出控制 -->
          <div class="wf-card">
            <div class="card-title">
              <span class="step-badge">4</span>步骤 4：时长 · 气口控制
            </div>

            <div class="param-row">
              <span class="param-label">时长要求</span>
              <el-input
                v-model="currentConv.durationRequirement"
                size="small"
                placeholder="如：1分钟 / 3-4分钟"
                clearable
                @change="onConvDirty"
              />
            </div>

            <div class="param-row param-row-last">
              <span class="param-label">气口留帧</span>
              <div class="param-slider-wrap">
                <span class="param-edge">3帧</span>
                <el-slider
                  v-model="currentConv.frameGap"
                  :min="3"
                  :max="8"
                  :step="1"
                  size="small"
                  style="flex:1"
                  :show-tooltip="false"
                  @change="onConvDirty"
                />
                <span class="param-edge">8帧</span>
                <span class="frame-gap-badge">{{ currentConv.frameGap }} 帧 · {{ frameGapMs }}ms</span>
              </div>
              <div class="param-desc" style="margin-top:4px">
                片段之间保留气口空白，剪辑节奏更自然（按 30fps 计算，默认 4 帧 ≈ 133ms）
              </div>
            </div>
          </div>

          <!-- 模型选择 -->
          <div class="wf-card">
            <div class="card-title">
              <span class="step-badge">5</span>步骤 5：选择模型
            </div>
            <el-radio-group v-model="selectedModelId" size="small" class="model-group">
              <el-radio v-for="m in chatStore.models" :key="m.id" :value="m.id" class="model-radio">
                {{ m.name }}
              </el-radio>
            </el-radio-group>
          </div>

          <el-button
            type="primary"
            size="default"
            class="generate-btn"
            :loading="isGenerating"
            :disabled="selectedSourceIds.size === 0 || !currentConv.topic.trim()"
            @click="handleGenerate"
          >
            <el-icon><MagicStick /></el-icon>
            {{ isGenerating ? 'AI 创作中...' : (currentConv.generatedScript ? '重新生成文案' : '一键生成网感文案') }}
          </el-button>

          <div v-if="isGenerating" class="wf-loading">
            <el-icon class="is-loading" :size="28"><Loading /></el-icon>
            <div class="wf-loading-text">{{ statusText }}</div>
            <el-progress :percentage="streamPercent" :show-text="false" :stroke-width="4" style="width:100%;margin-top:4px" />
          </div>

          <!-- 生成详情日志 -->
          <div v-if="genLog || isGenerating" class="gen-log-card">
            <div class="gen-log-header" @click="showGenLog = !showGenLog" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between">
              <span class="gen-log-title">
                <el-icon :size="14"><InfoFilled /></el-icon> 生成详情
              </span>
              <el-icon :size="14" class="gen-log-arrow" :style="{ transform: showGenLog ? 'rotate(90deg)' : '' }">
                <ArrowRight />
              </el-icon>
            </div>
            <div v-show="showGenLog" class="gen-log-body">
              <div class="log-item" v-if="genLog">
                <span class="log-label">发送 Token</span>
                <span class="log-val">{{ genLog.promptTokens.toLocaleString() }}</span>
              </div>
              <div class="log-item" v-if="genLog">
                <span class="log-label">返回 Token</span>
                <span class="log-val">{{ genLog.completionTokens.toLocaleString() }}</span>
              </div>
              <div class="log-item" v-if="genLog">
                <span class="log-label">输出字数</span>
                <span class="log-val">{{ genLog.charsOut }} 字</span>
              </div>
              <div class="log-item" v-if="genLog">
                <span class="log-label">气口设置</span>
                <span class="log-val">{{ currentConv.frameGap }} 帧 / {{ frameGapMs }}ms</span>
              </div>
              <div class="log-item" v-if="genLog">
                <span class="log-label">文案风格</span>
                <span class="log-val">{{ currentStyleLabel }} · {{ vibeLabel }} · {{ currentPlatformLabel }}</span>
              </div>
              <div class="log-item" v-if="genLog && genLog.truncated">
                <span class="log-label log-warn">注意</span>
                <span class="log-val log-warn">输入数据超长已截断</span>
              </div>
              <div class="log-item" v-if="!genLog">
                <span class="log-label">状态</span>
                <span class="log-val log-primary">流式返回中...</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 右侧：结果区（步骤 6-8） -->
        <div class="wf-right">
          <!-- 生成中流式输出 或 已完成结果 -->
          <div v-if="currentConv.generatedScript || streamingScript" class="wf-card result-card">
            <div class="result-header">
              <div class="result-title">
                <span class="step-badge step-badge-result">6</span>
                <span>AI 网感文案预览</span>
                <span v-if="isGenerating" class="result-status-streaming">接收中…</span>
                <span v-else-if="matchedSubs.length > 0" class="result-status-done">
                  <el-icon><Check /></el-icon> 已生成
                </span>
              </div>
              <div class="result-actions">
                <el-button size="small" @click="copyScript" :disabled="isGenerating || !currentConv.generatedScript">
                  <el-icon><CopyDocument /></el-icon> 复制文案
                </el-button>
                <el-button size="small" @click="handleGenerate" :loading="isGenerating" :disabled="isGenerating">
                  <el-icon><RefreshRight /></el-icon> 重新生成
                </el-button>
                <el-button size="small" type="primary" @click="handleApply" :disabled="selectedSubs.length === 0 || isGenerating">
                  <el-icon><Download /></el-icon> 导出剪映
                </el-button>
              </div>
            </div>

            <!-- 文案片段卡片列表（优先显示匹配卡片） -->
            <div v-if="matchedSubs.length > 0 && !isGenerating" class="segment-list">
              <div
                v-for="(sub, idx) in matchedSubs"
                :key="idx"
                class="segment-card"
                :class="{ removed: removedIndices.has(idx) }"
                @click="toggleRemove(idx)"
              >
                <div class="segment-card-head">
                  <span class="segment-index">{{ idx + 1 }}</span>
                  <span class="segment-video">{{ sub.videoName }}</span>
                  <span class="segment-time">
                    {{ store.formatTimeMs(sub.startTime) }} → {{ store.formatTimeMs(sub.endTime) }}
                    <span class="segment-dur">· {{ Math.round((sub.endTime - sub.startTime) / 1000) }}s</span>
                  </span>
                  <el-tag size="small" :type="removedIndices.has(idx) ? 'info' : 'success'" effect="light" class="segment-tag">
                    {{ removedIndices.has(idx) ? '已移除' : '保留' }}
                  </el-tag>
                </div>
                <div class="segment-text">{{ sub.text }}</div>
                <div v-if="idx < matchedSubs.length - 1" class="segment-gap">
                  <span class="gap-line"></span>
                  <span class="gap-label">气口 {{ currentConv.frameGap }} 帧</span>
                  <span class="gap-line"></span>
                </div>
              </div>
            </div>

            <!-- 主：朗读预览（流式或无匹配时显示） -->
            <div v-if="isGenerating || matchedSubs.length === 0" class="script-text" v-html="renderScript(isGenerating ? streamingScript : currentConv.generatedScript)"></div>

            <!-- AI 分析（可折叠） -->
            <details v-if="currentConv.generatedScript && !isGenerating" class="ai-analysis">
              <summary>
                <el-icon><DataAnalysis /></el-icon>
                AI 筛选剔除 · 编排说明 · 节奏审查 · 时长验证
                <el-icon class="details-arrow"><ArrowRight /></el-icon>
              </summary>
              <div v-html="renderScript(aiAnalysisOnly)" class="analysis-text"></div>
            </details>

            <!-- 匹配信息 -->
            <div v-if="matchedSubs.length > 0" class="match-info">
              <div class="match-stat">
                <span class="match-stat-label">片段</span>
                <span class="match-stat-val">{{ selectedSubs.length }} / {{ matchedSubs.length }}</span>
              </div>
              <div class="match-stat">
                <span class="match-stat-label">总时长</span>
                <span class="match-stat-val">{{ store.formatTime(totalMatchDuration) }}</span>
              </div>
              <div class="match-stat">
                <span class="match-stat-label">气口</span>
                <span class="match-stat-val">{{ currentConv.frameGap }} 帧 ({{ frameGapMs }}ms)</span>
              </div>
              <div class="match-stat">
                <span class="match-stat-label">风格</span>
                <span class="match-stat-val">{{ currentStyleLabel }}</span>
              </div>
              <div class="match-stat">
                <span class="match-stat-label">平台</span>
                <span class="match-stat-val">{{ currentPlatformLabel }}</span>
              </div>
            </div>

            <!-- 步骤 8：微调片段 -->
            <div v-if="matchedSubs.length > 0" class="tune-section">
              <div class="tune-header">
                <span><span class="step-badge step-badge-tune">8</span>微调片段（点击移除或保留）</span>
                <el-button v-if="removedIndices.size > 0" size="small" text type="primary" @click="removedIndices.clear()">
                  <el-icon><RefreshLeft /></el-icon> 恢复全部
                </el-button>
              </div>
              <div class="tune-list">
                <div
                  v-for="(sub, idx) in matchedSubs"
                  :key="idx"
                  class="tune-item"
                  :class="{ removed: removedIndices.has(idx) }"
                  @click="toggleRemove(idx)"
                >
                  <span class="tune-idx">{{ idx + 1 }}.</span>
                  <span class="tune-time">{{ store.formatTimeMs(sub.startTime) }}-{{ store.formatTimeMs(sub.endTime) }}</span>
                  <span class="tune-text">{{ sub.text }}</span>
                  <el-button size="small" circle text :type="removedIndices.has(idx) ? 'success' : 'danger'" @click.stop="toggleRemove(idx)">
                    <el-icon><Plus v-if="removedIndices.has(idx)" /><Close v-else /></el-icon>
                  </el-button>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="wf-card result-card result-empty">
            <div class="result-header">
              <div class="result-title">
                <span class="step-badge step-badge-result">6</span>
                <span>AI 网感文案预览</span>
              </div>
            </div>
            <div class="wf-empty">
              <el-icon :size="40" color="var(--c-primary-soft)"><MagicStick /></el-icon>
              <div class="empty-title">开启你的网感文案创作</div>
              <div class="empty-desc">
                在左侧选择字幕源、填写选题、配置网感风格后<br>
                点击「一键生成网感文案」
              </div>
              <div class="empty-tips">
                <div class="tip-item"><el-icon><VideoCamera /></el-icon> 支持从历史字幕中自动筛选精彩片段</div>
                <div class="tip-item"><el-icon><Promotion /></el-icon> 抖音/小红书/视频号/B站等多平台文案风格</div>
                <div class="tip-item"><el-icon><Timer /></el-icon> 黄金 3 秒钩子 + 气口留帧，剪辑节奏更自然</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete } from '@element-plus/icons-vue'
import { useChatStore } from '@/stores/chat'
import { useCreatorModeStore } from '@/stores/creatorMode'
import { exportJianyingProject, buildProject } from '@/services/jianying'
import type { SubtitleSegment } from '@/services/asr'

const chatStore = useChatStore()
const store = useCreatorModeStore()

// ===== 步骤指示器 =====
interface StepDef { key: string; label: string; sub: string }
const steps: StepDef[] = [
  { key: 'source', label: '选字幕', sub: '选择素材来源' },
  { key: 'topic', label: '选题', sub: '文案方向' },
  { key: 'style', label: '选风格', sub: '网感配置' },
  { key: 'config', label: '设时长', sub: '气口控制' },
  { key: 'model', label: '选模型', sub: 'AI 引擎' },
  { key: 'generate', label: '生成脚本', sub: 'AI 创作中' },
  { key: 'analyze', label: '分析', sub: '节奏 & 时长' },
  { key: 'tune', label: '微调导出', sub: '剪映工程' }
]

// 文案风格选项
const styleOptions = [
  { id: 'douyin', label: '抖音口语风', emoji: '🎤' },
  { id: 'xhs', label: '小红书种草风', emoji: '💄' },
  { id: 'sph', label: '视频号情感风', emoji: '💝' },
  { id: 'knowledge', label: '知识口播风', emoji: '📚' },
  { id: 'funny', label: '搞笑段子风', emoji: '🤣' },
  { id: 'story', label: '走心故事风', emoji: '🌙' }
] as const

// 平台选项
const platformOptions = [
  { id: 'douyin', label: '抖音' },
  { id: 'xhs', label: '小红书' },
  { id: 'kuaishou', label: '快手' },
  { id: 'sph', label: '视频号' },
  { id: 'bili', label: 'B站' }
] as const

const vibeMarks = {
  1: { label: '保守', style: { color: 'var(--c-text-muted)', fontSize: '10px' } },
  3: { label: '标准', style: { color: 'var(--c-primary)', fontSize: '10px' } },
  5: { label: '炸裂', style: { color: 'var(--c-warning)', fontSize: '10px' } }
} as any

// ===== 数据源（基于磁盘缓存） =====
const scanning = ref(false)

interface SubtitleSource {
  id: string
  name: string
  subtitles: SubtitleSegment[]
  subtitleCount: number
}

const sourceList = ref<SubtitleSource[]>([])
const selectedSourceIds = ref<Set<string>>(new Set())

// ===== 匹配片段 & 微调 =====
interface SubtitleEntry {
  videoId: string
  videoName: string
  videoPath: string
  startTime: number   // ms
  endTime: number     // ms
  text: string
}

const matchedSubs = ref<SubtitleEntry[]>([])
const removedIndices = ref(new Set<number>())

const selectedSubs = computed(() =>
  matchedSubs.value.filter((_, i) => !removedIndices.value.has(i))
)

const totalMatchDuration = computed(() => {
  const clips = selectedSubs.value
  const videoDur = clips.reduce((sum, s) => sum + (s.endTime - s.startTime), 0) / 1000
  const gapDur = clips.length > 1 ? (clips.length - 1) * frameGapMs.value / 1000 : 0
  return videoDur + gapDur
})

// 气口毫秒数（按 30fps）
const frameGapMs = computed(() => Math.round((currentConv.value.frameGap ?? 4) * 1000 / 30))

// 流式进度（基于 token 估算）
const streamPercent = computed(() => {
  if (!isGenerating.value) return 0
  const len = streamingScript.value.length
  return Math.min(95, Math.round(len / 8))
})

// 风格/平台 label
const currentStyleLabel = computed(() => {
  return styleOptions.find(s => s.id === currentConv.value.copyStyle)?.label || '抖音口语风'
})
const currentPlatformLabel = computed(() => {
  return platformOptions.find(p => p.id === currentConv.value.platform)?.label || '抖音'
})
const vibeLabel = computed(() => {
  const v = currentConv.value.vibeLevel ?? 3
  if (v <= 1) return '保守'
  if (v === 2) return '轻度'
  if (v === 3) return '标准'
  if (v === 4) return '强烈'
  return '炸裂'
})

// 步骤指示器当前步骤
const currentStepIndex = computed(() => {
  if (isGenerating.value) return 5
  if (matchedSubs.value.length > 0 && removedIndices.value.size > 0) return 7
  if (matchedSubs.value.length > 0) return 6
  if (selectedSourceIds.value.size > 0 && currentConv.value.topic?.trim() && currentConv.value.copyStyle) return 4
  if (selectedSourceIds.value.size > 0 && currentConv.value.topic?.trim()) return 2
  if (selectedSourceIds.value.size > 0) return 1
  return 0
})

/** 可读脚本：将选中字幕拼接成连续朗读稿 */
const readableScript = computed(() => {
  if (matchedSubs.value.length === 0) return ''
  const entries = selectedSubs.value
  const lines: string[] = []
  for (let i = 0; i < entries.length; i++) {
    const s = entries[i]
    const timeStr = store.formatTimeMs(s.startTime) + ' → ' + store.formatTimeMs(s.endTime)
    const dur = Math.round((s.endTime - s.startTime) / 1000)
    lines.push(`## ${s.videoName}  ${timeStr}  (${dur}秒)\n${s.text}\n`)
  }
  return lines.join('\n')
})

/** 仅提取 AI 输出的分析部分（去掉选择清单） */
const aiAnalysisOnly = computed(() => {
  const conv = currentConv.value
  if (!conv?.generatedScript) return ''
  return conv.generatedScript.replace(/\n?##\s*选择清单\s*\n[\s\S]*?(?=\n##\s*筛选剔除|$)/i, '').trim()
})

function toggleRemove(idx: number) {
  const s = new Set(removedIndices.value)
  if (s.has(idx)) s.delete(idx)
  else s.add(idx)
  removedIndices.value = s
}

function selectStyle(id: string) {
  const conv = conversations.value.find(c => c.id === activeConvId.value)
  if (conv) {
    conv.copyStyle = id as any
    saveConversations()
  } else {
    fallbackConv.value.copyStyle = id as any
  }
}

async function copyScript() {
  const conv = currentConv.value
  if (!conv?.generatedScript) return
  const text = selectedSubs.value.length > 0
    ? selectedSubs.value.map(s => s.text).join('\n')
    : conv.generatedScript
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(`已复制 ${selectedSubs.value.length || '全部'} 条文案到剪贴板`)
  } catch {
    // 回退方案
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy'); ElMessage.success('已复制文案') } catch { ElMessage.error('复制失败') }
    document.body.removeChild(ta)
  }
}

const hasStoragePath = computed(() => !!store.storagePath)

/** 扫描存储目录中的 .subtitles.json 文件 */
async function scanDiskSubtitles() {
  const api = (window as any).electronAPI
  if (!api?.listDirectory || !store.storagePath) {
    sourceList.value = []
    return
  }

  scanning.value = true
  const results: SubtitleSource[] = []

  try {
    async function listRecursive(dirPath: string): Promise<Array<{ path: string; name: string }>> {
      const out: Array<{ path: string; name: string }> = []
      try {
        const entries = await api.listDirectory(dirPath)
        for (const e of entries) {
          if (e.isFile && e.name.endsWith('.subtitles.json')) {
            out.push({ path: e.path, name: e.name })
          } else if (e.isDirectory) {
            const sub = await listRecursive(e.path)
            out.push(...sub)
          }
        }
      } catch {}
      return out
    }

    const diskFiles = await listRecursive(store.storagePath)

    for (const v of store.importedVideos) {
      if (v.asrStatus !== 'done' || v.subtitles.length === 0) continue
      const videoBaseName = v.name.replace(/\.\w+$/, '')
      const diskMatch = diskFiles.find(df =>
        df.name.replace('.subtitles.json', '') === videoBaseName ||
        (v.path && df.name.replace('.subtitles.json', '') === v.path.split(/[\\/]/).pop()?.replace(/\.\w+$/, ''))
      )
      if (diskMatch) {
        results.push({
          id: v.id,
          name: v.name,
          subtitles: [...v.subtitles],
          subtitleCount: v.subtitles.length
        })
      }
    }

    for (const df of diskFiles) {
      const diskBaseName = df.name.replace('.subtitles.json', '')
      const alreadyIncluded = results.some(r => r.name.replace(/\.\w+$/, '') === diskBaseName)
      if (!alreadyIncluded) {
        let subs: SubtitleSegment[] = []
        try {
          const result = await api.readFileAsText(df.path)
          if (result?.success && result.content) {
            const data = JSON.parse(result.content)
            subs = Array.isArray(data.subtitles) ? data.subtitles : []
          }
        } catch {}
        if (subs.length > 0) {
          results.push({
            id: 'disk_' + diskBaseName,
            name: diskBaseName,
            subtitles: subs,
            subtitleCount: subs.length
          })
        }
      }
    }

  } catch {}

  sourceList.value = results
  if (results.length > 0 && selectedSourceIds.value.size === 0) {
    selectedSourceIds.value = new Set(results.map(r => r.id))
  }
  const validIds = new Set(results.map(r => r.id))
  for (const id of selectedSourceIds.value) {
    if (!validIds.has(id)) selectedSourceIds.value.delete(id)
  }
  scanning.value = false
}

async function refreshSources() {
  await scanDiskSubtitles()
  ElMessage.success(`扫描完成，共 ${sourceList.value.length} 个可用字幕源`)
}

function toggleSource(id: string) {
  const newSet = new Set(selectedSourceIds.value)
  if (newSet.has(id)) newSet.delete(id)
  else newSet.add(id)
  selectedSourceIds.value = newSet
}

function selectAllSources() {
  selectedSourceIds.value = new Set(sourceList.value.map(s => s.id))
}

function deselectAllSources() {
  selectedSourceIds.value = new Set()
}

watch(() => store.storagePath, () => {
  if (store.storagePath) scanDiskSubtitles()
})

// ===== 对话管理 =====
const STORAGE_KEY = 'workflow-conversations-v2'

type CopyStyle = 'douyin' | 'xhs' | 'sph' | 'knowledge' | 'funny' | 'story'
type Platform = 'douyin' | 'xhs' | 'kuaishou' | 'sph' | 'bili'

interface Conversation {
  id: string
  title: string
  topic: string
  durationRequirement: string
  frameGap: number
  copyStyle: CopyStyle
  vibeLevel: number
  platform: Platform
  goldenHook: boolean
  generatedScript: string
  createdAt: number
  updatedAt: number
}

const conversations = ref<Conversation[]>([])
const activeConvId = ref('')
const sidebarCollapsed = ref(false)

function loadConversations() {
  try {
    // 优先读取 v2
    let raw = localStorage.getItem(STORAGE_KEY)
    let fromLegacy = false
    if (!raw) {
      raw = localStorage.getItem('workflow-conversations')
      fromLegacy = true
    }
    if (raw) {
      const arr = JSON.parse(raw) as Conversation[]
      // 补齐字段 & 修正气口默认值
      conversations.value = arr.map((c: any) => ({
        ...c,
        frameGap: (typeof c.frameGap === 'number' && c.frameGap >= 3 && c.frameGap <= 8) ? c.frameGap : 4,
        copyStyle: c.copyStyle || 'douyin',
        vibeLevel: typeof c.vibeLevel === 'number' ? c.vibeLevel : 3,
        platform: c.platform || 'douyin',
        goldenHook: typeof c.goldenHook === 'boolean' ? c.goldenHook : true
      }))
      if (fromLegacy) saveConversations()
    }
  } catch { conversations.value = [] }
}

function saveConversations() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations.value))
  // 清理旧 key
  localStorage.removeItem('workflow-conversations')
}

function emptyConv(): Conversation {
  return {
    id: '', title: '', topic: '', durationRequirement: '',
    frameGap: 4,
    copyStyle: 'douyin',
    vibeLevel: 3,
    platform: 'douyin',
    goldenHook: true,
    generatedScript: '',
    createdAt: 0, updatedAt: 0
  }
}

const fallbackConv = ref<Conversation>(emptyConv())

const currentConv = computed(() =>
  conversations.value.find(c => c.id === activeConvId.value) || conversations.value[0] || fallbackConv.value
)

function newConversation() {
  const id = 'wf_' + Date.now()
  const conv: Conversation = {
    id,
    title: '新建对话',
    topic: '',
    durationRequirement: '',
    frameGap: 4,
    copyStyle: 'douyin',
    vibeLevel: 3,
    platform: 'douyin',
    goldenHook: true,
    generatedScript: '',
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
  conversations.value.unshift(conv)
  activeConvId.value = id
  matchedSubs.value = []
  removedIndices.value = new Set()
  streamingScript.value = ''
  genLog.value = null
  saveConversations()
}

function switchConversation(id: string) {
  activeConvId.value = id
  // 切换对话时清空匹配区
  matchedSubs.value = []
  removedIndices.value = new Set()
  streamingScript.value = ''
  genLog.value = null
}

function deleteConversation(id: string) {
  ElMessageBox.confirm('确定删除此对话？', '确认', { type: 'warning' }).then(() => {
    conversations.value = conversations.value.filter(c => c.id !== id)
    if (activeConvId.value === id) {
      activeConvId.value = conversations.value[0]?.id || ''
      matchedSubs.value = []
      removedIndices.value = new Set()
    }
    saveConversations()
    ElMessage.success('已删除')
  }).catch(() => {})
}

function formatConvTime(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

watch(() => currentConv.value?.topic, (val) => {
  const conv = conversations.value.find(c => c.id === activeConvId.value)
  if (conv && val) {
    const title = val.split('\n')[0].trim().slice(0, 20)
    if (title && conv.title === '新建对话') {
      conv.title = title
      saveConversations()
    }
  }
})

// 切换对话时，若存在已生成脚本则重新解析匹配
watch(activeConvId, async (id) => {
  await nextTick()
  const conv = conversations.value.find(c => c.id === id)
  if (conv?.generatedScript) {
    // 重新扫描源然后解析（下一个 tick）
    if (sourceList.value.length === 0) await scanDiskSubtitles()
    // 如果源已就绪则重放
    if (sourceList.value.length > 0) {
      const selectedSources = sourceList.value.filter(s => selectedSourceIds.value.has(s.id))
      const { entries } = buildSourceContent(selectedSources.length ? selectedSources : sourceList.value)
      if (entries.length > 0) {
        matchedSubs.value = parseScriptIndices(conv.generatedScript, entries)
        for (const sub of matchedSubs.value) {
          const video = store.importedVideos.find(v => v.id === sub.videoId)
          if (video) sub.videoPath = video.path
        }
        removedIndices.value = new Set()
      }
    }
  } else {
    matchedSubs.value = []
    removedIndices.value = new Set()
  }
})

function onConvDirty() {
  saveConversations()
}

// ===== 生成逻辑 =====
const selectedModelId = ref<string>('')
const isGenerating = ref(false)
const statusText = ref('')
const streamingScript = ref('')
const showGenLog = ref(false)
const genLog = ref<null | { promptTokens: number; completionTokens: number; charsOut: number; truncated: boolean }>(null)

const selectedModel = computed(() => {
  if (selectedModelId.value) {
    return chatStore.models.find(m => m.id === selectedModelId.value) || null
  }
  return chatStore.models.find(m => m.isDefault) || chatStore.models[0] || null
})

async function handleGenerate() {
  const conv = conversations.value.find(c => c.id === activeConvId.value)
  if (!conv) return

  const model = selectedModel.value
  if (!model?.apiKey) {
    ElMessage.warning('请先在全局模型管理中设置 API Key')
    return
  }

  const selectedSources = sourceList.value.filter(s => selectedSourceIds.value.has(s.id))
  if (selectedSources.length === 0) {
    ElMessage.warning('请至少选择一个数据源')
    return
  }

  const sourceContent = buildSourceContent(selectedSources)
  if (!sourceContent.content.trim()) {
    ElMessage.warning('所选数据源中没有字幕内容')
    return
  }

  isGenerating.value = true
  streamingScript.value = ''
  genLog.value = null
  showGenLog.value = true
  matchedSubs.value = []
  removedIndices.value = new Set()
  statusText.value = `正在使用 ${selectedSources.length} 个数据源，调用 ${model.name} 进行网感文案创作...`

  let totalSourceSec = 0
  for (const src of selectedSources) {
    for (const sub of src.subtitles) {
      totalSourceSec += (sub.endTime - sub.startTime) / 1000
    }
  }
  const totalSourceMin = Math.floor(totalSourceSec / 60)
  const totalSourceSecRemain = Math.floor(totalSourceSec % 60)

  try {
    const result = await callAI(
      sourceContent.content,
      conv.topic,
      conv.durationRequirement || '',
      conv.frameGap,
      totalSourceMin,
      totalSourceSecRemain,
      model,
      {
        copyStyle: conv.copyStyle,
        vibeLevel: conv.vibeLevel,
        platform: conv.platform,
        goldenHook: conv.goldenHook
      },
      (text) => { streamingScript.value = text }
    )
    const script = result.text

    genLog.value = {
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      charsOut: script.length,
      truncated: sourceContent.content.length > 15000
    }

    matchedSubs.value = parseScriptIndices(script, sourceContent.entries)
    for (const sub of matchedSubs.value) {
      const video = store.importedVideos.find(v => v.id === sub.videoId)
      if (video) sub.videoPath = video.path
    }
    removedIndices.value = new Set()

    conv.generatedScript = script
    conv.updatedAt = Date.now()
    saveConversations()

    if (conv.durationRequirement?.trim()) {
      const actualSecRaw = selectedSubs.value.reduce((sum, s) => sum + (s.endTime - s.startTime), 0) / 1000
      const actualGap = selectedSubs.value.length > 1 ? (selectedSubs.value.length - 1) * frameGapMs.value / 1000 : 0
      const actualSec = actualSecRaw + actualGap
      const actualMin = Math.floor(actualSec / 60)
      const actualSecRem = Math.floor(actualSec % 60)
      const hint = `实际匹配时长(含气口): ${actualMin}分${actualSecRem}秒（原始数据总量: ${totalSourceMin}分${totalSourceSecRemain}秒）`

      const nums = conv.durationRequirement.match(/\d+/g)?.map(Number) || []
      let minTarget = 0, maxTarget = 0

      if (nums.length === 1) {
        const req = conv.durationRequirement
        if (req.includes('至少') || req.includes('最低') || req.includes('以上') || req.includes('不少于')) {
          minTarget = nums[0]
        } else if (req.includes('不超过') || req.includes('最多') || req.includes('以内') || req.includes('以下')) {
          maxTarget = nums[0]
        } else {
          minTarget = Math.max(1, nums[0] - 1)
          maxTarget = nums[0] + 1
        }
      } else if (nums.length >= 2) {
        minTarget = nums[0]
        maxTarget = nums[nums.length - 1]
      }

      if (maxTarget > 0 && actualSec > maxTarget * 60) {
        let trimmed = [...matchedSubs.value]
        let total = actualSec
        while (trimmed.length > 1 && total > maxTarget * 60) {
          const removed = trimmed.pop()!
          total -= (removed.endTime - removed.startTime) / 1000 + frameGapMs.value / 1000
        }
        matchedSubs.value = trimmed
        removedIndices.value = new Set()
        const newMin = Math.floor(total / 60)
        const newSec = Math.floor(total % 60)
        ElMessage.success(`生成完成，已自动裁剪至 ${newMin}分${newSec}秒（符合约${maxTarget}分钟上限），匹配 ${trimmed.length} 个片段`)
      } else if (minTarget > 0 && actualSec < minTarget * 60) {
        ElMessage.warning(`时长未达标，${hint}。数据源时长不足以满足最低要求`)
      } else {
        ElMessage.success(`生成完成，${hint}，匹配 ${matchedSubs.value.length} 个片段`)
      }
    } else {
      ElMessage.success(`生成完成，匹配 ${matchedSubs.value.length} 个片段`)
    }
  } catch (e: any) {
    ElMessage.error('生成失败: ' + (e.message || '未知错误'))
  } finally {
    isGenerating.value = false
  }
}

function buildSourceContent(sources: SubtitleSource[]): { content: string; entries: SubtitleEntry[] } {
  const lines: string[] = []
  const entries: SubtitleEntry[] = []
  let idx = 0

  for (const src of sources) {
    let videoSec = 0
    for (const sub of src.subtitles) videoSec += (sub.endTime - sub.startTime) / 1000
    lines.push(`【视频：${src.name} | 该视频字幕总时长约 ${Math.round(videoSec)} 秒】`)
    for (const sub of src.subtitles) {
      const dur = Math.round((sub.endTime - sub.startTime) / 1000)
      idx++
      lines.push(`#${idx} [${store.formatTimeMs(sub.startTime)}-${store.formatTimeMs(sub.endTime)} | ${dur}秒] ${sub.text}`)
      entries.push({
        videoId: src.id,
        videoName: src.name,
        videoPath: '',
        startTime: sub.startTime,
        endTime: sub.endTime,
        text: sub.text
      })
    }
    lines.push('')
  }
  return { content: lines.join('\n'), entries }
}

interface StyleConfig {
  copyStyle: CopyStyle
  vibeLevel: number
  platform: Platform
  goldenHook: boolean
}

// 风格提示词
const STYLE_PROMPTS: Record<CopyStyle, string> = {
  douyin: '抖音口语风：像和朋友面对面聊天，接地气、语速快、情绪饱满。多用"家人们""听我说""绝了""真的假的""家人们谁懂啊"等抖音高频词。',
  xhs: '小红书种草风：精致、真诚分享感，开头常用"姐妹们！""谁懂啊！""闭眼入""真的会谢"。多用emoji表情感文字，语气像闺蜜推荐好物，有"种草-拔草"节奏。',
  sph: '视频号情感风：温暖治愈、共情力强，适合30+人群。语气沉稳真诚，多用"你有没有发现""说实话""真的挺感慨的"。偏走心、有共鸣、少用梗。',
  knowledge: '知识口播风：清晰、干脆、信息密度高。"今天给大家讲一个…""记住这三点""第一/第二/第三"。逻辑清晰，每句都要有信息量，避免废话。',
  funny: '搞笑段子风：反转、吐槽、自嘲。开头先抛梗，中间层层铺垫，结尾神反转。多用"你敢信？""我直接笑疯""离谱"等搞笑情绪词。',
  story: '走心故事风：娓娓道来，像讲一个真实发生的故事。开头设悬念，中间有情绪起伏，结尾点题升华。语气沉静有画面感。'
}

// 平台提示词
const PLATFORM_PROMPTS: Record<Platform, string> = {
  douyin: '目标平台：抖音。竖屏9:16、快节奏、强情绪、短句为主（单句≤15字）。前三秒决定生死，必须抓眼球。结尾引导点赞/评论/关注/转发。',
  xhs: '目标平台：小红书。标题党+干货感，封面关键词突出，正文用"我愿称之为""亲测有效""按头安利"等表达。真诚分享人设，结尾引导收藏。',
  kuaishou: '目标平台：快手。老铁文化、真实接地气、强互动。多用"老铁们""家人们""双击666""没毛病"。内容要实在，不要端着。',
  sph: '目标平台：视频号。中年用户为主，关注家庭/成长/情感/职场。偏稳重、正能量、有人生感悟。引导转发朋友圈。',
  bili: '目标平台：B站。年轻用户为主，可以玩梗、允许稍长句子，但要有"干货/整活"价值。开头"一键三连"暗示，弹幕互动感。'
}

async function callAI(
  sourceContent: string,
  topic: string,
  durationReq: string,
  frameGap: number,
  dataMin: number,
  dataSec: number,
  model: { apiKey: string; apiUrl: string; modelParam: string },
  styleCfg: StyleConfig,
  onChunk: (text: string) => void
): Promise<{ text: string; promptTokens: number; completionTokens: number }> {

  const stylePrompt = STYLE_PROMPTS[styleCfg.copyStyle] || STYLE_PROMPTS.douyin
  const platformPrompt = PLATFORM_PROMPTS[styleCfg.platform] || PLATFORM_PROMPTS.douyin
  const vibeLevel = styleCfg.vibeLevel || 3

  // 网感强度说明
  let vibePrompt = ''
  if (vibeLevel <= 1) {
    vibePrompt = '网感强度：保守。少量使用网络流行语，整体偏书面但保持口语化，语气词克制。'
  } else if (vibeLevel === 2) {
    vibePrompt = '网感强度：轻度。适度加入流行语和情绪词，保持自然不夸张。'
  } else if (vibeLevel === 3) {
    vibePrompt = '网感强度：标准。平衡口语感和专业感，流行语自然融入，每 2-3 句出现一个情绪词/语气词。'
  } else if (vibeLevel === 4) {
    vibePrompt = '网感强度：强烈。高频使用流行语、情绪词、反差表达，每 1-2 句就有网感词，节奏更炸。'
  } else {
    vibePrompt = '网感强度：炸裂！密集使用网络热梗、强情绪词、夸张表达、反差金句，每句都要有记忆点，打造爆款文案。'
  }

  const hookPrompt = styleCfg.goldenHook
    ? '【黄金3秒钩子-强制要求】开头前3秒（前15字）必须是强钩子，五选一或组合使用：①悬念式（"你绝对不知道…"）②反差式（"我以前也以为…直到…"）③痛点式（"是不是总是…"）④数字式（"3个方法，第2个绝了"）⑤提问式（"你有没有过…"）。禁止平淡开场，禁止"大家好我是XXX"。'
    : '开头自然引入即可，不必强制钩子，但仍需有吸引力。'

  let systemPrompt = `你是一位顶级短视频文案操盘手 + 视频剪辑师。你的任务是从「字幕库」中挑选最具爆款潜力的字幕片段，按网感节奏编排成一段能火的短视频口播文案。

【核心身份】
你不是写作文的，你是写"让人忍不住看完"的短视频脚本。每一句话都是钩子，每一个气口都是节奏。

【你的工作方式】
1. 阅读字幕库每条字幕（编号 #N，后面附时长秒数）
2. 根据选题方向 + 风格 + 平台，精选最有网感的字幕片段
3. 按"钩子→铺垫→高潮→升华→互动"的爆款结构编排顺序
4. 执行去重筛查，把口吃、重复、同义、冗余字幕丢掉
5. 检查节奏起伏（每15-20秒一个小高潮），确保口播友好
6. 累计时长，验证是否符合目标

【文案风格与平台】
${stylePrompt}
${platformPrompt}
${vibePrompt}
${hookPrompt}

【网感文案硬性要求】
1. 口语化！口语化！口语化！像跟镜头前的人说话，不要像念稿子
2. 每句话控制在15字以内（口播友好，长句必须能自然断成两句）
3. 去除书面语、长句、套话（"首先其次最后""综上所述""我们可以看到"全部禁用）
4. 数字要具体！禁止"很多""非常""特别""很"等模糊词，改成"3个""90%的人""99%都不知道"
5. 适当使用语气词（根据风格调整）：抖音用"家人们""真的""绝了""你敢信""谁懂啊"；小红书用"姐妹们""我天""按头安利"；视频号用"说实话""你会发现""其实"
6. 开头3秒必须有钩子，前15字必须抓眼球
7. 中间有节奏起伏：每15-20秒一个小高潮/反转/金句
8. 结尾必须有互动引导（点赞/评论/关注/转发/收藏话术，根据平台调整）
9. 长短句交替：2-8秒为主力句，避免连续3条以上<1秒的碎片，也避免连续>15秒的长句

【气口要求-非常重要】
导出时会在两个字幕片段之间插入 ${frameGap} 帧空白气口（按30fps计算，约 ${Math.round(frameGap * 1000 / 30)}ms），用于剪辑呼吸感。
你在编排时必须主动预留气口：
- 情绪转折处选短一点的句子，让气口自然
- 金句/钩子前后要留出气口空间（不要把两条强情绪的句子紧挨着）
- 段落之间的气口让观众有时间消化信息
- 不要把一条完整的话拆成两段，气口必须落在自然停顿点（逗号、句号、语气词之后）
你不需要在文本里写气口，只需要在选择片段时刻意把强情绪句之间隔开，气口会在导出时自动插入。

【去重规则——必须逐条筛查】
▸ 字面重复（口吃/磕巴）：如"没有风险，没有风险"→只保留一次
▸ 语义重复（同一个意思说两遍）：同义句只留最精炼最有网感的一条
▸ 近义堆砌：纯粹同义词重复只留一条；但情绪递进（"必须、一定、不得不"）可保留

【节奏审查（气口分析）】
选完字幕后，请模拟朗读一遍：
▸ 时长分布：短字幕(≤1秒)不连续3条以上；主力句(2-8秒)占多数；长字幕(>15秒)尽量拆开
▸ 句间衔接：前一句结尾和后一句开头语义是否顺滑？有没有话题跳转？
▸ 气口自然度：字幕是否断在半句话（如"的/了/吗"之前）？这种跳过
▸ 网感节奏：有没有每15-20秒一个高潮点？开头3秒钩子够不够炸？结尾互动有没有？

【时长说明】
每条字幕后面的 | X秒 是该条时长。选中的每条秒数累加 + (N-1)×${Math.round(frameGap * 1000 / 30)}ms 气口 = 总时长。`

  if (durationReq.trim()) {
    const nums = durationReq.match(/\d+/g)?.map(Number) || []
    systemPrompt += `\n\n【用户时长目标】${durationReq.trim()}`
    if (nums.length >= 2) {
      systemPrompt += `\n折算：目标 ${nums[0]}~${nums[nums.length - 1]} 分钟 = ${nums[0]*60}~${nums[nums.length-1]*60} 秒（含气口）`
    } else if (nums.length === 1) {
      systemPrompt += `\n折算：目标约 ${nums[0]} 分钟 = ${nums[0]*60} 秒（含气口）`
    }
    systemPrompt += `\n网感质量始终优先于精确时长。数据不够时如实说明。`
  }

  systemPrompt += `\n\n【输出格式——每个部分都必须有】
请严格按以下五个部分输出：

## 选择清单
每行一个编号（只写 #N，不要抄文字），按播出顺序排列。示例：
#5
#12
#3
（注意：第一条必须是钩子句！）

## 筛选剔除
列出你主动跳过的字幕及原因（重复/太长/断句差/无网感/不符合风格等）：
- #7（与 #5 字面重复）→ 跳过
- #22（书面语太重，"我们可以看到"不符合网感）→ 跳过
- #33（<1秒碎片，断在"的"字前）→ 跳过
（没有就写"无"）

## 编排说明
3~5 句话说明：
- 开头钩子设计（用了什么钩子？悬念/反差/痛点/数字/提问？）
- 中间节奏线（高潮点在哪里？每15-20秒的小高潮怎么安排？）
- 风格/网感是怎么体现的（用了哪些语气词、流行语、金句？）
- 结尾互动引导怎么设计
- 数据不够时首先说明

## 节奏审查
用2~3句话评价：
- 开头3秒钩子是否够抓眼球？前15字是什么？
- 时长分布：主力句占比？连续碎片？
- 网感节奏：有没有15-20秒一个小高潮？
- 气口位置是否落在自然停顿点？

## 时长验证
逐条列出时长并求和（必须包含气口计算）：
#5(4秒) + [气口${frameGap}帧] + #12(8秒) + [气口${frameGap}帧] + #3(5秒) = 17秒 + ${Math.round(frameGap * 1000 / 30) * 2 / 1000}秒气口
选中N条，累计X秒（含气口），约Y分钟`

  const userMsg = `【字幕库】\n${sourceContent}\n\n【用户选题】\n${topic}\n\n【风格配置】${stylePrompt.split('：')[0]}；平台：${platformPrompt.split('。')[0]}；网感强度：${vibeLabel.value}；黄金3秒钩子：${styleCfg.goldenHook ? '开启' : '关闭'}\n\n请从字幕库中挑选最有爆款潜力的字幕，按上述网感要求编排并按格式输出。`

  const msgChars = userMsg.length
  const truncatedMsg = msgChars > 15000 ? userMsg.slice(0, 15000) + '\n...(内容已截断，剩余条目可能不完整)' : userMsg

  const response = await fetch(model.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${model.apiKey}`
    },
    body: JSON.stringify({
      model: model.modelParam,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: truncatedMsg }
      ],
      temperature: 0.8,
      max_tokens: 16384,
      stream: true
    })
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`API 错误 (${response.status}): ${err}`)
  }

  const contentType = response.headers.get('content-type') || ''
  const useStream = contentType.includes('text/event-stream') || contentType.includes('application/json')

  if (useStream && response.body) {
    try {
      return await readStream(response.body, onChunk, systemPrompt.length + truncatedMsg.length)
    } catch (streamErr: any) {
      console.warn('流式读取失败，尝试非流式:', streamErr.message)
    }
  }

  return await readNonStream(response)
}

/** 流式 SSE 解析 */
async function readStream(
  body: ReadableStream<Uint8Array>,
  onChunk: (text: string) => void,
  promptLen: number
): Promise<{ text: string; promptTokens: number; completionTokens: number }> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''
  let promptTokens = 0
  let completionTokens = 0
  let lastActivity = Date.now()
  const IDLE_TIMEOUT = 30000

  const timeoutCheck = setInterval(() => {
    if (Date.now() - lastActivity > IDLE_TIMEOUT) {
      reader.cancel('idle timeout').catch(() => {})
    }
  }, 5000)

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      lastActivity = Date.now()
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        const dataIdx = trimmed.indexOf('data:')
        if (dataIdx !== 0) continue
        const jsonStr = trimmed.slice(5).trim()
        if (!jsonStr || jsonStr === '[DONE]') continue

        try {
          const chunk = JSON.parse(jsonStr)
          const choice = chunk.choices?.[0]
          if (!choice) continue
          const delta = choice.delta || choice.message || {}
          const content = delta.content || delta.text || delta.reasoning_content || ''
          if (content) {
            fullText += content
            onChunk(fullText)
          }
          if (chunk.usage) {
            promptTokens = chunk.usage.prompt_tokens || 0
            completionTokens = chunk.usage.completion_tokens || 0
          }
        } catch { /* 跳过非 JSON 行 */ }
      }
    }
  } finally {
    clearInterval(timeoutCheck)
    try { reader.releaseLock() } catch {}
  }

  if (promptTokens === 0) {
    promptTokens = Math.ceil(promptLen / 3.5)
    completionTokens = Math.ceil(fullText.length / 3.5)
  }

  return { text: fullText, promptTokens, completionTokens }
}

/** 非流式回退 */
async function readNonStream(response: Response): Promise<{ text: string; promptTokens: number; completionTokens: number }> {
  const data = await response.json()
  const text = data.choices?.[0]?.message?.content || ''
  const usage = data.usage
  return {
    text,
    promptTokens: usage?.prompt_tokens || 0,
    completionTokens: usage?.completion_tokens || 0
  }
}

/** 将生成的文案匹配到实际字幕 */
function parseScriptIndices(script: string, entries: SubtitleEntry[]): SubtitleEntry[] {
  if (entries.length === 0) return []

  const selectSection = script.match(/##\s*选择清单\s*\n([\s\S]*?)(?=\n##|$)/i)
  const sectionText = selectSection ? selectSection[1] : script

  const indices: number[] = []
  const seen = new Set<number>()

  const matches = sectionText.matchAll(/#(\d+)/g)
  for (const m of matches) {
    const n = parseInt(m[1], 10)
    if (n >= 1 && n <= entries.length && !seen.has(n)) {
      seen.add(n)
      indices.push(n - 1)
    }
  }

  if (indices.length > 0) {
    return indices.map(i => entries[i])
  }

  return fuzzyMatchScriptToSubs(script, entries)
}

/** 旧格式回退：bigram 模糊匹配 */
function fuzzyMatchScriptToSubs(script: string, subs: SubtitleEntry[]): SubtitleEntry[] {
  if (subs.length === 0) return []

  const tokenize = (text: string): Set<string> => {
    const tokens = new Set<string>()
    const phrases = text.split(/[\s，,。.！!？?、；;：:（）()【】\[\]""''\n\r]+/).filter(p => p.length >= 2)
    for (const p of phrases) {
      for (let i = 0; i < p.length - 1; i++) {
        tokens.add(p.substring(i, i + 2))
      }
    }
    return tokens
  }

  const scriptTokens = tokenize(script)
  if (scriptTokens.size === 0) return []

  const scored: Array<{ sub: SubtitleEntry; score: number }> = []
  for (const sub of subs) {
    const subTokens = tokenize(sub.text)
    if (subTokens.size === 0) continue
    let intersect = 0
    for (const t of subTokens) {
      if (scriptTokens.has(t)) intersect++
    }
    const score = intersect / subTokens.size
    if (score >= 0.3) scored.push({ sub, score })
  }

  const positioned = scored.map(({ sub, score }) => {
    let pos = script.indexOf(sub.text)
    if (pos === -1) {
      const prefixLen = Math.floor(sub.text.length * 0.7)
      for (let len = prefixLen; len >= 8; len--) {
        pos = script.indexOf(sub.text.substring(0, len))
        if (pos >= 0) break
      }
    }
    return { sub, score, pos: pos >= 0 ? pos : Number.MAX_SAFE_INTEGER }
  })

  positioned.sort((a, b) => a.pos - b.pos)

  const result: SubtitleEntry[] = []
  const usedKeys = new Set<string>()

  for (const { sub } of positioned) {
    const key = `${sub.videoId}|${sub.startTime}`
    if (usedKeys.has(key)) continue

    let skip = false
    for (const existing of result) {
      if (existing.videoId === sub.videoId) {
        const overlapStart = Math.max(sub.startTime, existing.startTime)
        const overlapEnd = Math.min(sub.endTime, existing.endTime)
        const overlap = overlapEnd - overlapStart
        const subDur = sub.endTime - sub.startTime
        const exDur = existing.endTime - existing.startTime
        if (overlap > 0 && subDur > 0 && exDur > 0) {
          if (overlap / subDur > 0.3 || overlap / exDur > 0.3) {
            skip = true
            break
          }
        }
      }
      const subTokens = tokenize(sub.text)
      const exTokens = tokenize(existing.text)
      if (subTokens.size > 0 && exTokens.size > 0) {
        let common = 0
        for (const t of subTokens) if (exTokens.has(t)) common++
        const ratio = common / Math.min(subTokens.size, exTokens.size)
        if (ratio > 0.8) {
          skip = true
          break
        }
      }
    }
    if (skip) continue

    usedKeys.add(key)
    result.push(sub)
  }

  return result
}

/** 应用并导出为剪映工程 */
async function handleApply() {
  if (selectedSubs.value.length === 0) {
    ElMessage.warning('没有选中的片段，请先微调保留至少一个片段')
    return
  }

  const conv = conversations.value.find(c => c.id === activeConvId.value)
  const gapFrames = conv?.frameGap ?? 4
  const clipGapMs = Math.round(gapFrames * 1000 / 30) // 气口：按30fps计算毫秒

  let projectName = ''
  try {
    const topicPart = (conv?.topic || '网感文案').split('\n')[0].trim().slice(0, 12)
    const { value } = await ElMessageBox.prompt('请输入剪映工程名称', '导出剪映工程', {
      confirmButtonText: '导出',
      inputValue: `${topicPart}_${new Date().toLocaleDateString()}`,
      inputPlaceholder: '工程名称'
    })
    projectName = value || ''
  } catch { return }

  const firstSub = selectedSubs.value[0]
  const firstVideo = store.importedVideos.find(v => v.id === firstSub.videoId)
  const canvasW = firstVideo?.width || 1080
  const canvasH = firstVideo?.height || 1920

  const clipItems = selectedSubs.value.map(s => ({
    sourceFile: s.videoPath,
    sourceFileName: s.videoName,
    startMs: s.startTime,
    endMs: s.endTime
  }))

  const subtitleItems: Array<{ text: string; startMs: number; endMs: number }> = []

  try {
    const project = buildProject(clipItems, subtitleItems, projectName, canvasW, canvasH, clipGapMs)
    const result = await exportJianyingProject(project, store.jianyingDraftPath, () => {})

    if (result.success) {
      ElMessage.success(`已导出到剪映草稿（片段间保留 ${gapFrames} 帧气口）: ${result.projectPath}`)
    } else {
      ElMessage.error('导出失败')
    }
  } catch (e: any) {
    ElMessage.error('导出失败: ' + (e.message || '未知错误'))
  }
}

function renderScript(text: string): string {
  let result = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  result = result
    .replace(/^## (.+?)$/gm, '<div class="script-section">$1</div>')
    .replace(/^#(\d+)(.*?)$/gm, '<span class="script-idx">#$1</span>$2')
    .replace(/\n/g, '<br>')
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  return result
}

// ===== 生命周期 =====
onMounted(async () => {
  loadConversations()
  if (conversations.value.length > 0) {
    activeConvId.value = conversations.value[0].id
  } else {
    newConversation()
  }
  await nextTick()
  if (store.storagePath) scanDiskSubtitles()
})
</script>

<style scoped>
.workflow-panel {
  flex: 1;
  display: flex;
  height: 100%;
  overflow: hidden;
  background: var(--c-bg);
}

/* ===== 侧边栏 ===== */
.wf-sidebar {
  width: 220px;
  min-width: 220px;
  background: var(--c-bg-card);
  border-right: 1px solid var(--c-border);
  display: flex;
  flex-direction: column;
  padding: 12px;
  transition: all var(--transition-normal);
  overflow: hidden;
}
.wf-sidebar.collapsed {
  width: 48px;
  min-width: 48px;
  padding: 12px 6px;
}
.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.sidebar-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--c-text);
}
.conversation-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.conv-item {
  display: flex;
  align-items: center;
  padding: 8px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  gap: 4px;
  transition: background var(--transition-fast);
}
.conv-item:hover { background: var(--c-bg-hover); }
.conv-item.active { background: var(--c-primary-soft); }
.conv-item .el-button {
  visibility: hidden;
  margin-left: auto;
}
.conv-item:hover .el-button { visibility: visible; }
.conv-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--c-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}
.conv-time {
  font-size: 10px;
  color: var(--c-text-muted);
  flex-shrink: 0;
}
.conv-empty {
  text-align: center;
  color: var(--c-text-muted);
  font-size: 12px;
  padding: 20px 0;
}

/* ===== 主工作区 ===== */
.wf-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.wf-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  background: linear-gradient(135deg, var(--c-primary-soft), color-mix(in srgb, var(--c-primary) 8%, var(--c-bg-card)));
  font-size: 13px;
  color: var(--c-primary);
  flex-shrink: 0;
  border-bottom: 1px solid var(--c-border-light);
}
.wf-header-icon { font-size: 18px; }
.wf-header-title { font-weight: 600; }
.wf-header-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
}
.wf-header-stat {
  font-size: 12px;
  color: var(--c-text-sec);
  background: var(--c-bg-card);
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid var(--c-border-light);
}

/* ===== 步骤指示器 ===== */
.wf-stepper {
  display: flex;
  align-items: center;
  padding: 12px 20px;
  background: var(--c-bg-card);
  border-bottom: 1px solid var(--c-border-light);
  gap: 0;
  overflow-x: auto;
  flex-shrink: 0;
}
.step-item {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  position: relative;
  padding-right: 16px;
}
.step-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--c-bg-hover);
  color: var(--c-text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  border: 2px solid var(--c-border);
  transition: all var(--transition-fast);
  flex-shrink: 0;
  z-index: 1;
}
.step-item.active .step-dot {
  background: var(--c-primary);
  color: var(--c-primary-text);
  border-color: var(--c-primary);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--c-primary) 15%, transparent);
}
.step-item.done .step-dot {
  background: var(--c-success);
  color: var(--c-primary-text);
  border-color: var(--c-success);
}
.step-meta { display: flex; flex-direction: column; line-height: 1.2; }
.step-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--c-text-sec);
  white-space: nowrap;
}
.step-item.active .step-label { color: var(--c-primary); }
.step-item.done .step-label { color: var(--c-success); }
.step-sub {
  font-size: 10px;
  color: var(--c-text-muted);
  white-space: nowrap;
}
.step-line {
  position: absolute;
  right: 0;
  top: 50%;
  width: 16px;
  height: 2px;
  background: var(--c-border);
  transform: translateY(-50%);
}
.step-line.filled { background: var(--c-success); }

/* ===== 主体 ===== */
.wf-body {
  flex: 1;
  display: flex;
  gap: 14px;
  padding: 16px;
  overflow: hidden;
}
.wf-left {
  width: 340px;
  min-width: 300px;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  padding-right: 4px;
}
.wf-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

/* ===== 卡片 ===== */
.wf-card {
  background: var(--c-bg-card);
  border-radius: var(--radius-lg);
  padding: 14px 16px;
  box-shadow: var(--c-shadow);
  border: 1px solid var(--c-border-light);
}

.card-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--c-text);
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.step-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--c-primary);
  color: var(--c-primary-text);
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}
.step-badge-result { background: var(--c-accent, #7c5cfc); }
.step-badge-tune { background: var(--c-warning); }

.param-block {
  padding: 10px 0;
  border-bottom: 1px dashed var(--c-border-light);
}
.param-block-last {
  border-bottom: none;
  padding-bottom: 0;
}
.param-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--c-text-sec);
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.param-desc {
  font-size: 11px;
  color: var(--c-text-muted);
  line-height: 1.5;
}
.param-val-tag {
  margin-left: auto;
  font-size: 11px;
  font-weight: 500;
  color: var(--c-primary);
  background: var(--c-primary-soft);
  padding: 1px 8px;
  border-radius: 999px;
}

.param-row {
  display: flex;
  align-items: flex-start;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}
.param-row-last { margin-bottom: 0; }
.param-row .param-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--c-text-sec);
}
.param-row .el-input { width: 100%; }

.param-slider-wrap {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
}
.param-edge {
  font-size: 11px;
  color: var(--c-text-muted);
  white-space: nowrap;
  line-height: 1;
}
.frame-gap-badge {
  font-size: 11px;
  color: var(--c-primary);
  background: var(--c-primary-soft);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-weight: 600;
  white-space: nowrap;
}

/* 风格选择 */
.style-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}
.style-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 8px 4px;
  border-radius: var(--radius-md);
  border: 1px solid var(--c-border-light);
  background: var(--c-bg);
  cursor: pointer;
  transition: all var(--transition-fast);
  user-select: none;
}
.style-chip:hover {
  border-color: var(--c-primary);
  background: var(--c-primary-soft);
  transform: translateY(-1px);
}
.style-chip.active {
  border-color: var(--c-primary);
  background: linear-gradient(135deg, var(--c-primary-soft), color-mix(in srgb, var(--c-primary) 12%, var(--c-bg-card)));
  box-shadow: 0 2px 8px color-mix(in srgb, var(--c-primary) 20%, transparent);
}
.style-chip-emoji { font-size: 18px; line-height: 1; }
.style-chip-label {
  font-size: 11px;
  color: var(--c-text-sec);
  font-weight: 500;
}
.style-chip.active .style-chip-label { color: var(--c-primary); font-weight: 600; }

.platform-row { width: 100%; }
.platform-row :deep(.el-radio-group) {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.platform-row :deep(.el-radio-button__inner) {
  padding: 6px 12px;
  font-size: 12px;
}

.hook-switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

/* 模型选择 */
.model-group {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
}
.model-radio { margin-right: 0; }

/* 生成按钮 */
.generate-btn {
  width: 100%;
  height: 42px;
  font-size: 14px;
  font-weight: 600;
  border-radius: var(--radius-md);
  box-shadow: 0 4px 12px color-mix(in srgb, var(--c-primary) 25%, transparent);
}

/* ===== 数据源 ===== */
.source-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  margin-bottom: 8px;
}
.source-hint-warn {
  color: var(--c-warning);
  background: color-mix(in srgb, var(--c-warning) 10%, transparent);
}
.source-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 200px;
  overflow-y: auto;
}
.source-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 8px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background var(--transition-fast);
}
.source-item:hover { background: var(--c-bg-hover); }
.source-item.selected { background: var(--c-primary-soft); }
.source-icon { color: var(--c-primary); }
.source-name {
  font-size: 12px;
  color: var(--c-text);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.source-sub-count {
  font-size: 11px;
  color: var(--c-text-muted);
  flex-shrink: 0;
}
.source-actions {
  margin-top: 8px;
  display: flex;
  gap: 4px;
  padding-top: 8px;
  border-top: 1px dashed var(--c-border-light);
}

/* 加载态 */
.wf-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  color: var(--c-primary);
  font-size: 13px;
  background: var(--c-primary-soft);
  border-radius: var(--radius-md);
}
.wf-loading-text { text-align: center; font-weight: 500; }

/* 日志 */
.gen-log-card {
  border: 1px solid var(--c-border-light);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--c-bg-card);
}
.gen-log-header {
  padding: 8px 12px;
  background: var(--c-bg-sec);
  user-select: none;
}
.gen-log-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--c-text-sec);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.gen-log-arrow {
  transition: transform var(--transition-fast);
  color: var(--c-text-muted);
}
.gen-log-body {
  padding: 8px 12px 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
}
.log-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
.log-label { color: var(--c-text-muted); }
.log-val { color: var(--c-text); font-weight: 600; }
.log-warn { color: var(--c-warning) !important; }
.log-primary { color: var(--c-primary) !important; }

/* ===== 结果区 ===== */
.result-card {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--c-border-light);
  margin-bottom: 12px;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.result-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--c-text);
}
.result-status-streaming {
  font-size: 11px;
  color: var(--c-primary);
  background: var(--c-primary-soft);
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 500;
  animation: pulse 1.5s infinite;
}
.result-status-done {
  font-size: 11px;
  color: var(--c-success);
  background: color-mix(in srgb, var(--c-success) 12%, transparent);
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.result-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

/* 片段卡片列表 */
.segment-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 2px 8px;
  display: flex;
  flex-direction: column;
  gap: 0;
  min-height: 0;
}
.segment-card {
  background: var(--c-bg);
  border: 1px solid var(--c-border-light);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  cursor: pointer;
  transition: all var(--transition-fast);
  position: relative;
}
.segment-card:hover {
  border-color: var(--c-primary);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--c-primary) 12%, transparent);
}
.segment-card.removed {
  opacity: 0.4;
  background: var(--c-bg-hover);
}
.segment-card.removed .segment-text { text-decoration: line-through; }
.segment-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  flex-wrap: wrap;
  font-size: 11px;
}
.segment-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--c-primary);
  color: var(--c-primary-text);
  font-weight: 700;
  font-size: 11px;
  flex-shrink: 0;
}
.segment-card.removed .segment-index { background: var(--c-text-muted); }
.segment-video {
  color: var(--c-primary);
  background: var(--c-primary-soft);
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  font-weight: 500;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.segment-time {
  color: var(--c-text-muted);
  font-family: monospace;
}
.segment-dur { color: var(--c-text-sec); font-weight: 500; }
.segment-tag { margin-left: auto; }
.segment-text {
  font-size: 14px;
  line-height: 1.7;
  color: var(--c-text);
  font-weight: 500;
  padding-left: 30px;
}
.segment-gap {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 10px;
  color: var(--c-text-muted);
}
.gap-line {
  flex: 1;
  height: 1px;
  background: repeating-linear-gradient(90deg, var(--c-border) 0 4px, transparent 4px 8px);
}
.gap-label {
  font-size: 10px;
  padding: 2px 8px;
  background: var(--c-bg-card);
  border: 1px solid var(--c-border-light);
  border-radius: 999px;
  white-space: nowrap;
  color: var(--c-warning);
}

/* 脚本文本区 */
.script-text {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  font-size: 13px;
  line-height: 1.8;
  color: var(--c-text);
  padding: 8px 4px;
}
.script-text :deep(.script-section) {
  font-size: 14px;
  font-weight: 600;
  color: var(--c-primary);
  margin: 14px 0 6px;
  padding: 6px 10px;
  background: var(--c-primary-soft);
  border-radius: var(--radius-sm);
  border-left: 3px solid var(--c-primary);
}
.script-text :deep(.script-idx) {
  display: inline-block;
  background: var(--c-primary-soft);
  color: var(--c-primary);
  border-radius: var(--radius-sm);
  padding: 1px 6px;
  font-size: 12px;
  font-weight: 600;
  margin-right: 4px;
}

/* AI 分析 */
.ai-analysis {
  margin: 10px 0 0;
  padding: 8px 12px;
  background: var(--c-bg-sec);
  border-radius: var(--radius-md);
  border: 1px solid var(--c-border-light);
  flex-shrink: 0;
}
.ai-analysis summary {
  outline: none;
  user-select: none;
  cursor: pointer;
  font-size: 12px;
  color: var(--c-text-sec);
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
  list-style: none;
}
.ai-analysis summary::-webkit-details-marker { display: none; }
.details-arrow {
  margin-left: auto;
  transition: transform var(--transition-fast);
  font-size: 12px;
}
.ai-analysis[open] .details-arrow { transform: rotate(90deg); }
.analysis-text {
  font-size: 12px;
  color: var(--c-text-sec);
  line-height: 1.7;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--c-border-light);
}

/* 匹配信息 */
.match-info {
  margin-top: 10px;
  padding: 10px 12px;
  background: var(--c-bg-sec);
  border-radius: var(--radius-md);
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  flex-shrink: 0;
}
.match-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.match-stat-label {
  font-size: 10px;
  color: var(--c-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.match-stat-val {
  font-size: 13px;
  color: var(--c-text);
  font-weight: 600;
}

/* 微调 */
.tune-section {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--c-border-light);
  flex-shrink: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 200px;
}
.tune-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
  color: var(--c-text);
  margin-bottom: 6px;
  gap: 8px;
}
.tune-list {
  max-height: 150px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.tune-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  cursor: pointer;
  transition: all var(--transition-fast);
}
.tune-item:hover { background: var(--c-bg-hover); }
.tune-item.removed { opacity: 0.4; text-decoration: line-through; }
.tune-idx { color: var(--c-text-muted); min-width: 20px; flex-shrink: 0; font-weight: 600; }
.tune-time {
  color: var(--c-text-muted);
  font-size: 11px;
  flex-shrink: 0;
  font-family: monospace;
  background: var(--c-bg);
  padding: 1px 5px;
  border-radius: 3px;
}
.tune-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--c-text-sec);
}

/* 空状态 */
.result-empty { overflow: hidden !important; }
.wf-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 40px 20px;
  color: var(--c-text-muted);
  text-align: center;
}
.empty-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--c-text);
}
.empty-desc {
  font-size: 13px;
  color: var(--c-text-sec);
  line-height: 1.7;
}
.empty-tips {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  text-align: left;
}
.tip-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--c-text-muted);
}
.tip-item .el-icon { color: var(--c-primary); }
</style>