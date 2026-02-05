import { Effect, Queue, Ref, Fiber } from "effect"
import { Console } from "effect"

// ============================================================================
// ENHANCED BANK ACTOR WITH VISUAL FEEDBACK
// ============================================================================

interface BankAccount {
  balance: number
  transactions: Array<{
    type: string
    amount: number
    timestamp: number
  }>
}

type BankMessage = 
  | { type: "deposit"; amount: number }
  | { type: "withdraw"; amount: number }
  | { type: "transfer"; to: string; amount: number }

type ActorMessage<T> = 
  | { _tag: "Message"; payload: T }
  | { _tag: "Stop" }
  | { _tag: "Restart" }

interface SupervisedActor<State, Message> {
  send: (message: Message) => Effect.Effect<void>
  stop: () => Effect.Effect<void>
  getState: () => Effect.Effect<State>
  restart: () => Effect.Effect<void>
}

// Pretty print helpers
const printBox = (title: string, content: string[]) => {
  const width = 60
  const line = "─".repeat(width)
  console.log(`┌${line}┐`)
  console.log(`│ ${title.padEnd(width - 2)} │`)
  console.log(`├${line}┤`)
  content.forEach(c => console.log(`│ ${c.padEnd(width - 2)} │`))
  console.log(`└${line}┘`)
}

const bankAccountHandler = (
  state: BankAccount,
  message: BankMessage
): Effect.Effect<BankAccount> =>
  Effect.gen(function* () {
    const timestamp = Date.now()
    
    switch (message.type) {
      case "deposit":
        yield* Console.log(`\n💰 DEPOSIT: $${message.amount}`)
        yield* Console.log(`   Before: $${state.balance}`)
        const newDepositBalance = state.balance + message.amount
        yield* Console.log(`   After:  $${newDepositBalance}`)
        yield* Console.log(`   ✅ Success!`)
        
        return {
          balance: newDepositBalance,
          transactions: [
            ...state.transactions,
            { type: "deposit", amount: message.amount, timestamp }
          ]
        }
        
      case "withdraw":
        yield* Console.log(`\n💸 WITHDRAWAL: $${message.amount}`)
        yield* Console.log(`   Current balance: $${state.balance}`)
        
        if (state.balance < message.amount) {
          yield* Console.log(`   ❌ REJECTED: Insufficient funds!`)
          yield* Console.log(`   Need: $${message.amount - state.balance} more`)
          return state
        }
        
        const newWithdrawBalance = state.balance - message.amount
        yield* Console.log(`   New balance: $${newWithdrawBalance}`)
        yield* Console.log(`   ✅ Success!`)
        
        return {
          balance: newWithdrawBalance,
          transactions: [
            ...state.transactions,
            { type: "withdraw", amount: message.amount, timestamp }
          ]
        }
        
      case "transfer":
        yield* Console.log(`\n🔄 TRANSFER: $${message.amount} → ${message.to}`)
        yield* Console.log(`   Current balance: $${state.balance}`)
        
        if (state.balance < message.amount) {
          yield* Console.log(`   ❌ REJECTED: Insufficient funds!`)
          return state
        }
        
        const newTransferBalance = state.balance - message.amount
        yield* Console.log(`   New balance: $${newTransferBalance}`)
        yield* Console.log(`   ✅ Transfer initiated to ${message.to}`)
        
        return {
          balance: newTransferBalance,
          transactions: [
            ...state.transactions,
            { type: "transfer", amount: message.amount, timestamp }
          ]
        }
    }
  })

const createSupervisedActor = <State, Message>(
  name: string,
  initialState: State,
  handler: (state: State, message: Message) => Effect.Effect<State>
): Effect.Effect<SupervisedActor<State, Message>> =>
  Effect.gen(function* () {
    const queue = yield* Queue.unbounded<ActorMessage<Message>>()
    const stateRef = yield* Ref.make(initialState)
    const fiberRef = yield* Ref.make<Fiber.Fiber<void, never> | null>(null)
    
    const actorLoop = Effect.gen(function* () {
      yield* Console.log(`\n🎭 [${name}] Actor started and listening...`)
      
      try {
        while (true) {
          const msg = yield* Queue.take(queue)
          
          if (msg._tag === "Stop") {
            yield* Console.log(`\n[${name}] 🛑 Shutting down...`)
            break
          }
          
          if (msg._tag === "Restart") {
            yield* Console.log(`\n[${name}] 🔄 Restarting to initial state...`)
            yield* Ref.set(stateRef, initialState)
            continue
          }
          
          yield* Console.log(`\n[${name}] 📨 Message received`)
          const currentState = yield* Ref.get(stateRef)
          
          const newState = yield* Effect.retry(
            handler(currentState, msg.payload),
            { times: 3 }
          )
          
          yield* Ref.set(stateRef, newState)
        }
      } catch (error) {
        yield* Console.error(`[${name}] ❌ Error:`, error)
      }
    })
    
    const startActor = Effect.gen(function* () {
      const fiber = yield* Effect.fork(actorLoop)
      yield* Ref.set(fiberRef, fiber)
    })
    
    yield* startActor
    
    return {
      send: (message: Message) => 
        Queue.offer(queue, { _tag: "Message", payload: message }),
      stop: () =>
        Queue.offer(queue, { _tag: "Stop" }),
      getState: () =>
        Ref.get(stateRef),
      restart: () =>
        Queue.offer(queue, { _tag: "Restart" })
    }
  })

// ============================================================================
// DEMO PROGRAM WITH VISUAL OUTPUT
// ============================================================================

const program = Effect.gen(function* () {
  console.clear() // Clear console for clean output
  
  printBox("🏦 BANK ACTOR SYSTEM DEMO", [
    "Watch the actors process transactions in real-time!",
    ""
  ])
  
  yield* Effect.sleep("1 second")
  
  // Create two accounts
  yield* Console.log("\n📍 Creating Account-001 (Alice) with $1000...")
  const alice = yield* createSupervisedActor(
    "Alice",
    { balance: 1000, transactions: [] },
    bankAccountHandler
  )
  
  yield* Effect.sleep("500 millis")
  
  yield* Console.log("\n📍 Creating Account-002 (Bob) with $500...")
  const bob = yield* createSupervisedActor(
    "Bob",
    { balance: 500, transactions: [] },
    bankAccountHandler
  )
  
  yield* Effect.sleep("1 second")
  
  // Scenario 1: Alice deposits
  printBox("SCENARIO 1", ["Alice deposits $500"])
  yield* alice.send({ type: "deposit", amount: 500 })
  yield* Effect.sleep("1 second")
  
  // Scenario 2: Alice withdraws
  printBox("SCENARIO 2", ["Alice withdraws $200"])
  yield* alice.send({ type: "withdraw", amount: 200 })
  yield* Effect.sleep("1 second")
  
  // Scenario 3: Bob deposits
  printBox("SCENARIO 3", ["Bob deposits $100"])
  yield* bob.send({ type: "deposit", amount: 100 })
  yield* Effect.sleep("1 second")
  
  // Scenario 4: Alice transfers to Bob
  printBox("SCENARIO 4", ["Alice transfers $300 to Bob"])
  yield* alice.send({ type: "transfer", to: "Bob", amount: 300 })
  yield* Effect.sleep("1 second")
  
  // Scenario 5: Alice tries to withdraw too much (will fail)
  printBox("SCENARIO 5", ["Alice tries to withdraw $5000 (should fail)"])
  yield* alice.send({ type: "withdraw", amount: 5000 })
  yield* Effect.sleep("1 second")
  
  // Scenario 6: Bob withdraws
  printBox("SCENARIO 6", ["Bob withdraws $50"])
  yield* bob.send({ type: "withdraw", amount: 50 })
  yield* Effect.sleep("1 second")
  
  // Get final states
  yield* Console.log("\n" + "=".repeat(70))
  yield* Console.log("\n⏸️  Processing complete! Fetching final account states...\n")
  yield* Effect.sleep("500 millis")
  
  const aliceState = yield* alice.getState()
  const bobState = yield* bob.getState()
  
  // Display final results
  printBox("📊 FINAL ACCOUNT STATES", [
    "",
    `Alice (Account-001):`,
    `  💰 Balance: $${aliceState.balance}`,
    `  📝 Transactions: ${aliceState.transactions.length}`,
    "",
    `Bob (Account-002):`,
    `  💰 Balance: $${bobState.balance}`,
    `  📝 Transactions: ${bobState.transactions.length}`,
    ""
  ])
  
  // Show transaction history
  yield* Console.log("\n📜 ALICE'S TRANSACTION HISTORY:")
  console.log("┌────────────────────────────────────────────────┐")
  aliceState.transactions.forEach((tx, i) => {
    const time = new Date(tx.timestamp).toLocaleTimeString()
    const type = tx.type.toUpperCase().padEnd(10)
    const amount = `$${tx.amount}`.padStart(8)
    console.log(`│ ${(i + 1)}.  ${type}  ${amount}  at ${time} │`)
  })
  console.log("└────────────────────────────────────────────────┘")
  
  yield* Console.log("\n📜 BOB'S TRANSACTION HISTORY:")
  console.log("┌────────────────────────────────────────────────┐")
  bobState.transactions.forEach((tx, i) => {
    const time = new Date(tx.timestamp).toLocaleTimeString()
    const type = tx.type.toUpperCase().padEnd(10)
    const amount = `$${tx.amount}`.padStart(8)
    console.log(`│ ${(i + 1)}.  ${type}  ${amount}  at ${time} │`)
  })
  console.log("└────────────────────────────────────────────────┘")
  
  // Calculate totals
  const aliceTotal = aliceState.transactions.reduce((sum, tx) => {
    if (tx.type === "deposit") return sum + tx.amount
    return sum - tx.amount
  }, 1000)
  
  const bobTotal = bobState.transactions.reduce((sum, tx) => {
    if (tx.type === "deposit") return sum + tx.amount
    return sum - tx.amount
  }, 500)
  
  yield* Console.log("\n💡 SUMMARY:")
  yield* Console.log(`   Alice started with $1000, now has $${aliceState.balance}`)
  yield* Console.log(`   Bob started with $500, now has $${bobState.balance}`)
  yield* Console.log(`   Total money in system: $${aliceState.balance + bobState.balance}`)
  
  // Cleanup
  yield* Console.log("\n🧹 Cleaning up actors...")
  yield* alice.stop()
  yield* bob.stop()
  yield* Effect.sleep("500 millis")
  
  printBox("✅ DEMO COMPLETE", [
    "All actors have been shut down gracefully.",
    "Check the output above to see how actors processed messages!",
    ""
  ])
})

// Run it!
Effect.runPromise(program).catch(console.error)