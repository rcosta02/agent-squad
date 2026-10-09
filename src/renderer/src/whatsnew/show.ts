/** Show once per version: only for users who already finished onboarding and have not seen this version's note. */
export function shouldShowWhatsNew<T extends { version: string }>(profile: { seenVersion?: string } | null | undefined, version: string, notes: T[]): T | null {
  if (!profile) return null
  if (profile.seenVersion === version) return null
  return notes.find((n) => n.version === version) ?? null
}
