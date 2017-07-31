const conf = require('ms-conf');
const path = require('path');

process.env.NCONF_NAMESPACE = process.env.NCONF_NAMESPACE || 'MS_PAYMENTS';

conf.prependDefaultConfiguration(path.resolve(__dirname, './config'));

module.exports = conf;
