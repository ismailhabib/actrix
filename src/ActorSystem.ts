import { Actor, ActorCons, ActorRef, ActorAskAPI } from "./Actor";
import { EventEmitter } from "events";
import {
    Message,
    Address,
    Channel,
    Handler,
    InterActorSystemMessage,
    Strategy
} from "./interfaces";
import * as uuid from "uuid";

export type ActorConstructorOptions<T extends Actor<K>, K = undefined> = {
    name: string;
    actorClass: ActorCons<T, K>;
    paramOptions?: K;
    strategies?: Strategy[];
};
// TODO: Would be great if this works.
// K extends undefined
//     ? { name: string; Class: ActorCons<T> }
//     : { name: string; Class: ActorCons<T, K>; paramOptions: K };

export class ActorSystem {
    name: string;
    protected actorRegistry: { [address: string]: Actor<any> };
    private actorSystemRegistry: { [address: string]: Channel } = {};

    constructor(name?: string) {
        this.name = name || uuid.v1();
        this.actorRegistry = {};
    }

    register(emitter: Channel) {
        this.listenTo(emitter);
        this.log("Send a handshake message");
        emitter.emit("message", { mode: "handshake", address: this.name });
    }

    unregister(actorSystemAddress: string) {
        delete this.actorSystemRegistry[actorSystemAddress];
    }

    listenTo(emitter: Channel) {
        let actorSystemAddress: string | undefined = undefined;
        emitter.on("disconnect", () => {
            this.log("Removing listener");
            if (actorSystemAddress) {
                this.unregister(actorSystemAddress);
            }
        });
        emitter.on("message", (interActorSystemMessage, cb) => {
            if (interActorSystemMessage.mode === "handshake") {
                this.log("Received a handshake message", interActorSystemMessage);
                actorSystemAddress = interActorSystemMessage.address;
                this.actorSystemRegistry[actorSystemAddress!] = emitter;
            } else {
                this.log(
                    "Received a message from across the system boundary",
                    interActorSystemMessage
                );
                const actorRef = this.findActor(interActorSystemMessage.targetAddress);
                this.log("The destination address is", interActorSystemMessage.targetAddress);
                if (actorRef) {
                    const { mode, type, payload, id, senderAddress } = interActorSystemMessage;
                    if (mode === "send") {
                        this.log(
                            `Sending the message to the appropriate actor. Type: ${type}, sender: ${senderAddress}, and payload:`,
                            payload
                        );
                        this.sendMessageAndWait(actorRef, type, senderAddress, id, ...payload);
                    } else {
                        this.log(
                            `Sending the question to the appropriate actor. Type: ${type}, sender: ${senderAddress}, and payload:`,
                            payload
                        );
                        this.sendMessageAndWait(actorRef, type, senderAddress, id, ...payload).then(
                            message => {
                                this.log(
                                    `Received an answer, sending the answer "${message}" for the question with type: ${type}, sender: ${senderAddress}, and payload:`,
                                    payload
                                );
                                cb(message);
                            }
                        );
                    }
                } else {
                    this.log("Unable to find the recipient of the message");
                }
            }
        });
    }

    createActor = <T extends Actor<K>, K = undefined>(options: ActorConstructorOptions<T, K>) => {
        const { name, actorClass } = options;
        this.log(`Creating an actor with name: ${name} and type: ${actorClass.name}`);
        const address = name; // TODO: should have a proper mechanism to generate address
        const fullAddress = {
            actorSystemName: this.name,
            localAddress: address
        };

        this.actorRegistry[address] = new actorClass(
            name,
            fullAddress,
            this,
            (options as any).paramOptions,
            (options as any).strategies
        );
        return this.ref<ActorAskAPI<T>>(fullAddress);
    };

    removeActor = (refOrAddress: ActorRef<any> | Address) => {
        const address = addressOf(refOrAddress);

        if (address.actorSystemName !== this.name) {
            throw new Error("Cannot remove actor that does not belong to this actor system");
        }

        const actor = this.actorRegistry[address.localAddress];
        if (actor) {
            delete this.actorRegistry[address.localAddress];
        } else {
            throw new Error("Unable to remove actor. The specified actor not found");
        }
    };

    ref = <T>(addressOrActorRef: Address | ActorRef<T>): ActorRef<T> => {
        if (addressOrActorRef instanceof ActorRef) {
            return addressOrActorRef;
        } else {
            return new ActorRef<T>(addressOrActorRef, this);
        }
    };

    findActor = <T>(address: Address): ActorRef<T> | null => {
        if (address.actorSystemName !== this.name) {
            this.log(
                "This address contains reference to other actor system, you won't find it in this actor system"
            );
            return null;
        }
        const actor = this.actorRegistry[address.localAddress];
        if (actor) {
            return new ActorRef<T>(address, this);
        } else {
            return null;
        }
    };

    sendMessage = (
        target: ActorRef<any> | Address,
        type: string,
        senderAddress: Address | null,
        id: number,
        ...payload: any[]
    ): void => {
        this.sendMessageAndWait(target, type, senderAddress, id, ...payload).then(
            () => {
                /* do nothing */
            },
            error => {
                this.log(
                    `Catch an error when executing message with type ${type}`,
                    "Target",
                    target,
                    "Sender",
                    senderAddress,
                    "Payload",
                    payload,
                    "Error",
                    error
                );
            }
        );
    };

    sendMessageAndWait = (
        target: ActorRef<any> | Address,
        type: string,
        senderAddress: Address | null,
        id: number,
        ...payload: any[]
    ): Promise<any> => {
        this.log(
            `Received a request to send a message with type: ${type}`,
            "Target",
            target,
            "Sender",
            senderAddress,
            "Payload",
            payload
        );
        const address = addressOf(target);

        if (this.isLocalAddress(address)) {
            const actor = this.actorRegistry[address.localAddress];
            if (actor) {
                this.log("Found the actor. Sending the message");
                return actor.pushToMailbox(type, senderAddress, id, ...payload);
            } else {
                this.log("Unable to find the actor. It might have died");
                return Promise.reject("Actor not found");
            }
        } else {
            const actorSystemEmitter = this.actorSystemRegistry[address.actorSystemName];
            if (actorSystemEmitter) {
                return new Promise<any>((resolve, reject) => {
                    this.log("Found the actor system. Sending the message");
                    actorSystemEmitter.emit(
                        "message",
                        {
                            mode: "ask",
                            targetAddress: address,
                            senderAddress: senderAddress,
                            type: type,
                            id: id,
                            payload: payload
                        },
                        message => resolve(message)
                    );
                });
            } else {
                this.log("Cannot find the targeted actor system");
                return Promise.reject("ActorSystem not found");
            }
        }
    };

    isLocalAddress(address: Address) {
        return address.actorSystemName === this.name;
    }

    _getMessageId(addressOrActorRef: Address | ActorRef<any>) {
        const address = addressOf(addressOrActorRef);
        const actor = this.actorRegistry[address.localAddress];
        return actor.currentMessageId;
    }
    private log(...message: any[]) {
        if (
            (process.env && process.env.ACTRIX_DEBUG) ||
            (typeof window !== "undefined" && (window as any).ACTRIX_DEBUG)
        ) {
            console.log(`[${this.name}]`, ...message);
        }
    }
}

function addressOf(addressOrActorRef: Address | ActorRef<any>) {
    let address: Address;
    if (addressOrActorRef instanceof ActorRef) {
        address = addressOrActorRef.address;
    } else {
        address = addressOrActorRef;
    }
    return address;
}
