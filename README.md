# performance-compare

Benchmarks for [Farm](https://github.com/farm-fe/farm), Webpack, Vite, Rspack and Turbopack.

> Using Turbopack's bench cases (1000 React components), see https://turbo.build/pack/docs/benchmarks
┌───────────────────────────────┬───────────────────────────────────────┬─────────────────┬────────────┬─────────┬─────────┬───────────┐
│            (index)            │ startup(serverStartTime + onLoadTime) │ serverStartTime │ onLoadTime │ rootHmr │ leafHmr │ buildTime │
├───────────────────────────────┼───────────────────────────────────────┼─────────────────┼────────────┼─────────┼─────────┼───────────┤
│          Farm 1.2.2           │                '396ms'                │     '228ms'     │  '167ms'   │ '18ms'  │ '13ms'  │  '313ms'  │
│       Farm 1.2.2 (Hot)        │                '273ms'                │     '106ms'     │  '167ms'   │ '14ms'  │ '11ms'  │  '160ms'  │
│        Rsbuild 0.7.10         │                '468ms'                │     '270ms'     │  '198ms'   │ '87ms'  │ '74ms'  │  '363ms'  │
│     Rsbuild 0.7.10 (Hot)      │                '468ms'                │     '270ms'     │  '198ms'   │ '89ms'  │ '71ms'  │  '363ms'  │
│    Vite 6.0.0-alpha (swc)     │               '1700ms'                │     '356ms'     │  '1343ms'  │ '22ms'  │ '11ms'  │ '1543ms'  │
│  Vite 6.0.0-alpha (swc)(Hot)  │               '1426ms'                │     '350ms'     │  '1076ms'  │ '25ms'  │ '11ms'  │ '1540ms'  │
│   Vite 6.0.0-alpha (babel)    │               '3160ms'                │     '362ms'     │  '2797ms'  │ '23ms'  │ '13ms'  │ '1556ms'  │
│ Vite 6.0.0-alpha (babel)(Hot) │               '2922ms'                │     '343ms'     │  '2579ms'  │ '27ms'  │ '16ms'  │ '1566ms'  │
│     Webpack 5.91.0 (swc)      │               '2078ms'                │    '1758ms'     │  '320ms'   │ '532ms' │ '165ms' │ '4128ms'  │
│   Webpack 5.91.0 (swc)(Hot)   │                '945ms'                │     '646ms'     │  '298ms'   │ '284ms' │ '182ms' │  '527ms'  │
│    Webpack 5.91.0 (babel)     │               '6585ms'                │    '6282ms'     │  '302ms'   │ '214ms' │ '181ms' │  '518ms'  │
│  Webpack 5.91.0 (babel)(Hot)  │               '1204ms'                │     '936ms'     │  '268ms'   │ '269ms' │ '161ms' │  '540ms'  │
└───────────────────────────────┴───────────────────────────────────────┴─────────────────┴────────────┴─────────┴─────────┴───────────┘

> Tested on Linux Mint, 11th Gen Intel(R) Core(TM) i5-11400 @ 2.60GHz, 16GB

### Full Benchmark
![xx](./full.png)

### StartUp Benchmark
![xx](./startup.png)

### HMR Benchmark
![xx](./hmr.png)

### Production Build Benchmark
![xx](./build.png)

Run benchmarks:

```bash
node benchmark.mjs
```

You will see something like:

```txt
bright@bright-MS-7D17:~/opensource/performance-compare$ node benchmark.mjs

Rspack  startup time: 417ms
Turbopack  startup time: 2440.673095703125ms
Webpack  startup time: 7968ms
Vite  startup time: 3712ms
Farm  startup time: 430ms
Turbopack  Root HMR time: 7ms
Farm  Root HMR time: 7ms
Vite  Root HMR time: 42ms
Rspack  Root HMR time: 298ms
Webpack  Root HMR time: 451ms
Farm  Leaf HMR time: 10ms
Turbopack  Leaf HMR time: 11ms
Vite  Leaf HMR time: 22ms
Webpack  Leaf HMR time: 284ms
Rspack  Leaf HMR time: 303ms
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
