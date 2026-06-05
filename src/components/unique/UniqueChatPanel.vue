<template>
  <div class="unique-chat">
    <!-- 消息列表 -->
    <div class="chat-messages" ref="messagesContainer">
      <div v-if="store.messages.length === 0" class="chat-empty">
        <el-icon :size="36"><ChatDotRound /></el-icon>
        <p>智能分析对话系统</p>
        <span>上传文案文件或输入问题，AI 将为您分析文案的开头吸引力、逻辑结构、结尾收束和语气适配度</span>
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
          <div class="analysis-title">文案分析结果</div>
          <div class="analysis-grid">
            <div class="analysis-item" :class="scoreClass(msg.analysis.openingScore)">
              <span class="analysis-label">开头吸引力</span>
              <span class="analysis-score">{{ msg.analysis.openingScore }}</span>
              <span class="analysis-text">{{ msg.analysis.openingFeedback }}</span>
            </div>
            <div class="analysis-item" :class="scoreClass(msg.analysis.logicScore)">
              <span class="analysis-label">中间逻辑</span>
              <span class="analysis-score">{{ msg.analysis.logicScore }}</span>
              <span class="analysis-text">{{ msg.analysis.logicFeedback }}</span>
            </div>
            <div class="analysis-item" :class="scoreClass(msg.analysis.endingScore)">
              <span class="analysis-label">结尾收束</span>
              <span class="analysis-score">{{ msg.analysis.endingScore }}</span>
              <span class="analysis-text">{{ msg.analysis.endingFeedback }}</span>
            </div>
            <div class="analysis-item" :class="scoreClass(msg.analysis.toneScore)">
              <span class="analysis-label">语气适配</span>
              <span class="analysis-score">{{ msg.analysis.toneScore }}</span>
              <span class="analysis-text">{{ msg.analysis.toneFeedback }}</span>
            </div>
          </div>
          <div v-if="msg.analysis.viralElements.length > 0" class="viral-tags">
            <span class="viral-label">爆款元素：</span>
            <el-tag v-for="el in msg.analysis.viralElements" :key="el" size="small" type="warning">{{ el }}</el-tag>
          </div>
          <div v-if="msg.analysis.suggestions.length > 0" class="analysis-suggestions">
            <span class="viral-label">改进建议：</span>
            <ul>
              <li v-for="(s, i) in msg.analysis.suggestions" :key="i">{{ s }}</li>
            </ul>
          </div>
        </div>

        <span class="msg-time">{{ msg.timestamp }}</span>
      </div>

      <!-- 分析加载状态 -->
      <div v-if="store.isAnalyzing" class="chat-msg msg-assistant">
        <div class="analyzing-indicator">
          <el-icon class="is-loading"><Loading /></el-icon>
          <span>正在深度分析文案...</span>
        </div>
      </div>
    </div>

    <!-- 输入区 -->
    <div class="chat-input-area">
      <el-input
        v-model="inputText"
        type="textarea"
        :rows="2"
        placeholder="输入文案内容或提问，AI 将分析：开头吸引力·中间逻辑·结尾收束·语气适配"
        resize="none"
        @keydown.enter.exact="handleSend"
      />
      <div class="input-actions">
        <el-button size="small" @click="triggerFileUpload">
          <el-icon><Upload /></el-icon> 上传文案
        </el-button>
        <input
          ref="fileInputRef"
          type="file"
          accept=".txt,.docx,.srt"
          style="display:none"
          @change="handleFileChange"
        />
        <el-button size="small" type="primary" @click="handleSend" :disabled="!inputText.trim() && !pendingFileContent">
          <el-icon><Promotion /></el-icon> 分析
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useUniqueModeStore, type CopywritingAnalysis } from '@/stores/uniqueMode'

const store = useUniqueModeStore()
const inputText = ref('')
const messagesContainer = ref<HTMLElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const pendingFileContent = ref('')
const pendingFileName = ref('')

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
    ElMessage.error('文件读取失败')
  }
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

/** 模拟文案分析逻辑 */
function analyzeCopywriting(text: string): CopywritingAnalysis {
  const len = text.length
  const hasQuestion = /[？?]/.test(text.substring(0, Math.min(50, len)))
  const hasEmotion = /[！!感叹惊讶].*/.test(text)
  const hasNumbers = /\d/.test(text)
  const hasCallToAction = /关注|点赞|收藏|评论|转发/.test(text)
  const endsStrong = /[！!?？~～]/.test(text.substring(Math.max(0, len - 20)))

  // 开头分析（前50字符）
  const openingScore = hasQuestion ? 85 : hasEmotion ? 78 : hasNumbers ? 72 : 55
  const openingFB = hasQuestion
    ? '开头使用疑问句，能有效激发读者好奇心，是很好的爆款元素'
    : hasEmotion
      ? '开头情绪表达较强，容易引发共鸣'
      : '建议开头增加悬念或疑问，提升吸引力'

  // 逻辑分析
  const logicScore = len > 200 ? 80 : len > 100 ? 70 : 55
  const logicFB = len > 200
    ? '文案结构完整，论证层次清晰'
    : '建议扩展中间论证部分，增强说服力'

  // 结尾分析
  const endingScore = hasCallToAction ? 88 : endsStrong ? 75 : 58
  const endingFB = hasCallToAction
    ? '结尾包含明确的行动号召，转化率会更高'
    : '建议结尾增加互动引导（关注/评论/点赞）'

  // 语气分析
  const toneScore = hasEmotion ? 82 : 68
  const toneFB = hasEmotion
    ? '语气富有感染力，符合当前账号受众偏好'
    : '建议增加情感表达，让文案更有温度'

  const viralElements: string[] = []
  if (hasQuestion) viralElements.push('悬念开头')
  if (hasEmotion) viralElements.push('情绪共鸣')
  if (hasCallToAction) viralElements.push('行动号召')
  if (hasNumbers) viralElements.push('数据支撑')

  const suggestions: string[] = []
  if (openingScore < 70) suggestions.push('开头建议加入悬念、疑问或反常识观点')
  if (logicScore < 70) suggestions.push('中间论证建议增加具体案例或数据支撑')
  if (endingScore < 70) suggestions.push('结尾建议增加明确的互动引导')
  if (toneScore < 70) suggestions.push('语气建议根据账号调性调整，增加情感词')

  return {
    openingScore,
    openingFeedback: openingFB,
    logicScore,
    logicFeedback: logicFB,
    endingScore,
    endingFeedback: endingFB,
    toneScore,
    toneFeedback: toneFB,
    viralElements,
    suggestions
  }
}

async function handleSend() {
  const content = inputText.value.trim()
  const fileContent = pendingFileContent.value

  if (!content && !fileContent) return

  const userMsg = fileContent
    ? `文件「${pendingFileName.value}」:\n${fileContent}\n\n${content || '请分析这篇文案'}`
    : content

  store.addMessage('user', userMsg)
  inputText.value = ''
  pendingFileContent.value = ''
  pendingFileName.value = ''
  scrollToBottom()

  // 模拟 AI 分析
  store.isAnalyzing = true
  await new Promise(r => setTimeout(r, 1500))
  store.isAnalyzing = false

  const textToAnalyze = fileContent || content
  const analysis = analyzeCopywriting(textToAnalyze)

  const aiResponse = `已对您提供的文案进行分析，以下是详细报告：\n\n📊 **综合评估**\n- 开头吸引力: ${analysis.openingScore}/100\n- 中间逻辑: ${analysis.logicScore}/100\n- 结尾收束: ${analysis.endingScore}/100\n- 语气适配: ${analysis.toneScore}/100\n\n💡 该文案${analysis.viralElements.length > 0 ? '包含' + analysis.viralElements.length + '个爆款元素' : '暂无明显的爆款元素'}，建议重点关注${analysis.suggestions[0] || '内容深度'}。`

  store.addMessage('assistant', aiResponse, analysis)
  scrollToBottom()
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

// 自动滚动
watch(() => store.messages.length, () => scrollToBottom())
</script>

<style scoped>
.unique-chat {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
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
  color: #c0c4cc;
  text-align: center;
  padding: 40px;
}

.chat-empty p {
  margin: 12px 0 4px;
  font-size: 16px;
  font-weight: 500;
  color: #909399;
}

.chat-empty span {
  font-size: 13px;
  max-width: 300px;
}

.chat-msg {
  max-width: 90%;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.7;
}

.msg-user {
  align-self: flex-end;
  background: #409eff;
  color: #fff;
}

.msg-assistant {
  align-self: flex-start;
  background: #f5f7fa;
  color: #303133;
}

.msg-system {
  align-self: center;
  background: #fdf6ec;
  color: #e6a23c;
  font-size: 13px;
  padding: 6px 12px;
  border-radius: 4px;
}

.msg-time {
  display: block;
  font-size: 11px;
  color: #c0c4cc;
  margin-top: 4px;
}

.msg-user .msg-time { text-align: right; }

.analyzing-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #909399;
}

/* 分析卡片 */
.analysis-card {
  margin-top: 10px;
  padding: 12px;
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
}

.analysis-title {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid #f0f2f5;
}

.analysis-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.analysis-item {
  padding: 8px;
  border-radius: 6px;
  background: #fafafa;
}

.analysis-item .analysis-label {
  display: block;
  font-size: 12px;
  color: #909399;
  margin-bottom: 2px;
}

.analysis-item .analysis-score {
  display: block;
  font-size: 20px;
  font-weight: 700;
}

.analysis-item .analysis-text {
  display: block;
  font-size: 12px;
  color: #606266;
  margin-top: 2px;
  line-height: 1.4;
}

.score-high .analysis-score { color: #67c23a; }
.score-mid .analysis-score { color: #e6a23c; }
.score-low .analysis-score { color: #f56c6c; }

.viral-tags, .analysis-suggestions {
  margin-top: 8px;
  display: flex;
  align-items: flex-start;
  gap: 6px;
  flex-wrap: wrap;
}

.viral-label {
  font-size: 12px;
  color: #606266;
  white-space: nowrap;
}

.analysis-suggestions ul {
  margin: 0;
  padding-left: 16px;
  font-size: 12px;
  color: #606266;
}

/* 输入区 */
.chat-input-area {
  padding: 12px;
  border-top: 1px solid #e4e7ed;
  background: #fafafa;
}

.input-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  justify-content: flex-end;
}
</style>
