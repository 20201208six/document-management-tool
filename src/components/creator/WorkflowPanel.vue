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
        <el-icon><MagicStick /></el-icon>
        <span>官方工作流 — 基于字幕数据智能生成视频文案</span>
        <div style="margin-left:auto;display:flex;align-items:center;gap:8px">
          <span v-if="sourceList.length > 0" style="font-size:12px;color:#606266">
            已选 {{ selectedSourceIds.length }}/{{ sourceList.length }} 个来源
          </span>
          <el-button size="small" @click="refreshSources" :loading="scanning">
            <el-icon><Refresh /></el-icon> 刷新数据
          </el-button>
        </div>
      </div>

      <div class="wf-body">
        <!-- 左侧：输入区（步骤 1-4） -->
        <div class="wf-left">
          <!-- 数据源选择 -->
          <div class="wf-card">
            <div class="card-title">步骤 1：选择数据源</div>

            <div v-if="!hasStoragePath" class="source-hint">
              <el-icon><InfoFilled /></el-icon>
              未设置字幕存储目录，请先在「工作状态」→「字幕管理」中配置
            </div>
            <div v-else-if="sourceList.length === 0 && !scanning" class="source-hint">
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
                <el-icon :size="16" color="#409eff"><VideoCamera /></el-icon>
                <span class="source-name">{{ src.name }}</span>
                <span class="source-sub-count">{{ src.subtitleCount }} 条字幕</span>
              </div>
            </div>

            <div v-if="sourceList.length > 0" style="margin-top:8px;display:flex;gap:8px">
              <el-button size="small" text @click="selectAllSources">全选</el-button>
              <el-button size="small" text @click="deselectAllSources">取消全选</el-button>
            </div>
          </div>

          <div class="wf-card">
            <div class="card-title">步骤 2：文案方向 / 需求</div>
            <el-input
              v-model="currentConv.topic"
              type="textarea"
              :rows="2"
              placeholder="描述您想要生成的文案方向，例如：&#10;「做一个关于时间管理的励志视频脚本」"
            />
          </div>

          <div class="wf-card">
            <div class="card-title">步骤 3：输出控制</div>

            <div class="param-row">
              <span class="param-label">时长要求</span>
              <el-input
                v-model="currentConv.durationRequirement"
                size="small"
                placeholder="如：五分钟以上 / 3-4分钟"
                clearable
                @change="onConvDirty"
              />
            </div>

            <div class="param-row">
              <span class="param-label">句子间隔</span>
              <div class="param-slider-wrap">
                <span class="param-edge">1帧</span>
                <el-slider
                  v-model="currentConv.frameGap"
                  :min="1"
                  :max="10"
                  :step="1"
                  size="small"
                  style="flex:1"
                  @change="onConvDirty"
                />
                <span class="param-edge">10帧</span>
              </div>
            </div>
          </div>

          <div class="wf-card">
            <div class="card-title">步骤 4：选择模型</div>
            <el-radio-group v-model="selectedModelId" size="small">
              <el-radio v-for="m in chatStore.models" :key="m.id" :value="m.id">
                {{ m.name }}
              </el-radio>
            </el-radio-group>
          </div>

          <el-button
            type="primary"
            size="default"
            :loading="isGenerating"
            :disabled="selectedSourceIds.size === 0 || !currentConv.topic.trim()"
            @click="handleGenerate"
            style="width:100%"
          >
            <el-icon><MagicStick /></el-icon>
            生成文案
          </el-button>

          <div v-if="isGenerating" class="wf-loading">
            <el-icon class="is-loading" :size="28"><Loading /></el-icon>
            <span>{{ statusText }}</span>
          </div>

          <!-- 生成详情日志 -->
          <div v-if="genLog || isGenerating" class="gen-log-card">
            <div class="gen-log-header" @click="showGenLog = !showGenLog" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between">
              <span style="font-size:12px;font-weight:600;color:#606266">
                <el-icon :size="14"><InfoFilled /></el-icon> 生成详情
              </span>
              <el-icon :size="14" style="transition:transform .2s" :style="{ transform: showGenLog ? 'rotate(90deg)' : '' }">
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
              <div class="log-item" v-if="genLog && genLog.truncated">
                <span class="log-label" style="color:#e6a23c">注意</span>
                <span class="log-val" style="color:#e6a23c">输入数据超长已截断</span>
              </div>
              <div class="log-item" v-if="!genLog">
                <span class="log-label">状态</span>
                <span class="log-val" style="color:#409eff">流式返回中...</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 右侧：结果区（步骤 5-7） -->
        <div class="wf-right">
          <!-- 生成中流式输出 或 已完成结果 -->
          <div v-if="currentConv.generatedScript || streamingScript" class="wf-card result-card" style="height:100%;display:flex;flex-direction:column;min-height:0">
            <div class="card-title" style="display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
              <span>
                步骤 5：朗读预览
                <span v-if="isGenerating" style="font-size:11px;color:#409eff;font-weight:400;margin-left:6px">接收中</span>
              </span>
              <el-button size="small" type="primary" @click="handleApply" :disabled="selectedSubs.length === 0 || isGenerating">
                <el-icon><Check /></el-icon> 应用并导出
              </el-button>
            </div>

            <!-- 主：朗读预览 -->
            <div v-if="matchedSubs.length > 0" class="script-text" style="flex:1;overflow-y:auto;min-height:0" v-html="renderScript(readableScript)"></div>
            <div v-else-if="isGenerating" class="script-text" style="flex:1;overflow-y:auto;min-height:0" v-html="renderScript(streamingScript)"></div>

            <!-- AI 分析（可折叠） -->
            <details v-if="currentConv.generatedScript" class="ai-analysis" style="flex-shrink:0">
              <summary style="cursor:pointer;font-size:12px;color:#909399;padding:4px 0">
                AI 筛选剔除 & 编排 & 节奏审查 & 时长
              </summary>
              <div v-html="renderScript(aiAnalysisOnly)" class="analysis-text"></div>
            </details>

            <!-- 匹配信息 -->
            <div v-if="matchedSubs.length > 0" class="match-info" style="flex-shrink:0">
              <span>片段: {{ selectedSubs.length }} / {{ matchedSubs.length }} 个</span>
              <span>总时长: {{ store.formatTime(totalMatchDuration) }}</span>
            </div>

            <!-- 步骤 7：微调片段 -->
            <div v-if="matchedSubs.length > 0" class="tune-section" style="flex-shrink:0;overflow:hidden;display:flex;flex-direction:column;max-height:180px">
              <div class="tune-header">
                <span>步骤 7：微调片段</span>
                <el-button v-if="removedIndices.size > 0" size="small" text type="primary" @click="removedIndices.clear()">
                  恢复全部
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
                  <span class="tune-video">{{ sub.videoName }}</span>
                  <span class="tune-time">{{ store.formatTimeMs(sub.startTime) }} - {{ store.formatTimeMs(sub.endTime) }}</span>
                  <span class="tune-text">{{ sub.text }}</span>
                  <el-button size="small" circle text type="danger" @click.stop="toggleRemove(idx)" :title="removedIndices.has(idx) ? '恢复' : '移除'">
                    <el-icon><Close v-if="removedIndices.has(idx)" /><Minus v-else /></el-icon>
                  </el-button>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="wf-card result-card" style="height:100%;display:flex;flex-direction:column;overflow:hidden">
            <div class="card-title" style="flex-shrink:0">步骤 5：朗读预览</div>
            <div class="wf-empty" style="flex:1;justify-content:center">
              <el-icon :size="32"><Document /></el-icon>
              <span v-if="!isGenerating">在左侧输入方向后点击「生成」</span>
              <span v-else style="color:#409eff">等待 AI 返回...</span>
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

const totalMatchDuration = computed(() =>
  selectedSubs.value.reduce((sum, s) => sum + (s.endTime - s.startTime), 0) / 1000
)

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
  // 去掉「选择清单」区块，保留筛选剔除、编排说明、节奏审查、时长验证
  return conv.generatedScript.replace(/\n?##\s*选择清单\s*\n[\s\S]*?(?=\n##\s*筛选剔除|$)/i, '').trim()
})

function toggleRemove(idx: number) {
  const s = new Set(removedIndices.value)
  if (s.has(idx)) s.delete(idx)
  else s.add(idx)
  removedIndices.value = s
}

const hasStoragePath = computed(() => !!store.storagePath)

/** 扫描存储目录中的 .subtitles.json 文件，并与 importedVideos 交叉比对 */
async function scanDiskSubtitles() {
  const api = (window as any).electronAPI
  if (!api?.listDirectory || !store.storagePath) {
    sourceList.value = []
    return
  }

  scanning.value = true
  const results: SubtitleSource[] = []

  try {
    // 递归收集所有 .subtitles.json 文件
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

    // 交叉比对：importedVideos vs 磁盘文件
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

    // 磁盘中有但 importedVideos 中没有的（纯磁盘字幕文件）
    for (const df of diskFiles) {
      const diskBaseName = df.name.replace('.subtitles.json', '')
      const alreadyIncluded = results.some(r => r.name.replace(/\.\w+$/, '') === diskBaseName)
      if (!alreadyIncluded) {
        let subs: SubtitleSegment[] = []
        try {
          const content = await api.readFile(df.path)
          const data = JSON.parse(content)
          subs = Array.isArray(data.subtitles) ? data.subtitles : []
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
  // 默认全选
  if (results.length > 0 && selectedSourceIds.value.size === 0) {
    selectedSourceIds.value = new Set(results.map(r => r.id))
  }
  // 清理已不存在的 id
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

// 监听存储路径变化
watch(() => store.storagePath, () => {
  if (store.storagePath) scanDiskSubtitles()
})

// ===== 对话管理 =====
const STORAGE_KEY = 'workflow-conversations'

interface Conversation {
  id: string
  title: string
  topic: string
  durationRequirement: string
  frameGap: number
  generatedScript: string
  createdAt: number
  updatedAt: number
}

const conversations = ref<Conversation[]>([])
const activeConvId = ref('')
const sidebarCollapsed = ref(false)

function loadConversations() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) conversations.value = JSON.parse(raw)
  } catch { conversations.value = [] }
}

function saveConversations() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations.value))
}

function emptyConv(): Conversation {
  return { id: '', title: '', topic: '', durationRequirement: '', frameGap: 5, generatedScript: '', createdAt: 0, updatedAt: 0 }
}

// 持久化的后备对象，避免 v-model 写入临时对象
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
    frameGap: 5,
    generatedScript: '',
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
  conversations.value.unshift(conv)
  activeConvId.value = id
  saveConversations()
}

function switchConversation(id: string) {
  activeConvId.value = id
}

function deleteConversation(id: string) {
  ElMessageBox.confirm('确定删除此对话？', '确认', { type: 'warning' }).then(() => {
    conversations.value = conversations.value.filter(c => c.id !== id)
    if (activeConvId.value === id) {
      activeConvId.value = conversations.value[0]?.id || ''
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

// 自动更新对话标题
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
  statusText.value = `正在使用 ${selectedSources.length} 个数据源，调用 AI 生成文案...`

  // 计算选中数据源的原始总时长（秒），告诉 AI 实际数据量
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
      sourceContent.content, conv.topic, conv.durationRequirement || '', conv.frameGap,
      totalSourceMin, totalSourceSecRemain, model,
      (text) => { streamingScript.value = text }
    )
    const script = result.text

    genLog.value = {
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      charsOut: script.length,
      truncated: sourceContent.content.length > 15000
    }

    // 从 AI 输出中解析 #N 编号，直接映射到字幕条目
    matchedSubs.value = parseScriptIndices(script, sourceContent.entries)
    // 补全 videoPath（构建时还没有）
    for (const sub of matchedSubs.value) {
      const video = store.importedVideos.find(v => v.id === sub.videoId)
      if (video) sub.videoPath = video.path
    }
    removedIndices.value = new Set()

    conv.generatedScript = script
    conv.updatedAt = Date.now()
    saveConversations()

    // 时长校验 + 自动裁剪：如果用户设了时长要求
    if (conv.durationRequirement?.trim()) {
      const actualSec = totalMatchDuration.value
      const actualMin = Math.floor(actualSec / 60)
      const actualSecRem = Math.floor(actualSec % 60)
      const hint = `实际匹配时长: ${actualMin}分${actualSecRem}秒（原始数据总量: ${totalSourceMin}分${totalSourceSecRemain}秒）`

      // 解析时长要求：提取数字，智能判断是上限/下限/范围
      const nums = conv.durationRequirement.match(/\d+/g)?.map(Number) || []
      let minTarget = 0, maxTarget = 0

      if (nums.length === 1) {
        // "5分钟" / "五分钟左右" / "至少5分钟" / "不超过7分钟"
        const req = conv.durationRequirement
        if (req.includes('至少') || req.includes('最低') || req.includes('以上') || req.includes('不少于')) {
          minTarget = nums[0]
        } else if (req.includes('不超过') || req.includes('最多') || req.includes('以内') || req.includes('以下')) {
          maxTarget = nums[0]
        } else {
          // "五分钟左右" / "大约5分钟" → 区间 [4, 6]
          minTarget = Math.max(1, nums[0] - 1)
          maxTarget = nums[0] + 1
        }
      } else if (nums.length >= 2) {
        // "5-7分钟" → [5, 7]
        minTarget = nums[0]
        maxTarget = nums[nums.length - 1]
      }

      // 超出上限 → 从末尾裁剪
      if (maxTarget > 0 && actualSec > maxTarget * 60) {
        let trimmed = [...matchedSubs.value]
        let total = actualSec
        while (trimmed.length > 1 && total > maxTarget * 60) {
          const removed = trimmed.pop()!
          total -= (removed.endTime - removed.startTime) / 1000
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

async function callAI(sourceContent: string, topic: string, durationReq: string, frameGap: number, dataMin: number, dataSec: number, model: { apiKey: string; apiUrl: string; modelParam: string }, onChunk: (text: string) => void): Promise<{ text: string; promptTokens: number; completionTokens: number }> {
  let systemPrompt = `你是一个专业的视频剪辑师。你的工作是从「字幕库」中挑选字幕并按播出顺序排列，形成一段逻辑通顺、听觉流畅的视频文案。

【你的工作方式】
1. 阅读每条字幕的内容（编号 #N，后面有文本和时长秒数）
2. 根据用户要求挑选合适的字幕，按播出顺序排列
3. 执行去重筛查（见下方「去重规则」），把重复的字幕丢掉
4. 检查排列后的文本节奏是否自然（见下方「节奏审查」）
5. 累计选中字幕的时长，验证是否符合用户的目标

【挑选原则】
- 开头：最具冲击力或共鸣感的字幕 → 抓人眼球
- 中间：逻辑递进，前一句自然引出后一句 → 观众能跟得上
- 结尾：引发好奇或给出行动号召 → 获客钩子
- 节奏：长短句交替（2-8秒为主力句，避免连续多条都超过15秒导致听觉疲劳）

【去重规则——你必须逐条筛查，把重复的字幕丢掉】
重复分三类，请在浏览字幕库时逐条检查：

▸ 字面重复（口吃/磕巴）：
  如 "他没有风险，没有风险" → 第二个"没有风险"是口吃重复 → 只保留 #N 一次
  如 "然后然后我们就" → "然后"重复 → 视为一条即可
  在编排说明中注明你跳过了哪些字面重复

▸ 语义重复（同一个意思说了两遍）：
  如 #5 "这个特别好" 和 #18 "真的特别棒" → 同义，只保留更精炼的一条
  如 #7 "这个方法很管用" 和 #22 "这个方法确实有效" → 只留一条
  在编排说明中注明：某某与某某同义，选了 X

▸ 近义堆砌（一句话里用了多个同义词）：
  如 "很重要，特别关键，非常核心" → 这三词同义堆砌 → 如果分属不同字幕条，只选一条
  如 "必须要做，一定要做，不得不做" → 情绪递进可以保留，纯粹同义只留一条

【节奏审查（气口分析）——这一步很关键】
选完字幕后，请模拟朗读一遍，评估听觉节奏：

▸ 字幕时长分布检查：
  - 短字幕（≤1秒）：信息碎片感强，不宜连续出现3条以上
  - 主力学幕（2~8秒）：最舒适，应占多数
  - 长字幕（>15秒）：如果内部没有自然停顿，听众会疲劳 → 尽量拆开或跳过

▸ 句间衔接检查：
  - 前一句结尾和后一句开头的语义是否顺滑？
  - 有没有"话题突然跳转"导致听众需要回神反应？（有的话请标注）
  - 同一主题的字幕应该放在一起，不要交叉打乱

▸ 气口自然度：
  - 一条字幕内部如果断句位置不对（如一句话被切断在"的/了/吗"之前），听觉上会很别扭 → 跳过这条
  - 如果相邻两条字幕拼起来正好是一句完整的话，是最理想的状态

【时长说明】
每条字幕后面的 | X秒 是该条时长。选中的每条秒数加起来就是总时长。`

  if (durationReq.trim()) {
    const nums = durationReq.match(/\d+/g)?.map(Number) || []
    systemPrompt += `\n\n【用户时长目标】${durationReq.trim()}`
    if (nums.length >= 2) {
      systemPrompt += `\n折算：目标 ${nums[0]}~${nums[nums.length - 1]} 分钟 = ${nums[0]*60}~${nums[nums.length-1]*60} 秒`
    } else if (nums.length === 1) {
      systemPrompt += `\n折算：目标约 ${nums[0]} 分钟 = ${nums[0]*60} 秒`
    }
    systemPrompt += `\n内容质量始终优先于精确时长。数据不够时如实说明。`
  }

  if (frameGap > 1) {
    systemPrompt += `\n\n导出时片段间自动插入 ${frameGap} 帧间隔，你无需额外处理。`
  }

  systemPrompt += `\n\n【输出格式——每个部分都必须有】
请严格按以下五个部分输出：

## 选择清单
每行一个编号（只写 #N，不要抄文字），按播出顺序排列。示例：
#5
#12
#3

## 筛选剔除
列出你主动跳过、没选的字幕及其原因：
- #7（与 #5 字面重复："没有风险"出现两次）→ 跳过
- #22（与 #18 同义）→ 跳过
- #33（<1秒碎片，且被切断在"的"字前）→ 跳过
（如果没有需要跳过的，写"无"）

## 编排说明
3~5 句话说明：
- 为什么这样选（开头策略、中间逻辑线、结尾设计）
- 做了哪些取舍（比如某条内容好但太长所以跳过）
- 如果数据总量达不到时长目标，在这里首先说明

## 节奏审查
用 2~3 句话从"听众耳朵"角度评价：
- 时长分布：主力句（2-8秒）占比？有没有连续3条以上短碎片？
- 衔接体验：相邻句子过渡是否平顺？有没有突然换话题？
- 气口自然度：有没有字幕断在半句话导致听觉别扭？
- "通顺" 或 "有跳跃，在第X条和第Y条之间"

## 时长验证
逐条列出时长并求和（必须有算式），例如：
#5(4秒) + #12(8秒) + #3(5秒) = 17秒
选中3条，累计17秒，约0.3分钟`

  const userMsg = `【字幕库】\n${sourceContent}\n\n【用户要求】\n${topic}\n\n请从字幕库中挑选合适的字幕，按上述格式输出。`

  // 大幅提高限制：276条字幕约10000字，不再轻易截断
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
      temperature: 0.7,
      max_tokens: 16384,
      stream: true
    })
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`API 错误 (${response.status}): ${err}`)
  }

  // 尝试流式读取，如果 API 不支持流式则回退到非流式
  const contentType = response.headers.get('content-type') || ''
  const useStream = contentType.includes('text/event-stream') || contentType.includes('application/json')

  if (useStream && response.body) {
    try {
      return await readStream(response.body, onChunk, systemPrompt.length + truncatedMsg.length)
    } catch (streamErr: any) {
      // 流式失败，回退到非流式
      console.warn('流式读取失败，尝试非流式:', streamErr.message)
    }
  }

  // 非流式回退
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
  const IDLE_TIMEOUT = 15000  // 15 秒无数据则视为结束

  // 定时检测是否超时
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
        // 支持 "data: " 和 "data:" 前缀
        const dataIdx = trimmed.indexOf('data:')
        if (dataIdx !== 0) continue
        const jsonStr = trimmed.slice(5).trim()
        if (!jsonStr || jsonStr === '[DONE]') continue

        try {
          const chunk = JSON.parse(jsonStr)
          const choice = chunk.choices?.[0]
          if (!choice) continue
          // 兼容各种 delta 格式
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

  // 估算 token（如果 API 没返回 usage）
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

/** 将生成的文案匹配到实际字幕，按脚本出现顺序排列 */
function parseScriptIndices(script: string, entries: SubtitleEntry[]): SubtitleEntry[] {
  if (entries.length === 0) return []

  // 提取「选择清单」区块中的所有 #N
  const selectSection = script.match(/##\s*选择清单\s*\n([\s\S]*?)(?=\n##|$)/i)
  const sectionText = selectSection ? selectSection[1] : script

  // 提取所有 #N 编号（支持 #1, #12, #1-#5 等格式）
  const indices: number[] = []
  const seen = new Set<number>()

  // 匹配 #N 模式
  const matches = sectionText.matchAll(/#(\d+)/g)
  for (const m of matches) {
    const n = parseInt(m[1], 10)
    if (n >= 1 && n <= entries.length && !seen.has(n)) {
      seen.add(n)
      indices.push(n - 1) // 转 0-based
    }
  }

  // 如果解析到了编号，直接返回映射
  if (indices.length > 0) {
    return indices.map(i => entries[i])
  }

  // 回退：旧格式兼容 —— 用 bigram 模糊匹配
  return fuzzyMatchScriptToSubs(script, entries)
}

/** 旧格式回退：bigram 模糊匹配（保留以兼容旧对话） */
function fuzzyMatchScriptToSubs(script: string, subs: SubtitleEntry[]): SubtitleEntry[] {
  if (subs.length === 0) return []

  // 中文分词：按标点拆短语，提取连续2-3字作为特征
  const tokenize = (text: string): Set<string> => {
    const tokens = new Set<string>()
    // 按标点和空白拆成短语
    const phrases = text.split(/[\s，,。.！!？?、；;：:（）()【】\[\]""''\n\r]+/).filter(p => p.length >= 2)
    for (const p of phrases) {
      for (let i = 0; i < p.length - 1; i++) {
        tokens.add(p.substring(i, i + 2))  // bigram
      }
    }
    return tokens
  }

  const scriptTokens = tokenize(script)
  if (scriptTokens.size === 0) return []

  // 对每条字幕计算 Jaccard 相似度
  const scored: Array<{ sub: SubtitleEntry; score: number }> = []
  for (const sub of subs) {
    const subTokens = tokenize(sub.text)
    if (subTokens.size === 0) continue
    let intersect = 0
    for (const t of subTokens) {
      if (scriptTokens.has(t)) intersect++
    }
    const score = intersect / subTokens.size  // 字幕文本中有多少比例在脚本中出现
    if (score >= 0.3) scored.push({ sub, score })
  }

  // 视频内按字幕顺序排列，再按脚本出现位置全局排列
  // 先找每个字幕在脚本中的最佳位置
  const positioned = scored.map(({ sub, score }) => {
    let pos = script.indexOf(sub.text)
    if (pos === -1) {
      // 先用前 70% 匹配
      const prefixLen = Math.floor(sub.text.length * 0.7)
      for (let len = prefixLen; len >= 8; len--) {
        pos = script.indexOf(sub.text.substring(0, len))
        if (pos >= 0) break
      }
    }
    return { sub, score, pos: pos >= 0 ? pos : Number.MAX_SAFE_INTEGER }
  })

  // 按脚本中的位置排序
  positioned.sort((a, b) => a.pos - b.pos)

  // 去重：
  // 1. 完全相同的字幕（同视频同时间起点）只保留一个
  // 2. 同一视频内时间重叠超过 30% 的只保留相似度更高的
  // 3. bigram 重叠超过 80% 的近似文本只保留第一个
  const result: SubtitleEntry[] = []
  const usedKeys = new Set<string>()

  for (const { sub, score } of positioned) {
    const key = `${sub.videoId}|${sub.startTime}`
    if (usedKeys.has(key)) continue

    // 与已添加的所有条目比对
    let skip = false
    for (const existing of result) {
      // 同一视频：时间重叠超过 30% → 跳过
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
      // 跨视频：文本 bigram 重叠超过 80% → 跳过（近似重复）
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
  const clipGapMs = Math.round((conv?.frameGap ?? 5) * 1000 / 30)  // 帧 → 毫秒（按30fps）

  let projectName = ''
  try {
    const { value } = await ElMessageBox.prompt('请输入剪映工程名称', '导出剪映工程', {
      confirmButtonText: '导出',
      inputValue: `剪映工程_${new Date().toLocaleDateString()}`,
      inputPlaceholder: '工程名称'
    })
    projectName = value || ''
  } catch { return }

  // 用第一个选中字幕的视频分辨率作为画布尺寸
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

  // 不使用字幕文本轨道（前面已验证字幕导出有问题）
  const subtitleItems: Array<{ text: string; startMs: number; endMs: number }> = []

  try {
    const project = buildProject(clipItems, subtitleItems, projectName, canvasW, canvasH, clipGapMs)
    const result = await exportJianyingProject(project, store.jianyingDraftPath, () => {})

    if (result.success) {
      ElMessage.success(`已导出到剪映草稿: ${result.projectPath}`)
    } else {
      ElMessage.error('导出失败')
    }
  } catch (e: any) {
    ElMessage.error('导出失败: ' + (e.message || '未知错误'))
  }
}

function renderScript(text: string): string {
  // 先做结构替换（依赖换行），再转 <br>
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
  background: #f5f6fa;
}

/* 左侧对话列表 */
.wf-sidebar {
  width: 220px;
  min-width: 220px;
  background: #fff;
  border-right: 1px solid #e4e7ed;
  display: flex;
  flex-direction: column;
  padding: 10px;
  transition: all 0.2s;
  overflow: hidden;
}

.wf-sidebar.collapsed {
  width: 46px;
  min-width: 46px;
  padding: 10px 6px;
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
  color: #303133;
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
  border-radius: 6px;
  cursor: pointer;
  gap: 4px;
  transition: background 0.15s;
}

.conv-item:hover { background: #f0f2f5; }
.conv-item.active { background: #ecf5ff; }

.conv-item .el-button {
  visibility: hidden;
  margin-left: auto;
}

.conv-item:hover .el-button {
  visibility: visible;
}

.conv-title {
  font-size: 12px;
  font-weight: 500;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.conv-time {
  font-size: 10px;
  color: #c0c4cc;
  flex-shrink: 0;
}

.conv-empty {
  text-align: center;
  color: #c0c4cc;
  font-size: 12px;
  padding: 20px 0;
}

/* 右侧工作区 */
.wf-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.wf-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: #ecf5ff;
  font-size: 13px;
  color: #409eff;
  flex-shrink: 0;
}

.wf-body {
  flex: 1;
  display: flex;
  gap: 12px;
  padding: 16px;
  overflow: hidden;
}

/* 左侧输入区 */
.wf-left {
  width: 320px;
  min-width: 280px;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
}

/* 右侧结果区 */
.wf-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

/* 卡片 */
.wf-card {
  background: #fff;
  border-radius: 8px;
  padding: 12px 14px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
}

.card-title {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 8px;
}

.param-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.param-row:last-child {
  margin-bottom: 0;
}

.param-row .param-label {
  font-size: 12px;
  font-weight: 600;
  color: #606266;
  white-space: nowrap;
  min-width: 56px;
  margin-bottom: 0;
}

.param-row .el-input {
  flex: 1;
}

.param-slider-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 4px;
}

.param-edge {
  font-size: 11px;
  color: #c0c4cc;
  white-space: nowrap;
  line-height: 1;
}

/* 数据源选择 */
.source-hint {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #e6a23c;
  padding: 4px 0;
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
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
}

.source-item:hover { background: #f0f2f5; }
.source-item.selected { background: #ecf5ff; }

.source-name {
  font-size: 12px;
  color: #303133;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-sub-count {
  font-size: 11px;
  color: #909399;
  flex-shrink: 0;
}

/* 加载态 */
.wf-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px 32px 16px;
  color: #909399;
  font-size: 14px;
}

/* 生成详情日志 */
.gen-log-card {
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  overflow: hidden;
}

.gen-log-header {
  padding: 6px 12px;
  background: #fafbfc;
  user-select: none;
}

.gen-log-body {
  padding: 6px 12px 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
}

.log-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.log-label {
  color: #909399;
}

.log-val {
  color: #303133;
  font-weight: 600;
}

/* 生成结果 */
.result-card {
  margin-top: 4px;
}
.script-text :deep(.script-section) {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin: 12px 0 4px;
  padding: 4px 0;
  border-bottom: 1px solid #ebeef5;
}
.script-text :deep(.script-idx) {
  display: inline-block;
  background: #ecf5ff;
  color: #409eff;
  border-radius: 3px;
  padding: 1px 6px;
  font-size: 12px;
  font-weight: 500;
  margin-right: 4px;
}

/* AI 分析面板 */
.ai-analysis {
  margin: 8px 0;
  padding: 6px 10px;
  background: #fafbfc;
  border-radius: 6px;
  border: 1px solid #ebeef5;
}
.ai-analysis summary {
  outline: none;
  user-select: none;
}
.ai-analysis summary::-webkit-details-marker {
  display: none;
}
.analysis-text {
  font-size: 12px;
  color: #606266;
  line-height: 1.6;
  margin-top: 4px;
  padding-top: 6px;
  border-top: 1px solid #ebeef5;
}

/* 匹配信息 */
.match-info {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid #f0f2f5;
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: #909399;
}

/* 微调片段 */
.tune-section {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid #f0f2f5;
}

.tune-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 6px;
}

.tune-list {
  max-height: 240px;
  overflow-y: auto;
}

.tune-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.tune-item:hover { background: #f5f7fa; }
.tune-item.removed {
  opacity: 0.35;
  text-decoration: line-through;
}

.tune-idx {
  color: #909399;
  min-width: 18px;
  flex-shrink: 0;
}

.tune-video {
  color: #409eff;
  background: #ecf5ff;
  padding: 0 4px;
  border-radius: 3px;
  font-size: 11px;
  flex-shrink: 0;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tune-time {
  color: #909399;
  font-size: 11px;
  flex-shrink: 0;
  font-family: monospace;
}

.tune-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #606266;
}

/* 空状态 */
.wf-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px;
  color: #c0c4cc;
}
</style>
