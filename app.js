// 1. Initialisation de la carte pour les spectateurs
const map = L.map('map').setView([46.2276, 2.2137], 6); // Centré sur la France au départ
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
}).addTo(map);

let marker = null;
let path = L.polyline([], { color: '#10b981', weight: 4 }).addTo(map);

// 2. Enregistrement du Service Worker (pour la tâche de fond)
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
        .then(() => console.log("Service Worker enregistré avec succès !"))
        .catch(err => console.error("Erreur Service Worker :", err));
}

// 3. Gestion du Bluetooth pour le cycliste
const btnConnect = document.getElementById('btn-connect');
const statusText = document.getElementById('status');

btnConnect.addEventListener('click', async () => {
    try {
        statusText.innerText = "Recherche du compteur...";
        
        // Demande l'accès au compteur via les protocoles standards du vélo
        const device = await navigator.bluetooth.requestDevice({
            filters: [
                { services: ['location_and_navigation', 'cycling_speed_and_cadence'] }
            ]
        });

        statusText.innerText = `Connexion à ${device.name}...`;
        const server = await device.gatt.connect();
        
        // On demande le service de navigation (GPS)
        const service = await server.getPrimaryService('location_and_navigation');
        const characteristic = await service.getCharacteristic('ln_location_and_speed');

        // Écouter les données envoyées par le compteur en continu
        await characteristic.startNotifications();
        characteristic.addEventListener('characteristicvaluechanged', handleGpsData);
        
        statusText.innerText = `Connecté en direct à ${device.name} !`;
        btnConnect.style.display = 'none'; // Cache le bouton une fois connecté

        // Bloquer la mise en veille de l'écran (si le téléphone reste sur le guidon)
        if ('wakeLock' in navigator) {
            await navigator.wakeLock.request('screen');
        }

    } catch (error) {
        console.error(error);
        statusText.innerText = "Erreur ou connexion annulée.";
    }
});

// 4. Traitement des données GPS reçues du compteur
function handleGpsData(event) {
    const value = event.target.value;
    
    // Extraction des coordonnées selon la norme Bluetooth standard (Spécifications GATT)
    // Les compteurs encodent souvent la latitude/longitude en "Dix-millionièmes de degrés"
    const latRaw = value.getInt32(2, true); 
    const lngRaw = value.getInt32(6, true);
    
    const latitude = latRaw / 10000000;
    const longitude = lngRaw / 10000000;

    if (latitude && longitude) {
        updateMap(latitude, longitude);
        envoyerAuServeur(latitude, longitude);
    }
}

// 5. Mise à jour visuelle immédiate de la carte
function updateMap(lat, lng) {
    const coords = [lat, lng];
    if (!marker) {
        marker = L.marker(coords).addTo(map);
        map.setView(coords, 15);
    } else {
        marker.setLatLng(coords);
    }
    path.addLatLng(coords);
}

// 6. Envoi des données vers votre base de données en ligne
function envoyerAuServeur(lat, lng) {
    // Remplacer par l'URL de votre vraie base de données (ex: Firebase ou Supabase)
    fetch('https://votre-base-de-donnees.com/api/live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            cyclisteId: "sortie_demo_1",
            lat: lat,
            lng: lng,
            time: Date.now()
        })
    }).catch(err => console.log("Erreur envoi réseau (géré par le Service Worker en tâche de fond)"));
}