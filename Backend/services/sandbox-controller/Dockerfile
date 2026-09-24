FROM golang:1.27.1-alpine AS build

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/sandbox-controller ./cmd/sandbox-controller

FROM gcr.io/distroless/static-debian12:nonroot AS runtime

COPY --from=build /out/sandbox-controller /sandbox-controller
USER nonroot:nonroot
EXPOSE 4030
ENTRYPOINT ["/sandbox-controller"]
