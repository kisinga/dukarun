# Server Resilience Baseline

## Problem Statement
A single unhandled exception during a request (e.g., within an asynchronous EventBus subscriber or a critical service method) causes the entire Node.js process to crash (exit code 1) or enter an unstable state. This results in a denial of service for all subsequent users, often manifested as 500 Internal Server Errors or connection failures.

## Architectural Goals
1.  **Process Stability**: The application process must remain running despite individual request failures.
2.  **Fault Isolation**: Errors in background tasks (events, jobs) must not propagate to the main request thread or crash the server.
3.  **Graceful Degradation**: When a non-critical component fails, the core application should continue to function.
4.  **Observability**: Fatal errors must be logged with sufficient context (stack trace, request ID, user ID) without taking down the system.

## Baseline Strategies

### 1. Global Exception Filtering (NestJS Layer)
**Objective**: Catch synchronous and asynchronous exceptions within the HTTP context before they bubble up to the process level.

*   **Mechanism**: Implement a global `ExceptionFilter` (Scope: `APP_FILTER`) in NestJS.
*   **Responsibility**:
    *   Catch `HttpException` (standard flow).
    *   Catch `unknown` exceptions (bugs).
    *   Log the error via `Logger`.
    *   Return a standardized JSON error response to the client.
    *   **Crucial**: Prevent the exception from crashing the event loop.

### 2. Asynchronous Error Boundaries (EventBus Layer)
**Objective**: Prevent failures in event subscribers from crashing the transaction or the main process.

*   **Problem**: In Node.js, an unhandled rejection in a Promise (even if detached) can crash the process depending on configuration. Vendure's `EventBus` subscribers often run asynchronously.
*   **Strategy**:
    *   Ensure all subscribers wrap their logic in `try/catch` blocks.
    *   Implement a "Safe Event Dispatcher" wrapper or utility that suppresses and logs subscriber errors instead of propagating them.
    *   Investigate Vendure's `EventBus` error handling configuration options.

### 3. Process-Level Safety Nets (Node.js Layer)
**Objective**: Last line of defense against crashes.

*   **Handlers**:
    *   `process.on('unhandledRejection')`: Log the error and **keep the process alive** (for non-critical promise failures).
    *   `process.on('uncaughtException')`: Log the error. **Recommendation**: Graceful shutdown and restart is usually safer than continuing, as the application state might be corrupted.
*   **Supervisor**: Use a process manager (Docker, PM2, Systemd) to automatically restart the application if it does crash.

### 4. Transaction & Context Safety
**Objective**: Prevent "hanging" transactions or corrupted contexts that cause subsequent 500s.

*   **Strategy**:
    *   Enforce `finally` blocks for all resource release (connections, file handles).
    *   Use `WeakMap` or safe context copying (as implemented in the recent `RequestContext` fix) to prevent memory leaks or object pollution.

## Research Areas for Implementation

To move from this baseline to a concrete implementation plan, investigate:

1.  **NestJS Global Filter Implementation**: How to register a filter that specifically targets Vendure's architecture (handling GraphQL and REST contexts correctly).
2.  **EventBus Error Interceptors**: Does Vendure expose a hook to intercept subscriber errors globally?
3.  **Terminus Integration**: Using NestJS Terminus for health checks to detect if the server is "zombie" (running but returning 500s) vs dead.
4.  **Worker Isolation**: Verifying if critical tasks should be offloaded to the Worker process to protect the API server.

## Next Steps
1.  Implement a `GlobalExceptionFilter` to log and swallow unhandled errors at the controller level.
2.  Audit all `EventBus` subscribers for missing `try/catch` blocks.
3.  Configure `unhandledRejection` listener in `main.ts`.

