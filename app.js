// ==========================================
// 1. INITIALISATION CARTE LEAFLET
// ==========================================
let map, marker, polyline;
let watchId = null;

// ID de Session unique
let sessionId = localStorage.getItem('livetrack_session_id');
if (!sessionId) {
    sessionId = 'session_' + Math.random().toString(36).substring(2, 9);
    localStorage.setItem('livetrack_session_id', sessionId);
}

// Détection du mode Spectateur (?session=... dans l'URL)
const urlParams = new URLSearchParams(window.location.search);
const sharedSessionId = urlParams.get('session');
const isViewer = Boolean(sharedSessionId);
const activeSessionId = isViewer ? sharedSessionId : sessionId;

window.addEventListener('DOMContentLoaded', () => {
    if (isViewer) {
        const controls = document.querySelector('.controls');
        if (controls) controls.style.display = 'none';
    }

    map = L.map('map').setView([46.603354, 1.888334], 6);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
    }).addTo(map);

    polyline = L.polyline([], { color: '#ff0000', weight: 6, opacity: 0.9 }).addTo(map);

    setTimeout(() => { map.invalidateSize(); }, 300);
});

function debugLog(msg) {
    let debugBox = document.getElementById('debugBox');
    if (!debugBox) {
        debugBox = document.createElement('div');
        debugBox.id = 'debugBox';
        debugBox.style.cssText = 'position:fixed;bottom:10px;left:10px;right:10px;background:rgba(0,0,0,0.85);color:#00ff00;font-family:monospace;font-size:12px;padding:8px;border-radius:5px;z-index:9999;word-break:break-all;max-height:80px;overflow-y:auto;';
        document.body.appendChild(debugBox);
    }
    debugBox.innerText = msg;
}

// ==========================================
// 2. INITIALISATION FIREBASE & SYNCHRO
// ==========================================
let database = null;
let locationRef = null;

// Remplacez par vos clés issues de la console Firebase
const firebaseConfig = {
  apiKey: "AIzaSyBE-6F7c2rF-f5DQDv3D9Wiu9l1eiNbY0s",
  authDomain: "suivisortievelo.firebaseapp.com",
  projectId: "suivisortievelo",
  storageBucket: "suivisortievelo.firebasestorage.app",
  messagingSenderId: "286724342837",
  appId: "1:286724342837:web:89c3838de2393123f31d7c",
  measurementId: "G-PQ9MQX0DQ5"
};

try {
    if (typeof firebase !== 'undefined' && firebaseConfig.databaseURL !== "VOS_VRAIES_INFOS_FIREBASE") {
        firebase.initializeApp(firebaseConfig);
        
        // Connexion Anonyme obligatoire pour débloquer les droits
        firebase.auth().signInAnonymously().then(() => {
            database = firebase.database();
            sessionRef = database.ref('livetrack/sessions/' + activeSessionId);

            debugLog("Auth OK (" + (isViewer ? "Invité" : "Cycliste") + ") ID: " + activeSessionId);

            // DÉMARRAGE DE L'ÉCOUTE
            startListening();
        }).catch((err) => {
            debugLog("Erreur Auth Firebase: " + err.message);
        });

    } else {
        debugLog("ERREUR: Clés Firebase non renseignées.");
    }
} catch (e) {
    debugLog("Exception Init: " + e.message);
}

function startListening() {
    if (!sessionRef) return;

    sessionRef.on('value', (snapshot) => {
        const data = snapshot.val();
        
        if (!data) {
            debugLog("En attente de parcours...");
            return;
        }

        if (data.pts) {
            const rawPoints = Object.values(data.pts);
            const coords = rawPoints.map(p => [p.lat, p.lng]);

            polyline.setLatLngs(coords);

            const lastPoint = coords[coords.length - 1];
            if (lastPoint) {
                if (!marker) {
                    marker = L.marker(lastPoint).addTo(map);
                    map.setView(lastPoint, 16);
                } else {
                    marker.setLatLng(lastPoint);
                    if (isViewer) map.panTo(lastPoint);
                }
            }

            debugLog("REÇU : " + coords.length + " points d'affichage !");
        }
    }, (err) => {
        debugLog("Erreur Synchro: " + err.message);
    });
}

// ==========================================
// 3. CONTRÔLE GPS (CYCLISTE)
// ==========================================

function startTracking() {
    if (!navigator.geolocation) {
        alert("GPS non supporté.");
        return;
    }

    if (polyline) polyline.setLatLngs([]);
    if (marker) {
        map.removeLayer(marker);
        marker = null;
    }

    if (sessionRef) {
        sessionRef.remove();
    }

    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    
    startBtn.disabled = true;
    startBtn.style.opacity = '0.5';
    stopBtn.disabled = false;
    stopBtn.style.opacity = '1';

    debugLog("Recherche GPS...");

    watchId = navigator.geolocation.watchPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            debugLog("GPS local: " + lat.toFixed(4) + ", " + lng.toFixed(4));

            if (sessionRef) {
                sessionRef.child('pts').push({
                    lat: lat,
                    lng: lng,
                    t: Date.now()
                });
            }
        },
        (error) => {
            debugLog("Erreur GPS: " + error.message);
        },
        {
            enableHighAccuracy: true,
            maximumAge: 2000,
            timeout: 10000
        }
    );
}

function stopTracking() {
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;

        const startBtn = document.getElementById('startBtn');
        const stopBtn = document.getElementById('stopBtn');
        
        startBtn.disabled = false;
        startBtn.style.opacity = '1';
        stopBtn.disabled = true;
        stopBtn.style.opacity = '0.5';

        debugLog("Suivi arrêté.");
    }
}

// ==========================================
// 4. PARTAGE
// ==========================================

function shareTrackingLink() {
    const shareUrl = window.location.origin + window.location.pathname + '?session=' + sessionId;

    const shareData = {
        title: 'Suivi vélo en direct 🚴‍♂️',
        text: 'Suis ma position en direct !',
        url: shareUrl
    };

    if (navigator.share) {
        navigator.share(shareData).catch(() => {});
    } else {
        navigator.clipboard.writeText(shareUrl).then(() => {
            showToast("Lien invité copié !");
        }).catch(() => {
            alert("Erreur de copie.");
        });
    }
}

function showToast(message) {
    const toast = document.getElementById("toast");
    if (toast) {
        toast.innerText = message;
        toast.style.display = "block";
        setTimeout(() => { toast.style.display = "none"; }, 3000);
    }
}
