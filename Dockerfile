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

# Cache Chromium separately from application source and the production build.
FROM dependencies AS browser-dependencies
RUN npx playwright install --with-deps --only-shell chromium

# Exercise the exact production files on loopback, without external networking.
FROM browser-dependencies AS browser-check
COPY --from=build /app/ /app/
RUN --network=none npm run check:browser

# Only files that passed the browser check can be exported for GitHub Pages.
FROM scratch AS export
COPY --from=browser-check /app/dist/client/ /

FROM node:24-trixie-slim AS site
WORKDIR /app
COPY --from=build /app/dist/client/ dist/client/
COPY scripts/preview-static.ts scripts/
COPY scripts/lib/static-server.ts scripts/lib/
ENV HOST=0.0.0.0 PORT=5283
USER node
EXPOSE 5283
CMD ["node", "scripts/preview-static.ts"]
