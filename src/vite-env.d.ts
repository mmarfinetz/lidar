/// <reference types="vite/client" />

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
