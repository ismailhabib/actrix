import { ActorSystem } from "../src/ActorSystem";
import { Actor, ActorRef } from "../src/Actor";
import { CancellablePromise, promisify } from "../src/Utils";
import { Address } from "../src/interfaces";

describe("Actor", () => {
    it("should be instantiable", () => {
        const counterActor = new ActorSystem().createActor({
            name: "myCounter",
            Class: CounterActor,
            paramOptions: () => {
                /* nothing */
            }
        });
    });

    it("should be possible to send messages with proper payloads", done => {
        const counterActor = new ActorSystem().createActor({
            name: "myCounter",
            Class: CounterActor,
            paramOptions: (counter: number) => {
                expect(counter).toBe(1);
                done();
            }
        });
        counterActor.invoke().increment();
    });

    it("should be possible to send messages with more than 1 payload", done => {
        const dummyActor = new ActorSystem().createActor({ name: "myDummy", Class: DummyActor });
        dummyActor.invoke().registerCallback((param1, param2) => {
            expect(param1).toBe("one");
            expect(param2).toBe("two");
            done();
        });
        dummyActor.invoke().dummy2Param("one", "two");
    });

    it("should be able to send message to another actor", () => {
        const dummyActor = new ActorSystem().createActor({ name: "myDummy", Class: DummyActor });
        dummyActor.invoke().dummy();
    });

    it("should be able to cancel execution", async done => {
        const switcherActor = new ActorSystem().createActor({
            name: "mySwitcher",
            Class: SwitcherActor
        });
        switcherActor.invoke().registerListener(message => {
            expect(message).toBe("Welcome to room three");
            done();
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

type CounterActorListener = (counter: number) => void;

class CounterActor extends Actor<CounterActorListener> implements CounterAPI {
    counter = 0;
    listener: ((counter: number) => void) | undefined;

    increment = async () => {
        this.counter = await asyncInc(this.counter);
        this.listener && this.listener(this.counter);
    };

    protected init(listener: CounterActorListener) {
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
    registerListener: (listener: (value: string) => void) => Promise<void>;
    changeRoom: (roomName: RoomName) => CancellablePromise<void>;
};

class SwitcherActor extends Actor implements SwitcherActorAPI {
    listener: ((value: string) => void) | undefined;
    changeRoom = promisify(this.changeRoomHelper);

    registerListener = async (listener: (value: string) => void) => {
        this.log("listener registered");
        this.listener = listener;
    };

    onNewMessage = (type: any, senderAddress: Address | null, ...payload: any[]) => {
        if (
            this.currentlyProcessedMessage &&
            this.currentlyProcessedMessage.type === "changeRoom" &&
            type === "changeRoom"
        ) {
            this.cancelCurrentExecution();
        }
    };

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
