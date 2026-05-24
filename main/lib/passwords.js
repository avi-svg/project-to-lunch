const { randomBytes, scrypt, timingSafeEqual } = require('crypto');
const { promisify } = require('util');

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;
const HASH_PREFIX = 'scrypt';

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = await scryptAsync(password, salt, KEY_LENGTH);

  return `${HASH_PREFIX}$${salt}$${Buffer.from(derivedKey).toString('hex')}`;
}

async function verifyPassword(password, storedPassword) {
  if (typeof storedPassword !== 'string' || storedPassword.length === 0) {
    return false;
  }

  if (!storedPassword.startsWith(`${HASH_PREFIX}$`)) {
    return storedPassword === password;
  }

  const [, salt, storedHash] = storedPassword.split('$');

  if (!salt || !storedHash) {
    return false;
  }

  const derivedKey = await scryptAsync(password, salt, KEY_LENGTH);
  const storedBuffer = Buffer.from(storedHash, 'hex');
  const derivedBuffer = Buffer.from(derivedKey);

  if (storedBuffer.length !== derivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(storedBuffer, derivedBuffer);
}

module.exports = {
  hashPassword,
  verifyPassword,
};
