/**
 * 事件总线 —— 类型安全的事件发布/订阅系统
 *
 * 设计原则：
 * 1. 类型安全：通过 TypeScript 泛型保证事件名和载荷类型匹配
 * 2. 轻量级：不依赖第三方库，纯手写实现
 * 3. 生命周期：组件 onUnmounted 时自动清理订阅，防止内存泄漏
 * 4. 调试友好：emit 时检查是否有订阅者，方便排查事件丢失
 */

export type Listener<T = any> = (payload: T) => void
export type Unsubscribe = () => void

/** 事件键名 → 载荷类型的映射表（各模块通过 interface 合并扩展） */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface EventMap {}

class EventBus {
  private listeners = new Map<string, Set<Listener>>()
  private debugMode = false

  /** 开启调试模式：emit 无订阅者时 console.warn */
  enableDebug() { this.debugMode = true }
  disableDebug() { this.debugMode = false }

  /**
   * 订阅事件
   * @param event 事件名（keyof EventMap）
   * @param listener 回调函数
   * @returns 取消订阅的函数
   */
  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): Unsubscribe {
    if (!this.listeners.has(event as string)) {
      this.listeners.set(event as string, new Set())
    }
    this.listeners.get(event as string)!.add(listener)

    // 返回取消订阅函数
    return () => {
      this.off(event, listener)
    }
  }

  /**
   * 取消订阅
   */
  off<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    this.listeners.get(event as string)?.delete(listener)
  }

  /**
   * 发布事件
   * @param event 事件名
   * @param payload 载荷数据
   */
  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const subs = this.listeners.get(event as string)
    if (!subs || subs.size === 0) {
      if (this.debugMode) {
        console.warn(`[EventBus] 事件 "${event as string}" 无订阅者`, payload)
      }
      return
    }
    subs.forEach(fn => {
      try {
        fn(payload)
      } catch (e) {
        console.error(`[EventBus] 事件 "${event as string}" 处理器出错:`, e)
      }
    })
  }

  /**
   * 订阅一次后自动取消
   */
  once<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): Unsubscribe {
    const wrapper: Listener<EventMap[K]> = (payload) => {
      unsubscribe()
      listener(payload)
    }
    const unsubscribe = this.on(event, wrapper)
    return unsubscribe
  }

  /**
   * 清除所有订阅（仅用于测试/重置）
   */
  clear() {
    this.listeners.clear()
  }
}

/** 全局单例 */
export const eventBus = new EventBus()

// ===== Vue 3 Composable =====

import { onUnmounted } from 'vue'

/**
 * Vue 3 composable：在组件中使用事件总线
 *
 * 用法：
 * ```ts
 * const { on, emit } = useEventBus()
 * on('creator:video:imported', (payload) => { ... })
 * emit('creator:video:imported', { videoId: '123' })
 * ```
 *
 * 组件销毁时自动取消所有订阅。
 */
export function useEventBus() {
  const unsubs: Unsubscribe[] = []

  function on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>) {
    const unsub = eventBus.on(event, listener)
    unsubs.push(unsub)
    return unsub
  }

  function emit<K extends keyof EventMap>(event: K, payload: EventMap[K]) {
    eventBus.emit(event, payload)
  }

  onUnmounted(() => {
    unsubs.forEach(fn => fn())
    unsubs.length = 0
  })

  return { on, emit, eventBus }
}
