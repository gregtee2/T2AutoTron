# HA Generic Device Command Contract

Status: Implemented for the frontend plugin and backend engine on September 11, 2026.

## Purpose

HA Generic Device must make a clear distinction between:

- `desiredState`: what the graph currently requests.
- `observedState`: the latest explicit state reported by Home Assistant.
- `pendingCommand`: a desired state sent or waiting to be sent, but not yet confirmed.

An HTTP success means Home Assistant accepted the request. It does not prove that the physical device changed state.

## Input Rules

| Input | Follow-mode behavior |
| --- | --- |
| `true` | A new Follow input value requests ON. |
| `false` | A new Follow input value requests OFF. |
| Missing or `undefined` | No power command. Missing input must never be interpreted as OFF. |
| HSV with no trigger | Update color only when HA explicitly reports the device ON. Never wake an OFF device. |

After HA confirms a Follow command, a later opposite state reported by HA is treated as an external manual override when Enforce State is disabled. T2 adopts that state and sends no corrective power command until the graph input changes. Enforce State is the explicit opt-in for continuously restoring the graph-requested state.

Other modes remain edge-triggered:

- Toggle: toggle only on a rising edge.
- Turn On: turn on only on a rising edge.
- Turn Off: turn off only on a rising edge.

## Command Phases

| Phase | Meaning |
| --- | --- |
| `idle` | No desired power state is currently supplied. |
| `pending` | Delivery or HA confirmation is still pending. |
| `confirmed` | HA explicitly reports the desired state. |
| `retrying` | A temporary failure occurred; desired state is retained with bounded backoff. |
| `delegated` | This engine is not the current command owner. |
| `failed` | A non-retryable failure occurred and is visible for diagnosis. |

## Delivery Rules

1. A command must not update `observedState` optimistically.
2. HTTP success leaves the command pending until an HA state event or state fetch confirms it.
3. HTTP 408, 409, 425, 429, and 5xx failures are retryable.
4. Network exceptions and timeouts are retryable.
5. Permanent 4xx failures are visible and do not retry forever.
6. Retry delays use bounded exponential backoff, starting at 2 seconds and capped at 60 seconds.
7. An unchanged TRUE or FALSE input does not reset a retry deadline.
8. A newer desired state supersedes the older pending state.
9. Devices that are already confirmed are not included in retries for other devices.
10. `unavailable` and `unknown` are not OFF confirmations.
11. Confirmation and retry deadlines use a fresh HA state snapshot; a failed refresh cannot confirm from stale cache.
12. Queued commands are checked against the latest intent immediately before transport. Power commands outrank and can cancel stale color work.
13. Failed HSV updates retain only the latest color and retry with bounded exponential backoff.

## Ownership Rules

- The frontend commands devices while an editor is active and heartbeats are current.
- The backend records intent but does not issue device commands during frontend ownership.
- The backend takeover timeout remains 30 seconds.
- Frontend heartbeats are sent every 10 seconds to leave margin for normal timer jitter.
- During takeover, backend commands stay paused until graph reload and HA-state reconciliation finish.
- Graph reload waits for an active tick to drain, and concurrent reloads apply only the newest graph.
- Handoff reconciliation reads `selectedDeviceIds`, adopts observed HA state, and clears stale power intent for normal Follow nodes.
- Follow and edge-triggered modes baseline the current input during takeover so a steady value is not replayed as a new command.
- A valid late heartbeat restores frontend ownership.

## Output and Status Rules

- Frontend device outputs represent observed HA state, not guessed command success.
- Before HA reports a device, its frontend output is `{ on: null, state: "unknown", available: false }`, not fabricated OFF.
- The backend's existing `is_on` output remains desired/trigger state for graph compatibility; use engine device diagnostics for desired versus observed details.
- The node status reports waiting, confirmed, retrying, or failed command state.
- Backend diagnostics at `/api/engine/device-states` include desired, observed, pending, phase, attempt, error, confirmation deadline, and retry deadline.
- Runtime command state is not serialized into saved graphs.

## Lifecycle Rules

- Startup waits for an actual input value; a missing upstream value issues no command.
- Graph-load state, retry timers, and confirmation timers are runtime-only.
- Removing a node clears its timers, listeners, queued intent, and delayed commands.
- Node callbacks raised during `data()` may refresh UI but must not recursively start another graph evaluation.

## Acceptance Tests

The implementation must cover:

1. TRUE turns an explicitly OFF device ON.
2. FALSE turns an explicitly ON device OFF.
3. Missing input sends no command.
4. HTTP 503 retains desired state and retries without another input edge.
5. HTTP success remains pending until HA confirmation.
6. HA confirmation clears pending state.
7. `unavailable` does not confirm OFF.
8. One failed device does not resend commands to confirmed devices.
9. HSV does not wake an OFF device.
10. Frontend ownership prevents backend commands.
11. Backend takeover waits for reconciliation and then evaluates the current input.
12. A late heartbeat restores frontend ownership.
13. Runtime state does not alter graph serialization.
14. A superseded or deleted queued command cannot reach HA.
15. A failed HSV command retries the latest value without waking a device HA reports OFF.
16. Concurrent graph reloads leave only the newest graph running.
17. Manual HA OFF and ON changes remain in place until the Follow input changes.
18. Enforce State still corrects an external state change back to graph intent.

## Caveman Summary

A request is not complete merely because it was mailed. The node keeps separate records for what was requested, what was sent, and what Home Assistant confirms. Temporary delivery failures are retried; missing input means do nothing; only one controller holds the keys at a time.
