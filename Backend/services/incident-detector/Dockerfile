FROM golang:1.24-alpine AS build

WORKDIR /src
COPY go.mod ./
RUN go mod download
COPY cmd ./cmd
COPY internal ./internal
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/incident-detector ./cmd/incident-detector

FROM gcr.io/distroless/static-debian12:nonroot AS runtime

COPY --from=build /out/incident-detector /incident-detector
USER nonroot:nonroot
EXPOSE 4010
ENTRYPOINT ["/incident-detector"]
