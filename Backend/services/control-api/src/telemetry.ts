import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import type { AppConfig } from "./config.js";

let telemetrySdk: NodeSDK | undefined;

export async function startTelemetry(config: AppConfig): Promise<void> {
  if (!config.OTEL_ENABLED || telemetrySdk) {
    return;
  }

  telemetrySdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: config.SERVICE_NAME,
      [ATTR_SERVICE_VERSION]: config.SERVICE_VERSION,
    }),
    traceExporter: new OTLPTraceExporter({
      url: `${config.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
    }),
    instrumentations: [getNodeAutoInstrumentations()],
  });

  telemetrySdk.start();
}

export async function stopTelemetry(): Promise<void> {
  if (!telemetrySdk) {
    return;
  }

  await telemetrySdk.shutdown();
  telemetrySdk = undefined;
}
