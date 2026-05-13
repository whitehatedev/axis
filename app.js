// Firebase Configuration (Replace with your own!)
const firebaseConfig = {
  apiKey: "AIzaSyBLMF0Kkcn0I8fPPB28MqJVdaMnygALsSA",
  authDomain: "sagp-f925b.firebaseapp.com",
  databaseURL: "https://sagp-f925b-default-rtdb.firebaseio.com",
  projectId: "sagp-f925b",
  storageBucket: "sagp-f925b.firebasestorage.app",
  messagingSenderId: "442679740368",
  appId: "1:442679740368:web:2bdd3bc393113553fd1bd5",
  measurementId: "G-K7RTEQ6QD2"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// Global Variables
let baselineData = null;
let currentReadings = {
    voltage: null,
    current: null,
    temperature: null,
    humidity: null,
    vibration: null
};
let alertData = null;
let historyData = [];
const MACHINE_ID = "machine_01";

// Thresholds
const THRESHOLDS = {
    voltage: { percent: 15, min: 180, max: 250 },
    current: { percent: 25, max: 10 },
    temperature: { percent: 20, max: 45 },
    humidity: { percent: 20, max: 80 },
    vibration: { percent: 30 }
};

// Initialize Dashboard
document.addEventListener('DOMContentLoaded', () => {
    console.log("Dashboard Initialized");
    loadBaseline();
    setupRealtimeListeners();
    setupEventListeners();
    startAutoRefresh();
});

// Setup Event Listeners
function setupEventListeners() {
    document.getElementById('refreshBaselineBtn').addEventListener('click', () => {
        loadBaseline(true);
    });
}

// Auto Refresh Data
function startAutoRefresh() {
    setInterval(() => {
        updateLastUpdateTime();
    }, 1000);
}

// Load Baseline from Firebase
async function loadBaseline(forceRefresh = false) {
    try {
        const baselineRef = database.ref(`machines/${MACHINE_ID}/baseline`);
        const snapshot = await baselineRef.once('value');
        const data = snapshot.val();

        if (data && data.isReady) {
            baselineData = data;
            updateBaselineDisplay();
            document.getElementById('gatheringStatus').innerHTML = '<span style="color:#22c55e">✓ Completed</span>';
            document.getElementById('systemMode').innerHTML = '🔍 Monitoring Mode';
            document.getElementById('baselineDate').innerText = new Date(data.createdAt).toLocaleString();

            // Check current readings against baseline
            if (currentReadings.voltage !== null) {
                evaluateMaintenance();
            }
        } else {
            document.getElementById('gatheringStatus').innerHTML = '<span style="color:#f59e0b">⏳ Training in progress (Need 7 days data)</span>';
            document.getElementById('systemMode').innerHTML = '📊 Data Gathering Mode';
            document.getElementById('healthStatus').innerHTML = 'DATA GATHERING';
            document.getElementById('healthStatus').className = 'health-status gathering';
        }
    } catch (error) {
        console.error("Error loading baseline:", error);
    }
}

// Update Baseline Display
function updateBaselineDisplay() {
    if (baselineData) {
        document.getElementById('voltageBaseline').innerText = baselineData.voltage?.toFixed(1) || '--';
        document.getElementById('currentBaseline').innerText = baselineData.current?.toFixed(2) || '--';
        document.getElementById('tempBaseline').innerText = baselineData.temperature?.toFixed(1) || '--';
        document.getElementById('humidityBaseline').innerText = baselineData.humidity?.toFixed(1) || '--';
        document.getElementById('vibrationBaseline').innerText = baselineData.vibration?.toFixed(3) || '--';
    }
}

// Setup Realtime Listeners for all sensors
function setupRealtimeListeners() {
    // Voltage Listener
    database.ref(`machines/${MACHINE_ID}/devices/voltage/latest`).on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            currentReadings.voltage = data.value;
            document.getElementById('voltageValue').innerText = data.value?.toFixed(2) || '0.00';
            checkVoltageStatus(data.value);
            addToHistory('voltage', data.value, data.timestamp);
            evaluateMaintenance();
        }
    });

    // Current Listener
    database.ref(`machines/${MACHINE_ID}/devices/current/latest`).on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            currentReadings.current = data.value;
            document.getElementById('currentValue').innerText = data.value?.toFixed(2) || '0.00';
            checkCurrentStatus(data.value);
            addToHistory('current', data.value, data.timestamp);
            evaluateMaintenance();
        }
    });

    // DHT11 Listener
    database.ref(`machines/${MACHINE_ID}/devices/dht11/latest`).on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            currentReadings.temperature = data.temperature;
            currentReadings.humidity = data.humidity;
            document.getElementById('tempValue').innerText = data.temperature?.toFixed(1) || '--';
            document.getElementById('humidityValue').innerText = data.humidity?.toFixed(1) || '--';
            checkEnvStatus(data.temperature, data.humidity);
            addToHistory('temperature', data.temperature, data.timestamp);
            addToHistory('humidity', data.humidity, data.timestamp);
            evaluateMaintenance();
        }
    });

    // Vibration Listener
    database.ref(`machines/${MACHINE_ID}/devices/mpu6050/latest`).on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const vibrationLevel = calculateVibrationLevel(data);
            currentReadings.vibration = vibrationLevel;
            document.getElementById('vibrationValue').innerText = vibrationLevel.toFixed(3);
            checkVibrationStatus(vibrationLevel);
            addToHistory('vibration', vibrationLevel, data.timestamp);
            evaluateMaintenance();
        }
    });

    // Alert Listener
    database.ref(`machines/${MACHINE_ID}/alerts`).on('value', (snapshot) => {
        alertData = snapshot.val();
        if (alertData && alertData.maintenance) {
            showAlert(alertData);
        } else {
            document.getElementById('alertPanel').style.display = 'none';
        }
    });
}

// Calculate Vibration Level from MPU6050 data
function calculateVibrationLevel(data) {
    const ax = data.ax || 0;
    const ay = data.ay || 0;
    const az = data.az || 0;
    const gx = data.gx || 0;
    const gy = data.gy || 0;
    const gz = data.gz || 0;

    // Calculate magnitude of acceleration (vibration level)
    const magnitude = Math.sqrt(ax*ax + ay*ay + az*az);
    // Normalize (assuming 1g = 9.8 m/s²)
    const vibrationLevel = Math.abs(magnitude - 1) * 9.8;
    return vibrationLevel;
}

// Check Voltage Status
function checkVoltageStatus(voltage) {
    const card = document.getElementById('voltageCard');
    const statusSpan = document.getElementById('voltageStatus');

    if (voltage === null) return;

    let status = 'normal';
    let statusText = 'Normal';

    if (voltage < 180) {
        status = 'danger';
        statusText = '⚠️ Low Voltage Danger';
    } else if (voltage > 250) {
        status = 'danger';
        statusText = '⚠️ High Voltage Danger';
    } else if (baselineData && baselineData.voltage) {
        const changePercent = Math.abs((voltage - baselineData.voltage) / baselineData.voltage * 100);
        if (changePercent > THRESHOLDS.voltage.percent) {
            status = 'warning';
            statusText = `⚠️ Abnormal (+${changePercent.toFixed(1)}%)`;
        }
    }

    updateCardStatus(card, statusSpan, status, statusText);
}

// Check Current Status
function checkCurrentStatus(current) {
    const card = document.getElementById('currentCard');
    const statusSpan = document.getElementById('currentStatus');

    if (current === null) return;

    let status = 'normal';
    let statusText = 'Normal';

    if (current > THRESHOLDS.current.max) {
        status = 'danger';
        statusText = '⚠️ Overcurrent Danger';
    } else if (baselineData && baselineData.current) {
        const changePercent = Math.abs((current - baselineData.current) / baselineData.current * 100);
        if (changePercent > THRESHOLDS.current.percent) {
            status = 'warning';
            statusText = `⚠️ Abnormal (+${changePercent.toFixed(1)}%)`;
        }
    }

    updateCardStatus(card, statusSpan, status, statusText);
}

// Check Environment Status
function checkEnvStatus(temperature, humidity) {
    const card = document.getElementById('envCard');
    const statusSpan = document.getElementById('envStatus');

    let status = 'normal';
    let statusText = 'Normal';
    let issues = [];

    if (temperature > THRESHOLDS.temperature.max) {
        issues.push('High Temp');
        status = 'danger';
    } else if (baselineData && baselineData.temperature) {
        const tempChange = Math.abs((temperature - baselineData.temperature) / baselineData.temperature * 100);
        if (tempChange > THRESHOLDS.temperature.percent) {
            issues.push('Temp Abnormal');
            status = 'warning';
        }
    }

    if (humidity > THRESHOLDS.humidity.max) {
        issues.push('High Humidity');
        status = 'warning';
    } else if (baselineData && baselineData.humidity) {
        const humChange = Math.abs((humidity - baselineData.humidity) / baselineData.humidity * 100);
        if (humChange > THRESHOLDS.humidity.percent) {
            issues.push('Humidity Abnormal');
            status = 'warning';
        }
    }

    if (issues.length > 0) {
        statusText = `⚠️ ${issues.join(', ')}`;
    }

    updateCardStatus(card, statusSpan, status, statusText);
}

// Check Vibration Status
function checkVibrationStatus(vibration) {
    const card = document.getElementById('vibrationCard');
    const statusSpan = document.getElementById('vibrationStatus');

    let status = 'normal';
    let statusText = 'Normal';

    if (baselineData && baselineData.vibration) {
        const changePercent = Math.abs((vibration - baselineData.vibration) / baselineData.vibration * 100);
        if (changePercent > THRESHOLDS.vibration.percent) {
            status = 'danger';
            statusText = `⚠️ High Vibration (+${changePercent.toFixed(1)}%)`;
        } else if (changePercent > THRESHOLDS.vibration.percent / 2) {
            status = 'warning';
            statusText = `⚠️ Elevated Vibration (+${changePercent.toFixed(1)}%)`;
        }
    } else if (vibration > 2.0) {
        status = 'danger';
        statusText = '⚠️ Very High Vibration';
    } else if (vibration > 1.0) {
        status = 'warning';
        statusText = '⚠️ High Vibration';
    }

    updateCardStatus(card, statusSpan, status, statusText);
}

// Update Card UI based on status
function updateCardStatus(card, statusSpan, status, statusText) {
    card.classList.remove('faulty', 'normal', 'warning');
    statusSpan.classList.remove('normal', 'warning', 'danger');

    if (status === 'danger' || status === 'warning') {
        card.classList.add('faulty');
    } else {
        card.classList.add('normal');
    }

    statusSpan.classList.add(status);
    statusSpan.innerText = statusText;
}

// Evaluate if maintenance is required
function evaluateMaintenance() {
    if (!baselineData || !baselineData.isReady) {
        return;
    }

    let maintenanceRequired = false;
    let faultySensors = [];
    let alertMessage = "";

    // Check each sensor against baseline and safety rules
    if (currentReadings.voltage !== null) {
        const voltageStatus = checkVoltageAbnormality(currentReadings.voltage);
        if (voltageStatus.abnormal) {
            maintenanceRequired = true;
            faultySensors.push("Voltage Sensor");
            alertMessage += voltageStatus.message + " ";
        }
    }

    if (currentReadings.current !== null) {
        const currentStatus = checkCurrentAbnormality(currentReadings.current);
        if (currentStatus.abnormal) {
            maintenanceRequired = true;
            faultySensors.push("Current Sensor");
            alertMessage += currentStatus.message + " ";
        }
    }

    if (currentReadings.temperature !== null) {
        const tempStatus = checkTempAbnormality(currentReadings.temperature);
        if (tempStatus.abnormal) {
            maintenanceRequired = true;
            faultySensors.push("Temperature Sensor");
            alertMessage += tempStatus.message + " ";
        }
    }

    if (currentReadings.humidity !== null) {
        const humStatus = checkHumidityAbnormality(currentReadings.humidity);
        if (humStatus.abnormal) {
            maintenanceRequired = true;
            faultySensors.push("Humidity Sensor");
            alertMessage += humStatus.message + " ";
        }
    }

    if (currentReadings.vibration !== null) {
        const vibStatus = checkVibrationAbnormality(currentReadings.vibration);
        if (vibStatus.abnormal) {
            maintenanceRequired = true;
            faultySensors.push("Vibration Sensor");
            alertMessage += vibStatus.message + " ";
        }
    }

    // Update dashboard health status
    if (maintenanceRequired) {
        document.getElementById('healthStatus').innerHTML = '⚠️ MAINTENANCE REQUIRED';
        document.getElementById('healthStatus').className = 'health-status maintenance';

        // Update Firebase alert
        const alertRef = database.ref(`machines/${MACHINE_ID}/alerts`);
        alertRef.update({
            maintenance: true,
            level: "critical",
            message: alertMessage.trim(),
            faultySensors: faultySensors,
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        });
    } else {
        document.getElementById('healthStatus').innerHTML = '✅ NORMAL';
        document.getElementById('healthStatus').className = 'health-status';

        // Clear alert if exists
        const alertRef = database.ref(`machines/${MACHINE_ID}/alerts`);
        alertRef.update({
            maintenance: false,
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        });
    }
}

// Abnormality Check Functions
function checkVoltageAbnormality(voltage) {
    let abnormal = false;
    let message = "";

    if (voltage < 180) {
        abnormal = true;
        message = "Voltage too low (<180V)!";
    } else if (voltage > 250) {
        abnormal = true;
        message = "Voltage too high (>250V)!";
    } else if (baselineData && baselineData.voltage) {
        const changePercent = Math.abs((voltage - baselineData.voltage) / baselineData.voltage * 100);
        if (changePercent > THRESHOLDS.voltage.percent) {
            abnormal = true;
            message = `Voltage changed by ${changePercent.toFixed(1)}% from baseline!`;
        }
    }

    return { abnormal, message };
}

function checkCurrentAbnormality(current) {
    let abnormal = false;
    let message = "";

    if (current > THRESHOLDS.current.max) {
        abnormal = true;
        message = "Current exceeds 10A!";
    } else if (baselineData && baselineData.current) {
        const changePercent = Math.abs((current - baselineData.current) / baselineData.current * 100);
        if (changePercent > THRESHOLDS.current.percent) {
            abnormal = true;
            message = `Current changed by ${changePercent.toFixed(1)}% from baseline!`;
        }
    }

    return { abnormal, message };
}

function checkTempAbnormality(temp) {
    let abnormal = false;
    let message = "";

    if (temp > THRESHOLDS.temperature.max) {
        abnormal = true;
        message = "Temperature exceeds 45°C!";
    } else if (baselineData && baselineData.temperature) {
        const changePercent = Math.abs((temp - baselineData.temperature) / baselineData.temperature * 100);
        if (changePercent > THRESHOLDS.temperature.percent) {
            abnormal = true;
            message = `Temperature changed by ${changePercent.toFixed(1)}% from baseline!`;
        }
    }

    return { abnormal, message };
}

function checkHumidityAbnormality(humidity) {
    let abnormal = false;
    let message = "";

    if (humidity > THRESHOLDS.humidity.max) {
        abnormal = true;
        message = "Humidity exceeds 80%!";
    } else if (baselineData && baselineData.humidity) {
        const changePercent = Math.abs((humidity - baselineData.humidity) / baselineData.humidity * 100);
        if (changePercent > THRESHOLDS.humidity.percent) {
            abnormal = true;
            message = `Humidity changed by ${changePercent.toFixed(1)}% from baseline!`;
        }
    }

    return { abnormal, message };
}

function checkVibrationAbnormality(vibration) {
    let abnormal = false;
    let message = "";

    if (vibration > 3.0) {
        abnormal = true;
        message = "Extremely high vibration!";
    } else if (vibration > 2.0) {
        abnormal = true;
        message = "Very high vibration detected!";
    } else if (baselineData && baselineData.vibration) {
        const changePercent = Math.abs((vibration - baselineData.vibration) / baselineData.vibration * 100);
        if (changePercent > THRESHOLDS.vibration.percent) {
            abnormal = true;
            message = `Vibration increased by ${changePercent.toFixed(1)}%!`;
        }
    }

    return { abnormal, message };
}

// Show Alert Panel
function showAlert(alert) {
    const alertPanel = document.getElementById('alertPanel');
    const alertMessage = document.getElementById('alertMessage');
    const faultySensors = document.getElementById('faultySensors');

    alertPanel.style.display = 'block';
    alertMessage.innerHTML = alert.message || "Maintenance required immediately!";

    if (alert.faultySensors && alert.faultySensors.length > 0) {
        faultySensors.innerHTML = `<strong>Faulty Sensors:</strong> ${alert.faultySensors.join(', ')}`;
    } else {
        faultySensors.innerHTML = "";
    }

    // Auto-hide after 30 seconds if resolved
    setTimeout(() => {
        if (alertData && !alertData.maintenance) {
            alertPanel.style.display = 'none';
        }
    }, 30000);
}

// Add to History Table
function addToHistory(sensorType, value, timestamp) {
    if (!timestamp) return;

    const time = new Date(timestamp).toLocaleTimeString();
    const existingEntry = historyData.find(entry => entry.time === time);

    if (existingEntry) {
        existingEntry[sensorType] = value;
    } else {
        const newEntry = {
            time: time,
            voltage: null,
            current: null,
            temperature: null,
            humidity: null,
            vibration: null
        };
        newEntry[sensorType] = value;
        historyData.unshift(newEntry);

        // Keep only last 20 entries
        if (historyData.length > 20) {
            historyData.pop();
        }
    }

    updateHistoryTable();
}

// Update History Table Display
function updateHistoryTable() {
    const tbody = document.getElementById('readingsBody');
    tbody.innerHTML = '';

    historyData.forEach(entry => {
        const row = tbody.insertRow();
        row.insertCell(0).innerText = entry.time;
        row.insertCell(1).innerText = entry.voltage ? entry.voltage.toFixed(2) : '--';
        row.insertCell(2).innerText = entry.current ? entry.current.toFixed(2) : '--';
        row.insertCell(3).innerText = entry.temperature ? entry.temperature.toFixed(1) : '--';
        row.insertCell(4).innerText = entry.humidity ? entry.humidity.toFixed(1) : '--';
        row.insertCell(5).innerText = entry.vibration ? entry.vibration.toFixed(3) : '--';

        // Determine status for this entry
        let status = 'normal';
        if (entry.voltage && (entry.voltage < 180 || entry.voltage > 250)) status = 'danger';
        if (entry.current && entry.current > 10) status = 'danger';
        if (entry.temperature && entry.temperature > 45) status = 'danger';

        const statusCell = row.insertCell(6);
        statusCell.innerHTML = `<span class="status-badge ${status}">${status.toUpperCase()}</span>`;
    });
}

// Update Last Update Time
function updateLastUpdateTime() {
    const now = new Date();
    document.getElementById('lastUpdate').innerText = now.toLocaleString();
}