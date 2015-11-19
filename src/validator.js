const Ajv = require('ajv')
const fs = require('fs')
const p = require('path')
const Promise = require('bluebird')

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
	if (!fs.existsSync(path)) {
		throw new TypeError(`Provided path ${path} does not exist`)
	}

	const ajv = Ajv({ allErrors: true })

	const schemaList = fs.readdirSync(path).filter((item) => item.indexOf(".json") > 0)
	schemaList.forEach((schema) => {
		const schemaDefinition = require(p.join(path, schema))
		ajv.addSchema(schemaDefinition)
	})

	return new Validator(ajv)
}

module.exports = createValidator
