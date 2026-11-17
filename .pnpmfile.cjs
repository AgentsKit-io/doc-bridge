// tsup bundles type declarations through rollup-plugin-dts, which needs the TypeScript compiler API.
// The root `typescript` is the TS 7 native compiler (no JS API), so tsup gets TS 6 as its own dependency.
module.exports = {
  hooks: {
    readPackage(pkg) {
      if (pkg.name === 'tsup') {
        delete pkg.peerDependencies?.typescript
        if (pkg.peerDependenciesMeta) delete pkg.peerDependenciesMeta.typescript
        pkg.dependencies = { ...pkg.dependencies, typescript: 'npm:typescript@^6.0.3' }
      }
      return pkg
    },
  },
}
