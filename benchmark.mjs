import { spawn } from "child_process";
import { appendFile, readFileSync, writeFileSync } from "fs";
import path from "path";
import puppeteer from "puppeteer";
import kill from "tree-kill";

// class BuildTool {
//   constructor(
//     name,
//     port,
//     script,
//     startedRegex,
//     buildScript,
//     buildRegex,
//     skipMatch
//   ) {
//     this.name = name;
//     this.port = port;
//     this.script = script;
//     this.startedRegex = startedRegex;
//     this.buildScript = buildScript;
//     this.buildRegex = buildRegex;
//     this.skipMatch = skipMatch;
//   }

//   async startServer() {
//     return new Promise((resolve, reject) => {
//       const child = spawn(`npm`, ["run", this.script], {
//         stdio: "pipe",
//         shell: true,
//       });
//       this.child = child;
//       const start = Date.now();

//       child.stdout.on("data", (data) => {
//         // console.log(data.toString());
//         const match = this.startedRegex.exec(data.toString());

//         if (match) {
//           const time = Date.now() - start;
//           resolve(time);
//         }
//       });
//       child.on("error", (error) => {
//         console.log(`error: ${error.message}`);
//         reject(error);
//       });
//       child.on("exit", (code) => {
//         // console.log(`child process exited with code ${code}`);
//         if (code !== 0) {
//           reject(code);
//         }
//       });
//     });
//   }

//   stopServer() {
//     this.child.stdin.pause();
//     this.child.stdout.destroy();
//     this.child.stderr.destroy();
//     kill(this.child.pid);
//   }

//   async build() {
//     return new Promise(async (resolve) => {
//       console.log(`Running build command: ${this.buildScript}`);
//       let startTime = null;
//       let skipTime = null;
//       const child = spawn(`npm`, ["run", this.buildScript], {
//         stdio: ["pipe"],
//         shell: true,
//       });
//       if (!this.skipMatch) {
//         startTime = performance.now();
//       }
//       child.stdout.on("data", (data) => {
//         // console.log(data.toString());
//         const match = this.buildRegex.exec(data.toString());
//         // console.log(match);
//         if (match !== null && match[1] && this.skipMatch) {
//           const time = match[1];
//           const unit = match[2];
//           if (unit === "s") {
//             skipTime = time * 1000;
//           } else {
//             skipTime = time;
//           }
//           const endTime = performance.now();
//           const elapsedTime = Math.floor(endTime - startTime);
//           resolve(this.skipMatch ? skipTime : elapsedTime);
//         }
//       });
//       await new Promise((resolve, reject) => {
//         child.on("exit", resolve);
//         child.on("error", reject);
//       });
//       const endTime = performance.now();
//       const elapsedTime = Math.floor(endTime - startTime);
//       resolve(this.skipMatch ? skipTime : elapsedTime);
//     });
//   }
// }

class BuildTool {
  constructor(
    name,
    port,
    script,
    startedRegex,
    buildScript,
    buildRegex,
    skipMatch,
    startMatchReg
  ) {
    this.name = name;
    this.port = port;
    this.script = script;
    this.startedRegex = startedRegex;
    this.buildScript = buildScript;
    this.buildRegex = buildRegex;
    this.skipMatch = skipMatch;
    this.startMatchReg = startMatchReg;
  }

  async startServer() {
    return new Promise((resolve, reject) => {
      const child = spawn(`npm`, ["run", this.script], {
        stdio: "pipe",
        shell: true,
      });
      this.child = child;
      let skipStartTime = Date.now();
      child.stdout.on("data", (data) => {
        const match = this.startedRegex.exec(data.toString());
        // bench turbopack starttime with node server start time util ">>> TURBOPACK"
        if (!this.skipMatch && this.startMatchReg) {
          const skipMatchReg = this.startMatchReg.exec(data.toString());
          if (skipMatchReg) {
            resolve(Date.now() - skipStartTime);
          }
        } else {
          if (match && match[1]) {
            resolve(match[1] ? Number(match[1]) : null);
          }
        }
      });
      child.on("error", (error) => {
        console.log(`error: ${error.message}`);
        reject(error);
      });
      child.on("exit", (code) => {
        // console.log(`child process exited with code ${code}`);
        if (code !== 0) {
          reject(code);
        }
      });
    });
  }

  stopServer() {
    if (this.child) {
      this.child.stdin.pause();
      this.child.stdout.destroy();
      this.child.stderr.destroy();
      kill(this.child.pid);
    }
  }

  async build() {
    return new Promise(async (resolve) => {
      console.log(`Running build command: ${this.buildScript}`);
      let startTime = null;
      let skipTime = null;
      const child = spawn(`npm`, ["run", this.buildScript], {
        stdio: ["pipe"],
        shell: true,
      });
      if (!this.skipMatch) {
        startTime = performance.now();
      }
      child.stdout.on("data", (data) => {
        const match = this.buildRegex.exec(data.toString());
        if (match !== null && match[1] && this.skipMatch) {
          const time = match[1];
          const unit = match[2];
          if (unit === "s") {
            skipTime = time * 1000;
          } else {
            skipTime = time;
          }
          const endTime = performance.now();
          const elapsedTime = Math.floor(endTime - startTime);
          resolve(this.skipMatch ? skipTime : elapsedTime);
        }
      });
      await new Promise((resolve, reject) => {
        child.on("exit", resolve);
        child.on("error", reject);
      });
      const endTime = performance.now();
      const elapsedTime = Math.floor(endTime - startTime);
      resolve(this.skipMatch ? skipTime : elapsedTime);
    });
  }
}

const buildTools = [
  new BuildTool(
    "Farm 0.10.4",
    9000,
    "start",
    /Ready on (?:.+) in (.+)ms/,
    "build",
    /in (\d+)/,
    true
  ),
  new BuildTool(
    "Rspack 0.2.7",
    8080,
    "start:rspack",
    /in (.+)ms/,
    "build:rspack",
    /in (.+) (s|ms)/,
    true
  ),
  new BuildTool(
    "Vite 4.4.3",
    5173,
    "start:vite",
    /ready in (\d+) ms/,
    "build:vite",
    /built in (\d+\.\d+)(s|ms)/,
    true
  ),
  new BuildTool(
    "Turbopack 13.4.10",
    3000,
    "start:turbopack",
    /started server on/,
    "build:turbopack",
    /Creating an optimized/,
    false,
    /TURBOPACK/
  ),
  new BuildTool(
    "Webpack(babel) 5.88.0",
    8081,
    "start:webpack",
    /compiled .+ in (.+) ms/,
    "build:webpack",
    /in (\d+) ms/
  ),
];

const browser = await puppeteer.launch();

const n = 1;

console.log("Running benchmark " + n + " times, please wait...");

const totalResults = [];

for (let i = 0; i < n; i++) {
  await runBenchmark();
}

async function runBenchmark() {
  const results = {};

  for (const buildTool of buildTools) {
    const time = await buildTool.startServer();
    console.log("startTime", time);
    const page = await browser.newPage();
    const start = Date.now();
    // await new Promise((resolve) => setTimeout(resolve, 1000));

    page.on("load", () => {
      const loadTime = Date.now() - start;
      console.log(
        buildTool.name,
        ": startup time: " + (time + loadTime) + "ms"
      );

      if (!results[buildTool.name]) {
        results[buildTool.name] = {};
      }

      results[buildTool.name]["startup(serverStartTime + onLoadTime)"] =
        time + loadTime;
      results[buildTool.name].serverStartTime = time;
      results[buildTool.name].onLoadTime = loadTime;
    });

    console.log("Navigating to", `http://localhost:${buildTool.port}`);

    await page.goto(`http://localhost:${buildTool.port}`, {
      timeout: 60000,
    });

    let waitResolve = null;
    const waitPromise = new Promise((resolve) => {
      waitResolve = resolve;
    });

    let hmrRootStart = -1;
    let hmrLeafStart = -1;

    page.on("console", (event) => {
      const isFinished = () => {
        return (
          results[buildTool.name]?.rootHmr && results[buildTool.name]?.leafHmr
        );
      };
      if (event.text().includes("root hmr")) {
        const clientDateNow = /(\d+)/.exec(event.text())[1];
        const hmrTime = clientDateNow - hmrRootStart;
        console.log(buildTool.name, " Root HMR time: " + hmrTime + "ms");

        results[buildTool.name].rootHmr = hmrTime;
        if (isFinished()) {
          page.close();
          waitResolve();
        }
      } else if (event.text().includes("leaf hmr")) {
        const hmrTime = Date.now() - hmrLeafStart;
        console.log(buildTool.name, " Leaf HMR time: " + hmrTime + "ms");
        results[buildTool.name].leafHmr = hmrTime;
        if (isFinished()) {
          page.close();
          waitResolve();
        }
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));
    const originalRootFileContent = readFileSync(
      path.resolve("src", "comps", "triangle.jsx"),
      "utf-8"
    );

    appendFile(
      path.resolve("src", "comps", "triangle.jsx"),
      `
    console.log('root hmr', Date.now());
    `,
      (err) => {
        if (err) throw err;
        hmrRootStart = Date.now();
      }
    );

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const originalLeafFileContent = readFileSync(
      path.resolve("src", "comps", "triangle_1_1_2_1_2_2_1.jsx"),
      "utf-8"
    );
    appendFile(
      path.resolve("src", "comps", "triangle_1_1_2_1_2_2_1.jsx"),
      `
      console.log('leaf hmr', Date.now());
      `,
      (err) => {
        if (err) throw err;
        hmrLeafStart = Date.now();
      }
    );

    await waitPromise;
    // await new Promise((resolve) => setTimeout(resolve, 1000));

    // restore files
    writeFileSync(
      path.resolve("src", "comps", "triangle.jsx"),
      originalRootFileContent
    );
    writeFileSync(
      path.resolve("src", "comps", "triangle_1_1_2_1_2_2_1.jsx"),
      originalLeafFileContent
    );

    buildTool.stopServer();

    console.log("close Server");
    await new Promise((resolve) => setTimeout(resolve, 500));
    console.log("prepare build");
    const buildTime = await buildTool.build();
    console.log(buildTool.name, ": build time: " + buildTime + "ms");
    results[buildTool.name].buildTime = buildTime;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  totalResults.push(results);
}

// average results
const averageResults = {};
// console.log(totalResults);
for (const result of totalResults) {
  for (const [name, values] of Object.entries(result)) {
    if (!averageResults[name]) {
      averageResults[name] = {};
    }

    for (const [key, value] of Object.entries(values)) {
      if (!averageResults[name][key]) {
        averageResults[name][key] = 0;
      }

      averageResults[name][key] += Number(value);
    }
  }
}

for (const [name, values] of Object.entries(averageResults)) {
  for (const [key, value] of Object.entries(values)) {
    averageResults[name][key] = Math.floor(value / totalResults.length) + "ms";
  }
}

console.log("average results of " + totalResults.length + " runs:");
console.table(averageResults);

// const buildCommandTools = [
//   {
//     name: "Farm 0.10.3",
//     command: "build",
//     regex: /in (\d+)/,
//     skip: true,
//   },
//   {
//     name: "Rspack 0.2.5",
//     command: "build:rspack",
//     regex: /Time: (\d+)(s|ms)/,
//     skip: true,
//   },
//   {
//     name: "Vite 4.4.2",
//     command: "build:vite",
//     regex: /built in (\d+\.\d+)(s|ms)/,
//     skip: true,
//   },
//   {
//     name: "Turbopack 13.4.9 ",
//     command: "build:turbopack",
//     regex: /Creating an optimized/,
//     skip: false,
//   },
//   {
//     name: "Webpack(babel) 5.88.0",
//     command: "build:webpack",
//     regex: /in (\d+) ms/,
//     skip: true,
//   },
// ];

// async function runBuildCommand(buildCommandTool) {
//   console.log(`Running build command: ${buildCommandTool.command}`);
//   let startTime = null;
//   let skipTime = null;
//   const child = spawn(`npm`, ["run", buildCommandTool.command], {
//     stdio: ["pipe"],
//     shell: true,
//   });
//   if (!buildCommandTool.skip) {
//     startTime = performance.now();
//   }
//   child.stdout.on("data", (data) => {
//     // console.log(data.toString());
//     const match = buildCommandTool.regex.exec(data.toString());
//     // console.log(match);
//     if (match !== null && match[1] && buildCommandTool.skip) {
//       const time = match[1];
//       const unit = match[2];
//       if (unit === "s") {
//         skipTime = time * 1000;
//       } else {
//         skipTime = time;
//       }
//     }
//   });
//   await new Promise((resolve, reject) => {
//     child.on("exit", resolve);
//     child.on("error", reject);
//   });
//   const endTime = performance.now();
//   console.log(`Finished build command: ${buildCommandTool.command}`);
//   const elapsedTime = Math.floor(endTime - startTime);
//   return buildCommandTool.skip ? `${skipTime}ms` : `${elapsedTime}ms`;
// }

// (async () => {
//   for (const buildCommandTool of buildCommandTools) {
//     console.warn(await runBuildCommand(buildCommandTool));
//   }
//   process.exit();
// })();
