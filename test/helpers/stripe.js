const crypto = require('crypto');

function createSignature(payload, secret) {
  const t = Math.floor(Date.now() / 1000);
  const v1 = crypto.createHmac('sha256', secret)
    .update(`${t}.${payload}`, 'utf8')
    .digest('hex');

  return `t=${t},v1=${v1}`;
}

module.exports = {
  createSignature,
};
