import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ChatFavorite } from '@/types/chat'

const STORAGE_KEY = 'copywriting-chat-favorites'

export const useChatFavoritesStore = defineStore('chatFavorites', () => {
  const favorites = ref<ChatFavorite[]>(loadFavorites())

  function loadFavorites(): ChatFavorite[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY)
      return data ? JSON.parse(data) : []
    } catch {
      return []
    }
  }

  function saveFavorites() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites.value))
  }

  /** 收藏一条对话 */
  function addFavorite(item: Omit<ChatFavorite, 'id' | 'addedAt'>): ChatFavorite {
    const exists = favorites.value.find(f => f.messageId === item.messageId)
    if (exists) return exists

    const favorite: ChatFavorite = {
      ...item,
      id: 'fav_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      addedAt: new Date().toLocaleString('zh-CN')
    }
    favorites.value.unshift(favorite)
    saveFavorites()
    return favorite
  }

  /** 取消收藏 */
  function removeFavorite(messageId: string) {
    favorites.value = favorites.value.filter(f => f.messageId !== messageId)
    saveFavorites()
  }

  /** 检查是否已收藏 */
  function isFavorited(messageId: string): boolean {
    return favorites.value.some(f => f.messageId === messageId)
  }

  /** 获取收藏数量 */
  const count = computed(() => favorites.value.length)

  /** 搜索收藏内容 */
  function searchFavorites(keyword: string): ChatFavorite[] {
    if (!keyword.trim()) return favorites.value
    const lower = keyword.toLowerCase()
    return favorites.value.filter(f =>
      f.question.toLowerCase().includes(lower) ||
      f.answer.toLowerCase().includes(lower) ||
      f.content.toLowerCase().includes(lower) ||
      f.modelName.toLowerCase().includes(lower)
    )
  }

  return {
    favorites,
    count,
    addFavorite,
    removeFavorite,
    isFavorited,
    searchFavorites
  }
})
