// Local provider: checks credentials against DEV_ACCOUNTS in auth/users.js. Development only.
//
// Every provider exposes the same two functions so auth/auth.js never changes when the provider does:
//   authenticate(email, password) -> Promise<{ name, email, role } | null>   (null = bad credentials)
//   signOut(session)              -> Promise<void>
const LocalAuthProvider = {
  name: "local",
  async authenticate(email, password) {
    const a = DEV_ACCOUNTS.find(x => x.email.toLowerCase() === email.trim().toLowerCase() && x.password === password);
    return a ? { name: a.name, email: a.email, role: a.role } : null;
  },
  async signOut() {}
};
