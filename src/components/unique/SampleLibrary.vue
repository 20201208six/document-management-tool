<template>
  <div class="sample-library">
    <!-- 工具栏：标题 + 导入/导出/快照 + 阈值过滤（始终可见） -->
    <div class="sl-toolbar">
      <span class="sl-toolbar-title">历史样本库</span>
      <div class="sl-toolbar-actions">
        <label class="sl-filter-toggle" :class="{ on: thresholdFilter }" @click="thresholdFilter = !thresholdFilter" title="仅显示达到各平台高赞门槛的样本">
          <span class="slft-switch"></span>
          <span class="slft-label">高赞门槛</span>
          <span class="slft-count" v-if="thresholdFilter">({{ store.thresholdFilteredScripts.length }}/{{ store.scriptRecords.length }})</span>
        </label>
        <button class="sl-btn sl-btn-outline" @click="$emit('import-json')">
          <span>📂</span> 导入JSON
        </button>
        <button class="sl-btn sl-btn-outline" @click="$emit('export-json')">
          <span>💾</span> 导出JSON
        </button>
        <!-- 快照操作 -->
        <button class="sl-btn sl-btn-outline" @click="handleCreateSnapshot" :disabled="store.scriptRecords.length === 0">
          <span>📸</span> 添加快照
        </button>
        <el-popover placement="bottom" :width="280" trigger="click">
          <template #reference>
            <button class="sl-btn sl-btn-outline" :disabled="store.snapshots.length === 0">
              <span>⏮️</span> 恢复快照
            </button>
          </template>
          <div class="sl-snap-list">
            <div v-if="store.snapshots.length === 0" class="sl-snap-empty">暂无快照</div>
            <div v-for="snap in store.snapshots" :key="snap.id" class="sl-snap-item">
              <div class="sl-snap-info" @click="handleRestoreSnapshot(snap.id)">
                <span class="sl-snap-name">{{ snap.name }}</span>
                <span class="sl-snap-meta">{{ snap.scriptCount }}条 · {{ snap.createdAt }}</span>
              </div>
              <div class="sl-snap-actions">
                <button class="sl-snap-btn restore" title="恢复到此快照" @click.stop="handleRestoreSnapshot(snap.id)">恢复</button>
                <button class="sl-snap-btn rename" title="重命名" @click.stop="handleRenameSnapshot(snap)">✏</button>
                <button class="sl-snap-btn delete" title="删除快照" @click.stop="handleDeleteSnapshot(snap.id)">✕</button>
              </div>
            </div>
          </div>
          <div v-if="store.snapshots.length > 0" class="sl-snap-sep"></div>
          <div class="sl-snap-item sn-reset" @click="$emit('reset-builtin')">
            <div class="sl-snap-info">
              <span class="sl-snap-name">↩ 初始样本</span>
              <span class="sl-snap-meta">恢复为系统内置初始样本</span>
            </div>
            <span class="sl-snap-arrow">→</span>
          </div>
        </el-popover>
      </div>
    </div>

    <div v-if="store.scriptRecords.length === 0" class="sl-empty-state">
      <div class="sl-empty-icon">📚</div>
      <span>暂无样本数据</span>
      <span class="sl-empty-hint">点击「录入数据」添加已发布的口播文稿及点赞量</span>
    </div>

    <template v-else>
    <!-- 排序工具栏（单行紧凑型） -->
    <div class="sl-sort-bar">
      <div class="sl-sort-chips">
        <button
          v-for="p in platformFilterOptions"
          :key="p.key"
          class="sl-sort-chip sl-chip-platform"
          :class="{ active: store.platformFilter === p.key }"
          :title="p.key === null ? `全部平台 (${p.count} 条)` : `${p.label} (${p.count} 条)`"
          @click="store.setPlatformFilter(p.key as Platform | null)"
        >
          {{ p.key === null ? '全部' : p.icon }}<span class="sl-chip-n">{{ p.count }}</span>
        </button>
        <span class="sl-sort-dot"></span>
        <button
          v-for="opt in sortOptions"
          :key="opt.key"
          class="sl-sort-chip sl-chip-sort"
          :class="{ active: store.sortField === opt.key }"
          @click="store.setSort(opt.key)"
          :title="dataHintFor(opt.key)"
        >
          {{ opt.label }}
          <span v-if="store.sortField === opt.key" class="sl-sort-dir">
            {{ store.sortOrder === 'desc' ? '▼' : '▲' }}
          </span>
        </button>
      </div>
      <span class="sl-sort-count">{{ displayScripts.length }} 条</span>
    </div>

    <!-- 主从视图：卡片列表 + 详情面板 -->
    <div class="sl-layout">
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

          <!-- 五逻辑传播评分 -->
          <div class="sld-section">
            <div class="sld-section-title">🎯 五逻辑传播评分</div>
            <div v-if="selectedRecord.fiveLogic" class="sld-scores">
              <div v-for="d in fiveLogicBars" :key="d.key" class="sld-score-row">
                <span class="sld-score-label">{{ d.label }}</span>
                <div class="sld-score-track">
                  <div class="sld-score-bar" :style="{ width: (selectedRecord.fiveLogic!.scores[d.key] || 0) + '%', background: d.color }"></div>
                </div>
                <span class="sld-score-val">{{ selectedRecord.fiveLogic!.scores[d.key] || 0 }}</span>
              </div>
              <!-- 平台合规提示 -->
              <div v-if="selectedRecord.fiveLogic?.platformCheck?.hasViolation" class="sld-compliance-warn">
                ⚠️ 检测到违禁风险: {{ selectedRecord.fiveLogic.platformCheck.violations.join('、') }}
              </div>
            </div>
            <div v-else class="sld-content" style="color: #94a3b8; padding: 8px;">
              该文稿尚未生成五逻辑报告（旧数据需重新评分）
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
  </template>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { ElMessageBox, ElMessage } from 'element-plus'
import { useUniqueModeStore, PLATFORM_CONFIG, type ScriptRecord, type Platform } from '@/stores/uniqueMode'

defineEmits<{
  (e: 'export-json'): void
  (e: 'import-json'): void
  (e: 'reset-builtin'): void
}>()

const store = useUniqueModeStore()
const selectedId = ref<string | null>(null)
const thresholdFilter = ref(false)

// 排序选项
const sortOptions = [
  { key: 'date' as const, label: '时间' },
  { key: 'likes' as const, label: '点赞' },
  { key: 'views' as const, label: '播放', hint: `${store.sortDataCompleteness.withViews}/${store.sortDataCompleteness.total} 有数据` },
  { key: 'score' as const, label: '评分', hint: `${store.sortDataCompleteness.withScore}/${store.sortDataCompleteness.total} 已评分` },
  { key: 'likeRate' as const, label: '赞播比', hint: `${store.sortDataCompleteness.withViews}/${store.sortDataCompleteness.total} 有播量` },
  { key: 'title' as const, label: '标题' },
]

// 平台筛选选项
const platformFilterOptions = computed(() => [
  { key: null, icon: '', label: '全部', count: store.scriptRecords.length },
  ...(Object.keys(PLATFORM_CONFIG) as Platform[]).map(p => ({
    key: p,
    icon: PLATFORM_CONFIG[p].icon,
    label: PLATFORM_CONFIG[p].label,
    count: store.scriptRecords.filter(r => r.platform === p).length
  }))
])

function dataHintFor(key: string): string {
  const c = store.sortDataCompleteness
  if (key === 'views' && c.withViews < c.total) return `${c.total - c.withViews} 条未填播放量，排在末尾`
  if (key === 'likeRate' && c.withViews < c.total) return `${c.total - c.withViews} 条未填播放量，赞播比为估算`
  if (key === 'score' && c.withScore < c.total) return `${c.total - c.withScore} 条未评分，排在末尾`
  return ''
}

// 五逻辑条配置
const fiveLogicBars = [
  { key: 'traffic' as const, label: '流量逻辑', color: '#f56c6c' },
  { key: 'platform' as const, label: '平台逻辑', color: '#e6a23c' },
  { key: 'user' as const, label: '用户逻辑', color: '#67c23a' },
  { key: 'business' as const, label: '商业逻辑', color: '#409eff' },
  { key: 'spread' as const, label: '传播逻辑', color: '#9b59b6' },
]

const displayScripts = computed(() =>
  thresholdFilter.value ? store.thresholdFilteredScripts : store.platformFilteredScripts
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

// ===== 快照操作 =====

async function handleCreateSnapshot() {
  try {
    const { value: name } = await ElMessageBox.prompt(
      '请输入快照名称（留空则使用时间戳）',
      '添加快照',
      { confirmButtonText: '保存', cancelButtonText: '取消', inputPlaceholder: '如：刷量前备份、改版前…' }
    )
    const snap = store.createSnapshot(name || undefined)
    ElMessage.success(`快照已保存：${snap.name}（${snap.scriptCount} 条样本）`)
  } catch { /* 取消 */ }
}

async function handleRestoreSnapshot(snapshotId: string) {
  try {
    await ElMessageBox.confirm(
      '恢复到该快照将覆盖当前所有样本数据，确定继续？',
      '确认恢复',
      { type: 'warning', confirmButtonText: '恢复', cancelButtonText: '取消' }
    )
    const ok = store.restoreSnapshot(snapshotId)
    if (ok) ElMessage.success('已从快照恢复')
    else ElMessage.error('快照数据异常')
  } catch { /* 取消 */ }
}

async function handleDeleteSnapshot(snapshotId: string) {
  try {
    await ElMessageBox.confirm('确定删除此快照？不可恢复', '确认删除', { type: 'warning' })
    store.deleteSnapshot(snapshotId)
    ElMessage.success('快照已删除')
  } catch { /* 取消 */ }
}

async function handleRenameSnapshot(snap: typeof store.snapshots[0]) {
  try {
    const { value: newName } = await ElMessageBox.prompt(
      '修改快照名称',
      '重命名',
      { confirmButtonText: '确定', cancelButtonText: '取消', inputValue: snap.name }
    )
    if (newName && newName.trim()) {
      store.renameSnapshot(snap.id, newName.trim())
      ElMessage.success('已重命名')
    }
  } catch { /* 取消 */ }
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

  // 第一个平台正常走 AI 评分
  const first = await store.addScript({
    platform: targets[0] as Platform,
    content: record.content,
    link: '',
    actualLikes: copyLikes[targets[0]] || 0,
    views: copyViews[targets[0]] || undefined,
    tags: record.tags || []
  })

  // 后续平台复用同一份 AI 评分，不再重复调用 AI
  const precomputed = { scores: first.scores, compositeScore: first.compositeScore, analysis: first.analysis, modelVersion: first.modelVersion }
  for (let i = 1; i < targets.length; i++) {
    const p = targets[i]
    await store.addScript({
      platform: p as Platform,
      content: record.content,
      link: '',
      actualLikes: copyLikes[p] || 0,
      views: copyViews[p] || undefined,
      tags: record.tags || []
    }, precomputed)
  }

  ElMessage.success(`已复制到 ${targets.length} 个平台（AI 仅评分一次）`)
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
  display: inline-flex; align-items: center; gap: 6px; cursor: pointer;
  padding: 5px 10px; border-radius: 8px; border: 1px solid #eef2f6;
  background: #fff; font-size: 12px; color: #5a6a80; user-select: none;
  transition: border-color 0.15s, background 0.15s;
}
.sl-filter-toggle:hover { border-color: #1a4cff; background: #f5f7ff; }
.sl-filter-toggle.on { border-color: #a5b4fc; background: #eef2ff; }
.slft-switch {
  width: 28px; height: 16px; border-radius: 8px; background: #d1d5db;
  position: relative; transition: background 0.25s; flex-shrink: 0;
}
.slft-switch::after {
  content: ''; position: absolute; top: 1.5px; left: 1.5px;
  width: 13px; height: 13px; border-radius: 50%; background: #fff;
  transition: transform 0.25s; box-shadow: 0 1px 3px rgba(0,0,0,0.15);
}
.sl-filter-toggle.on .slft-switch { background: #1a4cff; }
.sl-filter-toggle.on .slft-switch::after { transform: translateX(12px); }
.slft-label { font-weight: 500; }
.slft-count { color: #1a4cff; font-weight: 600; }

/* 排序工具栏 */
.sl-sort-bar {
  display: flex; align-items: center; gap: 6px; flex-shrink: 0;
  padding: 4px 0; margin-bottom: 8px;
}
.sl-sort-chips { display: flex; align-items: center; gap: 3px; flex-wrap: wrap; }
.sl-sort-chip {
  display: inline-flex; align-items: center; gap: 3px;
  padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 500;
  border: 1px solid #e8ecf1; background: #fff; color: #5a6b80;
  cursor: pointer; font-family: inherit; transition: all 0.15s; white-space: nowrap;
}
.sl-sort-chip:hover { border-color: #a0b0cc; color: #2c3e50; }
.sl-sort-chip.active { background: #1a4cff; color: #fff; border-color: #1a4cff; }
.sl-sort-dir { font-size: 9px; }

/* 平台芯片 */
.sl-chip-platform { font-weight: 600; }
.sl-chip-platform.active {
  background: #eef2ff; color: #1a4cff; border-color: #a5b4fc;
}
.sl-chip-n { font-size: 9px; opacity: 0.65; margin-left: 1px; }
.sl-sort-dot {
  width: 3px; height: 3px; border-radius: 50%; background: #d0d5dd;
  flex-shrink: 0; margin: 0 4px;
}

/* 排序芯片 */
.sl-chip-sort { font-size: 11px; }

.sl-sort-count { margin-left: auto; font-size: 10px; color: #a0b0c0; flex-shrink: 0; }

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

/* 快照弹窗列表 */
.sl-snap-list { max-height: 320px; overflow-y: auto; }
.sl-snap-empty { font-size: 12px; color: #9ca3af; text-align: center; padding: 16px 0; }
.sl-snap-item { display: flex; align-items: center; justify-content: space-between; padding: 8px 4px; cursor: pointer; border-radius: 4px; transition: background 0.15s; }
.sl-snap-item:hover { background: #f3f4f6; }
.sl-snap-info { flex: 1; min-width: 0; }
.sl-snap-name { font-size: 13px; font-weight: 500; color: #303133; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sl-snap-meta { font-size: 11px; color: #9ca3af; }
.sl-snap-sep { height: 1px; background: #e5e7eb; margin: 4px 0; }
.sl-snap-item.sn-reset { color: #f56c6c; }
.sl-snap-item.sn-reset .sl-snap-name { color: #f56c6c; }
.sl-snap-arrow { font-size: 11px; color: #9ca3af; }
.sl-snap-actions { display: flex; gap: 4px; align-items: center; flex-shrink: 0; }
.sl-snap-btn { border: 1px solid #e5e7eb; background: #fff; border-radius: 3px; padding: 2px 6px; font-size: 11px; cursor: pointer; transition: all 0.15s; }
.sl-snap-btn.restore { color: #1a4cff; border-color: #d4e0ff; }
.sl-snap-btn.restore:hover { background: #eef3ff; }
.sl-snap-btn.rename { color: #6b7280; }
.sl-snap-btn.rename:hover { background: #f3f4f6; }
.sl-snap-btn.delete { color: #f56c6c; border-color: #fde8e8; }
.sl-snap-btn.delete:hover { background: #fef2f2; }
</style>
