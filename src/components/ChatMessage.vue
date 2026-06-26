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
    <div class="cm-avatar">
      <el-icon v-if="message.role === 'user'" :size="18"><UserFilled /></el-icon>
      <el-icon v-else :size="18"><Cpu /></el-icon>
    </div>

    <!-- 主体 -->
    <div class="cm-main">
      <!-- 元信息 -->
      <div class="cm-meta">
        <span class="cm-role">{{ message.role === 'user' ? '我' : 'AI 助手' }}</span>
        <span v-if="message.deepThinking" class="cm-badge">深度思考</span>
        <span class="cm-time">{{ message.timestamp }}</span>
        <span v-if="message.isStreaming" class="cm-streaming">
          <el-icon class="is-loading"><Loading /></el-icon> 生成中...
        </span>
      </div>

      <!-- 思考过程 -->
      <div v-if="message.deepThinking && (message.reasoningContent || message.isStreaming)" class="cm-reasoning">
        <details :open="message.isStreaming">
          <summary class="cm-reasoning-toggle">
            <span>{{ message.isStreaming ? '正在思考...' : '思考过程' }}</span>
            <span v-if="message.isStreaming" class="cm-reasoning-count">({{ message.reasoningContent?.length || 0 }} 字)</span>
          </summary>
          <div class="cm-reasoning-text">{{ message.reasoningContent || '正在分析...' }}</div>
        </details>
      </div>

      <!-- 气泡 -->
      <div class="cm-bubble">
        <div class="cm-content" v-html="renderedContent"></div>
      </div>

      <!-- 追问链 -->
      <div v-if="message.followUpIds.length > 0" class="cm-chain">
        <span>
          <el-icon><Connection /></el-icon>
          {{ message.followUpIds.length }} 条追问
        </span>
      </div>

      <!-- 操作按钮 -->
      <div v-if="!message.isStreaming" class="cm-actions" :class="{ 'cm-actions--rev': message.role === 'user' }">
        <template v-if="message.role === 'assistant'">
          <button class="cm-act" @click="$emit('followUp', message.id)">追问</button>
          <button class="cm-act" :class="{ active: message.isFavorited }" @click="$emit(message.isFavorited ? 'unfavorite' : 'favorite', message.id)">
            {{ message.isFavorited ? '已收藏' : '收藏' }}
          </button>
          <button class="cm-act cm-act--del" @click="$emit('delete', message.id)">删除</button>
        </template>
        <template v-else>
          <button class="cm-act cm-act--del" @click="$emit('delete', message.id)">删除</button>
        </template>
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
}>()

const md = new MarkdownIt({ html: false, breaks: true, linkify: true, typographer: true })

const renderedContent = computed(() => {
  const content = props.message.content
  if (!content && props.message.isStreaming) {
    return '<span class="cm-thinking">思考中...</span>'
  }
  return md.render(content)
})
</script>

<style scoped>
/* ===== 行容器 ===== */
.cm-row {
  display: flex; gap: 10px; padding: 12px 16px; max-width: 100%;
}
.cm-row--ai  { flex-direction: row; }
.cm-row--user { flex-direction: row-reverse; }

/* ===== 头像 ===== */
.cm-avatar {
  flex-shrink: 0; width: 34px; height: 34px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
}
.cm-row--ai .cm-avatar   { background: #f4f6f9; color: #667eea; }
.cm-row--user .cm-avatar { background: #eef3ff; color: #1a4cff; }

/* ===== 主体 ===== */
.cm-main { flex: 1; min-width: 0; display: flex; flex-direction: column; max-width: 78%; }
.cm-row--user .cm-main { align-items: flex-end; }

/* ===== 元信息 ===== */
.cm-meta { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.cm-role    { font-size: 12px; font-weight: 600; color: #8899b0; }
.cm-time    { font-size: 11px; color: #bcc5d2; margin-left: auto; }
.cm-row--user .cm-time { margin-left: 0; margin-right: auto; }
.cm-badge   { font-size: 10px; color: #7c5cfc; background: #f4f0ff; padding: 1px 6px; border-radius: 4px; font-weight: 600; }
.cm-streaming { font-size: 11px; color: #8899b0; display: flex; align-items: center; gap: 3px; }

/* ===== 气泡 ===== */
.cm-bubble {
  padding: 12px 16px; border-radius: 14px;
  font-size: var(--msg-font-size, 14px);
  line-height: var(--msg-line-height, 1.7);
  word-break: break-word;
}
.cm-row--ai .cm-bubble {
  background: #fff; border: 1px solid #eef2f6;
  border-top-left-radius: 4px;
}
.cm-row--user .cm-bubble {
  background: linear-gradient(135deg, #1a4cff, #3b6af0);
  color: #fff; border-top-right-radius: 4px;
}
.cm-row--streaming .cm-bubble { opacity: .92; }

.cm-content { font-family: var(--msg-font-family, 'Microsoft YaHei','PingFang SC',sans-serif); }

/* ===== Markdown 排版 ===== */
.cm-content :deep(p) { margin: 0 0 var(--msg-paragraph-spacing, 8px); }
.cm-content :deep(p:last-child) { margin-bottom: 0; }

.cm-content :deep(h1),
.cm-content :deep(h2),
.cm-content :deep(h3),
.cm-content :deep(h4) { font-weight: 700; margin: 14px 0 8px; line-height: 1.35; }
.cm-content :deep(h1) { font-size: calc(var(--msg-font-size,14px) + 6px); padding-bottom: 6px; border-bottom: 1px solid #e8ecf2; }
.cm-content :deep(h2) { font-size: calc(var(--msg-font-size,14px) + 4px); padding-bottom: 4px; border-bottom: 1px solid #eef2f6; }
.cm-content :deep(h3) { font-size: calc(var(--msg-font-size,14px) + 2px); }
.cm-content :deep(h4) { font-size: calc(var(--msg-font-size,14px) + 1px); }
.cm-content :deep(h1:first-child, h2:first-child, h3:first-child, h4:first-child) { margin-top: 0; }

.cm-row--user .cm-content :deep(h1),
.cm-row--user .cm-content :deep(h2) { border-bottom-color: rgba(255,255,255,.15); }

.cm-content :deep(hr) { border: none; border-top: 1px solid #e8ecf2; margin: 12px 0; }
.cm-row--user .cm-content :deep(hr) { border-color: rgba(255,255,255,.12); }

.cm-content :deep(blockquote) {
  border-left: 3px solid #1a4cff; padding: 6px 12px; margin: 8px 0;
  background: #f8fafc; color: #64748b; border-radius: 0 6px 6px 0; line-height: 1.6;
}
.cm-content :deep(blockquote p) { margin: 0; }
.cm-row--user .cm-content :deep(blockquote) {
  border-left-color: rgba(255,255,255,.4); background: rgba(255,255,255,.08); color: rgba(255,255,255,.8);
}

.cm-content :deep(ul), .cm-content :deep(ol) { margin: 6px 0; padding-left: 20px; }
.cm-content :deep(li) { padding: 2px 0; line-height: 1.6; }
.cm-content :deep(ul li::marker) { color: #1a4cff; }
.cm-content :deep(ol li::marker) { color: #94a3b8; font-weight: 600; }
.cm-row--user .cm-content :deep(ul li::marker) { color: rgba(255,255,255,.7); }
.cm-row--user .cm-content :deep(ol li::marker) { color: rgba(255,255,255,.5); }

.cm-content :deep(pre) {
  background: #1e293b; color: #e2e8f0; padding: 12px 14px; border-radius: 8px;
  font-size: calc(var(--msg-font-size,14px) - 1px); line-height: 1.6; overflow-x: auto; margin: 8px 0;
}
.cm-content :deep(pre code) { font-family: 'SF Mono','Fira Code','Consolas',monospace; background: none; padding: 0; font-size: inherit; color: inherit; }
.cm-row--user .cm-content :deep(pre) { background: rgba(0,0,0,.22); }

.cm-content :deep(code) {
  background: #eef2f6; color: #dc2626; padding: 1px 5px; border-radius: 4px;
  font-size: calc(var(--msg-font-size,14px) - 1px); font-family: 'SF Mono','Fira Code','Consolas',monospace;
}
.cm-row--user .cm-content :deep(code) { background: rgba(255,255,255,.15); color: rgba(255,255,255,.9); }

.cm-content :deep(table) { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: calc(var(--msg-font-size,14px) - 1px); }
.cm-content :deep(th) { background: #f4f6f9; padding: 5px 10px; border: 1px solid #e2e8f0; text-align: left; font-weight: 600; }
.cm-content :deep(td) { padding: 5px 10px; border: 1px solid #e2e8f0; }
.cm-row--user .cm-content :deep(th) { background: rgba(255,255,255,.1); border-color: rgba(255,255,255,.15); }
.cm-row--user .cm-content :deep(td) { border-color: rgba(255,255,255,.15); }

.cm-content :deep(strong) { font-weight: 700; color: #0f172a; }
.cm-content :deep(em)     { font-style: italic; color: #64748b; }
.cm-content :deep(del)    { text-decoration: line-through; opacity: .5; }
.cm-content :deep(a)      { color: #1a4cff; text-decoration: underline; }
.cm-content :deep(img)    { max-width: 100%; border-radius: 6px; margin: 4px 0; }

.cm-row--user .cm-content :deep(strong) { color: #fff; }
.cm-row--user .cm-content :deep(em)     { color: rgba(255,255,255,.8); }
.cm-row--user .cm-content :deep(a)      { color: rgba(255,255,255,.9); }

.cm-thinking { color: #8899b0; font-style: italic; }

/* ===== 操作按钮 ===== */
.cm-actions { display: flex; gap: 4px; margin-top: 6px; opacity: 0; transition: opacity .2s; }
.cm-row:hover .cm-actions { opacity: 1; }
.cm-actions--rev { flex-direction: row-reverse; }

.cm-act {
  font-size: 11px; padding: 3px 10px; border: 1px solid #e8ecf2; border-radius: 8px;
  background: #fff; color: #6b7a8f; cursor: pointer; font-family: inherit;
  transition: all .15s;
}
.cm-act:hover { border-color: #1a4cff; color: #1a4cff; background: #f4f6ff; }
.cm-act.active { background: #fefce8; border-color: #ca8a04; color: #ca8a04; }
.cm-act--del:hover { border-color: #dc2626; color: #dc2626; background: #fef5f5; }

.cm-chain { margin-top: 6px; font-size: 11px; color: #8899b0; }
.cm-chain span { display: inline-flex; align-items: center; gap: 4px; }

/* ===== 思考过程 ===== */
.cm-reasoning { margin-bottom: 8px; border: 1px solid #e8e6f0; border-radius: 8px; overflow: hidden; }
.cm-reasoning-toggle {
  padding: 6px 10px; background: #faf9fe; cursor: pointer; user-select: none;
  font-size: 12px; color: #7c5cfc; font-weight: 600; display: flex; align-items: center; gap: 6px;
}
.cm-reasoning-toggle:hover { background: #f2effa; }
.cm-reasoning-count { font-size: 11px; color: #a0a0c0; font-weight: 400; margin-left: auto; }
.cm-reasoning-text {
  padding: 8px 10px; font-size: 12px; line-height: 1.6; color: #5a5a7a;
  background: #fefefe; white-space: pre-wrap; word-break: break-word;
  max-height: 220px; overflow-y: auto; border-top: 1px solid #e8e6f0;
}
</style>
