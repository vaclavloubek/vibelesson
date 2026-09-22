import { randomInt, randomUUID } from 'node:crypto';

const JOIN_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateJoinCode() {
  let code = '';
  for (let index = 0; index < 7; index += 1) {
    code += JOIN_ALPHABET[randomInt(JOIN_ALPHABET.length)];
  }
  return code;
}

export function generateRealtimeKey() {
  return randomUUID();
}
