ARG BASE_IMAGE
FROM ${BASE_IMAGE}

WORKDIR /app/

COPY package.json /app
COPY package.json /app
COPY package.json /app
COPY package.json /app
COPY package.json /app
COPY package.json /app
RUN npm install

COPY app.mjs /app

ENTRYPOINT ["node", "app.mjs"]