import type { UnifiedMessage } from "../types.ts";

export async function pollGmail(): Promise<UnifiedMessage[]> {
  // Day 0/1 TODO: OAuth via google-auth-library, then gmail.users.messages.list
  // with query `-label:LOBBY_PROCESSED newer_than:1d`.
  // Normalize Gmail payload into UnifiedMessage[].
  return [];
}
