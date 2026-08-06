# Infrastructure Utilities

This directory contains reusable infrastructure utilities for the DukaRun backend.

## Worker Context Utilities

### Problem

In Vendure, background tasks that implement `OnApplicationBootstrap` run in both server and worker processes. This causes:

- Duplicate execution of scheduled tasks
- Duplicate log messages
- Unnecessary processing overhead
- Potential race conditions

### Solution

Use the worker context utilities to ensure background tasks only run in worker processes.

### WorkerContextService

**File**: `worker-context.service.ts`

A service that detects if code is running in a worker process. Uses the `VENDURE_PROCESS_TYPE` environment variable (set at process start in `index.ts` and `index-worker.ts`) as the single source of truth. Throws an error if the variable is not set or has an invalid value.

**Usage**:

```typescript
import { Injectable } from '@nestjs/common';
import { WorkerContextService } from '../../infrastructure/utils/worker-context.service';

@Injectable()
export class MyService {
  constructor(private workerContext: WorkerContextService) {}

  someMethod(): void {
    if (this.workerContext.isWorkerProcess()) {
      // This code only runs in worker process
    }
  }
}
```

**Methods**:

- `isWorkerProcess(): boolean` - Check if running in worker process. Uses `VENDURE_PROCESS_TYPE` environment variable as the single source of truth. Throws an error if the variable is not set or has an invalid value.
- `assertWorkerProcess(): void` - Throw error if not in worker process

**Detection Mechanism**:

The service uses `process.env.VENDURE_PROCESS_TYPE` as the single source of truth:

- `'worker'` → returns `true`
- `'server'` → returns `false`
- Not set or invalid value → throws an error (fail-fast)

**Important**: The `VENDURE_PROCESS_TYPE` environment variable must be set in:

- `index.ts` → set to `'server'` before bootstrap
- `index-worker.ts` → set to `'worker'` before bootstrapWorker

### WorkerBackgroundTaskBase

**File**: `worker-background-task.base.ts`

An abstract base class for background tasks that should only run in worker processes.

**Usage**:

```typescript
import { Injectable } from '@nestjs/common';
import { WorkerBackgroundTaskBase } from '../../infrastructure/utils/worker-background-task.base';
import { WorkerContextService } from '../../infrastructure/utils/worker-context.service';

@Injectable()
export class MyBackgroundTask extends WorkerBackgroundTaskBase {
  constructor(
    workerContext: WorkerContextService
    // ... other dependencies
  ) {
    super(workerContext, 'MyBackgroundTask');
  }

  protected initializeTask(): void {
    // Your initialization logic here
    // This will only run in worker process
    setInterval(() => {
      // Periodic task
    }, 60000);
  }
}
```

**Key Points**:

- Extend `WorkerBackgroundTaskBase` instead of implementing `OnApplicationBootstrap` directly
- Implement `initializeTask()` instead of `onApplicationBootstrap()`
- The base class automatically skips execution in server processes
- A logger is automatically provided via `this.logger`

### Registering in Plugins

Make sure to add `WorkerContextService` to your plugin's providers:

```typescript
@VendurePlugin({
  providers: [
    WorkerContextService, // Required for background tasks
    // ... other providers
  ],
})
export class MyPlugin {}
```

### Examples

See:

- `backend/src/plugins/subscriptions/subscription-expiry.subscriber.ts` - Subscription expiry checks
- `backend/src/plugins/ml/ml-extraction-queue.subscriber.ts` - ML extraction queue processing

### Best Practices

1. **Always use the base class** for background tasks that use `setInterval` or `setTimeout`
2. **Register WorkerContextService** in any plugin that has background tasks
3. **Use WorkerContextService directly** for one-off worker-only operations
4. **Document** why a task needs to run in worker process

### Why Worker Processes?

In Vendure's architecture:

- **Server process**: Handles HTTP requests, GraphQL queries/mutations
- **Worker process**: Handles background jobs, scheduled tasks, long-running operations

Background tasks should run in worker processes to:

- Avoid blocking the server process
- Prevent duplicate execution
- Isolate resource-intensive operations
- Follow Vendure's recommended patterns
