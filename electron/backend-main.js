const { app, Tray, Menu, shell, dialog } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const os = require("os");
const http = require("http");
const fs = require("fs");

let tray = null;
let serverProcess = null;
const PORT = Number(process.env.EFB_BACKEND_PORT || 3000);
const FIRST_RUN_MARKER = "backend-first-run";

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  return "localhost";
}

function checkServer(maxAttempts = 40) {
  return new Promise((resolve) => {
    let attempts = 0;
    const check = () => {
      attempts++;
      http
        .get(`http://localhost:${PORT}/setup`, (res) => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
            resolve(true);
            return;
          }
          if (attempts < maxAttempts) setTimeout(check, 1000);
          else resolve(false);
        })
        .on("error", () => {
          if (attempts < maxAttempts) setTimeout(check, 1000);
          else resolve(false);
        });
    };
    check();
  });
}

function postJson(pathname, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body || {});
    const headers = {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload),
    };
    if (process.env.EFB_SERVICE_TOKEN) {
      headers["x-efb-service-token"] = process.env.EFB_SERVICE_TOKEN;
    }

    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: pathname,
        method: "POST",
        headers,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk.toString("utf8");
        });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data || "{}");
            resolve({ status: res.statusCode || 0, body: parsed });
          } catch {
            resolve({ status: res.statusCode || 0, body: { ok: false, raw: data } });
          }
        });
      },
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function startCallMonitor() {
  try {
    const res = await postJson("/api/psx/call-monitor", { action: "start" });
    if (res.status >= 200 && res.status < 300) {
      console.log("PSX call monitor started");
    } else {
      console.warn("PSX call monitor start failed:", res.body);
    }
  } catch (err) {
    console.warn("PSX call monitor start error:", err?.message || String(err));
  }
}

function startServer() {
  return new Promise((resolve, reject) => {
    const isDev = !app.isPackaged;
    const appPath = app.getAppPath();

    if (isDev) {
      const nodeExe = "npm";
      const args = ["run", "dev"];
      serverProcess = spawn(nodeExe, args, {
        cwd: appPath,
        shell: true,
        env: {
          ...process.env,
          PORT: String(PORT),
          NODE_ENV: "development",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });

      serverProcess.stdout.on("data", (data) => console.log(`[Backend] ${data.toString()}`));
      serverProcess.stderr.on("data", (data) => console.error(`[Backend Error] ${data.toString()}`));
      serverProcess.on("error", (error) => reject(error));
      serverProcess.on("exit", (code, signal) => {
        console.log(`Backend dev process exited with code ${code}, signal ${signal}`);
      });

      setTimeout(async () => {
        const ready = await checkServer();
        if (ready) resolve();
        else reject(new Error("Backend server startup timeout"));
      }, 3000);
      return;
    }

    try {
      process.env.PORT = String(PORT);
      process.env.NODE_ENV = "production";
      process.env.HOSTNAME = "0.0.0.0";

      const standalonePath = path.join(process.resourcesPath, "standalone");
      process.chdir(standalonePath);
      require(path.join(standalonePath, "server.js"));

      setTimeout(async () => {
        const ready = await checkServer();
        if (ready) resolve();
        else reject(new Error("Backend server startup timeout"));
      }, 4000);
    } catch (error) {
      reject(error);
    }
  });
}

function stopServer() {
  if (serverProcess) {
    try {
      serverProcess.kill();
    } catch {}
    serverProcess = null;
  }
}

function setupUrl() {
  return `http://localhost:${PORT}/setup`;
}

function networkUrl() {
  return `http://${getLocalIP()}:${PORT}/setup`;
}

function openFirstRunSetup() {
  const markerPath = path.join(app.getPath("userData"), FIRST_RUN_MARKER);
  if (fs.existsSync(markerPath)) return;
  try {
    fs.mkdirSync(path.dirname(markerPath), { recursive: true });
    fs.writeFileSync(markerPath, new Date().toISOString(), "utf8");
  } catch {}
  shell.openExternal(setupUrl());
}

function createTray() {
  const iconPath = path.join(__dirname, "../public/icon.png");
  tray = new Tray(iconPath);

  const contextMenu = Menu.buildFromTemplate([
    { label: "Team Covey EFB Backend", enabled: false },
    { type: "separator" },
    {
      label: `Open Setup (${setupUrl()})`,
      click: () => shell.openExternal(setupUrl()),
    },
    {
      label: `Setup on LAN (${networkUrl()})`,
      click: () => shell.openExternal(networkUrl()),
    },
    { type: "separator" },
    {
      label: "Quit Backend",
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip("Team Covey EFB Backend");
  tray.setContextMenu(contextMenu);
  tray.on("click", () => shell.openExternal(setupUrl()));
}

app.whenReady().then(async () => {
  try {
    await startServer();
    await startCallMonitor();
    createTray();
    openFirstRunSetup();
    console.log(`Team Covey EFB Backend running on http://localhost:${PORT}`);
  } catch (error) {
    dialog.showErrorBox(
      "Backend Startup Error",
      `Failed to start Team Covey EFB backend.\n\n${error?.message || String(error)}`,
    );
    app.quit();
  }
});

app.on("before-quit", () => {
  app.isQuitting = true;
});

app.on("window-all-closed", (e) => {
  e.preventDefault();
});

app.on("will-quit", () => {
  stopServer();
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});
