import { Actor, ActorRef, ActorCons } from "./Actor";
import { Address } from "./interfaces";
import { ActorSystem } from "./ActorSystem";

export type SubscriberActorAPI<T> = {
    updateValue: (value: T) => Promise<void>;
    initiateSubscription: () => Promise<void>;
};

export type SubscriberActorOptions<T> = {
    publisherRef: ActorRef<PublisherActorAPI>;
    callback: (value: T) => void;
};
export class SubscriberActor<T> extends Actor<SubscriberActorOptions<T>>
    implements SubscriberActorAPI<T> {
    private callback!: (value: T) => void;

    private publisherRef!: ActorRef<PublisherActorAPI>;

    // constructor(
    //     name: string,
    //     address: Address,
    //     actorSystem: ActorSystem,
    //     options: SubscriberActorOptions<T>
    // ) {
    //     super(name, address, actorSystem, options);
    //     this.callback = options.callback;
    //     this.publisherRef = options.publisherRef;
    // }

    onStart(options: SubscriberActorOptions<T>) {
        this.callback = options.callback;
        this.publisherRef = options.publisherRef;
        this.atSelf().initiateSubscription();
    }

    initiateSubscription = async () => {
        await this.at(this.publisherRef).subscribe();
    };

    updateValue = async (value: T) => {
        this.callback(value);
    };
}

export type PublisherActorAPI = {
    subscribe: () => Promise<void>;
    unsubscribe: () => Promise<void>;
};

export class PublisherActor<T> extends Actor implements PublisherActorAPI {
    private subscribers: ActorRef<SubscriberActorAPI<T>>[] = [];

    subscribe = async () => {
        const ref = this.ref<SubscriberActorAPI<T>>(this.context.senderRef!.address);
        this.subscribers.push(ref);
    };

    unsubscribe = async () => {
        const senderAddress = this.context.senderRef!.address;
        const index = this.subscribers.findIndex(
            subscriber =>
                subscriber.address.actorSystemName === senderAddress.actorSystemName &&
                subscriber.address.localAddress === senderAddress.localAddress
        );
        if (index) {
            this.subscribers.splice(index, 1);
        }
    };

    protected setValue(value: T) {
        this.subscribers.forEach(subscriber => this.at(subscriber).updateValue(value));
    }
}

export type Constructor<T> = new (...args: any[]) => T;
export function withCallback<U, T extends Constructor<{}>>(Base: T, callback: (value: U) => void) {
    return class extends Base {
        callback: (value: U) => void;

        constructor(...args: any[]) {
            super(args);
            this.callback = callback;
        }
    };
}

// export function withCallback2<T extends ActorCons<Actor>>(Base: T) {
//     return class extends Base {
//         timeStamp = Date.now();
//     };
// }
