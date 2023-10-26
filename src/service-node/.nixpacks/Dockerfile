FROM ghcr.io/railwayapp/nixpacks:ubuntu-1689638612

ENTRYPOINT ["/bin/bash", "-l", "-c"]
WORKDIR /app/


COPY .nixpacks/nixpkgs-293a28df6d7ff3dec1e61e37cc4ee6e6c0fb0847.nix .nixpacks/nixpkgs-293a28df6d7ff3dec1e61e37cc4ee6e6c0fb0847.nix
RUN nix-env -if .nixpacks/nixpkgs-293a28df6d7ff3dec1e61e37cc4ee6e6c0fb0847.nix && nix-collect-garbage -d


ARG CI NIXPACKS_METADATA NODE_ENV NPM_CONFIG_PRODUCTION
ENV CI=$CI NIXPACKS_METADATA=$NIXPACKS_METADATA NODE_ENV=$NODE_ENV NPM_CONFIG_PRODUCTION=$NPM_CONFIG_PRODUCTION

# setup phase
# noop

# install phase
ENV NIXPACKS_PATH /app/node_modules/.bin:$NIXPACKS_PATH
COPY . /app/.
RUN --mount=type=cache,id=sgia1JDrO3A-/root/local/share/pnpm/store/v3,target=/root/.local/share/pnpm/store/v3 pnpm i --frozen-lockfile

# build phase
# noop


RUN printf '\nPATH=/app/node_modules/.bin:$PATH' >> /root/.profile


# start
COPY . /app
CMD ["node app.mjs"]

