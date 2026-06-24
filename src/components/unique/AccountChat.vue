<template>
  <div class="account-chat">
    <!-- 消息列表 -->
    <div class="ac-messages" ref="messagesEl">
      <div v-if="messages.length === 0" class="ac-empty">
        <div class="ac-empty-icon">💬</div>
        <div class="ac-empty-title">账号智能顾问</div>
        <div class="ac-empty-desc">基于当前账号的真实数据，回答关于选题、受众、内容策略等问题</div>
        <div class="ac-quick-asks">
          <button
            v-for="q in quickQuestions"
            :key="q"
            class="ac-qa-btn"
            @click="ask(q)"
          >{{ q }}</button>
        </div>
      </div>

      <div
        v-for="(msg, i) in messages"
        :key="i"
        class="ac-msg"
        :class="{ user: msg.role === 'user', assistant: msg.role === 'assistant' }"
      >
        <div class="acm-avatar">{{ msg.role === 'user' ? '👤' : '🤖' }}</div>
        <div class="acm-body">
          <div class="acm-role">
            {{ msg.role === 'user' ? '你' : '账号顾问' }}
            <span v-if="msg.role === 'assistant' && msg.deepThinking" class="acm-thinking-badge">深度思考</span>
          </div>
          <!-- 推理过程（深度思考时展示） -->
          <div v-if="msg.reasoning" class="acm-reasoning">
            <details>
              <summary class="acmr-summary">查看思考过程</summary>
              <div class="acmr-content">{{ msg.reasoning }}</div>
            </details>
          </div>
          <div class="acm-content" v-html="fmtContent(msg.content)"></div>
        </div>
      </div>

      <div v-if="isLoading" class="ac-msg assistant">
        <div class="acm-avatar">🤖</div>
        <div class="acm-body">
          <div class="acm-role">
            账号顾问
            <span v-if="deepThinkingEnabled" class="acm-thinking-badge">深度思考</span>
          </div>
          <!-- 流式推理过程 -->
          <div v-if="deepThinkingEnabled && streamingReasoning" class="acm-reasoning">
            <details open>
              <summary class="acmr-summary">正在思考...</summary>
              <div class="acmr-content">{{ streamingReasoning }}</div>
            </details>
          </div>
          <div v-if="streamingContent" class="acm-content" v-html="fmtContent(streamingContent)"></div>
          <div v-else class="acm-typing">
            <span class="dot"></span><span class="dot"></span><span class="dot"></span>
          </div>
        </div>
      </div>
    </div>

    <!-- 内容拆解辅助提示（开关开启但无拆解数据时显示） -->
    <div v-if="store.decomposeEnabledForChat && !store.lastDecomposition" class="ac-decompose-hint">
      <span class="acdh-text">📐 内容拆解辅助已开启，但暂无拆解数据</span>
      <button
        class="acdh-btn"
        :disabled="store.decomposing"
        @click="doDecompose()"
      >{{ store.decomposing ? '拆解中...' : '执行拆解' }}</button>
    </div>

    <!-- 输入区 -->
    <div class="ac-input-bar">
      <!-- 深度思考开关 -->
      <button
        class="ac-thinking-toggle"
        :class="{ active: deepThinkingEnabled }"
        @click="deepThinkingEnabled = !deepThinkingEnabled"
        title="开启后 AI 会进行更深度的推理分析"
      >
        🧠 {{ deepThinkingEnabled ? '深度思考:开' : '深度思考' }}
      </button>
      <!-- 内容拆解辅助开关 -->
      <button
        class="ac-thinking-toggle ac-decompose-toggle"
        :class="{ active: store.decomposeEnabledForChat }"
        @click="store.toggleDecomposeForChat()"
        title="开启后将最新内容拆解数据注入 AI 对话上下文"
      >
        📐 {{ store.decomposeEnabledForChat ? '内容拆解:开' : '内容拆解' }}
      </button>
      <textarea
        v-model="inputText"
        class="ac-input"
        placeholder="问账号顾问关于选题、受众、内容策略..."
        rows="2"
        @keydown.enter.exact.prevent="handleSend"
        :disabled="isLoading"
      />
      <button class="ac-send-btn" :disabled="!inputText.trim() || isLoading" @click="handleSend">
        {{ isLoading ? '发送中...' : '发送' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { useUniqueModeStore } from '@/stores/uniqueMode'
import { SCORING_DIMENSION_CONFIG } from '@/stores/uniqueMode'
import { useChatStore } from '@/stores/chat'
import type { ChatMessage } from '@/types/chat'
import { sendChatMessageStream } from '@/services/deepseek'

interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  deepThinking?: boolean
}

const store = useUniqueModeStore()
const chatStore = useChatStore()
const messagesEl = ref<HTMLElement | null>(null)
const inputText = ref('')
const isLoading = ref(false)
const messages = ref<ChatMsg[]>([])
const deepThinkingEnabled = ref(false)
const streamingContent = ref('')
const streamingReasoning = ref('')
const chatVersion = ref(0)

const LOCAL_KEY = () => `um-chat-${store.currentAccountId}`

const quickQuestions = [
  '根据我现有的数据，什么选题方向最容易跑出高赞？',
  '我的粉丝画像大概是怎样的？他们喜欢什么类型的内容？',
  '最近哪些话题在我的领域里比较热门？',
  '帮我分析一下我的账号目前的内容短板是什么',
  '给我推荐3个下周可以拍摄的选题',
  '对比一下不同平台的点赞表现有什么差异'
]

function fmtContent(text: string): string {
  if (!text) return ''
  return text
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\n/g, '<br>')
    .replace(/^- (.+)$/gm, '• $1')
    .replace(/^(\d+)\. (.+)$/gm, '$1. $2')
}

function loadMessages() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY())
    if (raw) {
      messages.value = JSON.parse(raw)
    } else {
      messages.value = []
    }
  } catch {
    messages.value = []
  }
}

function saveMessages() {
  localStorage.setItem(LOCAL_KEY(), JSON.stringify(messages.value))
}

// 账号切换时重新加载聊天记录
watch(() => store.currentAccountId, () => {
  loadMessages()
  chatVersion.value++
  inputText.value = ''
}, { immediate: true })

onMounted(() => {
  loadMessages()
})

function ask(q: string) {
  inputText.value = q
  handleSend()
}

async function doDecompose() {
  const lastUserMsg = [...messages.value].reverse().find(m => m.role === 'user')
  const content = inputText.value.trim() || lastUserMsg?.content || ''
  if (!content) {
    ElMessage.warning('请先输入或发送一条消息，再执行内容拆解')
    return
  }
  try {
    await store.decomposeContent(content)
    ElMessage.success('内容拆解完成，已注入对话上下文')
  } catch (e: any) {
    ElMessage.error(`拆解失败：${e.message || '未知错误'}`)
  }
}

function buildContext(): string {
  const parts: string[] = []
  parts.push(`【账号信息】`)
  parts.push(`账号名称：${store.currentAccount?.name || '未设置'}`)

  // 样本统计
  if (store.scriptRecords.length > 0) {
    const total = store.scriptRecords.length
    const avgLikes = Math.round(store.scriptRecords.reduce((s, r) => s + r.actualLikes, 0) / total)
    const top = [...store.scriptRecords].sort((a, b) => b.actualLikes - a.actualLikes)

    parts.push(`\n【样本数据概况】`)
    parts.push(`总样本数：${total} 条`)
    parts.push(`平均点赞：${avgLikes >= 10000 ? (avgLikes / 10000).toFixed(1) + '万' : avgLikes.toLocaleString()}`)

    // 平台分布
    const platformCounts: Record<string, number> = {}
    store.scriptRecords.forEach(r => {
      platformCounts[r.platform] = (platformCounts[r.platform] || 0) + 1
    })
    parts.push(`平台分布：${Object.entries(platformCounts).map(([k, v]) => `${k}(${v}条)`).join('，')}`)

    // 最近高赞样本
    parts.push(`\n【高赞样本 Top 5】`)
    top.slice(0, 5).forEach((r, i) => {
      const likes = r.actualLikes >= 10000 ? (r.actualLikes / 10000).toFixed(1) + '万' : r.actualLikes.toLocaleString()
      parts.push(`${i + 1}. [${r.platform}] 点赞${likes}`)
      parts.push(`   内容：${r.content.slice(0, 120)}${r.content.length > 120 ? '...' : ''}`)
      parts.push(`   综合评分：${r.compositeScore}分 | 标签：${r.tags?.join('#') || '无'}`)
    })

    // 最近低赞样本
    if (top.length > 0) {
      const low = top.slice(-3).reverse()
      parts.push(`\n【低赞样本参考】`)
      low.forEach((r, i) => {
        const likes = r.actualLikes >= 10000 ? (r.actualLikes / 10000).toFixed(1) + '万' : r.actualLikes.toLocaleString()
        parts.push(`${i + 1}. [${r.platform}] 点赞${likes}`)
        parts.push(`   内容：${r.content.slice(0, 100)}${r.content.length > 100 ? '...' : ''}`)
        parts.push(`   综合评分：${r.compositeScore}分`)
      })
    }
  } else {
    parts.push(`\n【注意】该账号暂无样本数据，回答时请基于通用短视频创作经验，并提示用户先录入样本数据。`)
  }

  // 规律总结
  if (store.patternSummary) {
    parts.push(`\n【已总结规律】`)
    parts.push(`高赞规律：${store.patternSummary.highLikePatterns.join('；')}`)
    parts.push(`低赞通病：${store.patternSummary.lowLikePatterns.join('；')}`)
    if (store.patternSummary.platformDifferences) {
      parts.push(`平台差异：${store.patternSummary.platformDifferences}`)
    }
  }

  // 写作框架
  if (store.writingFramework) {
    parts.push(`\n【已总结写作框架】${store.writingFramework}`)
  }

  // 评分维度
  const defaults: Record<string, number> = { hook: 18, empathy: 14, density: 16, structure: 14, originality: 16, socialResonance: 12, polish: 10 }
  const dimW = (key: string) => store.customWeights[key] ?? defaults[key] ?? 0
  parts.push(`\n【评分维度（受众需求锚定）】${SCORING_DIMENSION_CONFIG.map(d => `${d.label}(${dimW(d.key)}%)`).join('、')}`)
  if (store.customWeights && Object.keys(store.customWeights).length > 0) {
    parts.push(`当前自定义权重：${JSON.stringify(store.customWeights)}`)
  }

  // 内容拆解辅助
  if (store.decomposeEnabledForChat && store.lastDecomposition) {
    const d = store.lastDecomposition
    const strengthMap: Record<string, string> = { strong: '强', medium: '中', weak: '弱' }
    const impactMap: Record<string, string> = { high: '高', medium: '中', low: '低' }
    parts.push(`\n【内容拆解参考】`)
    parts.push(`- 开头钩子：${d.openingHook.text}（技巧：${d.openingHook.technique}，强度：${strengthMap[d.openingHook.strength] || d.openingHook.strength}）`)
    if (d.likeTriggers.length > 0) {
      parts.push(`- 点赞引爆点：`)
      d.likeTriggers.forEach((t, i) => {
        parts.push(`  ${i + 1}. ${t.point}（类型：${t.triggerType}，影响力：${impactMap[t.expectedImpact] || t.expectedImpact}）`)
      })
    }
    if (d.commentBaits.length > 0) {
      parts.push(`- 评论引导：`)
      d.commentBaits.forEach((b, i) => {
        parts.push(`  ${i + 1}. ${b.bait}（技巧：${b.technique}，互动预估：${impactMap[b.expectedEngagement] || b.expectedEngagement}）`)
      })
    }
    parts.push(`- 整体：${d.overallAnalysis}`)
  }

  return parts.join('\n')
}

async function handleSend() {
  const q = inputText.value.trim()
  if (!q || isLoading.value) return

  // 获取模型
  const model = chatStore.models.find((m: any) => m.isDefault) || chatStore.models[0]
  if (!model?.apiKey) {
    ElMessage.warning('请先在全局模型管理中设置 API Key')
    return
  }

  messages.value.push({ role: 'user', content: q, deepThinking: deepThinkingEnabled.value })
  inputText.value = ''
  isLoading.value = true
  streamingContent.value = ''
  streamingReasoning.value = ''
  const thinking = deepThinkingEnabled.value

  await nextTick()
  scrollToBottom()

  // 构建发送历史
  const history: ChatMessage[] = messages.value.map((m, i) => ({
    id: `msg_${i}`,
    role: m.role,
    content: m.content,
    deepThinking: m.deepThinking || false,
    reasoningContent: m.reasoning || '',
    timestamp: '',
    followUpTo: null,
    followUpIds: [],
    isFavorited: false,
    isStreaming: false
  }))

  // 构建系统提示
  const systemMsg: ChatMessage = {
    id: 'system',
    role: 'system',
    content: `你是短视频账号的专属内容顾问，帮助创作者分析账号数据、优化内容策略。

以下是当前账号的真实数据，请基于这些数据回答问题：
${buildContext()}

回答要求：
1. 回答必须基于账号实际数据，引用具体样本和数字
2. 如果没有样本数据，提示用户先录入数据，并给出通用的短视频创作建议
3. 用清晰的结构化方式回答。可以用标题、列表、要点等
4. 对账号问题和不足给出具体可执行的建议
5. 语气专业但亲切，像在和一个创作者朋友对话`,
    deepThinking: false,
    reasoningContent: '',
    timestamp: '',
    followUpTo: null,
    followUpIds: [],
    isFavorited: false,
    isStreaming: false
  }

  let fullContent = ''
  let fullReasoning = ''

  try {
    await sendChatMessageStream(
      model,
      [systemMsg, ...history],
      (chunk: string) => {
        fullContent += chunk
        streamingContent.value = fullContent
        scrollToBottom()
      },
      () => {
        // onDone
        messages.value.push({
          role: 'assistant',
          content: fullContent || '(无回复)',
          reasoning: fullReasoning || undefined,
          deepThinking: thinking
        })
        streamingContent.value = ''
        streamingReasoning.value = ''
        saveMessages()
      },
      (error: Error) => {
        // onError
        const errMsg = error.message || '请求失败'
        messages.value.push({
          role: 'assistant',
          content: `出错了：${errMsg}`,
          deepThinking: thinking
        })
        streamingContent.value = ''
        streamingReasoning.value = ''
        saveMessages()
        ElMessage.error(`发送失败：${errMsg}`)
      },
      { deepThinking: thinking },
      undefined,
      (reasoning: string) => {
        fullReasoning += reasoning
        streamingReasoning.value = fullReasoning
        scrollToBottom()
      }
    )
  } catch (e: any) {
    messages.value.push({
      role: 'assistant',
      content: `出错了：${e.message || '未知错误'}`,
      deepThinking: thinking
    })
    streamingContent.value = ''
    streamingReasoning.value = ''
    saveMessages()
    ElMessage.error(`发送失败：${e.message || '未知错误'}`)
  } finally {
    isLoading.value = false
    await nextTick()
    scrollToBottom()
  }
}

function scrollToBottom() {
  if (messagesEl.value) {
    messagesEl.value.scrollTop = messagesEl.value.scrollHeight
  }
}
</script>

<style scoped>
.account-chat {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fff;
  border-radius: 16px;
  overflow: hidden;
}

.ac-messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ac-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  padding: 40px 20px;
}
.ac-empty-icon { font-size: 48px; margin-bottom: 12px; }
.ac-empty-title { font-size: 18px; font-weight: 700; color: #0b1a30; margin-bottom: 6px; }
.ac-empty-desc { font-size: 13px; color: #8895a7; text-align: center; margin-bottom: 24px; max-width: 360px; }

.ac-quick-asks {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  max-width: 500px;
}
.ac-qa-btn {
  font-size: 12px;
  padding: 6px 14px;
  border-radius: 16px;
  border: 1px solid #dde4f0;
  background: #f8fafe;
  color: #4d5a6e;
  cursor: pointer;
  transition: all .15s;
  white-space: nowrap;
}
.ac-qa-btn:hover {
  background: #eef3ff;
  border-color: #1a4cff;
  color: #1a4cff;
}

.ac-msg {
  display: flex;
  gap: 10px;
  max-width: 85%;
}
.ac-msg.user { align-self: flex-end; flex-direction: row-reverse; }
.ac-msg.assistant { align-self: flex-start; }

.acm-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #f5f7fb;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  flex-shrink: 0;
}
.ac-msg.user .acm-avatar { background: #eef3ff; }

.acm-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.acm-role { font-size: 11px; color: #8895a7; font-weight: 600; display: flex; align-items: center; gap: 6px; }
.ac-msg.user .acm-role { text-align: right; justify-content: flex-end; }

.acm-thinking-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  background: #fef0e6;
  color: #d4760a;
  font-weight: 500;
}

.acm-reasoning {
  margin-bottom: 4px;
}
.acmr-summary {
  font-size: 11px;
  color: #d4760a;
  cursor: pointer;
  user-select: none;
  padding: 4px 0;
}
.acmr-content {
  font-size: 12px;
  color: #8a6d3b;
  background: #fef9f0;
  border-left: 2px solid #f0c060;
  padding: 6px 10px;
  margin-top: 4px;
  border-radius: 0 6px 6px 0;
  line-height: 1.6;
  white-space: pre-wrap;
  max-height: 300px;
  overflow-y: auto;
}

.acm-content {
  font-size: 13px;
  line-height: 1.7;
  color: #3d5068;
  background: #f8fafe;
  padding: 10px 14px;
  border-radius: 12px 12px 12px 4px;
  word-break: break-word;
}
.ac-msg.user .acm-content {
  background: #1a4cff;
  color: #fff;
  border-radius: 12px 12px 4px 12px;
}
.acm-content :deep(b) { color: #0b1a30; font-weight: 700; }
.ac-msg.user .acm-content :deep(b) { color: #fff; }

.acm-typing {
  display: flex;
  gap: 4px;
  padding: 12px 14px;
  background: #f8fafe;
  border-radius: 12px 12px 12px 4px;
}
.acm-typing .dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: #bcc5d2;
  animation: ac-bounce 1.4s infinite ease-in-out;
}
.acm-typing .dot:nth-child(2) { animation-delay: .2s; }
.acm-typing .dot:nth-child(3) { animation-delay: .4s; }
@keyframes ac-bounce {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
}

.ac-input-bar {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid #eef2f6;
  background: #fafbfd;
  align-items: flex-end;
}

.ac-thinking-toggle {
  font-size: 11px;
  padding: 6px 10px;
  border-radius: 16px;
  border: 1px solid #dde4f0;
  background: #fff;
  color: #8895a7;
  cursor: pointer;
  transition: all .15s;
  white-space: nowrap;
  flex-shrink: 0;
  margin-bottom: 2px;
}
.ac-thinking-toggle:hover { border-color: #d4760a; color: #d4760a; }
.ac-thinking-toggle.active {
  background: #fef0e6;
  border-color: #d4760a;
  color: #d4760a;
}

.ac-decompose-toggle:hover { border-color: #1a4cff; color: #1a4cff; }
.ac-decompose-toggle.active {
  background: #eef3ff;
  border-color: #1a4cff;
  color: #1a4cff;
}

.ac-decompose-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 6px 16px;
  background: #eef3ff;
  border-top: 1px solid #dde4f0;
  border-bottom: 1px solid #dde4f0;
}
.acdh-text {
  font-size: 12px;
  color: #4d5a6e;
}
.acdh-btn {
  font-size: 11px;
  padding: 4px 12px;
  border-radius: 12px;
  border: 1px solid #1a4cff;
  background: #1a4cff;
  color: #fff;
  cursor: pointer;
  transition: all .15s;
}
.acdh-btn:hover:not(:disabled) { background: #3a68ff; }
.acdh-btn:disabled { background: #dde4f0; border-color: #dde4f0; color: #bcc5d2; cursor: not-allowed; }

.ac-input {
  flex: 1;
  border: 1px solid #e0e6f0;
  border-radius: 12px;
  padding: 10px 14px;
  font-size: 13px;
  font-family: inherit;
  resize: none;
  outline: none;
  color: #3d5068;
  background: #fff;
  transition: border-color .15s;
}
.ac-input:focus { border-color: #1a4cff; }
.ac-input::placeholder { color: #bcc5d2; }
.ac-input:disabled { background: #f5f6f8; }

.ac-send-btn {
  padding: 0 20px;
  border-radius: 12px;
  border: none;
  background: #1a4cff;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
  transition: all .15s;
  height: 40px;
}
.ac-send-btn:hover:not(:disabled) { background: #3a68ff; }
.ac-send-btn:disabled { background: #dde4f0; color: #bcc5d2; cursor: not-allowed; }
</style>
