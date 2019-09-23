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

function deletedResponse(deletedId, updatedMetada) {
  return {
    meta: {
      deleted: true,
      id: deletedId,
      ...updatedMetada,
    },
  };
}

function updateDefaultMethodResponse(updated, updatedId, updatedMetada) {
  return {
    meta: {
      updated,
      id: updatedId,
      ...updatedMetada,
    },
  };
}

module.exports = {
  makeModel,
  modelResponse,
  deletedResponse,
  updateDefaultMethodResponse,
};
