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

const reactClerk = `import { Show, SignIn, UserButton, useAuth } from "@clerk/react";
import { useState } from "react";
export default function App() {
  const { getToken } = useAuth(); const [status, setStatus] = useState("");
  const verify = async () => {
    try {
      const token = await getToken();
      if (!token) throw new Error("Sign in first");
      const response = await fetch((import.meta.env.VITE_API_ORIGIN ?? "http://localhost:3001") + "/auth/me", { headers: { Authorization: "Bearer " + token } });
      if (!response.ok) throw new Error("API session could not be verified");
      setStatus("API verified user: " + (await response.json()).userId);
    } catch (error) { setStatus(error instanceof Error ? error.message : "Request failed"); }
  };
  return <main><Show when="signed-out"><SignIn routing="hash" /></Show><Show when="signed-in"><UserButton /><h1>Your workspace</h1><button onClick={() => void verify()}>Verify API session</button><p role="status">{status}</p></Show></main>;
}
`;

const vueClerk = `<script setup lang="ts">
import { Show, SignIn, UserButton, useAuth } from "@clerk/vue";
import { ref } from "vue";
const { getToken } = useAuth(); const status = ref("");
const verify = async () => {
  try {
    const token = await getToken.value();
    if (!token) throw new Error("Sign in first");
    const response = await fetch((import.meta.env.VITE_API_ORIGIN ?? "http://localhost:3001") + "/auth/me", { headers: { Authorization: "Bearer " + token } });
    if (!response.ok) throw new Error("API session could not be verified");
    status.value = "API verified user: " + (await response.json()).userId;
  } catch (error) { status.value = error instanceof Error ? error.message : "Request failed"; }
};
</script>
<template><main><Show when="signed-out"><SignIn routing="hash" /></Show><Show when="signed-in"><UserButton /><h1>Your workspace</h1><button @click="verify">Verify API session</button><p role="status">{{ status }}</p></Show></main></template>
`;

export const frontendFiles = (name: string, frontend: string, authentication?: string): Record<string, string> => {
  const vue = frontend === "vue";
  const clerk = authentication === "clerk";
  const custom = authentication === "custom";
  return {
    "package.json": JSON.stringify({ name, private: true, type: "module", scripts: { dev: "vite", build: vue ? "vue-tsc --noEmit && vite build" : "tsc --noEmit && vite build", preview: "vite preview" },
      dependencies: { ...(vue ? { vue: "^3.5.43" } : { react: "^19.2.0", "react-dom": "^19.2.0" }), ...(clerk ? (vue ? { "@clerk/vue": "^2.5.3" } : { "@clerk/react": "^6.16.1" }) : {}) },
      devDependencies: { typescript: "^5.9.3", vite: "^8.0.0", "@types/node": "^22.18.12",
        ...(vue ? { "@vitejs/plugin-vue": "^6.0.9", "vue-tsc": "^3.3.11" } : { "@vitejs/plugin-react": "^5.0.4", "@types/react": "^19.2.2", "@types/react-dom": "^19.2.2" }) }
    }, null, 2) + "\n",
    "tsconfig.json": JSON.stringify({ compilerOptions: { target: "ES2022", lib: ["ES2022", "DOM", "DOM.Iterable"], module: "ESNext", moduleResolution: "Bundler", strict: true, skipLibCheck: true, esModuleInterop: true, jsx: "react-jsx", noEmit: true, types: ["vite/client"] }, include: ["src", "vite.config.ts"] }, null, 2),
    "vite.config.ts": `import { defineConfig } from "vite";\nimport framework from "@vitejs/plugin-${vue ? "vue" : "react"}";\nexport default defineConfig({ plugins: [framework()] });\n`,
    "index.html": `<!doctype html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>${name}</title></head><body><div id="root"></div><script type="module" src="/src/main.${vue ? "ts" : "tsx"}"></script></body></html>\n`,
    [vue ? "src/main.ts" : "src/main.tsx"]: vue ? `import { createApp } from "vue";
import App from "./App.vue";
import "./style.css";
${clerk ? 'import { clerkPlugin } from "@clerk/vue";' : ""}
const app = createApp(App);
${clerk ? 'const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;\nif (!publishableKey) throw new Error("Set VITE_CLERK_PUBLISHABLE_KEY in .env");\napp.use(clerkPlugin, { publishableKey });' : ""}
app.mount("#root");
` : `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./style.css";
${clerk ? 'import { ClerkProvider } from "@clerk/react";\nconst publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;\nif (!publishableKey) throw new Error("Set VITE_CLERK_PUBLISHABLE_KEY in .env");' : ""}
createRoot(document.getElementById("root")!).render(<StrictMode>${clerk ? '<ClerkProvider publishableKey={publishableKey}>' : ""}<App />${clerk ? "</ClerkProvider>" : ""}</StrictMode>);
`,
    [vue ? "src/App.vue" : "src/App.tsx"]: custom ? (vue ? vueAuth : reactAuth) : clerk ? (vue ? vueClerk : reactClerk) : vue ? '<template><main><p class="eyebrow">Vue + Vite</p><h1>Your project is ready</h1><p>Edit src/App.vue to get started.</p></main></template>\n' : 'export default function App() { return <main><p className="eyebrow">React + Vite</p><h1>Your project is ready</h1><p>Edit src/App.tsx to get started.</p></main>; }\n',
    ...(custom ? { "src/api.ts": apiClient } : {}),
    ".env.example": `VITE_API_ORIGIN=http://localhost:3001\n${clerk ? "VITE_CLERK_PUBLISHABLE_KEY=\n" : ""}`,
    "src/style.css": `:root { font-family: system-ui, sans-serif; color: #e2e8f0; background: #101827; color-scheme: dark; }
* { box-sizing: border-box; } body { margin: 0; } main { width: min(100% - 3rem, 30rem); margin: 12vh auto; }
h1 { font-size: clamp(2rem, 6vw, 3rem); letter-spacing: -.04em; } .eyebrow { color: #67e8f9; text-transform: uppercase; letter-spacing: .15em; font-size: .75rem; }
form, label { display: grid; gap: .6rem; } form { gap: 1.25rem; } input, button { padding: .85rem 1rem; border-radius: .6rem; font: inherit; }
input { border: 1px solid #475569; background: #1e293b; } button { border: 0; background: #a78bfa; color: #101827; font-weight: 650; cursor: pointer; }
button.secondary { background: transparent; color: #c4b5fd; } button:disabled { opacity: .6; cursor: wait; } :focus-visible { outline: 2px solid #67e8f9; outline-offset: 3px; } [role="alert"] { color: #fda4af; }
`
  };
};
