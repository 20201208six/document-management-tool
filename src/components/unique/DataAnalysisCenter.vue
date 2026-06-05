<template>
  <div class="analysis-center">
    <div class="panel-header">数据分析中心</div>

    <div v-if="!store.accountName" class="panel-empty">
      <span>请先设置分析账号</span>
    </div>

    <div v-else-if="store.isLoadingAccount" class="panel-loading">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>搜索中...</span>
    </div>

    <div v-else class="panel-body">
      <!-- 用户画像 -->
      <div class="section">
        <div class="section-title">用户画像</div>
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
          <el-tag v-for="tag in store.userProfile.interests" :key="tag" size="small" type="info">{{ tag }}</el-tag>
        </div>
      </div>

      <!-- 平台数据 -->
      <div class="section">
        <div class="section-title">多平台数据</div>
        <div
          v-for="acc in store.platformAccounts"
          :key="acc.platform"
          class="platform-card"
        >
          <div class="platform-name">
            <span class="plat-icon">{{ platformIcon(acc.platform) }}</span>
            {{ acc.platform }}
            <el-tag :type="trendType(acc.recentTrend)" size="small" class="trend-tag">
              {{ trendLabel(acc.recentTrend) }}
            </el-tag>
          </div>
          <div class="platform-stats">
            <div class="stat">
              <span class="stat-val">{{ formatNum(acc.followers) }}</span>
              <span class="stat-lbl">粉丝</span>
            </div>
            <div class="stat">
              <span class="stat-val">{{ formatNum(acc.avgViews) }}</span>
              <span class="stat-lbl">均观看</span>
            </div>
            <div class="stat">
              <span class="stat-val">{{ formatNum(acc.avgLikes) }}</span>
              <span class="stat-lbl">均点赞</span>
            </div>
          </div>
          <div class="platform-tags">
            <el-tag v-for="tag in acc.topTags" :key="tag" size="small">{{ tag }}</el-tag>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useUniqueModeStore } from '@/stores/uniqueMode'

const store = useUniqueModeStore()

function platformIcon(platform: string): string {
  const icons: Record<string, string> = { '抖音': '🎵', '小红书': '📕', '快手': '📱' }
  return icons[platform] || '🌐'
}

function trendType(trend: string): 'success' | 'warning' | 'info' | 'danger' {
  if (trend === 'up') return 'success'
  if (trend === 'down') return 'danger'
  return 'info'
}

function trendLabel(trend: string): string {
  if (trend === 'up') return '↑ 上升'
  if (trend === 'down') return '↓ 下降'
  return '→ 平稳'
}

function formatNum(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w'
  return n.toString()
}
</script>

<style scoped>
.analysis-center {
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
  overflow: hidden;
}

.panel-header {
  padding: 10px 14px;
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  border-bottom: 1px solid #f0f2f5;
}

.panel-empty, .panel-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 16px;
  color: #c0c4cc;
  font-size: 13px;
}

.panel-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section {
  padding-bottom: 12px;
  border-bottom: 1px solid #f5f7fa;
}

.section:last-child { border-bottom: none; padding-bottom: 0; }

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: #606266;
  margin-bottom: 8px;
}

.profile-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.profile-item {
  padding: 6px 8px;
  background: #fafafa;
  border-radius: 4px;
}

.p-label {
  display: block;
  font-size: 11px;
  color: #909399;
}

.p-value {
  display: block;
  font-size: 13px;
  color: #303133;
  font-weight: 500;
  margin-top: 2px;
}

.tag-list {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 6px;
}

.platform-card {
  padding: 8px;
  margin-bottom: 6px;
  background: #fafafa;
  border-radius: 6px;
}

.platform-name {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 6px;
}

.plat-icon { font-size: 14px; }
.trend-tag { margin-left: auto; }

.platform-stats {
  display: flex;
  gap: 12px;
}

.stat {
  text-align: center;
}

.stat-val {
  display: block;
  font-size: 16px;
  font-weight: 700;
  color: #409eff;
}

.stat-lbl {
  display: block;
  font-size: 11px;
  color: #909399;
}

.platform-tags {
  display: flex;
  gap: 4px;
  margin-top: 6px;
}
</style>
