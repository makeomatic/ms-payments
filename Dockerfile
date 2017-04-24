FROM makeomatic/node:$NODE_VERSION

ENV NCONF_NAMESPACE=MS_PAYMENTS \
    NODE_ENV=production

WORKDIR /src

COPY package.json yarn.lock ./
RUN \
  apk --update add --virtual .buildDeps \
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
    /root/.npm \
    /etc/apk/cache/* \
    /var/cache/apk/*

COPY . /src
RUN  chown -R node /src
USER node
