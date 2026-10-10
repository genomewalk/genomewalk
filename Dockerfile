# syntax=docker/dockerfile:1
FROM node:24-trixie-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM dependencies AS source
COPY . .

# Public-reference tools. Keep the Linux executable outside the mounted data cache.
FROM dependencies AS tools
ARG TARGETARCH
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl libssl3t64 zlib1g \
    && rm -rf /var/lib/apt/lists/* \
    && case "$TARGETARCH" in \
         amd64) platform=linux.x86_64 ;; \
         arm64) platform=linux.aarch64.v492 ;; \
         *) exit 1 ;; \
       esac \
    && curl --fail --location --retry 3 \
       "https://hgdownload.soe.ucsc.edu/admin/exe/$platform/bigBedToBed" \
       --output /usr/local/bin/bigBedToBed \
    && chmod 755 /usr/local/bin/bigBedToBed
ENV BIGBED_TO_BED=/usr/local/bin/bigBedToBed
COPY . .
ENTRYPOINT ["npm", "run"]
CMD ["data"]

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
