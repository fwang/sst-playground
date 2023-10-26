ARG BASE_IMAGE
FROM ${BASE_IMAGE}
COPY package.json ${LAMBDA_TASK_ROOT}
#RUN npm install

COPY job.ts ${LAMBDA_TASK_ROOT}

#ENTRYPOINT ["node -e 'require(\"./job.js\").handler()'"]
ENTRYPOINT ["echo", "'This should be ignored by Job'"]