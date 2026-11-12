const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** Short random id, e.g. `c_k3j9x2a1`. */
export function newId(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let id = "";
  for (const b of bytes) id += ALPHABET[b % ALPHABET.length];
  return `${prefix}_${id}`;
}
