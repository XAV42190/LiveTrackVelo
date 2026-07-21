// ==========================================
// 1. INITIALISATION CARTE LEAFLET
// ==========================================
let map, marker, polyline;
let watchId = null;

// Détection de la session via l'URL
const urlParams = new URLSearchParams(window.location.search);
let sharedSessionId = urlParams.get('session');
const isViewer = Boolean(sharedSessionId);

// Si pas de session dans l'URL, on utilise/génère une session locale pour le cycliste
let sessionId = localStorage.getItem('livetrack_session_id');
if (!sessionId) {
    sessionId = 'session_' + Math.random().toString(36).substring(2, 9);
    localStorage.setItem('livetrack_session_id', sessionId);
}

// ID de session VRAIMENT actif
const activeSessionId = isViewer ? sharedSessionId : sessionId;

window.addEventListener('DOMContentLoaded', () => {
    // Mode spectateur : masquer les boutons
    if (isViewer) {
        const controls = document.querySelector('.controls');
        if (controls) controls.style.display = 'none';
    }

    // Carte
    map = L.map('map').setView([46.603354, 1.888334], 6);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
    }).addTo(map);

    // Ligne rouge très visible
    polyline = L.polyline([], { color: '#ff0000', weight: 6, opacity: 0.9 }).addTo(map);

    setTimeout(() => { map.invalidateSize(); }, 300);
});

// Bandeau de débogage
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
        
        firebase.auth().signInAnonymously().then(() => {
            database = firebase.database();
            
            // Pointer exactement sur le bon nœud
            sessionRef = database.ref('livetrack/sessions/' + activeSessionId);

            debugLog("Auth OK (" + (isViewer ? "Invité" : "Cycliste") + ") ID: " + activeSessionId);

            // Écouter directement le sous-nœud 'pts'
            startListening();
        }).catch((err) => {
            debugLog("Erreur Auth: " + err.message);
        });

    } else {
        debugLog("ERREUR: Clés Firebase non renseignées.");
    }
} catch (e) {
    debugLog("Exception Init: " + e.message);
}

function startListening() {
    if (!sessionRef) return;

    // Écoute spécifique sur 'pts'
    sessionRef.child('pts').on('value', (snapshot) => {
        const data = snapshot.val();
        
        if (!data) {
            debugLog("Connecté (" + (isViewer ? "Invité" : "Cycliste") + ") - En attente de points GPS...");
            return;
        }

        // Conversion des points Firebase en coordonnées [lat, lng]
        const rawPoints = Object.values(data);
        const coords = rawPoints.map(p => [p.lat, p.lng]);

        // Redessiner la ligne
        polyline.setLatLngs(coords);

        // Mettre à jour le marqueur
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

        debugLog("SUIVI ACTIF : " + coords.length + " points reçus !");
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

    // Réinitialiser la carte locale
    if (polyline) polyline.setLatLngs([]);
    if (marker) {
        map.removeLayer(marker);
        marker = null;
    }

    // Effacer l'ancienne session sur Firebase pour repartir à zéro
    if (sessionRef) {
        sessionRef.remove();
    }

    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    
    startBtn.disabled = true;
    startBtn.style.opacity = '0.5';
    stopBtn.disabled = false;
    stopBtn.style.opacity = '1';

    debugLog("Recherche signal GPS...");

    watchId = navigator.geolocation.watchPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            debugLog("GPS local: " + lat.toFixed(4) + ", " + lng.toFixed(4));

            // Envoi explicite à Firebase
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
            maximumAge: 1000,
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
    // Génère le lien exact basé sur activeSessionId
    const shareUrl = window.location.origin + window.location.pathname + '?session=' + activeSessionId;

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
