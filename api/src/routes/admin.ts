// Constant-time bearer check for owner-only routes (the Workers runtime and Node
// test runtime share no timingSafeEqual, so compare bytes manually).
export function isOwner(header: string | undefined, token: string): boolean {
  const expected = new TextEncoder().encode(`Bearer ${token}`);
  const actual = new TextEncoder().encode(header ?? "");
  let diff = expected.length ^ actual.length;
  for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ (actual[i] ?? 0);
  return diff === 0;
}
