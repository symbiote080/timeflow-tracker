/**
 * TimeFlow - Time Tracker App
 * Main JavaScript Application
 */

// ============================================
// APP STATE & CONFIGURATION
// ============================================
const APP_CONFIG = {
    STORAGE_KEYS: {
        SETTINGS: 'timeflow_settings',
        LOGS: 'timeflow_logs',
        SETUP_COMPLETE: 'timeflow_setup_complete'
    },
    ACTIVITIES: {
        work: { emoji: '💼', label: 'Work', color: '#22c55e' },
        rest: { emoji: '☕', label: 'Rest', color: '#3b82f6' },
        doomscroll: { emoji: '📱', label: 'Doomscroll', color: '#f97316' },
        other: { emoji: '✨', label: 'Other', color: '#a855f7' }
    }
};

let appState = {
    settings: {
        startTime: '09:00',
        endTime: '18:00',
        notificationsEnabled: false
    },
    logs: {},
    currentLogHour: null,
    notificationInterval: null,
    productivityChart: null
};

// ============================================
// UTILITY FUNCTIONS
// ============================================
const Utils = {
    formatTime12h(time24) {
        const [hours, minutes] = time24.split(':').map(Number);
        const period = hours >= 12 ? 'PM' : 'AM';
        const hours12 = hours % 12 || 12;
        return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
    },

    formatTimeRange(startHour) {
        const start = `${startHour.toString().padStart(2, '0')}:00`;
        const endHour = (startHour + 1) % 24;
        const end = `${endHour.toString().padStart(2, '0')}:00`;
        return `${this.formatTime12h(start)} - ${this.formatTime12h(end)}`;
    },

    getDateKey(date = new Date()) {
        return date.toISOString().split('T')[0];
    },

    formatDateDisplay(dateKey) {
        const date = new Date(dateKey + 'T00:00:00');
        const options = { weekday: 'long', month: 'long', day: 'numeric' };
        return date.toLocaleDateString('en-US', options);
    },

    isWithinWorkHours(hour, settings) {
        const startHour = parseInt(settings.startTime.split(':')[0]);
        const endHour = parseInt(settings.endTime.split(':')[0]);
        return hour >= startHour && hour < endHour;
    },

    getWorkHoursArray(settings) {
        const startHour = parseInt(settings.startTime.split(':')[0]);
        const endHour = parseInt(settings.endTime.split(':')[0]);
        const hours = [];
        for (let h = startHour; h < endHour; h++) {
            hours.push(h);
        }
        return hours;
    }
};

// ============================================
// STORAGE MANAGEMENT
// ============================================
const Storage = {
    save(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (e) {
            console.error('Storage save error:', e);
        }
    },

    load(key, defaultValue = null) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : defaultValue;
        } catch (e) {
            console.error('Storage load error:', e);
            return defaultValue;
        }
    },

    remove(key) {
        localStorage.removeItem(key);
    },

    clearAll() {
        Object.values(APP_CONFIG.STORAGE_KEYS).forEach(key => this.remove(key));
    }
};

// ============================================
// DOM ELEMENTS
// ============================================
const DOM = {
    // Screens
    setupScreen: document.getElementById('setup-screen'),
    dashboardScreen: document.getElementById('dashboard-screen'),

    // Setup
    stepNotifications: document.getElementById('step-notifications'),
    stepWorkhours: document.getElementById('step-workhours'),
    enableNotificationsBtn: document.getElementById('enable-notifications-btn'),
    skipNotificationsBtn: document.getElementById('skip-notifications-btn'),
    startTimeInput: document.getElementById('start-time'),
    endTimeInput: document.getElementById('end-time'),
    completeSetupBtn: document.getElementById('complete-setup-btn'),

    // Dashboard
    settingsBtn: document.getElementById('settings-btn'),
    tabBtns: document.querySelectorAll('.tab-btn'),
    tabPanels: document.querySelectorAll('.tab-panel'),
    todayDate: document.getElementById('today-date'),
    timeline: document.getElementById('timeline'),
    logHourBtn: document.getElementById('log-hour-btn'),

    // Stats
    workHours: document.getElementById('work-hours'),
    restHours: document.getElementById('rest-hours'),
    doomscrollHours: document.getElementById('doomscroll-hours'),
    otherHours: document.getElementById('other-hours'),

    // Analytics
    periodBtns: document.querySelectorAll('.period-btn'),
    productivityChart: document.getElementById('productivity-chart'),
    insights: document.getElementById('insights'),

    // History
    historyList: document.getElementById('history-list'),

    // Modals
    logModal: document.getElementById('log-modal'),
    settingsModal: document.getElementById('settings-modal'),
    logHourDisplay: document.getElementById('log-hour-display'),
    activityBtns: document.querySelectorAll('.activity-btn'),
    logNote: document.getElementById('log-note'),
    submitLogBtn: document.getElementById('submit-log-btn'),

    // Settings Modal
    settingsStartTime: document.getElementById('settings-start-time'),
    settingsEndTime: document.getElementById('settings-end-time'),
    notificationsToggle: document.getElementById('notifications-toggle'),
    clearDataBtn: document.getElementById('clear-data-btn'),
    saveSettingsBtn: document.getElementById('save-settings-btn')
};

// ============================================
// NOTIFICATION SYSTEM
// ============================================
const Notifications = {
    async requestPermission() {
        if (!('Notification' in window)) {
            console.log('Notifications not supported');
            return false;
        }

        if (Notification.permission === 'granted') {
            return true;
        }

        if (Notification.permission !== 'denied') {
            const permission = await Notification.requestPermission();
            return permission === 'granted';
        }

        return false;
    },

    async show(title, body, onClick) {
        if (Notification.permission !== 'granted') return;

        const notification = new Notification(title, {
            body,
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="%236366f1"/></svg>',
            badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="%236366f1"/></svg>',
            requireInteraction: true,
            tag: 'timeflow-reminder'
        });

        notification.onclick = () => {
            window.focus();
            notification.close();
            if (onClick) onClick();
        };
    },

    startHourlyCheck() {
        // Clear any existing interval
        if (appState.notificationInterval) {
            clearInterval(appState.notificationInterval);
        }

        // Check every minute
        appState.notificationInterval = setInterval(() => {
            this.checkAndNotify();
        }, 60000);

        // Also check immediately
        this.checkAndNotify();
    },

    checkAndNotify() {
        if (!appState.settings.notificationsEnabled) return;

        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();

        // Notify at the start of each hour (within first 5 minutes)
        if (currentMinute > 5) return;

        // Check if within work hours
        if (!Utils.isWithinWorkHours(currentHour, appState.settings)) return;

        // Check if previous hour is already logged
        const previousHour = currentHour - 1;
        const dateKey = Utils.getDateKey();
        const dayLogs = appState.logs[dateKey] || {};

        if (!dayLogs[previousHour] && Utils.isWithinWorkHours(previousHour, appState.settings)) {
            this.show(
                '⏰ Time to log!',
                `How did you spend ${Utils.formatTimeRange(previousHour)}?`,
                () => openLogModal(previousHour)
            );
        }
    }
};

// ============================================
// CHART MANAGEMENT
// ============================================
const Charts = {
    init() {
        if (appState.productivityChart) {
            appState.productivityChart.destroy();
        }

        const ctx = DOM.productivityChart.getContext('2d');

        appState.productivityChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Work', 'Rest', 'Doomscroll', 'Other'],
                datasets: [{
                    data: [0, 0, 0, 0],
                    backgroundColor: [
                        APP_CONFIG.ACTIVITIES.work.color,
                        APP_CONFIG.ACTIVITIES.rest.color,
                        APP_CONFIG.ACTIVITIES.doomscroll.color,
                        APP_CONFIG.ACTIVITIES.other.color
                    ],
                    borderWidth: 0,
                    hoverOffset: 10
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '65%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#64748b',
                            padding: 20,
                            font: {
                                family: 'Inter',
                                size: 12
                            }
                        }
                    }
                }
            }
        });
    },

    update(period = 'week') {
        const data = this.calculatePeriodData(period);

        if (appState.productivityChart) {
            appState.productivityChart.data.datasets[0].data = [
                data.work,
                data.rest,
                data.doomscroll,
                data.other
            ];
            appState.productivityChart.update();
        }

        this.updateInsights(data, period);
    },

    calculatePeriodData(period) {
        const days = period === 'week' ? 7 : 30;
        const totals = { work: 0, rest: 0, doomscroll: 0, other: 0 };

        for (let i = 0; i < days; i++) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateKey = Utils.getDateKey(date);
            const dayLogs = appState.logs[dateKey] || {};

            Object.values(dayLogs).forEach(log => {
                if (totals.hasOwnProperty(log.activity)) {
                    totals[log.activity]++;
                }
            });
        }

        return totals;
    },

    updateInsights(data, period) {
        const total = data.work + data.rest + data.doomscroll + data.other;
        const insights = [];

        if (total === 0) {
            DOM.insights.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📊</div>
                    <h3>No data yet</h3>
                    <p>Start logging your hours to see insights!</p>
                </div>
            `;
            return;
        }

        const workPercent = Math.round((data.work / total) * 100);
        const doomscrollPercent = Math.round((data.doomscroll / total) * 100);

        if (workPercent >= 60) {
            insights.push({
                icon: '🎯',
                title: 'Productivity Champion!',
                text: `You spent ${workPercent}% of your time working. Keep it up!`
            });
        } else if (workPercent >= 40) {
            insights.push({
                icon: '💪',
                title: 'Good Progress',
                text: `${workPercent}% work time. Room for improvement!`
            });
        }

        if (doomscrollPercent >= 20) {
            insights.push({
                icon: '📱',
                title: 'Screen Time Alert',
                text: `${doomscrollPercent}% of your time was spent doomscrolling.`
            });
        }

        if (data.rest > 0) {
            insights.push({
                icon: '☕',
                title: 'Rest Balance',
                text: `You took ${data.rest} ${data.rest === 1 ? 'hour' : 'hours'} of rest. Balance is key!`
            });
        }

        DOM.insights.innerHTML = insights.map(i => `
            <div class="insight-card">
                <div class="insight-icon">${i.icon}</div>
                <div class="insight-content">
                    <h4>${i.title}</h4>
                    <p>${i.text}</p>
                </div>
            </div>
        `).join('') || `
            <div class="insight-card">
                <div class="insight-icon">📈</div>
                <div class="insight-content">
                    <h4>Keep Logging</h4>
                    <p>Log more hours to get personalized insights!</p>
                </div>
            </div>
        `;
    }
};

// ============================================
// UI RENDERING
// ============================================
function renderTimeline() {
    const dateKey = Utils.getDateKey();
    const dayLogs = appState.logs[dateKey] || {};
    const workHours = Utils.getWorkHoursArray(appState.settings);

    DOM.timeline.innerHTML = workHours.map(hour => {
        const log = dayLogs[hour];
        const isLogged = !!log;
        const activity = log ? APP_CONFIG.ACTIVITIES[log.activity] : null;

        return `
            <div class="timeline-item ${isLogged ? 'logged ' + log.activity : ''}" data-hour="${hour}">
                <span class="timeline-time">${Utils.formatTimeRange(hour)}</span>
                <div class="timeline-activity">
                    <span class="timeline-emoji">${isLogged ? activity.emoji : '⬜'}</span>
                    <span class="timeline-label">${isLogged ? activity.label : 'Not logged'}</span>
                </div>
                ${log?.note ? `<span class="timeline-note">${log.note}</span>` : ''}
            </div>
        `;
    }).join('');

    // Add click handlers
    DOM.timeline.querySelectorAll('.timeline-item').forEach(item => {
        item.addEventListener('click', () => {
            const hour = parseInt(item.dataset.hour);
            openLogModal(hour);
        });
    });
}

function renderStats() {
    const dateKey = Utils.getDateKey();
    const dayLogs = appState.logs[dateKey] || {};

    const counts = { work: 0, rest: 0, doomscroll: 0, other: 0 };
    Object.values(dayLogs).forEach(log => {
        if (counts.hasOwnProperty(log.activity)) {
            counts[log.activity]++;
        }
    });

    DOM.workHours.textContent = `${counts.work}h`;
    DOM.restHours.textContent = `${counts.rest}h`;
    DOM.doomscrollHours.textContent = `${counts.doomscroll}h`;
    DOM.otherHours.textContent = `${counts.other}h`;
}

function renderHistory() {
    const sortedDates = Object.keys(appState.logs).sort().reverse();

    if (sortedDates.length === 0) {
        DOM.historyList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📅</div>
                <h3>No history yet</h3>
                <p>Your logged hours will appear here.</p>
            </div>
        `;
        return;
    }

    DOM.historyList.innerHTML = sortedDates.slice(0, 14).map(dateKey => {
        const dayLogs = appState.logs[dateKey];
        const entries = Object.entries(dayLogs).sort((a, b) => a[0] - b[0]);

        const counts = { work: 0, rest: 0, doomscroll: 0, other: 0 };
        entries.forEach(([, log]) => {
            if (counts.hasOwnProperty(log.activity)) {
                counts[log.activity]++;
            }
        });

        return `
            <div class="history-day">
                <div class="history-day-header">
                    <span class="history-day-date">${Utils.formatDateDisplay(dateKey)}</span>
                    <div class="history-day-summary">
                        ${counts.work > 0 ? `<span class="history-summary-item">💼 ${counts.work}h</span>` : ''}
                        ${counts.rest > 0 ? `<span class="history-summary-item">☕ ${counts.rest}h</span>` : ''}
                        ${counts.doomscroll > 0 ? `<span class="history-summary-item">📱 ${counts.doomscroll}h</span>` : ''}
                    </div>
                </div>
                <div class="history-day-entries">
                    ${entries.map(([hour, log]) => `
                        <span class="history-entry ${log.activity}">
                            ${APP_CONFIG.ACTIVITIES[log.activity].emoji}
                            ${Utils.formatTimeRange(parseInt(hour))}
                        </span>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');
}

// ============================================
// MODAL FUNCTIONS
// ============================================
function openLogModal(hour) {
    appState.currentLogHour = hour;
    DOM.logHourDisplay.textContent = Utils.formatTimeRange(hour);

    // Reset selection
    DOM.activityBtns.forEach(btn => btn.classList.remove('selected'));
    DOM.logNote.value = '';

    // Check if already logged
    const dateKey = Utils.getDateKey();
    const dayLogs = appState.logs[dateKey] || {};
    const existingLog = dayLogs[hour];

    if (existingLog) {
        const btn = document.querySelector(`.activity-btn[data-activity="${existingLog.activity}"]`);
        if (btn) btn.classList.add('selected');
        DOM.logNote.value = existingLog.note || '';
    }

    DOM.logModal.classList.add('active');
}

function closeLogModal() {
    DOM.logModal.classList.remove('active');
    appState.currentLogHour = null;
}

function openSettingsModal() {
    DOM.settingsStartTime.value = appState.settings.startTime;
    DOM.settingsEndTime.value = appState.settings.endTime;
    DOM.notificationsToggle.checked = appState.settings.notificationsEnabled;
    DOM.settingsModal.classList.add('active');
}

function closeSettingsModal() {
    DOM.settingsModal.classList.remove('active');
}

function showToast(message, type = 'success') {
    // Remove existing toast
    const existingToast = document.querySelector('.toast');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ============================================
// EVENT HANDLERS
// ============================================
function setupEventListeners() {
    // Setup flow
    DOM.enableNotificationsBtn.addEventListener('click', async () => {
        const granted = await Notifications.requestPermission();
        appState.settings.notificationsEnabled = granted;
        goToWorkHoursStep();
    });

    DOM.skipNotificationsBtn.addEventListener('click', () => {
        appState.settings.notificationsEnabled = false;
        goToWorkHoursStep();
    });

    DOM.completeSetupBtn.addEventListener('click', completeSetup);

    // Tab navigation
    DOM.tabBtns.forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Dashboard buttons
    DOM.settingsBtn.addEventListener('click', openSettingsModal);
    DOM.logHourBtn.addEventListener('click', () => {
        const now = new Date();
        const currentHour = now.getHours();
        const previousHour = currentHour > 0 ? currentHour - 1 : 23;

        if (Utils.isWithinWorkHours(previousHour, appState.settings)) {
            openLogModal(previousHour);
        } else if (Utils.isWithinWorkHours(currentHour, appState.settings)) {
            openLogModal(currentHour);
        } else {
            showToast('Outside work hours!', 'error');
        }
    });

    // Activity selection (just toggle selection, don't save yet)
    DOM.activityBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            DOM.activityBtns.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
        });
    });

    // Submit log button
    DOM.submitLogBtn.addEventListener('click', () => {
        const selectedBtn = document.querySelector('.activity-btn.selected');
        if (!selectedBtn) {
            showToast('Please select an activity!', 'error');
            return;
        }
        const activity = selectedBtn.dataset.activity;
        saveLog(activity);
    });

    // Period selector
    DOM.periodBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            DOM.periodBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            Charts.update(btn.dataset.period);
        });
    });

    // Modal close
    document.querySelectorAll('.modal-close, .modal-overlay').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target.closest('.modal-content') && !e.target.classList.contains('modal-close')) return;
            closeLogModal();
            closeSettingsModal();
        });
    });

    // Settings save
    DOM.saveSettingsBtn.addEventListener('click', saveSettings);
    DOM.clearDataBtn.addEventListener('click', clearAllData);
}

function goToWorkHoursStep() {
    DOM.stepNotifications.classList.remove('active');
    DOM.stepWorkhours.classList.add('active');
}

function completeSetup() {
    const startTime = DOM.startTimeInput.value;
    const endTime = DOM.endTimeInput.value;

    if (startTime >= endTime) {
        showToast('End time must be after start time!', 'error');
        return;
    }

    appState.settings.startTime = startTime;
    appState.settings.endTime = endTime;

    Storage.save(APP_CONFIG.STORAGE_KEYS.SETTINGS, appState.settings);
    Storage.save(APP_CONFIG.STORAGE_KEYS.SETUP_COMPLETE, true);

    showDashboard();
}

function switchTab(tabId) {
    DOM.tabBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    DOM.tabPanels.forEach(panel => {
        panel.classList.toggle('active', panel.id === `${tabId}-tab`);
    });

    if (tabId === 'analytics') {
        Charts.update('week');
    } else if (tabId === 'history') {
        renderHistory();
    }
}

function saveLog(activity) {
    const dateKey = Utils.getDateKey();
    const hour = appState.currentLogHour;
    const note = DOM.logNote.value.trim();

    if (!appState.logs[dateKey]) {
        appState.logs[dateKey] = {};
    }

    appState.logs[dateKey][hour] = { activity, note, timestamp: Date.now() };
    Storage.save(APP_CONFIG.STORAGE_KEYS.LOGS, appState.logs);

    showToast('Hour logged successfully!');
    closeLogModal();
    renderTimeline();
    renderStats();
}

function saveSettings() {
    const startTime = DOM.settingsStartTime.value;
    const endTime = DOM.settingsEndTime.value;

    if (startTime >= endTime) {
        showToast('End time must be after start time!', 'error');
        return;
    }

    appState.settings.startTime = startTime;
    appState.settings.endTime = endTime;
    appState.settings.notificationsEnabled = DOM.notificationsToggle.checked;

    Storage.save(APP_CONFIG.STORAGE_KEYS.SETTINGS, appState.settings);

    if (appState.settings.notificationsEnabled) {
        Notifications.startHourlyCheck();
    }

    showToast('Settings saved!');
    closeSettingsModal();
    renderTimeline();
}

function clearAllData() {
    if (confirm('Are you sure you want to clear all data? This cannot be undone.')) {
        Storage.clearAll();
        appState.logs = {};
        appState.settings = {
            startTime: '09:00',
            endTime: '18:00',
            notificationsEnabled: false
        };
        showToast('All data cleared!');
        closeSettingsModal();
        showSetup();
    }
}

// ============================================
// SCREEN TRANSITIONS
// ============================================
function showSetup() {
    DOM.setupScreen.classList.add('active');
    DOM.dashboardScreen.classList.remove('active');
    DOM.stepNotifications.classList.add('active');
    DOM.stepWorkhours.classList.remove('active');
}

function showDashboard() {
    DOM.setupScreen.classList.remove('active');
    DOM.dashboardScreen.classList.add('active');

    // Update today's date
    DOM.todayDate.textContent = Utils.formatDateDisplay(Utils.getDateKey());

    renderTimeline();
    renderStats();
    Charts.init();

    if (appState.settings.notificationsEnabled) {
        Notifications.startHourlyCheck();
    }
}

// ============================================
// APP INITIALIZATION
// ============================================
function initApp() {
    // Load saved data
    const setupComplete = Storage.load(APP_CONFIG.STORAGE_KEYS.SETUP_COMPLETE, false);
    appState.settings = Storage.load(APP_CONFIG.STORAGE_KEYS.SETTINGS, appState.settings);
    appState.logs = Storage.load(APP_CONFIG.STORAGE_KEYS.LOGS, {});

    setupEventListeners();

    if (setupComplete) {
        showDashboard();
    } else {
        showSetup();
    }
}

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', initApp);
