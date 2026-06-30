import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export type ThemeKey = 'light' | 'dark' | 'ocean' | 'sunset' | 'forest' | 'minimal'

export interface ThemeConfig {
  key: ThemeKey
  name: string
  icon: string
  colors: {
    bg: string
    bgSecondary: string
    bgCard: string
    bgHover: string
    border: string
    borderLight: string
    borderStrong: string
    text: string
    textSecondary: string
    textMuted: string
    primary: string
    primaryHover: string
    primarySoft: string
    primaryText: string
    accent: string
    success: string
    warning: string
    danger: string
    info: string
    shadow: string
    shadowHover: string
    sidebarBg: string
    headerBg: string
    inputBg: string
    chatBubbleUser: string
    chatBubbleAI: string
    scrollbarThumb: string
    scrollbarThumbHover: string
    codeBg: string
    codeText: string
  }
}

const themes: Record<ThemeKey, ThemeConfig> = {
  light: {
    key: 'light',
    name: '简约白',
    icon: '☀',
    colors: {
      bg: '#f5f6fa',
      bgSecondary: '#fafbfc',
      bgCard: '#ffffff',
      bgHover: '#f0f2f5',
      border: '#e4e7ed',
      borderLight: '#eef1f5',
      borderStrong: '#dcdfe6',
      text: '#303133',
      textSecondary: '#606266',
      textMuted: '#909399',
      primary: '#409eff',
      primaryHover: '#66b1ff',
      primarySoft: '#ecf5ff',
      primaryText: '#ffffff',
      accent: '#7c5cfc',
      success: '#67c23a',
      warning: '#e6a23c',
      danger: '#f56c6c',
      info: '#909399',
      shadow: '0 1px 4px rgba(0,0,0,0.04)',
      shadowHover: '0 4px 16px rgba(0,0,0,0.08)',
      sidebarBg: '#f5f6fa',
      headerBg: '#fafbfc',
      inputBg: '#f5f7fa',
      chatBubbleUser: 'linear-gradient(135deg, #409eff, #66b1ff)',
      chatBubbleAI: '#ffffff',
      scrollbarThumb: '#c0c4cc',
      scrollbarThumbHover: '#909399',
      codeBg: '#1e293b',
      codeText: '#e2e8f0'
    }
  },
  dark: {
    key: 'dark',
    name: '深邃黑',
    icon: '🌙',
    colors: {
      bg: '#1a1a2e',
      bgSecondary: '#16213e',
      bgCard: '#1f2940',
      bgHover: '#2a3550',
      border: '#2d3a54',
      borderLight: '#253049',
      borderStrong: '#3d4a65',
      text: '#e8eaed',
      textSecondary: '#a0a8b8',
      textMuted: '#6b7280',
      primary: '#60a5fa',
      primaryHover: '#93c5fd',
      primarySoft: '#1e3a5f',
      primaryText: '#ffffff',
      accent: '#a78bfa',
      success: '#4ade80',
      warning: '#fbbf24',
      danger: '#f87171',
      info: '#94a3b8',
      shadow: '0 1px 4px rgba(0,0,0,0.3)',
      shadowHover: '0 4px 16px rgba(0,0,0,0.4)',
      sidebarBg: '#16213e',
      headerBg: '#1f2940',
      inputBg: '#253049',
      chatBubbleUser: 'linear-gradient(135deg, #60a5fa, #818cf8)',
      chatBubbleAI: '#253049',
      scrollbarThumb: '#3d4a65',
      scrollbarThumbHover: '#5a6a8a',
      codeBg: '#0f172a',
      codeText: '#e2e8f0'
    }
  },
  ocean: {
    key: 'ocean',
    name: '海洋蓝',
    icon: '🌊',
    colors: {
      bg: '#eef5fb',
      bgSecondary: '#e3eff8',
      bgCard: '#ffffff',
      bgHover: '#d9e8f5',
      border: '#c5d9ec',
      borderLight: '#d6e6f2',
      borderStrong: '#b0c8e0',
      text: '#1a365d',
      textSecondary: '#2c5282',
      textMuted: '#718096',
      primary: '#0284c7',
      primaryHover: '#0369a1',
      primarySoft: '#e0f2fe',
      primaryText: '#ffffff',
      accent: '#06b6d4',
      success: '#0d9488',
      warning: '#d97706',
      danger: '#dc2626',
      info: '#64748b',
      shadow: '0 2px 8px rgba(2,132,199,0.06)',
      shadowHover: '0 6px 20px rgba(2,132,199,0.12)',
      sidebarBg: '#e3eff8',
      headerBg: '#f0f7fc',
      inputBg: '#f0f7fc',
      chatBubbleUser: 'linear-gradient(135deg, #0284c7, #0ea5e9)',
      chatBubbleAI: '#ffffff',
      scrollbarThumb: '#a0c4e0',
      scrollbarThumbHover: '#6aa3cc',
      codeBg: '#1e293b',
      codeText: '#e2e8f0'
    }
  },
  sunset: {
    key: 'sunset',
    name: '日落橙',
    icon: '🌅',
    colors: {
      bg: '#fef7f0',
      bgSecondary: '#fdf2e9',
      bgCard: '#ffffff',
      bgHover: '#fde6d3',
      border: '#f5d5bb',
      borderLight: '#fbe4cf',
      borderStrong: '#e8c5a0',
      text: '#451a03',
      textSecondary: '#78350f',
      textMuted: '#a8755a',
      primary: '#ea580c',
      primaryHover: '#c2410c',
      primarySoft: '#ffedd5',
      primaryText: '#ffffff',
      accent: '#f43f5e',
      success: '#16a34a',
      warning: '#ca8a04',
      danger: '#dc2626',
      info: '#a8a29e',
      shadow: '0 2px 8px rgba(234,88,12,0.06)',
      shadowHover: '0 6px 20px rgba(234,88,12,0.12)',
      sidebarBg: '#fdf2e9',
      headerBg: '#fff7ed',
      inputBg: '#fff7ed',
      chatBubbleUser: 'linear-gradient(135deg, #ea580c, #f97316)',
      chatBubbleAI: '#ffffff',
      scrollbarThumb: '#f0c0a0',
      scrollbarThumbHover: '#e09a70',
      codeBg: '#1e293b',
      codeText: '#e2e8f0'
    }
  },
  forest: {
    key: 'forest',
    name: '森林绿',
    icon: '🌲',
    colors: {
      bg: '#f0f7f4',
      bgSecondary: '#e8f3ee',
      bgCard: '#ffffff',
      bgHover: '#d7ebe0',
      border: '#bcd9c9',
      borderLight: '#cce5d7',
      borderStrong: '#a0c8b2',
      text: '#064e3b',
      textSecondary: '#166534',
      textMuted: '#6b9e80',
      primary: '#059669',
      primaryHover: '#047857',
      primarySoft: '#d1fae5',
      primaryText: '#ffffff',
      accent: '#8b5cf6',
      success: '#059669',
      warning: '#d97706',
      danger: '#dc2626',
      info: '#6b7280',
      shadow: '0 2px 8px rgba(5,150,105,0.06)',
      shadowHover: '0 6px 20px rgba(5,150,105,0.12)',
      sidebarBg: '#e8f3ee',
      headerBg: '#f0f9f5',
      inputBg: '#f0f9f5',
      chatBubbleUser: 'linear-gradient(135deg, #059669, #10b981)',
      chatBubbleAI: '#ffffff',
      scrollbarThumb: '#a0d0b8',
      scrollbarThumbHover: '#70b090',
      codeBg: '#1e293b',
      codeText: '#e2e8f0'
    }
  },
  minimal: {
    key: 'minimal',
    name: '极简灰',
    icon: '◐',
    colors: {
      bg: '#fafafa',
      bgSecondary: '#f5f5f5',
      bgCard: '#ffffff',
      bgHover: '#eeeeee',
      border: '#e0e0e0',
      borderLight: '#eeeeee',
      borderStrong: '#bdbdbd',
      text: '#1a1a1a',
      textSecondary: '#525252',
      textMuted: '#a3a3a3',
      primary: '#171717',
      primaryHover: '#404040',
      primarySoft: '#f5f5f5',
      primaryText: '#ffffff',
      accent: '#737373',
      success: '#16a34a',
      warning: '#ca8a04',
      danger: '#dc2626',
      info: '#737373',
      shadow: 'none',
      shadowHover: '0 2px 8px rgba(0,0,0,0.08)',
      sidebarBg: '#f5f5f5',
      headerBg: '#fafafa',
      inputBg: '#f5f5f5',
      chatBubbleUser: '#171717',
      chatBubbleAI: '#ffffff',
      scrollbarThumb: '#d4d4d4',
      scrollbarThumbHover: '#a3a3a3',
      codeBg: '#1a1a1a',
      codeText: '#e5e5e5'
    }
  }
}

export const useThemeStore = defineStore('theme', () => {
  const currentTheme = ref<ThemeKey>((localStorage.getItem('app-theme') as ThemeKey) || 'light')

  function applyTheme(key: ThemeKey) {
    const theme = themes[key]
    if (!theme) return
    const root = document.documentElement
    const c = theme.colors
    root.style.setProperty('--c-bg', c.bg)
    root.style.setProperty('--c-bg-sec', c.bgSecondary)
    root.style.setProperty('--c-bg-card', c.bgCard)
    root.style.setProperty('--c-bg-hover', c.bgHover)
    root.style.setProperty('--c-border', c.border)
    root.style.setProperty('--c-border-light', c.borderLight)
    root.style.setProperty('--c-border-strong', c.borderStrong)
    root.style.setProperty('--c-text', c.text)
    root.style.setProperty('--c-text-sec', c.textSecondary)
    root.style.setProperty('--c-text-muted', c.textMuted)
    root.style.setProperty('--c-primary', c.primary)
    root.style.setProperty('--c-primary-hover', c.primaryHover)
    root.style.setProperty('--c-primary-soft', c.primarySoft)
    root.style.setProperty('--c-primary-text', c.primaryText)
    root.style.setProperty('--c-accent', c.accent)
    root.style.setProperty('--c-success', c.success)
    root.style.setProperty('--c-warning', c.warning)
    root.style.setProperty('--c-danger', c.danger)
    root.style.setProperty('--c-info', c.info)
    root.style.setProperty('--c-shadow', c.shadow)
    root.style.setProperty('--c-shadow-hover', c.shadowHover)
    root.style.setProperty('--c-sidebar-bg', c.sidebarBg)
    root.style.setProperty('--c-header-bg', c.headerBg)
    root.style.setProperty('--c-input-bg', c.inputBg)
    root.style.setProperty('--c-chat-user', c.chatBubbleUser)
    root.style.setProperty('--c-chat-ai', c.chatBubbleAI)
    root.style.setProperty('--c-scroll', c.scrollbarThumb)
    root.style.setProperty('--c-scroll-h', c.scrollbarThumbHover)
    root.style.setProperty('--c-code-bg', c.codeBg)
    root.style.setProperty('--c-code-text', c.codeText)
    root.setAttribute('data-theme', key)
    document.body.classList.remove('theme-light', 'theme-dark', 'theme-ocean', 'theme-sunset', 'theme-forest', 'theme-minimal')
    document.body.classList.add(`theme-${key}`)
  }

  function setTheme(key: ThemeKey) {
    currentTheme.value = key
    localStorage.setItem('app-theme', key)
    applyTheme(key)
  }

  function getThemes(): ThemeConfig[] {
    return Object.values(themes)
  }

  function getCurrentTheme(): ThemeConfig {
    return themes[currentTheme.value]
  }

  function initTheme() {
    applyTheme(currentTheme.value)
  }

  return {
    currentTheme,
    setTheme,
    getThemes,
    getCurrentTheme,
    initTheme
  }
})
