<template>
  <div class="favorites-full">
    <div class="fav-full-header">
      <h3>⭐ 收藏夹</h3>
      <span class="fav-count">{{ favoritesStore.favorites.length }} 项</span>
    </div>
    <el-table :data="favoritesStore.favorites" stripe size="small" empty-text="暂无收藏" height="100%">
      <el-table-column prop="fileName" label="文件名" min-width="200">
        <template #default="{ row }">
          <div class="table-file-cell">
            <el-icon><Document /></el-icon>
            <span>{{ row.fileName }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="path" label="文件路径" min-width="300">
        <template #default="{ row }">
          <span class="table-path" :title="row.path">{{ row.path }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="addedAt" label="收藏时间" width="170" />
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" text @click="navigateToFile(row)">打开</el-button>
          <el-button size="small" text @click="openLocation(row.path)">文件位置</el-button>
          <el-button size="small" type="danger" text @click="removeFav(row.path)">取消</el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { useFavoritesStore, type FavoriteItem } from '@/stores/favorites'
import { useFileStore } from '@/stores/file'

const favoritesStore = useFavoritesStore()
const fileStore = useFileStore()

async function navigateToFile(item: FavoriteItem) {
  // 如果文件已打开，直接切到对应标签页
  const existingTab = fileStore.openTabs.find(t => t.path === item.path)
  if (existingTab) {
    fileStore.switchToTab(item.path)
    fileStore.activeTab = 'editor'
    return
  }
  const pathParts = item.path.replace(/\\/g, '/').split('/')
  pathParts.pop()
  const folderPath = pathParts.join('\\')
  await fileStore.setFolder(folderPath)
  const fileEntry = fileStore.files.find(f => f.path === item.path)
  if (fileEntry) {
    await fileStore.selectFile(fileEntry)
    fileStore.activeTab = 'editor'
  }
}

async function openLocation(filePath: string) {
  await window.electronAPI.openFileLocation(filePath)
}

function removeFav(path: string) {
  favoritesStore.removeFavorite(path)
  ElMessage.success('已取消收藏')
}
</script>

<style scoped>
.favorites-full {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fff;
  border-radius: 8px;
  padding: 16px;
}

.fav-full-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.fav-full-header h3 {
  font-size: 16px;
  margin: 0;
}

.fav-count {
  font-size: 13px;
  color: #909399;
}

.table-file-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}

.table-path {
  font-size: 12px;
  color: #606266;
}
</style>
