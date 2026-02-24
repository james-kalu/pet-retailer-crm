const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

const { app, BrowserWindow, dialog, shell } = require("electron");
const next = require("next");

const HOST = "127.0.0.1";
const DEFAULT_PORT = 3710;

const isDev = !app.isPackaged && process.env.ELECTRON_DEV === "1";

let mainWindow = null;
let nextServer = null;
let nextApp = null;
let shuttingDown = false;

function getLogFilePath() {
  const baseDir = app.isReady() ? app.getPath("userData") : process.cwd();
  const logsDir = path.join(baseDir, "logs");
  fs.mkdirSync(logsDir, { recursive: true });
  return path.join(logsDir, "desktop.log");
}

function logLine(message, error) {
  const suffix =
    error instanceof Error
      ? ` | ${error.message}\n${error.stack ?? ""}`
      : error
        ? ` | ${String(error)}`
        : "";
  const line = `[${new Date().toISOString()}] ${message}${suffix}\n`;
  try {
    fs.appendFileSync(getLogFilePath(), line);
  } catch {
    // Logging should never crash app startup.
  }
  // Keep console logs for terminal runs.
  process.stdout.write(line);
}

function normalizeForPrisma(filePath) {
  return filePath.replace(/\\/g, "/");
}

function getAppDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app");
  }

  return process.cwd();
}

function copySeedDatabaseIfNeeded(appDir) {
  const dataDir = path.join(app.getPath("userData"), "data");
  fs.mkdirSync(dataDir, { recursive: true });

  const runtimeDbPath = path.join(dataDir, "petcrm.db");
  if (fs.existsSync(runtimeDbPath)) {
    process.env.DATABASE_URL = `file:${normalizeForPrisma(runtimeDbPath)}`;
    logLine(`Using existing runtime DB at ${runtimeDbPath}`);
    return;
  }

  const bundledDbPath = path.join(appDir, "prisma", "dev.db");
  if (!fs.existsSync(bundledDbPath)) {
    throw new Error(
      `Bundled database not found at ${bundledDbPath}. Run db setup/seed before packaging.`
    );
  }

  fs.copyFileSync(bundledDbPath, runtimeDbPath);
  process.env.DATABASE_URL = `file:${normalizeForPrisma(runtimeDbPath)}`;
  logLine(`Copied bundled DB to runtime path ${runtimeDbPath}`);
}

async function verifyPrismaRuntime(appDir) {
  const prismaModulePath = path.join(appDir, "node_modules", "@prisma", "client");

  let PrismaClientCtor;
  try {
    ({ PrismaClient: PrismaClientCtor } = require(prismaModulePath));
  } catch (error) {
    throw new Error(
      `Unable to load Prisma client at ${prismaModulePath}. Ensure desktop build includes Prisma runtime.`,
      { cause: error }
    );
  }

  const prisma = new PrismaClientCtor();
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    logLine("Prisma runtime preflight passed.");
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

function getFreePort(startPort = DEFAULT_PORT) {
  return new Promise((resolve, reject) => {
    const tryPort = (port) => {
      const server = net.createServer();
      server.unref();

      server.on("error", () => {
        if (port > startPort + 200) {
          reject(new Error("Unable to find a free local port for desktop server."));
          return;
        }

        tryPort(port + 1);
      });

      server.listen(port, HOST, () => {
        const address = server.address();
        const openPort =
          typeof address === "object" && address && typeof address.port === "number"
            ? address.port
            : port;
        server.close(() => resolve(openPort));
      });
    };

    tryPort(startPort);
  });
}

async function startEmbeddedNextServer(appDir) {
  const port = await getFreePort(DEFAULT_PORT);

  nextApp = next({
    dev: false,
    dir: appDir,
    hostname: HOST,
    port
  });

  await nextApp.prepare();
  const handle = nextApp.getRequestHandler();

  nextServer = http.createServer((req, res) => {
    Promise.resolve(handle(req, res)).catch((error) => {
      logLine(`Request failed for ${req.url ?? "unknown URL"}`, error);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end("Internal Server Error");
      }
    });
  });

  await new Promise((resolve, reject) => {
    nextServer.once("error", reject);
    nextServer.listen(port, HOST, resolve);
  });

  logLine(`Embedded Next.js server started at http://${HOST}:${port}`);
  return `http://${HOST}:${port}`;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 700,
    backgroundColor: "#f8fafc",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  const appDir = getAppDir();

  if (isDev) {
    logLine("Launching in desktop dev mode.");
    await mainWindow.loadURL("http://localhost:3000");
    return;
  }

  logLine(`Launching packaged app from ${appDir}`);
  copySeedDatabaseIfNeeded(appDir);
  logLine(`DATABASE_URL=${process.env.DATABASE_URL ?? "undefined"}`);
  await verifyPrismaRuntime(appDir);
  const serverUrl = await startEmbeddedNextServer(appDir);
  await mainWindow.loadURL(serverUrl);

  mainWindow.webContents.on("did-fail-load", (_event, code, description, validatedURL) => {
    logLine(`Window failed to load (${code}) ${description} at ${validatedURL}`);
  });
}

async function shutdownEmbeddedServer() {
  if (!nextServer) {
    return;
  }

  await new Promise((resolve) => {
    nextServer.close(() => resolve());
  });

  nextServer = null;
  nextApp = null;
}

app.on("window-all-closed", async () => {
  await shutdownEmbeddedServer();

  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    try {
      await createWindow();
    } catch (error) {
      dialog.showErrorBox("Startup error", error instanceof Error ? error.message : String(error));
      app.quit();
    }
  }
});

app.whenReady()
  .then(createWindow)
  .catch((error) => {
    logLine("Fatal startup error", error);
    dialog.showErrorBox("Startup error", error instanceof Error ? error.message : String(error));
    app.quit();
  });

process.on("uncaughtException", (error) => {
  logLine("Uncaught exception", error);
});

process.on("unhandledRejection", (reason) => {
  logLine("Unhandled promise rejection", reason);
});

app.on("before-quit", async (event) => {
  if (shuttingDown) {
    return;
  }

  event.preventDefault();
  shuttingDown = true;
  await shutdownEmbeddedServer();
  app.exit(0);
});
