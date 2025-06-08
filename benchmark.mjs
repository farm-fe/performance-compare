/**
 * 构建工具综合性能基准测试
 *
 * 使用方法:
 * 1. 在 defaultTools 数组中配置要测试的工具
 * 2. 通过注释/取消注释来选择测试工具
 * 3. 在 TEST_CONFIG 中配置测试类型
 * 4. 运行 pnpm benchmark
 *
 * 测试类型:
 * 1. 性能基准测试: 测试启动时间、HMR响应、构建速度
 * 2. 监控内存测试: 测试实际构建工具子进程在长时间运行中的 RSS 内存
 *
 * 快速配置示例:
 * - 仅性能测试: RUN_PERFORMANCE_TESTS=true, RUN_MEMORY_TESTS=false
 * - 仅内存测试: RUN_PERFORMANCE_TESTS=false, RUN_MEMORY_TESTS=true
 * - 同时测试: RUN_PERFORMANCE_TESTS=true, RUN_MEMORY_TESTS=true
 *
 * 配置参数:
 * - RUN_PERFORMANCE_TESTS: 启用/禁用性能基准测试
 * - RUN_MEMORY_TESTS: 启用/禁用监控内存测试
 * - PERFORMANCE_ROUNDS: 性能测试轮数
 * - MEMORY_WATCH_CYCLES: 内存测试中的文件修改次数
 * - DEBUG_MODE: 调试模式，显示详细输出
 *
 * 支持的工具:
 * - rspack: Rspack 构建工具
 * - rsbuild: Rsbuild 构建工具
 * - vite: Vite 开发工具
 * - rolldown-vite: Rolldown（基于Vite）
 * - webpack: Webpack 构建工具
 * - farm: Farm 构建工具
 *
 */

import { spawn, exec } from 'child_process';
import {
  appendFile,
  appendFileSync,
  readFileSync,
  writeFileSync,
  existsSync,
  unlinkSync,
} from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import kill from 'tree-kill';
import {
  Logger as DefaultLogger,
  magenta,
  purple,
  green,
  yellow,
  cyan,
  bold,
  dim,
} from '@farmfe/core';
import {
  deleteCacheFiles,
  mergeAllVersions,
  getChartPic,
  normalizeChartData,
} from './utils.mjs';
import stripAnsi from 'strip-ansi';

const startConsole = "console.log('Start Time', Date.now());";
const logger = new DefaultLogger({ name: 'Benchmark' });

const defaultTools = [
  'farm',
  'rspack',
  'rsbuild',
  'vite',
  // 'rolldown-vite',
  'webpack',
];

const TEST_CONFIG = {
  RUN_PERFORMANCE_TESTS: true,
  RUN_MEMORY_TESTS: true,
  PERFORMANCE_ROUNDS: 10,
  MEMORY_WATCH_CYCLES: 100,
  MEMORY_SAMPLE_INTERVAL: 100,
  MEMORY_CYCLE_DELAY: 1000,
  DEBUG_MODE: false,
};

const UNIVERSAL_TIME_REGEX = /\bin\s+(\d+(?:\.\d+)?)\s*(m?s)\b/i;
function highlightTime(timeMs, showUnit = true) {
  if (timeMs === undefined || timeMs === null || timeMs < 0) return dim('N/A');

  const time =
    timeMs >= 1000
      ? `${(timeMs / 1000).toFixed(2)}s`
      : `${Math.round(timeMs)}ms`;
  return showUnit ? bold(yellow(time)) : bold(yellow(Math.round(timeMs)));
}

function highlightMemory(memoryBytes, allowNegative = false) {
  if (memoryBytes === null || memoryBytes === undefined) return dim('N/A');
  if (!allowNegative && memoryBytes <= 0) return dim('N/A');

  const memoryMB = Math.abs(memoryBytes / 1024 / 1024).toFixed(2);
  const sign = memoryBytes >= 0 ? '+' : '-';
  const color = memoryBytes >= 0 ? cyan : yellow;

  return bold(color(`${allowNegative ? sign : ''}${memoryMB}MB`));
}

function highlightPercent(percent) {
  if (percent > 20) {
    return bold(yellow(`${percent.toFixed(1)}%`));
  } else if (percent > 10) {
    return bold(yellow(`${percent.toFixed(1)}%`));
  } else {
    return bold(green(`${percent.toFixed(1)}%`));
  }
}

function extractTimeFromOutput(output, regexPatterns, toolName) {
  const universalMatch = UNIVERSAL_TIME_REGEX.exec(output);
  if (universalMatch) {
    if (TEST_CONFIG.DEBUG_MODE) {
      logger.info(
        `🎯 ${toolName} universal match success: ${universalMatch[0]}`,
        {
          name: 'Debug',
        }
      );
    }

    let result = parseFloat(universalMatch[1]);
    const unit = universalMatch[2] || 'ms';
    const timeInMs = unit === 's' ? result * 1000 : result;

    return timeInMs;
  }

  if (regexPatterns) {
    const patterns = Array.isArray(regexPatterns)
      ? regexPatterns
      : [regexPatterns];

    for (let i = 0; i < patterns.length; i++) {
      const match = patterns[i].exec(output);
      if (match) {
        if (TEST_CONFIG.DEBUG_MODE) {
          logger.info(
            `🎯 ${toolName} specific match success (pattern ${i + 1}/${
              patterns.length
            }): ${match[0]}`,
            {
              name: 'Debug',
            }
          );
        }

        let result = parseFloat(match[1]);
        const unit = match[2] || 'ms';
        const timeInMs = unit === 's' ? result * 1000 : result;

        return timeInMs;
      }
    }
  }

  if (TEST_CONFIG.DEBUG_MODE) {
    logger.warn(`❌ ${toolName} no time match found`, { name: 'Debug' });
    logger.info(`Output content: ${output.slice(0, 200)}...`, {
      name: 'Debug',
    });
  }

  return null;
}

function getPackageVersion(packageName) {
  try {
    const packageJsonPath = path.join(
      process.cwd(),
      'node_modules',
      packageName,
      'package.json'
    );
    if (!existsSync(packageJsonPath)) {
      return null;
    }
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    return packageJson.version;
  } catch (error) {
    return null;
  }
}

function isToolAvailable(toolConfig) {
  try {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    if (!existsSync(packageJsonPath)) {
      return false;
    }

    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    const scripts = packageJson.scripts || {};

    if (!scripts[toolConfig.script] || !scripts[toolConfig.buildScript]) {
      return false;
    }

    if (toolConfig.packageName && !getPackageVersion(toolConfig.packageName)) {
      return false;
    }

    if (toolConfig.binFilePath) {
      const binPath = path.join(
        process.cwd(),
        'node_modules',
        toolConfig.binFilePath
      );
      if (!existsSync(binPath)) {
        return false;
      }
    }

    return true;
  } catch (error) {
    return false;
  }
}

async function findBuildToolProcessByTitle(processTitle, pid) {
  if (!processTitle) {
    return null;
  }

  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      exec(
        `tasklist /FI "WINDOWTITLE eq ${processTitle}" /FO CSV`,
        (error, stdout) => {
          if (error) {
            if (TEST_CONFIG.DEBUG_MODE) {
              logger.Error(
                `⚠️ Error finding process by title '${processTitle}': ${error.message}`
              );
            }
            resolve(null);
            return;
          }

          try {
            const lines = stdout.split('\n').filter((line) => line.trim());
            if (lines.length > 1) {
              const processLine = lines[1];
              const parts = processLine.split(',');
              if (parts.length >= 2) {
                const pid = parseInt(parts[1].replace(/"/g, ''));
                if (pid && !isNaN(pid)) {
                  if (TEST_CONFIG.DEBUG_MODE) {
                    logger.info(
                      `🪟 Found process by title '${processTitle}': PID ${pid}`
                    );
                  }
                  resolve(pid);
                  return;
                }
              }
            }
            resolve(null);
          } catch (err) {
            if (TEST_CONFIG.DEBUG_MODE) {
              logger.error(`⚠️ Error parsing process list: ${err.message}`);
            }
            resolve(null);
          }
        }
      );
    } else {
            exec(`pgrep -f "${processTitle}"`, (error, stdout) => {
        if (error) {
          if (TEST_CONFIG.DEBUG_MODE) {
            logger.error(
              `⚠️ Process '${processTitle}' not found with pgrep: ${error.message}`
            );
          }
          resolve(null);
          return;
        }
        
        try {
          const allPids = stdout.trim().split('\n')
            .filter(line => line.trim())
            .map(line => parseInt(line.trim()))
            .filter(p => !isNaN(p));
          
          if (TEST_CONFIG.DEBUG_MODE) {
            logger.info(`🔍 Found ${allPids.length} processes matching '${processTitle}': [${allPids.join(', ')}]`);
          }
          
          if (allPids.length === 0) {
            resolve(null);
            return;
          }
          
          // 检查每个进程的父进程是否是npm PID
          let foundCount = 0;
          let targetPid = null;
          
          for (const candidatePid of allPids) {
            exec(`ps -o ppid= -p ${candidatePid}`, (psError, psOutput) => {
              foundCount++;
              
              if (!psError && psOutput.trim()) {
                const parentPid = parseInt(psOutput.trim());
                
                if (TEST_CONFIG.DEBUG_MODE) {
                  logger.info(`🔍 Process ${candidatePid} parent PID: ${parentPid} (npm PID: ${pid})`);
                }
                
                if (parentPid === pid) {
                  targetPid = candidatePid;
                  if (TEST_CONFIG.DEBUG_MODE) {
                    logger.info(`🐧 Found target process '${processTitle}': PID ${candidatePid} (child of npm PID ${pid})`);
                  }
                }
              }
              
              // 所有检查完成后返回结果
              if (foundCount === allPids.length) {
                resolve(targetPid);
              }
            });
          }
        } catch (err) {
          if (TEST_CONFIG.DEBUG_MODE) {
            logger.error(`⚠️ Error parsing PIDs: ${err.message}`);
          }
          resolve(null);
        }
      });
    }
  });
}

async function getProcessMemory(pid) {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      exec(`tasklist /FI "PID eq ${pid}" /FO CSV`, (error, stdout) => {
        if (error) {
          if (TEST_CONFIG.DEBUG_MODE) {
            logger.error(
              `⚠️ Error getting memory for PID ${pid}: ${error.message}`
            );
          }
          resolve(0);
          return;
        }
        try {
          const lines = stdout.split('\n');
          if (lines.length > 1) {
            const memoryStr = lines[1].split(',')[4].replace(/[^0-9]/g, '');
            const memoryBytes = parseInt(memoryStr) * 1024;
            if (TEST_CONFIG.DEBUG_MODE) {
              logger.info(`🪟 Windows PID ${pid} memory: ${memoryBytes} bytes`);
            }
            resolve(memoryBytes);
          } else {
            resolve(0);
          }
        } catch (err) {
          if (TEST_CONFIG.DEBUG_MODE) {
            logger.error(
              `⚠️ Error parsing memory for PID ${pid}: ${err.message}`
            );
          }
          resolve(0);
        }
      });
    } else {
      exec(`ps -o pid,rss,comm -p ${pid}`, (error, stdout) => {
        if (error) {
          if (TEST_CONFIG.DEBUG_MODE) {
            logger.error(
              `⚠️ Error getting RSS for PID ${pid}: ${error.message}`
            );
          }
          resolve(0);
          return;
        }
        try {
          const lines = stdout.trim().split('\n');
          if (lines.length > 1) {
            const parts = lines[1].trim().split(/\s+/);
            const rssKB = parseInt(parts[1]);
            const command = parts[2];
            const memoryBytes = rssKB * 1024;

            resolve(memoryBytes);
          } else {
            if (TEST_CONFIG.DEBUG_MODE) {
              logger.error(`⚠️ No process found for PID ${pid}`);
            }
            resolve(0);
          }
        } catch (err) {
          if (TEST_CONFIG.DEBUG_MODE) {
            logger.error(`⚠️ Error parsing RSS for PID ${pid}: ${err.message}`);
          }
          resolve(0);
        }
      });
    }
  });
}

class MemoryMonitor {
  constructor(pid, name, customInterval = 1000) {
    this.pid = pid;
    this.name = name;
    this.samples = [];
    this.timestamps = [];
    this.interval = null;
    this.customInterval = customInterval;
    this.startTime = null;
    this.maxMemory = 0;
    this.minMemory = Infinity;
    this.initialMemory = 0;
  }

  start() {
    this.samples = [];
    this.timestamps = [];
    this.maxMemory = 0;
    this.minMemory = Infinity;
    this.startTime = Date.now();

    this.interval = setInterval(async () => {
      try {
        const memory = await getProcessMemory(this.pid);

        if (memory > 0) {
          this.samples.push(memory);
          this.timestamps.push(Date.now() - this.startTime);

          this.maxMemory = Math.max(this.maxMemory, memory);
          this.minMemory = Math.min(this.minMemory, memory);

          if (this.initialMemory === 0) {
            this.initialMemory = memory;
          }
        }
      } catch (error) {
        if (TEST_CONFIG.DEBUG_MODE) {
          logger.error(
            `⚠️ Memory monitoring error for PID ${this.pid}: ${error.message}`
          );
        }
      }
    }, this.customInterval);
  }

  async stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    try {
      const finalMem = await getProcessMemory(this.pid);
      if (finalMem > 0 && this.samples.length > 0) {
        this.samples.push(finalMem);
        this.timestamps.push(Date.now() - this.startTime);
      }
    } catch (error) {
      if (TEST_CONFIG.DEBUG_MODE) {
        logger.error(
          `⚠️ Error getting final memory for PID ${this.pid}: ${error.message}`,
          { name: 'Debug' }
        );
      }
    }

    const stats = this.getDetailedStats();

    if (TEST_CONFIG.DEBUG_MODE) {
      logger.info(
        `📊 ${this.name} RSS monitoring stats (PID ${
          this.pid
        }): peak=${highlightMemory(stats.maxMemory)}, avg=${highlightMemory(
          stats.avgMemory
        )}, growth=${highlightMemory(stats.memoryGrowth)}`,
        {
          name: 'Memory',
        }
      );
    }

    return stats;
  }

  getDetailedStats() {
    if (this.samples.length === 0) {
      return {
        maxMemory: 0,
        avgMemory: 0,
        minMemory: 0,
        initialMemory: 0,
        finalMemory: 0,
        memoryGrowth: 0,
        memoryTrend: 'stable',
        samples: 0,
        duration: 0,
      };
    }

    const avgMemory =
      this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    const finalMemory = this.samples[this.samples.length - 1];
    const memoryGrowth = finalMemory - this.initialMemory;

    let memoryTrend = 'stable';
    if (memoryGrowth > this.initialMemory * 0.2) {
      memoryTrend = 'increasing';
    } else if (memoryGrowth < -this.initialMemory * 0.1) {
      memoryTrend = 'decreasing';
    }

    return {
      maxMemory: this.maxMemory,
      avgMemory: avgMemory,
      minMemory: this.minMemory === Infinity ? 0 : this.minMemory,
      initialMemory: this.initialMemory,
      finalMemory: finalMemory,
      memoryGrowth: memoryGrowth,
      memoryTrend: memoryTrend,
      samples: this.samples.length,
      duration:
        this.timestamps.length > 0
          ? this.timestamps[this.timestamps.length - 1]
          : 0,
    };
  }

  getMemoryHistory() {
    return this.samples.map((memory, index) => ({
      timestamp: this.timestamps[index],
      memory: memory,
      memoryMB: Math.round(memory / 1024 / 1024),
    }));
  }
}

const TOOL_CONFIGS = {
  farm: {
    name: 'Farm',
    packageName: '@farmfe/core',
    script: 'start:farm',
    buildScript: 'build:farm',
    binFilePath: '@farmfe/cli/bin/farm.mjs',
    port: 9000,
    color: purple,
  },
  rsbuild: {
    name: 'Rsbuild',
    packageName: '@rsbuild/core',
    script: 'start:rsbuild',
    buildScript: 'build:rsbuild',
    binFilePath: '@rsbuild/core/bin/rsbuild.js',
    port: 6532,
    color: green,
  },
  rspack: {
    name: 'Rspack',
    packageName: '@rspack/core',
    script: 'start:rspack',
    buildScript: 'build:rspack',
    binFilePath: '@rspack/cli/bin/rspack.js',
    port: 8080,
    color: yellow,
  },
  vite: {
    name: 'Vite',
    packageName: 'vite',
    script: 'start:vite',
    buildScript: 'build:vite',
    binFilePath: 'vite/bin/vite.js',
    port: 5173,
    color: magenta,
  },
  'rolldown-vite': {
    name: 'Rolldown (Vite)',
    packageName: 'rolldown-vite',
    script: 'start:rolldown-vite',
    buildScript: 'build:rolldown-vite',
    binFilePath: 'rolldown-vite/bin/vite.js',
    port: 5174,
    color: cyan,
  },
  webpack: {
    name: 'Webpack',
    packageName: 'webpack',
    script: 'start:webpack',
    buildScript: 'build:webpack',
    binFilePath: 'webpack-cli/bin/cli.js',
    port: 8082,
    color: cyan,
  },
};

function detectAvailableTools() {
  const availableTools = [];

  for (const toolKey of defaultTools) {
    const config = TOOL_CONFIGS[toolKey];

    if (!config) {
      logger.warn(`❌ Unknown tool: ${bold(toolKey)} (not found in config)`, {
        name: 'Detection',
        brandColor: yellow,
      });
      continue;
    }

    if (isToolAvailable(config)) {
      const version = getPackageVersion(config.packageName);
      const toolName = version ? `${config.name} ${dim(version)}` : config.name;

      availableTools.push({
        ...config,
        key: toolKey,
        fullName: toolName,
        version: version,
      });

      logger.info(`✅ ${bold(toolName)}`, {
        name: 'Detection',
        brandColor: config.color,
      });
    } else {
      logger.warn(`❌ ${bold(config.name)}`, {
        name: 'Detection',
        brandColor: config.color,
      });
    }
  }

  if (availableTools.length === 0) {
    logger.error('❌ No available build tools detected!');
    logger.info(
      '💡 Please check defaultTools configuration or install required dependencies'
    );
    process.exit(1);
  }

  return availableTools;
}

function createBrandColorMap(tools) {
  const brandColor = new Map();

  for (const tool of tools) {
    brandColor.set(tool.fullName, tool.color);
    brandColor.set(`${tool.fullName} (Hot)`, tool.color);
  }

  return brandColor;
}

class BuildTool {
  constructor(config, brandColor) {
    this.name = config.fullName;
    this.originalName = config.name;
    this.port = config.port;
    this.script = config.script;
    this.buildScript = config.buildScript;
    this.binFilePath = config.binFilePath;
    this.version = config.version;
    this.skipHmr = false;
    this.brandColor = brandColor;
    this.child = null;
    this.memoryMonitor = null;
    this.buildToolPid = null;
    this.processTitle = null;

    if (this.binFilePath) {
      this.fullBinPath = path.join(
        process.cwd(),
        'node_modules',
        this.binFilePath
      );
      this.hackBinFile();
    }
  }

  hackBinFile() {
    try {
      if (!existsSync(this.fullBinPath)) {
        logger.warn(`⚠️ Executable not found: ${this.fullBinPath}`);
        return;
      }

      const binFileContent = readFileSync(this.fullBinPath, 'utf-8');

      // 检查是否已有 process.title 设置
      const existingTitleMatch = binFileContent.match(
        /process\.title\s*=\s*['"](.*?)['"]/
      );
      let processTitle;
      let processMarker;

      if (existingTitleMatch) {
        // 使用现有的 process.title
        processTitle = existingTitleMatch[1];
        processMarker = null; // 不需要注入新的
      } else {
        console.log(this.name);
        if (this.name.includes('Rsbuild')) {
          processTitle = 'rsbuild-node';
          processMarker = null;
        } else {
          // 注入新的 process.title
          processTitle = `benchmark-${this.originalName.toLowerCase()}`;
          processMarker = `process.title = '${processTitle}';`;
        }
      }

      let modified = false;
      let newContent = binFileContent;

      if (!binFileContent.includes(startConsole)) {
        const lines = newContent.split('\n');
        lines.splice(1, 0, startConsole);
        newContent = lines.join('\n');
        modified = true;
      }

      if (processMarker && !binFileContent.includes(processMarker)) {
        const lines = newContent.split('\n');
        lines.splice(1, 0, processMarker);
        newContent = lines.join('\n');
        modified = true;
      }

      if (modified) {
        writeFileSync(this.fullBinPath, newContent);
        if (processMarker) {
          logger.info(
            `🔧 Injected process marker '${processTitle}' into ${bold(
              this.name
            )}`,
            {
              name: this.name,
              brandColor: this.brandColor.get(this.name),
            }
          );
        } else {
          logger.info(`🔧 Injected start console into ${bold(this.name)}`, {
            name: this.name,
            brandColor: this.brandColor.get(this.name),
          });
        }
      }

      this.processTitle = processTitle;
    } catch (error) {
      logger.warn(`⚠️ Cannot modify executable: ${error.message}`);
      this.processTitle = null;
    }
  }

  async startServer() {
    return new Promise((resolve, reject) => {
      logger.info(`   • 🚀 Starting dev server`, {
        name: this.name,
        brandColor: this.brandColor.get(this.name),
      });

      const child = spawn('npm', ['run', this.script], {
        stdio: 'pipe',
        shell: true,
        env: { ...process.env, FORCE_COLOR: '0' },
      });

      this.child = child;
      this.buildToolPid = null;

      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.cleanup();
          reject(new Error(`startup timeout`));
        }
      }, 12000);

      child.stdout.on('data', (data) => {
        if (resolved) return;

        const output = stripAnsi(data.toString('utf8'));

        if (TEST_CONFIG.DEBUG_MODE) {
          logger.info(`📤 output: ${output.trim()}`, { name: 'Debug' });
        }

        const timeInMs = extractTimeFromOutput(output, null, this.name);

        if (timeInMs !== null) {
          resolved = true;
          clearTimeout(timeout);

          logger.info(`   • ✅ dev server ready in ${highlightTime(timeInMs)}`, {
            name: this.name,
            brandColor: this.brandColor.get(this.name),
          });

          // 对于内存测试，延迟查找构建工具进程PID（仅在内存测试时需要）
          // HMR 测试不需要此功能，保持简洁

          resolve(timeInMs);
        }
      });

      child.stderr.on('data', (data) => {
        const errorOutput = stripAnsi(data.toString());
        if (errorOutput.includes('EADDRINUSE')) {
          logger.warn(`⚠️ ${this.name} port ${this.port} is in use`);
        }
      });

      child.on('error', (error) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          this.cleanup();
          reject(error);
        }
      });

      child.on('exit', (code) => {
        if (!resolved && code !== 0 && code !== null) {
          resolved = true;
          clearTimeout(timeout);
          this.cleanup();
          reject(new Error(`${this.name} process exited with code: ${code}`));
        }
      });
    });
  }

  cleanup() {
    if (this.memoryMonitor) {
      this.memoryMonitor.stop();
      this.memoryMonitor = null;
    }

    if (this.child) {
      try {
        this.child.stdin.pause();
        this.child.stdout.destroy();
        this.child.stderr.destroy();
        kill(this.child.pid);
        this.child = null;
      } catch (error) {}
    }

    this.buildToolPid = null;
  }

  async stopServer() {
    logger.info(`   • 🛑 Stopping ${bold(this.name)} dev server...`, {
      name: this.name,
      brandColor: this.brandColor.get(this.name),
    });

    this.cleanup();
  }

  async build() {
    return new Promise((resolve, reject) => {
      logger.info(
        `   • 🔨 Running ${bold(this.name)} build: ${dim(this.buildScript)}`,
        {
          name: this.name,
          brandColor: this.brandColor.get(this.name),
        }
      );

      const child = spawn('npm', ['run', this.buildScript], {
        stdio: 'pipe',
        shell: true,
        env: { ...process.env, FORCE_COLOR: '0' },
      });

      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          kill(child.pid);
          reject(new Error(`${this.name} build timeout`));
        }
      }, 10000);

      child.stdout.on('data', (data) => {
        if (resolved) return;

        const output = stripAnsi(data.toString('utf8'));

        if (TEST_CONFIG.DEBUG_MODE) {
          logger.info(`   • 🔨 ${this.name} build output: ${output.trim()}`, {
            name: 'Debug',
          });
        }

        const timeInMs = extractTimeFromOutput(output, null, this.name);

        if (timeInMs !== null) {
          resolved = true;
          clearTimeout(timeout);

          logger.info(
            `   • ✅ ${bold(this.name)} build completed in ${highlightTime(
              timeInMs
            )}`,
            {
              name: this.name,
              brandColor: this.brandColor.get(this.name),
            }
          );

          resolve(timeInMs);
        }
      });

      child.on('exit', (code) => {
        if (!resolved) {
          if (code === 0) {
            resolved = true;
            clearTimeout(timeout);
            logger.warn(
              `   • ⚠️ ${this.name} build completed but no timing detected`
            );
            resolve(0);
          } else {
            resolved = true;
            clearTimeout(timeout);
            reject(new Error(`${this.name} build failed with code: ${code}`));
          }
        }
      });

      child.on('error', (error) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          reject(error);
        }
      });
    });
  }
}

async function testWatchMemory(buildTool) {
  console.log('\n');
  logger.info(
    `🧪 ${bold(
      buildTool.name
    )} (${bold(
      TEST_CONFIG.MEMORY_WATCH_CYCLES
    )} modifications)...`,
    {
      name: buildTool.name,
      brandColor: buildTool.brandColor.get(buildTool.name),
    }
  );

  // 在函数级别定义文件路径和内容，确保finally块能访问
  const rootFile = path.resolve('src', 'comps', 'triangle.jsx');
  const leafFile = path.resolve('src', 'comps', 'triangle_1_1_2_1_2_2_1.jsx');
  let originalRootContent = null;
  let originalLeafContent = null;

  return new Promise(async (resolve, reject) => {
    try {
      const serverStartTime = await buildTool.startServer();

      // 内存测试需要查找实际的构建工具进程，等待服务器稳定后查找
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // 查找构建工具进程 PID
      let foundBuildToolPid = null;
      if (buildTool.processTitle && buildTool.processTitle !== 'null') {
        foundBuildToolPid = await findBuildToolProcessByTitle(
          buildTool.processTitle,
          buildTool.child.pid
        );
      }

      if (foundBuildToolPid) {
        buildTool.buildToolPid = foundBuildToolPid;
        buildTool.memoryMonitor = new MemoryMonitor(
          foundBuildToolPid,
          `${buildTool.name} Build Tool (PID: ${foundBuildToolPid})`,
          TEST_CONFIG.MEMORY_SAMPLE_INTERVAL
        );
        buildTool.memoryMonitor.start();

        logger.info(
          `   • 🎯 '${buildTool.processTitle}' PID: ${foundBuildToolPid}`,
          {
            name: buildTool.name,
            brandColor: buildTool.brandColor.get(buildTool.name),
          }
        );
      } else {
        logger.warn(
          `⚠️ Could not find build tool process '${buildTool.processTitle}' for ${buildTool.name}, falling back to npm process PID: ${buildTool.child.pid}`,
          {
            name: buildTool.name,
            brandColor: buildTool.brandColor.get(buildTool.name),
          }
        );
        buildTool.buildToolPid = buildTool.child.pid;
        buildTool.memoryMonitor = new MemoryMonitor(
          buildTool.child.pid,
          `${buildTool.name} NPM Process (PID: ${buildTool.child.pid})`,
          TEST_CONFIG.MEMORY_SAMPLE_INTERVAL
        );
        buildTool.memoryMonitor.start();
      }

      const memoryMonitor = buildTool.memoryMonitor;

      const buildToolPid = buildTool.buildToolPid;
      const initialMemory = await getProcessMemory(buildToolPid);
      logger.info(
        `   • 📊 Initial RSS: ${highlightMemory(
          initialMemory
        )}`,
        {
          name: buildTool.name,
          brandColor: buildTool.brandColor.get(buildTool.name),
        }
      );

      if (TEST_CONFIG.DEBUG_MODE) {
        logger.info(
          `🔧 Monitoring actual build tool process PID: ${buildToolPid} every ${TEST_CONFIG.MEMORY_SAMPLE_INTERVAL}ms`,
          {
            name: buildTool.name,
            brandColor: buildTool.brandColor.get(buildTool.name),
          }
        );
      }

      // 读取原始文件内容
      originalRootContent = readFileSync(rootFile, 'utf-8');
      originalLeafContent = readFileSync(leafFile, 'utf-8');

      for (let i = 0; i < TEST_CONFIG.MEMORY_WATCH_CYCLES; i++) {
        const isRootModification = i % 2 === 0;
        const targetFile = isRootModification ? rootFile : leafFile;
        const fileType = isRootModification ? 'root' : 'leaf';

        appendFileSync(
          targetFile,
          `\nconsole.log('memory test cycle ${
            i + 1
          } - ${fileType}', Date.now());\n`
        );

        if ((i + 1) % 5 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 1000));

          const currentMemory = await getProcessMemory(buildToolPid);
          const memoryIncrease = currentMemory - initialMemory;

          if (TEST_CONFIG.DEBUG_MODE) {
            logger.info(
              `🔍 Actual build tool process PID ${buildToolPid} current RSS: ${highlightMemory(
                currentMemory
              )}`,
              {
                name: buildTool.name,
                brandColor: buildTool.brandColor.get(buildTool.name),
              }
            );
          }

          const target = (i - 4) % 2 === 0 ? 'Root' : 'Leaf';
          logger.info(
            `   • 📈 Cycle ${bold(
              i + 1
            )} (${target}) -  RSS: ${highlightMemory(
              currentMemory
            )} (${highlightMemory(
              memoryIncrease,
              true
            )})`,
            {
              name: buildTool.name,
              brandColor: buildTool.brandColor.get(buildTool.name),
            }
          );
        }

        await new Promise((resolve) =>
          setTimeout(resolve, TEST_CONFIG.MEMORY_CYCLE_DELAY)
        );
      }

      // 操作完成后的即时内存
      const operationCompleteMemory = await getProcessMemory(buildToolPid);

      logger.info(
        `   • 📊 Operations completed, waiting 5s for GC and leak detection...`,
        {
          name: buildTool.name,
          brandColor: buildTool.brandColor.get(buildTool.name),
        }
      );

      // 静置等待5秒，观察内存变化
      await new Promise((resolve) => setTimeout(resolve, 5000));

      const finalMemory = await getProcessMemory(buildToolPid);

      // 计算静置期间的内存变化
      const leakageAmount = finalMemory - operationCompleteMemory;

      // 内存测试需要手动停止监控并获取统计
      const memoryStats = buildTool.memoryMonitor
        ? await buildTool.memoryMonitor.stop()
        : null;
      await buildTool.stopServer();

      const finalStats = memoryStats || {};

      const memoryAnalysis = {
        initialMemory: initialMemory,
        operationCompleteMemory: operationCompleteMemory,
        finalMemory: finalMemory,
        totalGrowth: finalMemory - initialMemory,
        operationGrowth: operationCompleteMemory - initialMemory,
        leakageAmount: leakageAmount,
        growthPercentage: ((finalMemory - initialMemory) / initialMemory) * 100,
        maxMemory: finalStats.maxMemory,
        avgMemory: finalStats.avgMemory,
        memoryTrend: finalStats.memoryTrend,
        cyclesCompleted: TEST_CONFIG.MEMORY_WATCH_CYCLES,
        memoryPerCycle:
          (finalMemory - initialMemory) / TEST_CONFIG.MEMORY_WATCH_CYCLES,
        testDuration: finalStats.duration,
      };

      logger.info(
        `   • ✅ ${bold(
          buildTool.name
        )} RSS memory test completed`,
        {
          name: buildTool.name,
          brandColor: buildTool.brandColor.get(buildTool.name),
        }
      );

      logger.info(
        `📊 Operation Growth: ${highlightMemory(
          memoryAnalysis.operationGrowth,
          true
        )} → Final Growth: ${highlightMemory(
          memoryAnalysis.totalGrowth,
          true
        )} (${highlightPercent(memoryAnalysis.growthPercentage)})`,
        {
          name: buildTool.name,
          brandColor: buildTool.brandColor.get(buildTool.name),
        }
      );

      logger.info(
        `📈 Growth per cycle: ${bold(
          cyan((memoryAnalysis.memoryPerCycle / 1024).toFixed(2) + 'KB')
        )}`,
        {
          name: buildTool.name,
          brandColor: buildTool.brandColor.get(buildTool.name),
        }
      );

      logger.info(
        `🏔️ Peak actual build tool RSS: ${highlightMemory(
          memoryAnalysis.maxMemory
        )}`,
        {
          name: buildTool.name,
          brandColor: buildTool.brandColor.get(buildTool.name),
        }
      );

      resolve(memoryAnalysis);
    } catch (error) {
      logger.error(
        `   • ❌ ${bold(buildTool.name)} actual build tool RSS memory test failed: ${
          error.message
        }`,
        {
          name: buildTool.name,
          brandColor: buildTool.brandColor.get(buildTool.name),
        }
      );

      await buildTool.stopServer();
      reject(error);
    } finally {
      try {
        // 恢复文件到原始状态，只有当原始内容存在时才恢复
        if (originalRootContent !== null && originalLeafContent !== null) {
          writeFileSync(rootFile, originalRootContent);
          writeFileSync(leafFile, originalLeafContent);
          if (TEST_CONFIG.DEBUG_MODE) {
            logger.info(`🧹 Memory test files restored to original state`, {
              name: buildTool.name,
              brandColor: buildTool.brandColor.get(buildTool.name),
            });
          }
        } else if (TEST_CONFIG.DEBUG_MODE) {
          logger.warn(
            `⚠️ Original file content not available, skipping file restoration for ${buildTool.name}`,
            {
              name: buildTool.name,
              brandColor: buildTool.brandColor.get(buildTool.name),
            }
          );
        }
      } catch (restoreError) {
        logger.error(
          `❌ Failed to restore memory test files: ${restoreError.message}`,
          {
            name: buildTool.name,
            brandColor: buildTool.brandColor.get(buildTool.name),
          }
        );
      }
    }
  });
}

async function testHMR(buildTool, page, results) {
  const rootFile = path.resolve('src', 'comps', 'triangle.jsx');
  const leafFile = path.resolve('src', 'comps', 'triangle_1_1_2_1_2_2_1.jsx');

  const originalRootFileContent = readFileSync(rootFile, 'utf-8');
  const originalLeafFileContent = readFileSync(leafFile, 'utf-8');

  let waitResolve = null;
  const waitPromise = new Promise((resolve) => {
    waitResolve = resolve;
  });

  let hmrRootStart = -1;
  let hmrLeafStart = -1;

  return new Promise(async (resolve) => {
    const isFinished = () => {
      return (
        results[buildTool.name]?.rootHmr !== undefined &&
        results[buildTool.name]?.leafHmr !== undefined
      );
    };

    const handleConsole = (event) => {
      const text = event.text();

      // 确保结果对象存在
      if (!results[buildTool.name]) {
        results[buildTool.name] = {};
      }

      if (text.includes('root hmr')) {
        const match = /(\d+)/.exec(text);
        if (!match) {
          logger.warn(`   • ❌ Failed to match root HMR time from: ${text}`);
          return;
        }

        const clientDateNow = Number(match[1]);
        const hmrTime = clientDateNow - hmrRootStart;

        results[buildTool.name].rootHmr = hmrTime;
        logger.info(`   • 🔥 Root HMR: ${highlightTime(hmrTime)}`);

        if (isFinished()) {
          // page.off('console', handleConsole);
          waitResolve();
        }
      } else if (text.includes('leaf hmr')) {
        const match = /(\d+)/.exec(text);
        if (!match) {
          logger.warn(`   • ❌ Failed to match leaf HMR time from: ${text}`);
          return;
        }

        const clientDateNow = Number(match[1]);
        const hmrTime = clientDateNow - hmrLeafStart;
        logger.info(`   • 🍃 Leaf HMR: ${highlightTime(hmrTime)}`);

        results[buildTool.name].leafHmr = hmrTime;

        if (isFinished()) {
          page.off('console', handleConsole);
          waitResolve();
        }
      }
    };

    // 设置监听器
    page.on('console', handleConsole);

    // 超时保护
    const timeout = setTimeout(() => {
      // page.off('console', handleConsole);
      logger.warn(`   • ⏰ HMR timeout reached for ${buildTool.name} (10s)`);

      // 确保结果对象存在
      if (!results[buildTool.name]) {
        results[buildTool.name] = {};
      }

      if (!results[buildTool.name].rootHmr) {
        results[buildTool.name].rootHmr = -1;
        logger.error(`   • ❌ Root HMR failed for ${buildTool.name}`);
      }
      if (!results[buildTool.name].leafHmr) {
        results[buildTool.name].leafHmr = -1;
        logger.error(`   • ❌ Leaf HMR failed for ${buildTool.name}`);
      }

      logger.info(`   • 🚫 Continuing to next phase for ${buildTool.name}...`);
      waitResolve();
    }, 10000);

    try {
      // HMR 测试前等待 1 秒确保页面稳定
      await new Promise((resolve) => setTimeout(resolve, 1000));
      appendFile(
        rootFile,
        `\nconsole.log('root hmr', Date.now());\n`,
        (err) => {
          if (err) {
            logger.error(`   • ❌ Failed to modify root file: ${err.message}`);
            return;
          }
          hmrRootStart = Date.now();
        }
      );

      // Root 和 Leaf HMR 之间等待 1 秒
      await new Promise((resolve) => setTimeout(resolve, 1000));
      appendFile(
        leafFile,
        `\nconsole.log('leaf hmr', Date.now());\n`,
        (err) => {
          if (err) {
            logger.error(`   • ❌ Failed to modify leaf file: ${err.message}`);
            return;
          }
          hmrLeafStart = Date.now();
        }
      );

      // 等待所有 HMR 测试完成
      await waitPromise;

      clearTimeout(timeout);
      resolve();
    } catch (error) {
      // page.off('console', handleConsole);
      clearTimeout(timeout);
      logger.error(`   • ❌ HMR error for ${buildTool.name}: ${error.message}`);

      // 确保结果对象存在
      if (!results[buildTool.name]) {
        results[buildTool.name] = {};
      }

      if (!results[buildTool.name].rootHmr)
        results[buildTool.name].rootHmr = -1;
      if (!results[buildTool.name].leafHmr)
        results[buildTool.name].leafHmr = -1;
      resolve();
    } finally {
      try {
        // 恢复文件到原始状态
        writeFileSync(rootFile, originalRootFileContent);
        writeFileSync(leafFile, originalLeafFileContent);
      } catch (restoreError) {
        logger.error(
          `   • ❌ Failed to restore HMR test files: ${restoreError.message}`,
          {
            name: buildTool.name,
            brandColor: buildTool.brandColor.get(buildTool.name),
          }
        );
      }
    }
  });
}

async function runBenchmark(buildTools, brandColor) {
  const results = {};
  let browser = null;

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    for (const buildTool of buildTools) {
      try {
        console.log('\n');
        logger.info(`🧪 ${bold(buildTool.name)}`, {
          name: buildTool.name,
          brandColor: brandColor.get(buildTool.name),
        });

        const serverStartTime = await buildTool.startServer();

        const page = await browser.newPage();
        const start = Date.now();

        page.on('load', () => {
          const loadTime = Date.now() - start;
          const totalStartupTime = serverStartTime + loadTime;

          logger.info(
            `   • ⚡ Total startup: ${highlightTime(
              totalStartupTime
            )} (server: ${highlightTime(
              serverStartTime
            )} + page: ${highlightTime(loadTime)})`,
            {
              name: buildTool.name,
              brandColor: brandColor.get(buildTool.name),
            }
          );

          if (!results[buildTool.name]) {
            results[buildTool.name] = {};
          }

          results[buildTool.name]['startup(serverStartTime + onLoadTime)'] =
            totalStartupTime;
          results[buildTool.name].serverStartTime = serverStartTime;
          results[buildTool.name].onLoadTime = loadTime;
        });

        logger.info(`   • 访问 http://localhost:${buildTool.port}`, {
          name: buildTool.name,
          brandColor: brandColor.get(buildTool.name),
        });

        await page.goto(`http://localhost:${buildTool.port}`, {
          timeout: 60000,
          waitUntil: 'load',
        });

        // 确保页面完全加载后再进行HMR测试
        await new Promise((resolve) => setTimeout(resolve, 2000));

        await testHMR(buildTool, page, results);

        await page.close();

        // HMR 测试不需要内存监控，直接停止服务器
        await buildTool.stopServer();

        await new Promise((resolve) => setTimeout(resolve, 2000));

        const buildTime = await buildTool.build();
        results[buildTool.name].buildTime = buildTime;
      } catch (error) {
        logger.error(
          `   • ❌ ${bold(buildTool.name)} test failed: ${error.message}`,
          {
            name: buildTool.name,
            brandColor: brandColor.get(buildTool.name),
          }
        );

        // 确保失败时也正确清理
        try {
          await buildTool.stopServer();
        } catch (cleanupError) {
          logger.error(
            `❌ Failed to cleanup ${buildTool.name}: ${cleanupError.message}`
          );
        }

        if (!results[buildTool.name]) {
          results[buildTool.name] = {};
        }
        results[buildTool.name].error = error.message;
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  } catch (error) {
    logger.error(`❌ Benchmark test failed: ${error.message}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  return results;
}

async function runPerformanceTests(buildTools, brandColor) {
  const totalResults = [];
  const n = TEST_CONFIG.PERFORMANCE_ROUNDS;

  // 开始性能测试

  for (let i = 0; i < n; i++) {
    try {
      await deleteCacheFiles();

      const results = await runBenchmark(buildTools, brandColor);
      totalResults.push(results);
    } catch (error) {
      logger.error(
        `❌ Performance round ${bold(i + 1)} failed: ${error.message}`
      );
    }
  }

  return totalResults;
}

async function runMemoryTests(buildTools) {
  const memoryResults = {};

  // 开始内存测试

  for (const buildTool of buildTools) {
    try {
      await deleteCacheFiles();

      const memoryAnalysis = await testWatchMemory(buildTool);
      memoryResults[buildTool.name] = memoryAnalysis;

      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      logger.error(
        `❌ ${bold(buildTool.name)} memory test failed: ${error.message}`
      );
      memoryResults[buildTool.name] = { error: error.message };
    }
  }

  return memoryResults;
}

async function main() {
  logger.info('🚀 Build Tools Comprehensive Performance Benchmark\n');

  const availableToolConfigs = detectAvailableTools();
  const brandColor = createBrandColorMap(availableToolConfigs);

  const buildTools = availableToolConfigs.map(
    (config) => new BuildTool(config, brandColor)
  );
  console.log('\n');
  logger.info('⚙️ Test Configuration:', { name: 'Benchmark' });
  if (TEST_CONFIG.RUN_PERFORMANCE_TESTS) {
    logger.info(
      `   • Performance Tests: ${bold(
        `${TEST_CONFIG.PERFORMANCE_ROUNDS} rounds`
      )}`,
      { name: 'Benchmark' }
    );
  }

  if (TEST_CONFIG.RUN_MEMORY_TESTS) {
    logger.info(
      `   • Memory Tests: ${bold(`${TEST_CONFIG.MEMORY_WATCH_CYCLES} cycles`)}`,
      { name: 'Benchmark' }
    );
  }

  logger.info('📋 Tools to test:', { name: 'Benchmark' });
  buildTools.forEach((tool) => {
    logger.info(`   • ${bold(tool.name)}`, {
      name: 'Benchmark',
      brandColor: brandColor.get(tool.name),
    });
  });

  console.log('\n');

  if (!TEST_CONFIG.RUN_PERFORMANCE_TESTS && !TEST_CONFIG.RUN_MEMORY_TESTS) {
    logger.error(
      '❌ No tests enabled! Please enable at least one test type in TEST_CONFIG'
    );
    process.exit(1);
  }

  let performanceResults = [];
  let memoryResults = {};

  if (TEST_CONFIG.RUN_PERFORMANCE_TESTS) {
    logger.info('📊 Phase 1: Performance Benchmark Tests', {
      name: 'Benchmark',
    });
    performanceResults = await runPerformanceTests(buildTools, brandColor);
  } else {
    logger.info('⏭️  Skipping performance tests (disabled in config)', {
      name: 'Benchmark',
    });
  }
  if (TEST_CONFIG.RUN_MEMORY_TESTS) {
    console.log('\n');
    logger.info('🧠 Phase 2: Watch Memory Tests', { name: 'Benchmark' });
    memoryResults = await runMemoryTests(buildTools);
  } else {
    if (TEST_CONFIG.RUN_PERFORMANCE_TESTS) console.log('\n');
    logger.info('⏭️  Skipping memory tests (disabled in config)', {
      name: 'Benchmark',
    });
  }

  console.log('\n');

  const averageResults = {};
  const chart = {};
  const chartData = {};

  if (TEST_CONFIG.RUN_PERFORMANCE_TESTS && performanceResults.length > 0) {
    for (const result of performanceResults) {
      for (const [name, values] of Object.entries(result)) {
        if (!averageResults[name]) {
          averageResults[name] = {};
        }
        if (!chartData[name]) {
          chartData[name] = {};
        }
        if (!chart[name]) {
          chart[name] = {};
        }

        for (const [key, value] of Object.entries(values)) {
          if (key === 'error') continue;

          if (!chartData[name][key]) {
            chartData[name][key] = 0;
            chart[name][key] = 0;
          }

          chartData[name][key] += Number(value) || 0;
          const avgValue = Math.floor(
            chartData[name][key] / performanceResults.length
          );

          if (key === 'devMemoryMB') {
            averageResults[name][key] = avgValue > 0 ? `${avgValue}MB` : 'N/A';
          } else {
            averageResults[name][key] =
              avgValue > 0 ? `${avgValue}ms` : 'Failed';
          }
          chart[name][key] = avgValue;
        }
      }
    }
  }

  if (TEST_CONFIG.RUN_MEMORY_TESTS && Object.keys(memoryResults).length > 0) {
    for (const [toolName, memoryData] of Object.entries(memoryResults)) {
      if (!averageResults[toolName]) {
        averageResults[toolName] = {};
      }

      if (!memoryData.error) {
        averageResults[toolName]['Watch Memory Growth'] = `${(
          memoryData.totalGrowth /
          1024 /
          1024
        ).toFixed(2)}MB`;
        averageResults[toolName][
          'Growth Rate'
        ] = `${memoryData.growthPercentage.toFixed(1)}%`;
        averageResults[toolName]['Per Cycle'] = `${(
          memoryData.memoryPerCycle / 1024
        ).toFixed(2)}KB`;
        averageResults[toolName]['Idle 5s'] = `${(
          memoryData.leakageAmount /
          1024 /
          1024
        ).toFixed(2)}MB`;
        averageResults[toolName]['Trend'] = memoryData.memoryTrend;
      } else {
        averageResults[toolName]['Memory Test'] = 'Failed';
      }
    }
  }

  try {
    if (
      TEST_CONFIG.RUN_PERFORMANCE_TESTS &&
      Object.keys(averageResults).length > 0
    ) {
      logger.info('📊 Performance Benchmark Results:');

      const performanceOnlyResults = {};
      for (const [toolName, results] of Object.entries(averageResults)) {
        performanceOnlyResults[toolName] = {};
        for (const [key, value] of Object.entries(results)) {
          if (
            !key.includes('Watch Memory') &&
            !key.includes('Growth') &&
            !key.includes('Trend') &&
            !key.includes('Per Cycle') &&
            !key.includes('Idle')
          ) {
            performanceOnlyResults[toolName][key] = value;
          }
        }
      }
      console.table(performanceOnlyResults);
    }

    if (TEST_CONFIG.RUN_MEMORY_TESTS && Object.keys(memoryResults).length > 0) {
      logger.info('🧠 Watch Memory Test Results:');
      const memoryTable = {};
      for (const [toolName, memoryData] of Object.entries(memoryResults)) {
        if (!memoryData.error) {
          memoryTable[toolName] = {
            'Initial RSS': `${(memoryData.initialMemory / 1024 / 1024).toFixed(
              2
            )}MB`,
            'Operation RSS': `${(
              memoryData.operationCompleteMemory /
              1024 /
              1024
            ).toFixed(2)}MB`,
            'Final RSS': `${(memoryData.finalMemory / 1024 / 1024).toFixed(
              2
            )}MB`,
            'RSS Growth': `${(memoryData.totalGrowth / 1024 / 1024).toFixed(
              2
            )}MB`,
            'Growth%': `${memoryData.growthPercentage.toFixed(1)}%`,
            'Peak RSS': `${(memoryData.maxMemory / 1024 / 1024).toFixed(2)}MB`,
            'Idle 5s Change': `${(
              memoryData.leakageAmount /
              1024 /
              1024
            ).toFixed(2)}MB`,
            Cycles: memoryData.cyclesCompleted,
            'Per Cycle': `${(memoryData.memoryPerCycle / 1024).toFixed(2)}KB`,
            Trend: memoryData.memoryTrend,
          };
        } else {
          memoryTable[toolName] = { Error: memoryData.error };
        }
      }
      console.table(memoryTable);
    }

    if (
      TEST_CONFIG.RUN_PERFORMANCE_TESTS &&
      TEST_CONFIG.RUN_MEMORY_TESTS &&
      Object.keys(averageResults).length > 0
    ) {
      logger.info('📋 Combined Test Results:');
      console.table(averageResults);
    }

    if (
      TEST_CONFIG.RUN_PERFORMANCE_TESTS &&
      ((Array.isArray(chart) && chart.length > 0) ||
        (!Array.isArray(chart) && Object.keys(chart).length > 0))
    ) {
      // 标准化数据格式
      const normalizedChart = normalizeChartData(chart);
      const benchmarkData = { ...normalizedChart };
      try {
        await getChartPic(benchmarkData);
        logger.info('✅ Charts generated successfully!');
      } catch (error) {
        logger.error(`❌ Chart generation failed: ${error.message}`);
      }
    }
  } catch (error) {
    logger.error(`❌ Error generating results: ${error.message}`);
  }

  const completedTests = [];
  if (TEST_CONFIG.RUN_PERFORMANCE_TESTS) completedTests.push('performance');
  if (TEST_CONFIG.RUN_MEMORY_TESTS) completedTests.push('memory');

  logger.info(
    `🎉 ${completedTests
      .join(' and ')
      .toUpperCase()} tests completed successfully!\n`
  );
  process.exit(0);
}

main().catch((error) => {
  logger.error(`❌ Program execution failed: ${error.message}`);
  process.exit(1);
});
