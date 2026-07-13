/**
 * Tracks which assistant messages have already been counted, so genuine
 * duplicates (resumed sessions, retries, the same response written to more than
 * one file) are collapsed across an entire scan.
 *
 * Key = `${messageId}:${requestId}`. When either id is missing we cannot prove
 * the entry is a duplicate, so we count it (the lesser error vs. dropping real
 * usage).
 */
export class Deduplicator {
  private readonly seen = new Set<string>();

  /**
   * Returns true if this (messageId, requestId) pair is new and should be
   * counted; false if it was already seen. Entries missing either id always
   * count (returns true) and are not recorded.
   */
  shouldCount(messageId: string | undefined, requestId: string | undefined): boolean {
    if (!messageId || !requestId) {
      return true;
    }
    const key = `${messageId}:${requestId}`;
    if (this.seen.has(key)) {
      return false;
    }
    this.seen.add(key);
    return true;
  }

  clear(): void {
    this.seen.clear();
  }
}

export function dedupKey(
  messageId: string | undefined,
  requestId: string | undefined
): string {
  return `${messageId ?? ""}:${requestId ?? ""}`;
}
