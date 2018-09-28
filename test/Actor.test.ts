import { ActorSystem } from "../src/ActorSystem";
import { Actor, ActorRef } from "../src/Actor";
import { CancellablePromise, promisify } from "../src/Utils";
import { Address, Listener } from "../src/interfaces";

describe("Actor", () => {
    it("should be instantiable", () => {
        const counterActor = new ActorSystem().createActor({
            name: "myCounter",
            actorClass: CounterActor,
            paramOptions: () => {
                /* nothing */
            }
        });
    });

    it("should be removable", () => {
        const actorSystem = new ActorSystem();
        const counterActor = actorSystem.createActor({
            name: "myCounter",
            actorClass: CounterActor,
            paramOptions: () => {
                /* nothing */
            }
        });

        const address = counterActor.address;
        actorSystem.removeActor(counterActor);
        expect(actorSystem.findActor(address)).toBe(null);
    });

    it("should be removable by using address", () => {
        const actorSystem = new ActorSystem();
        const counterActor = actorSystem.createActor({
            name: "myCounter",
            actorClass: CounterActor,
            paramOptions: () => {
                /* nothing */
            }
        });

        const address = counterActor.address;
        actorSystem.removeActor(counterActor.address);
        expect(actorSystem.findActor(address)).toBe(null);
    });

    it("should throw error when trying to remove non-existent actor", () => {
        const actorSystem = new ActorSystem();
        expect(() => {
            actorSystem.removeActor({
                actorSystemName: actorSystem.name,
                localAddress: "random_value"
            });
        }).toThrowError();
    });

    it("should throw error when trying to remove actor that does not belong to the actor system", () => {
        const actorSystem = new ActorSystem();
        const actorSystem2 = new ActorSystem();
        const counterActor = actorSystem.createActor({
            name: "myCounter",
            actorClass: CounterActor,
            paramOptions: () => {
                /* nothing */
            }
        });
        expect(() => {
            actorSystem2.removeActor(counterActor);
        }).toThrowError();
    });

    it("should be possible to send messages with proper payloads", done => {
        const counterActor = new ActorSystem().createActor({
            name: "myCounter",
            actorClass: CounterActor,
            paramOptions: (counter: number) => {
                expect(counter).toBe(1);
                done();
            }
        });
        counterActor.invoke().increment();
    });

    it("should be possible to send messages with more than 1 payload", done => {
        const dummyActor = new ActorSystem().createActor({
            name: "myDummy",
            actorClass: DummyActor
        });
        dummyActor.invoke().registerCallback((param1, param2) => {
            expect(param1).toBe("one");
            expect(param2).toBe("two");
            done();
        });
        dummyActor.invoke().dummy2Param("one", "two");
    });

    it("should be able to send message to another actor", () => {
        const dummyActor = new ActorSystem().createActor({
            name: "myDummy",
            actorClass: DummyActor
        });
        dummyActor.invoke().dummy();
    });

    it("should be able to cancel execution", done => {
        const switcherActor = new ActorSystem().createActor({
            name: "mySwitcher",
            actorClass: SwitcherActor,
            paramOptions: message => {
                expect(message).toBe("Welcome to room three");
                done();
            }
        });
        switcherActor
            .invoke()
            .changeRoom("one")
            .then(
                () => {
                    /* nothing */
                },
                () => {
                    /* nothing */
                }
            );
        switcherActor
            .invoke()
            .changeRoom("two")
            .then(
                () => {
                    /* nothing */
                },
                () => {
                    /* nothing */
                }
            );
        switcherActor
            .invoke()
            .changeRoom("three")
            .then(
                () => {
                    /* nothing */
                },
                () => {
                    /* nothing */
                }
            );
    });

    it("should be able to ignore older messages with the same type", done => {
        const switcherActor = new ActorSystem().createActor({
            name: "mySwitcher",
            actorClass: SwitcherActor2,
            paramOptions: message => {
                expect(message).toBe("Welcome to room three");
                done();
            },
            strategies: ["IgnoreOlderMessageWithTheSameType"]
        });
        switcherActor
            .invoke()
            .changeRoom("one")
            .then(
                () => {
                    /* nothing */
                },
                () => {
                    /* nothing */
                }
            );
        switcherActor
            .invoke()
            .changeRoom("two")
            .then(
                () => {
                    /* nothing */
                },
                () => {
                    /* nothing */
                }
            );
        switcherActor
            .invoke()
            .changeRoom("three")
            .then(
                () => {
                    /* nothing */
                },
                () => {
                    /* nothing */
                }
            );
    });
});

// Dummy Actor
type DummyAPI = {
    dummy: () => Promise<void>;
    replyDummy: () => Promise<void>;
    registerCallback: (callback: (param1: string, param2: string) => void) => Promise<void>;
    dummy2Param: (param1: string, param2: string) => Promise<void>;
};

class DummyActor extends Actor implements DummyAPI {
    counter = 0;
    callback: ((param1: string, param2: string) => void) | undefined;
    dummy = async () => {
        this.at<DummyAPI>(this.address).replyDummy();
    };

    replyDummy = async () => {
        const senderRef: ActorRef<DummyAPI> = this.context.senderRef!;
        if (this.counter === 0) {
            this.at(senderRef).replyDummy();
        }
        this.counter++;
    };

    registerCallback = async (callback: (param1: string, param2: string) => void) => {
        this.callback = callback;
    };

    dummy2Param = async (param1: string, param2: string) => {
        this.callback && this.callback(param1, param2);
    };
}

// Counter

type CounterAPI = {
    increment: () => Promise<void>;
};

class CounterActor extends Actor<Listener<number>> implements CounterAPI {
    counter = 0;
    listener: Listener<number> | undefined;

    increment = async () => {
        this.counter = await asyncInc(this.counter);
        this.listener && this.listener(this.counter);
    };

    protected init(listener: Listener<number>) {
        this.listener = listener;
    }
}

async function asyncInc(value: number) {
    return new Promise<number>((resolve, reject) => {
        setTimeout(() => {
            resolve(value + 1);
        }, 200);
    });
}

// Switcher
type RoomName = "one" | "two" | "three";

type SwitcherActorAPI = {
    changeRoom: (roomName: RoomName) => CancellablePromise<void>;
};

class SwitcherActor extends Actor<Listener<string>> implements SwitcherActorAPI {
    listener: Listener<string> | undefined;
    changeRoom = promisify(this.changeRoomHelper);

    onNewMessage = (type: any, senderAddress: Address | null, ...payload: any[]) => {
        if (
            this.currentlyProcessedMessage &&
            this.currentlyProcessedMessage.type === "changeRoom" &&
            type === "changeRoom"
        ) {
            this.cancelCurrentExecution();
        }
    };
    protected init(listener: Listener<string>) {
        this.listener = listener;
    }

    private *changeRoomHelper(roomName: RoomName) {
        const value = yield this.openRoom(roomName);
        this.listener && this.listener(value);
    }

    private openRoom = async (roomName: RoomName) => {
        return new Promise<string>((resolve, reject) => {
            const changeRoomMsg = this.mailBox.find(mail => mail.type === "changeRoom");
            if (changeRoomMsg) {
                reject("There are more change room message on the queue, aborting this one");
            }
            setTimeout(() => {
                resolve(`Welcome to room ${roomName}`);
            }, 1000);
        });
    };
}

class SwitcherActor2 extends Actor<Listener<string>> implements SwitcherActorAPI {
    listener: Listener<string> | undefined;
    changeRoom = promisify(this.changeRoomHelper);

    protected init(listener: Listener<string>) {
        this.listener = listener;
    }

    private *changeRoomHelper(roomName: RoomName) {
        const value = yield this.openRoom(roomName);
        this.listener && this.listener(value);
    }

    private openRoom = async (roomName: RoomName) => {
        return new Promise<string>((resolve, reject) => {
            setTimeout(() => {
                resolve(`Welcome to room ${roomName}`);
            }, 1000);
        });
    };
}
