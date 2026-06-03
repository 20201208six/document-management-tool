<template>
  <div
    class="chat-message"
    :class="{
      'message-user': message.role === 'user',
      'message-assistant': message.role === 'assistant',
      'message-streaming': message.isStreaming
    }"
  >
    <!-- 角色头像/图标 -->
    <div class="message-avatar">
      <el-icon v-if="message.role === 'user'" :size="18"><UserFilled /></el-icon>
      <el-icon v-else :size="18"><Cpu /></el-icon>
    </div>

    <!-- 消息内容区域 -->
    <div class="message-body">
      <!-- 消息头部 -->
      <div class="message-header">
        <span class="message-role">{{ message.role === 'user' ? '我' : 'AI 助手' }}</span>
        <span v-if="message.deepThinking" class="deep-thinking-badge">深度思考</span>
        <span class="message-time">{{ message.timestamp }}</span>
        <span v-if="message.isStreaming" class="streaming-indicator">
          <el-icon class="is-loading"><Loading /></el-icon> 生成中...
        </span>
      </div>

      <!-- 深度思考过程 -->
      <div
        v-if="message.deepThinking && (message.reasoningContent || message.isStreaming)"
        class="reasoning-section"
      >
        <div class="reasoning-toggle" @click="showReasoning = !showReasoning">
          <el-icon :class="{ rotated: showReasoning }">
            <ArrowRight />
          </el-icon>
          <span>思考过程</span>
          <span v-if="message.isStreaming" class="reasoning-badge streaming">
            <el-icon class="is-loading"><Loading /></el-icon> 
            思考中 ({{ (message.reasoningContent?.length || 0) }} 字符)...
          </span>
          <span v-else class="reasoning-badge">已完成</span>
        </div>
        <div v-show="showReasoning" class="reasoning-content">
          {{ message.reasoningContent || '正在分析...' }}
        </div>
      </div>

      <!-- 消息内容 -->
      <div class="message-content" v-html="renderedContent"></div>

      <!-- 操作按钮（仅AI消息） -->
      <div v-if="message.role === 'assistant' && !message.isStreaming" class="message-actions">
        <el-button size="small" text type="primary" @click="$emit('followUp', message.id)" title="追问">
          <el-icon><ChatLineSquare /></el-icon>
          追问
        </el-button>
        <el-button
          v-if="!message.isFavorited"
          size="small"
          text
          type="default"
          @click="$emit('favorite', message.id)"
          title="收藏"
        >
          <el-icon><Star /></el-icon>
          收藏
        </el-button>
        <el-button
          v-if="message.isFavorited"
          size="small"
          text
          type="warning"
          @click="$emit('unfavorite', message.id)"
          title="取消收藏"
        >
          <el-icon><StarFilled /></el-icon>
          已收藏
        </el-button>
        <el-button size="small" text type="danger" @click="$emit('delete', message.id)" title="删除">
          <el-icon><Delete /></el-icon>
          删除
        </el-button>
      </div>

      <!-- 追问链指示 -->
      <div v-if="message.followUpIds.length > 0" class="follow-up-chain">
        <el-tag size="small" type="info">
          <el-icon><Connection /></el-icon>
          {{ message.followUpIds.length }} 条追问
        </el-tag>
      </div>

      <!-- 删除按钮（用户消息） -->
      <div v-if="message.role === 'user' && !message.isStreaming" class="message-actions user-actions">
        <el-button size="small" text type="danger" @click="$emit('delete', message.id)" title="删除">
          <el-icon><Delete /></el-icon>
        </el-button>
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

/**
 * Markdown 渲染器：将 Markdown 文本转换为带样式的 HTML
 */
function renderMarkdown(text: string): string {
  // 第一步：保护代码块，防止被后续规则破坏
  const codeBlocks: string[] = []
  let html = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length
    const langTag = lang ? `<span class="code-lang">${escapeHtml(lang)}</span>` : ''
    codeBlocks.push(`<div class="code-block-wrapper">${langTag}<pre><code>${escapeHtml(code.trimEnd())}</code></pre></div>`)
    return `%%CODEBLOCK_${idx}%%`
  })

  // 第二步：表格（在行级处理之前）
  html = renderTables(html)

  // 第三步：水平线
  html = html.replace(/^[-*_]{3,}\s*$/gm, '<hr>')

  // 第四步：标题（## Title）
  html = html.replace(/^###### (.+)$/gm, '<h6>$1</h6>')
  html = html.replace(/^##### (.+)$/gm, '<h5>$1</h5>')
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>')
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>')

  // 第五步：块引用（支持嵌套 >）
  html = renderBlockquotes(html)

  // 第六步：无序列表
  html = renderUnorderedLists(html)

  // 第七步：有序列表
  html = renderOrderedLists(html)

  // 第八步：段落（连续文本行合并为 <p>）
  html = html.replace(/\n{2,}/g, '\n\n')
  const blocks = html.split('\n\n')
  html = blocks.map(block => {
    const trimmed = block.trim()
    if (!trimmed) return ''
    // 已经是块级元素的跳过
    if (/^<(h[1-6]|ul|ol|blockquote|table|div|hr|pre|\/)[^>]*>/.test(trimmed)) return trimmed
    // 段落
    return `<p>${trimmed}</p>`
  }).join('\n')

  // 第九步：行内格式
  html = renderInline(html)

  // 第十步：恢复代码块
  html = html.replace(/%%CODEBLOCK_(\d+)%%/g, (_, idx) => codeBlocks[parseInt(idx)])

  return html
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 渲染表格 */
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

/** 渲染块引用 */
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
      if (inQuote) {
        result.push(`<blockquote><p>${quoteLines.join('<br>')}</p></blockquote>`)
        quoteLines = []
        inQuote = false
      }
      result.push(line)
    }
  }
  if (inQuote) {
    result.push(`<blockquote><p>${quoteLines.join('<br>')}</p></blockquote>`)
  }
  return result.join('\n')
}

/** 渲染无序列表 */
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
      if (inList) {
        result.push(`<ul>${listItems.join('')}</ul>`)
        listItems = []
        inList = false
      }
      result.push(line)
    }
  }
  if (inList) {
    result.push(`<ul>${listItems.join('')}</ul>`)
  }
  return result.join('\n')
}

/** 渲染有序列表 */
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
      if (inList) {
        result.push(`<ol>${listItems.join('')}</ol>`)
        listItems = []
        inList = false
      }
      result.push(line)
    }
  }
  if (inList) {
    result.push(`<ol>${listItems.join('')}</ol>`)
  }
  return result.join('\n')
}

/** 渲染行内格式 */
function renderInline(text: string): string {
  // 图片 ![alt](url)
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" title="$1">')
  // 链接 [text](url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
  // 粗体+斜体 ***text***
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
  // 粗体 **text**
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  // 斜体 *text*
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>')
  // 删除线 ~~text~~
  text = text.replace(/~~(.+?)~~/g, '<del>$1</del>')
  // 行内代码 `code`
  text = text.replace(/`([^`\n]+)`/g, '<code>$1</code>')
  // 换行
  text = text.replace(/\n/g, '<br>')
  return text
}
</script>

<style scoped>
.chat-message {
  display: flex;
  gap: 10px;
  padding: 12px 0;
  border-bottom: 1px solid #f0f2f5;
}

.chat-message:last-child {
  border-bottom: none;
}

.message-avatar {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
}

.message-user .message-avatar {
  background: #e6f4ff;
  color: #409eff;
}

.message-assistant .message-avatar {
  background: #f0f5ff;
  color: #7c5cfc;
}

.message-body {
  flex: 1;
  min-width: 0;
}

.message-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.message-role {
  font-weight: 600;
  font-size: 13px;
  color: #303133;
}

.message-time {
  font-size: 11px;
  color: #c0c4cc;
  margin-left: auto;
}

.deep-thinking-badge {
  font-size: 11px;
  color: #7c5cfc;
  background: #f3f0ff;
  padding: 1px 6px;
  border-radius: 3px;
}

.streaming-indicator {
  font-size: 11px;
  color: #909399;
  display: flex;
  align-items: center;
  gap: 4px;
}

.message-content {
  font-size: var(--msg-font-size, 14px);
  line-height: var(--msg-line-height, 1.7);
  color: #303133;
  word-break: break-word;
  font-family: var(--msg-font-family, 'Microsoft YaHei', 'PingFang SC', sans-serif);
}

/* ===== Markdown 块级元素样式 ===== */

.message-content :deep(p) {
  margin: 0 0 var(--msg-paragraph-spacing, 8px);
}

.message-content :deep(p:last-child) {
  margin-bottom: 0;
}

.message-content :deep(h1) {
  font-size: calc(var(--msg-font-size, 14px) + 6px);
  font-weight: 700;
  margin: calc(var(--msg-paragraph-spacing, 8px) * 2) 0 var(--msg-paragraph-spacing, 8px);
  padding-bottom: 6px;
  border-bottom: 1px solid #eee;
}

.message-content :deep(h2) {
  font-size: calc(var(--msg-font-size, 14px) + 4px);
  font-weight: 700;
  margin: calc(var(--msg-paragraph-spacing, 8px) * 1.75) 0 calc(var(--msg-paragraph-spacing, 8px) * 0.75);
  padding-bottom: 4px;
  border-bottom: 1px solid #f0f0f0;
}

.message-content :deep(h3) {
  font-size: calc(var(--msg-font-size, 14px) + 2px);
  font-weight: 600;
  margin: calc(var(--msg-paragraph-spacing, 8px) * 1.5) 0 calc(var(--msg-paragraph-spacing, 8px) * 0.75);
}

.message-content :deep(h4) {
  font-size: calc(var(--msg-font-size, 14px) + 1px);
  font-weight: 600;
  margin: calc(var(--msg-paragraph-spacing, 8px) * 1.25) 0 calc(var(--msg-paragraph-spacing, 8px) * 0.5);
}

.message-content :deep(h5),
.message-content :deep(h6) {
  font-size: var(--msg-font-size, 14px);
  font-weight: 600;
  margin: var(--msg-paragraph-spacing, 8px) 0 calc(var(--msg-paragraph-spacing, 8px) * 0.5);
  color: #606266;
}

/* 块引用 */
.message-content :deep(blockquote) {
  margin: var(--msg-paragraph-spacing, 8px) 0;
  padding: calc(var(--msg-paragraph-spacing, 8px) * 1) calc(var(--msg-paragraph-spacing, 8px) * 1.75);
  border-left: 3px solid #409eff;
  background: #f5f7fa;
  color: #606266;
  border-radius: 0 4px 4px 0;
}

.message-content :deep(blockquote p) {
  margin: 0;
}

/* 代码块 */
.message-content :deep(.code-block-wrapper) {
  position: relative;
  margin: var(--msg-paragraph-spacing, 8px) 0;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid #e4e7ed;
}

.message-content :deep(.code-lang) {
  position: absolute;
  top: 0;
  right: 0;
  font-size: 11px;
  color: #909399;
  background: #f5f7fa;
  padding: 2px 8px;
  border-radius: 0 0 0 6px;
  border-left: 1px solid #e4e7ed;
  border-bottom: 1px solid #e4e7ed;
  font-family: Consolas, monospace;
}

.message-content :deep(pre) {
  background: #f8f9fb;
  padding: 12px 14px;
  padding-top: 10px;
  overflow-x: auto;
  margin: 0;
  font-size: calc(var(--msg-font-size, 14px) - 1px);
  line-height: 1.6;
}

.message-content :deep(code) {
  background: #f0f2f5;
  padding: 1px 5px;
  border-radius: 3px;
  font-family: Consolas, 'Courier New', monospace;
  font-size: calc(var(--msg-font-size, 14px) - 1px);
  color: #e74c3c;
}

.message-content :deep(pre code) {
  background: none;
  padding: 0;
  color: #303133;
  font-size: inherit;
}

/* 列表 */
.message-content :deep(ul),
.message-content :deep(ol) {
  margin: calc(var(--msg-paragraph-spacing, 8px) * 0.5) 0 var(--msg-paragraph-spacing, 8px);
  padding-left: 20px;
}

.message-content :deep(li) {
  margin-bottom: 2px;
}

.message-content :deep(ul li) {
  list-style-type: disc;
}

.message-content :deep(ol li) {
  list-style-type: decimal;
}

.message-content :deep(li p) {
  margin: 0;
}

/* 表格 */
.message-content :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: var(--msg-paragraph-spacing, 8px) 0;
  font-size: calc(var(--msg-font-size, 14px) - 1px);
}

.message-content :deep(th) {
  background: #f5f7fa;
  font-weight: 600;
  text-align: left;
  padding: calc(var(--msg-paragraph-spacing, 8px) * 1) calc(var(--msg-paragraph-spacing, 8px) * 1.5);
  border: 1px solid #e4e7ed;
  color: #303133;
}

.message-content :deep(td) {
  padding: calc(var(--msg-paragraph-spacing, 8px) * 0.75) calc(var(--msg-paragraph-spacing, 8px) * 1.5);
  border: 1px solid #e4e7ed;
  color: #606266;
}

.message-content :deep(tr:hover td) {
  background: #fafbfc;
}

/* 水平线 */
.message-content :deep(hr) {
  border: none;
  border-top: 1px solid #e4e7ed;
  margin: calc(var(--msg-paragraph-spacing, 8px) * 1.5) 0;
}

/* 行内格式 */
.message-content :deep(strong) {
  font-weight: 700;
}

.message-content :deep(em) {
  font-style: italic;
}

.message-content :deep(del) {
  text-decoration: line-through;
  color: #909399;
}

/* 链接 */
.message-content :deep(a) {
  color: #409eff;
  text-decoration: none;
}

.message-content :deep(a:hover) {
  text-decoration: underline;
}

/* 图片 */
.message-content :deep(img) {
  max-width: 100%;
  border-radius: 4px;
  margin: 8px 0;
}

/* 无内容时 */
.message-content:empty::after {
  content: none;
}

.thinking-text {
  color: #909399;
  font-style: italic;
}

.message-actions {
  display: flex;
  gap: 4px;
  margin-top: 6px;
  opacity: 0.6;
  transition: opacity 0.2s;
}

.chat-message:hover .message-actions {
  opacity: 1;
}

.user-actions {
  justify-content: flex-end;
}

.follow-up-chain {
  margin-top: 6px;
}

.message-streaming .message-content {
  color: #606266;
}

/* 深度思考过程 */
.reasoning-section {
  margin-bottom: 8px;
  border: 1px solid #e8e6f0;
  border-radius: 6px;
  overflow: hidden;
}

.reasoning-toggle {
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

.reasoning-toggle:hover {
  background: #f0edfa;
}

.reasoning-toggle .el-icon {
  transition: transform 0.2s;
  font-size: 14px;
}

.reasoning-toggle .el-icon.rotated {
  transform: rotate(90deg);
}

.reasoning-badge {
  margin-left: auto;
  font-size: 11px;
  color: #b0a8d4;
  background: #edeaf7;
  padding: 1px 6px;
  border-radius: 3px;
}

.reasoning-badge.streaming {
  color: #909399;
  background: #f0f2f5;
}

.reasoning-content {
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
