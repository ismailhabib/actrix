import { ActorSystem } from "../src/ActorSystem";
import express from "express";
import socketIO from "socket.io";
import { Actor, ActorRef } from "../src/Actor";
import * as http from "http";
import * as ioClient from "socket.io-client";

describe("Actor System", () => {
    it("should be instantiable", () => {
        const actorSystem = new ActorSystem();
    });

    it("should handle exception when message is sent to an actor in a non-existent ActorSystem", async done => {
        const actorSystem = new ActorSystem();
        try {
            await actorSystem.sendMessage(
                { actorSystemName: "non-existent actor", localAddress: "random address" },
                "random-type",
                null,
                null
            );
            fail(
                "Sending message to an actor in a non-existent actor system should throw an exception"
            );
        } catch (exception) {
            done();
        }
    });
});

let server: http.Server;
let io: SocketIO.Server;
let actorSystem: ActorSystem;
let serverActor: ActorRef<ServerAPI>;
let port: number;

const app = express();
describe("Multi-Actor System", () => {
    beforeEach(() => {
        server = app.listen(0);
        port = server.address().port;
        io = socketIO(server);
        actorSystem = new ActorSystem("server");
        serverActor = actorSystem.createActor("serverActor", ServerActor);
        io.of("/").on("connection", socket => {
            actorSystem.register(socket);
        });
    });
    afterEach(() => {
        server.close();
        io.close();
    });

    it("should allow actors to send message in different actor system", done => {
        serverActor.invoke().registerListener(() => {
            done();
        });
        const socket = ioClient.connect(`http://localhost:${port}`);
        const clientActorSystem = new ActorSystem();
        clientActorSystem.register(socket);
        const actorRef = clientActorSystem.createActor("clientActor", ClientActor);
        setTimeout(() => {
            actorRef.invoke().trigger();
        }, 3000); // give time for the handshake
    });

    it("should throw exception when trying to send message to an actor of a disconnected actor system", done => {
        serverActor.invoke().registerListener(() => {
            fail();
        });
        const socket = ioClient.connect(`http://localhost:${port}`);
        const clientActorSystem = new ActorSystem();
        clientActorSystem.register(socket);
        const actorRef = clientActorSystem.createActor("clientActor", ClientActor);
        setTimeout(() => {
            socket.disconnect();
            actorRef
                .invoke()
                .trigger()
                .then(
                    () => {
                        fail();
                    },
                    exception => {
                        done();
                    }
                );
        }, 1000); // give time for the handshake
    });
    it("should allow actors to send message in different actor system after reconnection", done => {
        serverActor.invoke().registerListener(() => {
            done();
        });
        const socket = ioClient.connect(`http://localhost:${port}`, {
            reconnection: true,
            reconnectionDelay: 10
        });
        const clientActorSystem = new ActorSystem();
        clientActorSystem.register(socket);
        const actorRef = clientActorSystem.createActor("clientActor", ClientActor);
        setTimeout(() => {
            socket.disconnect();
            socket.connect();
            setTimeout(() => {
                actorRef.invoke().trigger();
            }, 1000);
        }, 1000); // give time for the handshake
    });
});

type ClientAPI = {
    trigger: () => Promise<void>;
};

class ClientActor extends Actor implements ClientAPI {
    trigger = async () => {
        await this.at<ServerAPI>({
            actorSystemName: "server",
            localAddress: "serverActor"
        }).connect();
    };
}

type ServerAPI = {
    registerListener: (listener: () => void) => Promise<void>;
    connect: () => Promise<void>;
};

class ServerActor extends Actor implements ServerAPI {
    listener: (() => void) | undefined;

    registerListener = async (listener: () => void) => {
        this.listener = listener;
    };
    connect = async () => {
        this.listener && this.listener();
    };
}
