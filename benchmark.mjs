import { spawn } from "child_process";
import { appendFileSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import puppeteer from "puppeteer";
import kill from "tree-kill";

class BuildTool {
  constructor(name, port, script, startedRegex) {
    this.name = name;
    this.port = port;
    this.script = script;
    this.startedRegex = startedRegex;
  }

  async startServer() {
    return new Promise((resolve, reject) => {
      const child = spawn(`npm`, ["run", this.script], {
        stdio: "pipe",
        shell: true,
      });
      this.child = child;

      child.stdout.on("data", (data) => {
        const match = this.startedRegex.exec(data);
        if (match && match[1]) {
          resolve(Number(match[1]));
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
    this.child.stdin.pause();
    this.child.stdout.destroy();
    this.child.stderr.destroy();
    kill(this.child.pid);
  }
}

const buildTools = [
  new BuildTool("Turbopack 13.4.8 ", 3000, "start:turbopack", /(.+)ms/),
  new BuildTool("Rspack 0.2.5", 8080, "start:rspack", /Time: (.+)ms/),
  new BuildTool(
    "Webpack(babel) 5.88.0",
    8081,
    "start:webpack",
    /compiled successfully in (.+) ms/
  ),
  new BuildTool("Vite 4.3.9", 5173, "start:vite", /ready in (.+) ms/),
  new BuildTool("Farm 0.10.1", 9000, "start", /Ready on (?:.+) in (.+)ms/),
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

  let waitResolve = null;
  const waitPromise = new Promise((resolve) => {
    waitResolve = resolve;
  });

  for (const buildTool of buildTools) {
    const time = await buildTool.startServer();
    // console.log(time);
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

      results[buildTool.name]["startup(startStartTime + onLoadTime)"] =
        time + loadTime;
      results[buildTool.name].serverStartTime = time;
      results[buildTool.name].onLoadTime = loadTime;
    });

    // console.log("Navigating to", `http://localhost:${buildTool.port}`);
    await page.goto(`http://localhost:${buildTool.port}`);
    page.on("console", (event) => {
      const isFinished = () => {
        for (const result of Object.values(results)) {
          if (!result.rootHmr || !result.leafHmr) {
            return false;
          }
        }

        return true;
      };
      
      if (event.text().includes("root hmr")) {
        const hmrTime = Date.now() - hmrRootStart;
        console.log(buildTool.name, " Root HMR time: " + hmrTime + "ms");

        results[buildTool.name].rootHmr = hmrTime;

        if (isFinished()) {
          waitResolve();
        }

        if (
          results[buildTool.name].rootHmr &&
          results[buildTool.name].leafHmr
        ) {
          page.close();
        }
      } else if (event.text().includes("leaf hmr")) {
        const hmrTime = Date.now() - hmrLeafStart;
        console.log(buildTool.name, " Leaf HMR time: " + hmrTime + "ms");

        results[buildTool.name].leafHmr = hmrTime;

        if (isFinished()) {
          waitResolve();
        }

        if (
          results[buildTool.name].rootHmr &&
          results[buildTool.name].leafHmr
        ) {
          page.close();
        }
      }
    });
  }

  const originalRootFileContent = readFileSync(
    path.resolve("src", "comps", "triangle.jsx"),
    "utf-8"
  );
  const hmrRootStart = Date.now();
  appendFileSync(
    path.resolve("src", "comps", "triangle.jsx"),
    `
  console.log('root hmr');
`
  );

  await new Promise((resolve) => setTimeout(resolve, 1000));

  const originalLeafFileContent = readFileSync(
    path.resolve("src", "comps", "triangle_1_1_2_1_2_2_1.jsx"),
    "utf-8"
  );
  const hmrLeafStart = Date.now();
  appendFileSync(
    path.resolve("src", "comps", "triangle_1_1_2_1_2_2_1.jsx"),
    `
  console.log('leaf hmr');
`
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

  for (const buildTool of buildTools) {
    buildTool.stopServer();
  }

  await new Promise((resolve) => setTimeout(resolve, 500));

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

      averageResults[name][key] += value;
    }
  }
}

for (const [name, values] of Object.entries(averageResults)) {
  for (const [key, value] of Object.entries(values)) {
    averageResults[name][key] = value / totalResults.length + "ms";
  }
}

console.log("average results of " + totalResults.length + " runs:");
console.table(averageResults);
