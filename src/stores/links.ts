import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface Bookmark {
  id: string
  /** 用户自定义名称 */
  name: string
  /** URL */
  url: string
  /** 所属分类（null=未分类） */
  category: string | null
  createdAt: string
}

export interface BookmarkCategory {
  id: string
  name: string
}

const BOOKMARKS_KEY = 'copywriting-bookmarks'
const CATEGORIES_KEY = 'copywriting-bookmark-categories'

export const useLinkStore = defineStore('links', () => {
  const bookmarks = ref<Bookmark[]>(loadBookmarks())
  const categories = ref<BookmarkCategory[]>(loadCategories())

  function loadBookmarks(): Bookmark[] {
    try {
      const data = localStorage.getItem(BOOKMARKS_KEY)
      return data ? JSON.parse(data) : []
    } catch { return [] }
  }
  function saveBookmarks() {
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks.value))
  }

  function loadCategories(): BookmarkCategory[] {
    try {
      const data = localStorage.getItem(CATEGORIES_KEY)
      return data ? JSON.parse(data) : []
    } catch { return [] }
  }
  function saveCategories() {
    localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories.value))
  }

  /** 从文本中提取 URL */
  function extractUrl(text: string): string | null {
    const match = text.match(/https?:\/\/[^\s`"']+/)
    return match ? match[0] : null
  }

  /** 添加书签 */
  function addBookmark(url: string, name: string, category: string | null = null): Bookmark {
    const existing = bookmarks.value.find(b => b.url === url)
    if (existing) return existing
    const bm: Bookmark = {
      id: 'bm_' + Date.now(),
      name: name || new URL(url).hostname,
      url,
      category,
      createdAt: new Date().toLocaleString('zh-CN')
    }
    bookmarks.value.unshift(bm)
    saveBookmarks()
    return bm
  }

  function removeBookmark(id: string) {
    bookmarks.value = bookmarks.value.filter(b => b.id !== id)
    saveBookmarks()
  }

  function updateBookmark(id: string, patch: Partial<Pick<Bookmark, 'name' | 'category'>>) {
    const bm = bookmarks.value.find(b => b.id === id)
    if (bm) { Object.assign(bm, patch); saveBookmarks() }
  }

  function moveBookmarkToCategory(bookmarkId: string, category: string | null) {
    const bm = bookmarks.value.find(b => b.id === bookmarkId)
    if (bm) { bm.category = category; saveBookmarks() }
  }

  /** 分类管理 */
  function addCategory(name: string): BookmarkCategory {
    const cat: BookmarkCategory = { id: 'cat_' + Date.now(), name: name.trim() || '未命名' }
    categories.value.push(cat)
    saveCategories()
    return cat
  }

  function removeCategory(id: string) {
    categories.value = categories.value.filter(c => c.id !== id)
    for (const b of bookmarks.value) { if (b.category === id) b.category = null }
    saveCategories()
    saveBookmarks()
  }

  function renameCategory(id: string, name: string) {
    const c = categories.value.find(c => c.id === id)
    if (c) { c.name = name.trim() || '未命名'; saveCategories() }
  }

  function getCategoryBookmarks(categoryId: string): Bookmark[] {
    return bookmarks.value.filter(b => b.category === categoryId)
  }

  return {
    bookmarks,
    categories,
    addBookmark,
    removeBookmark,
    updateBookmark,
    moveBookmarkToCategory,
    extractUrl,
    addCategory,
    removeCategory,
    renameCategory,
    getCategoryBookmarks,
  }
})
