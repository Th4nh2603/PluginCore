import type { FrontendAuthentication } from "../templates/frontend.js";

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

export const clerkFrontendAuthentication: FrontendAuthentication = {
  reactApp: reactClerk,
  vueApp: vueClerk,
  reactDependencies: { "@clerk/react": "^6.16.1" },
  vueDependencies: { "@clerk/vue": "^2.5.3" },
  vueImport: 'import { clerkPlugin } from "@clerk/vue";',
  vueSetup: 'const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;\nif (!publishableKey) throw new Error("Set VITE_CLERK_PUBLISHABLE_KEY in .env");\napp.use(clerkPlugin, { publishableKey });',
  reactImport: 'import { ClerkProvider } from "@clerk/react";\nconst publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;\nif (!publishableKey) throw new Error("Set VITE_CLERK_PUBLISHABLE_KEY in .env");',
  reactOpen: '<ClerkProvider publishableKey={publishableKey}>',
  reactClose: '</ClerkProvider>',
  files: {},
  environment: "VITE_CLERK_PUBLISHABLE_KEY=\n"
};
