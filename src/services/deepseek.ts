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

/**
 * 构建系统提示词（仅角色定义 + 行为准则，不放数据）
 * 所有数据类上下文统一通过 buildUserContext 注入到用户消息中，
 * 避免 System Prompt 膨胀导致角色定位被稀释。
 */
function buildSystemPrompt(deepThinking: boolean): string {
  let prompt = `你是一个专业的文案创作助手，帮助用户分析、撰写和优化各类文案内容。

行为准则：
1. 回答要具体、可落地，提供实际可用的文案示例，避免空泛套话
2. 如果用户提供了参考资料（文档/文件/搜索结果），优先基于这些素材回答并注明来源
3. 如果需要更多信息才能给出好答案，主动向用户询问
4. 用与用户消息相同的语言风格回复
5. 文案例子应注明适用场景（如：适合抖音口播 / 适合公众号推文 / 适合产品详情页）`
  
  if (deepThinking) {
    prompt += `\n\n推理要求：回答前简要分析受众、风格、结构三个核心维度，推理过程简洁直接，避免过度展开。`
  }
  return prompt
}

/**
 * 构建用户侧上下文（文档引用 + 联网搜索结果）
 * 统一放在用户消息头部，与 System Prompt 职责分离。
 */
function buildUserContext(options: {
  documentContext?: string
  webResults?: string
}): string {
  let ctx = ''
  if (options.documentContext) {
    ctx += `[参考文档]\n${options.documentContext}\n\n`
  }
  if (options.webResults) {
    ctx += `[联网搜索结果]\n${options.webResults}\n\n`
  }
  return ctx ? ctx + '---\n请基于以上参考资料回答：\n' : ''
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

  // System 只放角色定义，不放数据
  const systemPrompt = buildSystemPrompt(deepThinking)
  const apiMessages = buildApiMessages(messageHistory, systemPrompt)

  // 数据类上下文统一注入到用户消息侧
  const userCtx = buildUserContext({
    documentContext,
    webResults: webSearch?.results
  })
  if (userCtx && apiMessages.length > 0) {
    const lastUserIdx = apiMessages.map(m => m.role).lastIndexOf('user')
    if (lastUserIdx >= 0) {
      apiMessages[lastUserIdx].content = userCtx + apiMessages[lastUserIdx].content
    }
  }

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
    if (deepThinking) {
      body.thinking = { type: 'enabled' }
      body.reasoning_effort = 'high'
    } else {
      body.thinking = { type: 'disabled' }
      body.temperature = 1.0
    }
  } else {
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

  // System 只放角色定义，不放数据
  const systemPrompt = buildSystemPrompt(deepThinking)
  const apiMessages = buildApiMessages(messageHistory, systemPrompt)

  // 数据类上下文统一注入到用户消息侧
  const userCtx = buildUserContext({
    documentContext,
    webResults: webSearch?.results
  })
  if (userCtx && apiMessages.length > 0) {
    const lastUserIdx = apiMessages.map(m => m.role).lastIndexOf('user')
    if (lastUserIdx >= 0) {
      apiMessages[lastUserIdx].content = userCtx + apiMessages[lastUserIdx].content
    }
  }

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

/**
 * 查询扩展：将用户输入的关键词扩展为 3-5 个语义相关的变体，
 * 用于提升全局搜索的召回率。
 * 返回空数组表示扩展失败（调用方应回退到原始关键词）。
 */
export async function expandQuery(model: Pick<AIModel, 'apiUrl' | 'apiKey' | 'modelParam'>, keyword: string): Promise<string[]> {
  if (!model.apiKey || !keyword.trim()) return []
  try {
    const response = await fetch(model.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${model.apiKey}`
      },
      body: JSON.stringify({
        model: model.modelParam,
        messages: [
          { role: 'system', content: '你是一个搜索关键词扩展助手。将用户输入扩展为3-5个语义相关的搜索词，每行一个。只输出搜索词，不要任何解释。' },
          { role: 'user', content: `将以下搜索词扩展为3-5个同义或相关的搜索词：${keyword}` }
        ],
        max_tokens: 80,
        temperature: 0.3
      }),
      signal: AbortSignal.timeout(8000)
    })
    if (!response.ok) return []
    const data = await response.json()
    const text = data.choices?.[0]?.message?.content?.trim()
    if (!text) return []
    // 解析每行，过滤空行和原关键词
    const terms: string[] = text.split('\n')
      .map((t: string) => t.replace(/^[\d.\s\-•]+\s*/, '').trim())
      .filter((t: string) => !!(t && t !== keyword && t.length >= 2)) as string[]
    const uniqueTerms = Array.from(new Set(terms)).slice(0, 5)
    return uniqueTerms
  } catch {
    return []
  }
}

/**
 * 查询改写：将用户的简略追问消解为完整问题。
 * 当用户消息很短（< 7 字）且有上一轮对话上下文时调用。
 * 消解"它""这个""那"等指代词，补全省略信息。
 * 返回改写后的完整问题，或原始消息（改写失败时）。
 */
export async function rewriteShortQuery(
  model: Pick<AIModel, 'apiUrl' | 'apiKey' | 'modelParam'>,
  userMessage: string,
  lastMessages: { role: string; content: string }[]
): Promise<string> {
  if (userMessage.length >= 7) return userMessage
  if (lastMessages.length < 2) return userMessage
  if (!model.apiKey) return userMessage

  const context = lastMessages.slice(-3).map(m => `${m.role}: ${m.content.slice(0, 200)}`).join('\n')
  try {
    const response = await fetch(model.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${model.apiKey}`
      },
      body: JSON.stringify({
        model: model.modelParam,
        messages: [
          { role: 'system', content: '将用户的简略追问改写为完整问题。结合前文对话上下文，消解"它""这个""那""他""她"等指代词。只输出改写后的一句话问题，不要解释，不要加标点外的任何内容。' },
          { role: 'user', content: `前文对话：\n${context}\n\n简略追问：${userMessage}\n\n完整问题：` }
        ],
        max_tokens: 100,
        temperature: 0
      }),
      signal: AbortSignal.timeout(5000)
    })
    if (!response.ok) return userMessage
    const data = await response.json()
    const rewritten = data.choices?.[0]?.message?.content?.trim()
    return (rewritten && rewritten.length >= 3) ? rewritten : userMessage
  } catch {
    return userMessage
  }
}

/**
 * 文本嵌入：将文本转换为向量表示。
 * 使用 OpenAI 兼容的 /v1/embeddings 端点。
 * 部分模型（如 DeepSeek）可能需要单独的 embedding 模型端点。
 */
export async function computeEmbedding(
  text: string,
  model: Pick<AIModel, 'apiUrl' | 'apiKey'>,
  modelParam = 'text-embedding-3-small'
): Promise<number[] | null> {
  if (!model.apiKey || !text.trim()) return null
  try {
    // 将 /chat/completions 替换为 /embeddings
    const embeddingUrl = model.apiUrl.replace(/\/chat\/completions$/, '/embeddings')
    const response = await fetch(embeddingUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${model.apiKey}`
      },
      body: JSON.stringify({
        model: modelParam,
        input: text.slice(0, 8000) // 限制输入长度
      }),
      signal: AbortSignal.timeout(15000)
    })
    if (!response.ok) return null
    const data = await response.json()
    return data.data?.[0]?.embedding || null
  } catch {
    return null
  }
}

/**
 * 余弦相似度计算
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

/**
 * 在样本库中找到与目标文本最相似的 Top-K 条记录
 */
export function findSimilar(
  targetEmbedding: number[],
  samples: { embedding: number[]; id: string; content: string }[],
  topK = 5
): { id: string; content: string; similarity: number }[] {
  return samples
    .filter(s => s.embedding && s.embedding.length > 0)
    .map(s => ({
      id: s.id,
      content: s.content.slice(0, 200),
      similarity: cosineSimilarity(targetEmbedding, s.embedding)
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK)
    .filter(s => s.similarity > 0.3) // 相似度阈值
}
