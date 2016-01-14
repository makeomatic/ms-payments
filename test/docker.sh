#!/bin/bash

BIN=node_modules/.bin
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
DC="$DIR/docker-compose.yml"
PATH=$PATH:${DIR}/.bin/
COMPOSE=$(which docker-compose)
MOCHA=${BIN}/_mocha
COVER="$BIN/isparta cover"
NODE=${NODE_BIN:-node}
TESTS=./compiled-test/suites/*.js
export NODE_ENV=${NODE_ENV:-development}

if [ -z "$NODE_VER" ]; then
  NODE_VER="5.4.0"
fi

if [ -z "$COVERAGE" ]; then
  COVERAGE=0
fi

if ! [ -x "$COMPOSE" ]; then
  mkdir ${DIR}/.bin
  curl -L https://github.com/docker/compose/releases/download/1.5.2/docker-compose-`uname -s`-`uname -m` > ${DIR}/.bin/docker-compose
  chmod +x ${DIR}/.bin/docker-compose
  COMPOSE=$(which docker-compose)
fi

function finish {
  # docker logs ms-users
  ${COMPOSE} -f ${DC} stop
  ${COMPOSE} -f ${DC} rm -f
}
trap finish EXIT

export IMAGE=makeomatic/alpine-node:${NODE_VER}
${COMPOSE} -f ${DC} up -d

if [[ "$SKIP_REBUILD" != "1" ]]; then
  ${COMPOSE} -f ${DC} run --rm tester npm rebuild || exit 1
fi

echo "cleaning old coverage"
rm -rf ./coverage

for fn in ${TESTS}; do
  echo "running $fn"
  if [[ "$COVERAGE" == "1" ]]; then
    ${COMPOSE} -f ${DC} run --rm tester /bin/sh -c "$NODE $COVER --dir ./coverage/${fn##*/} $MOCHA -- $fn" || exit 1
  else
    ${COMPOSE} -f ${DC} run --rm tester /bin/sh -c "$NODE $MOCHA -- $fn" || exit 1
  fi
done

if [[ "$COVERAGE" == "1" ]]; then
  echo "started generating combined coverage"
  ${COMPOSE} -f ${DC} run --rm tester node ./test/aggregate-report.js
fi

if [[ "$CI" == "true" ]]; then
  echo "uploading coverage report from ./coverage/lcov.info"
  cat ./coverage/lcov.info | ${BIN}/codecov
fi
