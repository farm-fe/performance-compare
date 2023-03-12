# performance-compare
Benchmarks for Farm, Webpack, Vite, Rspack and Turbopack. (Without sourcemap)
> Using Turbopack's bench cases (1000 React components), see https://turbo.build/pack/docs/benchmarks

|                     | **Startup**  | **HMR (Root)**  | **HMR (Leaf)**  |
| ------------------- | ------- | ----- | --- |
| Webpack      | 7814ms   | 290ms | 232ms |
| Rspack   | 383ms | 272ms | 260ms |
| Farm    | 390ms | 6ms | 13ms  |

As Turbopack and Vite does not support disable sourcemap, and Farm does not support sourcemap for now. We do not compare with Turbopack and Vite, we will do the benchmark later when Farm support sourcemap.

![xx](./assets/benchmark-new.png)


Run benchmarks:
```bash
node benchmark.mjs
```
You will see something like:
```txt
bright@bright-MS-7D17:~/opensource/performance-compare$ node benchmark.mjs

Rspack  startup time: 406ms
Turbopack  startup time: 2444.64892578125ms
Webpack  startup time: 7694ms
Vite  startup time: 4625ms
Farm  startup time: 395ms
Farm  Root HMR time: 7ms
Turbopack  Root HMR time: 9ms
Vite  Root HMR time: 32ms
Rspack  Root HMR time: 311ms
Webpack  Root HMR time: 334ms
Turbopack  Leaf HMR time: 11ms
Farm  Leaf HMR time: 12ms
Vite  Leaf HMR time: 27ms
Webpack  Leaf HMR time: 267ms
Rspack  Leaf HMR time: 301ms
```

If you want to start the project with the specified tool, try:
```bash
pnpm i # install dependencies

npm run start # Start Farm
npm run start:vite # Start Vite
npm run start:webpack # Start Webpack
npm run start:rspack # Start Rspack
npm run start:turbopack # Start Turbopack
```

