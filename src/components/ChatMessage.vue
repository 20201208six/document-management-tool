<template>
  <div
    :data-msg-id="message.id"
    class="msg-row"
    :class="{
      'msg-row--user': message.role === 'user',
      'msg-row--ai': message.role === 'assistant',
      'msg-row--streaming': message.isStreaming
    }"
  >
    <!-- 头像 -->
    <div class="msg-avatar">
      <el-icon v-if="message.role === 'user'" :size="20"><UserFilled /></el-icon>
      <el-icon v-else :size="20"><Cpu /></el-icon>
    </div>

    <!-- 气泡 + 元信息 -->
    <div class="msg-main">
      <!-- 消息元信息（名字 + 时间） -->
      <div class="msg-meta">
        <span class="msg-role">{{ message.role === 'user' ? '我' : 'AI 助手' }}</span>
        <span v-if="message.deepThinking" class="msg-badge">深度思考</span>
        <span class="msg-time">{{ message.timestamp }}</span>
        <span v-if="message.isStreaming" class="msg-streaming">
          <el-icon class="is-loading"><Loading /></el-icon> 生成中...
        </span>
      </div>

      <!-- 思考过程 -->
      <div
        v-if="message.deepThinking && (message.reasoningContent || message.isStreaming)"
        class="reasoning-box"
      >
        <div class="reasoning-bar" @click="showReasoning = !showReasoning">
          <el-icon :class="{ rotated: showReasoning }"><ArrowRight /></el-icon>
          <span>思考过程</span>
          <span v-if="message.isStreaming" class="reasoning-status streaming">
            <el-icon class="is-loading"><Loading /></el-icon>
            思考中 ({{ (message.reasoningContent?.length || 0) }} 字)...
          </span>
          <span v-else class="reasoning-status done">已完成</span>
        </div>
        <div v-show="showReasoning" class="reasoning-text">
          {{ message.reasoningContent || '正在分析...' }}
        </div>
      </div>

      <!-- 气泡 -->
      <div class="msg-bubble">
        <div class="msg-content" v-html="renderedContent"></div>
      </div>

      <!-- 追问链 -->
      <div v-if="message.followUpIds.length > 0" class="msg-chain">
        <el-tag size="small" type="info">
          <el-icon><Connection /></el-icon>
          {{ message.followUpIds.length }} 条追问
        </el-tag>
      </div>

      <!-- 操作按钮 -->
      <div v-if="!message.isStreaming" class="msg-actions" :class="{ 'actions--user': message.role === 'user' }">
        <template v-if="message.role === 'assistant'">
          <el-button size="small" text @click="$emit('followUp', message.id)">追问</el-button>
          <el-button v-if="!message.isFavorited" size="small" text @click="$emit('favorite', message.id)">收藏</el-button>
          <el-button v-else size="small" text type="warning" @click="$emit('unfavorite', message.id)">已收藏</el-button>
          <el-button size="small" text type="danger" @click="$emit('delete', message.id)">删除</el-button>
        </template>
        <template v-else>
          <el-button size="small" text type="danger" @click="$emit('delete', message.id)">删除</el-button>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
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

const showReasoning = ref(props.message.isStreaming)

const renderedContent = computed(() => {
  const content = props.message.content
  if (!content && props.message.isStreaming) {
    return '<span class="thinking-text">思考中...</span>'
  }
  return renderMarkdown(content)
})

/* ===== Markdown 渲染器（保持不变） ===== */

function renderMarkdown(text: string): string {
  const codeBlocks: string[] = []
  let html = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length
    const langTag = lang ? `<span class="code-lang">${escapeHtml(lang)}</span>` : ''
    codeBlocks.push(`<div class="code-block-wrapper">${langTag}<pre><code>${escapeHtml(code.trimEnd())}</code></pre></div>`)
    return `%%CODEBLOCK_${idx}%%`
  })

  html = renderTables(html)
  html = html.replace(/^[-*_]{3,}\s*$/gm, '<hr>')
  html = html.replace(/^###### (.+)$/gm, '<h6>$1</h6>')
  html = html.replace(/^##### (.+)$/gm, '<h5>$1</h5>')
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>')
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>')
  html = renderBlockquotes(html)
  html = renderUnorderedLists(html)
  html = renderOrderedLists(html)

  html = html.replace(/\n{2,}/g, '\n\n')
  const blocks = html.split('\n\n')
  html = blocks.map(block => {
    const trimmed = block.trim()
    if (!trimmed) return ''
    if (/^<(h[1-6]|ul|ol|blockquote|table|div|hr|pre|\/)[^>]*>/.test(trimmed)) return trimmed
    return `<p>${trimmed}</p>`
  }).join('\n')

  html = renderInline(html)
  html = html.replace(/%%CODEBLOCK_(\d+)%%/g, (_, idx) => codeBlocks[parseInt(idx)])
  return html
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function renderTables(text: string): string {
  return text.replace(/^\|(.+)\|\n\|[-:| ]+\|\n((?:\|.+\|\n?)*)/gm, (_, header, body) => {
    const headers = header.split('|').map((h: string) => `<th>${h.trim()}</th>`).join('')
    const rows = body.trim().split('\n').map((row: string) => {
      const cells = row.split('|').filter((_: string, i: number, arr: string[]) => i > 0 && i < arr.length - 1 || row.startsWith('|'))
        .map((c: string) => `<td>${c.trim()}</td>`).join('')
      return `<tr>${cells}</tr>`
    }).join('')
    return `<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`
  })
}

function renderBlockquotes(text: string): string {
  const lines = text.split('\n')
  const result: string[] = []
  let inQuote = false
  let quoteLines: string[] = []
  for (const line of lines) {
    const match = line.match(/^>\s?(.*)/)
    if (match) {
      if (!inQuote) inQuote = true
      quoteLines.push(match[1] || '')
    } else {
      if (inQuote) { result.push(`<blockquote><p>${quoteLines.join('<br>')}</p></blockquote>`); quoteLines = []; inQuote = false }
      result.push(line)
    }
  }
  if (inQuote) result.push(`<blockquote><p>${quoteLines.join('<br>')}</p></blockquote>`)
  return result.join('\n')
}

function renderUnorderedLists(text: string): string {
  const lines = text.split('\n')
  const result: string[] = []
  let inList = false
  let listItems: string[] = []
  for (const line of lines) {
    const match = line.match(/^[-*+] (.+)/)
    if (match) {
      if (!inList) inList = true
      listItems.push(`<li>${match[1]}</li>`)
    } else {
      if (inList) { result.push(`<ul>${listItems.join('')}</ul>`); listItems = []; inList = false }
      result.push(line)
    }
  }
  if (inList) result.push(`<ul>${listItems.join('')}</ul>`)
  return result.join('\n')
}

function renderOrderedLists(text: string): string {
  const lines = text.split('\n')
  const result: string[] = []
  let inList = false
  let listItems: string[] = []
  for (const line of lines) {
    const match = line.match(/^\d+\. (.+)/)
    if (match) {
      if (!inList) inList = true
      listItems.push(`<li>${match[1]}</li>`)
    } else {
      if (inList) { result.push(`<ol>${listItems.join('')}</ol>`); listItems = []; inList = false }
      result.push(line)
    }
  }
  if (inList) result.push(`<ol>${listItems.join('')}</ol>`)
  return result.join('\n')
}

function renderInline(text: string): string {
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" title="$1">')
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>')
  text = text.replace(/~~(.+?)~~/g, '<del>$1</del>')
  text = text.replace(/`([^`\n]+)`/g, '<code>$1</code>')
  text = text.replace(/\n/g, '<br>')
  return text
}
</script>

<style scoped>
/* ===== 行容器 ===== */
.msg-row {
  display: flex;
  gap: 10px;
  padding: 16px 12px;
  max-width: 100%;
}

.msg-row--ai {
  flex-direction: row;
}

.msg-row--user {
  flex-direction: row-reverse;
}

/* ===== 头像 ===== */
.msg-avatar {
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 2px;
}

.msg-row--ai .msg-avatar {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
}

.msg-row--user .msg-avatar {
  background: linear-gradient(135deg, #11998e, #38ef7d);
  color: #fff;
}

/* ===== 消息主体 ===== */
.msg-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  max-width: 75%;
}

.msg-row--user .msg-main {
  align-items: flex-end;
}

/* ===== 元信息行 ===== */
.msg-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  padding: 0 4px;
}

.msg-role {
  font-size: 12px;
  font-weight: 600;
  color: #606266;
}

.msg-time {
  font-size: 11px;
  color: #c0c4cc;
  margin-left: auto;
}

.msg-row--user .msg-time {
  margin-left: 0;
  margin-right: auto;
}

.msg-badge {
  font-size: 10px;
  color: #7c5cfc;
  background: #f3f0ff;
  padding: 1px 5px;
  border-radius: 3px;
}

.msg-streaming {
  font-size: 11px;
  color: #909399;
  display: flex;
  align-items: center;
  gap: 3px;
}

/* ===== 气泡 ===== */
.msg-bubble {
  padding: 10px 14px;
  border-radius: 12px;
  font-size: var(--msg-font-size, 14px);
  line-height: var(--msg-line-height, 1.7);
  word-break: break-word;
  position: relative;
}

.msg-row--ai .msg-bubble {
  background: #fff;
  border: 1px solid #ebeef5;
  border-top-left-radius: 4px;
}

.msg-row--user .msg-bubble {
  background: linear-gradient(135deg, #409eff, #337ecc);
  color: #fff;
  border-top-right-radius: 4px;
}

/* 气泡小三角 */
.msg-bubble::before {
  content: '';
  position: absolute;
  top: 0;
  width: 0;
  height: 0;
  border: 6px solid transparent;
}

.msg-row--ai .msg-bubble::before {
  left: -8px;
  border-right-color: #ebeef5;
  border-top-color: #ebeef5;
}

.msg-row--user .msg-bubble::before {
  right: -8px;
  border-left-color: #409eff;
  border-top-color: #409eff;
}

/* 流式生成中 */
.msg-row--streaming .msg-bubble {
  opacity: 0.9;
}

.msg-content {
  font-family: var(--msg-font-family, 'Microsoft YaHei', 'PingFang SC', sans-serif);
}

/* 用户气泡内文字白色 */
.msg-row--user .msg-content {
  color: #fff;
}

/* ===== Markdown 样式 ===== */
.msg-content :deep(p) {
  margin: 0 0 var(--msg-paragraph-spacing, 8px);
}
.msg-content :deep(p:last-child) { margin-bottom: 0; }

.msg-content :deep(h1),
.msg-content :deep(h2),
.msg-content :deep(h3),
.msg-content :deep(h4),
.msg-content :deep(h5),
.msg-content :deep(h6) {
  margin: 12px 0 6px;
  font-weight: 700;
}
.msg-content :deep(h1) { font-size: calc(var(--msg-font-size, 14px) + 6px); border-bottom: 1px solid rgba(0,0,0,.08); padding-bottom: 4px; }
.msg-content :deep(h2) { font-size: calc(var(--msg-font-size, 14px) + 4px); }
.msg-content :deep(h3) { font-size: calc(var(--msg-font-size, 14px) + 2px); }

.msg-content :deep(blockquote) {
  margin: 8px 0;
  padding: 6px 12px;
  border-left: 3px solid #409eff;
  background: rgba(64,158,255,.05);
  border-radius: 0 4px 4px 0;
  color: #606266;
}
.msg-content :deep(blockquote p) { margin: 0; }

.msg-content :deep(.code-block-wrapper) {
  margin: 8px 0;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid #e4e7ed;
}
.msg-content :deep(.code-lang) {
  position: absolute; top: 0; right: 0;
  font-size: 11px; color: #909399; background: #f5f7fa;
  padding: 2px 8px; border-radius: 0 0 0 6px;
}
.msg-content :deep(pre) {
  background: #f8f9fb;
  padding: 12px 14px;
  overflow-x: auto;
  margin: 0;
  font-size: calc(var(--msg-font-size, 14px) - 1px);
  line-height: 1.6;
}
.msg-content :deep(code) {
  background: rgba(0,0,0,.06);
  padding: 1px 5px;
  border-radius: 3px;
  font-family: Consolas, 'Courier New', monospace;
  font-size: calc(var(--msg-font-size, 14px) - 1px);
  color: #e74c3c;
}
.msg-content :deep(pre code) { background: none; padding: 0; color: inherit; }

.msg-row--user .msg-content :deep(code) {
  background: rgba(255,255,255,.2);
  color: #fff;
}
.msg-row--user .msg-content :deep(pre) {
  background: rgba(0,0,0,.15);
}
.msg-row--user .msg-content :deep(blockquote) {
  background: rgba(255,255,255,.1);
  border-left-color: rgba(255,255,255,.5);
  color: rgba(255,255,255,.9);
}

.msg-content :deep(ul),
.msg-content :deep(ol) { margin: 4px 0 8px; padding-left: 20px; }
.msg-content :deep(li) { margin-bottom: 2px; }

.msg-content :deep(table) {
  border-collapse: collapse; width: 100%; margin: 8px 0;
  font-size: calc(var(--msg-font-size, 14px) - 1px);
}
.msg-content :deep(th) {
  background: #f5f7fa; font-weight: 600; text-align: left;
  padding: 6px 12px; border: 1px solid #e4e7ed;
}
.msg-content :deep(td) {
  padding: 4px 12px; border: 1px solid #e4e7ed; color: #606266;
}

.msg-content :deep(hr) { border: none; border-top: 1px solid rgba(0,0,0,.08); margin: 12px 0; }
.msg-content :deep(strong) { font-weight: 700; }
.msg-content :deep(em) { font-style: italic; }
.msg-content :deep(del) { text-decoration: line-through; opacity: .6; }
.msg-content :deep(a) { color: #409eff; text-decoration: none; }
.msg-content :deep(a:hover) { text-decoration: underline; }
.msg-content :deep(img) { max-width: 100%; border-radius: 4px; margin: 8px 0; }

.msg-row--user .msg-content :deep(a) { color: rgba(255,255,255,.9); text-decoration: underline; }

.thinking-text { color: #909399; font-style: italic; }

/* ===== 操作按钮 ===== */
.msg-actions {
  display: flex;
  gap: 2px;
  margin-top: 6px;
  opacity: 0;
  transition: opacity 0.2s;
}
.msg-row:hover .msg-actions { opacity: 1; }
.actions--user { flex-direction: row-reverse; }

.msg-chain { margin-top: 6px; }

/* ===== 思考过程 ===== */
.reasoning-box {
  margin-bottom: 8px;
  border: 1px solid #e8e6f0;
  border-radius: 8px;
  overflow: hidden;
  max-width: 100%;
}
.reasoning-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: #f8f7fc;
  cursor: pointer;
  font-size: 12px;
  color: #7c5cfc;
  user-select: none;
}
.reasoning-bar:hover { background: #f0edfa; }
.reasoning-bar .el-icon { transition: transform 0.2s; font-size: 14px; }
.reasoning-bar .el-icon.rotated { transform: rotate(90deg); }
.reasoning-status { margin-left: auto; font-size: 11px; border-radius: 3px; padding: 1px 6px; }
.reasoning-status.streaming { color: #909399; background: #f0f2f5; }
.reasoning-status.done { color: #b0a8d4; background: #edeaf7; }
.reasoning-text {
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.6;
  color: #606266;
  background: #fafafa;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
  border-top: 1px solid #e8e6f0;
}
</style>
