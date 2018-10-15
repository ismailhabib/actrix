import { ActorSystem } from "./ActorSystem";
import { Address, Handler, Strategy } from "./interfaces";
import { CancellablePromise } from "./Utils";

export type MailBoxMessage<T> = {
    type: ValidActorMethodPropNames<T>;
    payload: PayloadPropNames<T>[];
    senderAddress: Address | null;
    callback: (error?: any, result?: any) => void;
};

export type ActorSendAPI<T> = {
    [K in ValidActorMethodPropNames<T>]: T[K] extends () => any
        ? () => void
        : T[K] extends (arg1: infer A1) => any
            ? (arg: A1) => void
            : T[K] extends (arg1: infer A1, arg2: infer A2) => any
                ? (arg1: A1, arg2: A2) => void
                : T[K] extends (arg1: infer A1, arg2: infer A2, arg3: infer A3) => any
                    ? (arg1: A1, arg2: A2, arg3: A3) => void
                    : T[K] extends (
                          arg1: infer A1,
                          arg2: infer A2,
                          arg3: infer A3,
                          arg4: infer A4
                      ) => any
                        ? (arg1: A1, arg2: A2, arg3: A3, arg4: A4) => void
                        : T[K] extends (
                              arg1: infer A1,
                              arg2: infer A2,
                              arg3: infer A3,
                              arg4: infer A4,
                              arg5: infer A5
                          ) => any
                            ? (arg1: A1, arg2: A2, arg3: A3, arg4: A4, arg5: A5) => void
                            : never
};

export type ActorAskAPI<T> = Pick<T, ValidActorMethodPropNames<T>>;
export type ValidActorMethodPropNames<T> = {
    [K in Exclude<keyof T, keyof Actor>]: T[K] extends (...args: any[]) => infer R
        ? R extends Promise<any> ? K : never
        : never
}[Exclude<keyof T, keyof Actor>];

export type PayloadPropNames<T> = {
    [K in Exclude<keyof T, keyof Actor>]: T[K] extends (_: infer S) => Promise<any> ? S : never
}[Exclude<keyof T, keyof Actor>];

export type ActorCons<T extends Actor<K>, K = undefined> = new (
    name: string,
    address: Address,
    actorSystem: ActorSystem,
    options?: K,
    strategies?: Strategy[]
) => T;

function createProxy<T>(
    actorSystem: ActorSystem,
    targetAddressorActorRef: Address | ActorRef<T>,
    sender?: Address,
    ask = false
) {
    return new Proxy(
        {},
        {
            get: (target, prop, receiver) => {
                return (...payload: any[]) => {
                    return ask
                        ? actorSystem.sendMessageAndWait(
                              targetAddressorActorRef,
                              prop as any,
                              sender || null,
                              ...payload
                          )
                        : actorSystem.sendMessage(
                              targetAddressorActorRef,
                              prop as any,
                              sender || null,
                              ...payload
                          );
                };
            }
        }
    );
}

export class ActorRef<T> {
    constructor(public address: Address, private actorSystem: ActorSystem) {}

    send(sender?: Address) {
        return createProxy(this.actorSystem, this.address, sender) as ActorSendAPI<T>;
    }

    ask(sender?: Address) {
        return createProxy(this.actorSystem, this.address, sender, true) as ActorAskAPI<T>;
    }
}

export abstract class Actor<InitParam = undefined> {
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
        protected actorSystem: ActorSystem,
        options?: InitParam,
        protected strategies?: Strategy[]
    ) {
        this.name = name;
        this.timerId = null;
        setTimeout(() => {
            this.init(options);
        });
    }

    pushToMailbox = <K extends ValidActorMethodPropNames<this>, L extends PayloadPropNames<this>>(
        type: K,
        senderAddress: Address | null,
        ...payload: L[]
    ): Promise<any> => {
        this.log(
            `A new message with type ${type} and payload ${payload} from sender ${senderAddress} is received`
        );

        if (this.strategies && this.strategies.includes("IgnoreOlderMessageWithTheSameType")) {
            if (this.currentlyProcessedMessage && this.currentlyProcessedMessage.type === type) {
                this.cancelCurrentExecution();
            }
        }

        try {
            this.onNewMessage(type, senderAddress, ...payload);
        } catch (error) {
            this.log(
                `Caught an exception on the implementation of 'onNewMessage' on actor ${this.name}`,
                error
            );
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

    protected ref = <T>(address: Address) => {
        return this.actorSystem.ref<T>(address);
    };

    protected sendTo<A>(targetRef: ActorRef<A> | Address) {
        return createProxy(this.actorSystem, targetRef, this.address) as ActorSendAPI<A>;
    }

    protected askTo<A>(targetRef: ActorRef<A> | Address) {
        return createProxy(this.actorSystem, targetRef, this.address, true) as ActorAskAPI<A>;
    }

    // For some reason the typings is not working properly
    protected sendToSelf() {
        // return this.at<ValidActorMethodProps<this>>(this.address);
        return this.sendTo<any>(this.address); // TODO: introduce generic for actor
    }

    protected onNewMessage = <
        K extends ValidActorMethodPropNames<this>,
        L extends PayloadPropNames<this>
    >(
        type: K,
        senderAddress: Address | null,
        ...payload: L[]
    ) => {
        // should be overridden by implementator (when necessary)
    };
    protected init(options?: InitParam) {
        // can be implemented by the concrete actor
    }

    protected log(...message: any[]) {
        if (
            (process.env && process.env.ACTRIX_DEBUG) ||
            (typeof window !== "undefined" && (window as any).ACTRIX_DEBUG)
        ) {
            console.log(`[${this.name}]`, ...message);
        }
    }

    protected cancelCurrentExecution = () => {
        this.log("Cancel current execution");
        if (this.currentPromise && typeof (this.currentPromise as any).cancel === "function") {
            (this.currentPromise as CancellablePromise<any>).cancel();
        }
    };

    // TODO: K extends keyof this is not actually the proper solution,
    // good for now though since it doesn't affect end-user
    private handleMessage<K extends keyof this>(
        type: string,
        ...payload: any[]
    ): Promise<any> | CancellablePromise<any> {
        this.log(`Handling message of type ${type} and payload ${payload}`);
        return (this as any)[type](...payload);
    }

    private scheduleNextTick = () => {
        if (!this.timerId) {
            this.timerId = setTimeout(this.executeTick);
        }
    };

    private executeTick = async () => {
        const mail = this.mailBox.shift();
        let success = false;
        let result: any;
        const { type, payload, senderAddress, callback } = mail!;

        this.context = {
            senderAddress,
            senderRef: senderAddress ? this.ref(senderAddress) : null
        };

        if (this.strategies && this.strategies.includes("IgnoreOlderMessageWithTheSameType")) {
            if (this.mailBox.find(message => message.type === type)) {
                this.log(
                    `Ignoring message with type ${type} because there are more messages with the same type in the queue.`
                );
                result = "There are new messages with the same type. This message is ignored";
            }
        }

        this.currentlyProcessedMessage = mail;

        if (!result) {
            this.currentPromise = this.handleMessage(type, ...payload);
            try {
                result = await this.currentPromise;
                this.log("Output of the handled message", result);
                success = true;
            } catch (error) {
                this.log("Caught an exception when handling message", error);
                result = error;
            }
        }

        this.currentlyProcessedMessage = undefined;
        this.currentPromise = undefined;

        callback(success ? undefined : result, success ? result : undefined);

        if (this.timerId) {
            clearTimeout(this.timerId);
            this.timerId = null;
        }

        if (this.mailBox.length) {
            this.scheduleNextTick();
        }
    };
}
