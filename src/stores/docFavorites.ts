import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface DocSnippet {
  id: string
  /** 选中的文字内容 */
  text: string
  /** 来源文件路径 */
  filePath: string
  /** 来源文件名 */
  fileName: string
  /** 所属文件夹ID（null 表示根目录） */
  folderId: string | null
  /** 收藏时间 */
  addedAt: string
}

export interface DocFolder {
  id: string
  name: string
  createdAt: string
}

const SNIPPETS_KEY = 'copywriting-doc-snippets'
const FOLDERS_KEY = 'copywriting-doc-folders'

export const useDocFavoritesStore = defineStore('docFavorites', () => {
  const snippets = ref<DocSnippet[]>(loadSnippets())
  const folders = ref<DocFolder[]>(loadFolders())

  function loadSnippets(): DocSnippet[] {
    try {
      const data = localStorage.getItem(SNIPPETS_KEY)
      if (!data) return []
      const arr: DocSnippet[] = JSON.parse(data)
      // 迁移：补全可能缺失的字段
      for (const s of arr) {
        if (s.folderId === undefined) s.folderId = null
      }
      return arr
    } catch { return [] }
  }

  function saveSnippets() {
    localStorage.setItem(SNIPPETS_KEY, JSON.stringify(snippets.value))
  }

  function loadFolders(): DocFolder[] {
    try {
      const data = localStorage.getItem(FOLDERS_KEY)
      return data ? JSON.parse(data) : []
    } catch { return [] }
  }

  function saveFolders() {
    localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders.value))
  }

  /** 添加文字收藏 */
  function addSnippet(text: string, filePath: string, fileName: string): DocSnippet {
    const snippet: DocSnippet = {
      id: 'snip_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      text,
      filePath,
      fileName,
      folderId: null,
      addedAt: new Date().toLocaleString('zh-CN')
    }
    snippets.value.unshift(snippet)
    saveSnippets()
    return snippet
  }

  /** 删除收藏 */
  function removeSnippet(id: string) {
    snippets.value = snippets.value.filter(s => s.id !== id)
    saveSnippets()
  }

  /** 移动收藏到文件夹 */
  function moveSnippetToFolder(snippetId: string, folderId: string | null) {
    const s = snippets.value.find(s => s.id === snippetId)
    if (s) {
      s.folderId = folderId
      saveSnippets()
    }
  }

  /** 创建文件夹 */
  function createFolder(name: string): DocFolder {
    const folder: DocFolder = {
      id: 'docfolder_' + Date.now(),
      name: name.trim() || '未命名文件夹',
      createdAt: new Date().toISOString()
    }
    folders.value.push(folder)
    saveFolders()
    return folder
  }

  /** 重命名文件夹 */
  function renameFolder(folderId: string, name: string) {
    const folder = folders.value.find(f => f.id === folderId)
    if (folder) {
      folder.name = name.trim() || '未命名文件夹'
      saveFolders()
    }
  }

  /** 删除文件夹 */
  function deleteFolder(folderId: string) {
    folders.value = folders.value.filter(f => f.id !== folderId)
    for (const s of snippets.value) {
      if (s.folderId === folderId) s.folderId = null
    }
    saveFolders()
    saveSnippets()
  }

  function getFolderCount(folderId: string): number {
    return snippets.value.filter(s => s.folderId === folderId).length
  }

  /** 搜索 */
  function searchSnippets(keyword: string): DocSnippet[] {
    const kw = keyword.toLowerCase()
    if (!kw) return snippets.value
    return snippets.value.filter(s =>
      s.text.toLowerCase().includes(kw) ||
      s.fileName.toLowerCase().includes(kw)
    )
  }

  return {
    snippets,
    folders,
    addSnippet,
    removeSnippet,
    moveSnippetToFolder,
    createFolder,
    renameFolder,
    deleteFolder,
    getFolderCount,
    searchSnippets,
  }
})
