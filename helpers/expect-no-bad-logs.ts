export type ConsoleEntry = { type: string; text: string };

const BAD_PATTERNS = [
  /\bERR\b/i,
  /\bREJECTION\b/i,
  /commit_empty/i,
  /session\.no_audio_ingress/i,
  /response\.create\.ignored/i,
  /duplicate scripts detected/i,
  /QVT duplicate load/i,
  /worklet 404/i,
  /worklet load failed/i,
];

export function findBadLogs(consoleEntries: ConsoleEntry[], appLines: string[]): string[] {
  const lines: string[] = [];
  try { lines.push(...appLines); } catch {}
  try { lines.push(...consoleEntries.map(e => e.text)); } catch {}
  const failures: string[] = [];
  for (const line of lines) {
    for (const re of BAD_PATTERNS) {
      if (re.test(line)) { failures.push(line); break; }
    }
  }
  return failures;
}

