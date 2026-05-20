const { createHash, randomInt } = require('crypto');

const OTP_LENGTH = Number(process.env.OTP_LENGTH || 6);

function generateOtpCode(length = OTP_LENGTH) {
  const min = 10 ** (length - 1);
  const max = 10 ** length;

  return String(randomInt(min, max));
}

function hashOtpCode(code) {
  return createHash('sha256').update(String(code)).digest('hex');
}

module.exports = {
  OTP_LENGTH,
  generateOtpCode,
  hashOtpCode,
};
