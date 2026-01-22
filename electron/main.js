const { app, BrowserWindow, Tray, Menu, shell, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');
const http = require('http');

let mainWindow = null;
let tray = null;
let serverProcess = null;
const PORT = 3000;

// Get local IP address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// Check if server is responding
function checkServer(maxAttempts = 30) {
  return new Promise((resolve) => {
    let attempts = 0;
    const check = () => {
      attempts++;
      http.get(`http://localhost:${PORT}`, (res) => {
        if (res.statusCode === 200) {
          console.log('Server is ready!');
          resolve(true);
        } else if (attempts < maxAttempts) {
          setTimeout(check, 1000);
        } else {
          resolve(false);
        }
      }).on('error', () => {
        if (attempts < maxAttempts) {
          setTimeout(check, 1000);
        } else {
          resolve(false);
        }
      });
    };
    check();
  });
}

// Start Next.js server
function startServer() {
  return new Promise((resolve, reject) => {
    console.log('Starting Next.js server...');
    console.log('App path:', app.getAppPath());
    console.log('Is packaged:', app.isPackaged);

    const isDev = !app.isPackaged;
    const appPath = app.getAppPath();

    if (isDev) {
      // Development: use npm run dev as subprocess
      const nodeExe = 'npm';
      const args = ['run', 'dev'];
      const cwd = appPath;

      console.log('Starting dev server with:', { nodeExe, args, cwd });

      try {
        serverProcess = spawn(nodeExe, args, {
          cwd: cwd,
          shell: true,
          env: {
            ...process.env,
            PORT: String(PORT),
            NODE_ENV: 'development'
          },
          stdio: ['ignore', 'pipe', 'pipe']
        });

        serverProcess.stdout.on('data', (data) => {
          console.log(`[Server] ${data.toString()}`);
        });

        serverProcess.stderr.on('data', (data) => {
          console.error(`[Server Error] ${data.toString()}`);
        });

        serverProcess.on('error', (error) => {
          console.error('Failed to start server process:', error);
          reject(error);
        });

        serverProcess.on('exit', (code, signal) => {
          console.log(`Server process exited with code ${code}, signal ${signal}`);
        });

        // Wait for dev server to be ready
        setTimeout(async () => {
          const ready = await checkServer();
          if (ready) {
            console.log('Dev server started successfully');
            resolve();
          } else {
            console.error('Dev server failed to start within timeout');
            reject(new Error('Server startup timeout'));
          }
        }, 3000);

      } catch (error) {
        console.error('Error spawning dev server:', error);
        reject(error);
      }
    } else {
      // Production: run standalone server directly in this process
      console.log('Starting production server...');

      try {
        // Set environment variables
        process.env.PORT = String(PORT);
        process.env.NODE_ENV = 'production';
        process.env.HOSTNAME = '0.0.0.0';

        // Change to standalone directory
        const standalonePath = path.join(process.resourcesPath, 'standalone');
        process.chdir(standalonePath);

        console.log('Changed directory to:', standalonePath);
        console.log('Loading server from:', path.join(standalonePath, 'server.js'));

        // Require the standalone server (runs in same process)
        require(path.join(standalonePath, 'server.js'));

        // The server starts asynchronously, so wait for it to be ready
        setTimeout(async () => {
          const ready = await checkServer();
          if (ready) {
            console.log('Production server started successfully');
            resolve();
          } else {
            console.error('Production server failed to start within timeout');
            reject(new Error('Server startup timeout'));
          }
        }, 5000);

      } catch (error) {
        console.error('Error starting production server:', error);
        reject(error);
      }
    }
  });
}

// Stop Next.js server
function stopServer() {
  if (serverProcess) {
    console.log('Stopping Next.js development server...');
    serverProcess.kill();
    serverProcess = null;
  }
  // In production, server runs in same process and will stop when app quits
  console.log('Server shutdown initiated');
}

// Create the main window
function createWindow() {
  const localIP = getLocalIP();

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'Team Covey EFB',
    icon: path.join(__dirname, '../public/icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    },
    show: false
  });

  // Load the app
  mainWindow.loadURL(`http://localhost:${PORT}`);

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.maximize();

    // Show welcome notification
    mainWindow.webContents.executeJavaScript(`
      console.log('Team Covey EFB is running!');
      console.log('Access from iPad: http://${localIP}:${PORT}');
    `);
  });

  // Handle load failures
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);

    // Show error dialog
    dialog.showErrorBox(
      'Failed to Start',
      `Could not connect to the application server.\n\nError: ${errorDescription}\n\nThe app will now close. Please try again or contact support.`
    );

    app.quit();
  });

  // Don't close, just hide
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// Create system tray
function createTray() {
  const localIP = getLocalIP();
  const iconPath = path.join(__dirname, '../public/icon.png');

  try {
    tray = new Tray(iconPath);
  } catch (error) {
    console.error('Failed to create tray icon:', error);
    // Continue without tray icon
    return;
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Team Covey EFB',
      enabled: false
    },
    { type: 'separator' },
    {
      label: `Local: http://localhost:${PORT}`,
      click: () => shell.openExternal(`http://localhost:${PORT}`)
    },
    {
      label: `iPad/Network: http://${localIP}:${PORT}`,
      click: () => {
        console.log(`Network URL: http://${localIP}:${PORT}`);
      }
    },
    { type: 'separator' },
    {
      label: 'Show Window',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: 'Hide Window',
      click: () => {
        if (mainWindow) {
          mainWindow.hide();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Team Covey EFB');
  tray.setContextMenu(contextMenu);

  // Click to show/hide window
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

// App lifecycle
app.whenReady().then(async () => {
  try {
    console.log('='.repeat(50));
    console.log('Team Covey EFB Starting...');
    console.log('Environment:', app.isPackaged ? 'Production' : 'Development');
    console.log('='.repeat(50));

    // Start the server first
    await startServer();

    // Then create window and tray
    createWindow();
    createTray();

    console.log('Team Covey EFB started successfully');
    console.log(`Access URL: http://localhost:${PORT}`);
    console.log(`Network URL: http://${getLocalIP()}:${PORT}`);
    console.log('='.repeat(50));
  } catch (error) {
    console.error('Fatal error during startup:', error);

    dialog.showErrorBox(
      'Startup Error',
      `Failed to start Team Covey EFB.\n\nError: ${error.message}\n\nPlease contact support or check the logs.`
    );

    app.quit();
  }
});

// Quit when all windows are closed (Windows & Linux)
app.on('window-all-closed', () => {
  // Don't quit - keep server running in tray
  if (process.platform !== 'darwin') {
    // Keep running
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Cleanup on quit
app.on('before-quit', () => {
  app.isQuitting = true;
});

app.on('will-quit', () => {
  stopServer();
});

// Handle crashes
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  dialog.showErrorBox(
    'Application Error',
    `An unexpected error occurred:\n\n${error.message}\n\nThe application will now close.`
  );
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
