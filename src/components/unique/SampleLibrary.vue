<template>
  <div class="sample-library">
    <!-- 工具栏：标题 + 导入/导出/恢复（始终可见） -->
    <div class="sl-toolbar">
      <span class="sl-toolbar-title">历史样本库</span>
      <div class="sl-toolbar-actions">
        <button class="sl-btn sl-btn-outline" @click="$emit('import-json')">
          <span>📂</span> 导入JSON
        </button>
        <button class="sl-btn sl-btn-outline" @click="$emit('export-json')">
          <span>💾</span> 导出JSON
        </button>
        <button class="sl-btn sl-btn-danger" @click="$emit('reset-builtin')">
          <span>↩️</span> 恢复初始样本
        </button>
      </div>
    </div>

    <div v-if="store.scriptRecords.length === 0" class="sl-empty-state">
      <div class="sl-empty-icon">📚</div>
      <span>暂无样本数据</span>
      <span class="sl-empty-hint">点击「录入数据」添加已发布的口播文稿及点赞量</span>
    </div>

    <!-- 样本卡片列表 -->
    <div v-else class="sl-cards">
        <div
          v-for="r in store.sortedScripts"
          :key="r.id"
          class="sl-card"
          :class="{ expanded: expandedId === r.id }"
          @click="expandedId = expandedId === r.id ? null : r.id"
        >
          <div class="slc-header">
            <div class="slc-title">
              <span class="slc-platform">{{ PLATFORM_CONFIG[r.platform]?.icon || '🎵' }}</span>
              <span class="slc-title-text">{{ r.content.slice(0, 40) }}{{ r.content.length > 40 ? '...' : '' }}</span>
            </div>
            <div class="slc-badges">
              <span class="slc-score">{{ r.compositeScore || '--' }} <small>模型分</small></span>
              <span class="slc-likes">{{ fmt(r.actualLikes) }} <small>赞</small></span>
              <!-- 有播放量：直接显示 -->
              <span v-if="r.views && editingViewsId !== r.id" class="slc-views">{{ fmt(r.views!) }} <small>播</small></span>
              <!-- 保存后显示 + 可再次编辑 -->
              <span v-else-if="r.views && editingViewsId === r.id" class="slc-views slc-views-done">{{ fmt(r.views!) }} <small>播</small></span>
              <!-- 正在编辑：输入框 + 确认/取消 -->
              <template v-else-if="editingViewsId === r.id">
                <input v-model="editViewsVal" type="number" class="slc-views-input" @click.stop @keyup.enter="saveViews(r)" ref="viRef" />
                <button class="slc-views-ok" @click.stop="saveViews(r)">✓</button>
                <button class="slc-views-cancel" @click.stop="editingViewsId = null">×</button>
              </template>
              <!-- 无播放量 -->
              <span v-else class="slc-views slc-views-empty" @click.stop="startEditViews(r)">+播放量</span>
            </div>
          </div>

          <div class="slc-content">{{ r.content }}</div>

          <div class="slc-footer">
            <span class="slc-date">{{ r.updatedAt?.slice(0, 10) || r.createdAt.slice(0, 10) }}</span>
            <span v-if="r.platform" class="slc-date">{{ r.platform }}</span>
            <span class="slc-tag" :class="scoreTag(r.compositeScore)">{{ scoreTagText(r.compositeScore) }}</span>
            <span v-if="r.tags?.length" class="slc-tags">
              <span v-for="(t, i) in r.tags.slice(0, 3)" :key="i" class="slc-tag-label">{{ t }}</span>
            </span>
          </div>

          <!-- 展开详情：7维评分 -->
          <div v-if="expandedId === r.id" class="slc-detail" @click.stop>
            <div class="slcd-title">7 维评分</div>
            <div class="slcd-grid">
              <div v-for="d in SCORING_DIMENSION_CONFIG" :key="d.key" class="slcd-row">
                <span class="slcd-label">{{ d.label }}</span>
                <div class="slcd-bar-wrap">
                  <div class="slcd-bar" :style="{ width: (r.scores[d.key] || 0) + '%', background: d.color }"></div>
                </div>
                <span class="slcd-val" :style="{ color: '#303133' }">{{ r.scores[d.key] || 0 }}</span>
                <span class="slcd-disagree" v-if="store.scoringDisagreements.some(dd => dd.key === d.key)" title="AI 3轮评分不一致">⚠ {{ store.scoringDisagreements.find(dd => dd.key === d.key)!.runs.join('/') }}</span>
              </div>
            </div>
            <div class="slc-actions">
              <button class="slc-btn-sm slc-btn-reanalyze" @click="store.reAnalyzeScript(r.id)" :disabled="store.isAnalyzingScript">
                {{ store.isAnalyzingScript ? '评分中...' : '重新评分' }}
              </button>
              <button
                class="slc-btn-sm slc-btn-decompose"
                @click="handleDecompose(r)"
                :disabled="decomposingId === r.id"
              >
                {{ decomposingId === r.id ? '拆解中...' : r.decomposition ? '重拆解' : '移入内容拆解' }}
              </button>
              <button class="slc-btn-sm slc-btn-copy" @click="startCopy(r)">复制到其他平台</button>
              <button class="slc-btn-sm slc-btn-del" @click="handleDelete(r.id)">删除</button>
            </div>

            <!-- 复制面板 -->
            <div v-if="copyingId === r.id" class="slc-copy-panel" @click.stop>
              <div class="scp-title">复制到以下平台</div>
              <div class="scp-row" v-for="p in otherPlatforms(r.platform)" :key="p.key">
                <el-checkbox v-model="copyTargets[p.key]" class="scp-check">
                  {{ PLATFORM_CONFIG[p.key as Platform]?.icon }} {{ PLATFORM_CONFIG[p.key as Platform]?.label }}
                </el-checkbox>
                <el-input-number v-model="copyLikes[p.key]" :min="0" :max="99999999" :step="100" size="small" style="width:140px" placeholder="点赞量" />
              </div>
              <button class="slc-btn-sm slc-btn-confirm" @click="confirmCopy(r)">确认复制</button>
            </div>
          </div>
        </div>
      </div>
    </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { ElMessageBox, ElMessage } from 'element-plus'
import { useUniqueModeStore, PLATFORM_CONFIG, SCORING_DIMENSION_CONFIG, type ScriptRecord, type Platform } from '@/stores/uniqueMode'

defineEmits<{
  (e: 'export-json'): void
  (e: 'import-json'): void
  (e: 'reset-builtin'): void
}>()

const store = useUniqueModeStore()
const expandedId = ref<string | null>(null)

// 播放量编辑
const editingViewsId = ref<string | null>(null)
const editViewsVal = ref(0)

function startEditViews(record: any) {
  editingViewsId.value = record.id
  editViewsVal.value = record.views || 0
}
function saveViews(record: any) {
  const v = editViewsVal.value || 0
  store.updateScript(record.id, {
    views: v,
    likeRate: v > 0 ? Math.round(record.actualLikes / v * 10000) / 100 : undefined
  })
  editingViewsId.value = null
  ElMessage.success('播放量已更新')
}

// 复制到其他平台
const copyingId = ref<string | null>(null)
const decomposingId = ref<string | null>(null)
const copyTargets = reactive<Record<string, boolean>>({})
const copyLikes = reactive<Record<string, number>>({})
const platformKeys = Object.keys(PLATFORM_CONFIG).filter(k => k !== '全部')

function otherPlatforms(current: string) {
  return platformKeys.filter(k => k !== current).map(k => ({ key: k }))
}
function startCopy(record: any) {
  if (copyingId.value === record.id) { copyingId.value = null; return }
  copyingId.value = record.id
  for (const k of platformKeys) { copyTargets[k] = false; copyLikes[k] = 0; copyViews[k] = 0 }
}
let copyViews: Record<string, number> = reactive({})
async function confirmCopy(record: any) {
  const targets = platformKeys.filter(k => copyTargets[k])
  if (targets.length === 0) { ElMessage.warning('请至少选择一个平台'); return }
  for (const p of targets) {
    await store.addScript({
      platform: p as Platform,
      content: record.content,
      link: '',
      actualLikes: copyLikes[p] || 0,
      views: copyViews[p] || undefined,
      tags: record.tags || []
    })
  }
  ElMessage.success(`已复制到 ${targets.length} 个平台，AI 正在后台评分`)
  copyingId.value = null
}

function fmt(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return n.toString()
}

function scoreTag(s: number): string {
  if (s >= 80) return 'excellent'
  if (s >= 65) return 'good'
  if (s > 0) return 'normal'
  return ''
}

function scoreTagText(s: number): string {
  if (s >= 80) return '爆款潜力'
  if (s >= 65) return '表现良好'
  if (s > 0) return '有待优化'
  return ''
}

async function handleDecompose(r: ScriptRecord) {
  decomposingId.value = r.id
  try {
    await store.decomposeScriptById(r.id)
  } finally {
    decomposingId.value = null
  }
}

async function handleDelete(id: string) {
  try {
    await ElMessageBox.confirm('确定删除此样本？', '确认', { type: 'warning' })
    store.deleteScript(id)
    if (expandedId.value === id) expandedId.value = null
  } catch {}
}
</script>

<style scoped>
.sample-library { height: 100%; overflow: hidden; display: flex; flex-direction: column; }

.sl-empty-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: #8a9bb0; }
.sl-empty-icon { font-size: 40px; }
.sl-empty-hint { font-size: 13px; color: #b0bfd0; }

.sl-body { flex: 1; display: flex; flex-direction: column; overflow: hidden; gap: 12px; }

/* 工具栏 */
.sl-toolbar { display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
.sl-toolbar-title { font-size: 15px; font-weight: 600; color: #0b1a30; }
.sl-toolbar-actions { display: flex; align-items: center; gap: 8px; }

.sl-btn { display: inline-flex; align-items: center; gap: 4px; padding: 7px 14px; border-radius: 8px; font-size: 13px; font-weight: 500; border: 1px solid transparent; cursor: pointer; font-family: inherit; transition: all 0.15s; }
.sl-btn span { font-size: 14px; }
.sl-btn-outline { background: #fff; border-color: #dce2ec; color: #2c3e50; }
.sl-btn-outline:hover { border-color: #1a4cff; color: #1a4cff; background: #f5f7ff; }
.sl-btn-danger { background: #fff; border-color: #fde2e2; color: #c0392b; }
.sl-btn-danger:hover { background: #fef5f5; border-color: #c0392b; }

/* 卡片列表 —— 自适应列数 */
.sl-cards { flex: 1; overflow-y: auto; display: grid; grid-template-columns: repeat(2, minmax(280px, 1fr)); gap: 10px; padding-right: 2px; align-content: start; }
@media (max-width: 650px) { .sl-cards { grid-template-columns: 1fr; } }

.sl-card { background: #fff; border: 1px solid #eef2f6; border-radius: 12px; padding: 12px 14px; cursor: pointer; transition: box-shadow 0.15s, border-color 0.15s; contain: layout style; }
.sl-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.05); border-color: #d4daef; }

/* 卡片头部 */
.slc-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
.slc-title { display: flex; align-items: center; gap: 5px; min-width: 0; flex: 1; }
.slc-platform { font-size: 14px; flex-shrink: 0; }
.slc-title-text { font-size: 14px; font-weight: 600; color: #0b1a30; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.slc-badges { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.slc-score { background: #eef3ff; padding: 3px 10px; border-radius: 16px; font-weight: 700; font-size: 14px; color: #1a4cff; }
.slc-score small { font-size: 10px; font-weight: 400; opacity: 0.7; }
.slc-likes { font-weight: 700; font-size: 14px; color: #e6a23c; }
.slc-likes small { font-size: 10px; font-weight: 400; color: #909399; }

/* 卡片内容 —— 最多2行 */
.slc-content { font-size: 12px; color: #3d5068; line-height: 1.6; margin-bottom: 6px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

/* 卡片底部 */
.slc-footer { display: flex; align-items: center; gap: 8px; font-size: 11px; flex-wrap: wrap; }
.slc-date { color: #7a8a9e; }
.slc-tag { padding: 2px 8px; border-radius: 16px; font-size: 10px; font-weight: 500; }
.slc-tag.excellent { background: #fff4e0; color: #b45a1c; }
.slc-tag.good { background: #e6f7e6; color: #0f7b3a; }
.slc-tag.normal { background: #fdf6ec; color: #e6a23c; }
.slc-tags { display: flex; gap: 3px; }
.slc-tag-label { background: #f0f2f5; color: #6b7a8f; padding: 1px 7px; border-radius: 8px; font-size: 10px; }

/* 展开详情 */
.sl-card.expanded { border-color: #c4d3ff; }
.slc-detail { margin-top: 12px; padding-top: 12px; border-top: 1px solid #f5f7fa; }
.slcd-title { font-size: 12px; font-weight: 600; color: #6b7a8f; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
.slcd-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px 16px; }
.slcd-row { display: flex; align-items: center; gap: 6px; }
.slcd-label { font-size: 11px; color: #6b7a8f; width: 60px; flex-shrink: 0; }
.slcd-bar-wrap { flex: 1; height: 5px; background: #f0f2f5; border-radius: 3px; overflow: hidden; }
.slcd-bar { height: 100%; border-radius: 3px; transition: width 0.3s; }
.slcd-val { font-size: 11px; font-weight: 600; width: 24px; text-align: right; flex-shrink: 0; }

.slc-actions { display: flex; gap: 8px; margin-top: 10px; justify-content: flex-end; }
.slc-btn-sm { padding: 5px 14px; border-radius: 6px; border: none; font-size: 12px; font-weight: 500; cursor: pointer; font-family: inherit; transition: opacity 0.15s; }
.slc-btn-sm:disabled { opacity: 0.5; cursor: not-allowed; }
.slc-btn-reanalyze { background: #eef3ff; color: #1a4cff; }
.slc-btn-reanalyze:hover:not(:disabled) { background: #dde6ff; }
.slc-btn-decompose { background: #fefaf0; color: #b8751e; }
.slc-btn-decompose:hover:not(:disabled) { background: #fdf0d9; }
.slc-btn-del { background: #fef5f5; color: #c0392b; }
.slc-btn-del:hover { background: #fde8e8; }
.slc-btn-copy { background: #effcf5; color: #0f7b3a; }
.slc-btn-copy:hover { background: #ddf4e6; }

/* 复制面板 */
.slc-copy-panel { margin-top: 10px; padding: 12px 14px; background: #f9faff; border: 1px solid #e6edfe; border-radius: 10px; }
.scp-title { font-size: 12px; font-weight: 600; color: #0b1a30; margin-bottom: 8px; }
.scp-row { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.scp-check { flex: 1; }
.slc-btn-confirm { margin-top: 8px; padding: 5px 14px; border: none; border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer; background: #1a4cff; color: #fff; font-family: inherit; }
.slc-btn-confirm:hover { background: #0f3fd9; }

.slc-views { font-size: 13px; font-weight: 600; color: #8b5cf6; white-space: nowrap; }
.slc-views small { font-size: 9px; font-weight: 400; color: #a78bfa; }
.slc-views-empty { font-size: 11px; font-weight: 400; color: #c4b5fd; cursor: pointer; border: 1px dashed #c4b5fd; padding: 2px 8px; border-radius: 6px; }
.slc-views-empty:hover { border-color: #8b5cf6; color: #8b5cf6; }
.slc-views-done { cursor: pointer; border-bottom: 1px dashed #c4b5fd; }
.slc-views-input { width: 72px; padding: 2px 6px; font-size: 12px; border: 1px solid #8b5cf6; border-radius: 4px; outline: none; font-family: inherit; -moz-appearance: textfield; }
.slc-views-input::-webkit-inner-spin-button { display: none; }
.slc-views-ok { border: none; background: #16a34a; color: #fff; font-size: 11px; width: 18px; height: 18px; border-radius: 4px; cursor: pointer; padding: 0; line-height: 18px; }
.slc-views-cancel { border: none; background: #e5e7eb; color: #6b7280; font-size: 11px; width: 18px; height: 18px; border-radius: 4px; cursor: pointer; padding: 0; line-height: 18px; }
</style>
