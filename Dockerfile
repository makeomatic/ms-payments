FROM makeomatic/node:6.5.0

ENV NCONF_NAMESPACE=MS_PAYMENTS \
    NODE_ENV=production

WORKDIR /src

COPY package.json .
RUN \
  apk --no-cache add --virtual .buildDeps \
    git \
    curl \
    openssl \
  && npm install --production \
  && npm dedupe \
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
