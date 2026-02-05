import { Effect, Queue, Ref, Fiber, Console } from "effect";
import { func } from "effect/FastCheck";

export type ActorMessage<Message> =
  | { _tag: "Message"; payload: Message }
  | { _tag: "Stop" }
  | { _tag: "Restart" };

export interface SupervisedActor<State, Message> {
  send: (message: Message) => Effect.Effect<boolean>;
  stop: () => Effect.Effect<boolean>;
  restart: () => Effect.Effect<boolean>;
  getState: () => Effect.Effect<State>;
}

export const createSuperVisor = <State, Message>(
  name: string,
  initalState: State,
  handler: (state: State, message: Message) => Effect.Effect<State>,
):  Effect.Effect<SupervisedActor<State, Message>> =>
  Effect.gen(function* () {
    const queue = yield* Queue.unbounded<ActorMessage<Message>>();
    const stateRef = yield* Ref.make(initalState);
    const fiberRef = yield* Ref.make<Fiber.Fiber<void, never> | null>(null);

    const actorLoop = Effect.gen(function* () {
      yield* Console.log(`\n [${name}] Actor started and listing`);
      try {
        while (true) {
          const msg = yield* Queue.take(queue);
          if(msg._tag === "Stop"){
            yield* Console.log(`\n[${name}] Shutting down...`);
            break;
          }
          if(msg._tag === "Restart"){
            yield* Console.log(`\n[${name}] 🔄 Restarting to initial state...`);
            yield* Ref.set(stateRef, initalState);
            continue;
          }
          yield* Console.log("Message Received");
          const currentState = yield* Ref.get(stateRef);

          const newState = yield* Effect.retry(
            handler(currentState, msg.payload),
            { times: 3 }
          );
        
          yield* Ref.set(stateRef, newState)
        }
      } catch (e) {
        yield* Console.log(`[${name}] Error`, e)
      }
    });
    const startActor = Effect.gen(function* (){
        const fiber = yield* Effect.fork(actorLoop);
        yield* Ref.set(fiberRef, fiber)
    });
    yield* startActor;
    return {
      send: (message: Message) => Queue.offer(queue, { _tag: "Message", payload: message }),
      stop: () => Queue.offer(queue, { _tag: "Stop" }),
      restart: () => Queue.offer(queue, { _tag: "Restart" }),
      getState: () => Ref.get(stateRef),
    };
  });
// ):b => Effect.gen(func )
