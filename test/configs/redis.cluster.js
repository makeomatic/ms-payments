module.exports = {
  redis: {
    hosts: Array.from({ length: 3 }).map((_, idx) => ({
      host: 'redis',
      port: 7000 + idx,
    })),
    options: {
      keyPrefix: '{ms-payments}',
    },
  },
};
