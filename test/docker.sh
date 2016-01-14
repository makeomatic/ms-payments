#!/bin/bash

export NODE_ENV=development
BIN=node_modules/.bin
DIR=./compiled-test
#"$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
DC="$DIR/docker-compose.yml"
PATH=$PATH:${DIR}/.bin/
COMPOSE=$(which docker-compose)
MOCHA=${BIN}/_mocha
COVER="$BIN/isparta cover"
#NODE=${BIN}/babel-node
NODE=node
TESTS=${DIR}/suites/*.js

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

export IMAGE=makeomatic/alpine-node:${NODE_VER}
${COMPOSE} -f ${DC} up -d

if [[ "$SKIP_REBUILD" != "1" ]]; then
  ${COMPOSE} -f ${DC} run --rm tester npm rebuild
fi

echo "cleaning old coverage"
rm -rf ./coverage

if [ -z "$SUITE" ]; then
  echo "running full suite"
  for fn in ${TESTS}; do
    echo "running $fn"
    if [[ "$COVERAGE" == "1" ]]; then
      ${COMPOSE} -f ${DC} run --rm tester /bin/sh -c "$NODE $COVER --dir ./coverage/${fn##*/} $MOCHA -- $fn" || exit 1
    else
      ${COMPOSE} -f ${DC} run --rm tester /bin/sh -c "$NODE $MOCHA -- $fn" || exit 1
    fi
  done
else
  fn=${DIR}/suites/${SUITE}.js
  echo "running $fn"
  if [[ "$COVERAGE" == "1" ]]; then
    ${COMPOSE} -f ${DC} run --rm tester /bin/sh -c "$NODE $COVER --dir ./coverage/${fn##*/} $MOCHA -- $fn" || exit 1
  else
    ${COMPOSE} -f ${DC} run --rm tester /bin/sh -c "$NODE $MOCHA -- $fn" || exit 1
  fi
fi

if [[ "$COVERAGE" == "1" ]]; then
  echo "started generating combined coverage"
  ${COMPOSE} -f ${DC} run --rm tester node ./test/aggregate-report.js
fi

if [[ "$CI" == "true" ]]; then
  echo "uploading coverage report from ./coverage/lcov.info"
  cat ./coverage/lcov.info | ${BIN}/codecov
fi

function finish {
  ${COMPOSE} -f ${DC} logs
  ${COMPOSE} -f ${DC} stop
  ${COMPOSE} -f ${DC} rm -f
}
trap finish EXIT
