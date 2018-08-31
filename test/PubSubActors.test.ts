import { ActorSystem } from "../src/ActorSystem";
import { PublisherActor, SubscriberActor } from "../src/PubSubActors";
import { Address } from "../src/interfaces";

describe("PubSub Actors", () => {
    it("should be able to do simple pub-sub", done => {
        const actorSystem = new ActorSystem("TestActorSystem");
        const publisherRef = actorSystem.createActor({
            name: "Publisher",
            Class: NumberPublisherActor
        });
        actorSystem.createActor({
            name: "Subscriber",
            Class: SubscriberActor,
            paramOptions: {
                publisherRef,
                callback: (value: number) => {
                    done();
                }
            }
        });
    });
});

type NumberPublisherActorAPI = {
    generateNumber: () => Promise<void>;
};
class NumberPublisherActor extends PublisherActor<number> implements NumberPublisherActorAPI {
    // constructor(
    //     name: string,
    //     protected address: Address,
    //     protected actorSystem: ActorSystem,
    //     options: {}
    // ) {
    //     super(name, address, actorSystem, options);
    // }

    onStart(options: number) {
        setTimeout(() => {
            this.atSelf().generateNumber();
        }, 1000);
    }
    generateNumber = async () => {
        this.setValue(Math.random());
    };
}
