# Redbubble Auto Uploader Chrome Extension

This Chrome extension automates uploading multiple designs to Redbubble. It provides a persistent right sidebar on Redbubble pages for managing an upload queue.

## Features

- Persistent sidebar on Redbubble pages
- Upload queue management with persistent storage
- Bulk image upload with optional CSV for metadata
- Automated upload process
- Status tracking for each design

## Installation

1. Clone or download this repository.
2. Run `npm install` to install dependencies.
3. Run `npm run build` to build the extension.
4. Open Chrome and go to `chrome://extensions/`.
5. Enable "Developer mode" in the top right.
6. Click "Load unpacked" and select the `dist` folder.

## Usage

1. Navigate to any Redbubble page.
2. The sidebar will appear on the right.
3. Click "Upload Designs" to add images and optional CSV.
4. Click "Start Upload" to begin the automated process.

## CSV Format

The CSV should have columns: image_name, title, tags, description

Example:

```
image_name,title,tags,description
design1.png,My Design,art,illustration,A beautiful illustration
```

## Development

- `npm run dev` for development server
- `npm run build` for production build

## Permissions

- Storage: To persist the upload queue
- Active Tab: To interact with Redbubble pages
- Scripting: To automate form filling
- Host permissions for redbubble.com
