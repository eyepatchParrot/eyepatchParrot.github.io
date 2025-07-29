document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const currentActivityCard = document.getElementById('current-activity-card');
    const newActivityNameInput = document.getElementById('new-activity-name');
    const startActivityBtn = document.getElementById('start-activity-btn');
    const presetButtonsContainer = document.getElementById('preset-buttons');
    const logTitleEl = document.getElementById('log-title');
    const setDateBtn = document.getElementById('set-date-btn');
    const totalTodayEl = document.getElementById('total-today');
    const activityLogEl = document.getElementById('activity-log');
    const recentDaysListEl = document.getElementById('recent-days-list');

    // --- App State ---
    let activities = [];
    let presets = JSON.parse(localStorage.getItem('presets')) || ['Work', 'Play', 'Eat', 'Sleep'];
    let timerInterval = null;
    let viewDate = new Date();
    let effectiveDate = new Date(); // The date used for creating new entries

    // --- UTILITY FUNCTIONS ---
    const formatDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const getStorageKey = (date) => `log-${formatDate(date)}`;
    const parseDateTimeLocal = (str) => new Date(str);
    const toDateTimeLocalString = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const h = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        return `${y}-${m}-${d}T${h}:${min}`;
    };

    // --- DATA HANDLING ---
    const loadActivities = () => { activities = JSON.parse(localStorage.getItem(getStorageKey(viewDate))) || []; };
    const saveActivities = () => { localStorage.setItem(getStorageKey(viewDate), JSON.stringify(activities)); };
    const savePresets = () => { localStorage.setItem('presets', JSON.stringify(presets)); };

    // --- CORE LOGIC ---
    function startActivity(name) {
        name = name.trim();
        if (!name) return;

        stopCurrentActivity(); // End previous activity if any

        const newActivity = {
            id: Date.now(),
            name,
            startTime: new Date(effectiveDate).setHours(new Date().getHours(), new Date().getMinutes(), new Date().getSeconds()),
            endTime: null
        };
        
        // If starting on a different day, load that day's activities
        if (formatDate(viewDate) !== formatDate(effectiveDate)) {
            viewDate = new Date(effectiveDate);
            loadActivities();
        }

        activities.push(newActivity);
        if (!presets.includes(name)) {
            presets.push(name);
            savePresets();
        }
        saveActivities();
        render();
    }

    function stopCurrentActivity() {
        const current = activities.find(a => !a.endTime);
        if (current) {
            current.endTime = Date.now();
            saveActivities();
        }
    }

    function updateActivity(id, newName, newStart, newEnd) {
        const activity = activities.find(a => a.id === id);
        if (activity) {
            activity.name = newName;
            activity.startTime = newStart;
            activity.endTime = newEnd;
            saveActivities();
            render();
        }
    }

    function deleteActivity(id) {
        activities = activities.filter(a => a.id !== id);
        saveActivities();
        render();
    }

    // --- RENDERING ---
    function render() {
        loadActivities();
        renderCurrentActivity();
        renderPresets();
        renderLog();
        renderRecentDays();
        updateDateSpecificUI();
    }

    function renderCurrentActivity() {
        const current = activities.find(a => !a.endTime);
        if (current) {
            currentActivityCard.innerHTML = `
                <h2>Current Activity</h2>
                <div class="current-info">
                    <p><span id="current-activity-name">${current.name}</span></p>
                    <div class="timer" id="timer">00:00:00</div>
                    <div class="controls">
                        <button id="stop-btn" class="stop-btn">Stop</button>
                    </div>
                </div>`;
            currentActivityCard.hidden = false;
            document.getElementById('stop-btn').addEventListener('click', () => {
                stopCurrentActivity();
                render();
            });
            startTimer(current.startTime);
        } else {
            currentActivityCard.hidden = true;
            stopTimer();
        }
    }

    function renderPresets() {
        presetButtonsContainer.innerHTML = '';
        presets.forEach(preset => {
            const button = document.createElement('button');
            button.textContent = preset;
            button.addEventListener('click', () => {
                newActivityNameInput.value = preset;
                startActivity(preset);
            });
            presetButtonsContainer.appendChild(button);
        });
    }

    function renderLog() {
        activityLogEl.innerHTML = '';
        const completed = activities.filter(a => a.endTime).sort((a, b) => b.startTime - a.startTime);

        completed.forEach(activity => {
            const li = document.createElement('li');
            li.className = 'log-item';
            li.dataset.id = activity.id;
            const duration = activity.endTime - activity.startTime;

            li.innerHTML = `
                <div class="log-item-view">
                    <div class="log-info">
                        <div class="log-name">${activity.name}</div>
                        <div class="log-time">${new Date(activity.startTime).toLocaleTimeString()} - ${new Date(activity.endTime).toLocaleTimeString()}</div>
                    </div>
                    <div class="log-duration">${formatDuration(duration)}</div>
                </div>
                <div class="log-item-edit">
                    <div class="edit-field">
                        <label>Name</label>
                        <input type="text" class="edit-name" value="${activity.name}">
                    </div>
                    <div class="edit-field">
                        <label>Start Time</label>
                        <input type="datetime-local" class="edit-start" value="${toDateTimeLocalString(new Date(activity.startTime))}">
                    </div>
                    <div class="edit-field">
                        <label>End Time</label>
                        <input type="datetime-local" class="edit-end" value="${toDateTimeLocalString(new Date(activity.endTime))}">
                    </div>
                    <div class="edit-controls">
                        <button class="save-btn">Save</button>
                        <button class="cancel-btn">Cancel</button>
                        <button class="delete-btn">Delete</button>
                    </div>
                </div>`;
            activityLogEl.appendChild(li);
        });
        updateTotalTime();
    }

    function renderRecentDays() {
        recentDaysListEl.innerHTML = '';
        for (let i = 0; i < 7; i++) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const key = getStorageKey(date);
            const dayActivities = JSON.parse(localStorage.getItem(key)) || [];
            const total = dayActivities.reduce((sum, a) => sum + (a.endTime ? a.endTime - a.startTime : 0), 0);

            const li = document.createElement('li');
            li.className = 'recent-day-item';
            if (formatDate(date) === formatDate(viewDate)) li.classList.add('active');
            li.dataset.date = date.toISOString();
            li.innerHTML = `
                <span class="recent-day-date">${i === 0 ? 'Today' : i === 1 ? 'Yesterday' : date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</span>
                <span class="recent-day-total">${formatDuration(total)}</span>`;
            recentDaysListEl.appendChild(li);
        }
    }
    
    function updateDateSpecificUI() {
        const isToday = formatDate(viewDate) === formatDate(new Date());
        const isEffectiveDate = formatDate(viewDate) === formatDate(effectiveDate);

        logTitleEl.textContent = isToday ? "Today's Log" : `Log for ${viewDate.toLocaleDateString()}`;
        setDateBtn.hidden = isEffectiveDate;
        totalTodayEl.querySelector('strong').textContent = formatDuration(activities.reduce((sum, a) => sum + (a.endTime ? a.endTime - a.startTime : 0), 0));
    }

    // --- TIMER & FORMATTING ---
    const startTimer = (startTime) => {
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            document.querySelector('.timer').textContent = formatTime(Date.now() - startTime);
        }, 1000);
    };
    const stopTimer = () => { if (timerInterval) clearInterval(timerInterval); };
    const formatTime = (ms) => {
        const s = Math.floor(ms / 1000);
        return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    };
    const formatDuration = (ms) => {
        if (ms < 0) ms = 0;
        const mins = Math.floor(ms / 60000);
        const hrs = Math.floor(mins / 60);
        return `${hrs}h ${mins % 60}m`;
    };
    const updateTotalTime = () => {
        const total = activities.filter(a => a.endTime).reduce((sum, a) => sum + (a.endTime - a.startTime), 0);
        totalTodayEl.querySelector('strong').textContent = formatDuration(total);
    };

    // --- EVENT LISTENERS ---
    startActivityBtn.addEventListener('click', () => startActivity(newActivityNameInput.value));
    newActivityNameInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') startActivity(newActivityNameInput.value); });
    
    setDateBtn.addEventListener('click', () => {
        effectiveDate = new Date(viewDate);
        render();
    });

    recentDaysListEl.addEventListener('click', (e) => {
        const item = e.target.closest('.recent-day-item');
        if (item) {
            viewDate = new Date(item.dataset.date);
            render();
        }
    });

    activityLogEl.addEventListener('click', (e) => {
        const item = e.target.closest('.log-item');
        if (!item) return;
        const id = parseInt(item.dataset.id);
        const view = item.querySelector('.log-item-view');
        const edit = item.querySelector('.log-item-edit');

        if (e.target.closest('.log-item-view')) {
            view.style.display = 'none';
            edit.style.display = 'flex';
        }
        if (e.target.classList.contains('save-btn')) {
            const newName = edit.querySelector('.edit-name').value;
            const newStart = parseDateTimeLocal(edit.querySelector('.edit-start').value).getTime();
            const newEnd = parseDateTimeLocal(edit.querySelector('.edit-end').value).getTime();
            updateActivity(id, newName, newStart, newEnd);
        }
        if (e.target.classList.contains('cancel-btn')) {
            view.style.display = 'flex';
            edit.style.display = 'none';
        }
        if (e.target.classList.contains('delete-btn')) {
            if (confirm('Are you sure you want to delete this entry?')) {
                deleteActivity(id);
            }
        }
    });

    // --- PWA & OFFLINE ---
    const registerServiceWorker = () => {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./service-worker.js').catch(err => console.error('Service worker registration failed:', err));
        }
    };
    const handleConnectionStatus = () => {
        const update = () => document.body.classList.toggle('offline', !navigator.onLine);
        window.addEventListener('online', update);
        window.addEventListener('offline', update);
        update();
    };

    // --- INITIALIZATION ---
    function init() {
        render();
        registerServiceWorker();
        handleConnectionStatus();
    }

    init();
});