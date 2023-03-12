# performance-compare
Benchmarks for Farm, Webpack, Vite, Rspack and Turbopack.
> Using Turbopack's bench cases (1000 React components), see https://turbo.build/pack/docs/benchmarks

|                     | **Startup**  | **HMR (Root)**  | **HMR (Leaf)**  |
| ------------------- | ------- | ----- | --- |
| Webpack      | 7694ms   | 334ms | 267ms |
| Vite         | 4625ms  | 32ms  | 27ms |
| Turbopack   | 2444ms | 9ms | 11ms |
| Rspack   | 406ms | 311ms | 301ms |
| Farm    | 395ms ✅  | 7ms ✅  | 12ms ✅  |



![xx](./assets/benchmark.png)


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

