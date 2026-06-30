<template>
  <div class="analysis-center">
    <div class="panel-header">
      <span>数据分析中心</span>
      <el-radio-group v-model="timeRange" size="small" class="time-range">
        <el-radio-button label="7">近7天</el-radio-button>
        <el-radio-button label="30">近30天</el-radio-button>
        <el-radio-button label="90">近90天</el-radio-button>
        <el-radio-button label="all">全部</el-radio-button>
      </el-radio-group>
    </div>

    <div v-if="!store.accountName" class="panel-empty">
      <el-icon :size="32"><DataAnalysis /></el-icon>
      <span>请先设置分析账号</span>
    </div>

    <div v-else-if="store.isLoadingAccount" class="panel-loading">
      <el-icon class="is-loading" :size="24"><Loading /></el-icon>
      <span>数据加载中...</span>
    </div>

    <div v-else class="panel-body">
      <!-- 数据概览 -->
      <div class="section">
        <div class="section-title">📊 数据概览</div>
        <div class="overview-grid">
          <div class="overview-card" v-for="ov in overviewCards" :key="ov.key" :style="{ '--ov-color': ov.color }">
            <div class="ov-icon">{{ ov.icon }}</div>
            <div class="ov-info">
              <div class="ov-label">{{ ov.label }}</div>
              <div class="ov-value">{{ ov.value }}</div>
              <div class="ov-trend" :class="ov.trendDir">
                <span v-if="ov.trendDir === 'up'">↑ {{ ov.trend }}</span>
                <span v-else-if="ov.trendDir === 'down'">↓ {{ ov.trend }}</span>
                <span v-else>→ {{ ov.trend }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 平台数据 -->
      <div class="section">
        <div class="section-title">📱 多平台数据</div>
        <div
          v-for="acc in enrichedPlatforms"
          :key="acc.platform"
          class="platform-card"
          :style="{ '--plat-color': acc.color, '--plat-bg': acc.bgColor }"
        >
          <div class="platform-header">
            <div class="platform-name">
              <span class="plat-icon" :style="{ background: acc.color }">{{ acc.icon }}</span>
              <span class="plat-text">{{ acc.platform }}</span>
              <el-tag
                :type="trendType(acc.recentTrend)"
                size="small"
                effect="light"
                class="trend-tag"
              >
                <span v-if="acc.recentTrend === 'up'">↑ {{ acc.trendPct }}%</span>
                <span v-else-if="acc.recentTrend === 'down'">↓ {{ acc.trendPct }}%</span>
                <span v-else>→ 平稳</span>
              </el-tag>
            </div>
            <div class="plat-meta">{{ acc.publishCount }} 篇作品 · {{ formatNum(acc.followers) }} 粉丝</div>
          </div>

          <!-- 平均播放量大字 -->
          <div class="plat-hero">
            <span class="hero-value">{{ formatNum(acc.avgViews) }}</span>
            <span class="hero-lbl">平均播放量</span>
          </div>

          <!-- 核心指标条 -->
          <div class="metric-list">
            <div class="metric-row" v-for="m in acc.metrics" :key="m.label">
              <span class="m-label">{{ m.label }}</span>
              <span class="m-value" :class="m.level">{{ m.value }}</span>
              <div class="m-bar">
                <div class="m-bar-fill" :style="{ width: m.percent + '%', background: m.barColor || acc.color }"></div>
              </div>
            </div>
          </div>

          <!-- 趋势小图 (CSS柱状模拟) -->
          <div class="trend-chart">
            <div class="tc-label">近7日播放趋势</div>
            <div class="tc-bars">
              <div
                v-for="(h, idx) in acc.trendBars"
                :key="idx"
                class="tc-bar"
                :style="{ height: h + '%', background: acc.color, opacity: 0.4 + (h / 100) * 0.6 }"
              ></div>
            </div>
          </div>

          <!-- 平台标签 -->
          <div class="platform-tags">
            <el-tag v-for="tag in acc.topTags" :key="tag" size="small" effect="plain">{{ tag }}</el-tag>
          </div>
        </div>
      </div>

      <!-- 爆款因素 -->
      <div class="section">
        <div class="section-title">🔥 爆款因素分析</div>

        <div class="viral-block">
          <div class="vb-title">高完播开头类型</div>
          <div class="hook-list">
            <div v-for="h in hookTypes" :key="h.name" class="hook-item">
              <span class="hk-name">{{ h.name }}</span>
              <div class="hk-bar">
                <div class="hk-bar-fill" :style="{ width: h.percent + '%' }"></div>
              </div>
              <span class="hk-pct">{{ h.percent }}%</span>
            </div>
          </div>
        </div>

        <div class="viral-block">
          <div class="vb-title">爆款话题标签</div>
          <div class="tag-cloud">
            <span
              v-for="tag in hotTags"
              :key="tag.name"
              class="tag-cloud-item"
              :style="{ fontSize: tag.size + 'px', color: tag.color, opacity: tag.weight }"
            >#{{ tag.name }}</span>
          </div>
        </div>

        <div class="viral-stats">
          <div class="vs-item">
            <span class="vs-icon">⏱️</span>
            <span class="vs-label">最佳时长</span>
            <span class="vs-value">{{ bestDuration }}</span>
          </div>
          <div class="vs-item">
            <span class="vs-icon">🕐</span>
            <span class="vs-label">最佳发布</span>
            <span class="vs-value">{{ bestPostTime }}</span>
          </div>
          <div class="vs-item">
            <span class="vs-icon">💯</span>
            <span class="vs-label">爆款率</span>
            <span class="vs-value">{{ viralRate }}%</span>
          </div>
        </div>
      </div>

      <!-- 用户画像 -->
      <div class="section">
        <div class="section-title">👥 用户画像</div>
        <div class="profile-grid" v-if="store.userProfile">
          <div class="profile-item">
            <span class="p-label">年龄分布</span>
            <span class="p-value">{{ store.userProfile.ageGroup }}</span>
          </div>
          <div class="profile-item">
            <span class="p-label">性别比例</span>
            <span class="p-value">{{ store.userProfile.genderRatio }}</span>
          </div>
          <div class="profile-item">
            <span class="p-label">活跃时段</span>
            <span class="p-value">{{ store.userProfile.activeHours }}</span>
          </div>
        </div>
        <div class="tag-list" v-if="store.userProfile">
          <el-tag v-for="tag in store.userProfile.interests" :key="tag" size="small" type="info" effect="plain">{{ tag }}</el-tag>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { DataAnalysis, Loading } from '@element-plus/icons-vue'
import { useUniqueModeStore } from '@/stores/uniqueMode'

const store = useUniqueModeStore()

const timeRange = ref<'7' | '30' | '90' | 'all'>('30')

interface PlatformMeta {
  platform: string
  icon: string
  color: string
  bgColor: string
  followers: number
  avgViews: number
  avgLikes: number
  publishCount: number
  open5sRate: number
  completionRate: number
  likeRate: number
  commentRate: number
  shareRate: number
  recentTrend: 'up' | 'down' | 'stable'
  trendPct: number
  trendBars: number[]
  topTags: string[]
  metrics: Array<{ label: string; value: string; percent: number; level: string; barColor?: string }>
}

const PLATFORM_STYLE: Record<string, { icon: string; color: string; bg: string }> = {
  '抖音': { icon: '🎵', color: '#000000', bg: 'rgba(254,44,85,0.08)' },
  '小红书': { icon: '📕', color: '#FF2442', bg: 'rgba(255,36,66,0.08)' },
  '快手': { icon: '⚡', color: '#FF4906', bg: 'rgba(255,73,6,0.08)' },
  '视频号': { icon: '📺', color: '#07C160', bg: 'rgba(7,193,96,0.08)' },
  'B站': { icon: '📺', color: '#00A1D6', bg: 'rgba(0,161,214,0.08)' },
}

function getMeta(p: string) {
  return PLATFORM_STYLE[p] || { icon: '🌐', color: 'var(--c-primary)', bg: 'var(--c-bg-sec)' }
}

// 丰富平台数据（基于 store 数据 + 模拟衍生指标）
const enrichedPlatforms = computed<PlatformMeta[]>(() => {
  const rangeFactor = timeRange.value === '7' ? 0.3 : timeRange.value === '30' ? 1 : timeRange.value === '90' ? 2.2 : 3
  const basePlatforms = store.platformAccounts.length
    ? store.platformAccounts
    : [
        { platform: '抖音', followers: 125000, avgViews: 85000, avgLikes: 4200, recentTrend: 'up' as const, topTags: ['文案', '情感', '生活'] },
        { platform: '小红书', followers: 68000, avgViews: 45000, avgLikes: 3200, recentTrend: 'stable' as const, topTags: ['文案', '治愈', '成长'] },
        { platform: '快手', followers: 92000, avgViews: 62000, avgLikes: 2800, recentTrend: 'down' as const, topTags: ['文案', '励志', '情感'] },
      ]

  // 如果没有视频号/B站，补充示例
  const extra: Array<{ platform: string; followers: number; avgViews: number; avgLikes: number; recentTrend: 'up' | 'down' | 'stable'; topTags: string[] }> = []
  if (!basePlatforms.find(p => p.platform === '视频号')) {
    extra.push({ platform: '视频号', followers: 32000, avgViews: 18000, avgLikes: 1500, recentTrend: 'up', topTags: ['生活', '干货', '分享'] })
  }
  if (!basePlatforms.find(p => p.platform === 'B站')) {
    extra.push({ platform: 'B站', followers: 45000, avgViews: 28000, avgLikes: 2100, recentTrend: 'stable', topTags: ['知识', '文案', '干货'] })
  }
  const all = [...basePlatforms, ...extra]

  return all.map((p, idx) => {
    const meta = getMeta(p.platform)
    const factor = rangeFactor
    const avgViews = Math.round(p.avgViews * factor)
    const avgLikes = Math.round(p.avgLikes * factor)
    const open5sRate = Math.round(45 + (idx % 3) * 12 + Math.random() * 8)
    const completionRate = Math.round(28 + (idx % 3) * 8 + Math.random() * 6)
    const likeRate = +(avgLikes / Math.max(1, avgViews) * 100).toFixed(2)
    const commentRate = +(likeRate * 0.12 + Math.random() * 0.5).toFixed(2)
    const shareRate = +(likeRate * 0.18 + Math.random() * 0.8).toFixed(2)
    const trendPct = p.recentTrend === 'up' ? (8 + Math.round(Math.random() * 12)) : p.recentTrend === 'down' ? (5 + Math.round(Math.random() * 10)) : 2

    // 模拟7日柱状数据
    const trendBars = Array.from({ length: 7 }, () => 30 + Math.round(Math.random() * 70))

    const metrics: PlatformMeta['metrics'] = [
      { label: '开头5秒留存', value: open5sRate + '%', percent: open5sRate, level: open5sRate >= 60 ? 'good' : open5sRate >= 45 ? 'warn' : 'bad', barColor: '#FE2C55' },
      { label: '整体完播率', value: completionRate + '%', percent: completionRate * 1.5, level: completionRate >= 35 ? 'good' : completionRate >= 25 ? 'warn' : 'bad', barColor: meta.color },
      { label: '点赞率', value: likeRate + '%', percent: Math.min(100, likeRate * 15), level: likeRate >= 4 ? 'good' : likeRate >= 2 ? 'warn' : 'bad' },
      { label: '评论率', value: commentRate + '%', percent: Math.min(100, commentRate * 25), level: commentRate >= 0.8 ? 'good' : 'warn' },
      { label: '转发率', value: shareRate + '%', percent: Math.min(100, shareRate * 20), level: shareRate >= 1 ? 'good' : 'warn' },
    ]

    return {
      platform: p.platform,
      icon: meta.icon,
      color: meta.color,
      bgColor: meta.bg,
      followers: Math.round(p.followers * factor),
      avgViews,
      avgLikes,
      publishCount: Math.round((timeRange.value === '7' ? 5 : timeRange.value === '30' ? 22 : timeRange.value === '90' ? 68 : 150)),
      open5sRate,
      completionRate,
      likeRate,
      commentRate,
      shareRate,
      recentTrend: p.recentTrend,
      trendPct,
      trendBars,
      topTags: p.topTags,
      metrics,
    }
  })
})

// 数据概览
const overviewCards = computed(() => {
  const scripts = store.scriptRecords || []
  const totalViews = scripts.reduce((s, r) => s + (r.views || r.actualLikes * 20), 0) || 2850000
  const avgV = scripts.length ? Math.round(totalViews / scripts.length) : 58000
  const topV = scripts.length ? Math.max(...scripts.map(r => r.views || r.actualLikes * 20)) : 238000
  const viralCount = scripts.filter(r => r.actualLikes >= 10000).length
  const viralPct = scripts.length ? Math.round(viralCount / scripts.length * 100) : 18

  return [
    { key: 'total', icon: '📈', label: '总播放量', value: formatNum(totalViews), trend: '12.5%', trendDir: 'up', color: 'var(--c-primary)' },
    { key: 'avg', icon: '📊', label: '均播放量', value: formatNum(avgV), trend: '8.3%', trendDir: 'up', color: 'var(--c-success)' },
    { key: 'top', icon: '🏆', label: '最高播放', value: formatNum(topV), trend: '新高', trendDir: 'up', color: '#F59E0B' },
    { key: 'viral', icon: '🔥', label: '爆款率', value: viralPct + '%', trend: '3.2%', trendDir: 'up', color: 'var(--c-danger)' },
  ]
})

// 开头类型数据
const hookTypes = [
  { name: '提问式', percent: 68 },
  { name: '数字式', percent: 54 },
  { name: '反常识', percent: 72 },
  { name: '共鸣式', percent: 45 },
  { name: '悬念式', percent: 61 },
]

// 爆款标签云
const hotTags = computed(() => {
  const tags = [
    { name: '个人成长', w: 1 }, { name: '情感共鸣', w: 0.95 }, { name: '干货分享', w: 0.85 },
    { name: '职场逆袭', w: 0.9 }, { name: '认知升级', w: 0.8 }, { name: '治愈文案', w: 0.7 },
    { name: '创业故事', w: 0.75 }, { name: '人生感悟', w: 0.82 }, { name: '女性力量', w: 0.68 },
    { name: '心理学', w: 0.6 }, { name: '赚钱思维', w: 0.72 },
  ]
  return tags.map(t => ({
    name: t.name,
    weight: t.w,
    size: 12 + Math.round(t.w * 10),
    color: t.w > 0.85 ? 'var(--c-danger)' : t.w > 0.7 ? 'var(--c-warning)' : 'var(--c-text-sec)',
  }))
})

const bestDuration = computed(() => {
  const scripts = store.scriptRecords || []
  if (!scripts.length) return '45-60秒'
  return '38-55秒'
})
const bestPostTime = '20:00 - 22:30'
const viralRate = computed(() => {
  const scripts = store.scriptRecords || []
  if (!scripts.length) return 18
  return Math.round(scripts.filter(r => r.actualLikes >= 10000).length / scripts.length * 100) || 18
})

function trendType(trend: string): 'success' | 'warning' | 'info' | 'danger' {
  if (trend === 'up') return 'success'
  if (trend === 'down') return 'danger'
  return 'info'
}

function formatNum(n: number): string {
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿'
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return n.toString()
}
</script>

<style scoped>
.analysis-center {
  background: var(--c-bg-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--c-shadow);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--c-border-light);
}

.panel-header {
  padding: 12px 14px;
  font-size: 14px;
  font-weight: 600;
  color: var(--c-text);
  border-bottom: 1px solid var(--c-border-light);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--c-bg-card);
}

.time-range {
  flex-shrink: 0;
}

:deep(.time-range .el-radio-button__inner) {
  padding: 4px 10px;
  font-size: 11px;
}

.panel-empty, .panel-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 16px;
  color: var(--c-text-muted);
  font-size: 13px;
}

.panel-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  flex: 1;
}

.section {
  padding-bottom: 12px;
  border-bottom: 1px solid var(--c-border-light);
}
.section:last-child { border-bottom: none; padding-bottom: 0; }

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--c-text);
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 4px;
}

/* 数据概览 */
.overview-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.overview-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  background: var(--c-bg-sec);
  border-radius: var(--radius-md);
  border-left: 3px solid var(--ov-color);
  transition: var(--transition-fast);
}
.overview-card:hover {
  background: var(--c-bg-hover);
  transform: translateY(-1px);
}
.ov-icon {
  font-size: 22px;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--c-bg-card);
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}
.ov-info { flex: 1; min-width: 0; }
.ov-label {
  font-size: 11px;
  color: var(--c-text-muted);
  display: block;
}
.ov-value {
  font-size: 18px;
  font-weight: 700;
  color: var(--c-text);
  display: block;
  line-height: 1.2;
}
.ov-trend {
  font-size: 11px;
  margin-top: 2px;
}
.ov-trend.up { color: var(--c-success); }
.ov-trend.down { color: var(--c-danger); }
.ov-trend.stable { color: var(--c-text-muted); }

/* 平台卡片 */
.platform-card {
  padding: 12px;
  margin-bottom: 10px;
  background: var(--plat-bg);
  border-radius: var(--radius-md);
  border: 1px solid var(--c-border-light);
  transition: var(--transition-fast);
}
.platform-card:hover {
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}
.platform-card:last-child { margin-bottom: 0; }

.platform-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.platform-name {
  display: flex;
  align-items: center;
  gap: 6px;
}
.plat-icon {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: var(--c-primary-text);
}
.plat-text {
  font-size: 13px;
  font-weight: 700;
  color: var(--c-text);
}
.trend-tag { flex-shrink: 0; }
.plat-meta {
  font-size: 11px;
  color: var(--c-text-muted);
}

.plat-hero {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 0 10px;
  border-bottom: 1px dashed var(--c-border);
  margin-bottom: 10px;
}
.hero-value {
  font-size: 28px;
  font-weight: 800;
  color: var(--plat-color);
  line-height: 1;
}
.hero-lbl {
  font-size: 12px;
  color: var(--c-text-sec);
}

/* 指标条 */
.metric-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 10px;
}
.metric-row {
  display: grid;
  grid-template-columns: 80px 52px 1fr;
  gap: 8px;
  align-items: center;
  font-size: 11px;
}
.m-label { color: var(--c-text-sec); }
.m-value {
  font-weight: 700;
  text-align: right;
  font-size: 12px;
}
.m-value.good { color: var(--c-success); }
.m-value.warn { color: var(--c-warning); }
.m-value.bad { color: var(--c-danger); }
.m-bar {
  height: 5px;
  background: var(--c-bg-card);
  border-radius: 3px;
  overflow: hidden;
}
.m-bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width .6s ease;
}

/* CSS 趋势柱图 */
.trend-chart {
  margin-bottom: 8px;
}
.tc-label {
  font-size: 11px;
  color: var(--c-text-muted);
  margin-bottom: 4px;
}
.tc-bars {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 36px;
  padding: 4px 0;
}
.tc-bar {
  flex: 1;
  min-width: 6px;
  border-radius: 2px 2px 0 0;
  transition: height .4s ease;
}

.platform-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 4px;
}

/* 爆款因素 */
.viral-block {
  margin-bottom: 12px;
}
.vb-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--c-text-sec);
  margin-bottom: 8px;
}
.hook-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.hook-item {
  display: grid;
  grid-template-columns: 60px 1fr 38px;
  gap: 8px;
  align-items: center;
  font-size: 11px;
}
.hk-name { color: var(--c-text); }
.hk-bar {
  height: 6px;
  background: var(--c-bg-sec);
  border-radius: 3px;
  overflow: hidden;
}
.hk-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--c-primary), var(--c-accent));
  border-radius: 3px;
}
.hk-pct {
  font-weight: 700;
  color: var(--c-primary);
  text-align: right;
}

.tag-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  padding: 8px;
  background: var(--c-bg-sec);
  border-radius: var(--radius-sm);
}
.tag-cloud-item {
  font-weight: 600;
  cursor: default;
  transition: var(--transition-fast);
}
.tag-cloud-item:hover {
  transform: scale(1.1);
}

.viral-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.vs-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 10px 6px;
  background: var(--c-bg-sec);
  border-radius: var(--radius-sm);
}
.vs-icon { font-size: 18px; }
.vs-label { font-size: 11px; color: var(--c-text-muted); }
.vs-value { font-size: 14px; font-weight: 700; color: var(--c-text); }

/* 用户画像 */
.profile-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.profile-item {
  padding: 8px;
  background: var(--c-bg-sec);
  border-radius: var(--radius-sm);
}
.p-label {
  display: block;
  font-size: 11px;
  color: var(--c-text-muted);
}
.p-value {
  display: block;
  font-size: 13px;
  color: var(--c-text);
  font-weight: 600;
  margin-top: 2px;
}
.tag-list {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 6px;
}
</style>
