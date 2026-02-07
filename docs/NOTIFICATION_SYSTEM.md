# 📚 DukaRun Notification System Documentation

## 🏗️ Architecture Overview

The notification system is built with a **server-side event-driven architecture** that supports both **in-app notifications** and **push notifications** across all connected clients.

## 🔧 Backend Components

### 1. **NotificationPlugin** (`/backend/src/plugins/notification.plugin.ts`)

- **Purpose**: Core Vendure plugin that registers all notification services
- **Components**: Integrates resolver, services, and test controller
- **GraphQL Schema**: Exposes notification queries and mutations

### 2. **NotificationService** (`/backend/src/services/notifications/notification.service.ts`)

- **Purpose**: CRUD operations for notifications and channel user resolution
- **Key Methods**:
  - `createNotification()` - Creates new notifications
  - `createNotificationIfEnabled()` - Creates only if user preferences allow
  - `getUserNotifications()` - Fetches user's notifications with optional type filtering
  - `markAsRead()` - Marks individual notification as read
  - `markAllAsRead()` - Marks all user's notifications as read
  - `getChannelUsers()` - Resolves all admins and users for a channel
  - `deleteOldNotifications()` - Prunes old notifications (default 30 days)
  - `hasAnyAdminWithPaymentNotificationsEnabled()` - Used by subscription expiry logic
  - `getLastExpiringSoonThreshold()` - Used to avoid duplicate expiring-soon alerts

- **Subscription expiry behavior**: See [SUBSCRIPTION_EXPIRY_NOTIFICATIONS.md](SUBSCRIPTION_EXPIRY_NOTIFICATIONS.md) for the full behavior of subscription expiry and expiring-soon notifications.

### 3. **PushNotificationService** (`/backend/src/services/notifications/push-notification.service.ts`)

- **Purpose**: Web Push API integration with persistence
- **Features**:
  - VAPID key management
  - **Persistent Subscriptions**: Stores user subscriptions in database
  - **Multi-Device Support**: Supports multiple subscriptions per user
  - **Automatic Cleanup**: Removes invalid/expired subscriptions on send failure
  - Cross-platform push notifications

### 4. **ChannelEventRouterService** (`/backend/src/infrastructure/events/channel-event-router.service.ts`)

- **Purpose**: Central routing for system events
- **Features**:
  - Listens to Vendure events (Order, Stock)
  - Resolves channel users via `NotificationService`
  - Routes to appropriate handlers (In-App, Push, SMS)
  - Respects user notification preferences

### 5. **NotificationTestController** (`/backend/src/plugins/notifications/notification-test.controller.ts`)

- **Purpose**: Testing and manual notification triggering
- **Endpoints**:
  - `GET /test-notifications/status` - System status
  - `GET /test-notifications/trigger?type=ORDER` - Single notification
  - `POST /test-notifications/trigger-all` - All notification types

## 🎨 Frontend Components

### 1. **NotificationService** (`/frontend/src/app/core/services/notification.service.ts`)

- **Purpose**: Frontend notification state management
- **Features**:
  - **Auto-Permission**: Automatically prompts/checks permission on dashboard load
  - **Real-Time Sync**: Polls and updates unread counts from backend
  - **Push Management**: Handles subscription syncing with backend
  - **Signal-Based**: Exposes reactive signals for UI components

### 2. **ToastService** (`/frontend/src/app/core/services/toast.service.ts`)

- **Purpose**: In-app toast notifications for immediate feedback
- **Features**:
  - Signal-based state management
  - Auto-dismiss timers
  - Foreground push notification display

### 3. **NotificationSettingsComponent** (`/frontend/src/app/dashboard/pages/settings/components/notification-settings.component.ts`)

- **Purpose**: User interface for managing notifications
- **Features**:
  - Toggle push notifications
  - View and filter notification history
  - Permission status indicators

## 🔄 Notification Flow

```
Vendure Event (Order/Stock) 
       ↓
ChannelEventRouterService
       ↓
NotificationService.getChannelUsers (Admins + SuperAdmins)
       ↓
1. In-App Handler → NotificationService.createNotification → DB
2. Push Handler → PushNotificationService.sendPushNotification → DB Lookup → Web Push API → Service Worker
```

## 🧪 Testing the Notification System

### **Quick Test Commands**

#### 1. Trigger All Notification Types

```bash
curl -X POST "http://localhost:3000/test-notifications/trigger-all"
```

#### 2. Trigger Individual Notification Types

```bash
# Order notifications
curl "http://localhost:3000/test-notifications/trigger?type=ORDER"

# Stock alerts
curl "http://localhost:3000/test-notifications/trigger?type=STOCK"
```

### **Frontend Testing Interface**

1. **Access the Test Interface**:
   - Go to `http://localhost:4200`
   - Navigate to **Settings** → **Test Notifications** tab

2. **Monitor Real-time Updates**:
   - Watch the notification bell for unread count updates
   - Check toast notifications appearing
   - Monitor the activity log

3. **Test Push Notifications**:
   - Ensure "Push Status" is enabled (or click "Enable")
   - Click "📱 Test Push"
   - Notifications should appear even when the tab is backgrounded

## 🔧 Configuration

### **Environment Variables**

Add these to your `.env` file (Backend):

```bash
# Web Push Notifications (VAPID Keys)
VAPID_PUBLIC_KEY=your_public_key_here
VAPID_PRIVATE_KEY=your_private_key_here
VAPID_EMAIL=mailto:admin@dukarun.com
```

Frontend Config (`frontend/src/environments/environment.ts`):
- `vapidPublicKey`: Must match the backend's public key.

### **VAPID Key Generation**

```bash
# Generate VAPID keys
npx web-push generate-vapid-keys
```

## 🚀 Deployment

### **Backend Setup**

1. **Migrations**: Run migrations to create `notification` and `push_subscription` tables.
2. **Env Vars**: Set VAPID keys.

### **Frontend Setup**

1. **Service Worker**: Ensure `ngsw-config.json` is valid.
2. **PWA**: App must be served over HTTPS (or localhost) for Service Worker and Push API to work.

## 📱 PWA Features

### **Service Worker Configuration**

- **Caching Strategy**: App shell with network-first for API calls
- **Push Notifications**: Enabled with VAPID key support
- **Offline Support**: Cached resources available offline

## 🔍 Troubleshooting

### **Common Issues**

1. **"Permission denied" for Push**:
   - User blocked notifications. Reset permissions in browser address bar.

2. **Notifications not appearing**:
   - Check backend logs for "Push notification sent"
   - Check Service Worker registration in DevTools > Application
   - Verify VAPID keys match between Frontend and Backend

3. **Phantom Unread Counts**:
   - The system now uses real database counts. If counts persist, check `NotificationService.markAsRead` logic.

---

_Last updated: November 2025_
_Version: 1.1.0_
