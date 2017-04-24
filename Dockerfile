FROM makeomatic/node:$NODE_VERSION

ENV NCONF_NAMESPACE=MS_PAYMENTS \
    NODE_ENV=production

WORKDIR /src

COPY yarn.lock package.json ./
RUN \
  apk --no-cache add --virtual .buildDeps \
    git \
    curl \
    openssl \
  && yarn --production \
  && apk del \
    .buildDeps \
    wget \
  && rm -rf \
    /tmp/* \
    /root/.node-gyp \
    /root/.npm

COPY . /src
RUN  chown -R node /src
USER node
