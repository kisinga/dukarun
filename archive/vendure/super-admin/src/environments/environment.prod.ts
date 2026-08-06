// Same pattern as frontend: app uses relative /admin-api; nginx in the container proxies to backend.
// No API URL injection — backend is reached via same-origin (admin.dukarun.com/admin-api → nginx → backend).

export const environment = {
  production: true,
  apiUrl: '/admin-api',
};
