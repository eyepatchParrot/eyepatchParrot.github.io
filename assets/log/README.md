# Activity Log - Developer Guide

This document provides an overview of the application's design and a guide for extending its functionality.

## Design Overview

The application is a simple, single-page activity tracker built with vanilla HTML, CSS, and JavaScript. It is designed to be mobile-friendly, offline-first, and installable as a Progressive Web App (PWA).

### File Structure

-   **`index.html`**: The main HTML file containing the structure of the user interface.
-   **`style.css`**: The stylesheet responsible for the application's visual appearance, using a clean, responsive design.
-   **`app.js`**: The core of the application. It handles all logic, including:
    -   Rendering activities and presets.
    -   Managing user interactions (starting/ending activities, adding presets).
    -   Persisting data to the browser's `localStorage`.
-   **`manifest.json`**: The web app manifest file. It allows the application to be "installed" on a user's home screen and defines its appearance and behavior as a PWA.
-   **`service-worker.js`**: This script provides offline capabilities. It pre-caches all essential application assets (`HTML`, `CSS`, `JS`), allowing the app to load and function even without a network connection.

### Data Persistence

All application data is stored in the browser's `localStorage`.

-   **Activities**: Daily activities are stored under a key formatted as `log-YYYY-MM-DD`. Each entry is an array of activity objects. For example:
    ```json
    [
      {"name": "Work", "start": "2025-07-28T09:00:00", "end": "2025-07-28T12:30:00"},
      {"name": "Lunch", "start": "2025-07-28T12:30:00", "end": "2025-07-28T13:00:00"}
    ]
    ```
-   **Presets**: User-defined activity presets are stored under the key `presets`. This is an array of strings.
    ```json
    ["Work", "Lunch", "Commute", "Exercise"]
    ```

## Extending the Application

The application is designed to be straightforward to extend. Here are some ideas and guidelines.

### How to Add a New Feature

Most new features will involve changes to `app.js` and potentially `index.html` and `style.css`.

**Example Idea: Data Export**

1.  **UI Element**: Add an "Export" button to `index.html`.
2.  **Event Listener**: In `app.js`, add a `click` event listener to the new button.
3.  **Logic**:
    -   In the event handler, retrieve all `log-YYYY-MM-DD` keys from `localStorage`.
    -   Consolidate the data into a single JSON object.
    -   Create a `Blob` from the JSON data and generate a downloadable link (`<a download="activity-log.json">`).
    -   Programmatically click the link to trigger the download.

### Potential Future Enhancements

-   **Statistics & Visualization**: Add a view that shows how time is spent across different activities over a week or month. You could use a simple library like Chart.js or render graphs with CSS.
-   **Editing & Deleting Entries**: Allow users to modify or remove past activity entries. This would require adding edit/delete buttons to the log and implementing the corresponding logic in `app.js` to update the `localStorage` array.
-   **Multi-Day View**: Create a calendar or list view to see logs from previous days.
-   **Cloud Sync**: Integrate with a backend service (like Firebase or a custom API) to sync data across devices. This would be a significant extension and would require moving away from a purely `localStorage`-based solution.
-   **Themes**: Add a toggle for light and dark mode by defining alternative color schemes in `style.css` and using JavaScript to switch a class on the `<body>` element.

### Modifying the Service Worker

If you add new assets (like images, fonts, or JavaScript libraries), you must update the `ASSETS` array in `service-worker.js` to ensure they are cached for offline use.

```javascript
// service-worker.js
const ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/style.css',
  // Add your new files here
  // '/images/new-icon.png',
];
```
