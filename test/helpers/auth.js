function getToken(username) {
  const { amqp } = this;

  return amqp
    .publishAndWait('users.login', {
      username,
      audience: '*.localhost',
      password: 'megalongsuperpasswordfortest',
    });
}

function makeHeader(token) {
  return { Authorization: `JWT ${token}` };
}

module.exports = {
  getToken,
  makeHeader,
};
