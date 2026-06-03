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
  readFileAsText: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>
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
