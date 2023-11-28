import { spawn } from "child_process";
import { appendFile, readFileSync, writeFileSync } from "fs";
import path from "path";
import puppeteer from "puppeteer";
import kill from "tree-kill";
import * as Chart from "chart.js";

const startConsole = "console.log('Farm Start Time', Date.now());";
const startConsoleRegex = /Farm Start Time (\d+)/;

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

    console.log("hack bin file for", this.name, "under", this.binFilePath);
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
        console.log(`error: ${error.message}`);
        reject(error);
      });
      child.on("exit", (code) => {
        if (code !== 0 && code !== null) {
          console.log(
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
      console.log(`Running build command: ${this.buildScript}`);
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
  // new BuildTool(
  //   "Farm 0.14.9",
  //   9000,
  //   "start",
  //   /Ready in (.+)ms/,
  //   "build",
  //   /in (\d+)/,
  //   "@farmfe/cli/bin/farm.mjs"
  // ),
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
  //   "Vite 5.0.0",
  //   5173,
  //   "start:vite",
  //   /ready in (\d+) ms/,
  //   "build:vite",
  //   /built in (\d+\.\d+)(s|ms)/,
  //   "vite/bin/vite.js"
  // ),
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
  //   "Webpack(babel) 5.89.0",
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

console.log("Running benchmark " + n + " times, please wait...");

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
    console.log("close Server");
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
const benchmarkData = {
  "Farm 0.14.9": {
    "startup(serverStartTime + onLoadTime)": 699,
    serverStartTime: 383,
    onLoadTime: 316,
    rootHmr: 40,
    leafHmr: 45,
    buildTime: 695,
  },
  "Rspack 0.4.0": {
    "startup(serverStartTime + onLoadTime)": 995,
    serverStartTime: 705,
    onLoadTime: 290,
    rootHmr: 97,
    leafHmr: 116,
    buildTime: 658,
  },
  "Vite 5.0.0": {
    "startup(serverStartTime + onLoadTime)": 2555,
    serverStartTime: 285,
    onLoadTime: 2270,
    rootHmr: 151,
    leafHmr: 141,
    buildTime: 1489,
  },
  "Turbopack 14.0.3": {
    "startup(serverStartTime + onLoadTime)": 3950,
    serverStartTime: 398,
    onLoadTime: 3552,
    rootHmr: 79,
    leafHmr: 69,
    buildTime: 6011,
  },
  "Webpack(babel) 5.89.0": {
    "startup(serverStartTime + onLoadTime)": 6406,
    serverStartTime: 6027,
    onLoadTime: 379,
    rootHmr: 207,
    leafHmr: 224,
    buildTime: 8274,
  },
};
// 数据
// const yourData = averageResults;

// 创建一个 HTML 页面并插入数据
// const createHTML = (data) => `
//   <!DOCTYPE html>
//   <html lang="en">
//   <head>
//     <meta charset="UTF-8">
//     <meta name="viewport" content="width=device-width, initial-scale=1.0">
//     <title>Data Page</title>
//   </head>
//   <body>
//     <div id="data-container">${data}</div>
//   </body>
//   </html>
// `;
// async function getScreenShow() {
//   // 启动浏览器
//   const browser = await puppeteer.launch();
//   console.log("我要截图了");
//   // 创建一个新的页面
//   const page = await browser.newPage();

//   // 设置页面内容
//   const content = createHTML(JSON.stringify(yourData));
//   await page.setContent(content);

//   // 截取页面截图
//   await page.screenshot({
//     path: "screenshot.jpg",
//     quality: 100,
//     fullPage: true,
//   });

//   // 关闭浏览器
//   await browser.close();
// }

// await getScreenShow();

function createChartScript() {
  // 创建图表
  const ctx = document.createElement("canvas").getContext("2d");
  document.body.appendChild(ctx.canvas);

  new Chart(ctx, {
    type: "horizontalBar",
    data: {
      labels: Object.keys(benchmarkData),
      datasets: Object.keys(benchmarkData["Farm 0.14.9"]).map((metric) => ({
        label: metric,
        data: Object.keys(benchmarkData).map(
          (label) => benchmarkData[label][metric]
        ),
        backgroundColor: getRandomColor(),
      })),
    },
    options: {
      responsive: true,
      legend: {
        position: "top",
      },
      title: {
        display: true,
        text: "Benchmark Comparison",
      },
    },
  });

  // 随机生成颜色
  function getRandomColor() {
    const letters = "0123456789ABCDEF";
    let color = "#";
    for (let i = 0; i < 6; i++) {
      color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
  }
}

// const generateBenchmarkImage = async () => {
//   // 创建一个新的浏览器实例
//   const browser = await puppeteer.launch();

//   // 创建一个新的页面
//   const page = await browser.newPage();

//   // 将 benchmark 数据注入到页面中
//   await page.evaluate((data) => {
//     window.benchmarkData = data;
//   }, benchmarkData);

//   // 读取并注入 Chart.js 库
//   const pathe = path.resolve(
//     process.cwd(),
//     "node_modules",
//     "chart.js",
//     "dist",
//     "chart.js"
//   );
//   const chartJsScript = await readFileSync(pathe, "utf8");
//   // await page.evaluate((chartScript) => {
//   //   eval(chartScript);
//   // }, chartJsScript);
//   await page.addScriptTag({
//     url: "https://cdn.jsdelivr.net/npm/chart.js@3.0.0/dist/chart.min.js",
//   });
//   // 等待一段时间确保 Chart.js 被加载
//   await page.evaluate(() => {
//     console.log(window);
//   });
//   await new Promise((r) => setTimeout(r, 1000));
//   // 读取并注入包含生成图表的脚本
//   const chartScript = createChartScript.toString() + "\ncreateChartScript();";
//   await page.evaluate((chartScript) => {
//     eval(chartScript);
//   }, chartScript);

//   // 截取页面截图
//   await page.screenshot({ path: "benchmark.png" });

//   // 关闭浏览器
//   await browser.close();
// };

// await generateBenchmarkImage();

async function getData() {
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
        const benchmarkData = {
          "Farm 0.14.9": {
            "startup(serverStartTime + onLoadTime)": 699,
            serverStartTime: 383,
            onLoadTime: 316,
            rootHmr: 40,
            leafHmr: 45,
            buildTime: 695,
          },
          "Rspack 0.4.0": {
            "startup(serverStartTime + onLoadTime)": 995,
            serverStartTime: 705,
            onLoadTime: 290,
            rootHmr: 97,
            leafHmr: 116,
            buildTime: 658,
          },
          "Vite 5.0.0": {
            "startup(serverStartTime + onLoadTime)": 2555,
            serverStartTime: 285,
            onLoadTime: 2270,
            rootHmr: 151,
            leafHmr: 141,
            buildTime: 1489,
          },
          "Turbopack 14.0.3": {
            "startup(serverStartTime + onLoadTime)": 3950,
            serverStartTime: 398,
            onLoadTime: 3552,
            rootHmr: 79,
            leafHmr: 69,
            buildTime: 6011,
          },
          "Webpack(babel) 5.89.0": {
            "startup(serverStartTime + onLoadTime)": 6406,
            serverStartTime: 6027,
            onLoadTime: 379,
            rootHmr: 207,
            leafHmr: 224,
            buildTime: 8274,
          },
        };
  
        const ctx = document.getElementById("myChart").getContext("2d");
  
        const data = {
          labels: Object.keys(benchmarkData),
          datasets: [
            {
              label: "启动时间",
              data: Object.values(benchmarkData).map(
                (item) => item.serverStartTime
              ),
              backgroundColor: "rgba(75, 192, 192, 0.2)",
            },
            {
              label: "构建时间",
              data: Object.values(benchmarkData).map((item) => item.buildTime),
              backgroundColor: "rgba(255, 99, 132, 0.2)",
            },
            {
              label: "rootHmr",
              data: Object.values(benchmarkData).map((item) => item.rootHmr),
              backgroundColor: "rgba(255, 206, 86, 0.2)",
            },
            {
              label: "leafHmr",
              data: Object.values(benchmarkData).map((item) => item.leafHmr),
              backgroundColor: "rgba(153, 102, 255, 0.2)",
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
  console.log("等一秒");
  await new Promise((resolve) => setTimeout(() => resolve(), 1000));
  console.log("等完了");
  await page.screenshot({ path: "chart.png" });

  await browser.close();
}

await getData();

process.exit(0);
