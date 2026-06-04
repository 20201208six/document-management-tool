import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface SavedLink {
  id: string
  /** 用户输入的原始文本 */
  rawText: string
  /** 提取出的链接标题（从原始文本中取前30字） */
  title: string
  /** 提取的 URL */
  url: string
  /** 创建时间 */
  createdAt: string
}

const STORAGE_KEY = 'copywriting-browser-links'

export const useLinkStore = defineStore('links', () => {
  const links = ref<SavedLink[]>(loadLinks())

  function loadLinks(): SavedLink[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY)
      return data ? JSON.parse(data) : []
    } catch { return [] }
  }

  function saveLinks() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(links.value))
  }

  /** 从文本中提取所有 URL */
  function extractUrls(text: string): string[] {
    const regex = /https?:\/\/[^\s`"']+/g
    const matches = text.match(regex)
    return matches ? [...new Set(matches)] : []
  }

  /** 添加链接（自动提取URL） */
  function addLink(rawText: string): SavedLink[] {
    const urls = extractUrls(rawText)
    if (urls.length === 0) return []

    const added: SavedLink[] = []
    for (const url of urls) {
      // 去重
      if (links.value.some(l => l.url === url)) continue
      // 从原始文本中提取标题：移除URL后的前30个字
      const cleanText = rawText.replace(url, '').replace(/\s+/g, ' ').trim()
      const title = cleanText.substring(0, 30) || url
      const link: SavedLink = {
        id: 'link_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        rawText: rawText.substring(0, 500),
        title,
        url,
        createdAt: new Date().toLocaleString('zh-CN')
      }
      links.value.unshift(link)
      added.push(link)
    }
    if (added.length > 0) saveLinks()
    return added
  }

  /** 删除链接 */
  function removeLink(id: string) {
    links.value = links.value.filter(l => l.id !== id)
    saveLinks()
  }

  /** 清空所有 */
  function clearAll() {
    links.value = []
    saveLinks()
  }

  /** 按日期分组 */
  const groupedByDate = computed(() => {
    const groups: { date: string; items: SavedLink[] }[] = []
    const seen = new Set<string>()
    for (const link of links.value) {
      const date = link.createdAt.split(' ')[0] || link.createdAt
      if (!seen.has(date)) {
        seen.add(date)
        groups.push({ date, items: [] })
      }
      groups.find(g => g.date === date)!.items.push(link)
    }
    return groups
  })

  return {
    links,
    addLink,
    removeLink,
    clearAll,
    extractUrls,
    groupedByDate,
  }
})
