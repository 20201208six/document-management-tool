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
          工作流
        </button>
      </div>

      <!-- 工作流子 Tab -->
      <div v-if="store.subMode === 'workflow'" class="wf-subtabs">
        <button
          class="subtab-btn"
          :class="{ active: wfSubTab === 'official' }"
          @click="wfSubTab = 'official'"
        >官方工作流</button>
        <button
          class="subtab-btn"
          :class="{ active: wfSubTab === 'canvas' }"
          @click="wfSubTab = 'canvas'"
        >自定义画布</button>
      </div>
    </div>

    <!-- 工作状态 -->
    <VideoClipper v-if="store.subMode === 'work-state'" />

    <!-- 工作流：官方工作流 + 自定义画布 -->
    <template v-if="store.subMode === 'workflow'">
      <WorkflowPanel v-if="wfSubTab === 'official'" />
      <InfiniteCanvas v-if="wfSubTab === 'canvas'" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useCreatorModeStore } from '@/stores/creatorMode'
import VideoClipper from '@/components/creator/VideoClipper.vue'
import WorkflowPanel from '@/components/creator/WorkflowPanel.vue'
import InfiniteCanvas from '@/components/creator/InfiniteCanvas.vue'

const store = useCreatorModeStore()
const wfSubTab = ref<'official' | 'canvas'>('official')
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

.wf-subtabs {
  display: flex;
  gap: 2px;
  margin-left: 8px;
  padding-left: 8px;
  border-left: 1px solid #e4e7ed;
}

.subtab-btn {
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 500;
  border: none;
  background: transparent;
  color: #909399;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.15s;
}

.subtab-btn:hover { color: #67c23a; background: #f0f9eb; }
.subtab-btn.active { color: #67c23a; background: #f0f9eb; }
</style>
