# Team Covey EFB - Electronic Flight Bag

A professional Electron desktop application for flight simulation with PSX integration, SimBrief flight planning, VATSIM tracking, and ACARS messaging.

---

## 🚀 Quick Start

### First Time Setup
**PowerShell (Recommended):**
```powershell
powershell -ExecutionPolicy Bypass -File setup.ps1
```

**Or manually:**
```bash
npm install
```

### Run the App
```bash
npm run electron:dev
```

### Build Windows Installer
**PowerShell (Recommended):**
```powershell
powershell -ExecutionPolicy Bypass -File build-installer.ps1
```

**Or manually:**
```bash
npm run build
npm run dist
```

> 📖 **See [SETUP-GUIDE.md](SETUP-GUIDE.md) for detailed setup and build instructions.**

---

## 📱 Features

- ✈️ **SimBrief Integration** - Flight planning and OFP viewing
- 🎮 **PSX Simulator Control** - Aircraft systems, doors, fuel, power
- 🌍 **VATSIM Tracking** - Live pilot position and status
- 📡 **ACARS Messaging** - Hoppie ACARS integration
- 🗺️ **VATSIM Map** - Real-time traffic visualization
- 💬 **Twitch Chat** - Embedded chat for streaming
- 🌓 **Dark/Light Mode** - Theme support
- 📱 **iPad Access** - Control from any device on local network

---

## 🖥️ Usage

### Desktop Application
1. Launch from Start Menu or Desktop
2. Window opens with EFB interface
3. System tray icon for background operation
4. Configure settings via hamburger menu (☰)

### iPad/Network Access
1. Find your PC's IP address (shown in system tray menu)
2. On iPad Safari: `http://YOUR-PC-IP:3000`
3. Full functionality over local network

---

## 📦 Distribution

### For End Users
1. Download the installer (`.exe` file)
2. Double-click to install
3. Launch "Team Covey EFB" from Start Menu
4. No Node.js or technical setup required

### For Developers
See [README-ELECTRON.md](README-ELECTRON.md) for full development documentation.

---

## 🛠️ Tech Stack

- **Electron** - Desktop application framework
- **Next.js 14** - React framework with API routes
- **React 18** - UI library
- **Tailwind CSS** - Styling
- **TypeScript** - Type safety
- **Node.js** - Backend runtime

---

## 📚 Documentation

- **[QUICK-START.md](QUICK-START.md)** - 5-minute getting started guide
- **[README-ELECTRON.md](README-ELECTRON.md)** - Complete Electron documentation
- **[README-DISTRIBUTION.md](README-DISTRIBUTION.md)** - Distribution guide
- **[MIGRATION-SUMMARY.md](MIGRATION-SUMMARY.md)** - Architecture details

---

## 🎯 Scripts

| Command | Description |
|---------|-------------|
| `npm run electron:dev` | Run app in development |
| `npm run electron:build` | Build installer for distribution |
| `npm run build` | Build Next.js only |
| `npm run dev` | Run Next.js server only |
| `npm run lint` | Check code quality |

---

## 🐛 Troubleshooting

### App Won't Start
```bash
npm install  # Reinstall dependencies
```

### iPad Can't Connect
- Same WiFi network?
- Check IP with `ipconfig`
- Windows Firewall blocking Node.js?

### Port 3000 Already in Use
- Close other apps using port 3000
- Or change port in `electron/main.js`

---

## 📄 License

Private project for Team Covey.

---

## 👥 Support

For issues or questions, check the documentation files or contact the development team.

---

**Version:** 1.0.0
**Powered by:** Electron + Next.js
