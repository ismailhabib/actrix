import { ActorSystem } from "./ActorSystem";
import { LocalAddress } from "./interfaces";
import { Actor, ActorCons } from "./Actor";

export class TestActorSystem extends ActorSystem {
    getRealActor<T extends Actor>(localAddress: LocalAddress): T {
        return this.actorRegistry[localAddress] as T;
    }
}
