// User store: DEVELOPMENT ONLY.
// These accounts exist so the site can be tested before a real identity provider is wired up.
// Passwords here are visible to anyone who views the page source, so never put real people or real passwords in this file.
// When Keynect becomes the source of truth for users, this file is no longer loaded (see auth/README.md).
const DEV_ACCOUNTS = [
  { email: "admin@keystone.test", password: "admin123", name: "Keystone Admin", role: "admin" },
  { email: "listener@keystone.test", password: "listen123", name: "Sample Listener", role: "user" }
];
