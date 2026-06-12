<template>
  <div class="unique-mode">
    <!-- 顶部栏 -->
    <div class="unique-header">
      <div class="account-section">
        <span class="account-label">当前账号：</span>
        <span v-if="store.accountName" class="account-name">@{{ store.accountName }}</span>
        <span v-else class="account-placeholder">未设置</span>
        <el-button size="small" text @click="showAccountDialog = true">
          <el-icon><Edit /></el-icon>
          {{ store.accountName ? '切换' : '设置账号' }}
        </el-button>
      </div>
      <el-tooltip content="模型管理" placement="bottom">
        <el-button size="small" circle @click="openModelManager">
          <el-icon><Setting /></el-icon>
        </el-button>
      </el-tooltip>
    </div>

    <!-- 主内容区：两栏布局 -->
    <div class="unique-body">
      <!-- 左侧：智能对话 + 文件浏览 -->
      <div class="unique-left">
        <div class="unique-chat-panel">
          <UniqueChatPanel />
        </div>
        <div class="unique-file-browser">
          <UniqueFileBrowser />
        </div>
      </div>

      <!-- 右侧：数据分析 + 文案建议 -->
      <div class="unique-right">
        <DataAnalysisCenter />
        <CopywritingSuggestions />
      </div>
    </div>

    <!-- 账号输入弹窗 -->
    <el-dialog v-model="showAccountDialog" title="设置分析账号" width="420px">
      <el-form label-width="80px">
        <el-form-item label="账号名称">
          <el-input v-model="accountInput" placeholder="输入抖音/小红书/快手账号名" @keyup.enter="confirmAccount" />
        </el-form-item>
      </el-form>
      <div class="dialog-tip">输入账号名称后，将在多平台搜索并分析该账号的数据</div>
      <template #footer>
        <el-button @click="showAccountDialog = false">取消</el-button>
        <el-button type="primary" @click="confirmAccount" :loading="store.isLoadingAccount">
          搜索并分析
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, inject } from 'vue'
import { Setting } from '@element-plus/icons-vue'
import { useUniqueModeStore } from '@/stores/uniqueMode'
import UniqueChatPanel from '@/components/unique/UniqueChatPanel.vue'
import UniqueFileBrowser from '@/components/unique/UniqueFileBrowser.vue'
import DataAnalysisCenter from '@/components/unique/DataAnalysisCenter.vue'
import CopywritingSuggestions from '@/components/unique/CopywritingSuggestions.vue'

const store = useUniqueModeStore()
const showAccountDialog = ref(!store.accountName)

// 使用全局模型管理对话框
const globalModelManager = inject<ReturnType<typeof ref<boolean>>>('showGlobalModelManager', ref(false))
function openModelManager() {
  globalModelManager.value = true
}
const accountInput = ref(store.accountName)

async function confirmAccount() {
  if (!accountInput.value.trim()) return
  await store.searchAccount(accountInput.value.trim())
  showAccountDialog.value = false
}
</script>

<style scoped>
.unique-mode {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f5f6fa;
  overflow: hidden;
}

.unique-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 20px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  height: 44px;
  min-height: 44px;
}

.account-section {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.account-label {
  color: #909399;
}

.account-name {
  font-weight: 600;
  color: #409eff;
}

.account-placeholder {
  color: #c0c4cc;
  font-style: italic;
}

.unique-body {
  flex: 1;
  display: flex;
  gap: 12px;
  padding: 12px;
  overflow: hidden;
}

.unique-left {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  overflow: hidden;
}

.unique-chat-panel {
  flex: 1;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
  overflow: hidden;
  min-height: 300px;
}

.unique-file-browser {
  height: 180px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
  overflow: hidden;
}

.unique-right {
  width: 380px;
  min-width: 380px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
}

.dialog-tip {
  padding: 12px 0;
  font-size: 13px;
  color: #909399;
  text-align: center;
}
</style>
