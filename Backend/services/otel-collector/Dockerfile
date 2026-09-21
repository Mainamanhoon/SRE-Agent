FROM otel/opentelemetry-collector-contrib:0.160.0

COPY config.yaml /etc/otelcol-contrib/config.yaml
EXPOSE 13133 4317 4318
CMD ["--config=/etc/otelcol-contrib/config.yaml"]
