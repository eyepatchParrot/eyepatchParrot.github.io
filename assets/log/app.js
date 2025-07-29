document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const newActivityNameInput = document.getElementById('new-activity-name');
    const deletePresetBtn = document.getElementById('delete-preset-btn');
    const startStopBtn = document.getElementById('start-stop-btn');
    const presetButtonsContainer = document.getElementById('preset-buttons');
    const logTitleEl = document.getElementById('log-title');
    const setDateBtn = document.getElementById('set-date-btn');
    const totalTodayEl = document.getElementById('total-today');
    const activityLogEl = document.getElementById('activity-log');
    const recentDaysListEl = document.getElementById('recent-days-list');

    // --- App State ---
    let activities = [];
    let presets = [];
    let timerInterval = null;
    let viewDate = new Date();
    let effectiveDate = new Date();

    // --- UTILITY & COLOR ---
    const formatDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const getStorageKey = (date) => `log-${formatDate(date)}`;
    const toDateTimeLocalString = (date) => `${formatDate(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    const truncateToMinute = (ms) => Math.floor(ms / 60000) * 60000;
    const generateUUID = () => ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));

    function generateColorFromString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const h = hash % 360;
        return `hsl(${h}, 70%, 50%)`;
    }

    function getActivityColor(name) {
        const preset = presets.find(p => p.name === name);
        return preset ? preset.color : generateColorFromString(name);
    }

    // --- DATA HANDLING & MIGRATION ---
    function migrateData() {
        const oldPresets = JSON.parse(localStorage.getItem('presets'));
        if (oldPresets && Array.isArray(oldPresets) && typeof oldPresets[0] === 'string') {
            presets = oldPresets.map(name => ({ name, color: generateColorFromString(name) }));
            savePresets();
        } else {
            presets = oldPresets || [];
        }
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('log-')) {
                let needsSave = false;
                const dayActivities = JSON.parse(localStorage.getItem(key));
                dayActivities.forEach(act => {
                    if (typeof act.id !== 'string') {
                        act.id = generateUUID();
                        needsSave = true;
                    }
                });
                if (needsSave) {
                    localStorage.setItem(key, JSON.stringify(dayActivities));
                }
            }
        }
    }
    const loadPresets = () => { presets = JSON.parse(localStorage.getItem('presets')) || []; };
    const savePresets = () => { localStorage.setItem('presets', JSON.stringify(presets)); };
    const loadActivities = () => { activities = JSON.parse(localStorage.getItem(getStorageKey(viewDate))) || []; };
    const saveActivities = () => { localStorage.setItem(getStorageKey(viewDate), JSON.stringify(activities)); };

    // --- CORE LOGIC ---
    function handleStartStop() {
        const current = activities.find(a => !a.endTime);
        if (current) {
            stopCurrentActivity();
        } else {
            startActivity(newActivityNameInput.value);
        }
    }

    function startActivity(name) {
        name = name.trim();
        if (!name) return;

        stopCurrentActivity();

        if (!presets.find(p => p.name === name)) {
            presets.push({ name, color: generateColorFromString(name) });
            savePresets();
        }

        const newActivity = {
            id: generateUUID(),
            name,
            startTime: truncateToMinute(new Date(effectiveDate).setHours(new Date().getHours(), new Date().getMinutes())),
            endTime: null
        };
        
        if (formatDate(viewDate) !== formatDate(effectiveDate)) {
            viewDate = new Date(effectiveDate);
            loadActivities();
        }

        activities.push(newActivity);
        saveActivities();
        newActivityNameInput.value = '';
        render();
    }

    function stopCurrentActivity() {
        const current = activities.find(a => !a.endTime);
        if (current) {
            current.endTime = truncateToMinute(Date.now());
            saveActivities();
            render();
        }
    }

    function updateActivity(id, newStart, newEnd) {
        const activity = activities.find(a => a.id === id);
        if (activity) {
            activity.startTime = newStart;
            activity.endTime = newEnd;
            saveActivities();
            render();
        }
    }

    function deletePreset() {
        const name = newActivityNameInput.value.trim();
        if (!name) return;
        presets = presets.filter(p => p.name !== name);
        savePresets();
        newActivityNameInput.value = '';
        render();
    }

    function deleteActivity(id) {
        activities = activities.filter(a => a.id !== id);
        saveActivities();
        render();
    }

    // --- RENDERING ---
    function render() {
        loadActivities();
        loadPresets();
        renderStartStopButton();
        renderPresets();
        renderLog();
        renderRecentDays();
        updateDateSpecificUI();
    }

    function renderStartStopButton() {
        const current = activities.find(a => !a.endTime);
        if (current) {
            startStopBtn.textContent = 'Stop';
            startStopBtn.classList.add('stop-btn');
        } else {
            startStopBtn.textContent = 'Start';
            startStopBtn.classList.remove('stop-btn');
        }
    }

    function renderPresets() {
        presetButtonsContainer.innerHTML = '';
        presets.forEach(preset => {
            const button = document.createElement('button');
            button.textContent = preset.name;
            button.style.borderColor = preset.color;
            button.addEventListener('click', () => startActivity(preset.name));
            presetButtonsContainer.appendChild(button);
        });
    }

    function renderLog() {
        activityLogEl.innerHTML = '';
        stopTimer();

        const allActivities = [...activities].sort((a, b) => b.startTime - a.startTime);
        
        allActivities.forEach(activity => {
            const color = getActivityColor(activity.name);
            const li = document.createElement('li');
            li.className = 'log-item';
            li.style.borderColor = color;
            li.dataset.id = activity.id;

            const isRunning = !activity.endTime;
            if (isRunning) {
                li.classList.add('is-running');
                startTimer(activity.startTime, activity.id);
            }

            const duration = (isRunning ? Date.now() : activity.endTime) - activity.startTime;
            const endTimeString = isRunning ? 'Now' : new Date(activity.endTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

            li.innerHTML = `
                <div class="log-item-view">
                    <div class="log-info">
                        <div class="log-name">${activity.name}</div>
                        <div class="log-time">${new Date(activity.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - ${endTimeString}</div>
                    </div>
                    <div class="log-duration">${formatDuration(duration)}</div>
                </div>
                <div class="log-item-edit">
                    <input type="datetime-local" class="edit-start" value="${toDateTimeLocalString(new Date(activity.startTime))}">
                    <input type="datetime-local" class="edit-end" value="${toDateTimeLocalString(new Date(activity.endTime || Date.now()))}">
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
            const dayActivities = JSON.parse(localStorage.getItem(getStorageKey(date))) || [];
            const totalMs = dayActivities.reduce((sum, a) => sum + (a.endTime ? a.endTime - a.startTime : 0), 0);

            const li = document.createElement('li');
            li.className = 'recent-day-item';
            if (formatDate(date) === formatDate(viewDate)) li.classList.add('active');
            li.dataset.date = date.toISOString();
            
            const summaryBar = document.createElement('div');
            summaryBar.className = 'day-summary-bar';
            if (totalMs > 0) {
                const completedActivities = dayActivities.filter(a => a.endTime).sort((a,b) => a.endTime - b.endTime);
                completedActivities.forEach(activity => {
                    const duration = activity.endTime - activity.startTime;
                    const color = getActivityColor(activity.name);
                    const segment = document.createElement('div');
                    segment.style.width = `${(duration / totalMs) * 100}%`;
                    segment.style.backgroundColor = color;
                    segment.title = `${activity.name}: ${formatDuration(duration)}`;
                    summaryBar.appendChild(segment);
                });
            }

            li.innerHTML = `
                <div class="recent-day-header">
                    <span class="recent-day-date">${i === 0 ? 'Today' : date.toLocaleDateString([], { weekday: 'long' })}</span>
                    <span class="recent-day-total">${formatDuration(totalMs)}</span>
                </div>`;
            li.appendChild(summaryBar);
            recentDaysListEl.appendChild(li);
        }
    }
    
    function updateDateSpecificUI() {
        const isToday = formatDate(viewDate) === formatDate(new Date());
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        let title = viewDate.toLocaleDateString(undefined, options);
        if (isToday) {
            title += ' - Today';
        }
        logTitleEl.textContent = title;
        setDateBtn.hidden = formatDate(viewDate) === formatDate(effectiveDate);
    }

    // --- TIMER & FORMATTING ---
    const startTimer = (startTime, activityId) => {
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            const logItem = activityLogEl.querySelector(`.log-item[data-id="${activityId}"]`);
            if (logItem) {
                const durationEl = logItem.querySelector('.log-duration');
                const timeEl = logItem.querySelector('.log-time');
                durationEl.textContent = formatDuration(Date.now() - startTime);
                timeEl.textContent = `${new Date(startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - Now`;
            }
        }, 1000 * 1);
    };
    const stopTimer = () => { if (timerInterval) clearInterval(timerInterval); };
    const formatDuration = (ms) => {
        if (ms < 0) ms = 0;
        const totalMinutes = Math.floor(ms / 60000);
        const hrs = Math.floor(totalMinutes / 60);
        const mins = totalMinutes % 60;
        return `${hrs}h ${mins}m`;
    };
    const updateTotalTime = () => {
        const total = activities.filter(a => a.endTime).reduce((sum, a) => sum + (a.endTime - a.startTime), 0);
        totalTodayEl.querySelector('strong').textContent = formatDuration(total);
    };

    // --- EVENT LISTENERS ---
    startStopBtn.addEventListener('click', handleStartStop);
    newActivityNameInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleStartStop(); });
    deletePresetBtn.addEventListener('click', deletePreset);
    setDateBtn.addEventListener('click', () => { effectiveDate = new Date(viewDate); render(); });
    recentDaysListEl.addEventListener('click', (e) => {
        const item = e.target.closest('.recent-day-item');
        if (item) { viewDate = new Date(item.dataset.date); render(); }
    });
    activityLogEl.addEventListener('click', (e) => {
        const item = e.target.closest('.log-item');
        if (!item) return;
        const id = item.dataset.id;
        const view = item.querySelector('.log-item-view');
        const edit = item.querySelector('.log-item-edit');

        if (e.target.closest('.log-item-view')) {
            document.querySelectorAll('.log-item-edit').forEach(el => el.style.display = 'none');
            document.querySelectorAll('.log-item-view').forEach(el => el.style.display = 'flex');
            view.style.display = 'none';
            edit.style.display = 'flex';
        }
        if (e.target.classList.contains('save-btn')) {
            const newStart = truncateToMinute(new Date(edit.querySelector('.edit-start').value).getTime());
            const newEnd = truncateToMinute(new Date(edit.querySelector('.edit-end').value).getTime());
            updateActivity(id, newStart, newEnd);
        }
        if (e.target.classList.contains('cancel-btn')) {
            view.style.display = 'flex';
            edit.style.display = 'none';
        }
        if (e.target.classList.contains('delete-btn')) {
            if (confirm('Are you sure?')) deleteActivity(id);
        }
    });

    // --- INIT ---
    function init() {
        migrateData();
        render();
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./service-worker.js').catch(err => console.error('SW reg failed:', err));
        }
        if (!navigator.onLine) {
            document.body.classList.add('offline');
        }
    }

    init();
});
