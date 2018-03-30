import { ActorSystem } from "./ActorSystem";
import { Address, Handler } from "./interfaces";
import { CancellablePromise } from "./Utils";

export type MailBoxMessage<T> = {
    type: ValidActorMethodPropNames<T>;
    payload: PayloadPropNames<T>;
    senderAddress: Address | null;
    callback?: (error?: any, result?: any) => void;
};

export type ValidActorMethodProps<T> = Pick<T, ValidActorMethodPropNames<T>>;
export type ValidActorMethodPropNames<T> = {
    [K in Exclude<keyof T, keyof Actor>]: T[K] extends (...args: any[]) => infer R
        ? R extends Promise<any> ? K : never
        : never
}[Exclude<keyof T, keyof Actor>];

export type PayloadPropNames<T> = {
    [K in Exclude<keyof T, keyof Actor>]: T[K] extends (_: infer S) => Promise<any> ? S : never
}[Exclude<keyof T, keyof Actor>];

export type ActorCons<T extends Actor> = new (
    name: string,
    address: Address,
    actorSystem: ActorSystem
) => T;

export class ActorRef<T> {
    constructor(public address: Address, private actorSystem: ActorSystem) {}

    invoke(sender?: Address) {
        return new Proxy(
            {},
            {
                get: (target, prop, receiver) => {
                    return (payload: any) =>
                        this.actorSystem.sendMessage(
                            this.address,
                            prop as any,
                            payload,
                            sender || null
                        );
                }
            }
        ) as ValidActorMethodProps<T>;
    }
}

export abstract class Actor {
    protected name: string;
    protected mailBox: MailBoxMessage<this>[] = [];
    protected currentlyProcessedMessage: MailBoxMessage<this> | undefined;
    protected context: {
        senderAddress: Address | null;
        senderRef: ActorRef<any> | null;
    } = {
        senderAddress: null,
        senderRef: null
    };
    private timerId: any | null;
    private currentPromise: Promise<any> | CancellablePromise<any> | undefined;

    constructor(
        name: string,
        protected address: Address,
        protected actorSystem: ActorSystem // private handlers: Handler<>
    ) {
        this.name = name;
        this.timerId = null;
    }

    at<A>(targetRef: ActorRef<A> | Address) {
        return new Proxy(
            {},
            {
                get: (target, prop, receiver) => {
                    return (payload: any) =>
                        this.actorSystem.sendMessage(targetRef, prop as any, payload, this.address);
                }
            }
        ) as Handler<A>;
    }

    onNewMessage = <K extends ValidActorMethodPropNames<this>, L extends PayloadPropNames<this>>(
        type: K,
        payload: L,
        senderAddress: Address | null
    ) => {
        // should be overridden by implementator (when necessary)
    };

    pushToMailbox = <K extends ValidActorMethodPropNames<this>, L extends PayloadPropNames<this>>(
        type: K,
        payload: L,
        senderAddress: Address | null
    ): Promise<any> => {
        try {
            this.onNewMessage(type, payload, senderAddress);
        } catch (error) {
            // TODO: better error message
            console.log("Not sure why", error);
        }
        const promise = new Promise<any>((resolve, reject) => {
            this.mailBox.push({
                type,
                payload,
                senderAddress,
                callback: (error, result) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(result);
                    }
                }
            });
        });
        this.scheduleNextTick();
        return promise;
    };

    // TODO: 'ref' vs 'at' will confuse people
    ref = <T>(address: Address) => {
        return this.actorSystem.ref<T>(address);
    };

    protected log(...message: any[]) {
        console.log(`${this.name}:`, ...message);
    }

    protected cancelCurrentExecution = () => {
        if (this.currentPromise && typeof (this.currentPromise as any).cancel === "function") {
            (this.currentPromise as CancellablePromise<any>).cancel();
        }
    };

    // TODO: K extends keyof this is not actually the proper solution,
    // good for now though since it doesn't affect end-user
    private handleMessage<K extends keyof this>(
        type: string,
        payload: any
    ): Promise<any> | CancellablePromise<any> {
        return (this as any)[type](payload);
    }

    private scheduleNextTick = () => {
        if (!this.timerId) {
            this.timerId = setTimeout(this.executeTick);
        }
    };

    private executeTick = async () => {
        // Note: if message drop semantics are added; make sure to call any pending callbacks with error!
        const mail = this.mailBox.shift();
        if (!mail) {
            // this is semantically impossible situation, but typescript doesn't know.
            return;
        }
        let success = false;
        let result: any;
        const { type, payload, senderAddress } = mail;

        this.context = {
            senderAddress,
            senderRef: senderAddress ? this.ref(senderAddress) : null
        };

        this.currentlyProcessedMessage = mail;
        this.currentPromise = this.handleMessage(type, payload);
        try {
            result = await this.currentPromise;
            success = true;
        } catch (error) {
            console.log("Caught an exception when handling message", error);
            if (!mail.callback) {
                console.error(
                    `Actor ${this.name} failed to handle a message ${JSON.stringify(mail.payload)}`,
                    error
                );
            } else {
                result = error;
            }
        } finally {
            this.currentlyProcessedMessage = undefined;
            this.currentPromise = undefined;

            if (mail.callback) {
                mail.callback(success ? undefined : result, success ? result : undefined);
            }

            if (this.timerId) {
                clearTimeout(this.timerId);
                this.timerId = null;
            }

            if (this.mailBox.length) {
                this.scheduleNextTick();
            }
        }
    };
}
