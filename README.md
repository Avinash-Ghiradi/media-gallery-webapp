# Media Gallery Uploader - Standalone Web Application

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-v4.19-blue.svg)](https://expressjs.com/)

A modern full-stack web application converted from Google Apps Script for uploading media (images, videos, PDFs) directly to **Google Drive**, organized by **Event** and **Class**, with automated **Google Sheets logging**, **client-side HTML5 Canvas watermarking**, **WhatsApp message sharing**, and **folder management**.

---

## 🌟 Key Features

- **Google Drive Integration**: Automatically creates Event & Class folders in Google Drive and uploads media files.
- **Google Sheets Logging**: Automatically appends file records, preview URLs, timestamps, and file metadata to Sheets.
- **Image Watermarking & Borders**: Client-side HTML5 Canvas watermarking (school name, event name, date, school logo, border styling with ON/OFF toggle).
- **Interactive WhatsApp Sharing**: One-click generation of formatted WhatsApp share messages and `wa.me` links.
- **Folder Management & Cleanup**: Ability to view recent uploads, open Drive folders, and trash folders directly from the web portal.
- **Secure Authentication**: Admin password portal matching users in Google Sheet (or default fallback credentials).
- **Dual Mode (Google APIs / Instant Mock)**: Runs out-of-the-box in local mock mode without requiring immediate Google Service Account credentials.

---

## 🚀 Quick Start (Local Development)

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- `npm` or `yarn`

### 2. Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/YOUR_USERNAME/media-gallery-webapp.git
cd media-gallery-webapp
npm install
```

### 3. Running the Server

Start the application in development or production mode:

```bash
# Start production server
npm start

# Start development server with live reload
npm run dev
```

Open your browser and navigate to: **`http://localhost:3000`**

- **Default Login Password**: `password123`

---

## 🔐 Google Cloud Service Account Setup

To connect the application to your live Google Drive and Google Sheets:

### Step 1: Create a Google Cloud Project & Enable APIs
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (e.g., `Media Gallery WebApp`).
3. Enable **Google Drive API** and **Google Sheets API** under **APIs & Services > Library**.

### Step 2: Create a Service Account
1. Go to **APIs & Services > Credentials**.
2. Click **Create Credentials > Service Account**.
3. Name your service account (e.g., `media-gallery-sa`) and click **Create and Continue**.
4. Skip optional roles and click **Done**.

### Step 3: Download Service Account Key JSON
1. Click on your newly created Service Account email.
2. Select the **Keys** tab > **Add Key** > **Create new key**.
3. Choose **JSON** and download the file.
4. Save this file in the root folder of this project as **`credentials.json`**.

### Step 4: Share Google Drive & Sheets with Service Account
1. Open your `credentials.json` file and copy the `"client_email"` address (e.g. `media-gallery-sa@project-id.iam.gserviceaccount.com`).
2. Go to your **Google Drive Root Folder** (`1bK-DO_ZtsUe2ASqMWqr0St7zoUv8UlNw`) and click **Share**.
3. Paste the Service Account email and grant **Editor** permissions.
4. Do the same for your **Google Sheets**:
   - `USERS_SHEET_ID`: `14Qf8_lT3D61fbpRTGw1GRKxB2V0UccjBe2LDT0n5DME`
   - `URL_SHEET_ID`: `19BwOHx7jmTjCQlh-oiBtXHO_ugG9rpgRghly0sPqJng`

---

## ⚙️ Environment Variables (`.env`)

Copy `.env.example` to `.env` and fill in your custom IDs if needed:

```env
PORT=3000
SESSION_SECRET=your-random-session-secret

USERS_SHEET_ID=14Qf8_lT3D61fbpRTGw1GRKxB2V0UccjBe2LDT0n5DME
USERS_SHEET_NAME=users
LOG_SHEET_ID=14Qf8_lT3D61fbpRTGw1GRKxB2V0UccjBe2LDT0n5DME
URL_SHEET_ID=19BwOHx7jmTjCQlh-oiBtXHO_ugG9rpgRghly0sPqJng
DRIVE_ROOT_FOLDER_ID=1bK-DO_ZtsUe2ASqMWqr0St7zoUv8UlNw

GOOGLE_APPLICATION_CREDENTIALS=credentials.json
```

---

## 📦 How to Push to GitHub

1. Initialize git and commit your files:

```bash
git init
git add .
git commit -m "Initial commit of Media Gallery WebApp"
```

2. Create a new repository on GitHub:
   - Go to [GitHub New Repository](https://github.com/new)
   - Name it `media-gallery-webapp`
   - Do NOT initialize with README (you already have one)

3. Push code to GitHub:

```bash
git remote add origin https://github.com/YOUR_USERNAME/media-gallery-webapp.git
git branch -M main
git push -u origin main
```

---

## ☁️ Deployment Guide

### Deploying to Render / Railway / Vercel

1. Connect your GitHub repository to **Render**, **Railway**, or **Vercel**.
2. Set Build Command: `npm install`
3. Set Start Command: `npm start`
4. In Environment Variables on your hosting provider, set:
   - `PORT`: `3000`
   - `SESSION_SECRET`: `<random-string>`
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`: `<your-service-account-email>`
   - `GOOGLE_PRIVATE_KEY`: `<your-private-key-with-\n-newlines>`
   - `USERS_SHEET_ID`, `LOG_SHEET_ID`, `URL_SHEET_ID`, `DRIVE_ROOT_FOLDER_ID`

---

## 📄 Project Structure

```
media-gallery-webapp/
├── .github/
│   └── workflows/
│       └── ci.yml             # GitHub Actions continuous integration check
├── public/
│   ├── css/
│   │   └── styles.css         # Application stylesheet
│   ├── js/
│   │   └── app.js             # Client JS (watermarking, fetch REST API)
│   └── index.html             # Main interface template
├── src/
│   ├── auth.js                # Session and password authentication
│   ├── config.js              # Environment settings
│   ├── googleService.js       # Google Drive & Sheets API integration
│   └── mockService.js         # Fallback mock service for local testing
├── .env.example               # Environment template
├── .gitignore                 # Git ignore rules
├── package.json               # Dependencies and build scripts
├── README.md                  # Comprehensive documentation
└── server.js                  # Express server entry point
```

---

## 📜 License

This project is licensed under the [MIT License](LICENSE).
