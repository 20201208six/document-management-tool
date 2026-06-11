<template>
  <div class="workflow-panel">
    <!-- 顶部提示 -->
    <div class="wf-header">
      <el-icon><MagicStick /></el-icon>
      <span>官方工作流 — 根据字幕内容智能生成文案并自动编排</span>
    </div>

    <!-- 左侧：输入区 -->
    <div class="wf-left">
      <div class="wf-card">
        <div class="card-title">步骤 1：文案方向</div>
        <el-input
          v-model="userTopic"
          type="textarea"
          :rows="3"
          placeholder="输入您想要的文案方向或话题，例如：&#10;「做一个关于时间管理的励志视频」&#10;「把以下关键词串成一段文案：成长、坚持、自律」"
        />
      </div>

      <div class="wf-card">
        <div class="card-title">步骤 2：数据源状态</div>
        <div class="data-status">
          <div class="status-row">
            <span>导入视频</span>
            <el-tag :type="store.importedVideos.length > 0 ? 'success' : 'info'" size="small">
              {{ store.importedVideos.length }} 个
            </el-tag>
          </div>
          <div class="status-row">
            <span>可用字幕条</span>
            <el-tag :type="store.subtitleCacheCount > 0 ? 'success' : 'info'" size="small">
              {{ store.subtitleCacheCount }} 条
            </el-tag>
          </div>
        </div>
      </div>

      <div class="wf-card">
        <div class="card-title">步骤 3：选择模型</div>
        <el-radio-group v-model="modelChoice" size="small">
          <el-radio value="deepseek">DeepSeek</el-radio>
          <el-radio value="doubao">豆包</el-radio>
        </el-radio-group>
      </div>

      <el-button
        type="primary"
        size="default"
        :loading="isGenerating"
        :disabled="!userTopic.trim() || store.subtitleCacheCount === 0"
        @click="handleGenerate"
        style="width:100%"
      >
        <el-icon><MagicStick /></el-icon>
        生成文案 & 自动编排
      </el-button>
    </div>

    <!-- 右侧：结果区 -->
    <div class="wf-right">
      <div class="wf-card result-card">
        <div class="card-title">
          步骤 4：生成结果
          <el-button v-if="generatedScript" size="small" text @click="handleApply">
            <el-icon><Check /></el-icon> 应用并导出
          </el-button>
        </div>

        <!-- 加载中 -->
        <div v-if="isGenerating" class="wf-loading">
          <el-icon class="is-loading" :size="28"><Loading /></el-icon>
          <span>{{ statusText }}</span>
        </div>

        <!-- 生成的文案 -->
        <div v-else-if="generatedScript" class="generated-script">
          <div class="script-text" v-html="renderScript(generatedScript)"></div>

          <div class="match-info">
            <span>匹配片段: {{ matchedSubs.length }} 个</span>
            <span>预估总时长: {{ store.formatTime(totalMatchDuration) }}</span>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-else class="wf-empty">
          <el-icon :size="32"><Document /></el-icon>
          <span>输入文案方向后点击「生成」</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useCreatorModeStore } from '@/stores/creatorMode'
import { exportJianyingProject, buildProject } from '@/services/jianying'

const store = useCreatorModeStore()

const userTopic = ref('')
const modelChoice = ref<'deepseek' | 'doubao'>('deepseek')
const isGenerating = ref(false)
const statusText = ref('')
const generatedScript = ref('')
const matchedSubs = ref<SubtitleEntry[]>([])

// 挂载时自动扫描存储目录，获取可用字幕条数
onMounted(() => {
  store.scanSubtitleCacheCount()
})

const totalMatchDuration = computed(() =>
  matchedSubs.value.reduce((sum, s) => sum + (s.endTime - s.startTime), 0) / 1000
)

const DEEPSEEK_API_KEY = 'sk-6b9e34d999f54f64878d97deef7ac9ad'
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions'

/** 字幕结构化数据，用于 AI 输入和片段匹配 */
interface SubtitleEntry {
  videoId: string
  videoName: string
  videoPath: string
  startTime: number   // ms
  endTime: number     // ms
  text: string
  formatted: string   // "[videoName timestamp] text"
}

/**
 * 核心：根据字幕内容 + 用户方向 调用 DeepSeek 生成文案
 */
async function handleGenerate() {
  if (!userTopic.value.trim()) return

  const allSubs: SubtitleEntry[] = []
  for (const video of store.importedVideos) {
    for (const sub of video.subtitles) {
      const formatted = `[${video.name} ${store.formatTimeMs(sub.startTime)}] ${sub.text}`
      allSubs.push({
        videoId: video.id,
        videoName: video.name,
        videoPath: video.path,
        startTime: sub.startTime,
        endTime: sub.endTime,
        text: sub.text,
        formatted
      })
    }
  }

  if (allSubs.length === 0) {
    ElMessage.warning('没有可用的字幕条，请先在「工作状态」中对视频执行 ASR 转字幕')
    return
  }

  isGenerating.value = true
  statusText.value = '正在读取工作状态数据...'

  try {
    statusText.value = '正在调用 DeepSeek 生成文案...'
    // AI 侧仍传纯文本
    const script = await callDeepSeek(userTopic.value, allSubs.map(s => s.formatted))
    generatedScript.value = script

    statusText.value = '正在匹配视频片段...'
    matchedSubs.value = matchScriptToSubs(script, allSubs)

    ElMessage.success(`已生成文案，匹配 ${matchedSubs.value.length} 个片段`)
  } catch (e: any) {
    ElMessage.error('生成失败: ' + (e.message || '未知错误'))
  }

  isGenerating.value = false
}

/** 调用 DeepSeek API */
async function callDeepSeek(topic: string, subtitles: string[]): Promise<string> {
  const subsText = subtitles.join('\n')
  const systemPrompt = `你是一个专业的视频文案编排助手。你需要根据以下视频字幕内容，为用户生成视频文案脚本。

【核心约束】
1. 你只能使用下方「可用字幕」中实际存在的语句，不可自己编造任何台词
2. 你只能从可用字幕中选择、排列、组合，形成连贯的文案
3. 生成的文案每句话必须能在下方字幕中找到对应原文
4. 如果方向词中提到的话题在字幕中没有对应内容，请如实告知用户

【输出格式】
## 文案脚本
（按顺序列出文案，每行一个段落，标注对应来源时间）

## 编排说明
简要说明选择这些片段的理由`

  const userMsg = `【可用字幕】\n${subsText}\n\n【用户方向】\n${topic}\n\n请根据以上字幕内容，为用户生成视频文案脚本。`

  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMsg }
      ],
      temperature: 0.7,
      max_tokens: 4096
    })
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`DeepSeek API 错误 (${response.status}): ${err}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content || '未能生成文案，请重试'
}

/** 将生成的文案匹配到实际字幕，按脚本出现顺序排列（不创建片段，不碰轨道） */
function matchScriptToSubs(script: string, subs: SubtitleEntry[]): SubtitleEntry[] {
  const matched: SubtitleEntry[] = []

  for (const sub of subs) {
    const text = sub.text
    let found = false
    const minLen = Math.max(4, Math.floor(text.length * 0.3))
    for (let len = text.length; len >= minLen; len--) {
      if (script.includes(text.substring(0, len))) {
        found = true
        break
      }
    }
    if (found) matched.push(sub)
  }

  // 按脚本中的出现顺序排列
  matched.sort((a, b) => {
    const aIdx = script.indexOf(a.text.substring(0, Math.max(4, Math.floor(a.text.length * 0.3))))
    const bIdx = script.indexOf(b.text.substring(0, Math.max(4, Math.floor(b.text.length * 0.3))))
    return aIdx - bIdx
  })

  return matched
}

/** 直接根据匹配的字幕数据导出剪映草稿，不经过总轨道 */
async function handleApply() {
  if (matchedSubs.value.length === 0) {
    ElMessage.warning('没有匹配的片段')
    return
  }

  // 输入项目名称
  let projectName = ''
  try {
    const { value } = await ElMessageBox.prompt('请输入剪映工程名称', '导出剪映工程', {
      confirmButtonText: '导出',
      inputValue: `剪映工程_${new Date().toLocaleDateString()}`,
      inputPlaceholder: '工程名称'
    })
    projectName = value || ''
  } catch {
    return
  }

  // 用第一个匹配字幕的视频分辨率作为画布尺寸
  const firstSub = matchedSubs.value[0]
  const firstVideo = store.importedVideos.find(v => v.id === firstSub.videoId)
  const canvasW = firstVideo?.width || 1080
  const canvasH = firstVideo?.height || 1920

  // 按视频分组，构建导出用的片段列表（视频文件 + 起止时间）
  const clipItems = matchedSubs.value.map(s => ({
    sourceFile: s.videoPath,
    sourceFileName: s.videoName,
    startMs: s.startTime,
    endMs: s.endTime
  }))

  // 每条字幕导出为独立的文本片段
  const subtitleItems = matchedSubs.value.map((s, i) => ({
    text: s.text,
    startMs: 0,   // 每个片段内部从 0 开始
    endMs: s.endTime - s.startTime
  }))

  try {
    const project = buildProject(clipItems, subtitleItems, projectName, canvasW, canvasH)
    const result = await exportJianyingProject(project, store.jianyingDraftPath, (msg) => {
      statusText.value = msg
    })

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
  return text
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^【(.+?)】/gm, '<div class="script-section">$1</div>')
}
</script>

<style scoped>
.workflow-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px;
  gap: 12px;
  overflow-y: auto;
  background: #f5f6fa;
}

.wf-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: #ecf5ff;
  border-radius: 8px;
  font-size: 13px;
  color: #409eff;
}

/* 左右两栏 */
.wf-left {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex-shrink: 0;
}

.wf-right {
  flex: 1;
  min-height: 200px;
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
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.data-status {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: #606266;
}

/* 加载态 */
.wf-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px;
  color: #909399;
  font-size: 14px;
}

/* 生成结果 */
.generated-script {
  font-size: 13px;
  line-height: 1.8;
  color: #303133;
  max-height: 400px;
  overflow-y: auto;
}

.script-text :deep(.script-section) {
  font-size: 14px;
  font-weight: 600;
  color: #409eff;
  margin: 10px 0 4px;
  padding: 4px 0;
  border-bottom: 1px dashed #e4e7ed;
}

.match-info {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid #f0f2f5;
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: #909399;
}

/* 空状态 */
.wf-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px;
  color: #c0c4cc;
}
</style>
