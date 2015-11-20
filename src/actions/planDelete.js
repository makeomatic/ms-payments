const state = require('./planState.js')

function planDelete(planId) {
	return state(planId, "deleted")
}

module.exports = planDelete
