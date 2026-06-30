<template>
  <div class="suggestions-panel">
    <div class="panel-header">
      <div class="ph-left">
        <span class="ph-title">💡 AI 文案建议</span>
        <el-tag size="small" type="danger" effect="light" v-if="store.suggestions.length">
          {{ store.suggestions.length }}条
        </el-tag>
      </div>
      <el-button
        size="small"
        type="primary"
        text
        :loading="store.isGeneratingSuggestion"
        @click="handleGenerate"
        :disabled="!store.accountName"
      >
        <el-icon><Refresh /></el-icon>
        {{ store.suggestions.length ? '换一批' : '生成建议' }}
      </el-button>
    </div>

    <!-- 分类筛选 -->
    <div class="cat-filter" v-if="store.suggestions.length">
      <span
        v-for="c in categories"
        :key="c.key"
        class="cat-item"
        :class="{ active: activeCat === c.key }"
        @click="activeCat = c.key"
      >
        <span class="cat-icon">{{ c.icon }}</span>
        {{ c.label }}
      </span>
    </div>

    <div v-if="!store.accountName" class="panel-empty">
      <el-icon :size="28"><Sunny /></el-icon>
      <span>请先设置分析账号</span>
    </div>

    <div v-else-if="store.suggestions.length === 0 && !store.isGeneratingSuggestion" class="panel-empty">
      <el-icon :size="28"><MagicStick /></el-icon>
      <span>点击「生成建议」，AI 将基于您的账号数据推荐高转化文案方向</span>
      <el-button size="small" type="primary" plain @click="handleGenerate" style="margin-top:10px">
        <el-icon><TrendCharts /></el-icon> 立即生成
      </el-button>
    </div>

    <div v-else-if="store.isGeneratingSuggestion" class="panel-loading">
      <el-icon class="is-loading" :size="24"><Loading /></el-icon>
      <span>AI 正在分析爆款规律...</span>
      <span class="pl-sub">结合您的账号数据匹配最佳文案策略</span>
    </div>

    <div v-else class="suggestion-list">
      <div
        v-for="sug in filteredSuggestions"
        :key="sug.id"
        class="suggestion-card"
        :style="{ '--cat-color': catMeta(sug).color }"
      >
        <div class="sug-header">
          <div class="sug-title-wrap">
            <span class="sug-cat-badge" :style="{ background: catMeta(sug).bg, color: catMeta(sug).color }">
              {{ catMeta(sug).icon }} {{ catMeta(sug).label }}
            </span>
            <span class="sug-title">{{ sug.title }}</span>
          </div>
        </div>

        <p class="sug-content">{{ sug.content }}</p>

        <div class="sug-metrics">
          <div class="sm-item">
            <span class="sm-icon">🎬</span>
            <span class="sm-label">钩子类型</span>
            <el-tag size="small" effect="plain" class="hook-tag">{{ hookMeta(sug).label }}</el-tag>
          </div>
          <div class="sm-item">
            <span class="sm-icon">📊</span>
            <span class="sm-label">预估播放</span>
            <span class="sm-value" :style="{ color: catMeta(sug).color }">{{ viewsEstimate(sug) }}</span>
          </div>
        </div>

        <div class="sug-footer">
          <div class="sug-tags">
            <el-tag size="small" effect="plain">{{ sug.platform }}</el-tag>
            <el-tag size="small" type="success" effect="plain" v-if="sug.highlight">{{ sug.highlight }}</el-tag>
          </div>
          <el-button
            size="small"
            type="primary"
            class="apply-btn"
            @click="applySuggestion(sug)"
          >
            <el-icon><Promotion /></el-icon>
            应用
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Refresh, Loading, Promotion, Sunny, MagicStick, TrendCharts } from '@element-plus/icons-vue'
import { useUniqueModeStore, type CopywritingSuggestion } from '@/stores/uniqueMode'

const emit = defineEmits<{
  apply: [content: string]
}>()

const store = useUniqueModeStore()
const activeCat = ref<'all' | 'hook' | 'rhythm' | 'cta'>('all')

const categories = [
  { key: 'all' as const, label: '全部', icon: '✨' },
  { key: 'hook' as const, label: '爆款开头', icon: '🎬' },
  { key: 'rhythm' as const, label: '节奏优化', icon: '⚡' },
  { key: 'cta' as const, label: '互动话术', icon: '💬' },
]

// 基于suggestion标题/内容推断分类
function detectCategory(s: CopywritingSuggestion): 'hook' | 'rhythm' | 'cta' {
  const t = (s.title + s.content + (s.highlight || ''))
  if (/开头|钩子|悬念|好奇|第一句|前3秒|前5秒/.test(t)) return 'hook'
  if (/互动|点赞|关注|评论|CTA|引导|转发|号召/.test(t)) return 'cta'
  return 'rhythm'
}
function detectHookType(s: CopywritingSuggestion): { label: string; color: string } {
  const t = s.title + s.content
  if (/有没有|你是否|你知道吗|你发现/.test(t)) return { label: '提问式', color: '#FE2C55' }
  if (/[0-9零一二三四五六七八九十]+[个件天年秒]|3个|5个|10/.test(t)) return { label: '数字式', color: '#07C160' }
  if (/千万别|反常识|竟然|居然|颠覆/.test(t)) return { label: '反常识', color: '#F59E0B' }
  if (/我曾|昨天|三年前|我花了/.test(t)) return { label: '故事式', color: '#8B5CF6' }
  if (/共鸣|感受|打动/.test(t)) return { label: '共鸣式', color: '#EC4899' }
  if (/悬念|反转|没想到/.test(t)) return { label: '悬念式', color: '#06B6D4' }
  return { label: '情绪式', color: 'var(--c-primary)' }
}

function catMeta(s: CopywritingSuggestion) {
  const cat = detectCategory(s)
  if (cat === 'hook') return { label: '爆款开头', icon: '🎬', color: '#FE2C55', bg: 'rgba(254,44,85,0.1)' }
  if (cat === 'cta') return { label: '互动话术', icon: '💬', color: '#07C160', bg: 'rgba(7,193,96,0.1)' }
  return { label: '节奏优化', icon: '⚡', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' }
}
function hookMeta(s: CopywritingSuggestion) { return detectHookType(s) }

function viewsEstimate(s: CopywritingSuggestion): string {
  // 根据 estimatedTraffic 简单解析提升幅度
  const match = s.estimatedTraffic.match(/(\d+)/)
  const baseLift = match ? parseInt(match[1]) : 30
  const scripts = store.scriptRecords || []
  const baseAvg = scripts.length
    ? Math.round(scripts.reduce((sum, r) => sum + (r.views || r.actualLikes * 20), 0) / scripts.length)
    : 50000
  const low = Math.round(baseAvg * (1 + baseLift / 100) * 0.7)
  const high = Math.round(baseAvg * (1 + baseLift / 100) * 1.5)
  return `${formatNum(low)} ~ ${formatNum(high)}`
}

function formatNum(n: number): string {
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿'
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return n.toString()
}

const filteredSuggestions = computed(() => {
  if (activeCat.value === 'all') return store.suggestions
  return store.suggestions.filter(s => detectCategory(s) === activeCat.value)
})

function applySuggestion(sug: CopywritingSuggestion) {
  // 将建议内容填入聊天输入框（通过 emit 让父组件传递给 UniqueChatPanel）
  const applied = `【参考建议：${sug.title}】\n\n${sug.content}\n\n请基于以上文案思路做进一步的数据分析和优化。`
  emit('apply', applied)
}

function handleGenerate() {
  store.generateSuggestions()
}
</script>

<style scoped>
.suggestions-panel {
  background: var(--c-bg-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--c-shadow);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--c-border-light);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid var(--c-border-light);
  background: var(--c-bg-card);
}
.ph-left {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ph-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--c-text);
}

.cat-filter {
  display: flex;
  gap: 4px;
  padding: 8px 12px;
  background: var(--c-bg-sec);
  border-bottom: 1px solid var(--c-border-light);
  overflow-x: auto;
}
.cat-item {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 4px 10px;
  font-size: 12px;
  color: var(--c-text-sec);
  border-radius: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: var(--transition-fast);
  border: 1px solid transparent;
}
.cat-item:hover {
  color: var(--c-primary);
  background: var(--c-bg-hover);
}
.cat-item.active {
  background: var(--c-primary);
  color: var(--c-primary-text);
  border-color: var(--c-primary);
}
.cat-icon { font-size: 12px; }

.panel-empty, .panel-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px 16px;
  color: var(--c-text-muted);
  font-size: 13px;
  text-align: center;
}
.panel-empty span { max-width: 220px; line-height: 1.5; }
.pl-sub { font-size: 11px; color: var(--c-text-muted); }

.suggestion-list {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  flex: 1;
  max-height: 480px;
}

.suggestion-card {
  padding: 12px;
  background: var(--c-bg-card);
  border-radius: var(--radius-md);
  border: 1px solid var(--c-border-light);
  border-left: 3px solid var(--cat-color);
  transition: var(--transition-fast);
  position: relative;
}
.suggestion-card:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
  transform: translateY(-1px);
  border-color: var(--cat-color);
}

.sug-header {
  margin-bottom: 8px;
}
.sug-title-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.sug-cat-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
  flex-shrink: 0;
}
.sug-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--c-text);
}

.sug-content {
  font-size: 13px;
  color: var(--c-text-sec);
  line-height: 1.7;
  margin: 0 0 10px;
  padding: 8px 10px;
  background: var(--c-bg-sec);
  border-radius: var(--radius-sm);
  border-left: 2px solid var(--c-border);
}

.sug-metrics {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  background: var(--c-bg-sec);
  border-radius: var(--radius-sm);
  margin-bottom: 10px;
}
.sm-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
.sm-icon { font-size: 12px; }
.sm-label {
  color: var(--c-text-muted);
  min-width: 52px;
  font-size: 11px;
}
.sm-value {
  font-weight: 700;
  font-size: 13px;
}
.hook-tag {
  font-weight: 500;
}

.sug-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.sug-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  flex: 1;
}
.apply-btn {
  flex-shrink: 0;
  border-radius: var(--radius-sm);
}
</style>
