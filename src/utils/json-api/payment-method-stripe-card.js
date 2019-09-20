function makeModel(data) {
  const { internalId, cardBrand, cardLast4 } = data;

  return {
    type: 'payment-method-stripe-card',
    id: internalId,
    attributes: {
      cardBrand,
      cardLast4,
    },
  };
}

function modelResponse(data) {
  return { data: makeModel(data) };
}

module.exports = {
  makeModel,
  modelResponse,
};
