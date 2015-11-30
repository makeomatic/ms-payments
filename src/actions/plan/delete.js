const state = require('./state.js');

function planDelete(message) {
  return state.call(this, {id: message, state: 'deleted'});
}

module.exports = planDelete;
