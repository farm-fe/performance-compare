import { spawn } from "child_process";
import { appendFileSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import puppeteer from "puppeteer";

class BuildTool {
  constructor(name, port, script, startedRegex, hmrRegex) {
    this.name = name;
    this.port = port;
    this.script = script;
    this.startedRegex = startedRegex;
    this.hmrRegex = hmrRegex;
  }

  async startServer() {
    return new Promise((resolve, reject) => {

      const child = spawn(`npm`, ["run", this.script], { stdio: 'pipe', shell: true });


      child.stdout.on('data', (data) => {
        const match = this.startedRegex.exec(data);
        if (match && match[1]) {
          resolve(Number(match[1]));
          child.kill();
        }
      });
      child.on('error', (error) => {
        console.log(`error: ${error.message}`);
        reject(error);
      });
      child.on('exit', (code) => {
        if (code !== 0) {
          reject(code);
        }
      });
    });
  }
}

const buildTools = [
  new BuildTool("Rspack", 8080, "start:rspack", /build success, time cost (.+) ms/, /rebuild success, time cost (.+) ms/),
  new BuildTool("Turbopack", 3000, "start:turbopack", /initial compilation (.+)ms/, /updated in (.+)ms/),
  new BuildTool("Farm", 9000, "start", /Ready on (?:.+) in (.+)ms/, /updated in (.+)ms/),
]

const browser = await puppeteer.launch();

for (const buildTool of buildTools) {
  const time = await buildTool.startServer();
  const page = await browser.newPage();
  const start = Date.now();

  page.on('load', () => {
    console.log(buildTool.name, " startup time: " + (time + Date.now() - start) + "ms");
  });

  await page.goto(`http://localhost:${buildTool.port}`);

  page.on('console', (event) => {
    if (event.text().includes('root hmr')) {
      console.log(buildTool.name, " Root HMR time: " + (Date.now() - hmrRootStart) + "ms");
    } else if (event.text().includes('leaf hmr')) {
      console.log(buildTool.name, " Leaf HMR time: " + (Date.now() - hmrLeafStart) + "ms");
    }
  });
}

const hmrRootStart = Date.now();
appendFileSync(path.resolve('src', 'comps', 'triangle.jsx'), `
  console.log('root hmr');
`)

await new Promise((resolve) => setTimeout(resolve, 1000));

const hmrLeafStart = Date.now();
appendFileSync(path.resolve('src', 'comps', 'triangle_1_1_2_1_2_2_1.jsx'), `
  console.log('leaf hmr');
`)