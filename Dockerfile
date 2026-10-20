# syntax=docker/dockerfile:1
FROM node:24-trixie-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM dependencies AS source
COPY . .

# Offline public-reference tools use the Node.js dependencies above.
FROM dependencies AS tools
COPY . .
ENTRYPOINT ["npm", "run"]
CMD ["data"]

# Reproducible public-sample benchmarks; reports are written to a mounted output folder.
FROM source AS benchmark
ENTRYPOINT ["npm", "run", "benchmark", "--"]

# Local previews and CI use the same release checks and static build.
FROM source AS build
RUN npm run check:release

# GitHub Pages needs files, so this target exports only the deployable directory.
FROM scratch AS export
COPY --from=build /app/dist/client/ /

FROM node:24-trixie-slim AS site
WORKDIR /app
COPY --from=build /app/dist/client/ dist/client/
COPY scripts/preview-static.ts scripts/
COPY scripts/lib/static-server.ts scripts/lib/
ENV HOST=0.0.0.0 PORT=5283
USER node
EXPOSE 5283
CMD ["node", "scripts/preview-static.ts"]
