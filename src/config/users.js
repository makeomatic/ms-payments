module.exports = {
  users: {
    audience: '*.localhost',
    paymentAudience: '*.payments',
    prefix: 'users',
    postfix: {
      getInternalData: 'getInternalData',
      getMetadata: 'getMetadata',
      list: 'list',
      updateMetadata: 'updateMetadata',
    },
    // @todo to do something with it (this keys used for ms-users auth middleware)
    verify: 'users.verify',
    timeouts: {
      verify: 5000,
    },
  },
};
