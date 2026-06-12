<template>
  <div class="creator-mode">
    <!-- 子模式切换 -->
    <div class="creator-header">
      <div class="submode-tabs">
        <button
          class="submode-tab"
          :class="{ active: store.subMode === 'work-state' }"
          @click="store.switchSubMode('work-state')"
        >
          <el-icon><VideoCamera /></el-icon>
          工作状态
        </button>
        <button
          class="submode-tab"
          :class="{ active: store.subMode === 'workflow' }"
          @click="store.switchSubMode('workflow')"
        >
          <el-icon><Connection /></el-icon>
          官方工作流
        </button>
      </div>
    </div>

    <!-- 工作状态 -->
    <VideoClipper v-if="store.subMode === 'work-state'" />

    <!-- 工作流 -->
    <WorkflowPanel v-if="store.subMode === 'workflow'" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useCreatorModeStore } from '@/stores/creatorMode'
import VideoClipper from '@/components/creator/VideoClipper.vue'
import WorkflowPanel from '@/components/creator/WorkflowPanel.vue'

const store = useCreatorModeStore()
</script>

<style scoped>
.creator-mode {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f5f6fa;
  overflow: hidden;
}

.creator-header {
  display: flex;
  align-items: center;
  padding: 0 20px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  height: 44px;
  min-height: 44px;
  gap: 16px;
}

.header-spacer { flex: 1; }

.submode-tabs {
  display: flex;
  gap: 4px;
}

.submode-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  background: transparent;
  color: #909399;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s;
}

.submode-tab:hover { color: #409eff; background: #ecf5ff; }
.submode-tab.active { color: #409eff; background: #ecf5ff; }
</style>
