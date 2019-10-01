function makeModel(data) {
  const { id, cardBrand, cardLast4, cardholderName } = data;

  return {
    id,
    type: 'payment-method-stripe-card',
    attributes: {
      cardBrand,
      cardLast4,
      cardholderName,
    },
  };
}

function modelResponse(data) {
  return { data: makeModel(data) };
}

function collectionResponse(data, meta = {}) {
  return {
    meta,
    data: data.map(makeModel),
  };
}

function deletedResponse(deletedId, meta = {}) {
  return {
    meta: {
      deleted: true,
      id: deletedId,
      ...meta,
    },
  };
}

function updateDefaultMethodResponse(updated, updatedId) {
  return { meta: { updated, id: updatedId } };
}

module.exports = {
  makeModel,
  modelResponse,
  collectionResponse,
  deletedResponse,
  updateDefaultMethodResponse,
};
