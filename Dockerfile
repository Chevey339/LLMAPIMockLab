FROM node:25-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM deps AS build
COPY . .
RUN npm run build

FROM node:25-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=7394
ENV DATABASE_PATH=/data/mocklab.sqlite
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /app/dist ./dist
EXPOSE 7394
CMD ["npm", "start"]
