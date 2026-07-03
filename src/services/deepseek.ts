/**
 * DeepSeek API 服务层
 * 提供基础对话、深度思考、流式响应、联网搜索、文件分析等功能
 */
import type { AIModel, ChatMessage, ChatCompletionResponse, WebSearchContext } from '@/types/chat'

/** 生成唯一ID */
export function generateId(): string {
  return 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9)
}

/**
 * 构建 V4 模型请求体。
 * DeepSeek V4 系列模型（modelParam 含 "v4"）需要 thinking 参数，
 * 非 V4 模型走旧的 temperature/max_tokens 逻辑。
 */
export function buildModelRequestBody(model: Pick<AIModel, 'provider' | 'modelParam'>, options: {
  messages: { role: string; content: string }[]
  temperature?: number
  max_tokens?: number
  stream?: boolean
  deepThinking?: boolean
}): { url: string; body: Record<string, any> } {
  const isV4 = model.modelParam.includes('v4')
  const modelParam = !isV4 && options.deepThinking && model.provider === 'deepseek'
    ? 'deepseek-reasoner'
    : model.modelParam

  const body: Record<string, any> = {
    model: modelParam,
    messages: options.messages,
    stream: options.stream ?? false
  }

  if (isV4) {
    if (options.deepThinking) {
      body.thinking = { type: 'enabled' }
      body.reasoning_effort = 'high'
    } else {
      body.thinking = { type: 'disabled' }
      if (options.temperature !== undefined) body.temperature = options.temperature
    }
    if (options.max_tokens !== undefined && !options.deepThinking) {
      body.max_tokens = options.max_tokens
    }
  } else {
    if (options.temperature !== undefined) body.temperature = options.temperature
    body.max_tokens = options.max_tokens ?? 2048
  }

  return { url: '', body }
}

/** 从消息数组中提取 API 所需的消息格式 */
function buildApiMessages(messages: ChatMessage[], systemPrompt?: string) {
  const apiMessages: { role: string; content: string }[] = []
  if (systemPrompt) {
    apiMessages.push({ role: 'system', content: systemPrompt })
  }
  for (const msg of messages) {
    apiMessages.push({ role: msg.role, content: msg.content })
  }
  return apiMessages
}

/** 构建系统提示词 */
function buildSystemPrompt(deepThinking: boolean, documentContext?: string, webResults?: string): string {
  let prompt = '你是一个专业的文案创作助手，帮助用户分析、撰写和优化各类文案内容。'
  if (deepThinking) {
    // 精简思考指令：聚焦核心维度，减少无意义的发散
    prompt += '请在回答前简要推理分析（考虑受众、风格、结构三个核心维度），然后给出精炼实用的建议。注意：推理过程应简洁直接，避免过度展开。'
  }
  if (documentContext) {
    prompt += `\n\n用户当前编辑的文档内容：\n\n${documentContext}`
  }
  if (webResults) {
    prompt += `\n\n互联网最新相关信息：\n\n${webResults}`
  }
  return prompt
}

/**
 * 发送聊天消息（非流式）
 */
export async function sendChatMessage(
  model: AIModel,
  messageHistory: ChatMessage[],
  options: {
    deepThinking?: boolean
    documentContext?: string
    webSearch?: WebSearchContext
  } = {}
): Promise<string> {
  const { deepThinking = false, documentContext, webSearch } = options

  const systemPrompt = buildSystemPrompt(deepThinking, documentContext, webSearch?.results)
  const apiMessages = buildApiMessages(messageHistory, systemPrompt)

  // V4 模型通过 thinking 参数控制思考模式，旧模型切换到 deepseek-reasoner
  const isV4 = model.modelParam.includes('v4')
  const modelParam = !isV4 && deepThinking && model.provider === 'deepseek'
    ? 'deepseek-reasoner'
    : model.modelParam

  const body: Record<string, any> = {
    model: modelParam,
    messages: apiMessages,
    stream: false
  }

  if (isV4) {
    // V4: 使用 thinking 对象控制，默认 disabled 保证非思考模式速度
    if (deepThinking) {
      body.thinking = { type: 'enabled' }
      body.reasoning_effort = 'high'
      // 思考模式不支持 temperature/top_p，不传
    } else {
      body.thinking = { type: 'disabled' }
      body.temperature = 1.0
    }
  } else {
    // 旧模型
    body.temperature = deepThinking ? 0.3 : 1.0
    body.max_tokens = deepThinking ? 4096 : 2048
  }

  const response = await fetch(model.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${model.apiKey}`
    },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}))
    throw new Error(errData.error?.message || `API 请求失败: ${response.status}`)
  }

  const data: ChatCompletionResponse = await response.json()
  if (data.choices && data.choices.length > 0) {
    return data.choices[0].message.content
  }
  throw new Error('API 返回数据格式错误')
}

/**
 * 发送聊天消息（流式），通过回调逐步返回内容
 * 返回完整的最终内容
 */
export async function sendChatMessageStream(
  model: AIModel,
  messageHistory: ChatMessage[],
  onChunk: (chunk: string) => void,
  onDone: () => void,
  onError: (error: Error) => void,
  options: {
    deepThinking?: boolean
    documentContext?: string
    webSearch?: WebSearchContext
  } = {},
  abortSignal?: AbortSignal,
  onReasoning?: (chunk: string) => void
): Promise<void> {
  const { deepThinking = false, documentContext, webSearch } = options

  const systemPrompt = buildSystemPrompt(deepThinking, documentContext, webSearch?.results)
  const apiMessages = buildApiMessages(messageHistory, systemPrompt)

  // V4 模型通过 thinking 参数控制思考模式，旧模型切换到 deepseek-reasoner
  const isV4 = model.modelParam.includes('v4')
  const modelParam = !isV4 && deepThinking && model.provider === 'deepseek'
    ? 'deepseek-reasoner'
    : model.modelParam

  // 超时控制：非思考 60s，思考模式 180s
  const timeoutMs = deepThinking ? 180_000 : 60_000
  const timeoutController = new AbortController()
  const timeoutId = setTimeout(() => {
    console.error('[DeepSeek] 请求超时 (%ds)，主动中止', timeoutMs / 1000)
    timeoutController.abort()
  }, timeoutMs)

  // 监听外部 abort 信号（用户点击停止按钮）
  const onExternalAbort = () => {
    console.error('[DeepSeek] 用户中止请求')
    timeoutController.abort()
  }
  abortSignal?.addEventListener('abort', onExternalAbort)

  // 清理函数：在退出时清理定时器和事件监听
  function cleanup() {
    clearTimeout(timeoutId)
    abortSignal?.removeEventListener('abort', onExternalAbort)
  }

  try {
    const body: Record<string, any> = {
      model: modelParam,
      messages: apiMessages,
      stream: true
    }

    if (isV4) {
      // V4: 使用 thinking 对象控制，默认 disabled 保证非思考模式速度
      if (deepThinking) {
        body.thinking = { type: 'enabled' }
        body.reasoning_effort = 'high'
        // 思考模式不支持 temperature/top_p，不传
      } else {
        body.thinking = { type: 'disabled' }
        body.temperature = 1.0
      }
    } else {
      // 旧模型
      body.temperature = deepThinking ? 0.3 : 1.0
      body.max_tokens = deepThinking ? 4096 : 2048
    }

    console.error('[DeepSeek] 发起请求', {
      model: body.model,
      thinking: body.thinking,
      stream: body.stream,
      messagesCount: body.messages.length
    })

    const response = await fetch(model.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${model.apiKey}`
      },
      body: JSON.stringify(body),
      signal: timeoutController.signal
    })

    console.error('[DeepSeek] 收到响应，状态码:', response.status)

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}))
      const errMsg = errData.error?.message || `API 请求失败: ${response.status}`
      console.error('[DeepSeek] API 错误:', errMsg, errData)
      cleanup()
      throw new Error(errMsg)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      cleanup()
      throw new Error('无法获取响应流')
    }

    // 当外部触发 abort 时，同步取消 reader，保证停止按钮即时生效
    let readerCancelled = false
    const onReaderAbort = () => {
      readerCancelled = true
      reader.cancel().catch(() => {})
    }
    timeoutController.signal.addEventListener('abort', onReaderAbort)

    console.error('[DeepSeek] 开始读取流式数据...')

    const decoder = new TextDecoder()
    let buffer = ''
    let chunkCount = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done || readerCancelled) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        const dataStr = trimmed.slice(6)
        if (dataStr === '[DONE]') {
          console.error('[DeepSeek] 流式输出完成, 共 %d 个 chunk', chunkCount)
          cleanup()
          onDone()
          return
        }
        try {
          const parsed = JSON.parse(dataStr)
          const delta = parsed.choices?.[0]?.delta
          if (delta?.reasoning_content && onReasoning) {
            chunkCount++
            onReasoning(delta.reasoning_content)
          }
          if (delta?.content) {
            chunkCount++
            onChunk(delta.content)
          }
        } catch {
          // 跳过无法解析的行（如初始的空 data 行）
        }
      }
    }

    // 处理缓冲区中剩余的数据
    if (!readerCancelled && buffer.trim()) {
      const trimmed = buffer.trim()
      if (trimmed.startsWith('data: ') && trimmed.slice(6) !== '[DONE]') {
        try {
          const parsed = JSON.parse(trimmed.slice(6))
          const delta = parsed.choices?.[0]?.delta
          if (delta?.reasoning_content && onReasoning) onReasoning(delta.reasoning_content)
          if (delta?.content) onChunk(delta.content)
        } catch { /* ignore */ }
      }
    }

    console.error('[DeepSeek] 流读取结束, readerCancelled=%s', readerCancelled)
    cleanup()
    onDone()
  } catch (e: any) {
    cleanup()
    if (e.name === 'AbortError') {
      console.error('[DeepSeek] 请求被中止 (AbortError)')
      onDone()
      return
    }
    console.error('[DeepSeek] 请求异常:', e.message || e)
    onError(e instanceof Error ? e : new Error(e.message || '网络请求失败'))
  }
}

/**
 * 联网搜索（通过公开搜索引擎获取摘要）
 * 注：这是一个简化实现，实际项目中可替换为专业的搜索 API
 */
export async function performWebSearch(query: string): Promise<string> {
  try {
    // 使用 DuckDuckGo Instant Answer API（无需 API Key）
    const response = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
      { signal: AbortSignal.timeout(10000) }
    )
    const data = await response.json()

    let result = ''
    if (data.AbstractText) {
      result += `摘要: ${data.AbstractText}\n`
    }
    if (data.RelatedTopics && data.RelatedTopics.length > 0) {
      const topics = data.RelatedTopics.slice(0, 5)
        .filter((t: any) => t.Text)
        .map((t: any, i: number) => `${i + 1}. ${t.Text}`)
      if (topics.length > 0) {
        result += `相关信息:\n${topics.join('\n')}`
      }
    }
    return result || '未找到相关的搜索结果'
  } catch {
    return '搜索请求超时或失败，请稍后重试'
  }
}

/**
 * 分析上传文件内容
 */
export function analyzeFileContent(fileContent: string, fileName: string, userQuery: string): string {
  let prompt = `用户上传了文件「${fileName}」，内容如下：\n\n`
  // 限制文件内容长度，避免超过 token 限制
  const maxContentLength = 8000
  if (fileContent.length > maxContentLength) {
    prompt += fileContent.substring(0, maxContentLength) + '\n\n...（文件内容过长，已截断）'
  } else {
    prompt += fileContent
  }
  prompt += `\n\n用户的问题：${userQuery}\n请基于以上文件内容进行分析和回答。`
  return prompt
}
