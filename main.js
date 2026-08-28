const MAX_SPEED = 200;

const SUNSET_CONFIG = {
  sunriseMinutes: 6 * 60 + 7,   // 06:07
  sunsetMinutes: 17 * 60 + 41   // 17:41
};

const GPS_CONFIG = {
  enableHighAccuracy: true,
  maximumAge: 500,
  timeout: 10000,
  minAccuracy: 20,        // ignora leituras acima disso para acumular km
  minDeltaSec: 1.0,       // intervalo mínimo entre leituras usadas
  minSpeedThreshold: 1.5  // trava anti-drift: abaixo disso não soma km e agulha vai a zero (km/h)
};

const GAUGE_CONFIG = {
  numCX: 195.3,
  numCY: 195.2,
  numR: 112.0,
  startAngle: 145,
  sweepAngle: 250
};

let state = {
  currentSpeed: 0,
  targetSpeed: 0,
  needleAngle: GAUGE_CONFIG.startAngle,
  needleVelocity: 0,
  odoTotal: parseFloat(localStorage.getItem('odoTotal')) || 59281.0,
  odoTrip: parseFloat(localStorage.getItem('odoTrip')) || 0.0,
  oilIntervalKm: parseFloat(localStorage.getItem('oilIntervalKm')) || 5000,
  oilLastKm: (() => {
    const v = parseFloat(localStorage.getItem('oilLastKm'));
    if (!isNaN(v) && v >= 0) return v;
    const cur = parseFloat(localStorage.getItem('odoTotal')) || 59281.0;
    localStorage.setItem('oilLastKm', cur.toFixed(3));
    return cur;
  })(),
  oilWarnAt500: localStorage.getItem('oilWarnAt500') === '1',
  oilWarnOverdue: localStorage.getItem('oilWarnOverdue') === '1',
  oilPhase: false,
  isAccelerating: false,
  isBraking: false,
  nightMode: false,
  manualNightOverride: false,
  isSelfTesting: false,
  gpsActive: false,
  gpsAccuracy: null,
  nightColors: {
    ticks: localStorage.getItem('nightTickColor') || '#ff3333',
    numbers: localStorage.getItem('nightNumberColor') || '#ff6666'
  }
};

let lastGPSFix = null;
let wakeLock = null;
let oilAudioCtx = null;
const OIL_BEEP_STOP_KPH = 1.5; // velocidade GPS <= isso = veículo parado (bip do óleo)

function ensureOilAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!oilAudioCtx) oilAudioCtx = new AC();
  if (oilAudioCtx.state === 'suspended') oilAudioCtx.resume();
  return oilAudioCtx;
}

function playOilBeep() {
  const ctx = ensureOilAudio();
  if (!ctx) return;
  const now = ctx.currentTime;
  [[0, 1100], [0.22, 880]].forEach(([delay, freq]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + delay);
    gain.gain.exponentialRampToValueAtTime(0.45, now + delay + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + delay);
    osc.stop(now + delay + 0.16);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  applyNightColors();
  checkAutoNightMode();
  drawGaugeFace();
  initOdometerStrips();
  initControls();
  initColorPickers();
  initPressAndHoldOptions(); // DETECTA DEDO SEGURADO FORA DO PAINEL
  initConfigModalLogic();     // CONTROLES INTERNOS DO MODAL
  initOilControl();           // CONTROLE DE TROCA DE ÓLEO NO LCD
  initClock();
  initGPS();
  requestWakeLock();
  if (!localStorage.getItem('selftest_done')) {
    runSelfTest();
    localStorage.setItem('selftest_done', '1');
  }
  startPhysicsLoop();

  setInterval(checkAutoNightMode, 60000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') requestWakeLock();
  });
});

function applyNightColors() {
  document.documentElement.style.setProperty('--night-tick-color', state.nightColors.ticks);
  document.documentElement.style.setProperty('--night-number-color', state.nightColors.numbers);
}

function checkAutoNightMode() {
  if (state.manualNightOverride) return;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const shouldBeNight = currentMinutes < SUNSET_CONFIG.sunriseMinutes || currentMinutes >= SUNSET_CONFIG.sunsetMinutes;

  if (state.nightMode !== shouldBeNight) {
    state.nightMode = shouldBeNight;
    document.body.classList.toggle('night-mode', state.nightMode);
  }
}

function updateGPSStatus(accuracyInMeters) {
  const ledGroup = document.getElementById('gps-led-group');
  if (!ledGroup) return;

  ledGroup.classList.remove('gps-led-off', 'gps-led-warn', 'gps-led-high');

  if (accuracyInMeters === null || isNaN(accuracyInMeters)) {
    ledGroup.classList.add('gps-led-off');
  } else if (accuracyInMeters <= 15) {
    ledGroup.classList.add('gps-led-high');
  } else {
    ledGroup.classList.add('gps-led-warn');
  }
}

/* TOAST — feedback não-bloqueante, seguro com luva */
function showToast(message, type = 'success', duration = 2200) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('toast-visible')));

  setTimeout(() => {
    toast.classList.remove('toast-visible');
    setTimeout(() => toast.remove(), 350);
  }, duration);
}

/* RELÓGIO LCD 24H */
function initClock() {
  const els = ['h1', 'h2', 'm1', 'm2', 's1', 's2'].map(id => document.getElementById(id));
  if (!els[0]) return;

  const update = () => {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const h = pad(now.getHours());
    const m = pad(now.getMinutes());
    const s = pad(now.getSeconds());
    const digits = [h[0], h[1], m[0], m[1], s[0], s[1]];
    els.forEach((el, i) => { if (el) el.textContent = digits[i]; });
  };

  update();
  setInterval(update, 1000);
}

/* WAKE LOCK — mantém a tela acesa no asfalto (requer HTTPS) */
async function requestWakeLock() {
  try {
    if (!('wakeLock' in navigator)) return;
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch (err) {
    console.warn('Wake Lock não disponível:', err.message);
  }
}

/* GPS — watchPosition com Haversine para velocidade + distância */
function initGPS() {
  if (!('geolocation' in navigator)) {
    updateGPSStatus(null);
    showToast('GPS não suportado neste dispositivo', 'error', 3000);
    return;
  }

  navigator.geolocation.watchPosition(
    (pos) => handleGPSPosition(pos),
    (err) => {
      updateGPSStatus(null);
      state.gpsActive = false;
      console.warn('Erro GPS:', err.message);
    },
    GPS_CONFIG
  );
}

function handleGPSPosition(pos) {
  const { latitude, longitude, accuracy, speed } = pos.coords;
  const timestamp = pos.timestamp;

  updateGPSStatus(accuracy);

  if (state.isSelfTesting) return;

  const hasPrev = lastGPSFix && (timestamp - lastGPSFix.at) >= GPS_CONFIG.minDeltaSec * 1000;

  if (hasPrev) {
    const timeDeltaSec = (timestamp - lastGPSFix.at) / 1000;
    const distanceKm = haversineKm(lastGPSFix.lat, lastGPSFix.lng, latitude, longitude);

    if (accuracy <= GPS_CONFIG.minAccuracy && timeDeltaSec > 0) {
      state.gpsActive = true;

      const speedKmh = (typeof speed === 'number' && speed >= 0)
        ? speed * 3.6
        : (distanceKm / (timeDeltaSec / 3600));

      if (speedKmh <= GPS_CONFIG.minSpeedThreshold) {
        // Drift/parado: agulha a zero e odômetro pausado
        state.targetSpeed = 0;
      } else {
        state.targetSpeed = speedKmh;

        if (distanceKm > 0.00001) {
          updateOdometerFromGPS(distanceKm, accuracy);
        }
      }
    }
  }

  lastGPSFix = { lat: latitude, lng: longitude, at: timestamp };
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function initColorPickers() {
  const pickerTicks = document.getElementById('picker-ticks');
  const pickerNumbers = document.getElementById('picker-numbers');

  if (pickerTicks) {
    pickerTicks.value = state.nightColors.ticks;
    pickerTicks.addEventListener('input', (e) => {
      state.nightColors.ticks = e.target.value;
      localStorage.setItem('nightTickColor', e.target.value);
      applyNightColors();
    });
  }

  if (pickerNumbers) {
    pickerNumbers.value = state.nightColors.numbers;
    pickerNumbers.addEventListener('input', (e) => {
      state.nightColors.numbers = e.target.value;
      localStorage.setItem('nightNumberColor', e.target.value);
      applyNightColors();
    });
  }
}

/* LÓGICA DO GESTO DE SEGURAR O DEDO FORA DO PAINEL */
function initPressAndHoldOptions() {
  const gaugeCard = document.getElementById('gauge-card');
  const configModal = document.getElementById('config-modal');
  let holdTimer = null;

  const startHold = (e) => {
    // Só ativa se tocar FORA do painel e se o modal não estiver aberto
    if (gaugeCard.contains(e.target) || (configModal && configModal.open)) return;

    holdTimer = setTimeout(() => {
      openConfigModal();
    }, 800);
  };

  const cancelHold = () => {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
  };

  document.addEventListener('mousedown', startHold);
  document.addEventListener('mouseup', cancelHold);
  document.addEventListener('mouseleave', cancelHold);

  document.addEventListener('touchstart', startHold, { passive: true });
  document.addEventListener('touchend', cancelHold);
  document.addEventListener('touchcancel', cancelHold);
}

/* CONTROLES E AÇÕES DENTRO DO DIALOG DE CONFIGURAÇÃO */
function openConfigModal() {
  const configModal = document.getElementById('config-modal');
  const inputOdo = document.getElementById('cfg-total-odo');
  const inputOil = document.getElementById('cfg-oil-interval');
  const inputOilLast = document.getElementById('cfg-oil-last');

  if (configModal && !configModal.open) {
    if (inputOdo) {
      inputOdo.value = state.odoTotal.toFixed(1);
    }
    if (inputOil) {
      inputOil.value = state.oilIntervalKm;
    }
    if (inputOilLast) {
      inputOilLast.value = state.oilLastKm.toFixed(1);
    }
    updateOilSummaryInModal();
    configModal.showModal();
  }
}

function closeConfigModal() {
  const configModal = document.getElementById('config-modal');
  if (configModal && configModal.open) configModal.close();
}

function initConfigModalLogic() {
  const configModal = document.getElementById('config-modal');
  const btnClose = document.getElementById('btn-close-config');
  const btnSaveOdo = document.getElementById('btn-save-odo');
  const btnResetTrip = document.getElementById('btn-reset-trip');
  const btnToggleNight = document.getElementById('btn-toggle-night');
  const inputOdo = document.getElementById('cfg-total-odo');

  if (btnClose) {
    btnClose.addEventListener('click', closeConfigModal);
  }

  if (configModal) {
    configModal.addEventListener('click', (e) => {
      if (e.target === configModal) closeConfigModal();
    });
  }

  if (btnSaveOdo) {
    btnSaveOdo.addEventListener('click', () => {
      const val = parseFloat(inputOdo.value.replace(',', '.'));
      if (!isNaN(val) && val >= 0) {
        state.odoTotal = val;
        localStorage.setItem('odoTotal', state.odoTotal.toFixed(3));
        updateOdometerDisplay();
        showToast('Odômetro atualizado!');
      } else {
        showToast('Valor inválido!', 'error');
      }
    });
  }

  if (btnResetTrip) {
    btnResetTrip.addEventListener('click', () => {
      state.odoTrip = 0.0;
      localStorage.setItem('odoTrip', '0.0');
      updateOdometerDisplay();
      showToast('Trip zerado!');
    });
  }

  if (btnToggleNight) {
    btnToggleNight.addEventListener('click', () => {
      state.manualNightOverride = true;
      state.nightMode = !state.nightMode;
      document.body.classList.toggle('night-mode', state.nightMode);
      showToast(state.nightMode ? 'Modo noturno ativado' : 'Modo diurno ativado');
    });
  }
}

/* CONTROLE DE TROCA DE ÓLEO — quando faltam <=500 km o relógio alterna (5s)
   entre o horário e o aviso "chave inglesa + ÓLEO" no próprio LCD. */
function initOilControl() {
  const updateOilUI = () => {
    const remaining = state.oilIntervalKm - (state.odoTotal - state.oilLastKm);
    const alert = remaining <= 500;

    if (alert && remaining > 0 && !state.oilWarnAt500) {
      state.oilWarnAt500 = true;
      localStorage.setItem('oilWarnAt500', '1');
      showToast('Faltam 500 km para a troca de óleo');
    } else if (alert && remaining <= 0 && !state.oilWarnOverdue) {
      state.oilWarnOverdue = true;
      localStorage.setItem('oilWarnOverdue', '1');
      showToast('Troca de óleo VENCIDA!', 'error');
    }

    const clockWrap = document.getElementById('clock-wrap');
    if (!clockWrap) return;
    if (alert) {
      state.oilPhase = !state.oilPhase;
      clockWrap.classList.toggle('oil-alert', state.oilPhase);
      // Bip em sincronia com o aviso visual, apenas com o veículo PARADO (GPS)
      if (state.oilPhase && state.gpsActive && state.targetSpeed <= OIL_BEEP_STOP_KPH) {
        playOilBeep();
      }
    } else {
      clockWrap.classList.remove('oil-alert');
    }
  };

  const btnSaveOil = document.getElementById('btn-save-oil');
  const inputOil = document.getElementById('cfg-oil-interval');
  if (btnSaveOil && inputOil) {
    btnSaveOil.addEventListener('click', () => {
      const val = parseFloat(inputOil.value.replace(',', '.'));
      if (!isNaN(val) && val > 0) {
        state.oilIntervalKm = Math.round(val);
        localStorage.setItem('oilIntervalKm', String(Math.round(val)));
        showToast('Intervalo de óleo: ' + Math.round(val) + ' km');
        updateOilSummaryInModal();
      } else {
        showToast('Valor inválido!', 'error');
      }
    });
  }

  const btnOilChange = document.getElementById('btn-oil-change');
  if (btnOilChange) {
    btnOilChange.addEventListener('click', registerOilChange);
  }

  const btnSaveOilLast = document.getElementById('btn-save-oil-last');
  const inputOilLast = document.getElementById('cfg-oil-last');
  if (btnSaveOilLast && inputOilLast) {
    btnSaveOilLast.addEventListener('click', () => {
      const val = parseFloat(inputOilLast.value.replace(',', '.'));
      if (!isNaN(val) && val >= 0) {
        state.oilLastKm = val;
        state.oilWarnAt500 = false;
        state.oilWarnOverdue = false;
        localStorage.setItem('oilLastKm', val.toFixed(3));
        localStorage.removeItem('oilWarnAt500');
        localStorage.removeItem('oilWarnOverdue');
        const clockWrap = document.getElementById('clock-wrap');
        if (clockWrap) clockWrap.classList.remove('oil-alert');
        updateOilSummaryInModal();
        showToast('Última troca definida em ' + val.toFixed(1) + ' km');
      } else {
        showToast('Valor inválido!', 'error');
      }
    });
  }

  const clockWrap = document.getElementById('clock-wrap');
  if (clockWrap) clockWrap.addEventListener('click', () => openConfigModal());

  // Desbloqueia o áudio no primeiro gesto (política de autoplay do mobile)
  ['touchstart', 'click', 'keydown'].forEach((ev) => {
    document.addEventListener(ev, ensureOilAudio, { passive: true });
  });

  updateOilUI();
  setInterval(updateOilUI, 5000);
}

function registerOilChange() {
  state.oilLastKm = state.odoTotal;
  state.oilWarnAt500 = false;
  state.oilWarnOverdue = false;
  state.oilPhase = false;
  localStorage.setItem('oilLastKm', state.oilLastKm.toFixed(3));
  localStorage.removeItem('oilWarnAt500');
  localStorage.removeItem('oilWarnOverdue');
  const clockWrap = document.getElementById('clock-wrap');
  if (clockWrap) clockWrap.classList.remove('oil-alert');
  updateOilSummaryInModal();
  showToast('Troca de óleo registrada em ' + state.oilLastKm.toFixed(1) + ' km');
}

function updateOilSummaryInModal() {
  const el = document.getElementById('oil-summary');
  if (!el) return;
  const elapsed = state.odoTotal - state.oilLastKm;
  const remaining = state.oilIntervalKm - elapsed;
  el.textContent = 'Rodados desde a troca: ' + Math.max(0, Math.round(elapsed)) +
    ' km · Faltam: ' + Math.round(remaining) + ' km';
}

function drawGaugeFace() {
  const ticksGroup = document.getElementById('ticks');
  const numbersGroup = document.getElementById('numbers');

  if (!ticksGroup || !numbersGroup) return;

  ticksGroup.innerHTML = '';
  numbersGroup.innerHTML = '';

  for (let speed = 0; speed <= MAX_SPEED; speed += 5) {
    const angle = GAUGE_CONFIG.startAngle + (speed / MAX_SPEED) * GAUGE_CONFIG.sweepAngle;
    const rad = (angle * Math.PI) / 180;

    const isMajor = speed % 20 === 0;
    const isMedium = speed % 10 === 0;

    const rOuter = 160;
    const rInner = isMajor ? 138 : (isMedium ? 145 : 151);

    const x1 = 200 + rInner * Math.cos(rad);
    const y1 = 200 + rInner * Math.sin(rad);
    const x2 = 200 + rOuter * Math.cos(rad);
    const y2 = 200 + rOuter * Math.sin(rad);

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", x1.toFixed(2));
    line.setAttribute("y1", y1.toFixed(2));
    line.setAttribute("x2", x2.toFixed(2));
    line.setAttribute("y2", y2.toFixed(2));
    line.setAttribute("class", isMajor || isMedium ? "tick-major" : "tick-minor");
    ticksGroup.appendChild(line);

    if (isMajor) {
      const xt = GAUGE_CONFIG.numCX + GAUGE_CONFIG.numR * Math.cos(rad);
      const yt = GAUGE_CONFIG.numCY + GAUGE_CONFIG.numR * Math.sin(rad);

      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", xt.toFixed(2));
      text.setAttribute("y", yt.toFixed(2));
      text.setAttribute("class", "gauge-number");
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "central");
      text.textContent = speed;

      numbersGroup.appendChild(text);
    }
  }
}

function initOdometerStrips() {
  const totalStrips = [0, 1, 2, 3, 4, 5].map(i => document.getElementById(`odo-total-${i}`));
  const tripStrips = [0, 1, 2, 3].map(i => document.getElementById(`odo-trip-${i}`));

  const createStripContent = (container, isDec) => {
    if (!container) return;
    container.innerHTML = '';
    for (let d = 0; d <= 10; d++) {
      const digit = d % 10;
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", isDec ? "10" : "9");
      text.setAttribute("y", (d * 22 + 11).toString());
      text.setAttribute("class", isDec ? "odo-digit-dec-item" : "odo-digit-item");
      text.textContent = digit;
      container.appendChild(text);
    }
  };

  totalStrips.forEach((el, idx) => createStripContent(el, idx === 0));
  tripStrips.forEach((el, idx) => createStripContent(el, idx === 0));

  updateOdometerDisplay();
}

function updateOdometerDisplay() {
  const renderContinuousValue = (val, prefix, count) => {
    let currentVal = val;
    
    for (let i = 0; i < count; i++) {
      const strip = document.getElementById(`${prefix}-${i}`);
      if (strip) {
        const digitOffset = currentVal % 10;
        strip.style.transform = `translateY(-${(digitOffset * 22).toFixed(2)}px)`;
      }
      
      const digit = currentVal % 10;
      if (digit > 9) {
        currentVal = Math.floor(currentVal / 10) + (digit - 9);
      } else {
        currentVal = Math.floor(currentVal / 10);
      }
    }
  };

  renderContinuousValue(state.odoTotal * 10, 'odo-total', 6);
  renderContinuousValue(state.odoTrip * 10, 'odo-trip', 4);
}

function runSelfTest() {
  state.isSelfTesting = true;
  state.targetSpeed = MAX_SPEED;
  
  updateGPSStatus(10);

  setTimeout(() => {
    state.targetSpeed = 0;
    setTimeout(() => {
      state.isSelfTesting = false;
    }, 1200);
  }, 1200);
}

function updateOdometerFromGPS(distanceInKm, accuracyInMeters = 10) {
  updateGPSStatus(accuracyInMeters);

  if (state.isSelfTesting || distanceInKm <= 0) return;

  state.odoTotal += distanceInKm;
  state.odoTrip += distanceInKm;

  localStorage.setItem('odoTotal', state.odoTotal.toFixed(3));
  localStorage.setItem('odoTrip', state.odoTrip.toFixed(3));

  updateOdometerDisplay();
}

function startPhysicsLoop() {
  let lastTime = performance.now();
  let running = true;

  function loop(now) {
    if (!running) return;

    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    if (state.isAccelerating) {
      state.targetSpeed = Math.min(MAX_SPEED, state.targetSpeed + 45 * dt);
    } else if (state.isBraking) {
      state.targetSpeed = Math.max(0, state.targetSpeed - 80 * dt);
    } else if (state.targetSpeed > 0 && !state.isSelfTesting && !state.gpsActive) {
      // Decay suave apenas quando NÃO há GPS ativo (evita "serrote" na agulha)
      state.targetSpeed = Math.max(0, state.targetSpeed - 12 * dt);
    }

    const targetAngle = GAUGE_CONFIG.startAngle + (state.targetSpeed / MAX_SPEED) * GAUGE_CONFIG.sweepAngle;
    const springConstant = 120;
    const damping = 12;

    const force = (targetAngle - state.needleAngle) * springConstant;
    state.needleVelocity += force * dt;
    state.needleVelocity -= state.needleVelocity * damping * dt;
    state.needleAngle += state.needleVelocity * dt;

    state.currentSpeed = Math.max(0, ((state.needleAngle - GAUGE_CONFIG.startAngle) / GAUGE_CONFIG.sweepAngle) * MAX_SPEED);

    const needleGroup = document.getElementById('needle-group');
    if (needleGroup) {
      const rotationAngle = state.needleAngle - 180;
      needleGroup.style.transform = `rotate(${rotationAngle.toFixed(2)}deg)`;
    }

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);

  // Pausa o loop em background para economizar bateria
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      running = false;
    } else {
      running = true;
      lastTime = performance.now();
      requestAnimationFrame(loop);
    }
  });
}

function initControls() {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') state.isAccelerating = true;
    if (e.key === 'ArrowDown') state.isBraking = true;
    if (e.key === 'n' || e.key === 'N') {
      state.manualNightOverride = true;
      state.nightMode = !state.nightMode;
      document.body.classList.toggle('night-mode', state.nightMode);
      showToast(state.nightMode ? 'Modo noturno ativado' : 'Modo diurno ativado');
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowUp') state.isAccelerating = false;
    if (e.key === 'ArrowDown') state.isBraking = false;
  });

  const tripBtn = document.getElementById('trip-btn');
  if (tripBtn) {
    tripBtn.addEventListener('click', () => {
      state.odoTrip = 0.0;
      localStorage.setItem('odoTrip', '0.0');
      updateOdometerDisplay();
      showToast('Trip zerado!');
    });
  }

  const totalOdoBtn = document.getElementById('total-odo-btn');
  if (totalOdoBtn) {
    totalOdoBtn.addEventListener('click', () => {
      openConfigModal();
    });
  }
}