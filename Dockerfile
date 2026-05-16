# Bun based Dockerfile
# Does not build the server, but runs it directly from source using bun

FROM oven/bun:1 AS base
WORKDIR /usr/src/app

# Cached dependency install layer
FROM base AS install
RUN mkdir -p /temp/dev
COPY package.json bun.lock /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile

# exclude devDependencies
RUN mkdir -p /temp/prod
COPY package.json bun.lock /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

FROM base AS prerelease
COPY --from=install /temp/dev/node_modules node_modules
COPY . .

# copy production dependencies and source code into final image
FROM base AS release
COPY --from=install /temp/prod/node_modules node_modules
COPY --from=prerelease /usr/src/app/src/ ./src/
COPY --from=prerelease /usr/src/app/package.json .

# run the HTTP server app instead of stdio server
USER bun
EXPOSE 3030
ENTRYPOINT [ "bun", "run", "src/http-server.ts" ]
