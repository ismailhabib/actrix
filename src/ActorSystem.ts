import { Actor, ActorCons, ActorRef, ValidActorMethodProps } from "./Actor";
import { EventEmitter } from "events";
import {
    Message,
    Address,
    Channel,
    Handler,
    InterActorSystemMessage,
    LocalAddress
} from "./interfaces";
import * as uuid from "uuid";

export class ActorSystem {
    name: string;
    private actorSystemRegistry: { [address: string]: Channel } = {};
    private actorRegistry: { [address: string]: Actor };

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
                    const { mode, type, payload, senderAddress } = interActorSystemMessage;
                    if (mode === "send") {
                        this.log(
                            `Sending the message to the appropriate actor. Type: ${type}, sender: ${senderAddress}, and payload:`,
                            payload
                        );
                        this.sendMessage(actorRef, type, payload, senderAddress);
                    } else {
                        this.log(
                            `Sending the question to the appropriate actor. Type: ${type}, sender: ${senderAddress}, and payload:`,
                            payload
                        );
                        this.sendMessage(actorRef, type, payload, senderAddress).then(message => {
                            this.log(
                                `Received an answer, sending the answer "${message}" for the question with type: ${type}, sender: ${senderAddress}, and payload:`,
                                payload
                            );
                            cb(message);
                        });
                    }
                } else {
                    this.log("Unable to find the recipient of the message");
                }
            }
        });
    }
    createActor = <T extends Actor>(name: string, Class: ActorCons<T>) => {
        this.log(`Creating an actor with name: ${name} and type: ${Class.name}`);
        const address = name; // TODO: should have a proper mechanism to generate address
        const fullAddress = {
            actorSystemName: this.name,
            localAddress: address
        };
        const actor = new Class(name, fullAddress, this);
        this.actorRegistry[address] = actor;
        return this.ref<ValidActorMethodProps<T>>(fullAddress);
    };

    ref = <T>(address: Address): ActorRef<T> => {
        return new ActorRef<T>(address, this);
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
        payload: any,
        senderAddress: Address | null
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
        let address: Address;
        if (target instanceof ActorRef) {
            address = target.address;
        } else {
            address = target;
        }

        if (this.isLocalAddress(address)) {
            const actor = this.actorRegistry[address.localAddress];
            if (actor) {
                this.log("Found the actor. Sending the message");
                return actor.pushToMailbox(type, payload, senderAddress);
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

    private log(...message: any[]) {
        console.log("ActorSystem: ", ...message);
    }
}
