// ==========================================
// 1. CONFIGURATION
// ==========================================
const FIREBASE_DB_URL = "https://suivisortievelo-default-rtdb.europe-west1.firebasedatabase.app"; 

let map, marker, polyline;
let watchId = null;
let viewerInterval = null;
let commentsInterval = null; // Stocke le timer des commentaires
let localPath = [];
let wakeLock = null;
let displayedCommentIds = new Set(); // Évite d'afficher deux fois le même commentaire
let currentPhotoBase64 = null; // Stocke la photo sélectionnée/compressée

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

    // === Chargement initial et écoute périodique des commentaires ===
    fetchCommentsFromFirebase();
    commentsInterval = setInterval(fetchCommentsFromFirebase, 4000);

    // Initialiser les clics des boutons
    setupEventListeners();
});

// Affiche un bandeau d'information visuel en HAUT de l'écran
function debugLog(msg) {
    let debugBox = document.getElementById('debugBox');
    if (!debugBox) {
        debugBox = document.createElement('div');
        debugBox.id = 'debugBox';
        debugBox.style.cssText = 'position:fixed;top:10px;left:10px;right:10px;background:rgba(0,0,0,0.85);color:#00ff00;font-family:monospace;font-size:12px;padding:8px;border-radius:5px;z-index:9999;word-break:break-all;max-height:80px;overflow-y:auto;';
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
            
            wakeLock.addEventListener('release', () => {
                debugLog("Anti-veille relâché");
            });
        }
    } catch (err) {
        debugLog("WakeLock non supporté ou refusé par le navigateur");
    }
}

document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
        await requestWakeLock();
    }
});

// ==========================================
// 4. REQUÊTES FIREBASE REST (DONNÉES & COMMENTAIRES)
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

// --- RECUPERATION DES COMMENTAIRES ---
function fetchCommentsFromFirebase() {
    const url = `${FIREBASE_DB_URL}/livetrack/sessions/${activeSessionId}/comments.json`;

    fetch(url)
        .then(res => res.json())
        .then(data => {
            if (!data) return;

            Object.keys(data).forEach(key => {
                // Éviter de ré-afficher un commentaire déjà présent sur la carte
                if (!displayedCommentIds.has(key)) {
                    displayedCommentIds.add(key);
                    addCommentToMap(data[key]);
                }
            });
        })
        .catch(err => console.log("Erreur chargement commentaires: ", err));
}

// --- AFFICHAGE SUR LA CARTE (AVEC PHOTO) ---
function addCommentToMap(comment) {
    if (!comment || comment.lat === undefined || comment.lng === undefined) return;

    const timeStr = comment.timestamp 
        ? new Date(comment.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '';

    const hasPhoto = Boolean(comment.photo);
    const badge = hasPhoto ? '📸 ' : '💬 ';

    const commentIcon = L.divIcon({
        className: 'custom-comment-icon',
        html: `<div style="background-color: #FFC107; color: black; padding: 4px 8px; border-radius: 12px; font-weight: bold; font-size: 12px; border: 2px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3); white-space: nowrap;">
                ${badge}${comment.text || 'Photo'}
               </div>`,
        iconSize: [110, 30],
        iconAnchor: [55, 15]
    });

    const commentMarker = L.marker([comment.lat, comment.lng], { 
        icon: commentIcon,
        zIndexOffset: 1000 
    }).addTo(map);

    // Contenu de la Pop-up
    let popupContent = `<div style="text-align:center; min-width: 120px;"><b>Message (${timeStr}) :</b><br>${comment.text || ''}`;
    
    if (hasPhoto) {
        popupContent += `<br><a href="${comment.photo}" target="_blank">
          <img src="${comment.photo}" style="max-width:200px; max-height:200px; border-radius:8px; margin-top:8px; border: 1px solid #ccc; object-fit: cover;" />
        </a>`;
    }
    popupContent += `</div>`;

    commentMarker.bindPopup(popupContent);
}

// ==========================================
// 5. GESTION DES PHOTOS ET COMMENTAIRES (CYCLISTE)
// ==========================================
function handlePhotoSelection(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 600; // Recadrage max pour optimiser l'envoi
            let width = img.width;
            let height = img.height;

            if (width > MAX_WIDTH) {
                height *= MAX_WIDTH / width;
                width = MAX_WIDTH;
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            // Compression JPEG (Qualité 0.6)
            currentPhotoBase64 = canvas.toDataURL('image/jpeg', 0.6);

            const btnPhoto = document.getElementById('btn-photo');
            if (btnPhoto) btnPhoto.style.backgroundColor = '#10b981'; // Vert = photo prête
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

async function sendComment() {
    const input = document.getElementById('comment-input');
    const text = input ? input.value.trim() : '';

    if (!text && !currentPhotoBase64) {
        alert("Veuillez saisir un texte ou prendre une photo.");
        return;
    }

    if (!localPath || localPath.length === 0) {
        alert("Position GPS non disponible. Attendez le premier signal GPS.");
        return;
    }

    const lastPos = localPath[localPath.length - 1];

    const commentData = {
        text: text,
        photo: currentPhotoBase64 || null,
        timestamp: Date.now(),
        lat: lastPos[0],
        lng: lastPos[1]
    };

    try {
        const response = await fetch(`${FIREBASE_DB_URL}/livetrack/sessions/${activeSessionId}/comments.json`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(commentData)
        });

        if (response.ok) {
            if (input) input.value = '';
            currentPhotoBase64 = null;

            const btnPhoto = document.getElementById('btn-photo');
            if (btnPhoto) btnPhoto.style.backgroundColor = '#64748b';

            showToast("💬 Envoyé !");
        } else {
            alert("Erreur lors de l'envoi vers Firebase.");
        }
    } catch (err) {
        console.error("Erreur envoi commentaire :", err);
        alert("Erreur d'envoi : " + err.message);
    }
}

// ==========================================
// 6. CONTRÔLE GPS & ENVOI (CYCLISTE)
// ==========================================
function startTracking() {
    if (!navigator.geolocation) {
        alert("GPS non supporté par ce navigateur.");
        return;
    }

    requestWakeLock();
    startAntiSleep();
    startSilentAudio();

    shareTrackingLink();
    
    localPath = [];
    displayedCommentIds.clear(); // Réinitialise les commentaires affichés
    if (polyline) polyline.setLatLngs([]);
    if (marker) {
        map.removeLayer(marker);
        marker = null;
    }

    fetch(`${FIREBASE_DB_URL}/livetrack/sessions/${activeSessionId}.json`, {
        method: 'DELETE'
    });

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

    const pocketBtn = document.getElementById('pocketBtn');
    if (pocketBtn) pocketBtn.style.display = 'inline-block';
    
    debugLog("Recherche du signal GPS...");

    watchId = navigator.geolocation.watchPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

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
        navigator.geolocation.clearWatch(watchId);
        watchId = null;

        stopSilentAudio();
        stopAntiSleep();

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
// 7. DÉCLENCHEURS DES BOUTONS
// ==========================================
function setupEventListeners() {
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const shareBtn = document.getElementById('shareBtn');
    const pocketBtn = document.getElementById('pocketBtn');
    const blackOverlay = document.getElementById('blackOverlay');

    const btnAddComment = document.getElementById('btn-add-comment');
    const btnPhoto = document.getElementById('btn-photo');
    const commentPhotoInput = document.getElementById('comment-photo');

    if (startBtn) startBtn.addEventListener('click', startTracking);
    if (stopBtn) stopBtn.addEventListener('click', stopTracking);
    if (shareBtn) shareBtn.addEventListener('click', shareTrackingLink);
    
    if (pocketBtn) pocketBtn.addEventListener('click', togglePocketMode);
    if (blackOverlay) blackOverlay.addEventListener('click', togglePocketMode);

    if (btnAddComment) btnAddComment.addEventListener('click', sendComment);
    if (btnPhoto && commentPhotoInput) {
        btnPhoto.addEventListener('click', () => commentPhotoInput.click());
        commentPhotoInput.addEventListener('change', handlePhotoSelection);
    }
}
