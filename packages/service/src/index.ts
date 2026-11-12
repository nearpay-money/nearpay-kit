/** @nearpay-internal/service — service bootstrap (lld/00-foundations.md §4, §9–§15). */
export {
  BaseConfig,
  baseConfigShape,
  ConfigError,
  ENVS,
  type Env,
  envName,
  flag,
  int,
  isDevEnv,
  LOG_LEVELS,
  type LoadConfigOptions,
  list,
  loadConfig,
  port,
  secret,
  url,
} from "./config.js";
export {
  ApiError,
  type ApiErrorOptions,
  fromZodError,
  type MappedError,
  paramName,
  toErrorResponse,
} from "./errors.js";
export { createLogger, type Logger, type LoggerOptions, REDACT_PATHS } from "./logger.js";
export { type ProcessFactory, type RunMainOptions, type Runnable, runMain } from "./main.js";
export {
  type BackgroundLoopSample,
  createMetrics,
  type ExternalCallResult,
  type ServiceMetrics,
  serveMetrics,
} from "./metrics.js";
export { parseQuery } from "./query.js";
export {
  type BackgroundTask,
  type BinaryBody,
  type BindingOptions,
  binary,
  createService,
  type Handler,
  type Heartbeat,
  type IdempotencyScope,
  type IdempotencyStore,
  implement,
  type LivenessReport,
  type ReadinessCheck,
  type ReadyReport,
  type RegisteredHeartbeat,
  type RequestContext,
  type Responded,
  type RouteBinding,
  type RouteBodyOut,
  type RouteEvents,
  type RouteHeadersOut,
  respond,
  type Service,
  type ServiceApp,
  type ServiceOptions,
  unimplementedRoutes,
} from "./service.js";
export { openSse, resumeCursor, type SseLimits, type SseStream } from "./sse.js";
export {
  formatTraceparent,
  parseTraceparent,
  type Span,
  SpanKind,
  type SpanOptions,
  SpanStatusCode,
  startSpan,
  startTracing,
  type Tracer,
  type Tracing,
  type TracingOptions,
  withSpan,
} from "./tracing.js";
