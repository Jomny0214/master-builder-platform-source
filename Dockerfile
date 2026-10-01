FROM node:20
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @workspace/api-server build
CMD ["pnpm", "--filter", "@workspace/api-server", "start"]
