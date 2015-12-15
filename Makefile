SHELL := /bin/bash
NODE_VERSIONS := 5.1.1
PKG_NAME := $(shell cat package.json | ./node_modules/.bin/json name)
PKG_VERSION := $(shell cat package.json | ./node_modules/.bin/json version)
THIS_FILE := $(lastword $(MAKEFILE_LIST))
NPM_PROXY := --build-arg NPM_PROXY=http://$(shell docker-machine ip dev):4873
REPO := makeomatic
BASE_NAME := $(REPO)/$(PKG_NAME)

# define task lists
TEST_TASKS := $(addsuffix .test, $(NODE_VERSIONS))
BUILD_TASKS := $(addsuffix .build, $(NODE_VERSIONS))
PUSH_TASKS := $(addsuffix .push, $(NODE_VERSIONS))

test: $(TEST_TASKS)

build: $(BUILD_TASKS)

push: $(PUSH_TASKS)

build-docker:
	docker build -t makeomatic/node-test:5.1.0 ./test

run-test:
	docker run --link=rabbitmq --link=redis_1 --link=redis_2 --link=redis_3 -v ${PWD}:/usr/src/app -w /usr/src/app --rm -e TEST_ENV=docker makeomatic/node-test:5.1.0 npm test;

$(TEST_TASKS): build-docker
	docker run -d --name=rabbitmq rabbitmq; \
	docker run -d --name=redis_1 makeomatic/alpine-redis; \
	docker run -d --name=redis_2 makeomatic/alpine-redis; \
	docker run -d --name=redis_3 makeomatic/alpine-redis; \
	$(MAKE) -f $(THIS_FILE) run-test; \
	EXIT_CODE=$$?; \
	docker rm -f rabbitmq; \
	docker rm -f redis_1; \
	docker rm -f redis_2; \
	docker rm -f redis_3; \
	exit ${EXIT_CODE};

$(BUILD_TASKS):
	npm run prepublish
	docker build $(NPM_PROXY) --build-arg VERSION=v$(basename $@) --build-arg NODE_ENV=development -t $(BASE_NAME):$(basename $@)-development .
	docker build $(NPM_PROXY) --build-arg VERSION=v$(basename $@) -t $(BASE_NAME):$(basename $@)-$(PKG_VERSION) .
	docker tag -f $(BASE_NAME):$(basename $@)-$(PKG_VERSION) $(BASE_NAME):$(basename $@)

$(PUSH_TASKS):
	docker push $(BASE_NAME):$(basename $@)-development
	docker push $(BASE_NAME):$(basename $@)-$(PKG_VERSION)
	docker push $(BASE_NAME):$(basename $@)

.PHONY: test build push run-test build-docker
