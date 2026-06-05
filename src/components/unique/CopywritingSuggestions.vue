<template>
  <div class="suggestions-panel">
    <div class="panel-header">
      <span>文案建议</span>
      <el-button
        size="small"
        type="primary"
        text
        :loading="store.isGeneratingSuggestion"
        @click="store.generateSuggestions()"
        :disabled="!store.accountName"
      >
        <el-icon><Refresh /></el-icon>
        生成建议
      </el-button>
    </div>

    <div v-if="!store.accountName" class="panel-empty">
      <span>请先设置分析账号</span>
    </div>

    <div v-else-if="store.suggestions.length === 0 && !store.isGeneratingSuggestion" class="panel-empty">
      <span>点击「生成建议」获取AI文案推荐</span>
    </div>

    <div v-else-if="store.isGeneratingSuggestion" class="panel-loading">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>AI 正在生成文案建议...</span>
    </div>

    <div v-else class="suggestion-list">
      <div
        v-for="sug in store.suggestions"
        :key="sug.id"
        class="suggestion-card"
      >
        <div class="sug-header">
          <span class="sug-title">{{ sug.title }}</span>
          <el-tag size="small" type="success">{{ sug.estimatedTraffic }}</el-tag>
        </div>
        <p class="sug-content">{{ sug.content }}</p>
        <div class="sug-footer">
          <el-tag size="small">{{ sug.platform }}</el-tag>
          <span class="sug-highlight">{{ sug.highlight }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useUniqueModeStore } from '@/stores/uniqueMode'

const store = useUniqueModeStore()
</script>

<style scoped>
.suggestions-panel {
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
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
  padding: 32px 16px;
  color: #c0c4cc;
  font-size: 13px;
}

.suggestion-list {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 350px;
  overflow-y: auto;
}

.suggestion-card {
  padding: 10px 12px;
  background: #fafafa;
  border-radius: 6px;
  border: 1px solid #f0f2f5;
}

.sug-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.sug-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.sug-content {
  font-size: 13px;
  color: #606266;
  line-height: 1.6;
  margin: 0 0 8px;
}

.sug-footer {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sug-highlight {
  font-size: 12px;
  color: #909399;
}
</style>
