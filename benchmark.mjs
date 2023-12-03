import { spawn } from "child_process";
import { appendFile, readFileSync, writeFileSync } from "fs";
import path from "path";
import puppeteer from "puppeteer";
import kill from "tree-kill";
import { DefaultLogger } from "@farmfe/core";
import { deleteCacheFiles, mergeAllVersions, getChartPic } from "./utils.mjs";

const startConsole = "console.log('Farm Start Time', Date.now());";
const startConsoleRegex = /Farm Start Time (\d+)/;
const logger = new DefaultLogger();

class BuildTool {
  constructor(
    name,
    port,
    script,
    startedRegex,
    buildScript,
    buildRegex,
    binFilePath,
    skipHmr = false
  ) {
    this.name = name;
    this.port = port;
    this.script = script;
    this.startedRegex = startedRegex;
    this.buildScript = buildScript;
    this.buildRegex = buildRegex;
    this.skipHmr = skipHmr;
    this.binFilePath = path.join(process.cwd(), "node_modules", binFilePath);
    logger.info("hack bin file for", this.name, "under", this.binFilePath);
    this.hackBinFile();
  }

  // Add a `console.log('Farm start', Date.now())` to the bin file's second line
  hackBinFile() {
    const binFileContent = readFileSync(this.binFilePath, "utf-8");

    if (!binFileContent.includes(startConsole)) {
      const lines = binFileContent.split("\n");
      lines.splice(1, 0, startConsole);
      writeFileSync(this.binFilePath, lines.join("\n"));
    }
  }

  removeANSIColors(input) {
    return input.replace(/\x1B\[[0-9;]*[mGKH]/g, "");
  }

  async startServer() {
    return new Promise((resolve, reject) => {
      const child = spawn(`npm`, ["run", this.script], {
        stdio: "pipe",
        shell: true,
      });
      this.child = child;
      let startTime = null;

      child.stdout.on("data", (data) => {
        const startMatch = startConsoleRegex.exec(data.toString());
        if (startMatch) {
          startTime = startMatch[1];
        }
        const normalizedData = data.toString("utf8").replace(/\r\n/g, "\n");
        const match = this.startedRegex.exec(normalizedData);
        if (match) {
          // Adaptation windows ANSI  color
          // const cleanedMatch = match.map((part) => this.removeANSIColors(part));
          // console.log(cleanedMatch);
          // let result;
          // if (typeof cleanedMatch[1] === "number") {
          //   result = cleanedMatch[1];
          // } else if (typeof cleanedMatch[1] === "string") {
          //   result = parseFloat(cleanedMatch[1].replace(/[a-zA-Z ]/g, ""));
          // }
          if (!startTime) {
            throw new Error("Start time not found");
          }
          const time = Date.now() - startTime;
          resolve(time);
        }
      });
      child.on("error", (error) => {
        logger.error(`error: ${error.message}`);
        reject(error);
      });
      child.on("exit", (code) => {
        if (code !== 0 && code !== null) {
          logger.info(
            `(${this.name} run ${this.script} failed) child process exited with code ${code}`
          );
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
      logger.info(`Running build command: ${this.buildScript}`);
      let startTime = null;

      const child = spawn(`npm`, ["run", this.buildScript], {
        stdio: ["pipe"],
        shell: true,
      });
      child.stdout.on("data", (data) => {
        const startMatch = startConsoleRegex.exec(data.toString("utf8"));
        if (startMatch) {
          startTime = startMatch[1];
        }
        const match = this.buildRegex.exec(data.toString("utf8"));
        if (match) {
          if (!startTime) {
            throw new Error("Start time not found");
          }
          resolve(Date.now() - startTime);
        }
      });
      return new Promise((resolve, reject) => {
        child.on("exit", resolve);
        child.on("error", reject);
      });
    });
  }
}

const buildTools = [
  new BuildTool(
    "Farm 0.14.12",
    9000,
    "start",
    /Ready\s*in\s*(.+)ms/,
    "build",
    /completed\s*in\s*(.+)ms/,
    "@farmfe/cli/bin/farm.mjs"
  ),
  new BuildTool(
    "Farm 0.14.12 (Hot)",
    9000,
    "start",
    /Ready\s*in\s*(.+)ms/,
    "build",
    /completed\s*in\s*(.+)ms/,
    "@farmfe/cli/bin/farm.mjs",
    true
  ),
  new BuildTool(
    "Rspack 0.4.1",
    8080,
    "start:rspack",
    /in\s+(.+)(s|ms)/,
    "build:rspack",
    /in\s+(.+) (s|ms)/,
    "@rspack/cli/bin/rspack"
  ),
  new BuildTool(
    "Rspack 0.4.1 (Hot)",
    8080,
    "start:rspack",
    /in\s+(.+)(s|ms)/,
    "build:rspack",
    /in (.+) (s|ms)/,
    "@rspack/cli/bin/rspack",
    true
  ),
  new BuildTool(
    "Vite 5.0.4",
    5173,
    "start:vite",
    /ready\s*in\s*(.+)(s|ms)/,
    "build:vite",
    /built\s*in\s*(\d*\.\d*)\s*(s|ms)/,
    "vite/bin/vite.js"
  ),
  new BuildTool(
    "Vite 5.0.4 (Hot)",
    5173,
    "start:vite",
    /ready\s*in\s*(.+)(s|ms)/,
    "build:vite",
    /built\s*in\s*(\d*\.\d*)\s*(s|ms)/,
    "vite/bin/vite.js",
    true
  ),
  new BuildTool(
    "Turbopack 14.0.3",
    3000,
    "start:turbopack",
    /\s*Ready\s*in(.+)(s|ms)/,

    "build:turbopack",
    /prerendered\s+as\s+static\s+content/,
    "next/dist/bin/next"
  ),
  new BuildTool(
    "Turbopack 14.0.3 (Hot)",
    3000,
    "start:turbopack",
    /\s*Ready\s*in(.+)(s|ms)/,
    "build:turbopack",
    /prerendered\s+as\s+static\s+content/,
    "next/dist/bin/next",
    true
  ),
  new BuildTool(
    "Webpack(babel) 5.89.0",
    8081,
    "start:webpack",
    /compiled\s+.+\sin\s+(\d+)\s+ms/,
    "build:webpack",
    /in\s+(\d+)\s+ms/,
    "webpack-cli/bin/cli.js"
  ),
  new BuildTool(
    "Webpack(babel) 5.89.0 (Hot)",
    8081,
    "start:webpack",
    /compiled\s+.+\sin\s+(\d+)\s+ms/,
    "build:webpack",
    /in\s+(\d+)\s+ms/,
    "webpack-cli/bin/cli.js",
    true
  ),
];

const browser = await puppeteer.launch();

const n = 1;

logger.info("Running benchmark " + n + " times, please wait...");

const totalResults = [];

for (let i = 0; i < n; i++) {
  // delete cache
  await deleteCacheFiles();
  await runBenchmark();
}

async function runBenchmark() {
  const results = {};

  for (const buildTool of buildTools) {
    const time = await buildTool.startServer();
    const page = await browser.newPage();
    const start = Date.now();

    page.on("load", () => {
      const loadTime = Date.now() - start;
      logger.info(
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

    logger.info("Navigating to", `http://localhost:${buildTool.port}`);

    await page.goto(`http://localhost:${buildTool.port}`, {
      timeout: 60000,
    });

    // if (!buildTool.skipHmr) {
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
        logger.info(buildTool.name, " Root HMR time: " + hmrTime + "ms");

        results[buildTool.name].rootHmr = hmrTime;
        if (isFinished()) {
          page.close();
          waitResolve();
        }
      } else if (event.text().includes("leaf hmr")) {
        const hmrTime = Date.now() - hmrLeafStart;
        logger.info(buildTool.name, " Leaf HMR time: " + hmrTime + "ms");
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
    // } else {
    //   logger.warn("The Second BuildTools Skip HMR");
    // }

    await new Promise((resolve) => setTimeout(resolve, 500));
    logger.info("close Server");
    logger.info("prepare build");
    const buildTime = await buildTool.build();
    logger.info(buildTool.name, ": build time: " + buildTime + "ms");
    results[buildTool.name].buildTime = buildTime;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  totalResults.push(results);
}

const averageResults = {};

const chartData = {};
for (const result of totalResults) {
  for (const [name, values] of Object.entries(result)) {
    if (!averageResults[name]) {
      averageResults[name] = {};
    }

    if (!chartData[name]) {
      chartData[name] = {};
    }

    for (const [key, value] of Object.entries(values)) {
      if (!averageResults[name][key]) {
        averageResults[name][key] = "Calculation error Time ！";
      }

      if (!chartData[name][key]) {
        chartData[name][key] = 0; // 初始化为纯数字
      }

      chartData[name][key] += Number(value);
      averageResults[name][key] =
        Math.floor(chartData[name][key] / totalResults.length) + "ms";
    }
  }
}

mergeAllVersions(chartData);

logger.info("average results of " + totalResults.length + " runs:");
const benchmarkData = { ...chartData };

await getChartPic(benchmarkData);
console.table(averageResults);

process.exit(0);
