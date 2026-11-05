# The builder supplies a reviewed, digest-pinned distroless Node image.
ARG BASE_IMAGE
FROM ${BASE_IMAGE}
ARG SOURCE_COMMIT
WORKDIR /app
COPY server.js index.html app.js ./
LABEL org.opencontainers.image.revision=${SOURCE_COMMIT}
ENV PORT=8080 DATA_DIR=/data NODE_ENV=production
USER 10001:10001
EXPOSE 8080
CMD ["server.js"]
