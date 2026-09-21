export interface ControlApiSettings {
  serviceName: string;
  serviceVersion: string;
  environment: "development" | "test" | "production";
  incidentDetectorUrl: string;
  incidentServiceUrl: string;
  temporalAddress: string;
}

export interface HealthView {
  status: "ok";
  service: string;
  version: string;
  environment: ControlApiSettings["environment"];
  timestamp: string;
}

export interface SystemView {
  name: string;
  stage: "foundation";
  capabilities: readonly string[];
  services: {
    incidentDetector: string;
    incidentService: string;
    temporal: string;
  };
}
