import { randomBytes, randomUUID } from 'node:crypto';

const JOIN_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateJoinCode() {
  const bytes = randomBytes(7);
  let code = '';
  for (const byte of bytes) code += JOIN_ALPHABET[byte & 31];
  return code;
}

export function generateRealtimeKey() {
  return randomUUID();
}

export async function broadcastSessionInvalidate(realtimeKey: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return false;

  try {
    const response = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
      },
      body: JSON.stringify({
        messages: [{
          topic: `session:${realtimeKey}`,
          event: 'invalidate',
          payload: {},
          private: false,
        }],
      }),
      cache: 'no-store',
    });
    return response.ok;
  } catch (error) {
    console.error('Realtime invalidate broadcast failed', error);
    return false;
  }
}
