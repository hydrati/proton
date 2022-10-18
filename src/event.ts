export class EventEmitter<T extends Record<string, (...args: any[]) => void>> {
  #h = new Map<keyof T, Set<any>>()

  #get<K extends keyof T>(event: K): Set<T[K]> {
    const h = this.#h.get(event)
    if (h != null) {
      return h
    }

    const n = new Set<T[K]>()
    this.#h.set(event, n)

    return n
  }

  on<K extends keyof T>(event: K, callback: T[K]): () => void {
    const h = this.#get(event)
    h.add(callback)

    return () => {
      h.delete(callback)
    }
  }

  remove<K extends keyof T>(event: K, callback: T[K]): boolean {
    return this.#get(event).delete(callback)
  }

  removeAll<K extends keyof T>(event: K): void {
    this.#get(event).clear()
  }

  emit<K extends keyof T>(
    event: K,
    args: Parameters<T[K]>,
    scheduler?: (f: T[K], args: Parameters<T[K]>) => void
  ): void {
    this.#get(event).forEach((f) =>
      scheduler != null ? scheduler(f, args) : f(...args)
    )
  }
}
