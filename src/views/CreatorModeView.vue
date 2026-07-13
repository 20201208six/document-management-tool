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

    <KeepAlive>
      <component :is="currentTab" />
    </KeepAlive>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useCreatorModeStore } from '@/stores/creatorMode'
import { useEventBus } from '@/services/eventBus'
import VideoClipper from '@/components/creator/VideoClipper.vue'
import WorkflowPanel from '@/components/creator/WorkflowPanel.vue'

const store = useCreatorModeStore()
const { on } = useEventBus()

const currentTab = computed(() =>
  store.subMode === 'work-state' ? VideoClipper : WorkflowPanel
)

// 监听子模式切换事件（事件驱动示例）
on('creator:ui:subModeChanged', ({ mode }) => {
  const label = mode === 'work-state' ? '工作状态' : '官方工作流'
  ElMessage.info(`已切换到「${label}」模式`)
})

// 监听工作流执行完成事件（跨组件通知示例）
on('creator:workflow:executionCompleted', ({ successCount, errorCount }) => {
  if (errorCount === 0) {
    ElMessage.success(`工作流执行完毕：${successCount} 个节点全部成功`)
  } else {
    ElMessage.warning(`工作流执行完毕：${successCount} 成功, ${errorCount} 失败`)
  }
})
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
