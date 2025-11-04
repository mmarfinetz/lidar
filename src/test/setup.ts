// Vitest setup for jsdom + TypeScript
// - Adds small polyfills/mocks used by tests

// Ensure File exists (jsdom provides it, but keep a fallback)
if (typeof File === 'undefined') {
  // @ts-ignore
  globalThis.File = class extends Blob {
    name: string
    lastModified: number
    constructor(chunks: BlobPart[], name: string, opts: FilePropertyBag = {}) {
      super(chunks, opts)
      this.name = name
      this.lastModified = opts.lastModified ?? Date.now()
    }
  }
}

// Quiet down noisy console logs from modules during tests
const originalLog = console.log
console.log = (...args: any[]) => {
  if (typeof args[0] === 'string' && /OpenTopography|ASCII Grid|Points created/.test(args[0])) return
  originalLog(...args)
}

// Provide a minimal import.meta.env shim for code paths that reference it
// (Most tests don’t call fetch, so this is sufficient)
// @ts-ignore
globalThis.importMetaEnv = { VITE_OPENTOPO_API_KEY: 'test-key' }

