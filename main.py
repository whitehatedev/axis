from flask import Flask, render_template_string, request, jsonify
import requests

app = Flask(__name__)

ESP_IP = "10.242.98.171"

HTML = """
<!DOCTYPE html>
<html>
<head>
    <title>STM32 Smart Meter Dashboard</title>
    <style>
        body {
            background: #080c14;
            color: white;
            font-family: Arial;
            margin: 0;
            padding: 20px;
        }
        h1 {
            text-align: center;
            color: #00e5ff;
        }
        .grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 20px;
        }
        .card {
            background: #111827;
            border-radius: 18px;
            padding: 20px;
            text-align: center;
            box-shadow: 0 0 20px rgba(0,229,255,0.15);
        }
        .gauge {
            width: 160px;
            height: 160px;
            border-radius: 50%;
            margin: auto;
            background: conic-gradient(#00e5ff 0deg, #1f2937 0deg);
            display: flex;
            align-items: center;
            justify-content: center;
            transition: 0.5s;
        }
        .inner {
            background: #080c14;
            width: 115px;
            height: 115px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-direction: column;
        }
        .value {
            font-size: 20px;
            font-weight: bold;
        }
        button {
            padding: 10px 14px;
            border: none;
            border-radius: 10px;
            margin: 5px;
            cursor: pointer;
            font-weight: bold;
        }
        .on { background: #22c55e; color: white; }
        .off { background: #ef4444; color: white; }
        .cal { background: #00e5ff; color: black; }
        input {
            width: 85px;
            padding: 8px;
            border-radius: 8px;
            border: none;
            margin: 5px;
        }
        .top {
            text-align: center;
            margin-bottom: 20px;
        }
        .status {
            text-align: center;
            color: #a7f3d0;
            margin-bottom: 15px;
        }
    </style>
</head>

<body>
<h1>STM32 + ESP8266 Smart Energy Meter</h1>

<div class="top">
    <button class="cal" onclick="zeroCal()">Zero Calibration</button>
</div>

<div class="status" id="status">Connecting...</div>

<div class="grid">
    {% for ch in range(1,5) %}
    <div class="card">
        <h2>Channel {{ch}}</h2>

        <div class="gauge" id="vgauge{{ch}}">
            <div class="inner">
                <div>Voltage</div>
                <div class="value" id="voltage{{ch}}">0 V</div>
            </div>
        </div>

        <br>

        <div class="gauge" id="igauge{{ch}}">
            <div class="inner">
                <div>Current</div>
                <div class="value" id="current{{ch}}">0 A</div>
            </div>
        </div>

        <h3 id="power{{ch}}">Power: 0 W</h3>
        <h3 id="relay{{ch}}">Relay: OFF</h3>

        <button class="on" onclick="setRelay({{ch}},1)">Relay ON</button>
        <button class="off" onclick="setRelay({{ch}},0)">Relay OFF</button>

        <hr>

        <p>Voltage Calibration</p>
        <input id="vcal{{ch}}" value="540">
        <button class="cal" onclick="setVCal({{ch}})">Set</button>

        <p>Current Calibration</p>
        <input id="ical{{ch}}" value="0.95">
        <button class="cal" onclick="setICal({{ch}})">Set</button>
    </div>
    {% endfor %}
</div>

<script>
function setGauge(id, value, maxValue) {
    let degree = Math.min((value / maxValue) * 360, 360);
    document.getElementById(id).style.background =
        `conic-gradient(#00e5ff ${degree}deg, #1f2937 ${degree}deg)`;
}

function updateData() {
    fetch('/api/data')
    .then(res => res.json())
    .then(data => {
        document.getElementById("status").innerHTML = "Device Online";

        for (let i = 1; i <= 4; i++) {
            let ch = data["CH" + i];

            document.getElementById("voltage" + i).innerHTML = ch.voltage.toFixed(1) + " V";
            document.getElementById("current" + i).innerHTML = ch.current.toFixed(2) + " A";
            document.getElementById("power" + i).innerHTML = "Power: " + ch.power.toFixed(1) + " W";
            document.getElementById("relay" + i).innerHTML = "Relay: " + (ch.relay == 1 ? "ON" : "OFF");

            setGauge("vgauge" + i, ch.voltage, 300);
            setGauge("igauge" + i, ch.current, 10);
        }
    })
    .catch(err => {
        document.getElementById("status").innerHTML = "Device Offline";
    });
}

function setRelay(ch, state) {
    fetch(`/api/relay?ch=${ch}&state=${state}`);
}

function zeroCal() {
    fetch('/api/zero');
    alert("Zero calibration sent. Keep AC and load OFF.");
}

function setVCal(ch) {
    let value = document.getElementById("vcal" + ch).value;
    fetch(`/api/vcal?ch=${ch}&value=${value}`);
}

function setICal(ch) {
    let value = document.getElementById("ical" + ch).value;
    fetch(`/api/ical?ch=${ch}&value=${value}`);
}

setInterval(updateData, 1000);
updateData();
</script>

</body>
</html>
"""

@app.route("/")
def index():
    return render_template_string(HTML)

@app.route("/api/data")
def api_data():
    try:
        r = requests.get(f"http://{ESP_IP}/data", timeout=3)
        text = r.text.strip()

        parts = text.split(",")

        if len(parts) < 17 or parts[0] != "DATA":
            raise ValueError("Invalid data from ESP8266")

        result = {}
        index = 1

        for ch in range(1, 5):
            result[f"CH{ch}"] = {
                "voltage": float(parts[index]),
                "current": float(parts[index + 1]),
                "power": float(parts[index + 2]),
                "relay": int(parts[index + 3])
            }
            index += 4

        return jsonify(result)

    except Exception:
        return jsonify({
            "CH1": {"voltage": 0, "current": 0, "power": 0, "relay": 0},
            "CH2": {"voltage": 0, "current": 0, "power": 0, "relay": 0},
            "CH3": {"voltage": 0, "current": 0, "power": 0, "relay": 0},
            "CH4": {"voltage": 0, "current": 0, "power": 0, "relay": 0},
        })

@app.route("/api/relay")
def api_relay():
    ch = request.args.get("ch")
    state = request.args.get("state")
    requests.get(f"http://{ESP_IP}/relay?ch={ch}&state={state}", timeout=3)
    return "OK"

@app.route("/api/zero")
def api_zero():
    requests.get(f"http://{ESP_IP}/zero", timeout=3)
    return "OK"

@app.route("/api/vcal")
def api_vcal():
    ch = request.args.get("ch")
    value = request.args.get("value")
    requests.get(f"http://{ESP_IP}/vcal?ch={ch}&value={value}", timeout=3)
    return "OK"

@app.route("/api/ical")
def api_ical():
    ch = request.args.get("ch")
    value = request.args.get("value")
    requests.get(f"http://{ESP_IP}/ical?ch={ch}&value={value}", timeout=3)
    return "OK"

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)