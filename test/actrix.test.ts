import { promisify } from '../src/Utils'

function delay(time) {
  return new Promise((resolve, reject) => {
    setTimeout(resolve, time)
  })
}

describe('Cancellable promise', () => {
  it('should work with zero params', async () => {
    const myPromise = promisify(function*() {
      yield Promise.resolve()
      return true
    })

    const result = await myPromise()
    expect(result).toBeTruthy()
  })

  it('should work with a single param', async () => {
    const myPromise = promisify(function*(value: number) {
      yield Promise.resolve()
      return value
    })

    const result = await myPromise(5)
    expect(result).toEqual(5)
  })

  it('should work with many params', async () => {
    const myPromise = promisify(function*(
      value: number,
      multiplier: number,
      addition: number,
      name: string
    ) {
      yield Promise.resolve()
      const computedValue = value * multiplier + addition
      return name + ': ' + computedValue
    })

    const result = await myPromise(5, 2, 3, 'total')
    expect(result).toEqual('total: 13')
  })

  it('should catch exception', async () => {
    const myPromise = promisify(function*() {
      yield Promise.reject('fail')
      return true
    })

    try {
      const result = await myPromise()
      fail()
    } catch (error) {
      expect(error).toEqual('fail')
    }
  })

  it('should catch exception preceded with a promise', async () => {
    const myPromise = promisify(function*() {
      yield Promise.resolve()
      yield Promise.reject('fail')
      return true
    })

    try {
      const result = await myPromise()
      fail()
    } catch (error) {
      expect(error).toEqual('fail')
    }
  })

  it('should be cancellable', async () => {
    let a = 0
    const myPromise = promisify(function*() {
      a = 1
      yield Promise.resolve()
      a = 2
      return true
    })

    try {
      const myStartedPromise = myPromise()
      myStartedPromise.cancel()
      const result = await myStartedPromise
      fail()
    } catch (error) {
      expect('' + error).toBe('Error: PROMISE_CANCELLED')
      expect(a).toEqual(1)
    }
  })

  it('should be cancellable in a complex promise', async () => {
    const anotherPromise = async () => {
      await delay(200)
    }
    let a = 0
    const myPromise = promisify(function*() {
      a = 1
      yield anotherPromise()
      a = 2
    })
    ;async () => {
      try {
        const myStartedPromise = myPromise()
        myStartedPromise.cancel()
        const result = await myStartedPromise
        fail()
      } catch (error) {
        expect('' + error).toBe('Error: PROMISE_CANCELLED')
        expect(a).toEqual(1)
      }
    }
  })
})
