<template>
  <div
    :data-msg-id="message.id"
    class="cm-row"
    :class="{
      'cm-row--user': message.role === 'user',
      'cm-row--ai': message.role === 'assistant',
      'cm-row--streaming': message.isStreaming
    }"
  >
    <!-- 头像 -->
    <div class="cm-avatar" :class="{ 'cm-avatar--user': message.role === 'user' }">
      <el-icon v-if="message.role === 'user'" :size="16"><UserFilled /></el-icon>
      <template v-else>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </template>
    </div>

    <!-- 主体 -->
    <div class="cm-main">
      <!-- 元信息 -->
      <div class="cm-meta">
        <span class="cm-role">{{ message.role === 'user' ? '你' : 'AI 助手' }}</span>
        <span v-if="message.deepThinking" class="cm-badge">深度思考</span>
        <span class="cm-time">{{ formatTime(message.timestamp) }}</span>
      </div>

      <!-- 思考过程 -->
      <div v-if="message.deepThinking && (message.reasoningContent || message.isStreaming)" class="cm-reasoning">
        <details :open="message.isStreaming">
          <summary class="cm-reasoning-toggle">
            <el-icon :size="12"><InfoFilled /></el-icon>
            <span>{{ message.isStreaming ? '思考中...' : '已深度思考' }}</span>
            <span class="cm-reasoning-count" v-if="message.reasoningContent">{{ message.reasoningContent.length }}字</span>
          </summary>
          <div class="cm-reasoning-text">{{ message.reasoningContent || '正在分析...' }}</div>
        </details>
      </div>

      <!-- 气泡 -->
      <div class="cm-bubble">
        <div class="cm-content" v-html="renderedContent"></div>
        <div v-if="message.isStreaming && !message.content" class="cm-typing">
          <span></span><span></span><span></span>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div v-if="!message.isStreaming" class="cm-actions" :class="{ 'cm-actions--rev': message.role === 'user' }">
        <template v-if="message.role === 'assistant'">
          <button class="cm-action-btn" @click="$emit('copy', message.content)" title="复制">
            <el-icon :size="12"><CopyDocument /></el-icon>
            <span>复制</span>
          </button>
          <button class="cm-action-btn" @click="$emit('followUp', message.id)" title="追问">
            <el-icon :size="12"><Promotion /></el-icon>
            <span>追问</span>
          </button>
          <button class="cm-action-btn" :class="{ active: message.isFavorited }" @click="$emit(message.isFavorited ? 'unfavorite' : 'favorite', message.id)">
            <el-icon :size="12"><Star /></el-icon>
            <span>{{ message.isFavorited ? '已收藏' : '收藏' }}</span>
          </button>
        </template>
        <button class="cm-action-btn cm-action-btn--del" @click="$emit('delete', message.id)" title="删除">
          <el-icon :size="12"><Delete /></el-icon>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import MarkdownIt from 'markdown-it'
import type { ChatMessage } from '@/types/chat'

const props = defineProps<{
  message: ChatMessage
}>()

defineEmits<{
  followUp: [messageId: string]
  favorite: [messageId: string]
  unfavorite: [messageId: string]
  delete: [messageId: string]
  copy: [content: string]
}>()

const md = new MarkdownIt({ html: false, breaks: true, linkify: true, typographer: true })

const renderedContent = computed(() => {
  const content = props.message.content
  if (!content) return ''
  return md.render(content)
})

function formatTime(ts: string) {
  try {
    const d = new Date(ts)
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}
</script>

<style scoped>
.cm-row {
  display: flex;
  gap: 10px;
  padding: 16px 16px 4px;
  max-width: 100%;
  animation: cmFadeIn 0.3s ease forwards;
}
.cm-row--ai { flex-direction: row; }
.cm-row--user { flex-direction: row-reverse; }
.cm-row--streaming .cm-bubble { opacity: 0.95; }

@keyframes cmFadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.cm-avatar {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--c-primary), var(--c-accent));
  color: var(--c-primary-text);
  box-shadow: 0 2px 6px color-mix(in srgb, var(--c-primary) 20%, transparent);
}
.cm-avatar--user {
  background: var(--c-bg-hover);
  color: var(--c-primary);
  box-shadow: none;
  border: 1px solid var(--c-border);
}

.cm-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  max-width: calc(100% - 50px);
}
.cm-row--user .cm-main { align-items: flex-end; }

.cm-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}
.cm-role {
  font-size: 11px;
  font-weight: 600;
  color: var(--c-text-muted);
}
.cm-time {
  font-size: 10px;
  color: var(--c-text-muted);
  opacity: 0.7;
}
.cm-badge {
  font-size: 10px;
  color: var(--c-accent);
  background: color-mix(in srgb, var(--c-accent) 10%, transparent);
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 600;
}

.cm-reasoning {
  margin-bottom: 6px;
  border: 1px solid color-mix(in srgb, var(--c-accent) 20%, transparent);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: color-mix(in srgb, var(--c-accent) 3%, transparent);
  max-width: 100%;
}
.cm-reasoning-toggle {
  padding: 6px 10px;
  cursor: pointer;
  user-select: none;
  font-size: 11px;
  color: var(--c-accent);
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 5px;
  list-style: none;
}
.cm-reasoning-toggle::-webkit-details-marker { display: none; }
.cm-reasoning-count {
  font-size: 10px;
  color: var(--c-text-muted);
  font-weight: 400;
  margin-left: 4px;
}
.cm-reasoning-text {
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--c-text-sec);
  background: var(--c-bg-card);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
  border-top: 1px solid color-mix(in srgb, var(--c-accent) 15%, transparent);
}

.cm-bubble {
  padding: 10px 14px;
  border-radius: 4px 14px 14px 14px;
  font-size: var(--msg-font-size, 14px);
  line-height: var(--msg-line-height, 1.7);
  word-break: break-word;
  max-width: 100%;
  position: relative;
}
.cm-row--ai .cm-bubble {
  background: var(--c-bg-card);
  border: 1px solid var(--c-border-light);
  border-top-left-radius: 4px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.03);
}
.cm-row--user .cm-bubble {
  background: linear-gradient(135deg, var(--c-primary), var(--c-accent));
  color: var(--c-primary-text);
  border-top-right-radius: 4px;
  box-shadow: 0 2px 8px color-mix(in srgb, var(--c-primary) 20%, transparent);
}

.cm-content {
  font-family: inherit;
}
.cm-content :deep(p) { margin: 0 0 var(--msg-paragraph-spacing, 8px); }
.cm-content :deep(p:last-child) { margin-bottom: 0; }

.cm-content :deep(h1), .cm-content :deep(h2), .cm-content :deep(h3), .cm-content :deep(h4) {
  font-weight: 700;
  margin: 12px 0 6px;
  line-height: 1.35;
}
.cm-content :deep(h1) { font-size: calc(var(--msg-font-size,14px) + 5px); padding-bottom: 4px; border-bottom: 1px solid var(--c-border-light); }
.cm-content :deep(h2) { font-size: calc(var(--msg-font-size,14px) + 3px); }
.cm-content :deep(h3) { font-size: calc(var(--msg-font-size,14px) + 1px); }

.cm-row--user .cm-content :deep(h1), .cm-row--user .cm-content :deep(h2) {
  border-bottom-color: rgba(255,255,255,0.2);
}

.cm-content :deep(hr) { border: none; border-top: 1px solid var(--c-border-light); margin: 10px 0; }
.cm-row--user .cm-content :deep(hr) { border-color: rgba(255,255,255,0.2); }

.cm-content :deep(blockquote) {
  border-left: 3px solid var(--c-primary);
  padding: 6px 12px;
  margin: 8px 0;
  background: var(--c-bg-sec);
  color: var(--c-text-sec);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  font-size: calc(var(--msg-font-size,14px) - 1px);
}
.cm-content :deep(blockquote p) { margin: 0; }
.cm-row--user .cm-content :deep(blockquote) {
  border-left-color: rgba(255,255,255,0.5);
  background: rgba(255,255,255,0.1);
  color: rgba(255,255,255,0.9);
}

.cm-content :deep(ul), .cm-content :deep(ol) { margin: 6px 0; padding-left: 20px; }
.cm-content :deep(li) { padding: 2px 0; line-height: 1.6; }
.cm-content :deep(ul li::marker) { color: var(--c-primary); }
.cm-row--user .cm-content :deep(ul li::marker) { color: rgba(255,255,255,0.7); }

.cm-content :deep(pre) {
  background: var(--c-code-bg);
  color: var(--c-code-text);
  padding: 12px;
  border-radius: var(--radius-md);
  font-size: calc(var(--msg-font-size,14px) - 1px);
  line-height: 1.5;
  overflow-x: auto;
  margin: 8px 0;
}
.cm-content :deep(pre code) {
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  background: none;
  padding: 0;
  font-size: inherit;
  color: inherit;
}
.cm-row--user .cm-content :deep(pre) { background: rgba(0,0,0,0.25); }

.cm-content :deep(code) {
  background: color-mix(in srgb, var(--c-danger) 8%, transparent);
  color: var(--c-danger);
  padding: 1px 5px;
  border-radius: 4px;
  font-size: calc(var(--msg-font-size,14px) - 1px);
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
}
.cm-row--user .cm-content :deep(code) {
  background: rgba(255,255,255,0.15);
  color: rgba(255,255,255,0.95);
}

.cm-content :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 8px 0;
  font-size: calc(var(--msg-font-size,14px) - 1px);
}
.cm-content :deep(th) {
  background: var(--c-bg-sec);
  padding: 6px 10px;
  border: 1px solid var(--c-border);
  text-align: left;
  font-weight: 600;
}
.cm-content :deep(td) {
  padding: 6px 10px;
  border: 1px solid var(--c-border);
}
.cm-row--user .cm-content :deep(th) {
  background: rgba(255,255,255,0.12);
  border-color: rgba(255,255,255,0.2);
}
.cm-row--user .cm-content :deep(td) { border-color: rgba(255,255,255,0.2); }

.cm-content :deep(strong) { font-weight: 700; }
.cm-row--ai .cm-content :deep(strong) { color: var(--c-text); }
.cm-content :deep(em) { font-style: italic; opacity: 0.85; }
.cm-content :deep(a) { color: var(--c-primary); text-decoration: none; border-bottom: 1px dashed var(--c-primary); }
.cm-content :deep(a:hover) { border-bottom-style: solid; }
.cm-row--user .cm-content :deep(a) { color: #fff; border-bottom-color: rgba(255,255,255,0.5); }
.cm-content :deep(img) { max-width: 100%; border-radius: var(--radius-sm); margin: 4px 0; }

.cm-typing {
  display: inline-flex;
  gap: 3px;
  padding: 4px 0;
}
.cm-typing span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--c-text-muted);
  animation: cmDotBounce 1.2s infinite ease-in-out;
}
.cm-typing span:nth-child(2) { animation-delay: 0.15s; }
.cm-typing span:nth-child(3) { animation-delay: 0.3s; }
@keyframes cmDotBounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30% { transform: translateY(-5px); opacity: 1; }
}

/* Actions */
.cm-actions {
  display: flex;
  gap: 4px;
  margin-top: 6px;
  opacity: 0;
  transition: opacity 0.2s;
}
.cm-row:hover .cm-actions { opacity: 1; }
.cm-actions--rev { flex-direction: row-reverse; }

.cm-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  padding: 3px 8px;
  border: 1px solid var(--c-border);
  border-radius: 12px;
  background: var(--c-bg-card);
  color: var(--c-text-muted);
  cursor: pointer;
  font-family: inherit;
  transition: all var(--transition-fast);
}
.cm-action-btn:hover {
  border-color: var(--c-primary);
  color: var(--c-primary);
  background: var(--c-primary-soft);
}
.cm-action-btn.active {
  background: color-mix(in srgb, var(--c-warning) 8%, transparent);
  border-color: var(--c-warning);
  color: var(--c-warning);
}
.cm-action-btn--del:hover {
  border-color: var(--c-danger);
  color: var(--c-danger);
  background: color-mix(in srgb, var(--c-danger) 6%, transparent);
}
</style>
