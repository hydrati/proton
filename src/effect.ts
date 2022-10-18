import { EventEmitter } from './event'

export type EffectEvents = {
  ['track']: (o: any, key: PropertyKey, op: number) => void
}

export interface Effect<T = void> {
  executor: () => T
  deps: Bucket[]
  event: EventEmitter<EffectEvents>
  scheduler: (effect: Effect) => void
}

export type Bucket = Set<Effect>

export function effect(): void {}

export function trigger(): void {}

export function track(): void {}

export function clean(): void {}

export {}
