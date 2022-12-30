export type ReactiveEffect = (() => void) & EffectMetadata

export type EffectScheduler = (e: ReactiveEffect) => void

export type EffectTrackCallback = (
  e: ReactiveEffect,
  target: ReactiveTarget
) => void

export type EffectCleanupCallback = (e: ReactiveEffect) => void

export type EffectTriggerCallback = (
  e: ReactiveEffect,
  target: ReactiveTarget,
  op: number
) => void
export type EffectStopCallback = (e: ReactiveEffect) => void

export interface EffectEventCallbacks {
  onTrigger?: EffectTriggerCallback
  onTrack?: EffectTrackCallback
  onCleanup?: EffectCleanupCallback
  onStop?: EffectStopCallback
}

export interface EffectMetadata extends EffectEventCallbacks {
  scheduler: EffectScheduler
  deps: Set<EffectBucket>
  stopped: boolean
}

export type ReactiveTarget = any
export type EffectBucket = Set<ReactiveEffect>
export type TargetMap = WeakMap<ReactiveTarget, EffectBucket>

const targetMap: TargetMap = new WeakMap()

export interface EffectOptions extends EffectEventCallbacks {
  lazy?: boolean
  scheduler?: () => void
}

function createEffect(
  f: () => void,
  scheduler: EffectScheduler = defaultSchedule,
  on?: EffectEventCallbacks
): ReactiveEffect {
  const e: ReactiveEffect = (() => {
    if (e.stopped) return

    cleanup(e)
    activeScope?.effects.add(e)
    activeEffect = e
    effectStack.push(e)
    f()
    effectStack.pop()
    activeEffect = effectStack[effectStack.length - 1]
  }) as any

  e.onCleanup = on?.onCleanup
  e.onTrack = on?.onTrack
  e.onTrigger = on?.onTrigger
  e.onStop = on?.onStop

  e.deps = new Set()
  e.scheduler = scheduler
  e.stopped = false

  return e
}

export function stop(e: ReactiveEffect): void {
  if (!e.stopped) {
    e.stopped = true
    cleanup(e)
    e.onStop?.(e)
    activeScope?.effects.delete(e)
  }
}

export function useEffect(
  f: () => void,
  { lazy = false, scheduler, ...on }: EffectOptions = {}
): ReactiveEffect {
  const e = createEffect(f, scheduler, on)
  if (!lazy) schedule(e)
  return e
}

function getBucket(target: any): EffectBucket {
  let bucket = targetMap.get(target)
  if (bucket == null) {
    bucket = new Set()
    targetMap.set(target, bucket)
  }

  return bucket
}

// eslint-disable-next-line prefer-const
let shouldTrack = true

let activeEffect: ReactiveEffect | null
const effectStack: ReactiveEffect[] = []

export function schedule(e: ReactiveEffect) {
  e.scheduler(e)
}

const defaultSchedule = (e: ReactiveEffect) => e()

export function track(target: any) {
  if (activeEffect == null || !shouldTrack) return

  const bucket = getBucket(target)

  if (!bucket.has(activeEffect)) {
    activeEffect.onTrack?.(activeEffect, target)

    bucket.add(activeEffect)
    activeEffect.deps.add(bucket)
  }
}

export function cleanup(e: ReactiveEffect): void {
  if (e.deps.size === 0) return

  e.onCleanup?.(e)
  e.deps.forEach((v) => v.delete(e))
  e.deps.clear()
}

export function trigger(target: any, op = 0) {
  const bucket = getBucket(target)

  if (bucket.size === 0) return

  const runEffect: EffectBucket = new Set()

  bucket.forEach((v) => {
    if (v !== activeEffect) runEffect.add(v)
  })

  bucket.clear()

  runEffect.forEach((v) => {
    v.onTrigger?.(v, target, op)
    schedule(v)
  })
}

export type Accessor<T> = () => T
export type Mapper<T, U = T> = (value: T) => U
export type Setter<T> = (
  x: T extends (...args: any[]) => any ? Mapper<T> : Mapper<T> | T
) => void
export type EqualFn = (a: any, b: any) => boolean

export type Signal<T> = [accessor: Accessor<T>, setter: Setter<T>]

export interface SignalOptions {
  equals?: EqualFn | false
}

export function useSignal<T>(
  initalValue: T,
  { equals = Object.is }: SignalOptions = {}
): Signal<T> {
  let value = initalValue

  const signal: Signal<T> = [
    () => {
      track(signal)
      return value
    },
    (x) => {
      let newValue: T

      if (typeof value !== 'function' && typeof x === 'function') {
        newValue = x(value)
      } else {
        newValue = x as T
      }

      if (equals === false || !equals(value, newValue)) {
        value = newValue
        trigger(signal)
      }
    },
  ]

  return signal
}

export type Marker = {}
export type Memo<T> = Accessor<T> & { readonly marker: Marker }

export function createMarker(): Marker {
  const o = Object.create(null)
  return Object.seal(o)
}

export function useMemo<T>(f: () => T): Memo<T> {
  let value: T
  let dirty = true

  const m = createMarker()
  const e = useEffect(() => (value = f()), {
    lazy: true,
    scheduler: () => {
      if (!dirty) {
        dirty = true
        trigger(m)
      }
    },
  })

  const memo = (() => {
    if (dirty) {
      e()
      dirty = false
    }
    track(memo.marker)
    return value
  }) as Memo<T>

  Object.defineProperty(memo, 'marker', {
    configurable: false,
    enumerable: false,
    writable: false,
  })

  return memo
}

export type DisposeFn = () => void

export type EffectScopeDiposeCallback = () => void

export interface EffectScopeImpl {
  effects: Set<ReactiveEffect>
  children: EffectScopeImpl[]
  onDipose: Set<EffectScopeDiposeCallback>
}

let activeScope: EffectScopeImpl | null
const scopeStack: EffectScopeImpl[] = []

function createScopeImpl(detached = false): EffectScopeImpl {
  const scope: EffectScopeImpl = {
    effects: new Set(),
    onDipose: new Set(),
    children: [],
  }
  if (!detached) activeScope?.children.push(scope)
  return scope
}

function runScope(f: () => void, scope: EffectScopeImpl): void {
  scopeStack.push(scope)
  activeScope = scope

  f()

  scopeStack.pop()
  activeScope = scopeStack[scopeStack.length - 1]
}

function cleanScope(scope: EffectScopeImpl): void {
  scope.effects.forEach((e) => stop(e))
  scope.effects.clear()

  scope.onDipose.forEach((f) => f())
  scope.onDipose.clear()

  scope.children.forEach((v) => cleanScope(v))
}

export function useScope(...f: Array<() => void>): DisposeFn {
  const scope = createScopeImpl()
  f.forEach((f) => runScope(f, scope))

  return () => cleanScope(scope)
}

export function useDetachedScope(...f: Array<() => void>): DisposeFn {
  const scope = createScopeImpl(true)
  f.forEach((f) => runScope(f, scope))

  return () => cleanScope(scope)
}

export function onScopeDipose(...fns: EffectScopeDiposeCallback[]): DisposeFn {
  if (activeScope == null)
    throw new ReferenceError('Should use in a reactive effect scope')

  const e = activeScope
  fns.forEach((f) => e.onDipose.add(f))
  return () => fns.forEach((f) => e.onDipose.delete(f))
}

export interface EffectScope {
  dipose: DisposeFn
  run: (...f: Array<() => void>) => void
  readonly size: number
}

export function createScope(detached = false): EffectScope {
  const scope = createScopeImpl(detached)

  return {
    dipose: () => cleanScope(scope),
    run: (...f) => f.forEach((f) => runScope(f, scope)),
    get size() {
      return scope.effects.size
    },
  }
}
