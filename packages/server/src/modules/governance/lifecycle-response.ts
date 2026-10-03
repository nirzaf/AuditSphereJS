/** Transport mapping shared by lifecycle controllers and contract tests. */
type TransitionRecord = {
  id: string; command: string; fromState: string; toState: string; reason: string | null; version: number; createdAt: Date;
  actorId?: string; evidence?: unknown; engagementId?: string;
};
type LifecycleRecord = { state: string; version: number; terminalOutcome: string | null; permittedCommands: string[]; history: TransitionRecord[] };

export function toLifecycleHistoryView(result: LifecycleRecord) {
  return {
    state: result.state, version: result.version, terminalOutcome: result.terminalOutcome, permittedCommands: result.permittedCommands,
    history: result.history.map((transition) => ({
      id: transition.id, command: transition.command, fromState: transition.fromState, toState: transition.toState,
      reason: transition.reason, version: transition.version, createdAt: transition.createdAt.toISOString(),
    })),
  };
}
