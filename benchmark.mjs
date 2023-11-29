import { spawn } from "child_process";
import { appendFile, readFileSync, writeFileSync } from "fs";
import path from "path";
import puppeteer from "puppeteer";
import kill from "tree-kill";
import { DefaultLogger } from "@farmfe/core";

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
    binFilePath
  ) {
    this.name = name;
    this.port = port;
    this.script = script;
    this.startedRegex = startedRegex;
    this.buildScript = buildScript;
    this.buildRegex = buildRegex;
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
        const match = this.startedRegex.exec(data.toString());
        if (match) {
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
        const startMatch = startConsoleRegex.exec(data.toString());
        if (startMatch) {
          startTime = startMatch[1];
        }
        const match = this.buildRegex.exec(data.toString());
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
    "Farm 0.14.9",
    9000,
    "start",
    /Ready in (.+)ms/,
    "build",
    /in (\d+)/,
    "@farmfe/cli/bin/farm.mjs"
  ),
  new BuildTool(
    "Farm 0.14.9 (Hot Start)",
    9000,
    "start",
    /Ready in (.+)ms/,
    "build",
    /in (\d+)/,
    "@farmfe/cli/bin/farm.mjs"
  ),
  // new BuildTool(
  //   "Rspack 0.4.0",
  //   8080,
  //   "start:rspack",
  //   /in (.+)ms/,
  //   "build:rspack",
  //   /in (.+) (s|ms)/,
  //   "@rspack/cli/bin/rspack"
  // ),
  // new BuildTool(
  //   "Rspack 0.4.0 (Hot Start)",
  //   8080,
  //   "start:rspack",
  //   /in (.+)ms/,
  //   "build:rspack",
  //   /in (.+) (s|ms)/,
  //   "@rspack/cli/bin/rspack"
  // ),
  new BuildTool(
    "Vite 5.0.0",
    5173,
    "start:vite",
    /ready in (\d+) ms/,
    "build:vite",
    /built in (\d+\.\d+)(s|ms)/,
    "vite/bin/vite.js"
  ),
  new BuildTool(
    "Vite 5.0.0 (Hot Start)",
    5173,
    "start:vite",
    /ready in (\d+) ms/,
    "build:vite",
    /built in (\d+\.\d+)(s|ms)/,
    "vite/bin/vite.js"
  ),
  // new BuildTool(
  //   "Turbopack 14.0.3",
  //   3000,
  //   "start:turbopack",
  //   /- Local:  /,
  //   "build:turbopack",
  //   /prerendered as static content/,
  //   "next/dist/bin/next"
  // ),
  // new BuildTool(
  //   "Turbopack 14.0.3(Hot Start)",
  //   3000,
  //   "start:turbopack",
  //   /- Local:  /,
  //   "build:turbopack",
  //   /prerendered as static content/,
  //   "next/dist/bin/next"
  // ),
  // new BuildTool(
  //   "Webpack(babel) 5.89.0",
  //   8081,
  //   "start:webpack",
  //   /compiled .+ in (.+) ms/,
  //   "build:webpack",
  //   /in (\d+) ms/,
  //   "webpack-cli/bin/cli.js"
  // ),
  // new BuildTool(
  //   "Webpack(babel) 5.89.0(Hot Start)",
  //   8081,
  //   "start:webpack",
  //   /compiled .+ in (.+) ms/,
  //   "build:webpack",
  //   /in (\d+) ms/,
  //   "webpack-cli/bin/cli.js"
  // ),
];

const browser = await puppeteer.launch();

const n = 1;

logger.info("Running benchmark " + n + " times, please wait...");

const totalResults = [];

for (let i = 0; i < n; i++) {
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

// 打印带单位的数据
console.table(averageResults);

logger.info("average results of " + totalResults.length + " runs:");
const benchmarkData = { ...chartData };

async function getData(data) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setContent(`
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Benchmark Chart</title>
      <script src="https://cdn.jsdelivr.net/npm/chart.js@3.0.0/dist/chart.min.js"></script>
    </head>
    <body>
      <canvas id="myChart" width="600" height="400"></canvas>
  
      <script>
        const benchmarkData = ${JSON.stringify(data)}
  
        const ctx = document.getElementById("myChart").getContext("2d");
        function randomColor(){
          return 'rgba('+Math.round(Math.random()*255)+','+Math.round(Math.random()*255)+','+Math.round(Math.random()*255)+',0.8)';
        }
        const data = {
          labels: Object.keys(benchmarkData),
          datasets: [
            {
              label: "startup(serverStartTime + onLoadTime) (Cold)",
              data: Object.values(benchmarkData).map(
                (item) => item.serverStartTime
              ),
              backgroundColor: randomColor()
            },
            {
              label: "BuildTime (Cold)",
              data: Object.values(benchmarkData).map((item) => item.buildTime),
              backgroundColor: randomColor()
            },
            {
              label: "rootHmr",
              data: Object.values(benchmarkData).map((item) => item.rootHmr),
              backgroundColor: randomColor()
            },
            {
              label: "leafHmr",
              data: Object.values(benchmarkData).map((item) => item.leafHmr),
              backgroundColor: randomColor()
            },
          ],
        };
  
        new Chart(ctx, {
          type: "bar",
          data: data,
          options: {
            responsive: true,
            plugins: {
              legend: {
                position: "top",
              },
            },
          },
        });
      </script>
    </body>
  </html>
  
`);
  const logger = new DefaultLogger();
  logger.warn("Ready to start taking screenshots");
  await new Promise((resolve) => setTimeout(() => resolve(), 500));
  await page.screenshot({ path: "chart.png" });
  logger.info("Picture generated successfully ！");

  await browser.close();
}

await getData(benchmarkData);

process.exit(0);
