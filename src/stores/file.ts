import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { FileEntry } from '@/env'

interface Tab {
  name: string
  path: string
  type: string
  content: string
  savedContent: string
}

interface FolderPath {
  id: string
  path: string
  label: string
  group: string
  isValid: boolean
}

const STORAGE_KEY = 'fixed-folder-paths'
let idCounter = 0

function loadFixedPaths(): FolderPath[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const arr = JSON.parse(raw) as FolderPath[]
      idCounter = arr.reduce((max, p) => Math.max(max, parseInt(p.id) || 0), 0) + 1
      return arr.map(p => ({ ...p, isValid: true }))
    }
  } catch {}
  return []
}

function saveFixedPaths(paths: FolderPath[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(paths))
}

export const useFileStore = defineStore('file', () => {
  const currentFolder = ref('')
  const files = ref<FileEntry[]>([])
  const isLoading = ref(false)
  const activeTab = ref('editor')
  const highlightKeyword = ref('')
  const highlightMatchText = ref('')
  const searchJumpId = ref(0)
  const openTabs = ref<Tab[]>([])
  const activeTabPath = ref('')
  const folderPaths = ref<FolderPath[]>(loadFixedPaths())
  const activePathId = ref(folderPaths.value[0]?.id || '')

  const selectedFile = computed<FileEntry | null>(() => {
    const tab = openTabs.value.find(t => t.path === activeTabPath.value)
    if (!tab) return null
    return { name: tab.name, path: tab.path, isDirectory: false, isFile: true }
  })

  const fileContent = computed(() => {
    const tab = openTabs.value.find(t => t.path === activeTabPath.value)
    return tab?.content || ''
  })

  const fileType = computed(() => {
    const tab = openTabs.value.find(t => t.path === activeTabPath.value)
    return tab?.type || ''
  })

  function addFolderPath(fp: FolderPath) {
    const exists = folderPaths.value.find(f => f.path.toLowerCase() === fp.path.toLowerCase())
    if (exists) return false
    const id = `${++idCounter}`
    folderPaths.value.push({ ...fp, id, isValid: true })
    saveFixedPaths(folderPaths.value.filter(f => fp.group ? f.group === fp.group || !f.group.includes('临时') : true))
    if (!activePathId.value) activePathId.value = id
    refreshFiles()
    return true
  }

  function addTempPath(path: string, label: string) {
    const exists = folderPaths.value.find(f => f.path.toLowerCase() === path.toLowerCase())
    if (exists) {
      activePathId.value = exists.id
      refreshFiles()
      return
    }
    const id = `temp_${++idCounter}`
    folderPaths.value.push({ id, path, label, group: '临时', isValid: true })
    activePathId.value = id
    refreshFiles()
  }

  function removeFolderPath(id: string) {
    folderPaths.value = folderPaths.value.filter(f => f.id !== id)
    saveFixedPaths(folderPaths.value.filter(f => f.group !== '临时'))
    if (activePathId.value === id) {
      activePathId.value = folderPaths.value[0]?.id || ''
    }
    refreshFiles()
  }

  function updateFolderPath(id: string, patch: Partial<FolderPath>) {
    const fp = folderPaths.value.find(f => f.id === id)
    if (fp) {
      Object.assign(fp, patch)
      saveFixedPaths(folderPaths.value.filter(f => f.group !== '临时'))
      refreshFiles()
    }
  }

  function validatePath(id: string) {
    const fp = folderPaths.value.find(f => f.id === id)
    if (!fp) return
    window.electronAPI.readDirectory(fp.path).then(() => {
      fp.isValid = true
    }).catch(() => {
      fp.isValid = false
    })
  }

  function isDirty(path: string): boolean {
    const tab = openTabs.value.find(t => t.path === path)
    if (!tab) return false
    const strip = (h: string) => {
      const d = document.createElement('div')
      d.innerHTML = h
      return (d.textContent || '').trim()
    }
    return strip(tab.content) !== strip(tab.savedContent)
  }

  function isActiveDirty(): boolean {
    return isDirty(activeTabPath.value)
  }

  function updateTabContent(path: string, content: string) {
    const tab = openTabs.value.find(t => t.path === path)
    if (tab) tab.content = content
  }

  function markSaved(path: string) {
    const tab = openTabs.value.find(t => t.path === path)
    if (tab) tab.savedContent = tab.content
  }

  async function openFileInTab(entry: FileEntry & { type?: string; content?: string }) {
    if (entry.isDirectory) {
      currentFolder.value = entry.path
      await refreshFiles()
      return
    }
    const existing = openTabs.value.find(t => t.path === entry.path)
    if (existing) {
      activeTabPath.value = entry.path
      return
    }
    isLoading.value = true
    try {
      const result = await window.electronAPI.readFileContent(entry.path)
      const tab: Tab = {
        name: entry.name,
        path: entry.path,
        type: result.type,
        content: result.content,
        savedContent: result.content
      }
      openTabs.value.push(tab)
      activeTabPath.value = entry.path
    } catch {
      const tab: Tab = {
        name: entry.name,
        path: entry.path,
        type: 'text',
        content: '',
        savedContent: ''
      }
      openTabs.value.push(tab)
      activeTabPath.value = entry.path
    } finally {
      isLoading.value = false
    }
  }

  function switchToTab(path: string): boolean {
    activeTabPath.value = path
    return true
  }

  function closeTab(path: string) {
    const idx = openTabs.value.findIndex(t => t.path === path)
    if (idx === -1) return
    openTabs.value.splice(idx, 1)
    if (activeTabPath.value === path) {
      if (openTabs.value.length > 0) {
        const newIdx = Math.min(idx, openTabs.value.length - 1)
        activeTabPath.value = openTabs.value[newIdx].path
      } else {
        activeTabPath.value = ''
      }
    }
  }

  function closeOtherTabs(path: string) {
    openTabs.value = openTabs.value.filter(t => t.path === path)
    activeTabPath.value = path
  }

  function closeAllTabs() {
    openTabs.value = []
    activeTabPath.value = ''
  }

  async function setFolder(folderPath: string) {
    const label = folderPath.split(/[/\\]/).pop() || folderPath
    addTempPath(folderPath, label)
  }

  async function refreshFiles() {
    const active = folderPaths.value.find(f => f.id === activePathId.value)
    if (!active || !active.isValid) {
      files.value = []
      return
    }
    try {
      const entries = await window.electronAPI.readDirectory(active.path)
      entries.forEach(e => { (e as any).folderLabel = active.label })
      files.value = entries
      currentFolder.value = active.path
    } catch {
      active.isValid = false
      files.value = []
    }
  }

  async function searchAllPaths(keyword: string) {
    const all: any[] = []
    for (const fp of folderPaths.value) {
      if (!fp.isValid) continue
      try {
        const results = await window.electronAPI.searchInFiles(fp.path, keyword)
        results.forEach((r: any) => { r.folderLabel = fp.label })
        all.push(...results)
      } catch {}
    }
    return all
  }

  watch(activePathId, () => refreshFiles(), { immediate: true })

  async function selectFile(entry: FileEntry) {
    await openFileInTab(entry)
  }

  function navigateToSearchResult(keyword: string, matchText: string) {
    highlightKeyword.value = keyword
    highlightMatchText.value = matchText
    searchJumpId.value++
    activeTab.value = 'editor'
  }

  async function deleteSelectedFile() {
    if (!selectedFile.value) return
    const result = await window.electronAPI.deleteFile(selectedFile.value.path)
    if (result.success) {
      closeTab(selectedFile.value.path)
      await refreshFiles()
    }
    return result
  }

  async function saveFile(content: string) {
    if (!selectedFile.value) return { success: false, error: '未选择文件' }
    const ext = selectedFile.value.name.split('.').pop()?.toLowerCase()
    let result
    if (ext === 'docx') {
      result = await window.electronAPI.saveDocxFile(selectedFile.value.path, content)
    } else if (ext === 'xlsx') {
      result = await window.electronAPI.saveXlsxFile(selectedFile.value.path, content)
    } else {
      result = await window.electronAPI.saveTextFile(selectedFile.value.path, content)
    }
    if (result.success) {
      markSaved(selectedFile.value.path)
    }
    return result
  }

  async function createFile(fileName: string, fileType: string) {
    const active = folderPaths.value.find(f => f.id === activePathId.value)
    const targetPath = (active && active.isValid) ? active.path : currentFolder.value
    if (!targetPath) return { success: false, error: '未选择文件夹' }
    const result = await window.electronAPI.createFile(targetPath, fileName, fileType)
    if (result.success) {
      await refreshFiles()
    }
    return result
  }

  return {
    currentFolder,
    files,
    selectedFile,
    fileContent,
    fileType,
    isLoading,
    activeTab,
    highlightKeyword,
    highlightMatchText,
    searchJumpId,
    openTabs,
    activeTabPath,
    isDirty,
    isActiveDirty,
    updateTabContent,
    markSaved,
    openFileInTab,
    switchToTab,
    closeTab,
    closeOtherTabs,
    closeAllTabs,
    folderPaths,
    activePathId,
    addFolderPath,
    addTempPath,
    removeFolderPath,
    updateFolderPath,
    validatePath,
    searchAllPaths,
    setFolder,
    refreshFiles,
    selectFile,
    navigateToSearchResult,
    deleteSelectedFile,
    saveFile,
    createFile
  }
})
