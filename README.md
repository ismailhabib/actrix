# Actrix

Actrix is actor system library for NodeJS/Browser. While traditionally actors are about concurrency and paralellism of a highly scalable and/or distributed applications, Actrix is mainly designed to help developers to write code which deals well with "concurrency" (read: asynchronousity) without forcing them to completely change the coding paradigm.

<aside class="notice">
Actrix is in a very early development phase, it is not suitable for production yet.
</aside>

## Getting Started

Follow this instruction to get started with Actrix.

### Installing

To use Actrix on your project, install it using npm or yarn.

```
yarn add actrix
```

or

```
npm install actrix
```

## Concepts

Actor is a unit of concurrency where you can define some behavior, similar to an oobject. However, unlike object, you don't invoke a method in actor but you can send messages to it. The messages are scheduled asynchronously, leaving the execution flow up to the actor. Actor process its messages in sequential, one-at-a-time fashion. This makes reasoning of the processing code much simpler.

## API

### Defining Actors

Follow the following template to define an actor.

```TypeScript
// The interface to "talk" to the actor
type YourActorAPI = {
    yourMethodName: (payload: PayloadType) => Promise<void>; // the exposed "method". They should always be in form of function which returns Promise/CancellablePromise
};

// Define a class which extends Actor<T>. The `T` parameter is only needed when you want to pass a value during initialization.
class YourActor extends Actor<number> implements YourActorAPI {

    yourMethodName = async (payload: PayloadType) => {
        // Implementation for handling messages of this type
        ...
    };

    // Optional, only needed if `T` is defined. This will be triggered when the actor is instantiated
    protected init(initialCounter: number) {
        // Implementation
        ...
    }

    // Optional, only needed if you want to do something special when a message is coming to the mailbox
    onNewMessage = (type, payload, senderAddress) => {
        // Do something here
        ...
    };
}
```

### Create Actor Systems

```TypeScript
const actorSystem = new ActorSystem(name?);
```

Create a new actor system with a specified string as the name. When name is not specified, it will randomly create a random value for it.

### Create Actors

```TypeScript
const actorRef = actorSystem.createActor(options);
```

Create a new actor inside the actorSystem. The options parameter are as follow:

**name**: _(Required)_ A string representing the name of your actor instance<br/>
**actorClass**: _(Required)_ The class definition of the actor<br/>
**paramOptions**: _(Optional)_ The value you want to pass to the actor during initialization. Only needed when you define the type generic `T` as explained in the actor template<br/>
**strategies**: _(Optional)_ List of strategies you want to use for your actor. At the moment it has only one possible value: `IgnoreOlderMessageWithTheSameType` which can be used to optimize your actor to only execute the most recent message of the same type

### Sending a Message to Actors

#### From an Actor

```TypeScript
this.sendTo(actorRef).yourMethodName(payload?);
```

**actorRef**: _(Required)_ the target actorRef where we send the message to<br/>
**payload**: _(As defined by the target actor)_ payload of the message as defined by the target actor

```TypeScript
this.sendTo<TargetActorAPI>(address).yourMethodName(payload?);
```

**address**: _(Required)_ the target address where we send the message to, if `TargetActorAPI` is not specified then there will be no compile-time check<br/>
**payload**: _(As defined by the target actor)_ payload of the message as defined by the target actor

#### From Everywhere Else

```TypeScript
actorRef.send(sender?).yourMethodName(payload?);
```

This is the typical way to send a message to an actor from outside of actors. Sender parameter is optional, but if you need to use it, better to just use the previous API.

**sender**: _(Optional)_ the address of the sender<br/>
**payload**: _(As defined by the target actor)_ payload of the message as defined by the target actor

### Replying to Messages

```TypeScript
const senderRef = this.context.senderRef;
this.sendTo(senderRef).yourMethodName(payload?);
```

### Getting Address of Actors

```TypeScript
const address = actorRef.address;
```

### Creating Cancellable Promise

```TypeScript
const cancellablePromise = promisify(generatorFunction);
```

### Cancelling Current Execution

This is typically triggered inside the `onNewMessage` and only make a difference when the current execution is in form of `CancellablePromise`.
```TypeScript
this.cancelCurrentExecution();
```

## Examples

See [actrix-example](https://github.com/ismailhabib/actrix-example) for examples.

## Versioning

We use [SemVer](http://semver.org/) for versioning. For the versions available, see the [tags on this repository](https://github.com/ismailhabib/actrix/tags). 

## Authors

* **Ismail Habib Muhammad** - *Initial work*

See also the list of [contributors](https://github.com/ismailhabib/actrix/contributors) who participated in this project.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details
