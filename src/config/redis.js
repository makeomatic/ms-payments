const path = require('path');

exports.redis = {
  options: {
    keyPrefix: '{ms-payments}',
    dropBufferSupport: false,
  },
  luaScripts: path.resolve(__dirname, '../../scripts'),
};
