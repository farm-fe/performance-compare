import { Logger as DefaultLogger } from "@farmfe/core";
import { rmSync, statSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";

const logger = new DefaultLogger({name: "Benchmark"});
export async function getChartPic(data) {
  const browser = await puppeteer.launch({ headless: "new" });
  const chartTypes = ["full", "hmr", "startup", "build"];
  async function generateChartPage(chartData) {
    const page = await browser.newPage();
    await page.setContent(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Benchmark Chart</title>
          <script src="https://cdn.jsdelivr.net/npm/echarts"></script>
        </head>
        <body>
          <div id="myChart" style="width: 100%; height: 600px;"></div>

          <script>
            const finallyData = ${JSON.stringify(chartData)};
            const keys = Object.keys(finallyData);
            const values = keys.map(key => finallyData[key]);

            const chartContainer = document.getElementById("myChart");
            const myChart = echarts.init(chartContainer);
            const seriesData = Object.keys(values[0]).map((label, index) => ({
              name: label,
              type: 'bar',
              data: keys.map(key => finallyData[key][label]),
              itemStyle: {
                color: randomColor(),
              },
              label: {
                show: true,
                position: "right",
                textStyle: {
                  fontSize: 16,
                },
              },
            }));

            function randomColor() {
              return "rgba(" +
                Math.round(Math.random() * 255) +
                "," +
                Math.round(Math.random() * 255) +
                "," +
                Math.round(Math.random() * 255) +
                ",0.8)";
            }

            function renderChart() {
              const option = {
                grid: {
                  left: '3%',  
                  top: '5%',
                  bottom: '5%',
                  containLabel: true
                },
                xAxis: {
                  type: "value",
                },
                yAxis: {
                  type: "category",
                  data: keys,
                  axisLabel: {
                    interval: 0,
                    width: 250
                  },
                },
                legend: {
                  data: Object.keys(values[0]),
                },
                series: seriesData,
              };

              myChart.setOption(option);
            }

            renderChart();

            window.addEventListener('resize', function () {
              myChart.resize();
            });
          </script>
        </body>
      </html>
    `);

    return page;
  }

  for (const chartType of chartTypes) {
    const chartData = generateChartScript(data, chartType);
    const page = await generateChartPage(chartData);

    const logger = new DefaultLogger({name: "Benchmark"});
    logger.warn(
      `Ready to start taking screenshots of ${chartType}.png Chart...`
    );

    await new Promise((resolve) => setTimeout(() => resolve(true), 1000));
    await page.screenshot({ path: `${chartType}.png` });

    logger.info("Picture generated successfully！");
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

function generateChartScript(data, type) {
  let fData = [];
  switch (type) {
    case "full":
      fData = Object.keys(data).map((key) => ({
        [key]: {
          "startup(serverStartTime + onLoadTime)":
            data[key]["startup(serverStartTime + onLoadTime)"],
          rootHmr: data[key]["rootHmr"],
          leafHmr: data[key]["leafHmr"],
          buildTime: data[key]["buildTime"],
          hotBuildTime: data[key]["hotBuildTime"],
          "hotStartup(serverStartTime + onLoadTime)":
            data[key]["hotStartup(serverStartTime + onLoadTime)"],
        },
      }));
      break;
    case "hmr":
      fData = Object.keys(data).map((key) => ({
        [key]: {
          rootHmr: data[key]["rootHmr"],
          leafHmr: data[key]["leafHmr"],
        },
      }));
      break;

    case "startup":
      fData = Object.keys(data).map((key) => ({
        [key]: {
          "startup(serverStartTime + onLoadTime)":
            data[key]["startup(serverStartTime + onLoadTime)"],
          "hotStartup(serverStartTime + onLoadTime)":
            data[key]["hotStartup(serverStartTime + onLoadTime)"],
        },
      }));
      break;

    case "build":
      fData = Object.keys(data).map((key) => ({
        [key]: {
          buildTime: data[key]["buildTime"],
          hotBuildTime: data[key]["hotBuildTime"],
        },
      }));
      break;

    default:
      fData = [];
  }
  return fData.reduce((result, item) => {
    const key = Object.keys(item)[0];
    result[key] = item[key];
    return result;
  }, {});
}

export function randomColor() {
  return `rgba(${Math.round(Math.random() * 255)},${Math.round(
    Math.random() * 255
  )},${Math.round(Math.random() * 255)},0.8)`;
}
