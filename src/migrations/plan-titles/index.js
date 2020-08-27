function migrate(app) {
  const { log, redis } = app;

  log.info('Plan titles migration');
  log.info('Populating titles...');

  return redis
    .pipeline([
      ['hset', 'plans-data:free', 'title', JSON.stringify('Free')],
      ['hset', 'plans-data:lite', 'title', JSON.stringify('Lite')],
      ['hset', 'plans-data:enterprise', 'title', JSON.stringify('Enterprise')],
      ['hset', 'plans-data:basic', 'title', JSON.stringify('Premium')],
      ['hset', 'plans-data:professional', 'title', JSON.stringify('Business')],
    ])
    .exec()
    .then(() => log.info('New titles populated.'));
}

module.exports = {
  script: migrate,
  min: 2,
  final: 3,
};
