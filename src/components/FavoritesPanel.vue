<template>
  <div class="favorites-sidebar">
    <div class="fav-header">
      <span class="title">⭐ 收藏夹</span>
      <span class="count" v-if="favoritesStore.favorites.length">{{ favoritesStore.favorites.length }}</span>
    </div>
    <div class="fav-list" v-if="favoritesStore.favorites.length > 0">
      <div
        v-for="item in favoritesStore.favorites"
        :key="item.path"
        class="fav-item"
        @click="navigateToFile(item)"
      >
        <el-icon><Document /></el-icon>
        <div class="fav-info">
          <span class="fav-name">{{ item.fileName }}</span>
          <span class="fav-path" :title="item.path">{{ item.path }}</span>
        </div>
        <el-tooltip content="打开文件位置">
          <el-button size="small" text @click.stop="openLocation(item.path)">
            <el-icon><FolderOpened /></el-icon>
          </el-button>
        </el-tooltip>
        <el-tooltip content="取消收藏">
          <el-button size="small" text @click.stop="removeFav(item.path)">
            <el-icon><Close /></el-icon>
          </el-button>
        </el-tooltip>
      </div>
    </div>
    <div class="empty-favs" v-else>
      <span>暂无收藏</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { useFavoritesStore, type FavoriteItem } from '@/stores/favorites'
import { useFileStore } from '@/stores/file'

const favoritesStore = useFavoritesStore()
const fileStore = useFileStore()

async function navigateToFile(item: FavoriteItem) {
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
.favorites-sidebar {
  border-top: 1px solid #e4e7ed;
  max-height: 250px;
  display: flex;
  flex-direction: column;
}

.fav-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
}

.title {
  font-weight: 600;
  font-size: 14px;
}

.count {
  font-size: 12px;
  background: #409eff;
  color: #fff;
  padding: 1px 8px;
  border-radius: 10px;
}

.fav-list {
  flex: 1;
  overflow-y: auto;
}

.fav-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.15s;
}

.fav-item:hover {
  background: #f0f2f5;
}

.fav-info {
  flex: 1;
  overflow: hidden;
}

.fav-name {
  display: block;
  font-weight: 500;
  color: #303133;
}

.fav-path {
  display: block;
  font-size: 11px;
  color: #909399;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-favs {
  padding: 16px;
  text-align: center;
  color: #909399;
  font-size: 13px;
}
</style>
