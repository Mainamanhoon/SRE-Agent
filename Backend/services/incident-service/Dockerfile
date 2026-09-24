FROM golang:1.27.1-alpine AS build

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd ./cmd
COPY internal ./internal
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/incident-service ./cmd/incident-service

FROM gcr.io/distroless/static-debian12:nonroot AS runtime

COPY --from=build /out/incident-service /incident-service
USER nonroot:nonroot
EXPOSE 4020
ENTRYPOINT ["/incident-service"]
