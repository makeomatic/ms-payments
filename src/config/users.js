module.exports = {
  users: {
    audience: '*.localhost',
    prefix: 'users',
    postfix: {
      getInternalData: 'getInternalData',
      getMetadata: 'getMetadata',
      list: 'list',
      updateMetadata: 'updateMetadata',
    },
    // @todo to do something with verify, timeouts.verify (this keys used for ms-users auth middleware)
    verify: 'users.verify',
    timeouts: {
      verify: 5000,
      getMetadata: 10000,
      list: 5000,
      updateMetadata: 15000,
    },
  },
};
