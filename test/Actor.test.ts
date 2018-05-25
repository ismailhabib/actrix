import { ActorSystem } from "../src/ActorSystem";
import { Actor, ActorRef } from "../src/Actor";
import { CancellablePromise, promisify } from "../src/Utils";
import { Address } from "../src/interfaces";

describe("Actor", () => {
    it("should be instantiable", () => {
        const counterActor = new ActorSystem().createActor("myCounter", CounterActor);
    });

    it("should be possible to send messages with proper payloads", done => {
        const counterActor = new ActorSystem().createActor("myCounter", CounterActor);
        counterActor.invoke().registerListener(counter => {
            expect(counter).toBe(1);
            done();
        });
        counterActor.invoke().increment();
    });

    it("should be able to send message to another actor", () => {
        const dummyActor = new ActorSystem().createActor("myDummy", DummyActor);
        dummyActor.invoke().dummy();
    });

    it("should be able to cancel execution", async done => {
        const switcherActor = new ActorSystem().createActor("mySwitcher", SwitcherActor);
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
};

class DummyActor extends Actor implements DummyAPI {
    counter = 0;
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
}

// Counter

type CounterAPI = {
    registerListener: (listener: (counter: number) => void) => Promise<void>;
    increment: () => Promise<void>;
};

class CounterActor extends Actor implements CounterAPI {
    counter = 0;
    listener: ((counter: number) => void) | undefined;
    registerListener = async (listener: (counter: number) => void) => {
        this.listener = listener;
    };
    increment = async () => {
        this.counter = await asyncInc(this.counter);
        this.listener && this.listener(this.counter);
    };
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

    onNewMessage = (type: any, payload: any, senderAddress: Address | null) => {
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

    private openRoom = async roomName => {
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
