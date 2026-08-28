const MAX_SPEED = 200;

const SUNSET_CONFIG = {
  sunriseMinutes: 6 * 60 + 7,   // 06:07
  sunsetMinutes: 17 * 60 + 41   // 17:41
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
  isAccelerating: false,
  isBraking: false,
  nightMode: false,
  manualNightOverride: false,
  isSelfTesting: false,
  gpsAccuracy: null,
  nightColors: {
    ticks: localStorage.getItem('nightTickColor') || '#ff3333',
    numbers: localStorage.getItem('nightNumberColor') || '#ff6666'
  }
};

document.addEventListener("DOMContentLoaded", () => {
  applyNightColors();
  checkAutoNightMode();
  drawGaugeFace();
  initOdometerStrips();
  initControls();
  initColorPickers();
  initPressAndHoldOptions(); // DETECTA DEDO SEGURADO FORA DO PAINEL
  initConfigModalLogic();     // CONTROLES INTERNOS DO MODAL
  runSelfTest();
  startPhysicsLoop();

  setInterval(checkAutoNightMode, 60000);
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
    if (gaugeCard.contains(e.target) || configModal.contains(e.target)) return;

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

/* CONTROLES E AÇÕES DENTRO DO MODAL DE CONFIGURAÇÃO */
function openConfigModal() {
  const configModal = document.getElementById('config-modal');
  const inputOdo = document.getElementById('cfg-total-odo');

  if (inputOdo) {
    inputOdo.value = state.odoTotal.toFixed(1);
  }

  if (configModal) {
    configModal.classList.remove('hidden');
  }
}

function initConfigModalLogic() {
  const configModal = document.getElementById('config-modal');
  const btnClose = document.getElementById('btn-close-config');
  const btnSaveOdo = document.getElementById('btn-save-odo');
  const btnResetTrip = document.getElementById('btn-reset-trip');
  const btnToggleNight = document.getElementById('btn-toggle-night');
  const inputOdo = document.getElementById('cfg-total-odo');

  if (btnClose) {
    btnClose.addEventListener('click', () => {
      configModal.classList.add('hidden');
    });
  }

  if (btnSaveOdo) {
    btnSaveOdo.addEventListener('click', () => {
      const val = parseFloat(inputOdo.value.replace(',', '.'));
      if (!isNaN(val) && val >= 0) {
        state.odoTotal = val;
        localStorage.setItem('odoTotal', state.odoTotal.toFixed(3));
        updateOdometerDisplay();
        alert("Odômetro atualizado!");
      } else {
        alert("Valor inválido!");
      }
    });
  }

  if (btnResetTrip) {
    btnResetTrip.addEventListener('click', () => {
      state.odoTrip = 0.0;
      localStorage.setItem('odoTrip', '0.0');
      updateOdometerDisplay();
      alert("Trip zerado!");
    });
  }

  if (btnToggleNight) {
    btnToggleNight.addEventListener('click', () => {
      state.manualNightOverride = true;
      state.nightMode = !state.nightMode;
      document.body.classList.toggle('night-mode', state.nightMode);
    });
  }
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

  function loop(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    if (state.isAccelerating) {
      state.targetSpeed = Math.min(MAX_SPEED, state.targetSpeed + 45 * dt);
    } else if (state.isBraking) {
      state.targetSpeed = Math.max(0, state.targetSpeed - 80 * dt);
    } else if (state.targetSpeed > 0 && !state.isSelfTesting) {
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
}

function initControls() {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') state.isAccelerating = true;
    if (e.key === 'ArrowDown') state.isBraking = true;
    if (e.key === 'n' || e.key === 'N') {
      state.manualNightOverride = true;
      state.nightMode = !state.nightMode;
      document.body.classList.toggle('night-mode', state.nightMode);
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
    });
  }

  const totalOdoBtn = document.getElementById('total-odo-btn');
  if (totalOdoBtn) {
    totalOdoBtn.addEventListener('click', () => {
      openConfigModal();
    });
  }
}