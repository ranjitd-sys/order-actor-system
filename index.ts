import { Effect } from "effect"
import { Console } from "effect"

const program = Effect.gen(function* () {
  yield* Console.log("Starting bank actor system...")
})

Effect.runPromise(program)