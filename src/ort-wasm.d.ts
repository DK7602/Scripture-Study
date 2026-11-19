// onnxruntime-web's WebAssembly-only build (aliased in vite.config.ts) has the package's own types
declare module 'onnxruntime-web-wasm' {
  export * from 'onnxruntime-web'
}
