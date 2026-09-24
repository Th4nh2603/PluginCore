import type { FrontendAuthentication } from "../templates/frontend.js";

const apiClient = `export interface User { id: string; email: string; }
const origin = import.meta.env.VITE_API_ORIGIN ?? "http://localhost:3001";
export const request = async <T>(path: string, body?: unknown): Promise<T> => {
  const response = await fetch(origin + path, {
    method: body === undefined ? "GET" : "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  if (response.status === 204) return undefined as T;
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Request failed");
  return result as T;
};
`;

const reactAuth = `import { useEffect, useState, type FormEvent } from "react";
import { request, type User } from "./api";
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [registering, setRegistering] = useState(false);
  useEffect(() => { request<{ user: User }>("/auth/me").then((data) => setUser(data.user)).catch(() => {}); }, []);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      if (registering) await request("/auth/register", { email, password });
      const result = await request<{ user: User }>("/auth/login", { email, password });
      setUser(result.user); setPassword("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to sign in"); }
    finally { setBusy(false); }
  };
  const logout = async () => {
    setError("");
    try { await request("/auth/logout", {}); setUser(null); }
    catch { setError("Unable to sign out. Try again."); }
  };
  return <main><p className="eyebrow">Your workspace</p><h1>{user ? "Welcome back" : registering ? "Create account" : "Sign in"}</h1>
    {user ? <section><p>{user.email}</p><button onClick={() => void logout()}>Sign out</button></section> :
      <form onSubmit={(event) => void submit(event)}><label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label>Password<input type="password" autoComplete={registering ? "new-password" : "current-password"} minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        <button disabled={busy}>{busy ? "Please wait…" : registering ? "Create account" : "Sign in"}</button>
        <button type="button" className="secondary" onClick={() => setRegistering(!registering)}>{registering ? "Already have an account?" : "Create an account"}</button></form>}
    {error && <p role="alert">{error}</p>}</main>;
}
`;

const vueAuth = `<script setup lang="ts">
import { onMounted, ref } from "vue";
import { request, type User } from "./api";
const user = ref<User | null>(null);
const email = ref(""); const password = ref(""); const error = ref("");
const busy = ref(false); const registering = ref(false);
onMounted(async () => { try { user.value = (await request<{ user: User }>("/auth/me")).user; } catch { /* signed out */ } });
const submit = async () => {
  busy.value = true; error.value = "";
  try {
    const credentials = { email: email.value, password: password.value };
    if (registering.value) await request("/auth/register", credentials);
    user.value = (await request<{ user: User }>("/auth/login", credentials)).user;
    password.value = "";
  } catch (reason) { error.value = reason instanceof Error ? reason.message : "Unable to sign in"; }
  finally { busy.value = false; }
};
const logout = async () => {
  error.value = "";
  try { await request("/auth/logout", {}); user.value = null; }
  catch { error.value = "Unable to sign out. Try again."; }
};
</script>
<template>
  <main><p class="eyebrow">Your workspace</p><h1>{{ user ? 'Welcome back' : registering ? 'Create account' : 'Sign in' }}</h1>
    <section v-if="user"><p>{{ user.email }}</p><button @click="logout">Sign out</button></section>
    <form v-else @submit.prevent="submit">
      <label>Email<input v-model="email" type="email" autocomplete="email" required /></label>
      <label>Password<input v-model="password" type="password" :autocomplete="registering ? 'new-password' : 'current-password'" minlength="12" maxlength="128" required /></label>
      <button :disabled="busy">{{ busy ? 'Please wait…' : registering ? 'Create account' : 'Sign in' }}</button>
      <button type="button" class="secondary" @click="registering = !registering">{{ registering ? 'Already have an account?' : 'Create an account' }}</button>
    </form><p v-if="error" role="alert">{{ error }}</p>
  </main>
</template>
`;

export const customFrontendAuthentication: FrontendAuthentication = {
  reactApp: reactAuth,
  vueApp: vueAuth,
  reactDependencies: {},
  vueDependencies: {},
  vueImport: "",
  vueSetup: "",
  reactImport: "",
  reactOpen: "",
  reactClose: "",
  files: { "src/api.ts": apiClient },
  environment: ""
};
