import { ActorSystem } from "./ActorSystem";
import { LocalAddress } from "./interfaces";
import { Actor } from "./Actor";

export class TestActorSystem extends ActorSystem {
    getRealActor(localAddress: LocalAddress): Actor {
        return this.actorRegistry[localAddress];
    }
}
