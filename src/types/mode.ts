/** 应用模式枚举 */
export type AppMode = 'basic' | 'unique' | 'creator' | 'automation'

/** 模式配置 */
export interface ModeConfig {
  key: AppMode
  label: string
  icon: string
  description: string
}

/** 模式配置列表 */
export const MODE_CONFIGS: ModeConfig[] = [
  { key: 'basic', label: '基础模式', icon: 'Edit', description: '文件编辑与管理' },
  { key: 'unique', label: '独特模式', icon: 'DataAnalysis', description: '账号分析与智能诊断' },
  { key: 'creator', label: '创作者模式', icon: 'VideoCamera', description: '视频剪切与工作流' },
  { key: 'automation', label: '自动化模式', icon: 'Connection', description: '无线画布自动化工作流' }
]
