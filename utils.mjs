import { DefaultLogger } from "@farmfe/core";
import { rmSync, statSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";

const logger = new DefaultLogger();
export async function getChartPic(data) {
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
                  (item) => item['startup(serverStartTime + onLoadTime)']
                ),
                backgroundColor: randomColor()
              },
              {
                label: "startup(serverStartTime + onLoadTime) (Hot Cache)",
                data: Object.values(benchmarkData).map(
                  (item) => item['hotStartup(serverStartTime + onLoadTime)']
                ),
                backgroundColor: randomColor()
              },
              {
                label: "BuildTime (Cold)",
                data: Object.values(benchmarkData).map((item) => item.buildTime),
                backgroundColor: randomColor()
              },
              {
                label: "BuildTime (Hot Cache)",
                data: Object.values(benchmarkData).map((item) => item.hotBuildTime),
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
  await new Promise((resolve) => setTimeout(() => resolve(true), 500));
  await page.screenshot({ path: "chart.png" });
  logger.info("Picture generated successfully ！");

  await browser.close();
}

export async function deleteCacheFiles() {
  const cacheFolderPaths = [
    path.resolve(process.cwd(), "node_modules", ".cache"),
    path.resolve(process.cwd(), "node_modules", ".farm"),
    path.resolve(process.cwd(), "node_modules", ".vite"),
    path.resolve(process.cwd(), ".next"),
  ];

  await Promise.all(
    cacheFolderPaths.map(async (folderPath) => {
      if (await folderExists(folderPath)) {
        try {
          await rmSync(folderPath, { recursive: true });
          logger.info(`Deleted cache folder: ${folderPath}`);
        } catch (err) {
          logger.error(
            `Error deleting cache folder ${folderPath}: ${err.message}`
          );
        }
      } else {
        logger.warn(`Cache folder does not exist: ${folderPath}`);
      }
    })
  );

  return Promise.resolve();
}

export async function folderExists(path) {
  try {
    await statSync(path);
    return true;
  } catch (err) {
    if (err.code === "ENOENT") {
      return false;
    } else {
      throw err;
    }
  }
}

export function mergeVersions(data, mainVersion, hotVersion) {
  if (!(mainVersion in data) || !(hotVersion in data)) {
    logger.error("not found mainVersion or hotVersion");
    return;
  }

  const mainData = data[mainVersion];
  const hotData = data[hotVersion];

  const mergedVersion = {
    ...mainData,
  };

  // 合并属性
  for (const key in hotData) {
    if (!(key in mainData) || key.endsWith("(Hot)")) {
      mergedVersion[key] = hotData[key];
    }
  }

  mergedVersion["hotBuildTime"] = hotData["buildTime"];

  const startupKey = "hotStartup(serverStartTime + onLoadTime)";
  const hotStartupKey = "startup(serverStartTime + onLoadTime)";
  mergedVersion[startupKey] = hotData[hotStartupKey];

  delete data[mainVersion];
  delete data[hotVersion];

  data[mainVersion] = mergedVersion;
}

export function mergeAllVersions(data) {
  const versionArray = Object.keys(data);
  for (let i = 1; i < versionArray.length; i += 2) {
    const mainVersion = versionArray[i - 1];
    const hotVersion = versionArray[i];
    console.log(mainVersion, hotVersion);
    mergeVersions(data, mainVersion, hotVersion);
  }
}
