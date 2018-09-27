import { CancellablePromise } from "./Utils";

export type Message = {};

export type BaseActorDefinition = {
    [key: string]: (...payload: any[]) => Promise<any> | CancellablePromise<any>;
};
export type ActorSystemAdress = string;
export type LocalAddress = string;
export type Address = {
    actorSystemName: ActorSystemAdress;
    localAddress: LocalAddress;
};

export type Handler<T> = { [P in keyof T]: T[P] };

export type Channel = {
    on: (
        event: "message" | "disconnect" | "reconnect",
        fn: (message: InterActorSystemMessage, callback: (message: any) => void) => void
    ) => void;
    emit: (
        event: string,
        message: InterActorSystemMessage,
        callback?: (message: any) => void
    ) => void;
};

export type InterActorSystemMessage =
    | {
          mode: "send" | "ask"; // 'send' is probably no longer needed
          type: string;
          payload: any[];
          targetAddress: Address;
          senderAddress: Address | null;
      }
    | {
          mode: "handshake";
          address: string;
      };

export type Strategy = "IgnoreOlderMessageWithTheSameType";
