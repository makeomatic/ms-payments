const Ajv = require('ajv')
const Promise = require('bluebird')
const fs = require('fs')
const p = require('path')
const errors = require('common-errors')

class Validator {
	constructor(ajvInstance) {
		this.ajv = ajvInstance
	}

	validate(schema, data) {
		Promise.create((resolve, reject) => {
			const isValid = this.ajv.validate(schema, data)
			const errors = this.ajv.errors
			if (errors !== null) {
				reject({
					valid: isValid,
					errors: errors
				})
			} else {
				resolve({
					valid: isValid,
					errors: []
				})
			}
		})
	}

	validateSync(schema, data) {
		const isValid = this.ajv.validate(schema, data)
		const errors = this.ajv.errors || []
		return {
			valid: isValid,
			errors: errors
		}
	}

	readable(errors) {
		return this.ajv.errorsText(errors)
	}
}

function createValidator(path) {
	if (!Array.isArray(path)) {
		path = [path]
	}

	const ajv = Ajv({ allErrors: true })

	path.forEach((element) => {
		if (!fs.existsSync(element)) { return }
		const schemaList = fs.readdirSync(element).filter((item) => item.indexOf(".json") > 0)
		schemaList.forEach((schema) => {
			const schemaDefinition = require(p.join(element, schema))
			ajv.addSchema(schemaDefinition)
		})
	})

	return new Validator(ajv)
}

module.exports = createValidator
