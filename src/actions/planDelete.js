const state = require('./planState.js')

function planDelete(message) {
	return state.call(this, message, "deleted")
}

module.exports = planDelete
