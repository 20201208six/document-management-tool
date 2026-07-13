/**
 * useStreamChat - 统一的流式聊天 Composable
 *
 * 封装 DeepSeek API 流式调用逻辑，提供：
 * - 统一的流处理（节流 + 打字机友好）
 * - 取消、超时、错误分类
 * - rAF 批量更新减少渲染抖动
 *
 * 聊天和 Unique Mode 评分复用同一个流处理器。
 */
import { ref } from 'vue'
import type { AIModel, ChatMessage, WebSearchContext } from '@/types/chat'
import { sendChatMessageStream } from '@/services/deepseek'

export interface StreamCallbacks {
  onChunk: (chunk: string) => void
  onReasoning?: (chunk: string) => void
  onDone: () => void
  onError: (error: StreamError) => void
}

export interface StreamError {
  type: 'timeout' | 'cancelled' | 'network' | 'api' | 'unknown'
  message: string
}

export function useStreamChat() {
  const isStreaming = ref(false)
  let abortController: AbortController | null = null
  let cancelledByUser = false

  /**
   * 开始流式对话
   */
  async function startStream(
    model: AIModel,
    messages: ChatMessage[],
    callbacks: StreamCallbacks,
    options: {
      deepThinking?: boolean
      documentContext?: string
      webSearch?: WebSearchContext
    } = {}
  ): Promise<void> {
    if (isStreaming.value) {
      console.warn('[useStreamChat] 已有流在进行中，忽略')
      return
    }

    isStreaming.value = true
    cancelledByUser = false
    abortController = new AbortController()

    // 节流：rAF 批量更新
    let rafId = 0
    let pendingChunk = ''
    let pendingReasoning = ''

    function flush() {
      if (rafId) return
      rafId = requestAnimationFrame(() => {
        rafId = 0
        if (pendingChunk) {
          callbacks.onChunk(pendingChunk)
          pendingChunk = ''
        }
        if (pendingReasoning && callbacks.onReasoning) {
          callbacks.onReasoning(pendingReasoning)
          pendingReasoning = ''
        }
      })
    }

    try {
      await sendChatMessageStream(
        model,
        messages,
        (chunk: string) => {
          pendingChunk += chunk
          flush()
        },
        () => {
          if (rafId) { cancelAnimationFrame(rafId); rafId = 0 }
          // 发送剩余数据
          if (pendingChunk) callbacks.onChunk(pendingChunk)
          if (pendingReasoning && callbacks.onReasoning) callbacks.onReasoning(pendingReasoning)
          isStreaming.value = false
          abortController = null
          if (!cancelledByUser) callbacks.onDone()
        },
        (error: Error) => {
          if (rafId) { cancelAnimationFrame(rafId); rafId = 0 }
          if (pendingChunk) callbacks.onChunk(pendingChunk)
          isStreaming.value = false
          abortController = null
          if (cancelledByUser) return

          const streamErr = classifyError(error)
          callbacks.onError(streamErr)
        },
        options,
        abortController.signal,
        (reasoning: string) => {
          pendingReasoning += reasoning
          flush()
        }
      )
    } catch (e: any) {
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0 }
      isStreaming.value = false
      abortController = null
      if (cancelledByUser) return
      callbacks.onError(classifyError(e))
    }
  }

  /** 停止流式生成 */
  function stopStream() {
    cancelledByUser = true
    if (abortController) {
      abortController.abort()
      abortController = null
    }
    isStreaming.value = false
  }

  return { isStreaming, startStream, stopStream }
}

/**
 * 统一错误分类
 */
function classifyError(e: Error): StreamError {
  const msg = e.message || ''

  if (e.name === 'AbortError') {
    return { type: 'cancelled', message: '请求已取消' }
  }
  if (msg.includes('timeout') || msg.includes('超时')) {
    return { type: 'timeout', message: '请求超时，请稍后重试' }
  }
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('network')) {
    return { type: 'network', message: '网络连接失败，请检查网络后重试' }
  }
  if (msg.includes('401') || msg.includes('403')) {
    return { type: 'api', message: 'API Key 无效或已过期，请检查模型设置' }
  }
  if (msg.includes('429')) {
    return { type: 'api', message: 'API 请求频率过高，请稍后重试' }
  }
  if (msg.includes('413')) {
    return { type: 'api', message: '上下文过长，请缩短输入或开启新对话' }
  }
  if (msg.includes('5') && /\b5\d{2}\b/.test(msg)) {
    return { type: 'api', message: '服务器内部错误，请稍后重试' }
  }
  if (msg.includes('API 请求失败') || msg.includes('返回数据格式错误')) {
    return { type: 'api', message: msg }
  }
  return { type: 'unknown', message: msg || '未知错误' }
}
