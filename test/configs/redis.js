module.exports = {
  redis: {
    hosts: Array.from({ length: 3 }).map((_, idx) => ({
      host: '172.16.238.10',
      port: 7000 + idx,
    })),
  },
};
