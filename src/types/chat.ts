// ===== 对话消息类型 =====

/** 消息角色 */
export type MessageRole = 'user' | 'assistant' | 'system'

/** 对话消息 */
export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  /** 是否为深度思考模式产生的回答 */
  deepThinking: boolean
  /** 深度思考的推理过程内容 */
  reasoningContent: string
  /** 消息时间戳 */
  timestamp: string
  /** 追问父消息ID，null 表示非追问 */
  followUpTo: string | null
  /** 该消息的追问链（子消息ID列表） */
  followUpIds: string[]
  /** 是否已收藏 */
  isFavorited: boolean
  /** 是否正在流式生成 */
  isStreaming: boolean
}

// ===== 对话会话类型 =====

/** 对话会话 */
export interface ChatSession {
  id: string
  /** 会话关联的文件路径（null 表示独立对话） */
  filePath: string | null
  /** 会话标题 */
  title: string
  messages: ChatMessage[]
  createdAt: string
  updatedAt: string
  /** 是否置顶 */
  pinned: boolean
  /** 所属文件夹ID（null 表示根目录） */
  folderId: string | null
}

// ===== 对话文件夹类型 =====

/** 对话文件夹 */
export interface ChatFolder {
  id: string
  name: string
  createdAt: string
}

// ===== AI 模型类型 =====

/** AI 模型配置 */
export interface AIModel {
  id: string
  name: string
  provider: 'deepseek' | 'openai' | 'custom'
  apiUrl: string
  apiKey: string
  /** 是否支持深度思考 */
  supportDeepThinking: boolean
  /** 是否为默认模型 */
  isDefault: boolean
  /** 模型参数名称（发送给 API 时使用的 model 值） */
  modelParam: string
}

// ===== 对话收藏类型 =====

/** 被收藏的对话条目 */
export interface ChatFavorite {
  id: string
  messageId: string
  sessionId: string
  /** 消息内容摘要 */
  content: string
  /** 用户问题 */
  question: string
  /** AI回答 */
  answer: string
  /** 收藏时间 */
  addedAt: string
  /** 关联文件路径 */
  filePath: string | null
  /** 使用的模型名称 */
  modelName: string
}

// ===== API 请求/响应类型 =====

/** 聊天补全请求 */
export interface ChatCompletionRequest {
  model: string
  messages: { role: MessageRole; content: string }[]
  stream: boolean
  temperature?: number
  max_tokens?: number
}

/** 聊天补全响应（非流式） */
export interface ChatCompletionResponse {
  id: string
  choices: {
    index: number
    message: { role: string; content: string }
    finish_reason: string
  }[]
}

/** 联网搜索上下文 */
export interface WebSearchContext {
  enabled: boolean
  query?: string
  results?: string
}

// ===== 文档交互类型 =====

/** 文档引用上下文 */
export interface DocumentContext {
  /** 嵌入到对话中的文档内容 */
  snippet: string
  /** 段落来源文件路径 */
  filePath: string
  /** 段落描述 */
  description: string
}

// ===== 默认 DeepSeek 模型 =====
export const DEFAULT_DEEPSEEK_MODEL: AIModel = {
  id: 'deepseek-default',
  name: 'DeepSeek V4 Pro',
  provider: 'deepseek',
  apiUrl: 'https://api.deepseek.com/chat/completions',
  apiKey: '',
  supportDeepThinking: true,
  isDefault: true,
  modelParam: 'deepseek-v4-pro'
}

/** DeepSeek 深度思考模型（旧版兼容） */
export const DEEPSEEK_REASONER_MODEL: AIModel = {
  id: 'deepseek-reasoner',
  name: 'DeepSeek Reasoner（深度思考）',
  provider: 'deepseek',
  apiUrl: 'https://api.deepseek.com/chat/completions',
  apiKey: '',
  supportDeepThinking: true,
  isDefault: false,
  modelParam: 'deepseek-reasoner'
}
