/**
 * 剪映 PC 版草稿工程文件夹生成器
 *
 * 生成完整工程文件夹结构：
 *   项目名/
 *   ├── draft_content.json     # 时间线 + 素材 + 轨道
 *   └── draft_meta_info.json   # 项目元信息 + 资源引用
 *
 * 输出到剪映本地草稿目录：
 *   C:\Users\{用户名}\AppData\Local\JianyingPro\User Data\Projects\com.lanying.editor.draft\
 *
 * 参考：
 *   - JianYingApi: https://gitcode.com/gh_mirrors/ji/JianYingApi
 *   - VectCutAPI: https://github.com/sun-guannan/VectCutAPI
 *   - JianYingProDraft: https://github.com/xiaoyiv/JianYingProDraft
 */

// ===== 类型定义 =====

export interface JYVideoMaterial {
  id: string
  filePath: string     // 视频文件完整路径
  fileName: string     // 文件名
  width: number
  height: number
  duration: number     // 微秒
}

export interface JYTextMaterial {
  id: string
  content: string      // 字幕文本（含格式标签）
}

export interface JYVideoSegment {
  id: string
  materialId: string   // 对应 JYVideoMaterial.id
  sourceStart: number  // 源视频起始（微秒）
  sourceDuration: number // 源视频时长（微秒）
  targetStart: number  // 时间轴起始（微秒）
}

export interface JYTextSegment {
  id: string
  materialId: string   // 对应 JYTextMaterial.id
  targetStart: number  // 时间轴起始（微秒）
  targetDuration: number // 持续时间（微秒）
}

export interface JYDraftProject {
  name: string
  canvasWidth: number
  canvasHeight: number
  videos: JYVideoMaterial[]
  texts: JYTextMaterial[]
  videoSegments: JYVideoSegment[]
  textSegments: JYTextSegment[]
}

// ===== UUID 生成 =====

function uuid4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

// ===== 微秒时间戳 =====

/** 秒转微秒 */
function secToUs(sec: number): number {
  return Math.round(sec * 1_000_000)
}

/** 毫秒转微秒 */
function msToUs(ms: number): number {
  return Math.round(ms * 1_000)
}

// ===== 平台信息 =====

function buildPlatformInfo(): object {
  return {
    app_id: 3704,
    app_source: 'lv',
    app_version: '5.9.0',
    os: 'windows'
  }
}

// ===== JSON 构建 =====

/**
 * 构建 draft_content.json
 * 严格按照剪映 5.x+ 版本的模板结构
 */
function buildDraftContent(project: JYDraftProject, draftId: string): object {
  const now = Date.now()

  // 计算总时长（微秒）
  let totalDuration = 0
  for (const seg of project.videoSegments) {
    const end = seg.targetStart + seg.sourceDuration
    if (end > totalDuration) totalDuration = end
  }
  for (const seg of project.textSegments) {
    const end = seg.targetStart + seg.targetDuration
    if (end > totalDuration) totalDuration = end
  }

  // 视频素材
  const videoMaterials = project.videos.map(v => ({
    audio_fade: null,
    cartoon_path: '',
    category_id: '',
    category_name: 'local',
    check_flag: 63487,
    crop: {
      lower_left_x: 0.0,
      lower_left_y: 1.0,
      lower_right_x: 1.0,
      lower_right_y: 1.0,
      upper_left_x: 0.0,
      upper_left_y: 0.0,
      upper_right_x: 1.0,
      upper_right_y: 0.0
    },
    crop_ratio: 'free',
    crop_scale: 1.0,
    duration: v.duration,
    extra_type_option: 0,
    formula_id: '',
    freeze: null,
    gameplay: null,
    has_audio: true,
    height: v.height,
    id: v.id,
    intensifies_audio_path: '',
    intensifies_path: '',
    is_unified_beauty_mode: false,
    local_id: '',
    local_material_id: '',
    material_id: '',
    material_name: v.fileName,
    material_url: '',
    matting: {
      flag: 0,
      has_use_quick_brush: false,
      has_use_quick_eraser: false,
      interactiveTime: [],
      path: '',
      strokes: []
    },
    media_path: '',
    object_locked: null,
    path: v.filePath,
    picture_from: 'none',
    picture_set_category_id: '',
    picture_set_category_name: '',
    request_id: '',
    reverse_intensifies_path: '',
    reverse_path: '',
    source_platform: 0,
    stable: null,
    team_id: '',
    type: 'video',
    video_algorithm: {
      algorithms: [],
      deflicker: null,
      motion_blur_config: null,
      noise_reduction: null,
      path: '',
      time_range: null
    },
    width: v.width
  }))

  // 文本素材（暂不启用）
  const textMaterials: object[] = []

  // 视频轨道
  const videoTrack = {
    attribute: 0,
    flag: 0,
    id: uuid4(),
    segments: project.videoSegments.map((seg, i) => ({
      cartoon: false,
      clip: {
        alpha: 1.0,
        flip: { horizontal: false, vertical: false },
        rotation: 0.0,
        scale: { x: 1.0, y: 1.0 },
        transform: { x: 0.0, y: 0.0 }
      },
      common_keyframes: [],
      enable_adjust: true,
      enable_color_curves: true,
      enable_color_wheels: true,
      enable_lut: true,
      enable_smart_color_adjust: false,
      extra_material_refs: [],
      group_id: '',
      hdr_settings: { intensity: 1.0, mode: 1, nits: 1000 },
      id: seg.id,
      intensifies_audio: false,
      is_placeholder: false,
      is_tone_modify: false,
      keyframe_refs: [],
      last_nonzero_volume: 1.0,
      material_id: seg.materialId,
      render_index: i,
      reverse: false,
      source_timerange: {
        duration: seg.sourceDuration,
        start: seg.sourceStart
      },
      speed: 1.0,
      target_timerange: {
        duration: seg.sourceDuration,
        start: seg.targetStart
      },
      template_id: '',
      template_scene: 'default',
      track_attribute: 0,
      track_render_index: 0,
      visible: true,
      volume: 1.0
    })),
    type: 'video'
  }

  // 字幕轨道（暂不启用，等待剪映字幕格式稳定）
  const textTrack = null

  const tracks: object[] = [videoTrack]
  if (textTrack) tracks.push(textTrack as object)

  const platformInfo = buildPlatformInfo()

  return {
    canvas_config: {
      height: project.canvasHeight,
      ratio: 'original',
      width: project.canvasWidth
    },
    color_space: 0,
    config: {
      adjust_max_index: 1,
      attachment_info: [],
      combination_max_index: 1,
      export_range: null,
      extract_audio_last_index: 1,
      lyrics_recognition_id: '',
      lyrics_sync: true,
      lyrics_taskinfo: [],
      maintrack_adsorb: true,
      material_save_mode: 0,
      multi_language_current: 'none',
      multi_language_list: [],
      multi_language_main: 'none',
      multi_language_mode: 'none',
      original_sound_last_index: 1,
      record_audio_last_index: 1,
      sticker_max_index: 1,
      subtitle_keywords_config: null,
      subtitle_recognition_id: '',
      subtitle_sync: true,
      subtitle_taskinfo: [],
      system_font_list: [],
      video_mute: false,
      zoom_info_params: null
    },
    cover: null,
    create_time: now,
    duration: totalDuration,
    extra_info: null,
    fps: 30.0,
    free_render_index_mode_on: false,
    group_container: null,
    id: draftId,
    keyframe_graph_list: [],
    keyframes: {
      adjusts: [],
      audios: [],
      effects: [],
      filters: [],
      handwrites: [],
      stickers: [],
      texts: [],
      videos: []
    },
    last_modified_platform: platformInfo,
    materials: {
      ai_translates: [],
      audio_balances: [],
      audio_effects: [],
      audio_fades: [],
      audio_track_indexes: [],
      audios: [],
      beats: [],
      canvases: [],
      chromas: [],
      color_curves: [],
      digital_humans: [],
      drafts: [],
      effects: [],
      flowers: [],
      green_screens: [],
      handwrites: [],
      hsl: [],
      images: [],
      log_color_wheels: [],
      loudnesses: [],
      manual_deformations: [],
      masks: [],
      material_animations: [],
      material_colors: [],
      multi_language_refs: [],
      placeholders: [],
      plugin_effects: [],
      primary_color_wheels: [],
      realtime_denoises: [],
      shapes: [],
      smart_crops: [],
      smart_relights: [],
      sound_channel_mappings: [],
      speeds: [],
      stickers: [],
      tail_leaders: [],
      text_templates: [],
      texts: [],   // 字幕暂不启用
      time_marks: [],
      transitions: [],
      video_effects: [],
      video_trackings: [],
      videos: videoMaterials,
      vocal_beautifys: [],
      vocal_separations: []
    },
    mutable_config: null,
    name: project.name,
    new_version: '110.0.0',
    platform: platformInfo,
    relationships: [],
    render_index_track_mode_on: true,
    retouch_cover: null,
    source: 'default',
    static_cover_image_path: '',
    time_marks: null,
    tracks,
    update_time: now,
    version: 360000
  }
}

/**
 * 构建 draft_meta_info.json
 * 必须与 draft_content.json 使用相同的 draftId
 */
function buildDraftMetaInfo(project: JYDraftProject, draftRoot: string, safeName: string, draftId: string): object {
  const now = Date.now()

  // 素材列表（视频 + 文本）
  const materials: object[] = []

  for (const v of project.videos) {
    materials.push({
      create_time: now,
      duration: v.duration || 0,
      extra_info: v.fileName,
      file_Path: v.filePath,
      height: v.height || 0,
      id: v.id,
      import_time: now,
      import_time_ms: now * 1000,
      md5: '',
      metetype: 'video',
      roughcut_time_range: { duration: v.duration || 0, start: 0 },
      sub_time_range: { duration: -1, start: -1 },
      type: 0,
      width: v.width || 0
    })
  }

  return {
    id: draftId,
    TMInfo: {
      draft_name: project.name,
      draft_id: draftId,
      draft_fold_path: `${draftRoot}/${safeName}/`,
      create_time: now,
      modify_time: now,
      cover_path: '',
      canvas_config: {
        width: project.canvasWidth,
        height: project.canvasHeight,
        ratio: 'original'
      }
    },
    draft_materials: [
      {
        value: materials
      }
    ],
    draft_cloud_purchase_info: '',
    draft_cloud_capcut_purchase_info: '',
    draft_cloud_template_id: '',
    draft_cloud_tutorial_info: '',
    draft_cloud_videocut_purchase_info: '',
    draft_cloud_last_action_download: false,
    draft_cloud_materials: [],
    draft_cover: '',
    draft_deeplink_url: '',
    draft_enterprise_info: {
      draft_enterprise_extra: '',
      draft_enterprise_id: '',
      draft_enterprise_name: '',
      enterprise_material: []
    },
    draft_meta_info_file_version: 2,
    is_cloud_draft: false,
    tm_draft_name: project.name
  }
}

/** 获取 Windows 用户名 */
async function getWindowsUsername(): Promise<string> {
  try {
    const api = (window as any).electronAPI
    if (api?.getUsername) {
      return await api.getUsername()
    }
  } catch {}
  return 'Administrator'
}

// ===== 导出接口 =====

export interface ExportResult {
  success: boolean
  draftDir: string       // 草稿文件夹完整路径
  error?: string
}

/**
 * 生成并保存剪映草稿工程文件夹
 */
export async function exportJianyingProject(
  project: JYDraftProject,
  draftPath?: string,
  onProgress?: (msg: string) => void
): Promise<ExportResult> {
  try {
    onProgress?.('正在生成剪映工程文件...')

    // 关键：content.json 和 meta_info.json 必须使用相同的 draftId
    const draftId = uuid4()

    const draftContent = buildDraftContent(project, draftId)

    // 项目文件夹名（去除不合法字符）
    const safeName = project.name.replace(/[<>:"/\\|?*]/g, '_')

    // 使用用户配置的路径或默认剪映路径
    const jyDraftRoot = draftPath ||
      `C:/Users/${await getWindowsUsername()}/AppData/Local/JianyingPro/User Data/Projects/com.lanying.editor.draft`

    const draftMetaInfo = buildDraftMetaInfo(project, jyDraftRoot, safeName, draftId)

    const contentJson = JSON.stringify(draftContent, null, 2)
    const metaJson = JSON.stringify(draftMetaInfo, null, 2)

    onProgress?.('正在写入文件...')

    const electronAPI = (window as any).electronAPI
    if (!electronAPI?.createDirectory || !electronAPI?.writeFile) {
      throw new Error('Electron 文件系统 API 不可用，请在 Electron 端运行')
    }

    const projectDir = `${jyDraftRoot}/${safeName}`

    await electronAPI.createDirectory(projectDir)
    await electronAPI.writeFile(`${projectDir}/draft_content.json`, contentJson)
    await electronAPI.writeFile(`${projectDir}/draft_meta_info.json`, metaJson)

    onProgress?.(`已生成: ${safeName}`)
    return { success: true, draftDir: projectDir }
  } catch (e: any) {
    return { success: false, draftDir: '', error: e.message || String(e) }
  }
}

/**
 * 通过命令行打开剪映（可选功能）
 */
export function openJianying(): void {
  const electronAPI = (window as any).electronAPI
  if (electronAPI?.openExternal) {
    electronAPI.openExternal('jianyingpro://')
  }
}

/**
 * 工具：根据视频片段列表生成完整的 JYDraftProject
 *
 * @param clips  视频片段数组（每个片段含来源视频路径、起止时间）
 * @param subtitles 字幕片段数组
 * @param projectName 工程名称
 * @param canvasW 画布宽
 * @param canvasH 画布高
 */
export function buildProject(
  clips: Array<{
    sourceFile: string
    sourceFileName: string
    startMs: number       // 毫秒
    endMs: number         // 毫秒
    width?: number
    height?: number
  }>,
  subtitles: Array<{
    text: string
    startMs: number
    endMs: number
  }>,
  projectName: string,
  canvasW = 1080,
  canvasH = 1920
): JYDraftProject {
  const videoMaterials: JYVideoMaterial[] = []
  const videoMaterialMap = new Map<string, JYVideoMaterial>()

  // 去重：同一来源文件只创建一个 material
  const seenFiles = new Set<string>()
  for (const clip of clips) {
    if (!seenFiles.has(clip.sourceFile)) {
      seenFiles.add(clip.sourceFile)
      const mat: JYVideoMaterial = {
        id: uuid4(),
        filePath: clip.sourceFile,
        fileName: clip.sourceFileName,
        width: clip.width || canvasW,
        height: clip.height || canvasH,
        duration: msToUs(clip.endMs)
      }
      videoMaterials.push(mat)
      videoMaterialMap.set(clip.sourceFile, mat)
    }
  }

  // 视频片段 → segments
  let cumulativeUs = 0
  const videoSegments: JYVideoSegment[] = clips.map((clip, _i) => {
    const mat = videoMaterialMap.get(clip.sourceFile)!
    const sourceStart = msToUs(clip.startMs)
    const sourceDuration = msToUs(clip.endMs - clip.startMs)
    const seg: JYVideoSegment = {
      id: uuid4(),
      materialId: mat.id,
      sourceStart,
      sourceDuration,
      targetStart: cumulativeUs
    }
    cumulativeUs += sourceDuration
    return seg
  })

  // 字幕 → texts + textSegments
  const texts: JYTextMaterial[] = []
  const textSegments: JYTextSegment[] = subtitles.map(sub => {
    const textId = uuid4()
    texts.push({ id: textId, content: sub.text })
    return {
      id: uuid4(),
      materialId: textId,
      targetStart: msToUs(sub.startMs),
      targetDuration: msToUs(sub.endMs - sub.startMs)
    }
  })

  return {
    name: projectName,
    canvasWidth: canvasW,
    canvasHeight: canvasH,
    videos: videoMaterials,
    texts,
    videoSegments,
    textSegments
  }
}
