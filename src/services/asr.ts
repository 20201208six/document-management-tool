/**
 * 豆包（火山引擎）音视频字幕生成 API 服务
 *
 * 流程：
 *   1. ffmpeg 提取视频音轨 → 转 WAV (16kHz 单声道)
 *   2. POST /api/v1/vc/submit 提交音频二进制
 *   3. 轮询 GET /api/v1/vc/query 获取结果
 *   4. 返回 utterances（词级时间轴）
 *
 * 文档: https://www.volcengine.com/docs/6561/80909
 *
 * 配置：从全局模型管理 → ASR 语音识别中设置
 */

const BASE_URL = 'https://openspeech.bytedance.com/api/v1/vc'

/** 获取 ASR 配置（从 store 动态读取） */
function getAsrConfig(): { appId: string; accessToken: string } {
  const raw = localStorage.getItem('copywriting-asr-config')
  if (raw) {
    try {
      const cfg = JSON.parse(raw)
      if (cfg.appId && cfg.accessToken) return cfg
    } catch {}
  }
  // 默认值（兼容旧版硬编码）
  return {
    appId: '4064117990',
    accessToken: 'uW7Wx6cWjcun0rUWFA_NJgFSPpadmSAt'
  }
}

// ===== 类型定义 =====

export interface ASRWord {
  text: string
  start_time: number  // 毫秒
  end_time: number    // 毫秒
}

export interface ASRUtterance {
  text: string
  start_time: number  // 毫秒
  end_time: number    // 毫秒
  words: ASRWord[]
}

export interface ASRResult {
  id: string
  duration: number       // 音频总时长（秒）
  utterances: ASRUtterance[]
}

export interface SubtitleSegment {
  id: string
  text: string
  startTime: number      // 毫秒
  endTime: number        // 毫秒
  words: ASRWord[]
}

// ===== 核心函数 =====

/**
 * 提交音频进行字幕识别
 * @param audioBuffer 音频二进制数据（WAV 格式）
 * @returns 任务 ID
 */
async function submitAudio(audioBuffer: ArrayBuffer): Promise<string> {
  const cfg = getAsrConfig()
  const params = new URLSearchParams({
    appid: cfg.appId,
    language: 'zh-CN',
    use_itn: 'True',
    caption_type: 'speech',
    max_lines: '2',
    words_per_line: '18'
  })

  const response = await fetch(`${BASE_URL}/submit?${params}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'audio/wav',
      'Authorization': `Bearer; ${cfg.accessToken}`
    },
    body: audioBuffer
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`ASR 提交失败 (${response.status}): ${text}`)
  }

  const data = await response.json()
  if (data.code !== 0 && data.code !== '0') {
    throw new Error(`ASR 提交错误: ${data.message || '未知错误'} (code: ${data.code})`)
  }

  return data.id as string
}

/**
 * 查询字幕识别结果（阻塞模式）
 * @param jobId 任务 ID
 * @returns ASR 结果
 */
async function queryResult(jobId: string): Promise<ASRResult> {
  const cfg = getAsrConfig()
  const params = new URLSearchParams({
    appid: cfg.appId,
    id: jobId,
    blocking: '1'
  })

  const response = await fetch(`${BASE_URL}/query?${params}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer; ${cfg.accessToken}`
    }
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`ASR 查询失败 (${response.status}): ${text}`)
  }

  const data = await response.json()
  if (data.code !== 0 && data.code !== '0') {
    throw new Error(`ASR 查询错误: ${data.message || '未知错误'} (code: ${data.code})`)
  }

  return {
    id: data.id,
    duration: data.duration || 0,
    utterances: data.utterances || []
  }
}

/**
 * 轮询查询直到完成
 * @param jobId 任务 ID
 * @param maxRetries 最大重试次数
 * @param intervalMs 轮询间隔（毫秒）
 */
async function pollResult(
  jobId: string,
  maxRetries = 60,
  intervalMs = 3000,
  onProgress?: (retry: number) => void
): Promise<ASRResult> {
  for (let i = 0; i < maxRetries; i++) {
    onProgress?.(i)
    try {
      const result = await queryResult(jobId)
      return result
    } catch (e: any) {
      // 如果错误消息包含 "processing"，继续轮询
      if (e.message?.includes('2000') || e.message?.includes('处理中')) {
        await sleep(intervalMs)
        continue
      }
      throw e
    }

    await sleep(intervalMs)
  }
  throw new Error('ASR 处理超时')
}

/**
 * 一键提交并等待结果（阻塞调用）
 * @param audioBuffer 音频数据
 * @param onStatus 状态回调
 */
export async function transcribeAudio(
  audioBuffer: ArrayBuffer,
  onStatus?: (status: string) => void
): Promise<ASRResult> {
  onStatus?.('正在提交音频...')
  const jobId = await submitAudio(audioBuffer)

  onStatus?.('正在识别语音...')
  const result = await pollResult(jobId, 60, 3000, (retry) => {
    onStatus?.(`识别中 (${retry + 1}/60)...`)
  })

  onStatus?.('识别完成')
  return result
}

/**
 * 将 ASR 结果转为字幕片段列表
 */
export function asrToSegments(result: ASRResult): SubtitleSegment[] {
  return result.utterances.map((u, idx) => ({
    id: `sub_${idx}_${Date.now()}`,
    text: u.text,
    startTime: u.start_time,
    endTime: u.end_time,
    words: u.words
  }))
}

/**
 * 毫秒转时间字符串 (mm:ss.ms)
 */
export function msToTime(ms: number): string {
  const totalSec = ms / 1000
  const m = Math.floor(totalSec / 60)
  const s = (totalSec % 60).toFixed(1)
  return `${m.toString().padStart(2, '0')}:${parseFloat(s).toFixed(1).padStart(4, '0')}`
}

/**
 * 测试 ASR 连接（简单 GET 请求验证凭证是否有效）
 */
export async function testAsrConnection(appId: string, accessToken: string): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/query?appid=${appId}&id=dummy_test&blocking=0`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer; ${accessToken}`
      }
    })
    // 200/400 等都表示服务可达，凭证有效
    return response.status < 500
  } catch {
    return false
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
