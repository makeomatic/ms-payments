module.exports = {
  stripe: {
    enabled: false,
    secretKey: null,
    publicKey: null,
    client: {
      retry: {
        interval: 500,
        backoff: 500,
        max_interval: 5000,
        timeout: 5000,
        max_tries: 10,
        throw_original: true,
        predicate: { code: 429 },
      },
      apiVersion: '2019-05-16',
    },
    webhook: {
      enabled: false,
      trustedIPs: [
        '54.187.174.169',
        '54.187.205.235',
        '54.187.216.72',
        '54.241.31.99',
        '54.241.31.102',
        '54.241.34.107',
      ],
      endpoints: [
        {
          id: 'charge',
          forceRecreate: true,
          url: 'https://payments/charge/stripe/webhook',
          enabledEvents: [
            'charge.failed',
            'charge.succeeded',
          ],
          apiVersion: '2019-05-16',
        },
      ],
    },
  },
};
