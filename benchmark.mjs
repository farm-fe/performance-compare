import { spawn } from "child_process";
import { appendFile, appendFileSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import puppeteer from "puppeteer";
import kill from "tree-kill";
import util from "util";
const spawn2 = util.promisify(spawn);
class BuildTool {
  constructor(name, port, script, startedRegex) {
    this.name = name;
    this.port = port;
    this.script = script;
    this.startedRegex = startedRegex;
  }

  async startServer() {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const child = spawn(`npm`, ["run", this.script], {
        stdio: "pipe",
        shell: true,
      });
      this.child = child;

      child.stdout.on("data", (data) => {
        // console.log(data.toString());
        const match = this.startedRegex.exec(data.toString());

        if (match) {
          const time = Date.now() - start;
          resolve(time);
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
  new BuildTool(
    "Turbopack 13.4.9 ",
    3000,
    "start:turbopack",
    /started server on/
  ),
  new BuildTool("Rspack 0.2.5", 8080, "start:rspack", /Time: (.+)ms/),
  new BuildTool(
    "Webpack(babel) 5.88.0",
    8081,
    "start:webpack",
    /compiled .+ in (.+) ms/
  ),
  new BuildTool("Vite 4.4.2", 5173, "start:vite", /ready in (.+) ms/),
  new BuildTool("Farm 0.10.3", 9000, "start", /Ready on (?:.+) in (.+)ms/),
];

const browser = await puppeteer.launch();

const n = 3;

console.log("Running benchmark " + n + " times, please wait...");

const totalResults = [];

// for (let i = 0; i < n; i++) {
//   await runBenchmark();
// }

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

      results[buildTool.name]["startup(serverStartTime + onLoadTime)"] =
        time + loadTime;
      results[buildTool.name].serverStartTime = time;
      results[buildTool.name].onLoadTime = loadTime;
    });

    console.log("Navigating to", `http://localhost:${buildTool.port}`);
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

  await new Promise((resolve) => setTimeout(resolve, 1000));

  const originalRootFileContent = readFileSync(
    path.resolve("src", "comps", "triangle.jsx"),
    "utf-8"
  );
  let hmrRootStart = -1;
  appendFile(
    path.resolve("src", "comps", "triangle.jsx"),
    `
console.log('root hmr');
`,
    (err) => {
      if (err) throw err;
      hmrRootStart = Date.now();
    }
  );
  //   appendFileSync(
  //     path.resolve("src", "comps", "triangle.jsx"),
  //     `
  //   console.log('root hmr');
  // `
  //   );

  await new Promise((resolve) => setTimeout(resolve, 1000));

  const originalLeafFileContent = readFileSync(
    path.resolve("src", "comps", "triangle_1_1_2_1_2_2_1.jsx"),
    "utf-8"
  );
  let hmrLeafStart = -1;
  appendFile(
    path.resolve("src", "comps", "triangle_1_1_2_1_2_2_1.jsx"),
    `
  console.log('leaf hmr');
  `,
    (err) => {
      if (err) throw err;
      hmrLeafStart = Date.now();
    }
  );

  // const hmrLeafStart = Date.now();
  // appendFileSync(
  //   path.resolve("src", "comps", "triangle_1_1_2_1_2_2_1.jsx"),
  //   `
  //   console.log('leaf hmr');
  // `
  // );

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

const buildCommandTools = [
  {
    name: "Farm 0.10.3",
    command: "build",
    regex: /in (\d+)/,
    skip: true,
  },
  {
    name: "Rspack 0.2.5",
    command: "build:rspack",
    regex: /Time: (\d+)/,
    skip: true,
  },
  {
    name: "Vite 4.4.2",
    command: "build:vite",
    regex: /built in (\d+\.\d+)/,
    skip: true,
  },
  {
    name: "Turbopack 13.4.9 ",
    command: "build:turbopack",
    regex: /Creating an optimized/,
    skip: false,
  },
  {
    name: "Webpack(babel) 5.88.0",
    command: "build:webpack",
    regex: /in (\d+) ms/,
    skip: true,
  },
];

async function runBuildCommand(buildCommandTool) {
  console.log(`Running build command: ${buildCommandTool.command}`);
  let startTime = null;
  let skipTime = null;
  const child = spawn(`npm`, ["run", buildCommandTool.command], {
    stdio: ["pipe"],
    shell: true,
  });
  if (!buildCommandTool.skip) {
    startTime = performance.now();
  }
  child.stdout.on("data", (data) => {
    // console.log(data.toString());
    const match = buildCommandTool.regex.exec(data.toString());
    // console.log(match);
    if (match !== null && match[1] && buildCommandTool.skip) {
      const time = match[1];
      skipTime = time;
    }
  });
  await new Promise((resolve, reject) => {
    child.on("exit", resolve);
    child.on("error", reject);
  });
  const endTime = performance.now();
  console.log(`Finished build command: ${buildCommandTool.command}`);
  const elapsedTime = Math.floor(endTime - startTime);
  return buildCommandTool.skip ? `${skipTime}ms` : `${elapsedTime}ms`;
}

(async () => {
  for (const buildCommandTool of buildCommandTools) {
    console.warn(await runBuildCommand(buildCommandTool));
  }
  process.exit();
})();
