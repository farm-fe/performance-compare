import { DefaultLogger } from "@farmfe/core";
import { rmSync, statSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";

const logger = new DefaultLogger();
export async function getChartPic(data) {
  const browser = await puppeteer.launch();
  const chartTypes = ["full", "hmr", "startup", "build"];
  for (const chartType of chartTypes) {
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
        const ctx = document.getElementById("myChart").getContext("2d");
        function randomColor() {
          return (
            "rgba(" +
            Math.round(Math.random() * 255) +
            "," +
            Math.round(Math.random() * 255) +
            "," +
            Math.round(Math.random() * 255) +
            ",0.8)"
          );
        }

        const data = {
          labels: ${JSON.stringify(Object.keys(data))},
          datasets: ${JSON.stringify(generateChartScript(data, chartType))},
        };

        const options = {
          responsive: true,
          indexAxis: 'y',
          // Elements options apply to all of the options unless overridden in a dataset
          // In this case, we are setting the border of each horizontal bar to be 2px wide
          elements: {
            bar: {
              borderWidth: 1,
            }
          },
          plugins: {
            legend: {
              position: "top",
            },
          },
        };
  
        new Chart(ctx, {
          type: "bar",
          data: data,
          options: options
        });
      </script>
    </body>
  </html>
  
  `);
    const logger = new DefaultLogger();
    logger.warn(
      `Ready to start taking screenshots of ${chartType}.png Chart...`
    );
    await new Promise((resolve) => setTimeout(() => resolve(true), 500));
    await page.screenshot({ path: `${chartType}.png` });
    logger.info("Picture generated successfully ！");
  }

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
    mergeVersions(data, mainVersion, hotVersion);
  }
}

function generateChartScript(data, chartType) {
  let datasets;

  switch (chartType) {
    case "hmr":
      datasets = [
        {
          label: "rootHmr",
          data: Object.values(data).map((item) => item.rootHmr),
          backgroundColor: randomColor(),
        },
        {
          label: "leafHmr",
          data: Object.values(data).map((item) => item.leafHmr),
          backgroundColor: randomColor(),
        },
      ];
      break;

    case "startup":
      datasets = [
        {
          label: "Cold Startup",
          data: Object.values(data).map(
            (item) => item["startup(serverStartTime + onLoadTime)"]
          ),
          backgroundColor: randomColor(),
        },
        {
          label: "Hot Cache Startup",
          data: Object.values(data).map(
            (item) => item["hotStartup(serverStartTime + onLoadTime)"]
          ),
          backgroundColor: randomColor(),
        },
      ];
      break;

    case "build":
      datasets = [
        {
          label: "Cold Build",
          data: Object.values(data).map((item) => item.buildTime),
          backgroundColor: randomColor(),
        },
        {
          label: "Hot Cache Build",
          data: Object.values(data).map((item) => item.hotBuildTime),
          backgroundColor: randomColor(),
        },
      ];
      break;

    default:
      // 'full' or unknown chart type
      datasets = [
        {
          label: "Cold Startup",
          data: Object.values(data).map(
            (item) => item["startup(serverStartTime + onLoadTime)"]
          ),
          backgroundColor: randomColor(),
        },
        {
          label: "Hot Cache Startup",
          data: Object.values(data).map(
            (item) => item["hotStartup(serverStartTime + onLoadTime)"]
          ),
          backgroundColor: randomColor(),
        },
        {
          label: "Cold Build",
          data: Object.values(data).map((item) => item.buildTime),
          backgroundColor: randomColor(),
        },
        {
          label: "Hot Cache Build",
          data: Object.values(data).map((item) => item.hotBuildTime),
          backgroundColor: randomColor(),
        },
        {
          label: "rootHmr",
          data: Object.values(data).map((item) => item.rootHmr),
          backgroundColor: randomColor(),
        },
        {
          label: "leafHmr",
          data: Object.values(data).map((item) => item.leafHmr),
          backgroundColor: randomColor(),
        },
      ];
  }
  return datasets;
}

export function randomColor() {
  return `rgba(${Math.round(Math.random() * 255)},${Math.round(
    Math.random() * 255
  )},${Math.round(Math.random() * 255)},0.8)`;
}
