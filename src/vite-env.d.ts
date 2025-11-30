/// <reference types="vite/client" />

// Environment variable type definitions
interface ImportMetaEnv {
  readonly VITE_OPENTOPO_API_KEY?: string;
  readonly VITE_USGS_PROXY_URL?: string;
  readonly VITE_ENABLE_ARCHAEOLOGICAL_DATABASES?: string;
  readonly VITE_ARCHAEOLOGICAL_CACHE_TTL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// GLSL shader module declarations
declare module '*.glsl' {
  const content: string;
  export default content;
}

declare module '*. vert.glsl' {
  const content: string;
  export default content;
}

declare module '*.frag.glsl' {
  const content: string;
  export default content;
}

// Raw text imports
declare module '*?raw' {
  const content: string;
  export default content;
}
