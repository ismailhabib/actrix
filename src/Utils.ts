export type CancellablePromise<T> = Promise<T> & { cancel(): void }

// export function flow<R>(
//     generator: () => IterableIterator<any>
// ): () => CancellablePromise<R>;
// export function flow<A1>(
//     generator: (a1: A1) => IterableIterator<any>
// ): (a1: A1) => CancellablePromise<any>; // Ideally we want to have R instead of Any, but cannot specify R without specifying A1 etc... 'any' as result is better then not specifying request args
// export function flow<A1, A2, A3, A4, A5, A6, A7, A8>(
//     generator: (
//         a1: A1,
//         a2: A2,
//         a3: A3,
//         a4: A4,
//         a5: A5,
//         a6: A6,
//         a7: A7,
//         a8: A8
//     ) => IterableIterator<any>
// ): (
//     a1: A1,
//     a2: A2,
//     a3: A3,
//     a4: A4,
//     a5: A5,
//     a6: A6,
//     a7: A7,
//     a8: A8
// ) => CancellablePromise<any>;
// export function flow<A1, A2, A3, A4, A5, A6, A7>(
//     generator: (
//         a1: A1,
//         a2: A2,
//         a3: A3,
//         a4: A4,
//         a5: A5,
//         a6: A6,
//         a7: A7
//     ) => IterableIterator<any>
// ): (
//     a1: A1,
//     a2: A2,
//     a3: A3,
//     a4: A4,
//     a5: A5,
//     a6: A6,
//     a7: A7
// ) => CancellablePromise<any>;
// export function flow<A1, A2, A3, A4, A5, A6>(
//     generator: (
//         a1: A1,
//         a2: A2,
//         a3: A3,
//         a4: A4,
//         a5: A5,
//         a6: A6
//     ) => IterableIterator<any>
// ): (a1: A1, a2: A2, a3: A3, a4: A4, a5: A5, a6: A6) => CancellablePromise<any>;
// export function flow<A1, A2, A3, A4, A5>(
//     generator: (a1: A1, a2: A2, a3: A3, a4: A4, a5: A5) => IterableIterator<any>
// ): (a1: A1, a2: A2, a3: A3, a4: A4, a5: A5) => CancellablePromise<any>;
// export function flow<A1, A2, A3, A4>(
//     generator: (a1: A1, a2: A2, a3: A3, a4: A4) => IterableIterator<any>
// ): (a1: A1, a2: A2, a3: A3, a4: A4) => CancellablePromise<any>;
// export function flow<A1, A2, A3>(
//     generator: (a1: A1, a2: A2, a3: A3) => IterableIterator<any>
// ): (a1: A1, a2: A2, a3: A3) => CancellablePromise<any>;
// export function flow<A1, A2>(
//     generator: (a1: A1, a2: A2) => IterableIterator<any>
// ): (a1: A1, a2: A2) => CancellablePromise<any>;
// export function flow<A1>(
//     generator: (a1: A1) => IterableIterator<any>
// ): (a1: A1) => CancellablePromise<A1>;

export type Promisify<
  T extends (...args: any[]) => IterableIterator<any>
> = T extends () => IterableIterator<infer B1>
  ? Exclude<B1, Promise<any>> extends never
    ? () => CancellablePromise<void>
    : () => CancellablePromise<Exclude<B1, Promise<any>>>
  : T extends (a1: infer A1) => IterableIterator<infer B1>
    ? Exclude<B1, Promise<any>> extends never
      ? (a1: A1) => CancellablePromise<void>
      : (a1: A1) => CancellablePromise<Exclude<B1, Promise<any>>>
    : T extends (a1: infer A1, a2: infer A2) => IterableIterator<infer B1>
      ? Exclude<B1, Promise<any>> extends never
        ? (a1: A1, a2: A2) => CancellablePromise<void>
        : (a1: A1, a2: A2) => CancellablePromise<Exclude<B1, Promise<any>>>
      : never
export function promisify<T extends (...args: any[]) => IterableIterator<any>>(
  generator: T
): Promisify<T>
export function promisify(generator: Function) {
  // Implementation based on https://github.com/tj/co/blob/master/index.js
  return function(this: any) {
    const args = arguments
    const ctx = this
    // const runId = ++generatorId;
    const gen: IterableIterator<any> = generator.apply(ctx, args)
    let rejector: (error: any) => void
    let pendingPromise: CancellablePromise<any> | undefined = undefined

    const res = new Promise(function(resolve, reject) {
      let stepId = 0
      rejector = reject

      function onFulfilled(res: any) {
        pendingPromise = undefined
        let ret
        try {
          ret = gen.next(res)
        } catch (e) {
          return reject(e)
        }

        next(ret)
      }

      function onRejected(err: any) {
        pendingPromise = undefined
        let ret
        try {
          ret = gen.throw!(err)
        } catch (e) {
          return reject(e)
        }
        next(ret)
      }

      function next(ret: any) {
        if (ret && typeof ret.then === 'function') {
          // an async iterator (you mean a promise?)
          ret.then(next, reject)
          return
        }
        if (ret.done) {
          return resolve(ret.value)
        }
        pendingPromise = Promise.resolve(ret.value) as any
        return pendingPromise!.then(onFulfilled, onRejected)
      }

      onFulfilled(undefined) // kick off the process
    }) as any

    res.cancel = function() {
      try {
        if (pendingPromise && typeof pendingPromise.cancel === 'function') {
          pendingPromise.cancel()
        }
        gen.return!()
        rejector(new Error('FLOW_CANCELLED'))
      } catch (e) {
        rejector(e) // there could be a throwing finally block
      }
    }
    return res
  }
}
