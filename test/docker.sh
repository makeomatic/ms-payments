#!/bin/bash

export NODE_ENV=development
BIN=./node_modules/.bin
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
DC="$DIR/docker-compose.yml"
PATH=$PATH:$DIR/.bin/
COMPOSE=$(which docker-compose)
MOCHA=$BIN/_mocha
COVER="$BIN/isparta cover"
NODE=$BIN/babel-node
TESTS=${TESTS:-test/suites/*.js}
export IMAGE=makeomatic/nightmare

echo $DIR

if [ -z "$NODE_VER" ]; then
  NODE_VER="5.9.0"
fi

if ! [ -x "$COMPOSE" ]; then
  mkdir $DIR/.bin
  curl -L https://github.com/docker/compose/releases/download/1.5.2/docker-compose-`uname -s`-`uname -m` > $DIR/.bin/docker-compose
  chmod +x $DIR/.bin/docker-compose
  COMPOSE=$(which docker-compose)
fi

function finish {
  $COMPOSE -f $DC stop
  $COMPOSE -f $DC rm -f
}
trap finish EXIT

# cat test/Dockerfile | docker build -t makeomatic/nightmare -
$COMPOSE -f $DC up -d ms-users

if [[ "$SKIP_REBUILD" != "1" ]]; then
  echo "rebuilding native dependencies..."
  $COMPOSE -f $DC run --rm tester "npm rebuild"
fi

echo "cleaning old coverage"
rm -rf ./coverage

echo "running tests"
mkdir ./ss
rm ./ss/*.png
for fn in $TESTS; do
  echo "running $fn"
  echo $COMPOSE -f $DC run --rm tester "xvfb-run --server-args=\"-screen 0 1024x768x24\" $NODE $COVER --dir ./coverage/${fn##*/} $MOCHA -- $fn"
  $COMPOSE -f $DC run --rm tester "xvfb-run --server-args=\"-screen 0 1024x768x24\" $NODE $COVER --dir ./coverage/${fn##*/} $MOCHA -- $fn" || exit 1
done

echo "started generating combined coverage"
$COMPOSE -f $DC run --rm tester "node ./test/aggregate-report.js"

echo "uploading coverage report from ./coverage/lcov.info"
if [[ "$CI" == "true" ]]; then
  cat ./coverage/lcov.info | $BIN/codecov
fi
