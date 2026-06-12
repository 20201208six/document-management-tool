<template>
  <div class="automation-mode">
    <div class="automation-header">
      <div class="header-left">
        <el-icon><Connection /></el-icon>
        <span class="header-title">自动化工作流</span>
        <span class="header-desc">通过可视化节点编排，自动化处理文案生成、格式转换、文件输出等任务</span>
      </div>
    </div>
    <InfiniteCanvas />
  </div>
</template>

<script setup lang="ts">
import InfiniteCanvas from '@/components/creator/InfiniteCanvas.vue'
</script>

<style scoped>
.automation-mode {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f5f6fa;
  overflow: hidden;
}

.automation-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  height: 44px;
  min-height: 44px;
  gap: 12px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.header-title {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  white-space: nowrap;
}

.header-desc {
  font-size: 11px;
  color: #c0c4cc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
</style>
