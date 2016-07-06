module.exports = {
  redis: {
    hosts: ['1', '2', '3'].map(idx => ({
      host: `redis-${idx}`,
      port: 6379,
    })),
  },
};
