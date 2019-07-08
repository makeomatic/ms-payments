module.exports = {
  dlock: {
    lockPrefix: 'dlock!',
    pubsubChannel: '{ms-payments}:dlock',
    lock: {
      timeout: 15000,
      retries: 1,
      delay: 50,
    },
  },
};
