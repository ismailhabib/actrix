export type CancellablePromise<T> = Promise<T> & { cancel(): void };

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
            : T extends (a1: infer A1, a2: infer A2, a3: infer A3) => IterableIterator<infer B1>
                ? Exclude<B1, Promise<any>> extends never
                    ? (a1: A1, a2: A2, a3: A3) => CancellablePromise<void>
                    : (a1: A1, a2: A2, a3: A3) => CancellablePromise<Exclude<B1, Promise<any>>>
                : T extends (
                      a1: infer A1,
                      a2: infer A2,
                      a3: infer A3,
                      a4: infer A4
                  ) => IterableIterator<infer B1>
                    ? Exclude<B1, Promise<any>> extends never
                        ? (a1: A1, a2: A2, a3: A3, a4: A4) => CancellablePromise<void>
                        : (
                              a1: A1,
                              a2: A2,
                              a3: A3,
                              a4: A4
                          ) => CancellablePromise<Exclude<B1, Promise<any>>>
                    : T extends (
                          a1: infer A1,
                          a2: infer A2,
                          a3: infer A3,
                          a4: infer A4,
                          a5: infer A5
                      ) => IterableIterator<infer B1>
                        ? Exclude<B1, Promise<any>> extends never
                            ? (a1: A1, a2: A2, a3: A3, a4: A4, a5: A5) => CancellablePromise<void>
                            : (
                                  a1: A1,
                                  a2: A2,
                                  a3: A3,
                                  a4: A4,
                                  a5: A5
                              ) => CancellablePromise<Exclude<B1, Promise<any>>>
                        : never;
export function promisify<T extends (...args: any[]) => IterableIterator<any>>(
    generator: T
): Promisify<T> {
    // Implementation based on https://github.com/tj/co/blob/master/index.js
    return function() {
        const args = arguments;
        const ctx = this;
        const gen: IterableIterator<any> = generator.apply(ctx, args);
        let rejector: (error: any) => void;
        let currentPromise: CancellablePromise<any> | undefined = undefined;

        const res = new Promise((resolve, reject) => {
            rejector = reject;

            function onFulfilled(res: any) {
                currentPromise = undefined;
                let result;
                try {
                    result = gen.next(res);
                } catch (e) {
                    reject(e);
                    return;
                }

                // noinspection JSIgnoredPromiseFromCall
                next(result);
            }

            function onRejected(err: any) {
                currentPromise = undefined;
                let result;
                try {
                    result = gen.throw!(err);
                } catch (e) {
                    reject(e);
                    return;
                }
                // noinspection JSIgnoredPromiseFromCall
                next(result);
            }

            function next(ret: any) {
                if (ret && typeof ret.then === "function") {
                    // an async iterator
                    ret.then(next, reject);
                    return;
                }
                if (ret.done) {
                    resolve(ret.value);
                    return;
                }
                currentPromise = Promise.resolve(ret.value) as any;
                return currentPromise!.then(onFulfilled, onRejected);
            }

            onFulfilled(undefined); // kick off the process
        }) as any;

        res.cancel = function() {
            try {
                if (currentPromise) {
                    cancelPromise(currentPromise);
                }
                const res = gen.return!();
                // eat anything that promise would do, it's cancelled!
                const yieldedPromise = Promise.resolve(res.value);
                yieldedPromise.then(
                    () => {
                        /* nothing */
                    },
                    () => {
                        /* nothing */
                    }
                );
                cancelPromise(yieldedPromise); // maybe it can be cancelled :)
                rejector(new Error("PROMISE_CANCELLED"));
            } catch (e) {
                rejector(e); // there could be a throwing finally block
            }
        };
        return res;
    } as Promisify<T>;
}

function cancelPromise(promise: any) {
    if (typeof promise.cancel === "function") {
        promise.cancel();
    }
}
