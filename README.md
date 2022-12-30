# [WIP] Proton
Dead Simple Reactive Library.

## Example
```typescript
const [count, setCount] = useSignal(0)

useEffect(() => console.log(count()))
// prints 0

setCount(1)
// prints 1
```
