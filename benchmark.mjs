import { spawn } from "child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import path from "path";
import playwright from "playwright";
import kill from "tree-kill";
const originalRootFileContent = readFileSync(
  path.resolve("src", "comps", "triangle.jsx"),
  "utf-8"
);

const originalLeafFileContent = readFileSync(
  path.resolve("src", "comps", "triangle_1_1_2_1_2_2_1.jsx"),
  "utf-8"
);

const rootFilePath = path.resolve("src", "comps", "triangle.jsx");
const leafFilePath = path.resolve("src", "comps", "triangle_1_1_2_1_2_2_1.jsx");

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
  // new BuildTool(
  //   "Farm 0.10.4",
  //   9000,
  //   "start",
  //   /Ready on (?:.+) in (.+)ms/,
  //   "build",
  //   /in (\d+)/,
  //   true
  // ),
  // new BuildTool(
  //   "Rspack 0.2.7",
  //   8080,
  //   "start:rspack",
  //   /in (.+)ms/,
  //   "build:rspack",
  //   /in (.+) (s|ms)/,
  //   true
  // ),
  // new BuildTool(
  //   "Vite 4.4.3",
  //   5173,
  //   "start:vite",
  //   /ready in (\d+) ms/,
  //   "build:vite",
  //   /built in (\d+\.\d+)(s|ms)/,
  //   true
  // ),
  new BuildTool(
    "Turbopack 13.4.9 ",
    3000,
    "start:turbopack",
    /started server on/,
    "build:turbopack",
    /Creating an optimized/,
    false,
    />>> TURBOPACK/
  ),
  // new BuildTool(
  //   "Webpack(babel) 5.88.0",
  //   8081,
  //   "start:webpack",
  //   /compiled .+ in (.+) ms/,
  //   "build:webpack",
  //   /in (\d+) ms/
  // ),
];

// const browser = await puppeteer.launch();
const browser = await playwright.chromium.launch();
const n = 1;

console.log("Running benchmark " + n + " times, please wait...");

const totalResults = [];

for (let i = 0; i < n; i++) {
  await runBenchmark();
}

async function runBenchmark() {
  const results = {};
  for (const buildTool of buildTools) {
    const page = await (await browser.newContext()).newPage();
    await new Promise((resolve) => setTimeout(resolve, 500));
    // loading
    const loadPromise = page.waitForEvent("load", {
      timeout: 60000,
    });
    const pageLoadStart = Date.now();
    const serverStartTime = await buildTool.startServer();
    console.log(buildTool.name, ": StartTime: " + serverStartTime + "ms");
    page.goto(`http://localhost:${buildTool.port}`);
    await loadPromise;
    const loadTime = Date.now() - pageLoadStart;
    if (!results[buildTool.name]) {
      results[buildTool.name] = {};
    }
    results[buildTool.name]["startup(serverStartTime + onLoadTime)"] =
      serverStartTime + loadTime;
    results[buildTool.name].serverStartTime = serverStartTime;
    results[buildTool.name].onLoadTime = loadTime;

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const rootConsolePromise = page.waitForEvent("console", {
      predicate: (e) => e.text().includes("root hmr"),
    });
    const leafConsolePromise = page.waitForEvent("console", {
      predicate: (e) => e.text().includes("leaf hmr"),
    });

    appendFileSync(
      rootFilePath,
      `
      console.log('root hmr', Date.now());
    `
    );
    const hmrRootStart = Date.now();
    await rootConsolePromise;
    results[buildTool.name].rootHmr = Date.now() - hmrRootStart;
    console.log("root hmr", Date.now() - hmrRootStart);
    await new Promise((resolve) => setTimeout(resolve, 500));

    appendFileSync(
      leafFilePath,
      `
      console.log('leaf hmr', Date.now());
    `
    );
    const hmrLeafStart = Date.now();
    await leafConsolePromise;
    results[buildTool.name].leafHmr = Date.now() - hmrLeafStart;
    console.log("leaf hmr", Date.now() - hmrLeafStart);
    // restore files
    buildTool.stopServer();
    await page.close();
    writeFileSync(
      path.resolve("src", "comps", "triangle.jsx"),
      originalRootFileContent
    );
    writeFileSync(
      path.resolve("src", "comps", "triangle_1_1_2_1_2_2_1.jsx"),
      originalLeafFileContent
    );

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const buildTime = await buildTool.build();
    console.log(buildTool.name, ": build time: " + buildTime + "ms");
    results[buildTool.name].buildTime = buildTime;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  await browser.close();

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
