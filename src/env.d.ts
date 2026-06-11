export interface IElectronAPI {
  selectFolder: () => Promise<string | null>
  readDirectory: (dirPath: string) => Promise<FileEntry[]>
  readFileContent: (filePath: string) => Promise<FileContentResult>
  saveDocxFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>
  saveTextFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>
  saveXlsxFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>
  createFile: (folderPath: string, fileName: string, fileType: string) => Promise<{ success: boolean; path?: string; error?: string }>
  deleteFile: (filePath: string) => Promise<{ success: boolean; error?: string }>
  searchInFiles: (folderPath: string, keyword: string) => Promise<SearchResult[]>
  openFileLocation: (filePath: string) => Promise<void>
  openWithDefaultApp: (filePath: string) => Promise<void>
  openExternal: (url: string) => Promise<void>
  selectFile: () => Promise<string | null>
  selectVideoFile: () => Promise<Array<{ path: string; name: string }> | null>
  scanFolderVideos: (dirPath: string) => Promise<Array<{ path: string; name: string }>>
  readVideoDirectory: (dirPath: string) => Promise<Array<{ name: string; path: string; isDirectory: boolean; isFile: boolean }>>
  readFileAsText: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>
  // 文件系统
  getUsername: () => Promise<string>
  createDirectory: (dirPath: string) => Promise<{ success: boolean; error?: string }>
  writeFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>
  // ASR
  runAsr: (videoPath: string) => Promise<string>
  // 字幕缓存
  loadSubtitleCache: (videoPath: string) => Promise<{ success: boolean; content?: string; error?: string }>
  saveSubtitleCache: (videoPath: string, content: string) => Promise<{ success: boolean; path?: string; error?: string }>
}

export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  isFile: boolean
}

export interface FileContentResult {
  type: string
  content: string
}

export interface SearchResult {
  fileName: string
  path: string
  matches: string[]
  totalMatches: number
}

declare global {
  interface Window {
    electronAPI: IElectronAPI
  }
}
