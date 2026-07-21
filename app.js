// ==========================================
// 1. CONFIGURATION
// ==========================================
const FIREBASE_DB_URL = "https://suivisortievelo-default-rtdb.europe-west1.firebasedatabase.app"; 

let map, marker, polyline;
let watchId = null;
let viewerInterval = null;
let localPath = [];
let wakeLock = null;

// Détection de la session et du rôle (Spectateur vs Cycliste)
const urlParams = new URLSearchParams(window.location.search);
const sharedSessionId = urlParams.get('session');
const isViewer = Boolean(sharedSessionId);

let sessionId = localStorage.getItem('livetrack_session_id');
if (!sessionId) {
    sessionId = 'session_' + Math.random().toString(36).substring(2, 9);
    localStorage.setItem('livetrack_session_id', sessionId);
}

const activeSessionId = isViewer ? sharedSessionId : sessionId;

// ==========================================
// 2. INITIALISATION CARTE & APPLICATION
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
    // Si c'est un spectateur, masquer les boutons de contrôle
    if (isViewer) {
        const controls = document.querySelector('.controls');
        if (controls) controls.style.display = 'none';
    }

    // Initialisation de Leaflet
    map = L.map('map').setView([46.603354, 1.888334], 6);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
    }).addTo(map);

    polyline = L.polyline([], { color: '#ff0000', weight: 6, opacity: 0.9 }).addTo(map);

    setTimeout(() => { map.invalidateSize(); }, 300);

    // Mode Spectateur vs Cycliste
    if (isViewer) {
        debugLog("SPECTATEUR : Connexion à la session " + activeSessionId);
        fetchPointsFromFirebase();
        viewerInterval = setInterval(fetchPointsFromFirebase, 3000);
    } else {
        debugLog("CYCLISTE : Prêt (Session " + activeSessionId + ")");
    }

    // Initialiser les clics des boutons
    setupEventListeners();
});

// Affiche un bandeau d'information visuel pour le suivi
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
// 3. GESTION DE L'ANTI-VEILLE ET AUDIO
// ==========================================

function startSilentAudio() {
    const audio = document.getElementById('silentAudio');
    if (audio) {
        audio.play().then(() => {
            debugLog("Audio silencieux actif 🎧 (Anti-veille JS)");
        }).catch(err => {
            console.log("Erreur lecture audio:", err);
        });
    }
}

function stopSilentAudio() {
    const audio = document.getElementById('silentAudio');
    if (audio) {
        audio.pause();
        audio.currentTime = 0;
    }
}

function startAntiSleep() {
    const video = document.getElementById('silentVideo');
    if (video) {
        video.play().then(() => {
            debugLog("Anti-veille vidéo actif 🎥 (GPS forcé)");
        }).catch(err => console.log("Erreur vidéo:", err));
    }
}

function stopAntiSleep() {
    const video = document.getElementById('silentVideo');
    if (video) {
        video.pause();
    }
}

async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
            debugLog("Anti-veille Écran : ACTIF 💡");
            
            // Si l'utilisateur change d'onglet et revient, on réactive le réveil
            wakeLock.addEventListener('release', () => {
                debugLog("Anti-veille relâché");
            });
        }
    } catch (err) {
        debugLog("WakeLock non supporté ou refusé par le navigateur");
    }
}

// Réactiver le Wake Lock si la page redevient visible (ex: retour sur le navigateur)
document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
        await requestWakeLock();
    }
});

// ==========================================
// 4. REQUÊTES FIREBASE REST (SPECTATEUR)
// ==========================================
function fetchPointsFromFirebase() {
    const url = `${FIREBASE_DB_URL}/livetrack/sessions/${activeSessionId}/pts.json`;

    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (!data) {
                debugLog("SPECTATEUR : En attente du départ du vélo...");
                return;
            }

            const rawPoints = Object.values(data);
            const coords = rawPoints.map(p => [p.lat, p.lng]);

            polyline.setLatLngs(coords);

            const lastPoint = coords[coords.length - 1];
            if (lastPoint) {
                if (!marker) {
                    marker = L.marker(lastPoint).addTo(map);
                    map.setView(lastPoint, 16);
                } else {
                    marker.setLatLng(lastPoint);
                    map.panTo(lastPoint);
                }
            }

            debugLog("SPECTATEUR : " + coords.length + " points affichés sur la carte !");
        })
        .catch(err => {
            debugLog("Erreur Réseau Spectateur: " + err.message);
        });
}

// ==========================================
// 5. CONTRÔLE GPS & ENVOI (CYCLISTE)
// ==========================================
function startTracking() {
    if (!navigator.geolocation) {
        alert("GPS non supporté par ce navigateur.");
        return;
    }

    // 1. Activer les dispositifs anti-mise en veille
    requestWakeLock();
    startAntiSleep();
    startSilentAudio();

    // 2. Déclencher automatiquement le partage de lien
    shareTrackingLink();
    
    // 3. Réinitialisation des traces locales
    localPath = [];
    if (polyline) polyline.setLatLngs([]);
    if (marker) {
        map.removeLayer(marker);
        marker = null;
    }

    // 4. Effacer la session précédente dans Firebase pour repartir à zéro
    fetch(`${FIREBASE_DB_URL}/livetrack/sessions/${activeSessionId}.json`, {
        method: 'DELETE'
    });

    // 5. Gestion de l'état des boutons
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    
    if (startBtn) {
        startBtn.disabled = true;
        startBtn.style.opacity = '0.5';
    }
    if (stopBtn) {
        stopBtn.disabled = false;
        stopBtn.style.opacity = '1';
    }

    // Afficher le bouton Mode Poche au démarrage
    const pocketBtn = document.getElementById('pocketBtn');
    if (pocketBtn) pocketBtn.style.display = 'inline-block';
    
    debugLog("Recherche du signal GPS...");

    // 6. Lancement de la géolocalisation continue
    watchId = navigator.geolocation.watchPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            // Affichage carte locale
            localPath.push([lat, lng]);
            polyline.setLatLngs(localPath);

            if (!marker) {
                marker = L.marker([lat, lng]).addTo(map);
                map.setView([lat, lng], 16);
            } else {
                marker.setLatLng([lat, lng]);
                map.panTo([lat, lng]);
            }

            debugLog("CYCLISTE : " + localPath.length + " pts | " + lat.toFixed(4) + ", " + lng.toFixed(4));

            // Envoi HTTP POST direct à Firebase REST
            fetch(`${FIREBASE_DB_URL}/livetrack/sessions/${activeSessionId}/pts.json`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lat: lat,
                    lng: lng,
                    t: Date.now()
                })
            }).catch(e => debugLog("Erreur Envoi: " + e.message));
        },
        (error) => {
            debugLog("Erreur GPS: " + error.message);
        },
        {
            enableHighAccuracy: true,
            maximumAge: 10000,
            timeout: 50000
        }
    );
}

function stopTracking() {
    if (watchId !== null) {
        // Arrêter le suivi GPS
        navigator.geolocation.clearWatch(watchId);
        watchId = null;

        // Désactiver l'anti-veille audio et écran
        stopSilentAudio();
        stopAntiSleep();
        releaseWakeLock();

        // Rétablir les boutons
        const startBtn = document.getElementById('startBtn');
        const stopBtn = document.getElementById('stopBtn');
        
        if (startBtn) {
            startBtn.disabled = false;
            startBtn.style.opacity = '1';
        }
        if (stopBtn) {
            stopBtn.disabled = true;
            stopBtn.style.opacity = '0.5';
        }

        // Masquer le bouton Mode Poche et l'overlay à l'arrêt
        const pocketBtn = document.getElementById('pocketBtn');
        const overlay = document.getElementById('blackOverlay');
        if (pocketBtn) pocketBtn.style.display = 'none';
        if (overlay) overlay.style.display = 'none';
        
        debugLog("Suivi arrêté.");
    }
}

function shareTrackingLink() {
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
            alert("Erreur lors de la copie du lien.");
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

// TOGGLE MODE POCHE
function togglePocketMode() {
    const overlay = document.getElementById('blackOverlay');
    if (!overlay) return;

    if (overlay.style.display === 'none' || overlay.style.display === '') {
        overlay.style.display = 'flex';
    } else {
        overlay.style.display = 'none';
    }
}

// ==========================================
// 6. DÉCLENCHEURS DES BOUTONS (EVENT LISTENERS)
// ==========================================
function setupEventListeners() {
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const shareBtn = document.getElementById('shareBtn');
    const pocketBtn = document.getElementById('pocketBtn');
    const blackOverlay = document.getElementById('blackOverlay');

    if (startBtn) startBtn.addEventListener('click', startTracking);
    if (stopBtn) stopBtn.addEventListener('click', stopTracking);
    if (shareBtn) shareBtn.addEventListener('click', shareTrackingLink);
    
    // Écouteurs Mode Poche
    if (pocketBtn) pocketBtn.addEventListener('click', togglePocketMode);
    if (blackOverlay) blackOverlay.addEventListener('click', togglePocketMode);
}
