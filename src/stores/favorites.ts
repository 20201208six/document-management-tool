import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface FavoriteItem {
  fileName: string
  path: string
  addedAt: string
}

const STORAGE_KEY = 'copywriting-favorites'

export const useFavoritesStore = defineStore('favorites', () => {
  const favorites = ref<FavoriteItem[]>(loadFavorites())

  function loadFavorites(): FavoriteItem[] {
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

  function addFavorite(fileName: string, path: string) {
    const exists = favorites.value.find(f => f.path === path)
    if (exists) return
    favorites.value.push({
      fileName,
      path,
      addedAt: new Date().toLocaleString('zh-CN')
    })
    saveFavorites()
  }

  function removeFavorite(path: string) {
    favorites.value = favorites.value.filter(f => f.path !== path)
    saveFavorites()
  }

  function isFavorite(path: string): boolean {
    return favorites.value.some(f => f.path === path)
  }

  return {
    favorites,
    addFavorite,
    removeFavorite,
    isFavorite,
  }
})
