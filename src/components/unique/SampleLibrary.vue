<template>
  <div class="sample-library">
    <!-- 工具栏：标题 + 导入/导出/恢复 + 阈值过滤（始终可见） -->
    <div class="sl-toolbar">
      <span class="sl-toolbar-title">历史样本库</span>
      <div class="sl-toolbar-actions">
        <label class="sl-filter-toggle" title="仅显示达到各平台高赞门槛的样本">
          <input type="checkbox" v-model="thresholdFilter" />
          <span class="slft-label">高赞门槛</span>
          <span class="slft-count" v-if="thresholdFilter">({{ store.thresholdFilteredScripts.length }}/{{ store.scriptRecords.length }})</span>
        </label>
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

    <!-- 主从视图：卡片列表 + 详情面板 -->
    <div v-else class="sl-layout">
      <!-- 左侧：样本卡片列表 -->
      <div class="sl-cards">
        <div v-if="displayScripts.length === 0" class="sl-no-match" v-show="thresholdFilter">
          暂无达到高赞门槛的样本
        </div>
        <div
          v-for="r in displayScripts"
          :key="r.id"
          class="sl-card"
          :class="{ selected: selectedId === r.id, unscored: r.compositeScore <= 0, 'below-threshold': !meetsThreshold(r) }"
          @click="selectScript(r)"
        >
          <div class="slc-header">
            <span class="slc-platform">{{ PLATFORM_CONFIG[r.platform]?.icon || '🎵' }}</span>
            <span class="slc-title-text">{{ r.content.slice(0, 10) }}{{ r.content.length > 10 ? '...' : '' }}</span>
            <span v-if="!meetsThreshold(r)" class="slc-below-pill">未达标</span>
          </div>

          <div class="slc-stats">
            <span class="slc-score">{{ r.compositeScore || '--' }} <small>模型分</small></span>
            <span v-if="editingLikesId !== r.id" class="slc-likes" @click.stop="startEditLikes(r)" title="点击编辑点赞量">{{ fmt(r.actualLikes) }} <small>赞</small></span>
            <template v-else>
              <input v-model="editLikesVal" type="number" class="slc-views-input" @click.stop @keyup.enter="saveLikes(r)" />
              <button class="slc-views-ok" @click.stop="saveLikes(r)">✓</button>
              <button class="slc-views-cancel" @click.stop="editingLikesId = null">×</button>
            </template>
            <span v-if="r.views && editingViewsId !== r.id" class="slc-views">{{ fmt(r.views!) }} <small>播</small></span>
            <span v-else-if="r.views && editingViewsId === r.id" class="slc-views slc-views-done">{{ fmt(r.views!) }} <small>播</small></span>
            <template v-else-if="editingViewsId === r.id">
              <input v-model="editViewsVal" type="number" class="slc-views-input" @click.stop @keyup.enter="saveViews(r)" ref="viRef" />
              <button class="slc-views-ok" @click.stop="saveViews(r)">✓</button>
              <button class="slc-views-cancel" @click.stop="editingViewsId = null">×</button>
            </template>
            <span v-else class="slc-views slc-views-empty" @click.stop="startEditViews(r)">+播放量</span>
            <span class="slc-tag" :class="scoreTag(r.compositeScore)">{{ scoreTagText(r.compositeScore) }}</span>
          </div>

          <div class="slc-content">{{ r.content }}</div>

          <div class="slc-footer">
            <span class="slc-date">{{ r.updatedAt?.slice(0, 10) || r.createdAt.slice(0, 10) }}</span>
            <span v-if="r.platform" class="slc-platform-label">{{ r.platform }}</span>
            <span v-if="r.tags?.length" class="slc-tags">
              <span v-for="(t, i) in r.tags.slice(0, 3)" :key="i" class="slc-tag-label">{{ t }}</span>
            </span>
          </div>
        </div>
      </div>

      <!-- 右侧：详情面板 -->
      <div class="sl-detail" :class="{ open: selectedId }">
        <!-- 关闭按钮 -->
        <button class="sld-close" @click="selectedId = null" v-if="selectedId">✕</button>

        <template v-if="selectedRecord">
          <!-- 完整文稿内容 -->
          <div class="sld-section">
            <div class="sld-section-title">📄 文稿内容</div>
            <div class="sld-content">{{ selectedRecord.content }}</div>
          </div>

          <!-- 7维评分 -->
          <div class="sld-section">
            <div class="sld-section-title">🎯 7 维评分</div>
            <div class="sld-scores">
              <div v-for="d in SCORING_DIMENSION_CONFIG" :key="d.key" class="sld-score-row">
                <span class="sld-score-label">{{ d.label }}</span>
                <div class="sld-score-track">
                  <div class="sld-score-bar" :style="{ width: (selectedRecord.scores[d.key] || 0) + '%', background: d.color }"></div>
                </div>
                <span class="sld-score-val">{{ selectedRecord.scores[d.key] || 0 }}</span>
                <span class="sld-score-warn" v-if="store.scoringDisagreements.some(dd => dd.key === d.key)" :title="'AI 3轮: ' + store.scoringDisagreements.find((dd: any) => dd.key === d.key)!.runs.join('/')">⚠</span>
              </div>
            </div>
          </div>

          <!-- 元信息 -->
          <div class="sld-meta">
            <div class="sld-meta-row">
              <span class="sld-meta-label">综合模型分</span>
              <span class="sld-meta-val">{{ selectedRecord.compositeScore || '--' }}</span>
            </div>
            <div class="sld-meta-row">
              <span class="sld-meta-label">实际点赞</span>
              <span v-if="selectedRecord" class="sld-meta-val likes editable" @click="startEditLikes(selectedRecord)" title="点击编辑">{{ fmt(selectedRecord.actualLikes) }}</span>
            </div>
            <div class="sld-meta-row" v-if="selectedRecord?.views">
              <span class="sld-meta-label">播放量</span>
              <span v-if="selectedRecord" class="sld-meta-val editable" @click="startEditViews(selectedRecord)" title="点击编辑">{{ fmt(selectedRecord.views!) }}</span>
            </div>
            <div class="sld-meta-row">
              <span class="sld-meta-label">平台</span>
              <span class="sld-meta-val">{{ selectedRecord.platform }}</span>
            </div>
          </div>

          <!-- 操作按钮 -->
          <div class="sld-actions">
            <button class="slc-btn-sm slc-btn-reanalyze" @click="store.reAnalyzeScript(selectedRecord.id)" :disabled="store.isAnalyzingScript">
              {{ store.isAnalyzingScript ? '评分中...' : '重新评分' }}
            </button>
            <button class="slc-btn-sm slc-btn-decompose" @click="handleDecompose(selectedRecord)" :disabled="decomposingId === selectedRecord.id">
              {{ decomposingId === selectedRecord.id ? '拆解中...' : selectedRecord.decomposition ? '重拆解' : '移入内容拆解' }}
            </button>
            <button class="slc-btn-sm slc-btn-copy" @click="startCopy(selectedRecord)">复制到其他平台</button>
            <button class="slc-btn-sm slc-btn-del" @click="handleDelete(selectedRecord.id)">删除</button>
          </div>

          <!-- 复制面板 -->
          <div v-if="copyingId === selectedId" class="sld-copy-panel">
            <div class="scp-title">复制到以下平台</div>
            <div class="scp-row" v-for="p in otherPlatforms(selectedRecord.platform)" :key="p.key">
              <el-checkbox v-model="copyTargets[p.key]" class="scp-check">
                {{ PLATFORM_CONFIG[p.key as Platform]?.icon }} {{ PLATFORM_CONFIG[p.key as Platform]?.label }}
              </el-checkbox>
              <el-input-number v-model="copyLikes[p.key]" :min="0" :max="99999999" :step="100" size="small" style="width:140px" placeholder="点赞量" />
            </div>
            <button class="slc-btn-sm slc-btn-confirm" @click="confirmCopy(selectedRecord)">确认复制</button>
          </div>
        </template>

        <!-- 未选中 -->
        <div v-else class="sld-placeholder">
          <div class="sld-placeholder-icon">📋</div>
          <div class="sld-placeholder-text">点击左侧样本卡片<br>查看 7 维评分详情</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { ElMessageBox, ElMessage } from 'element-plus'
import { useUniqueModeStore, PLATFORM_CONFIG, SCORING_DIMENSION_CONFIG, type ScriptRecord, type Platform } from '@/stores/uniqueMode'

defineEmits<{
  (e: 'export-json'): void
  (e: 'import-json'): void
  (e: 'reset-builtin'): void
}>()

const store = useUniqueModeStore()
const selectedId = ref<string | null>(null)
const thresholdFilter = ref(false)

const displayScripts = computed(() =>
  thresholdFilter.value ? store.thresholdFilteredScripts : store.sortedScripts
)

function meetsThreshold(r: ScriptRecord): boolean {
  return r.actualLikes >= (store.highLikeThresholds[r.platform] ?? 500)
}

const selectedRecord = computed(() =>
  selectedId.value ? store.scriptRecords.find(r => r.id === selectedId.value) ?? null : null
)

function selectScript(r: ScriptRecord) {
  selectedId.value = selectedId.value === r.id ? null : r.id
}

// 播放量编辑
const editingViewsId = ref<string | null>(null)
const editViewsVal = ref(0)
const editingLikesId = ref<string | null>(null)
const editLikesVal = ref(0)

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

function startEditLikes(record: any) {
  editingLikesId.value = record.id
  editLikesVal.value = record.actualLikes || 0
}
function saveLikes(record: any) {
  const v = editLikesVal.value || 0
  store.updateScript(record.id, {
    actualLikes: v,
    likeRate: record.views > 0 ? Math.round(v / record.views * 10000) / 100 : undefined
  })
  editingLikesId.value = null
  ElMessage.success('点赞量已更新')
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
    if (selectedId.value === id) selectedId.value = null
  } catch {}
}
</script>

<style scoped>
.sample-library { height: 100%; overflow: hidden; display: flex; flex-direction: column; }

/* 全局滚动条 —— 4px 细窄 */
.sl-cards::-webkit-scrollbar, .sl-detail::-webkit-scrollbar, .sld-content::-webkit-scrollbar { width: 4px; }
.sl-cards::-webkit-scrollbar-track, .sl-detail::-webkit-scrollbar-track, .sld-content::-webkit-scrollbar-track { background: transparent; }
.sl-cards::-webkit-scrollbar-thumb, .sl-detail::-webkit-scrollbar-thumb, .sld-content::-webkit-scrollbar-thumb { background: #d4dae4; border-radius: 2px; }
.sl-cards::-webkit-scrollbar-thumb:hover, .sl-detail::-webkit-scrollbar-thumb:hover, .sld-content::-webkit-scrollbar-thumb:hover { background: #b0bcc8; }
.sl-cards, .sl-detail, .sld-content { scrollbar-width: thin; scrollbar-color: #d4dae4 transparent; }

.sl-empty-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: #8a9bb0; }
.sl-empty-icon { font-size: 40px; }
.sl-empty-hint { font-size: 13px; color: #b0bfd0; }

/* 工具栏 */
.sl-toolbar { display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; margin-bottom: 8px; }
.sl-toolbar-title { font-size: 15px; font-weight: 600; color: #0b1a30; }
.sl-toolbar-actions { display: flex; align-items: center; gap: 10px; }

/* 高赞门槛过滤开关 */
.sl-filter-toggle {
  display: inline-flex; align-items: center; gap: 5px; cursor: pointer;
  padding: 5px 10px; border-radius: 8px; border: 1px solid #eef2f6;
  background: #fff; font-size: 12px; color: #5a6a80; user-select: none;
  transition: border-color 0.15s, background 0.15s;
}
.sl-filter-toggle:hover { border-color: #1a4cff; background: #f5f7ff; }
.sl-filter-toggle input[type="checkbox"] {
  accent-color: #1a4cff; width: 14px; height: 14px; margin: 0; cursor: pointer;
}
.slft-label { font-weight: 500; }
.slft-count { color: #1a4cff; font-weight: 600; }

/* 无达标样本提示 */
.sl-no-match {
  grid-column: 1 / -1; text-align: center; padding: 32px 20px;
  color: #8b9bb5; font-size: 13px;
}

.sl-btn { display: inline-flex; align-items: center; gap: 4px; padding: 7px 14px; border-radius: 8px; font-size: 13px; font-weight: 500; border: 1px solid transparent; cursor: pointer; font-family: inherit; transition: all 0.15s; }
.sl-btn span { font-size: 14px; }
.sl-btn-outline { background: #fff; border-color: #dce2ec; color: #2c3e50; }
.sl-btn-outline:hover { border-color: #1a4cff; color: #1a4cff; background: #f5f7ff; }
.sl-btn-danger { background: #fff; border-color: #fde2e2; color: #c0392b; }
.sl-btn-danger:hover { background: #fef5f5; border-color: #c0392b; }

/* ===== 主从视图 ===== */
.sl-layout { flex: 1; overflow: hidden; display: flex; gap: 12px; }

/* 左侧卡片列表 */
.sl-cards { flex: 1; overflow-y: auto; display: grid; grid-template-columns: repeat(2, minmax(220px, 1fr)); gap: 8px; align-content: start; align-items: start; padding: 4px; }
@media (max-width: 900px) { .sl-cards { grid-template-columns: 1fr; } }

.sl-card { background: #fff; border: 1px solid #eef2f6; border-radius: 12px; padding: 14px 16px; cursor: pointer; transition: box-shadow 0.2s, border-color 0.2s, transform 0.15s; aspect-ratio: 2 / 1; display: flex; flex-direction: column; }
.sl-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.06); border-color: #d4daef; transform: translateY(-1px); }
.sl-card.selected { border-color: #1a4cff; box-shadow: 0 0 0 2px rgba(26,76,255,0.12); }
.sl-card.unscored { cursor: default; opacity: 0.75; }
.sl-card.unscored:hover { box-shadow: none; border-color: #eef2f6; }
.sl-card.below-threshold { border-style: dashed; border-color: #e0e4ec; opacity: 0.7; }
.sl-card.below-threshold:hover { border-color: #d0d5e0; opacity: 0.85; }

/* 卡片头部：平台图标 + 标题 */
.slc-header { display: flex; align-items: center; gap: 6px; margin-bottom: 10px; flex-shrink: 0; }
.slc-platform { font-size: 15px; flex-shrink: 0; line-height: 1; }
.slc-title-text { font-size: 13px; font-weight: 600; color: #1a1a2e; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.3; }
.slc-below-pill {
  flex-shrink: 0; font-size: 9px; padding: 1px 6px; border-radius: 8px;
  background: #fef3c7; color: #d97706; font-weight: 600; margin-left: auto;
}

/* 卡片数据行：评分 + 点赞 + 播放 + 标签 */
.slc-stats { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-shrink: 0; flex-wrap: wrap; }
.slc-score { background: #eef3ff; padding: 3px 10px; border-radius: 14px; font-weight: 700; font-size: 12px; color: #1a4cff; white-space: nowrap; }
.slc-score small { font-size: 10px; font-weight: 400; opacity: 0.6; }
.slc-likes { font-weight: 700; font-size: 13px; color: #e6a23c; white-space: nowrap; cursor: pointer; padding: 1px 4px; border-radius: 4px; transition: background 0.15s; }
.slc-likes:hover { background: #fdf6ec; }
.slc-likes small { font-size: 10px; font-weight: 400; color: #b0b8c8; }

.slc-content { font-family: 'SimSun', '宋体', 'Noto Serif SC', serif; font-size: 12px; color: #4a5568; line-height: 2; letter-spacing: 1px; padding: 8px 12px 8px 10px; margin-bottom: 10px; white-space: pre-line; display: -webkit-box; overflow: hidden; flex: 1; }
/* autoprefixer: ignore next */
.slc-content { -webkit-box-orient: vertical; }

.slc-footer { display: flex; align-items: center; gap: 8px; font-size: 11px; flex-wrap: wrap; margin-top: auto; flex-shrink: 0; padding-top: 8px; border-top: 1px solid #f0f2f6; }
.slc-date { color: #8b9bb5; }
.slc-platform-label { color: #8b9bb5; }
.slc-platform-label::before { content: '·'; margin-right: 4px; }
.slc-tag { padding: 2px 9px; border-radius: 14px; font-size: 10px; font-weight: 600; white-space: nowrap; }
.slc-tag.excellent { background: #fff4e0; color: #b45a1c; }
.slc-tag.good { background: #e6f7e6; color: #0f7b3a; }
.slc-tag.normal { background: #fdf6ec; color: #e6a23c; }
.slc-tags { display: flex; gap: 3px; }
.slc-tag-label { background: #f0f2f5; color: #6b7a8f; padding: 1px 6px; border-radius: 6px; font-size: 9px; }

/* ===== 右侧详情面板 ===== */
.sl-detail {
  width: 0; overflow-y: auto; overflow-x: hidden;
  background: #fff; border: 1px solid transparent; border-radius: 12px;
  transition: width 0.25s ease, border-color 0.25s ease, padding 0.25s ease;
  flex-shrink: 0;
}
.sl-detail.open { width: 340px; border-color: #eef2f6; padding: 14px 16px; }

.sld-close {
  position: sticky; top: 0; float: right; z-index: 2;
  width: 22px; height: 22px; border-radius: 50%; border: 1px solid #eef2f6;
  background: #fff; color: #6b7a8f; font-size: 11px; cursor: pointer; line-height: 1;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s, color 0.15s;
  margin: -4px -6px 2px auto;
}
.sld-close:hover { background: #f5f5f5; color: #303133; }

/* 详情面板 - 占位 */
.sld-placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 10px; color: #c0cad8; }
.sld-placeholder-icon { font-size: 36px; }
.sld-placeholder-text { font-size: 12px; text-align: center; line-height: 1.6; }

/* 详情面板 - 内容区 */
.sld-section { margin-bottom: 14px; }
.sld-section-title { font-size: 12px; font-weight: 600; color: #6b7a8f; margin-bottom: 6px; }
.sld-content { font-size: 12px; color: #374151; line-height: 1.7; max-height: 140px; overflow-y: auto; padding: 8px 10px; background: #f9fafb; border-radius: 8px; white-space: pre-line; }

/* 7维评分 */
.sld-scores { display: flex; flex-direction: column; gap: 5px; }
.sld-score-row { display: flex; align-items: center; gap: 8px; }
.sld-score-label { font-size: 11px; color: #6b7a8f; width: 64px; flex-shrink: 0; }
.sld-score-track { flex: 1; height: 6px; background: #f0f2f5; border-radius: 3px; overflow: hidden; }
.sld-score-bar { height: 100%; border-radius: 3px; transition: width 0.3s; }
.sld-score-val { font-size: 11px; font-weight: 600; width: 24px; text-align: right; flex-shrink: 0; color: #303133; }
.sld-score-warn { font-size: 10px; color: #e6a23c; cursor: help; margin-left: -4px; }

/* 元信息 */
.sld-meta { display: flex; flex-direction: column; gap: 4px; margin-bottom: 14px; padding: 8px 10px; background: #f9fafb; border-radius: 8px; }
.sld-meta-row { display: flex; justify-content: space-between; font-size: 12px; }
.sld-meta-label { color: #6b7a8f; }
.sld-meta-val { font-weight: 600; color: #303133; }
.sld-meta-val.likes { color: #e6a23c; }
.sld-meta-val.editable { cursor: pointer; border-bottom: 1px dashed #c0c8d4; }
.sld-meta-val.editable:hover { border-bottom-color: #3b82f6; color: #3b82f6; }

/* 操作按钮 */
.sld-actions { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }

.slc-btn-sm { padding: 5px 12px; border-radius: 6px; border: none; font-size: 11px; font-weight: 500; cursor: pointer; font-family: inherit; transition: opacity 0.15s; }
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
.sld-copy-panel { margin-top: 8px; padding: 10px; background: #f9faff; border: 1px solid #e6edfe; border-radius: 8px; }
.scp-title { font-size: 11px; font-weight: 600; color: #0b1a30; margin-bottom: 6px; }
.scp-row { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; }
.scp-check { flex: 1; font-size: 12px; }
.slc-btn-confirm { margin-top: 6px; padding: 5px 14px; border: none; border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer; background: #1a4cff; color: #fff; font-family: inherit; }
.slc-btn-confirm:hover { background: #0f3fd9; }

/* 播放量 */
.slc-views { font-size: 12px; font-weight: 600; color: #8b5cf6; white-space: nowrap; }
.slc-views small { font-size: 8px; font-weight: 400; color: #a78bfa; }
.slc-views-empty { font-size: 10px; font-weight: 400; color: #c4b5fd; cursor: pointer; border: 1px dashed #c4b5fd; padding: 1px 6px; border-radius: 4px; }
.slc-views-empty:hover { border-color: #8b5cf6; color: #8b5cf6; }
.slc-views-done { cursor: pointer; border-bottom: 1px dashed #c4b5fd; }
.slc-views-input { width: 64px; padding: 1px 4px; font-size: 11px; border: 1px solid #8b5cf6; border-radius: 4px; outline: none; font-family: inherit; -moz-appearance: textfield; }
.slc-views-input::-webkit-inner-spin-button { display: none; }
.slc-views-ok { border: none; background: #16a34a; color: #fff; font-size: 10px; width: 16px; height: 16px; border-radius: 3px; cursor: pointer; padding: 0; line-height: 16px; }
.slc-views-cancel { border: none; background: #e5e7eb; color: #6b7280; font-size: 10px; width: 16px; height: 16px; border-radius: 3px; cursor: pointer; padding: 0; line-height: 16px; }
</style>
