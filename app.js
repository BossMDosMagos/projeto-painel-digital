(() => {
    'use strict';

    const STORAGE_KEYS = {
        TRIP_A: 'painel_trip_a',
        ODO_TOTAL: 'painel_odo_total',
        ODO_BASE: 'painel_odo_base',
        CALIBRATED: 'painel_calibrated'
    };

    const state = {
        speed: 0,
        tripA: 0,
        odoTotal: 75958,
        odoBase: 75958,
        calibrated: false,
        gpsConnected: false,
        gpsWatchId: null,
        lastPosition: null,
        lastTimestamp: null,
        wakeLock: null,
        animationFrame: null
    };

    const elements = {
        speedDisplay: document.getElementById('speed-display'),
        tripA: document.getElementById('trip-a'),
        odoTotal: document.getElementById('odo-total'),
        clock: document.getElementById('clock'),
        gpsStatus: document.getElementById('gps-status'),
        batteryLevel: document.getElementById('battery-level'),
        batteryIcon: document.querySelector('.status-icon'),
        resetTripBtn: document.getElementById('reset-trip'),
        calibrateOdoBtn: document.getElementById('calibrate-odo'),
        calibrationModal: document.getElementById('calibration-modal'),
        calibrationInput: document.getElementById('calibration-input'),
        cancelCalibration: document.getElementById('cancel-calibration'),
        confirmCalibration: document.getElementById('confirm-calibration'),
        gaugeProgress: document.getElementById('gauge-progress')
    };

    function formatSpeed(speed) {
        const s = Math.round(speed).toString();
        // 3 posições fixas: alinhado à direita, posições vazias = espaço (segmentos apagados)
        return s.padStart(3, ' ');
    }

    function formatTripA(km) {
        return km.toFixed(1).padStart(6, '0');
    }

    function formatOdoTotal(km) {
        return Math.round(km).toString().padStart(7, '0');
    }

    function formatClock(date) {
        return date.toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    }

    function updateGauge(speed) {
        if (!elements.gaugeProgress) return;
        const maxSpeed = 80;
        const circumference = 251.33; // π * 80
        const clampedSpeed = Math.min(Math.max(speed, 0), maxSpeed);
        const progress = clampedSpeed / maxSpeed;
        const offset = circumference * (1 - progress);
        elements.gaugeProgress.style.strokeDashoffset = offset;

        // Dynamic color based on speed
        let color = '#00FF66'; // green 0-40
        if (speed > 40 && speed <= 60) color = '#FFCC00'; // yellow 41-60
        else if (speed > 60) color = '#FF3333'; // red 61+
        elements.gaugeProgress.style.stroke = color;
    }

    function updateDisplay() {
        elements.speedDisplay.value = formatSpeed(state.speed);
        elements.tripA.value = formatTripA(state.tripA);
        elements.odoTotal.value = formatOdoTotal(state.odoTotal);
        updateGauge(state.speed);
    }

    function updateClock() {
        elements.clock.textContent = formatClock(new Date());
        elements.clock.dateTime = new Date().toISOString();
    }

    function saveToStorage() {
        localStorage.setItem(STORAGE_KEYS.TRIP_A, state.tripA.toString());
        localStorage.setItem(STORAGE_KEYS.ODO_TOTAL, state.odoTotal.toString());
        localStorage.setItem(STORAGE_KEYS.ODO_BASE, state.odoBase.toString());
        localStorage.setItem(STORAGE_KEYS.CALIBRATED, state.calibrated.toString());
    }

    function loadFromStorage() {
        const tripA = parseFloat(localStorage.getItem(STORAGE_KEYS.TRIP_A));
        const odoTotal = parseFloat(localStorage.getItem(STORAGE_KEYS.ODO_TOTAL));
        const odoBase = parseFloat(localStorage.getItem(STORAGE_KEYS.ODO_BASE));
        const calibrated = localStorage.getItem(STORAGE_KEYS.CALIBRATED) === 'true';

        if (!isNaN(tripA)) state.tripA = tripA;
        if (!isNaN(odoTotal)) state.odoTotal = odoTotal;
        if (!isNaN(odoBase)) state.odoBase = odoBase;
        state.calibrated = calibrated;
    }

    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371000;
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
    }

    function handlePosition(position) {
        const now = position.timestamp;
        const coords = position.coords;
        const speedMps = coords.speed;
        const accuracy = coords.accuracy;

        if (speedMps !== null && speedMps >= 0 && accuracy <= 50) {
            const speedKmh = speedMps * 3.6;
            state.speed = speedKmh;
            state.gpsConnected = true;

            if (state.lastPosition && state.lastTimestamp && now > state.lastTimestamp) {
                const distanceMeters = calculateDistance(
                    state.lastPosition.latitude,
                    state.lastPosition.longitude,
                    coords.latitude,
                    coords.longitude
                );

                const timeDiffHours = (now - state.lastTimestamp) / 3600000;

                if (distanceMeters > 1 && timeDiffHours > 0 && distanceMeters < 1000) {
                    const distanceKm = distanceMeters / 1000;
                    state.tripA += distanceKm;
                    state.odoTotal = state.odoBase + state.tripA;
                    saveToStorage();
                }
            }

            state.lastPosition = { latitude: coords.latitude, longitude: coords.longitude };
            state.lastTimestamp = now;
        } else {
            state.gpsConnected = false;
            state.speed = 0;
        }

        updateGpsStatus();
        updateDisplay();
    }

    function handleGpsError(error) {
        state.gpsConnected = false;
        state.speed = 0;
        updateGpsStatus();
        updateDisplay();
    }

    function updateGpsStatus() {
        elements.gpsStatus.classList.remove('connected', 'lost', 'searching');
        if (state.gpsConnected) {
            elements.gpsStatus.classList.add('connected');
            elements.gpsStatus.querySelector('.status-label').textContent = 'GPS';
        } else if (state.gpsWatchId !== null) {
            elements.gpsStatus.classList.add('searching');
            elements.gpsStatus.querySelector('.status-label').textContent = 'BUSCANDO';
        } else {
            elements.gpsStatus.classList.add('lost');
            elements.gpsStatus.querySelector('.status-label').textContent = 'SEM GPS';
        }
    }

    async function requestWakeLock() {
        if ('wakeLock' in navigator) {
            try {
                state.wakeLock = await navigator.wakeLock.request('screen');
                state.wakeLock.addEventListener('release', () => {
                    state.wakeLock = null;
                });
            } catch (err) {
                console.warn('Wake Lock falhou:', err.name, err.message);
            }
        }
    }

    function releaseWakeLock() {
        if (state.wakeLock) {
            state.wakeLock.release();
            state.wakeLock = null;
        }
    }

    function handleVisibilityChange() {
        if (document.visibilityState === 'visible' && state.wakeLock === null) {
            requestWakeLock();
        } else if (document.visibilityState === 'hidden') {
            releaseWakeLock();
        }
    }

    async function updateBatteryStatus() {
        if ('getBattery' in navigator) {
            try {
                const battery = await navigator.getBattery();
                const level = Math.round(battery.level * 100);
                elements.batteryLevel.textContent = `${level}%`;

                elements.batteryIcon.style.setProperty('--battery-level', `${level}%`);

                battery.addEventListener('levelchange', () => {
                    const newLevel = Math.round(battery.level * 100);
                    elements.batteryLevel.textContent = `${newLevel}%`;
                });

                battery.addEventListener('chargingchange', () => {
                    updateBatteryIcon(battery);
                });

                updateBatteryIcon(battery);
            } catch (err) {
                elements.batteryLevel.textContent = 'N/A';
            }
        } else {
            elements.batteryLevel.textContent = 'N/A';
        }
    }

    function updateBatteryIcon(battery) {
        const level = battery.level;
        const charging = battery.charging;

        if (charging) {
            elements.batteryIcon.style.background = 'linear-gradient(90deg, #27AE60 0%, #2ECC71 100%)';
        } else if (level > 0.6) {
            elements.batteryIcon.style.background = 'var(--digit-color)';
        } else if (level > 0.3) {
            elements.batteryIcon.style.background = '#F39C12';
        } else {
            elements.batteryIcon.style.background = '#E74C3C';
        }
    }

    function startGps() {
        if (!('geolocation' in navigator)) {
            state.gpsConnected = false;
            updateGpsStatus();
            return;
        }

        state.gpsWatchId = navigator.geolocation.watchPosition(
            handlePosition,
            handleGpsError,
            {
                enableHighAccuracy: true,
                maximumAge: 1000,
                timeout: 10000
            }
        );

        elements.gpsStatus.classList.add('searching');
        elements.gpsStatus.querySelector('.status-label').textContent = 'BUSCANDO';
    }

    function stopGps() {
        if (state.gpsWatchId !== null) {
            navigator.geolocation.clearWatch(state.gpsWatchId);
            state.gpsWatchId = null;
        }
        state.gpsConnected = false;
        state.speed = 0;
        updateGpsStatus();
        updateDisplay();
    }

    function resetTripA() {
        state.tripA = 0;
        state.odoTotal = state.odoBase;
        saveToStorage();
        updateDisplay();
    }

    function openCalibrationModal() {
        elements.calibrationInput.value = Math.round(state.odoBase).toString();
        elements.calibrationModal.showModal();
        elements.calibrationInput.focus();
        elements.calibrationInput.select();
    }

    function closeCalibrationModal() {
        elements.calibrationModal.close();
    }

    function confirmCalibration() {
        const value = parseInt(elements.calibrationInput.value, 10);
        if (!isNaN(value) && value >= 0) {
            const diff = state.odoTotal - state.odoBase;
            state.odoBase = value;
            state.odoTotal = state.odoBase + diff;
            state.calibrated = true;
            saveToStorage();
            updateDisplay();
            closeCalibrationModal();
        }
    }

    function initEventListeners() {
        elements.resetTripBtn.addEventListener('click', resetTripA);
        elements.calibrateOdoBtn.addEventListener('click', openCalibrationModal);
        elements.cancelCalibration.addEventListener('click', closeCalibrationModal);
        elements.confirmCalibration.addEventListener('click', confirmCalibration);

        elements.calibrationModal.addEventListener('click', (e) => {
            if (e.target === elements.calibrationModal) {
                closeCalibrationModal();
            }
        });

        elements.calibrationInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                confirmCalibration();
            } else if (e.key === 'Escape') {
                closeCalibrationModal();
            }
        });

        document.addEventListener('visibilitychange', handleVisibilityChange);

        window.addEventListener('beforeunload', () => {
            saveToStorage();
            releaseWakeLock();
        });

        window.addEventListener('focus', () => {
            requestWakeLock();
        });

        window.addEventListener('blur', () => {
            releaseWakeLock();
        });
    }

    function animationLoop() {
        updateClock();
        state.animationFrame = requestAnimationFrame(animationLoop);
    }

    async function init() {
        loadFromStorage();
        updateDisplay();
        updateClock();
        initEventListeners();
        startGps();
        await requestWakeLock();
        updateBatteryStatus();
        animationLoop();

        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js').catch(() => {});
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();