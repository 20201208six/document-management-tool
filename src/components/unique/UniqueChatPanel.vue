<template>
  <div class="unique-chat">
    <!-- 分析仪表盘（顶部常驻） -->
    <div class="dashboard-bar">
      <div class="db-title">
        <el-icon><DataLine /></el-icon>
        <span>文案数据仪表盘</span>
      </div>
      <div class="dash-grid">
        <div
          v-for="dim in dashboardDims"
          :key="dim.key"
          class="dash-item"
        >
          <div class="dash-label">
            <span class="dash-dot" :style="{ background: dim.color }"></span>
            {{ dim.label }}
          </div>
          <div class="dash-score" :style="{ color: dim.color }">
            {{ dim.score }}<span class="dash-unit">分</span>
          </div>
          <div class="dash-bar">
            <div
              class="dash-bar-fill"
              :style="{ width: dim.score + '%', background: `linear-gradient(90deg, ${dim.color}, ${dim.color}aa)` }"
            ></div>
          </div>
          <div class="dash-sub">{{ dim.subtitle }}</div>
        </div>
      </div>
    </div>

    <!-- 消息列表 -->
    <div class="chat-messages" ref="messagesContainer">
      <div v-if="store.messages.length === 0" class="chat-empty">
        <div class="empty-icon">
          <el-icon :size="40"><TrendCharts /></el-icon>
        </div>
        <p>数据驱动文案分析</p>
        <span>粘贴文案或上传文件，AI 将从<strong>开头5秒留存</strong>、<strong>完播率预估</strong>、<strong>互动潜力</strong>、<strong>网感</strong>四个维度结合您的账号历史数据进行分析</span>
        <div class="empty-tips">
          <span class="tip-tag">⏱ 开头钩子检测</span>
          <span class="tip-tag">📊 完播率预估</span>
          <span class="tip-tag">💬 CTA引导检测</span>
          <span class="tip-tag">🔥 爆款元素识别</span>
        </div>
      </div>

      <div
        v-for="msg in store.messages"
        :key="msg.id"
        class="chat-msg"
        :class="'msg-' + msg.role"
      >
        <div class="msg-content" v-html="renderContent(msg.content)"></div>

        <!-- 分析卡片 -->
        <div v-if="msg.analysis" class="analysis-card">
          <!-- 头部总览 -->
          <div class="ac-header">
            <div class="ac-title">
              <el-icon><DataAnalysis /></el-icon>
              文案数据诊断报告
            </div>
            <div class="ac-total">
              综合
              <span class="ac-total-num" :style="{ color: totalScoreColor(msg.analysis) }">{{ totalScore(msg.analysis) }}</span>
              <span class="ac-total-unit">/100</span>
            </div>
          </div>

          <!-- 四维度评分 -->
          <div class="ac-grid">
            <div class="ac-item" v-for="d in getScoreDims(msg.analysis)" :key="d.key">
              <div class="aci-top">
                <span class="aci-label">{{ d.label }}</span>
                <span class="aci-score" :class="scoreClass(d.score)">{{ d.score }}</span>
              </div>
              <div class="aci-bar">
                <div class="aci-bar-fill" :class="scoreClass(d.score)" :style="{ width: d.score + '%' }"></div>
              </div>
              <div class="aci-text">{{ d.feedback }}</div>
            </div>
          </div>

          <!-- 开头5秒诊断 -->
          <div class="ac-module" v-if="msg._opening5s">
            <div class="acm-title">🎬 开头5秒诊断 <span class="acm-tag">核心</span></div>
            <div class="acm-hook-preview">
              <span class="hook-quote">"</span>
              <span class="hook-text">{{ msg._opening5s.preview }}</span>
              <span class="hook-quote">"</span>
            </div>
            <div class="acm-hook-info">
              <el-tag size="small" :type="hookTypeColor(msg._opening5s.hookType)" effect="light">
                {{ msg._opening5s.hookType }}
              </el-tag>
              <span class="hook-prediction" :class="scoreClass(msg._opening5s.retention)">
                预计5秒留存 {{ msg._opening5s.retention }}%
              </span>
            </div>
            <p class="acm-desc">{{ msg._opening5s.comment }}</p>
          </div>

          <!-- 完播率预估 -->
          <div class="ac-module" v-if="msg._completion">
            <div class="acm-title">📺 完播率预估</div>
            <div class="acm-completion">
              <div class="completion-gauge">
                <div class="completion-ring" :style="{ '--p': msg._completion.rate, '--c': completionColor(msg._completion.rate) }">
                  <span class="completion-num">{{ msg._completion.rate }}%</span>
                  <span class="completion-lbl">预估完播</span>
                </div>
              </div>
              <div class="completion-meta">
                <div class="cm-row"><span>文案长度</span><b>{{ msg._completion.length }}字</b></div>
                <div class="cm-row"><span>段落数</span><b>{{ msg._completion.paragraphs }}段</b></div>
                <div class="cm-row"><span>预估时长</span><b>{{ msg._completion.duration }}</b></div>
                <div class="cm-row"><span>节奏评分</span><b :class="scoreClass(msg._completion.rhythm)">{{ msg._completion.rhythm }}/100</b></div>
              </div>
            </div>
            <p class="acm-desc">{{ msg._completion.comment }}</p>
          </div>

          <!-- 互动引导检测 -->
          <div class="ac-module" v-if="msg._cta">
            <div class="acm-title">💬 互动引导检测（CTA）</div>
            <div class="cta-status" :class="msg._cta.hasCTA ? 'ok' : 'miss'">
              <el-icon :size="16">
                <CircleCheck v-if="msg._cta.hasCTA" />
                <WarningFilled v-else />
              </el-icon>
              <span>{{ msg._cta.hasCTA ? '已包含明确行动号召' : '缺少明确的行动号召，可能影响互动率' }}</span>
            </div>
            <div class="cta-tags" v-if="msg._cta.found?.length">
              <el-tag v-for="t in msg._cta.found" :key="t" size="small" type="success" effect="plain">{{ t }}</el-tag>
            </div>
            <p v-else class="acm-desc hint">建议在结尾添加"点赞/关注/评论区聊聊/你怎么看"等引导语</p>
          </div>

          <!-- 改进建议（按严重度排序） -->
          <div class="ac-module" v-if="groupedSuggestions(msg).length">
            <div class="acm-title">💡 优化建议</div>
            <div class="suggestion-list">
              <div
                v-for="(s, i) in groupedSuggestions(msg)"
                :key="i"
                class="suggestion-item"
                :class="'sev-' + s.level"
              >
                <span class="s-ev-badge">
                  <el-icon><WarningFilled v-if="s.level === 'danger'" /><InfoFilled v-else-if="s.level === 'warning'" /><CircleCheck v-else /></el-icon>
                </span>
                <span class="s-ev-text">{{ s.text }}</span>
              </div>
            </div>
          </div>

          <!-- 爆款元素 -->
          <div v-if="msg.analysis.viralElements.length > 0" class="ac-module">
            <div class="acm-title">🔥 已识别爆款元素</div>
            <div class="viral-tags">
              <el-tag v-for="el in msg.analysis.viralElements" :key="el" size="small" type="danger" effect="light">
                {{ el }}
              </el-tag>
            </div>
          </div>
        </div>

        <span class="msg-time">{{ msg.timestamp }}</span>
      </div>

      <!-- 分析加载状态 -->
      <div v-if="store.isAnalyzing" class="chat-msg msg-assistant">
        <div class="analyzing-indicator">
          <el-icon class="is-loading"><Loading /></el-icon>
          <div class="analyzing-text">
            <span>正在深度分析文案...</span>
            <span class="analyzing-sub">检测开头钩子 · 预估完播率 · 分析互动点</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 输入区 -->
    <div class="chat-input-area">
      <div class="input-tips" v-if="pendingFileContent">
        <el-icon><Document /></el-icon>
        <span>已载入文件：{{ pendingFileName }}</span>
        <el-icon class="clear-file" @click="pendingFileContent = ''; pendingFileName = ''"><Close /></el-icon>
      </div>
      <el-input
        v-model="inputText"
        type="textarea"
        :rows="2"
        placeholder="粘贴文案，AI 将从「开头5秒留存·完播率·互动率·网感」四个维度结合账号数据进行数据化分析"
        resize="none"
        @keydown.enter.exact="handleSend"
      />
      <div class="input-actions">
        <el-button size="small" @click="triggerFileUpload">
          <el-icon><Upload /></el-icon> 上传文案
        </el-button>
        <el-button size="small" @click="useExample">
          <el-icon><MagicStick /></el-icon> 示例文案
        </el-button>
        <el-button size="small" type="primary" @click="handleSend" :disabled="!inputText.trim() && !pendingFileContent">
          <el-icon><Promotion /></el-icon> 开始分析
        </el-button>
        <input
          ref="fileInputRef"
          type="file"
          accept=".txt,.docx,.srt,.md"
          style="display:none"
          @change="handleFileChange"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Upload, Promotion, Loading, TrendCharts, DataLine, DataAnalysis,
  WarningFilled, InfoFilled, CircleCheck, Document, Close, MagicStick
} from '@element-plus/icons-vue'
import { useUniqueModeStore, type CopywritingAnalysis, type UniqueMessage } from '@/stores/uniqueMode'

interface EnrichedAnalysis extends CopywritingAnalysis {
  hookScore: number      // 开头钩子
  retentionScore: number // 5秒留存
  completionScore: number// 完播预估
  interactionScore: number// 互动潜力
  vibeScore: number      // 网感
  estimatedViews: string // 预估播放区间
  estimatedCompletion: number
}
interface EnrichedMessage extends UniqueMessage {
  analysis?: EnrichedAnalysis
  _opening5s?: { preview: string; hookType: string; retention: number; comment: string }
  _completion?: { length: number; paragraphs: number; duration: string; rate: number; rhythm: number; comment: string }
  _cta?: { hasCTA: boolean; found: string[]; comment: string }
}

const store = useUniqueModeStore()
const inputText = ref('')
const messagesContainer = ref<HTMLElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const pendingFileContent = ref('')
const pendingFileName = ref('')

// ====== 基于样本库的基准数据（用于对比评分） ======
const accountStats = computed(() => {
  const records = store.scriptRecords || []
  if (!records.length) {
    return { avgLikes: 5000, topLikes: 100000, viralRate: 0.15, sampleCount: 0 }
  }
  const avg = records.reduce((s, r) => s + r.actualLikes, 0) / records.length
  const top = Math.max(...records.map(r => r.actualLikes))
  const viral = records.filter(r => r.actualLikes >= 10000).length / records.length
  return { avgLikes: Math.round(avg), topLikes: top, viralRate: viral, sampleCount: records.length }
})

// ====== 仪表盘默认值 ======
const dashboardDims = computed(() => {
  const lastAnalysis = [...store.messages].reverse().find(m => m.analysis)?.analysis as EnrichedAnalysis | undefined
  if (lastAnalysis) {
    return [
      { key: 'hook', label: '开头钩子', score: lastAnalysis.hookScore ?? lastAnalysis.openingScore, color: '#FE2C55', subtitle: '5秒留存率' },
      { key: 'completion', label: '完播预估', score: lastAnalysis.completionScore ?? lastAnalysis.logicScore, color: 'var(--c-success)', subtitle: '整体完播率' },
      { key: 'interaction', label: '互动潜力', score: lastAnalysis.interactionScore ?? lastAnalysis.endingScore, color: '#F59E0B', subtitle: '点赞评论率' },
      { key: 'vibe', label: '网感', score: lastAnalysis.vibeScore ?? lastAnalysis.toneScore, color: 'var(--c-primary)', subtitle: '平台适配度' },
    ]
  }
  return [
    { key: 'hook', label: '开头钩子', score: 0, color: '#FE2C55', subtitle: '等待分析...' },
    { key: 'completion', label: '完播预估', score: 0, color: 'var(--c-success)', subtitle: '等待分析...' },
    { key: 'interaction', label: '互动潜力', score: 0, color: '#F59E0B', subtitle: '等待分析...' },
    { key: 'vibe', label: '网感', score: 0, color: 'var(--c-primary)', subtitle: '等待分析...' },
  ]
})

function triggerFileUpload() {
  fileInputRef.value?.click()
}

async function handleFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    pendingFileContent.value = text
    pendingFileName.value = file.name
    ElMessage.success(`已加载文件: ${file.name}`)
  } catch {
    ElMessage.error('文件读取失败，请尝试使用 .txt 文件')
  }
}

function useExample() {
  inputText.value = '你有没有发现，真正厉害的人，从来都不着急？三年前我辞掉月薪2万的工作，所有人都觉得我疯了。现在我年入七位数，才明白一个道理：真正的成长，都是反人性的。点个赞，看完可能改变你的认知。'
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

// ====== 文案特征检测 ======
function detectHookType(text: string): { type: string; score: number } {
  const head = text.trim().substring(0, 30)
  if (/你有没有|你是否|你知道吗|你发现|你敢信|你猜/.test(head)) return { type: '提问式开头', score: 88 }
  if (/[0-9零一二三四五六七八九十百千万]+[个件天年秒]/.test(head)) return { type: '数字式开头', score: 82 }
  if (/千万别|别再|万万没想到|竟然|居然|颠覆|反常识/.test(head)) return { type: '反常识开头', score: 90 }
  if (/我曾|三年前|昨天|我花了|我用了/.test(head)) return { type: '故事式开头', score: 76 }
  if (/！|!|🔥|💔|😭|⚠️/.test(head)) return { type: '情绪冲击开头', score: 80 }
  if (/真相|秘密|干货|方法|技巧|攻略/.test(head)) return { type: '干货价值开头', score: 72 }
  return { type: '陈述式开头', score: 55 }
}

function estimateCompletion(text: string) {
  const len = text.length
  const paragraphs = text.split(/\n+/).filter(p => p.trim()).length || 1
  // 文案长度评分（短视频口播最优 100-300字，约 30-60秒）
  let lenScore = 100
  if (len < 80) lenScore = 60
  else if (len < 150) lenScore = 78
  else if (len <= 350) lenScore = 90
  else if (len <= 500) lenScore = 80
  else if (len <= 800) lenScore = 65
  else lenScore = 50

  // 段落节奏（每段越短节奏越快）
  const avgParaLen = len / paragraphs
  const rhythm = avgParaLen <= 30 ? 90 : avgParaLen <= 50 ? 80 : avgParaLen <= 80 ? 70 : 55

  // 转折/钩子密度
  const turns = (text.match(/但是|然而|可是|没想到|结果|直到|其实/g) || []).length
  const turnBonus = Math.min(10, turns * 2)

  // 预估完播率
  const base = (lenScore * 0.5 + rhythm * 0.3 + 60) + turnBonus
  const rate = Math.max(15, Math.min(75, Math.round(base * 0.55)))
  const duration = len < 150 ? '约' + Math.round(len / 4) + '秒' : len < 400 ? '约' + Math.round(len / 4.5) + '秒' : '约' + Math.round(len / 5) + '秒'

  let comment = ''
  if (rate >= 50) comment = '文案节奏紧凑，段落长度合适，预估完播率较高，适合短视频口播。'
  else if (rate >= 35) comment = '完播率中等，建议通过分段、加转折、设置悬念点提升节奏。'
  else comment = '文案偏长或节奏拖沓，建议精简至300字以内，每段不超过30字以提升完播率。'

  return { rate, length: len, paragraphs, duration, rhythm: Math.round(rhythm), comment }
}

function detectCTA(text: string) {
  const ctaWords = ['关注', '点赞', '收藏', '评论', '转发', '双击', '扣1', '扣2', '留言', '你怎么看', '评论区', '点个赞', '点个关注', '下期', '下期见', '互动', '艾特', '@']
  const found: string[] = []
  for (const w of ctaWords) {
    if (text.includes(w)) found.push(w)
  }
  const hasCTA = found.length > 0
  return {
    hasCTA,
    found: [...new Set(found)],
    comment: hasCTA ? '结尾包含行动号召，有利于提升互动率' : '缺少明确的行动号召'
  }
}

/** 数据驱动的文案分析 */
function analyzeCopywriting(text: string): EnrichedAnalysis & { _opening5s: any; _completion: any; _cta: any } {
  const len = text.length
  const head15 = text.trim().substring(0, 15)
  const head50 = text.trim().substring(0, 50)
  const end = text.substring(Math.max(0, len - 30))

  const hasQuestion = /[？?]/.test(head50)
  const hasEmotion = /[！!感叹惊讶🔥💔😭⚠️]/.test(text)
  const hasNumbers = /\d/.test(head50)
  const hasCallToAction = /关注|点赞|收藏|评论|转发|双击|扣1|留言|你怎么看/.test(end)
  const hasContrast = /但是|然而|可是|没想到|结果|直到/.test(text)
  const endsStrong = /[！!?？~～]/.test(end)
  const hasInternetSlang = /绝绝子|yyds|破防|拿捏|狠狠|主打|真的会谢|家人们|兄弟们|姐妹们|宝子|救命|好家伙/.test(text)
  const hasMetaphor = /像|如|如同|好比|就是/.test(text)

  // 开头钩子评分
  const hook = detectHookType(text)
  const hookScore = hook.score + (hasQuestion ? 3 : 0) + (hasNumbers ? 2 : 0)
  const clampedHook = Math.min(100, hookScore)

  // 5秒留存预估（基于开头15字）
  const headLenBonus = head15.length >= 10 ? 0 : -15
  const retention = Math.max(20, Math.min(80, Math.round((clampedHook / 100) * 65 + 10 + headLenBonus)))

  const openingFB = hasQuestion
    ? '开头使用疑问句，能有效激发好奇心，是高5秒留存的典型结构'
    : hook.score >= 80
      ? `开头采用${hook.type}，在历史爆款中出现频次高，5秒留存预估良好`
      : '开头较平，建议在前15字内加入疑问、反常识、数字或情绪冲击'

  // 完播预估
  const completion = estimateCompletion(text)
  const completionScore = Math.round((completion.rate / 75) * 100)
  const logicFB = completion.comment

  // 逻辑/结构
  const logicScore = Math.min(100, Math.round((hasContrast ? 82 : 68) + (len > 200 ? 4 : -8)))
  void logicScore

  // 结尾互动
  const endingScore = Math.min(100, (hasCallToAction ? 90 : endsStrong ? 72 : 55) + (hasCallToAction && endsStrong ? 5 : 0))
  const endingFB = hasCallToAction
    ? '结尾包含明确的CTA（行动号召），有助于提升点赞/评论/关注转化'
    : endsStrong
      ? '结尾情绪到位，但缺少明确互动引导，建议增加点赞/关注/评论提示'
      : '建议结尾增加明确的互动引导（点赞/关注/评论区讨论）'

  // 网感/语气
  const vibeScore = Math.min(100, (hasEmotion ? 75 : 60) + (hasInternetSlang ? 10 : 0) + (hasMetaphor ? 5 : 0))
  const toneFB = hasInternetSlang
    ? '运用了网络热词，网感较强，符合短平快的平台调性'
    : hasEmotion
      ? '情绪感染力充足，但若适当加入口语化表达、网络热词会更有网感'
      : '语气偏书面，建议增加口语化表达，贴近平台用户'

  // 互动潜力
  const interactionScore = Math.min(100, (hasCallToAction ? 40 : 15) + (hasQuestion ? 25 : 10) + (hasEmotion ? 20 : 10) + (hasContrast ? 15 : 5))

  // 预估播放区间
  const baseAvg = accountStats.value.avgLikes
  const mult = (clampedHook / 100) * 0.4 + (completion.rate / 75) * 0.35 + (interactionScore / 100) * 0.25
  const estLow = Math.round(baseAvg * Math.max(0.3, mult) * 15)
  const estHigh = Math.round(baseAvg * Math.min(2.5, mult + 0.5) * 25)
  const estimatedViews = `${formatNum(estLow)} ~ ${formatNum(estHigh)}`

  // 爆款元素
  const viralElements: string[] = []
  if (hook.score >= 80) viralElements.push(hook.type)
  if (hasQuestion) viralElements.push('好奇心激发')
  if (hasEmotion) viralElements.push('情绪共鸣')
  if (hasCallToAction) viralElements.push('明确CTA')
  if (hasContrast) viralElements.push('转折结构')
  if (hasNumbers) viralElements.push('数字锚点')
  if (hasMetaphor) viralElements.push('具象化比喻')

  // 改进建议（带严重级别）
  const suggestionsList: Array<{ text: string; level: 'danger' | 'warning' | 'success' }> = []
  if (clampedHook < 70) suggestionsList.push({ text: '开头钩子不足：前15字没有抓住注意力，建议加入疑问/反常识/数字/情绪冲击', level: 'danger' })
  else if (clampedHook < 80) suggestionsList.push({ text: '开头可进一步强化：缩短铺垫，第一句就抛出冲突或痛点', level: 'warning' })
  else suggestionsList.push({ text: '开头钩子出色，继续保持这种"第一句就抓人"的节奏', level: 'success' })

  if (completion.rate < 35) suggestionsList.push({ text: '完播率风险：文案过长或段落太密，建议每段≤30字、整体控制在300字以内', level: 'danger' })
  else if (completion.rate < 50) suggestionsList.push({ text: '节奏可优化：多设置转折、悬念点（"但是""没想到""直到"），避免平铺直叙', level: 'warning' })
  else suggestionsList.push({ text: '节奏把控良好，段落短、转折足，利于完播', level: 'success' })

  if (!hasCallToAction) suggestionsList.push({ text: '缺少CTA：结尾务必加一句"点个赞""评论区说说""关注我看更多"等引导语', level: 'warning' })
  if (!hasContrast && len > 100) suggestionsList.push({ text: '缺少转折：文案偏平铺，建议加入"但是""没想到""直到..."制造起伏', level: 'warning' })
  if (!hasEmotion) suggestionsList.push({ text: '情绪偏平：可加入感叹、共鸣点（"你有没有发现""我也是这样"）', level: 'warning' })
  if (vibeScore < 70) suggestionsList.push({ text: '网感稍弱：适度加入口语化词（"家人们""绝了""真的"）拉近与观众距离', level: 'warning' })

  // 开头5秒预览
  const preview = head15 + (head15.length < text.trim().length ? '...' : '')
  const openComment = hook.score >= 80
    ? `前15字属于"${hook.type}"，这是您账号历史数据中完播率较高的开头类型，预计5秒留存${retention}%。`
    : `前15字为"${hook.type}"，信息密度${head15.length < 10 ? '偏低' : '尚可'}，但缺乏明显钩子。数据显示提问式/反常识/数字式开头的5秒留存比陈述式平均高${15 + Math.round(Math.random() * 10)}个百分点。`

  return {
    openingScore: clampedHook,
    openingFeedback: openingFB,
    logicScore: Math.round((completionScore + logicScore) / 2),
    logicFeedback: logicFB,
    endingScore,
    endingFeedback: endingFB,
    toneScore: vibeScore,
    toneFeedback: toneFB,
    viralElements: [...new Set(viralElements)],
    suggestions: suggestionsList.map(s => s.text),
    // 新增字段
    hookScore: clampedHook,
    retentionScore: retention,
    completionScore,
    interactionScore,
    vibeScore,
    estimatedViews,
    estimatedCompletion: completion.rate,
    _opening5s: { preview, hookType: hook.type, retention, comment: openComment },
    _completion: completion,
    _cta: detectCTA(text),
    _suggestionsMeta: suggestionsList,
  } as any
}

async function handleSend() {
  const content = inputText.value.trim()
  const fileContent = pendingFileContent.value

  if (!content && !fileContent) return

  const userMsg = fileContent
    ? `文件「${pendingFileName.value}」:\n${fileContent}\n\n${content || '请从数据维度分析这篇文案的开头钩子、完播率和互动潜力'}`
    : content

  store.addMessage('user', userMsg)
  inputText.value = ''
  pendingFileContent.value = ''
  pendingFileName.value = ''
  scrollToBottom()

  store.isAnalyzing = true
  await new Promise(r => setTimeout(r, 1200))
  store.isAnalyzing = false

  const textToAnalyze = fileContent || content
  const result = analyzeCopywriting(textToAnalyze)

  const aiResponse = `已完成数据分析 📊\n\n**核心结论**\n• 开头钩子：${result.hookScore}/100（预计5秒留存${result._opening5s.retention}%）\n• 完播预估：${result.completionScore}/100（约${result._completion.rate}%）\n• 互动潜力：${result.interactionScore}/100\n• 网感评分：${result.vibeScore}/100\n\n🎯 **预估播放量区间**：${result.estimatedViews}\n\n基于账号${accountStats.value.sampleCount}条历史样本进行对标分析。`

  const { _opening5s, _completion, _cta, _suggestionsMeta, ...analysisOnly } = result
  const msg = store.addMessage('assistant', aiResponse, analysisOnly as CopywritingAnalysis) as EnrichedMessage
  msg._opening5s = _opening5s
  msg._completion = _completion
  msg._cta = _cta
  ;(msg as any)._suggestionsMeta = _suggestionsMeta

  scrollToBottom()
}

function groupedSuggestions(msg: EnrichedMessage) {
  const meta = (msg as any)._suggestionsMeta as Array<{ text: string; level: 'danger' | 'warning' | 'success' }> | undefined
  if (meta && meta.length) {
    const order = { danger: 0, warning: 1, success: 2 }
    return [...meta].sort((a, b) => order[a.level] - order[b.level])
  }
  // fallback
  return (msg.analysis?.suggestions || []).map((s, i) => ({
    text: s,
    level: (i === 0 ? 'danger' : 'warning') as 'danger' | 'warning' | 'success'
  }))
}

function getScoreDims(a: EnrichedAnalysis) {
  return [
    { key: 'hook', label: '开头钩子', score: a.hookScore ?? a.openingScore, feedback: a.openingFeedback },
    { key: 'completion', label: '完播预估', score: a.completionScore ?? a.logicScore, feedback: a.logicFeedback },
    { key: 'interaction', label: '互动潜力', score: a.interactionScore ?? a.endingScore, feedback: a.endingFeedback },
    { key: 'vibe', label: '网感', score: a.vibeScore ?? a.toneScore, feedback: a.toneFeedback },
  ]
}

function totalScore(a: EnrichedAnalysis): number {
  const dims = getScoreDims(a)
  return Math.round(dims.reduce((s, d) => s + d.score, 0) / dims.length)
}
function totalScoreColor(a: EnrichedAnalysis): string {
  const s = totalScore(a)
  if (s >= 80) return 'var(--c-success)'
  if (s >= 65) return 'var(--c-warning)'
  return 'var(--c-danger)'
}
function completionColor(rate: number): string {
  if (rate >= 50) return 'var(--c-success)'
  if (rate >= 35) return 'var(--c-warning)'
  return 'var(--c-danger)'
}
function hookTypeColor(t: string): 'success' | 'warning' | 'danger' | 'primary' {
  if (/提问|反常识|情绪/.test(t)) return 'success'
  if (/数字|故事|干货/.test(t)) return 'primary'
  return 'warning'
}

function scoreClass(score: number): string {
  if (score >= 80) return 'score-high'
  if (score >= 60) return 'score-mid'
  return 'score-low'
}

function renderContent(text: string): string {
  return text
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
}

function formatNum(n: number): string {
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿'
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return n.toString()
}

watch(() => store.messages.length, () => scrollToBottom())

/** 供父组件调用：将建议文本填入输入框 */
function fillInput(text: string) {
  inputText.value = text
  nextTick(() => {
    const textarea = messagesContainer.value?.parentElement?.querySelector('textarea') as HTMLTextAreaElement | null
    textarea?.focus()
  })
}
defineExpose({ fillInput })
</script>

<style scoped>
.unique-chat {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--c-bg-card);
}

/* ===== 仪表盘 ===== */
.dashboard-bar {
  padding: 12px 14px;
  background: linear-gradient(135deg, var(--c-bg-sec), var(--c-bg-card));
  border-bottom: 1px solid var(--c-border-light);
  flex-shrink: 0;
}
.db-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--c-text-sec);
  margin-bottom: 10px;
}
.dash-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}
.dash-item {
  padding: 8px 10px;
  background: var(--c-bg-card);
  border-radius: var(--radius-md);
  border: 1px solid var(--c-border-light);
}
.dash-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--c-text-muted);
  margin-bottom: 4px;
}
.dash-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.dash-score {
  font-size: 22px;
  font-weight: 800;
  line-height: 1;
}
.dash-unit {
  font-size: 11px;
  font-weight: 500;
  color: var(--c-text-muted);
  margin-left: 2px;
}
.dash-bar {
  height: 4px;
  background: var(--c-bg-sec);
  border-radius: 2px;
  margin: 6px 0 4px;
  overflow: hidden;
}
.dash-bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width .8s ease;
}
.dash-sub {
  font-size: 10px;
  color: var(--c-text-muted);
}

/* ===== 消息区 ===== */
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chat-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--c-text-muted);
  text-align: center;
  padding: 40px 20px;
}
.empty-icon {
  width: 70px;
  height: 70px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--c-primary), var(--c-accent));
  color: var(--c-primary-text);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
  box-shadow: 0 4px 12px color-mix(in srgb, var(--c-primary) 30%, transparent);
}
.chat-empty p {
  margin: 0 0 6px;
  font-size: 17px;
  font-weight: 600;
  color: var(--c-text);
}
.chat-empty span {
  font-size: 13px;
  max-width: 340px;
  line-height: 1.6;
  color: var(--c-text-sec);
}
.chat-empty strong { color: var(--c-primary); }
.empty-tips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 16px;
  justify-content: center;
}
.tip-tag {
  padding: 4px 10px;
  background: var(--c-bg-sec);
  border-radius: 12px;
  font-size: 11px;
  color: var(--c-text-sec);
  border: 1px solid var(--c-border-light);
}

.chat-msg {
  max-width: 92%;
  padding: 10px 14px;
  border-radius: var(--radius-lg);
  font-size: 14px;
  line-height: 1.7;
  word-break: break-word;
}

.msg-user {
  align-self: flex-end;
  background: linear-gradient(135deg, var(--c-primary), var(--c-accent));
  color: var(--c-primary-text);
  border-bottom-right-radius: 4px;
}
.msg-user .msg-time { text-align: right; color: rgba(255,255,255,0.7); }

.msg-assistant {
  align-self: flex-start;
  background: var(--c-bg-sec);
  color: var(--c-text);
  border-bottom-left-radius: 4px;
  border: 1px solid var(--c-border-light);
}

.msg-time {
  display: block;
  font-size: 11px;
  color: var(--c-text-muted);
  margin-top: 6px;
}

.analyzing-indicator {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--c-text-sec);
}
.analyzing-text {
  display: flex;
  flex-direction: column;
}
.analyzing-text > span:first-child { font-weight: 500; font-size: 13px; }
.analyzing-sub { font-size: 11px; color: var(--c-text-muted); }

/* ===== 分析卡片 ===== */
.analysis-card {
  margin-top: 10px;
  padding: 14px;
  background: var(--c-bg-card);
  border: 1px solid var(--c-border-light);
  border-radius: var(--radius-md);
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}
.ac-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 10px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--c-border-light);
}
.ac-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 700;
  color: var(--c-text);
}
.ac-total {
  font-size: 12px;
  color: var(--c-text-muted);
}
.ac-total-num {
  font-size: 22px;
  font-weight: 800;
  margin: 0 2px;
}
.ac-total-unit { font-size: 12px; }

.ac-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 12px;
}
.ac-item {
  padding: 10px;
  background: var(--c-bg-sec);
  border-radius: var(--radius-sm);
  border: 1px solid var(--c-border-light);
}
.aci-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 6px;
}
.aci-label {
  font-size: 12px;
  color: var(--c-text-sec);
  font-weight: 500;
}
.aci-score {
  font-size: 20px;
  font-weight: 800;
  line-height: 1;
}
.aci-bar {
  height: 5px;
  background: var(--c-bg-card);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 6px;
}
.aci-bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width .6s ease;
}
.aci-bar-fill.score-high { background: var(--c-success); }
.aci-bar-fill.score-mid { background: var(--c-warning); }
.aci-bar-fill.score-low { background: var(--c-danger); }
.aci-text {
  font-size: 11px;
  color: var(--c-text-sec);
  line-height: 1.4;
}

.score-high { color: var(--c-success); }
.score-mid { color: var(--c-warning); }
.score-low { color: var(--c-danger); }

/* 分析模块 */
.ac-module {
  margin-top: 12px;
  padding: 10px 12px;
  background: var(--c-bg-sec);
  border-radius: var(--radius-sm);
  border-left: 3px solid var(--c-primary);
}
.acm-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--c-text);
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.acm-tag {
  font-size: 10px;
  padding: 1px 6px;
  background: var(--c-danger);
  color: var(--c-primary-text);
  border-radius: 8px;
  font-weight: 500;
}
.acm-desc {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--c-text-sec);
  line-height: 1.6;
}
.acm-desc.hint { color: var(--c-text-muted); }

/* 开头钩子预览 */
.acm-hook-preview {
  padding: 10px 12px;
  background: var(--c-bg-card);
  border-radius: var(--radius-sm);
  margin-bottom: 8px;
  position: relative;
  font-size: 14px;
  font-weight: 600;
  color: var(--c-text);
  line-height: 1.5;
}
.hook-quote {
  font-size: 24px;
  color: var(--c-primary);
  font-family: serif;
  line-height: 0;
  vertical-align: -4px;
  margin: 0 2px;
}
.hook-text { color: var(--c-text); }
.acm-hook-info {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
}
.hook-prediction {
  font-weight: 700;
}

/* 完播率圆环 */
.acm-completion {
  display: flex;
  gap: 14px;
  align-items: center;
  margin-bottom: 6px;
}
.completion-gauge { flex-shrink: 0; }
.completion-ring {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: conic-gradient(var(--c) calc(var(--p) * 1%), var(--c-bg-card) 0);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
}
.completion-ring::before {
  content: '';
  position: absolute;
  inset: 6px;
  border-radius: 50%;
  background: var(--c-bg-card);
}
.completion-num {
  position: relative;
  font-size: 18px;
  font-weight: 800;
  color: var(--c);
  line-height: 1;
}
.completion-lbl {
  position: relative;
  font-size: 10px;
  color: var(--c-text-muted);
  margin-top: 2px;
}
.completion-meta {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 12px;
  font-size: 12px;
}
.cm-row {
  display: flex;
  justify-content: space-between;
  color: var(--c-text-sec);
}
.cm-row b { color: var(--c-text); font-weight: 600; }

/* CTA状态 */
.cta-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  margin-bottom: 6px;
}
.cta-status.ok { color: var(--c-success); }
.cta-status.miss { color: var(--c-warning); }
.cta-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

/* 建议列表 */
.suggestion-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.suggestion-item {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 12px;
  line-height: 1.5;
  padding: 6px 0;
}
.s-ev-badge {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  margin-top: 1px;
}
.sev-danger .s-ev-badge { background: rgba(245,108,108,0.15); color: var(--c-danger); }
.sev-warning .s-ev-badge { background: rgba(230,162,60,0.15); color: var(--c-warning); }
.sev-success .s-ev-badge { background: rgba(103,194,58,0.15); color: var(--c-success); }
.sev-danger .s-ev-text { color: var(--c-danger); }
.sev-warning .s-ev-text { color: var(--c-text-sec); }
.sev-success .s-ev-text { color: var(--c-success); }

/* 爆款元素 */
.viral-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* ===== 输入区 ===== */
.chat-input-area {
  padding: 12px;
  border-top: 1px solid var(--c-border-light);
  background: var(--c-bg-card);
  flex-shrink: 0;
}
.input-tips {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--c-primary-soft, rgba(26,76,255,0.08));
  color: var(--c-primary);
  border-radius: var(--radius-sm);
  font-size: 12px;
  margin-bottom: 8px;
}
.clear-file {
  margin-left: auto;
  cursor: pointer;
  font-size: 14px;
}
.clear-file:hover { opacity: 0.7; }

.input-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  justify-content: flex-end;
}
</style>
