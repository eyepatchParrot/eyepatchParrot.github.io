# Activity Log - Developer Guide

This document provides an overview of the application's design and a guide for extending its functionality.

## Design Philosophy

The application's design is guided by two core principles:

1.  **Information-Dense Design**: The UI should present as much relevant information as possible without appearing cluttered. This is achieved through features like the "Recent Days" summary, which provides an immediate, high-level overview of the past week's activities. Color-coding is used to add another layer of information (activity type) that can be parsed at a glance.

2.  **Action Accessibility (Hot vs. Cold UI)**: The most common actions should be the easiest to perform.
    -   **Hot Actions**: Starting a new activity from a preset or stopping the current one are the most frequent interactions. These are placed in the primary control panel for immediate access.
    -   **Cold Actions**: Less frequent tasks, such as editing the specific times of a past entry or deleting an entry, require an extra click. Creating a new preset is a "cold" action because it happens implicitly; you simply type a new activity name and start it, and it automatically becomes a preset for future use. This keeps the primary UI clean and focused on the core task of tracking time.

## Design Overview

The application is a simple, single-page activity tracker built with vanilla HTML, CSS, and JavaScript. It is designed to be mobile-friendly, offline-first, and installable as a Progressive Web App (PWA).

### File Structure

-   **`index.html`**: The main HTML file containing the structure of the user interface.
-   **`style.css`**: The stylesheet responsible for the application's visual appearance.
-   **`app.js`**: The core of the application, handling all logic.
-   **`manifest.json`**: The web app manifest file for PWA capabilities.
-   **`service-worker.js`**: Provides offline support by caching assets.

### Data Persistence

All application data is stored in the browser's `localStorage`.

-   **Activities**: Daily activities are stored under a key formatted as `log-YYYY-MM-DD`. Each entry is an array of activity objects.
    ```json
    [
      {"id": 1678886400000, "name": "Work", "startTime": 1678886400000, "endTime": 1678897200000}
    ]
    ```
-   **Presets**: User-defined activity presets are stored under the key `presets`. Each preset is an object containing its name and an automatically assigned color.
    ```json
    [
      {"name": "Work", "color": "#ff6384"},
      {"name": "Lunch", "color": "#36a2eb"}
    ]
    ```

## Extending the Application

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

### Modifying the Service Worker

If you add new assets (like images, fonts, or JavaScript libraries), you must update the `ASSETS` array in `service-worker.js` to ensure they are cached for offline use.