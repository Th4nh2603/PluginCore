export interface FrontendAuthentication {
  readonly reactApp: string;
  readonly vueApp: string;
  readonly reactDependencies: Readonly<Record<string, string>>;
  readonly vueDependencies: Readonly<Record<string, string>>;
  readonly vueImport: string;
  readonly vueSetup: string;
  readonly reactImport: string;
  readonly reactOpen: string;
  readonly reactClose: string;
  readonly files: Readonly<Record<string, string>>;
  readonly environment: string;
}

export const frontendFiles = (name: string, frontend: string, authentication?: FrontendAuthentication): Record<string, string> => {
  const vue = frontend === "vue";
  return {
    "package.json": JSON.stringify({ name, private: true, type: "module", scripts: { dev: "vite", build: vue ? "vue-tsc --noEmit && vite build" : "tsc --noEmit && vite build", preview: "vite preview" },
      dependencies: { ...(vue ? { vue: "^3.5.43" } : { react: "^19.2.0", "react-dom": "^19.2.0" }), ...(vue ? authentication?.vueDependencies : authentication?.reactDependencies) },
      devDependencies: { typescript: "^5.9.3", vite: "^8.0.0", "@types/node": "^22.18.12",
        ...(vue ? { "@vitejs/plugin-vue": "^6.0.9", "vue-tsc": "^3.3.11" } : { "@vitejs/plugin-react": "^5.0.4", "@types/react": "^19.2.2", "@types/react-dom": "^19.2.2" }) }
    }, null, 2) + "\n",
    "tsconfig.json": JSON.stringify({ compilerOptions: { target: "ES2022", lib: ["ES2022", "DOM", "DOM.Iterable"], module: "ESNext", moduleResolution: "Bundler", strict: true, skipLibCheck: true, esModuleInterop: true, jsx: "react-jsx", noEmit: true, types: ["vite/client"] }, include: ["src", "vite.config.ts"] }, null, 2),
    "vite.config.ts": `import { defineConfig } from "vite";\nimport framework from "@vitejs/plugin-${vue ? "vue" : "react"}";\nexport default defineConfig({ plugins: [framework()] });\n`,
    "index.html": `<!doctype html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>${name}</title></head><body><div id="root"></div><script type="module" src="/src/main.${vue ? "ts" : "tsx"}"></script></body></html>\n`,
    [vue ? "src/main.ts" : "src/main.tsx"]: vue ? `import { createApp } from "vue";
import App from "./App.vue";
import "./style.css";
${authentication?.vueImport ?? ""}
const app = createApp(App);
${authentication?.vueSetup ?? ""}
app.mount("#root");
` : `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./style.css";
${authentication?.reactImport ?? ""}
createRoot(document.getElementById("root")!).render(<StrictMode>${authentication?.reactOpen ?? ""}<App />${authentication?.reactClose ?? ""}</StrictMode>);
`,
    [vue ? "src/App.vue" : "src/App.tsx"]: authentication === undefined
      ? vue ? '<template><main><p class="eyebrow">Vue + Vite</p><h1>Your project is ready</h1><p>Edit src/App.vue to get started.</p></main></template>\n' : 'export default function App() { return <main><p className="eyebrow">React + Vite</p><h1>Your project is ready</h1><p>Edit src/App.tsx to get started.</p></main>; }\n'
      : vue ? authentication.vueApp : authentication.reactApp,
    ...authentication?.files,
    ".env.example": `VITE_API_ORIGIN=http://localhost:3001\n${authentication?.environment ?? ""}`,
    "src/style.css": `:root { font-family: system-ui, sans-serif; color: #e2e8f0; background: #101827; color-scheme: dark; }
* { box-sizing: border-box; } body { margin: 0; } main { width: min(100% - 3rem, 30rem); margin: 12vh auto; }
h1 { font-size: clamp(2rem, 6vw, 3rem); letter-spacing: -.04em; } .eyebrow { color: #67e8f9; text-transform: uppercase; letter-spacing: .15em; font-size: .75rem; }
form, label { display: grid; gap: .6rem; } form { gap: 1.25rem; } input, button { padding: .85rem 1rem; border-radius: .6rem; font: inherit; }
input { border: 1px solid #475569; background: #1e293b; } button { border: 0; background: #a78bfa; color: #101827; font-weight: 650; cursor: pointer; }
button.secondary { background: transparent; color: #c4b5fd; } button:disabled { opacity: .6; cursor: wait; } :focus-visible { outline: 2px solid #67e8f9; outline-offset: 3px; } [role="alert"] { color: #fda4af; }
`
  };
};
