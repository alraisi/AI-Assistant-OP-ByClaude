/**
 * Collision-resistant JID sanitization for filenames.
 *
 * Uses '--' as a delimiter for '@' to prevent collisions between
 * JIDs like user@example.net and user_example.net, which would
 * both become 'user_example_net' with naive replacement.
 *
 * Examples:
 *   123@s.whatsapp.net  → 123--s_whatsapp_net
 *   user@example.net    → user--example_net
 *   user_example.net    → user_example_net  (no collision!)
 */
export function sanitizeJid(jid: string): string {
  const parts = jid.split('@');
  return parts.map((p) => p.replace(/[^a-zA-Z0-9]/g, '_')).join('--');
}
