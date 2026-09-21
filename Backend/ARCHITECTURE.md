# Backend architecture conventions

Each coded service uses explicit contracts and versioned implementations so domain and application behavior do not depend on HTTP, Temporal, PostgreSQL, Kubernetes, or system time.

```text
transport adapter -> application service -> outbound port <- infrastructure adapter
                           |
                         domain
```

## Layer responsibilities

- `domain` contains data and rules that do not depend on frameworks.
- `application` coordinates use cases and declares the narrow interfaces it consumes.
- `ports` contains explicit contracts when a TypeScript service shares them across adapters.
- `presentation` or `api` translates transport requests and responses only.
- `infrastructure`, `postgres`, `kubernetes`, `fingerprint`, `clock`, and `policy` provide replaceable implementations.
- `app.ts`, `worker.ts`, and `cmd/*/main.go` are composition roots. They construct implementations and inject them into application services.

Contracts remain small and are stored separately from their implementations. Composition roots select the active implementation. TypeScript uses abstract classes where a shared, discoverable base contract is useful. Go has no classes or inheritance, so it uses explicit interfaces plus compile-time assertions such as `var _ Contract = (*ImplementationV1)(nil)`.

Adding a method to an abstract class or Go interface intentionally breaks compilation for every implementation that has not added that method. The compiler identifies all affected implementations, but it cannot generate meaningful method bodies automatically.

## Versioning pattern

```text
application/
  contracts/                         # stable abstraction
    payment-gateway.ts               # abstract class PaymentGateway
  implementations/
    stripe-payment-gateway-v1.ts     # extends PaymentGateway
    razorpay-payment-gateway-v1.ts   # extends PaymentGateway
composition root                     # selects the implementation/version
```

For Go, the equivalent structure is:

```text
internal/application/contracts.go    # type PaymentGateway interface
internal/application/service_v1.go   # concrete V1 use-case implementation
internal/provider/stripe_v1.go       # concrete adapter + compile-time assertion
cmd/service/main.go                  # selects V1
```

When behavior changes incompatibly, add an `ImplementationV2` beside `ImplementationV1` and change only the composition root after tests and migration are ready. Do not duplicate an interface merely to label it V2 unless the contract itself actually changes.

## Service extension points

| Service | Primary ports | Current implementations |
| --- | --- | --- |
| Control API | abstract `Clock`, abstract `ControlApiQueryService` | `SystemClock`, `ControlApiQueryServiceV1` |
| Incident detector | `FingerprintGenerator`, `Clock`, `CandidateDetector` | `SHA256V1`, `SystemClock`, `DetectorV1` |
| Incident service | `IncidentRepository`, `IncidentRecorder`, `ReadinessProbe` | `IncidentRepositoryV1`, `IncidentServiceV1` |
| Repair worker | abstract `IncidentTriagePolicy`, abstract `RepairActivities` | `RequiredEvidenceTriagePolicyV1`, `RepairActivitiesV1` |
| Sandbox controller | `SandboxProvisioner`, `ToolchainImageResolver`, `SandboxCreator`, `ReadinessProbe` | `JobProvisionerV1`, `ToolchainImageResolverV1`, `SandboxServiceV1` |
| OTel Collector | receiver, processor, exporter components | OTLP receiver, memory limiter, batch processor, Jaeger OTLP exporter |

The OpenTelemetry Collector is an upstream component configured through its native receiver/processor/exporter interfaces. Wrapping it in project-specific classes would introduce coupling without providing a useful substitution boundary.

## SOLID expectations

- **Single responsibility:** transport parsing, use-case decisions, and infrastructure operations live in separate types.
- **Open/closed:** add adapters or policies by implementing ports instead of modifying handlers.
- **Liskov substitution:** tests use fake clocks, repositories, policies, resolvers, and provisioners through the same contracts.
- **Interface segregation:** readiness, persistence, query, and creation capabilities are separate interfaces.
- **Dependency inversion:** application services depend on contracts; composition roots choose concrete implementations.

Avoid creating an interface for data-only models with no behavior or substitution need. Every replaceable service, algorithm, policy, persistence adapter, and external-system adapter must implement an explicit contract.
