# ── Stage 1: build the React UI ──────────────────────────────────────────────
# vite.config.js sets outDir '../static', so the bundle lands in /app/static.
FROM node:20-alpine AS ui
WORKDIR /app/ui
COPY ui/package.json ui/package-lock.json ./
RUN npm install --legacy-peer-deps
COPY ui/ ./
RUN npm run build

# ── Stage 2: build the Go binary ─────────────────────────────────────────────
FROM golang:1.24-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -o /out/stock-api .

# ── Stage 3: runtime ─────────────────────────────────────────────────────────
FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=build /out/stock-api ./stock-api
COPY --from=ui /app/static ./static
COPY data ./seed-data
ENV DATA_DIR=/data SEED_DIR=/app/seed-data PORT=8080 TZ=Asia/Jakarta
EXPOSE 8080
CMD ["./stock-api"]
