import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

const execFileAsync = promisify(execFile);
const DEV_PORT = 5173;
const PROJECT_HINT = 'FlowSpace';

async function getUnixListeningPids(port) {
  try {
    const { stdout } = await execFileAsync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN']);
    return stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function getListeningPids(port) {
  return process.platform === 'win32'
    ? getWindowsListeningPids(port)
    : getUnixListeningPids(port);
}

async function isPortFree(port) {
  const pids = await getListeningPids(port);
  return pids.length === 0;
}

async function getWindowsListeningPids(port) {
  try {
    const { stdout } = await execFileAsync('cmd', ['/c', 'netstat', '-ano', '-p', 'tcp']);
    const pids = new Set();
    for (const line of stdout.split('\n')) {
      if (!line.includes(`:${port}`) || !line.includes('LISTENING')) {
        continue;
      }
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid) {
        pids.add(pid);
      }
    }
    return [...pids];
  } catch {
    return [];
  }
}

async function getCommandLine(pid) {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execFileAsync('powershell', [
        '-NoProfile',
        '-Command',
        `(Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}").CommandLine`,
      ]);
      return stdout.trim();
    }

    const { stdout } = await execFileAsync('ps', ['-p', String(pid), '-o', 'command=']);
    return stdout.trim();
  } catch {
    return '';
  }
}

async function killPid(pid) {
  try {
    if (process.platform === 'win32') {
      await execFileAsync('taskkill', ['/PID', String(pid), '/F']);
      return true;
    }

    process.kill(Number(pid), 'SIGKILL');
    return true;
  } catch {
    return false;
  }
}

function isSafeToKill(commandLine) {
  const normalized = commandLine.toLowerCase();
  return normalized.includes('vite') || normalized.includes(PROJECT_HINT.toLowerCase());
}

async function clearStalePortIfNeeded(port) {
  if (await isPortFree(port)) {
    return;
  }

  const pids = await getListeningPids(port);

  if (pids.length === 0) {
    throw new Error(`端口 ${port} 已被占用，但未能识别占用进程。请手动释放后重试。`);
  }

  for (const pid of pids) {
    const commandLine = await getCommandLine(pid);
    if (!isSafeToKill(commandLine)) {
      throw new Error(
        `端口 ${port} 正被其他进程占用（PID ${pid}）：${commandLine || '未知命令'}。为避免误杀，该启动脚本已中止。`,
      );
    }

    console.log(`[dev-port-guard] 检测到残留开发进程占用 ${port}，正在清理 PID ${pid}`);
    const killed = await killPid(pid);
    if (!killed) {
      throw new Error(`尝试结束 PID ${pid} 失败，请手动释放端口 ${port} 后重试。`);
    }
  }

  if (!(await isPortFree(port))) {
    throw new Error(`端口 ${port} 清理后仍不可用，请手动检查系统中的占用进程。`);
  }
}

async function main() {
  await clearStalePortIfNeeded(DEV_PORT);

  console.log(`[dev-port-guard] 端口 ${DEV_PORT} 可用，正在启动 Vite`);
  const viteBin = path.resolve(
    process.cwd(),
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'vite.cmd' : 'vite',
  );
  const child = spawn(viteBin, [], {
    stdio: 'inherit',
    shell: false,
    env: {
      ...process.env,
    },
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });

  child.on('error', (error) => {
    console.error('[dev-port-guard] Vite 启动失败:', error);
    process.exit(1);
  });
}

main().catch((error) => {
  console.error('[dev-port-guard] 启动前检查失败:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
