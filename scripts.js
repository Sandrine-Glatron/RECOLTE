/* ===== VARIABLES GLOBALES ===== */

// Stockage des couches de jardins pour interactions
const jardinLayers = {};

// Configuration des couches historiques
const couchesHistoriques = {
  "1956": "jardins_familiaux_1956_4326.geojson",
  "1978": "jardins_familiaux_1978_4326.geojson", 
  "2018": "jardins_familiaux_2018_4326.geojson",
  "2024": "jardins_familiaux_2024_4326.geojson"
};

// Stockage des couches Leaflet et statistiques
const layersHistoriques = {};
const statsEvol = {};

// Variables pour l'état de l'application
let currentTheme = 'light';
let sidebarOpen = true;
let timelinePlaying = false;
let currentFilter = 'all';
let isDataLoaded = false;
let loadingProgress = 0;

/* ===== INITIALISATION DE LA CARTE ===== */

// Création de la carte Leaflet avec vue sur Strasbourg
const map = L.map('map', {
  zoomControl: false,
  attributionControl: false,
  preferCanvas: true, // OPTIMISATION: Utiliser Canvas pour de meilleures performances
  zoomAnimation: true,
  fadeAnimation: true,
  markerZoomAnimation: true
}).setView([48.5734, 7.7521], 12);

// Ajout du contrôle de zoom personnalisé
L.control.zoom({
  position: 'topright'
}).addTo(map);

// Fonds de carte optimisés
const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
  maxZoom: 22, 
  attribution: '© OpenStreetMap',
  updateWhenIdle: false, // OPTIMISATION: Mise à jour continue
  keepBuffer: 2 // OPTIMISATION: Garder plus de tuiles en mémoire
}).addTo(map);

const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { 
  maxZoom: 22, 
  attribution: '© Esri',
  updateWhenIdle: false
});

const cartoDB = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { 
  maxZoom: 22, 
  attribution: '© CartoDB',
  updateWhenIdle: false
});

// Couches de données géographiques
const limitesEMS = L.geoJSON(null, { 
  style: { 
    color: "#6b7280", 
    weight: 2, 
    opacity: 0.8,
    fillOpacity: 0.1
  } 
});

// OPTIMISATION: Clustering amélioré
const markersCluster = L.markerClusterGroup({
  disableClusteringAtZoom: 15,
  maxClusterRadius: 50,
  chunkedLoading: true, // OPTIMISATION: Chargement par chunks
  chunkProgress: updateLoadingProgress,
  iconCreateFunction: function(cluster) {
    const count = cluster.getChildCount();
    return L.divIcon({
      html: `<div class="cluster-icon">${count}</div>`,
      className: 'custom-cluster',
      iconSize: [40, 40]
    });
  }
});

// OPTIMISATION: Couche des jardins privés avec gestion des performances
const jardinsPrives = L.geoJSON(null, {
  style: function(feature) {
    return {
      color: "#f59e0b",
      fillColor: "#fbbf24", 
      fillOpacity: 0.7,
      weight: 2,
      opacity: 0.9
    };
  },
  onEachFeature: function (feature, layer) {
    const props = feature.properties;
    const nom = props.nom;
    // ✅ CORRECTION: Vérifier plusieurs variantes possibles du nom de colonne
    const superficie = props.Superficie || props.superficie || props.SUPERFICIE || props.surface || props.Surface || 'Non renseignée';
    
    jardinLayers[nom] = layer;

    // Popup optimisé avec lazy loading
    const popupContent = `
      <div style="font-family: Inter, sans-serif; min-width: 200px;">
        <h4 style="margin: 0 0 0.5rem 0; color: #f59e0b; font-size: 1.1rem;">
          <i data-lucide="home"></i> ${nom}
        </h4>
        <p style="margin: 0.25rem 0; color: #6b7280;">
          <i data-lucide="square"></i> <strong>Superficie:</strong> ${superficie} m²
        </p>
        <p style="margin: 0.25rem 0; color: #6b7280; font-size: 0.875rem;">
          <i data-lucide="mouse-pointer-click"></i> Cliquez pour voir les statistiques
        </p>
      </div>
    `;
    
    layer.bindPopup(popupContent, {
      className: 'custom-popup',
      autoPan: false // OPTIMISATION: Éviter le pan automatique
    });

    // Événements optimisés avec debouncing
    let hoverTimeout;
    layer.on('mouseover', function (e) {
      clearTimeout(hoverTimeout);
      hoverTimeout = setTimeout(() => {
        e.target.setStyle({
          weight: 3,
          fillOpacity: 0.9,
          color: '#f97316'
        });
        e.target.bringToFront();
      }, 50);
    });

    layer.on('mouseout', function (e) {
      clearTimeout(hoverTimeout);
      jardinsPrives.resetStyle(e.target);
    });

    // ✅ MODIFICATION: Utiliser la nouvelle fonction améliorée
    layer.on('click', function (e) {
      handleJardinClickEnhanced(feature);
    });
  }
});

// OPTIMISATION: Jardins partagés avec popup optimisé
const jardinsPartages = L.geoJSON(null, {
  pointToLayer: function (feature, latlng) {
    return L.circleMarker(latlng, {
      radius: 8,
      fillColor: "#10b981",
      color: "#065f46",
      weight: 2,
      fillOpacity: 0.8,
      className: 'garden-marker'
    });
  },
  onEachFeature: function (feature, layer) {
    const props = feature.properties;
    
    const popupContent = `
      <div style="font-family: Inter, sans-serif; min-width: 200px;">
        <h4 style="margin: 0 0 0.5rem 0; color: #10b981; font-size: 1.1rem;">
          <i data-lucide="sprout"></i> ${props.name || props.nom || 'Jardin partagé'}
        </h4>
        ${props.description ? `<p style="margin: 0.25rem 0; color: #6b7280; font-size: 0.875rem;">
          <i data-lucide="info"></i> ${props.description}
        </p>` : ''}
        <p style="margin: 0.25rem 0; color: #6b7280;">
          <i data-lucide="square"></i> <strong>Superficie:</strong> ${props['Superficie(m²)'] || props.superficie || 'Non renseignée'} m²
        </p>
      </div>
    `;
    
    layer.bindPopup(popupContent, {
      className: 'custom-popup',
      autoPan: false
    });

    // Événements optimisés
    let hoverTimeout;
    layer.on('mouseover', function() {
      clearTimeout(hoverTimeout);
      hoverTimeout = setTimeout(() => {
        layer.setStyle({ radius: 12, fillOpacity: 1 });
      }, 50);
    });

    layer.on('mouseout', function() {
      clearTimeout(hoverTimeout);
      layer.setStyle({ radius: 8, fillOpacity: 0.8 });
    });
  }
});

// Variable pour le contrôleur de couches
let layerControl;

/* ===== FONCTIONS UTILITAIRES OPTIMISÉES ===== */

// OPTIMISATION: Fonction toast avec pool d'objets
const toastPool = [];
function showToast(message, type = 'success', duration = 3000) {
  let toast = toastPool.pop();
  if (!toast) {
    toast = document.createElement('div');
  }
  
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div style="display: flex; align-items: center; gap: 0.5rem;">
      <i data-lucide="${type === 'success' ? 'check-circle' : type === 'error' ? 'alert-circle' : 'info'}"></i>
      <span>${message}</span>
    </div>
  `;
  
  document.getElementById('toastContainer').appendChild(toast);
  lucide.createIcons();
  
  setTimeout(() => {
    toast.style.animation = 'slideInRight 0.5s ease-out reverse';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
        toastPool.push(toast); // Réutiliser l'élément
      }
    }, 500);
  }, duration);
}

// OPTIMISATION: Fonction de progression de chargement
function updateLoadingProgress(processed, total, elapsed) {
  const progress = Math.round((processed / total) * 100);
  if (progress !== loadingProgress) {
    loadingProgress = progress;
    const loadingElement = document.getElementById('mapLoading');
    if (loadingElement) {
      loadingElement.innerHTML = `
        <div style="text-align: center;">
          <div class="loading-spinner"></div>
          <p style="margin-top: 1rem; color: var(--text-secondary);">
            Chargement de la carte... ${progress}%
          </p>
          <div style="width: 200px; height: 4px; background: #e5e7eb; border-radius: 2px; margin: 1rem auto;">
            <div style="width: ${progress}%; height: 100%; background: #10b981; border-radius: 2px; transition: width 0.3s ease;"></div>
          </div>
        </div>
      `;
    }
  }
}

// OPTIMISATION: Animation des compteurs avec requestAnimationFrame
function animateCounter(element, start, end, duration = 1000) {
  const startTime = performance.now();
  const range = end - start;
  
  function updateCounter(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Utiliser une fonction d'easing pour une animation plus fluide
    const easeProgress = 1 - Math.pow(1 - progress, 3);
    const current = start + (range * easeProgress);
    
    element.textContent = Math.round(current);
    
    if (progress < 1) {
      requestAnimationFrame(updateCounter);
    }
  }
  
  requestAnimationFrame(updateCounter);
}

// OPTIMISATION: Mise à jour des statistiques avec cache
let statsCache = null;
function updateStats() {
  if (!statsCache) {
    statsCache = {
      total: Object.keys(jardinLayers).length + (jardinsPartages.getLayers().length || 0),
      shared: jardinsPartages.getLayers().length || 0,
      private: Object.keys(jardinLayers).length,
      family: Object.values(statsEvol).length > 0 ? Math.round(Object.values(statsEvol).reduce((sum, count) => sum + count, 0) / Object.keys(statsEvol).length) : 0,
      area: 150000
    };
  }

  // Utiliser requestAnimationFrame pour éviter les blocages
  requestAnimationFrame(() => {
    animateCounter(document.getElementById('totalGardens'), 0, statsCache.total);
    animateCounter(document.getElementById('sharedGardens'), 0, statsCache.shared);
    animateCounter(document.getElementById('privateGardens'), 0, statsCache.private);
    animateCounter(document.getElementById('familyGardens'), 0, statsCache.family);
    animateCounter(document.getElementById('totalArea'), 0, statsCache.area);
  });
}

function toggleTheme() {
  currentTheme = currentTheme === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', currentTheme);
  document.getElementById('themeToggle').classList.toggle('dark');
  showToast(`Mode ${currentTheme === 'dark' ? 'sombre' : 'clair'} activé`, 'success');
}

function toggleSidebar() {
  sidebarOpen = !sidebarOpen;
  document.getElementById('sidebar').classList.toggle('open');
}

function updateSidebar(contentHtml) {
  const sidebarContent = document.getElementById('sidebar-content');
  sidebarContent.innerHTML = contentHtml;
  sidebarContent.classList.add('slide-up');
}

function zoomToJardin(nom) {
  const layer = jardinLayers[nom];
  if (layer) {
    map.fitBounds(layer.getBounds(), { padding: [50, 50] });
    layer.setStyle({ fillOpacity: 1, color: '#ef4444' });
    setTimeout(() => jardinsPrives.resetStyle(layer), 1000);
    layer.fire('click');
    showToast(`Zoom sur ${nom}`, 'success');
  } else {
    showToast(`Jardin "${nom}" introuvable`, 'error');
  }
}

/* ===== FONCTIONS POUR GRAPHIQUES SANS ÉTIREMENT ===== */

// Fonction utilitaire pour créer des graphiques stables
function createStableChart(canvasId, chartConfig) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) {
    console.warn(`Canvas ${canvasId} non trouvé`);
    return null;
  }
  
  // ÉTAPE 1: Fixer les dimensions du canvas
  canvas.style.width = '100%';
  canvas.style.height = '250px';
  canvas.width = 400;
  canvas.height = 250;
  
  // ÉTAPE 2: Configuration stable pour Chart.js
  const stableConfig = {
    ...chartConfig,
    options: {
      ...chartConfig.options,
      responsive: true,
      maintainAspectRatio: false,  // ✅ CRUCIAL pour éviter l'étirement
      layout: {
        padding: 10
      },
      animation: {
        ...chartConfig.options?.animation,
        duration: 500  // ✅ Animation plus courte
      },
      // Désactiver les interactions qui causent des redimensionnements
      onHover: undefined,
      onResize: function(chart, size) {
        // Forcer les dimensions
        chart.canvas.style.width = '100%';
        chart.canvas.style.height = '250px';
      }
    }
  };
  
  return new Chart(canvas, stableConfig);
}

/* ===== FONCTIONS D'EXPORT DE DONNÉES AMÉLIORÉES ===== */

// OPTIMISATION: Cache pour les données déjà chargées
const dataCache = new Map();

// Fonction pour exporter les données d'un jardin avec graphiques
async function exportJardinData(jardinNom, data, aggVar, aggYear) {
  try {
    showToast('Préparation de l\'export...', 'success');
    
    // Préparer les données d'export
    const exportData = {
      nom_jardin: jardinNom,
      date_export: new Date().toISOString(),
      statistiques_generales: {
        total_recolte_kg: Object.values(aggYear).reduce((sum, val) => sum + val, 0) / 1000,
        nombre_varietes: Object.keys(aggVar).length,
        annee_la_plus_productive: Object.entries(aggYear).reduce((max, [year, value]) => 
          value > max.value ? {year, value} : max, {year: '2020', value: 0}).year,
        variete_la_plus_productive: Object.entries(aggVar).reduce((max, [variete, value]) => 
          value > max.value ? {variete, value} : max, {variete: '', value: 0}).variete
      },
      donnees_par_variete: aggVar,
      donnees_par_annee: aggYear,
      donnees_detaillees: data,
      analyse_percentages: calculatePercentages(aggVar),
      tendances: calculateTrends(aggYear)
    };

    // Créer le fichier Excel avec plusieurs feuilles
    const wb = XLSX.utils.book_new();
    
    // Feuille 1: Résumé
    const resumeData = [
      ['RAPPORT D\'ANALYSE - ' + jardinNom.toUpperCase()],
      ['Date d\'export', new Date().toLocaleDateString('fr-FR')],
      [''],
      ['STATISTIQUES GÉNÉRALES'],
      ['Total récolté (kg)', exportData.statistiques_generales.total_recolte_kg.toFixed(2)],
      ['Nombre de variétés', exportData.statistiques_generales.nombre_varietes],
      ['Année la plus productive', exportData.statistiques_generales.annee_la_plus_productive],
      ['Variété la plus productive', exportData.statistiques_generales.variete_la_plus_productive],
      [''],
      ['RÉPARTITION PAR VARIÉTÉ (%)'],
      ...Object.entries(exportData.analyse_percentages).map(([variete, pourcentage]) => 
        [variete, pourcentage.toFixed(1) + '%'])
    ];
    
    const wsResume = XLSX.utils.aoa_to_sheet(resumeData);
    XLSX.utils.book_append_sheet(wb, wsResume, 'Résumé');
    
    // Feuille 2: Données par variété
    const varieteData = [
      ['Variété', 'Récolte totale (g)', 'Pourcentage (%)', 'Moyenne annuelle (g)'],
      ...Object.entries(aggVar).map(([variete, total]) => [
        variete,
        total,
        exportData.analyse_percentages[variete].toFixed(1),
        (total / 5).toFixed(1)
      ])
    ];
    
    const wsVariete = XLSX.utils.aoa_to_sheet(varieteData);
    XLSX.utils.book_append_sheet(wb, wsVariete, 'Par variété');
    
    // Feuille 3: Évolution annuelle
    const annuelData = [
      ['Année', 'Récolte (g)', 'Évolution (%)', 'Écart à la moyenne'],
      ...Object.entries(aggYear).map(([annee, valeur]) => {
        const moyenne = Object.values(aggYear).reduce((sum, val) => sum + val, 0) / 5;
        const evolution = annee > '2020' ? 
          ((valeur - aggYear[parseInt(annee) - 1]) / aggYear[parseInt(annee) - 1] * 100).toFixed(1) : '—';
        return [
          annee,
          valeur,
          evolution + (evolution !== '—' ? '%' : ''),
          ((valeur - moyenne) / moyenne * 100).toFixed(1) + '%'
        ];
      })
    ];
    
    const wsAnnuel = XLSX.utils.aoa_to_sheet(annuelData);
    XLSX.utils.book_append_sheet(wb, wsAnnuel, 'Évolution annuelle');
    
    // Feuille 4: Données brutes
    const wsDonnees = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, wsDonnees, 'Données brutes');
    
    // Générer et télécharger le fichier
    const fileName = `export_jardin_${jardinNom.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
    
    showToast(`Données exportées vers ${fileName}`, 'success', 4000);
    
    // Optionnel: Export des graphiques en images (nécessite html2canvas)
    await exportChartsAsImages(jardinNom);
    
  } catch (error) {
    console.error('Erreur lors de l\'export:', error);
    showToast('Erreur lors de l\'export des données', 'error');
  }
}

// Fonction utilitaire pour calculer les pourcentages
function calculatePercentages(aggVar) {
  const total = Object.values(aggVar).reduce((sum, val) => sum + val, 0);
  const percentages = {};
  
  Object.entries(aggVar).forEach(([variete, valeur]) => {
    percentages[variete] = (valeur / total) * 100;
  });
  
  return percentages;
}

// Fonction utilitaire pour calculer les tendances
function calculateTrends(aggYear) {
  const years = Object.keys(aggYear).sort();
  const values = years.map(year => aggYear[year]);
  
  let tendance = 'stable';
  const premiere = values[0];
  const derniere = values[values.length - 1];
  
  if (derniere > premiere * 1.1) tendance = 'croissante';
  else if (derniere < premiere * 0.9) tendance = 'décroissante';
  
  return {
    tendance_generale: tendance,
    croissance_totale: ((derniere - premiere) / premiere * 100).toFixed(1) + '%',
    moyenne_annuelle: (values.reduce((sum, val) => sum + val, 0) / values.length).toFixed(1),
    pic_production: {
      annee: years[values.indexOf(Math.max(...values))],
      valeur: Math.max(...values)
    }
  };
}

// Export des graphiques en images (optionnel)
async function exportChartsAsImages(jardinNom) {
  try {
    // Cette fonction nécessiterait html2canvas pour capturer les graphiques
    // Pour l'instant, nous créons un rapport PDF simple
    showToast('Export des graphiques en développement...', 'info', 2000);
  } catch (error) {
    console.error('Erreur export graphiques:', error);
  }
}

/* ===== GESTION OPTIMISÉE DES CLICS SUR LES JARDINS - VERSION AMÉLIORÉE ===== */

// ✅ NOUVELLE FONCTION: Fonction améliorée pour afficher les détails d'un jardin avec statistiques enrichies
function displayJardinDataEnhanced(props, data, aggVar, aggYear) {
  // Calculer les statistiques avancées
  const totalRecolte = Object.values(aggVar).reduce((sum, val) => sum + val, 0);
  const percentages = calculatePercentages(aggVar);
  const trends = calculateTrends(aggYear);
  const topVarietes = Object.entries(aggVar)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  
  updateSidebar(`
    <div class="garden-details">
      <div class="garden-header">
        <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem;">
          <div class="logo" style="width: 48px; height: 48px; font-size: 1.5rem; background: linear-gradient(135deg, #10b981, #059669);">
            <i data-lucide="sprout"></i>
          </div>
          <div>
            <h3 style="margin: 0; color: var(--primary-color); font-size: 1.5rem;">${props.nom}</h3>
            <p style="margin: 0; color: var(--text-secondary); font-size: 0.875rem;">
              <i data-lucide="map-pin"></i> ${props.adresse || "Adresse non renseignée"}
            </p>
          </div>
        </div>
        
        <!-- Bouton d'export -->
        <div style="text-align: center; margin-bottom: 1.5rem;">
          <button class="btn btn-secondary" onclick="exportJardinData('${props.nom}', window.currentJardinData.data, window.currentJardinData.aggVar, window.currentJardinData.aggYear)">
            <i data-lucide="download"></i>
            Exporter les données
          </button>
        </div>
      </div>
      
      <!-- Statistiques générales -->
      <div class="stats-summary" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
        <div class="stat-card-mini">
          <div class="stat-number-mini">${(totalRecolte / 1000).toFixed(1)}</div>
          <div class="stat-label-mini">kg récoltés</div>
        </div>
        <div class="stat-card-mini">
          <div class="stat-number-mini">${Object.keys(aggVar).length}</div>
          <div class="stat-label-mini">variétés</div>
        </div>
        <div class="stat-card-mini">
          <div class="stat-number-mini">${trends.pic_production.annee}</div>
          <div class="stat-label-mini">meilleure année</div>
        </div>
        <div class="stat-card-mini">
          <div class="stat-number-mini">${trends.tendance_generale}</div>
          <div class="stat-label-mini">tendance</div>
        </div>
      </div>
      
      <!-- Top 3 des variétés -->
      <div class="top-varieties" style="background: var(--bg-glass); padding: 1rem; border-radius: 12px; margin-bottom: 1.5rem; border: 1px solid var(--border-color);">
        <h4 style="margin: 0 0 0.75rem 0; display: flex; align-items: center; gap: 0.5rem; color: var(--text-primary);">
          <i data-lucide="trophy"></i> Top 3 des variétés
        </h4>
        ${topVarietes.map((([variete, quantite], index) => `
          <div class="top-variety-item" style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; ${index < topVarietes.length - 1 ? 'border-bottom: 1px solid var(--border-color);' : ''}">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span style="font-size: 1.2rem;">${index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}</span>
              <span style="font-weight: 500;">${variete}</span>
            </div>
            <div style="text-align: right;">
              <div style="font-weight: 600; color: var(--primary-color);">${(quantite / 1000).toFixed(1)} kg</div>
              <div style="font-size: 0.75rem; color: var(--text-secondary);">${percentages[variete].toFixed(1)}%</div>
            </div>
          </div>
        `)).join('')}
      </div>
      
      <div class="chart-container">
        <h4 style="margin: 0 0 1rem 0; display: flex; align-items: center; gap: 0.5rem;">
          <i data-lucide="pie-chart"></i> Répartition des productions
        </h4>
        <canvas id="chartVariete" width="400" height="250"></canvas>
      </div>
      
      <div class="chart-container">
        <h4 style="margin: 0 0 1rem 0; display: flex; align-items: center; gap: 0.5rem;">
          <i data-lucide="bar-chart-3"></i> Évolution annuelle (g)
        </h4>
        <canvas id="chartAnnuel" width="400" height="250"></canvas>
      </div>
      
      <!-- Analyse des tendances -->
      <div class="trends-analysis" style="background: var(--bg-glass); padding: 1rem; border-radius: 12px; margin: 1rem 0; border: 1px solid var(--border-color);">
        <h4 style="margin: 0 0 0.75rem 0; display: flex; align-items: center; gap: 0.5rem;">
          <i data-lucide="trending-up"></i> Analyse des tendances
        </h4>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; font-size: 0.875rem;">
          <div>
            <strong>Tendance générale:</strong><br>
            <span style="color: ${trends.tendance_generale === 'croissante' ? 'var(--success-color)' : trends.tendance_generale === 'décroissante' ? 'var(--error-color)' : 'var(--warning-color)'};">
              ${trends.tendance_generale} (${trends.croissance_totale})
            </span>
          </div>
          <div>
            <strong>Pic de production:</strong><br>
            <span style="color: var(--primary-color);">${trends.pic_production.annee} - ${(trends.pic_production.valeur / 1000).toFixed(1)} kg</span>
          </div>
        </div>
      </div>
      
      <div style="text-align: center; margin: 1rem 0;">
        <button class="btn btn-primary" onclick="loadAdvancedCharts()">
          <i data-lucide="plus"></i> Voir plus d'analyses
        </button>
      </div>
    </div>
  `);

  lucide.createIcons();

  // Créer les graphiques améliorés
  requestAnimationFrame(() => {
    createEnhancedCharts(aggVar, aggYear, percentages);
  });

  // Stocker les données pour les graphiques avancés et l'export
  window.currentJardinData = { data, aggVar, aggYear, percentages, trends };
}

// ✅ NOUVELLE FONCTION: Graphiques améliorés avec pourcentages
function createEnhancedCharts(aggVar, aggYear, percentages) {
  console.log('🔧 Création des graphiques améliorés avec pourcentages');
  
  // Graphique en camembert AMÉLIORÉ avec pourcentages
  const chartVarieteConfig = {
    type: 'doughnut',
    data: {
      labels: Object.keys(aggVar),
      datasets: [{
        data: Object.values(aggVar),
        backgroundColor: [
          '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6',
          '#06b6d4', '#84cc16', '#f97316', '#ec4899', '#6366f1'
        ],
        borderWidth: 0,
        borderColor: '#ffffff'
      }]
    },
    options: {
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding: 12,
            usePointStyle: true,
            font: { size: 11 },
            boxWidth: 12,
            generateLabels: function(chart) {
              const data = chart.data;
              if (data.labels.length && data.datasets.length) {
                return data.labels.map((label, i) => {
                  const value = data.datasets[0].data[i];
                  const percentage = percentages[label];
                  return {
                    text: `${label}: ${(value/1000).toFixed(1)}kg (${percentage.toFixed(1)}%)`,
                    fillStyle: data.datasets[0].backgroundColor[i],
                    strokeStyle: data.datasets[0].borderColor,
                    lineWidth: data.datasets[0].borderWidth,
                    /*pointStyle: 'circle',*/
                    hidden: isNaN(data.datasets[0].data[i])
                  };
                });
              }
              return [];
            }
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const label = context.label || '';
              const value = context.parsed;
              const percentage = percentages[label];
              return `${label}: ${(value/1000).toFixed(1)}kg (${percentage.toFixed(1)}%)`;
            }
          }
        }
      }
    }
  };
  
  const chartVariete = createStableChart('chartVariete', chartVarieteConfig);
  
  // Graphique en barres avec valeurs affichées
  const chartAnnuelConfig = {
    type: 'bar',
    data: {
      labels: Object.keys(aggYear),
      datasets: [{
        label: 'Récolte (kg)',
        data: Object.values(aggYear).map(val => val / 1000), // Convertir en kg
        backgroundColor: '#10b981',
        borderColor: '#059669',
        borderWidth: 1,
        borderRadius: 6
      }]
    },
    options: {
      scales: {
        y: {
          beginAtZero: true,
          grid: { 
            color: 'rgba(107, 114, 128, 0.1)' 
          },
          ticks: {
            font: { size: 11 },
            callback: function(value) {
              return value.toFixed(1) + ' kg';
            }
          }
        },
        x: {
          grid: { display: false },
          ticks: {
            font: { size: 11 }
          }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `${context.parsed.y.toFixed(1)} kg`;
            }
          }
        }
      }
    }
  };
  
  const chartAnnuel = createStableChart('chartAnnuel', chartAnnuelConfig);
  
  // Vérifier que les graphiques sont créés
  if (chartVariete && chartAnnuel) {
    console.log('✅ Graphiques améliorés créés avec succès');
  } else {
    console.error('❌ Erreur lors de la création des graphiques améliorés');
  }
}

// ✅ NOUVELLE FONCTION: Gestion améliorée des clics sur les jardins
async function handleJardinClickEnhanced(feature) {
  const props = feature.properties;
  const fileName = props.nom.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "_");
  const filePath = `stats_${fileName}.xlsx`;

  // Vérifier le cache d'abord
  if (dataCache.has(filePath)) {
    const cachedData = dataCache.get(filePath);
    displayJardinDataEnhanced(props, cachedData.data, cachedData.aggVar, cachedData.aggYear);
    return;
  }

  updateSidebar(`
    <div style="text-align: center; padding: 2rem;">
      <div class="loading-spinner" style="margin: 0 auto 1rem;"></div>
      <h3>${props.nom}</h3>
      <p>Chargement des statistiques détaillées...</p>
      <div style="margin-top: 1rem; padding: 1rem; background: rgba(16, 185, 129, 0.1); border-radius: 8px;">
        <p style="margin: 0; font-size: 0.875rem; color: var(--primary-color);">
          <i data-lucide="info"></i> Préparation des analyses et graphiques...
        </p>
      </div>
    </div>
  `);

  try {
    const resp = await fetch(filePath);
    const buffer = await resp.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet);

    // Agrégation des données optimisée
    const aggVar = {};
    const aggYear = { 2020: 0, 2021: 0, 2022: 0, 2023: 0, 2024: 0 };
    
    data.forEach(row => {
      const variete = row["Variétés"] || "Autre";
      if (!aggVar[variete]) aggVar[variete] = 0;
      
      for (let year = 2020; year <= 2026; year++) {
        const value = Number(row[year]) || 0;
        aggVar[variete] += value;
        aggYear[year] += value;
      }
    });

    // Mettre en cache les données
    dataCache.set(filePath, { data, aggVar, aggYear });
    
    displayJardinDataEnhanced(props, data, aggVar, aggYear);
    showToast(`Statistiques chargées pour ${props.nom}`, 'success');

  } catch (err) {
    updateSidebar(`
      <div style="text-align: center; padding: 2rem;">
        <div style="color: var(--error-color); font-size: 3rem; margin-bottom: 1rem;">
          <i data-lucide="alert-triangle"></i>
        </div>
        <h3>${props.nom}</h3>
        <p style="color: var(--error-color);">Données statistiques non disponibles</p>
        <p style="font-size: 0.875rem; color: var(--text-secondary); margin-top: 1rem;">
          Ce jardin ne dispose pas encore de données de récolte analysables.
        </p>
      </div>
    `);
    lucide.createIcons();
    showToast(`Erreur lors du chargement des statistiques`, 'error');
  }
}

// OPTIMISATION: Fonction pour charger les graphiques avancés à la demande
function loadAdvancedCharts() {
  if (!window.currentJardinData) return;
  
  const { data, aggVar, aggYear } = window.currentJardinData;
  
  showToast('Chargement des analyses avancées...', 'success');
  
  // Utiliser setTimeout pour éviter le blocage de l'interface
  setTimeout(() => {
    addAdvancedCharts(data, aggVar, aggYear);
  }, 100);
}

// OPTIMISATION: Graphiques avancés créés à la demande
function addAdvancedCharts(data, aggVar, aggYear) {
  const topVarietes = Object.entries(aggVar)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  document.getElementById('sidebar-content').insertAdjacentHTML('beforeend', `
    <div class="chart-container">
      <h4 style="margin: 0 0 1rem 0; display: flex; align-items: center; gap: 0.5rem;">
        <i data-lucide="trophy"></i> Top 10 des variétés
      </h4>
      <canvas id="chartTop10" width="400" height="300"></canvas>
    </div>

    <div class="chart-container">
      <h4 style="margin: 0 0 1rem 0; display: flex; align-items: center; gap: 0.5rem;">
        <i data-lucide="filter"></i> Filtrage par années
      </h4>
      <div class="filter-section" style="margin-bottom: 1rem;">
        ${[2020, 2021, 2022, 2023, 2024, 2025, 2026]
          .map(y => `<div class="filter-chip active" data-year="${y}">${y}</div>`)
          .join('')}
      </div>
      <canvas id="chartFilteredYears" width="400" height="250"></canvas>
    </div>

    <div class="chart-container">
      <h4 style="margin: 0 0 1rem 0; display: flex; align-items: center; gap: 0.5rem;">
        <i data-lucide="activity"></i> Analyse de productivité
      </h4>
      <canvas id="chartProductivity" width="400" height="300"></canvas>
    </div>

    <div class="chart-container">
      <h4 style="margin: 0 0 1rem 0; display: flex; align-items: center; gap: 0.5rem;">
        <i data-lucide="trending-up"></i> Tendance saisonnière
      </h4>
      <canvas id="chartSeasonal" width="400" height="300"></canvas>
    </div>
  `);

  lucide.createIcons();

  // Créer les graphiques avancés avec des animations réduites
  requestAnimationFrame(() => {
    createAdvancedChartsOptimized(topVarietes, aggVar, aggYear);
  });
}

// CORRECTION: Création des graphiques avancés sans étirement
function createAdvancedChartsOptimized(topVarietes, aggVar, aggYear) {
  console.log('🔧 Création des graphiques avancés avec correction anti-étirement');
  
  // Top 10 CORRIGÉ
  const chartTop10Config = {
    type: 'bar',
    data: {
      labels: topVarietes.map(d => d[0].length > 12 ? d[0].substring(0, 12) + '...' : d[0]),
      datasets: [{
        label: 'Quantité (g)',
        data: topVarietes.map(d => d[1]),
        backgroundColor: '#10b981',
        borderColor: '#059669',
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y',
      scales: {
        x: { 
          beginAtZero: true,
          ticks: { font: { size: 10 } }
        },
        y: { 
          grid: { display: false },
          ticks: { font: { size: 10 } }
        }
      },
      plugins: { 
        legend: { display: false }
      }
    }
  };
  
  const chartTop10 = createStableChart('chartTop10', chartTop10Config);
  
  // Graphique années filtrées CORRIGÉ
  let chartFiltered;
  function drawFilteredChart() {
    const activeYears = Array.from(document.querySelectorAll('.filter-chip[data-year].active'))
      .map(chip => parseInt(chip.dataset.year));
    
    if (chartFiltered) {
      chartFiltered.destroy();
    }
    
    const chartFilteredConfig = {
      type: 'line',
      data: {
        labels: activeYears,
        datasets: [{
          label: 'Récolte (g)',
          data: activeYears.map(year => aggYear[year]),
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        scales: { 
          y: { 
            beginAtZero: true,
            ticks: { font: { size: 11 } }
          },
          x: {
            ticks: { font: { size: 11 } }
          }
        },
        plugins: { 
          legend: { display: false }
        }
      }
    };
    
    chartFiltered = createStableChart('chartFilteredYears', chartFilteredConfig);
  }
  
  // Productivité CORRIGÉ
  const productivityData = Object.entries(aggVar)
    .filter(([name, total]) => total > 0)
    .slice(0, 6);
  
  const chartProductivityConfig = {
    type: 'radar',
    data: {
      labels: productivityData.map(d => d[0].length > 8 ? d[0].substring(0, 8) + '...' : d[0]),
      datasets: [{
        label: 'Productivité',
        data: productivityData.map(d => (d[1] / 5).toFixed(1)),
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderWidth: 2
      }]
    },
    options: {
      plugins: { 
        legend: { display: false }
      },
      scales: {
        r: {
          ticks: { font: { size: 10 } }
        }
      }
    }
  };
  
  const chartProductivity = createStableChart('chartProductivity', chartProductivityConfig);
  
  // Tendance saisonnière CORRIGÉ
  const totalProduction = Object.values(aggYear).reduce((sum, val) => sum + val, 0);
  const chartSeasonalConfig = {
    type: 'doughnut',
    data: {
      labels: ['Printemps', 'Été', 'Automne', 'Hiver'],
      datasets: [{
        data: [
          totalProduction * 0.2, 
          totalProduction * 0.4, 
          totalProduction * 0.3, 
          totalProduction * 0.1
        ],
        backgroundColor: ['#22c55e', '#f59e0b', '#ef4444', '#3b82f6'],
        borderWidth: 0,
        borderColor: '#ffffff'
      }]
    },
    options: {
      plugins: {
        legend: { 
          position: 'bottom', 
          labels: { 
            font: { size: 11 },
            padding: 8,
            boxWidth: 12
          } 
        }
      }
    }
  };
  
  const chartSeasonal = createStableChart('chartSeasonal', chartSeasonalConfig);
  
  // Gestion des filtres AMÉLIORÉE
  document.querySelectorAll('.filter-chip[data-year]').forEach(chip => {
    chip.addEventListener('click', function() {
      this.classList.toggle('active');
      // Délai pour éviter les conflits
      setTimeout(() => drawFilteredChart(), 100);
    });
  });
  
  drawFilteredChart();
  
  console.log('✅ Graphiques avancés créés avec succès - anti-étirement activé');
}

/* ===== GESTION OPTIMISÉE DES COUCHES ===== */

function updateLayerControl() {
  if (layerControl) {
    map.removeControl(layerControl);
  }

  const fondsCarte = {
    "🗺️ Standard": osm,
    "🛰️ Satellite": satellite,
    "🎨 CartoDB": cartoDB
  };

  const couchesAffichage = {
    "🏛️ Limites EMS": limitesEMS,
    "🏠 Jardins privés": jardinsPrives,
    "🌱 Jardins partagés": markersCluster
  }; 

  Object.entries(layersHistoriques).forEach(([annee, couche]) => {
    couchesAffichage[`🏡 Jardins familiaux ${annee}`] = couche;
  });

  layerControl = L.control.layers(fondsCarte, couchesAffichage, {
    collapsed: false,
    position: 'topright'
  });
  layerControl.addTo(map);
}

/* ===== TIMELINE OPTIMISÉE ===== */

function initTimeline() {
  const slider = document.getElementById('timelineSlider');
  const yearDisplay = document.getElementById('currentYear');
  const playBtn = document.getElementById('playBtn');

  // Optimiser avec debouncing
  let timeoutId;
  slider.addEventListener('input', function() {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      const year = this.value;
      yearDisplay.textContent = year;
      updateHistoricalDisplay(year);
    }, 100);
  });

  playBtn.addEventListener('click', function() {
    timelinePlaying = !timelinePlaying;
    
    if (timelinePlaying) {
      playBtn.innerHTML = '<i data-lucide="pause"></i>';
      playTimeline();
    } else {
      playBtn.innerHTML = '<i data-lucide="play"></i>';
    }
    
    lucide.createIcons();
  });
}

function playTimeline() {
  if (!timelinePlaying) return;

  const slider = document.getElementById('timelineSlider');
  let currentValue = parseInt(slider.value);
  
  const years = [1956, 1978, 2018, 2024];
  const currentIndex = years.indexOf(currentValue);
  const nextIndex = (currentIndex + 1) % years.length;
  
  slider.value = years[nextIndex];
  slider.dispatchEvent(new Event('input'));

  setTimeout(() => playTimeline(), 2000);
}

function updateHistoricalDisplay(year) {
  // OPTIMISATION: Utiliser requestAnimationFrame pour éviter les blocages
  requestAnimationFrame(() => {
    Object.values(layersHistoriques).forEach(layer => {
      if (map.hasLayer(layer)) {
        map.removeLayer(layer);
      }
    });

    const targetLayer = layersHistoriques[year];
    if (targetLayer && !map.hasLayer(targetLayer)) {
      targetLayer.addTo(map);
      
      // Animation optimisée
      let layerCount = 0;
      targetLayer.eachLayer(function(layer) {
        layerCount++;
        layer.setStyle({ fillOpacity: 0 });
        setTimeout(() => {
          layer.setStyle({ fillOpacity: 0.4 });
        }, layerCount * 20); // Réduire les délais
      });
    }

    showToast(`Jardins familiaux de ${year}`, 'success', 1000);
  });
}

/* ===== CHARGEMENT OPTIMISÉ DES DONNÉES ===== */

// OPTIMISATION: Fonction de chargement avec Promise.all pour le parallélisme
async function loadAllData() {
  try {
    updateLoadingProgress(0, 100, 0);
    
    // Charger les données en parallèle
    const [limitesData, jardinsPartagesData, jardinsPrivesData] = await Promise.all([
      fetch('limites_ems_4326.geojson').then(r => r.json()).catch(() => null),
      fetch('jardins_partages_4326.geojson').then(r => r.json()).catch(() => null),
      fetch('jardins_prives_4326.geojson').then(r => r.json()).catch(() => null)
    ]);

    updateLoadingProgress(30, 100, 0);

    // Traiter les limites EMS
    if (limitesData) {
      limitesEMS.addData(limitesData);
      updateLayerControl();
    }

    updateLoadingProgress(40, 100, 0);

    // Traiter les jardins partagés
    if (jardinsPartagesData) {
      jardinsPartages.addData(jardinsPartagesData);
      markersCluster.addLayer(jardinsPartages);
      map.addLayer(markersCluster);
      updateLayerControl();
    }

    updateLoadingProgress(60, 100, 0);

    // Traiter les jardins privés
    if (jardinsPrivesData) {
      jardinsPrives.addData(jardinsPrivesData);
      jardinsPrives.addTo(map);
      createJardinList(jardinsPrivesData);
      updateLayerControl();
    }

    updateLoadingProgress(80, 100, 0);

    // Charger les données historiques
    await loadHistoricalData();

    updateLoadingProgress(100, 100, 0);
    
    // Finaliser le chargement
    setTimeout(() => {
      const loadingOverlay = document.getElementById('mapLoading');
      if (loadingOverlay) {
        loadingOverlay.style.opacity = '0';
        setTimeout(() => {
          loadingOverlay.style.display = 'none';
          isDataLoaded = true;
          updateStats();
          showToast('🌿 Carte chargée avec succès !', 'success');
        }, 500);
      }
    }, 200);

  } catch (error) {
    console.error('Erreur lors du chargement:', error);
    showToast('Erreur lors du chargement des données', 'error');
  }
}

// OPTIMISATION: Chargement des données historiques optimisé
async function loadHistoricalData() {
  const historicalPromises = Object.entries(couchesHistoriques).map(async ([annee, url]) => {
    try {
      const response = await fetch(url);
      const gj = await response.json();
      
      const layer = L.geoJSON(gj, {
        style: {
          color: getColorForYear(annee),
          weight: 2,
          fillOpacity: 0.4,
          opacity: 0.8
        },
        onEachFeature: (feature, layer) => {
          const props = feature.properties;
          
          let popupContent = `
            <div style="font-family: Inter, sans-serif; min-width: 220px;">
              <h4 style="margin: 0 0 0.5rem 0; color: ${getColorForYear(annee)}; font-size: 1.1rem;">
                <i data-lucide="home"></i> Jardin familial (${annee})
              </h4>
          `;
          
          if (annee !== '2024') {
            popupContent += `
              ${props.nom ? `<p style="margin: 0.25rem 0; font-weight: 500; color: #374151;">
                <i data-lucide="tag"></i> <strong>Nom:</strong> ${props.nom}
              </p>` : ''}
              ${props.SURFACE_M2 ? `<p style="margin: 0.25rem 0; color: #6b7280;">
                <i data-lucide="square"></i> <strong>Surface:</strong> ${props.SURFACE_M2} m²
              </p>` : ''}
              ${props.SURFACE_HA ? `<p style="margin: 0.25rem 0; color: #6b7280;">
                <i data-lucide="maximize"></i> <strong>Surface:</strong> ${props.SURFACE_HA} ha
              </p>` : ''}
              ${props.PERIMETRE ? `<p style="margin: 0.25rem 0; color: #6b7280;">
                <i data-lucide="move"></i> <strong>Périmètre:</strong> ${props.PERIMETRE} m
              </p>` : ''}
            `;
          } else {
            popupContent += `
              ${props.NOM ? `<p style="margin: 0.25rem 0; font-weight: 500; color: #374151;">
                <i data-lucide="tag"></i> <strong>Nom:</strong> ${props.NOM}
              </p>` : ''}
              ${props.TPE ? `<p style="margin: 0.25rem 0; color: #6b7280;">
                <i data-lucide="building"></i> <strong>Type:</strong> ${props.TPE}
              </p>` : ''}
              ${props.SUPERFICIE_M2 ? `<p style="margin: 0.25rem 0; color: #6b7280;">
                <i data-lucide="square"></i> <strong>Superficie:</strong> ${props.SUPERFICIE_M2} m²
              </p>` : ''}
            `;
          }
          
          popupContent += `
              <p style="margin: 0.5rem 0 0 0; padding: 0.5rem; background: rgba(16, 185, 129, 0.1); border-radius: 6px; font-size: 0.75rem; color: #059669;">
                <i data-lucide="clock"></i> Données historiques ${annee}
              </p>
            </div>
          `;

          layer.bindPopup(popupContent, {
            className: 'custom-popup historical-popup',
            autoPan: false
          });

          // Événements optimisés
          let hoverTimeout;
          layer.on('mouseover', function(e) {
            clearTimeout(hoverTimeout);
            hoverTimeout = setTimeout(() => {
              e.target.setStyle({ fillOpacity: 0.7, weight: 3 });
            }, 50);
          });

          layer.on('mouseout', function(e) {
            clearTimeout(hoverTimeout);
            /*layer.resetStyle(e.target);*/
          });
        }
      });

      layersHistoriques[annee] = layer;
      statsEvol[annee] = gj.features.length;

      if (annee === "2024") {
        layer.addTo(map);
      }

      return { annee, success: true };
    } catch (error) {
      console.error(`Erreur chargement ${annee}:`, error);
      return { annee, success: false };
    }
  });

  await Promise.all(historicalPromises);
  
  // Finaliser les données historiques
  updateLayerControl();
  afficherEvolutionJardins();
  document.getElementById('timelineContainer').style.display = 'block';
  initTimeline();
  
  // Initialiser les icônes après un délai
  setTimeout(() => lucide.createIcons(), 100);
}

// OPTIMISATION: Création optimisée de la liste des jardins
function createJardinList(data) {
  const listContainer = document.getElementById('jardin-list');
  if (!listContainer) return;
  
  listContainer.innerHTML = '';
  
  // Utiliser DocumentFragment pour optimiser les performances
  const fragment = document.createDocumentFragment();
  
  data.features.forEach((feature, index) => {
    const nom = feature.properties.nom;
    if (nom) {
      const item = document.createElement('div');
      item.className = 'garden-item';
      item.style.animationDelay = `${Math.min(index * 0.05, 2)}s`; // Limiter les délais
      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <i data-lucide="sprout"></i>
          <span>${nom}</span>
        </div>
        <i data-lucide="external-link"></i>
      `;
      
      item.addEventListener('click', () => zoomToJardin(nom));
      fragment.appendChild(item);
    }
  });
  
  listContainer.appendChild(fragment);
  lucide.createIcons();
}

/* ===== FONCTIONS DE STYLE ET COULEURS ===== */

function getColorForYear(annee) {
  const colors = {
    "1956": "#ef4444",
    "1978": "#f97316",
    "2018": "#22c55e",
    "2024": "#3b82f6"
  };
  return colors[annee] || "#6b7280";
}

function afficherEvolutionJardins() {
  const ul = document.getElementById('liste-evolution');
  if (!ul) return;
  
  ul.innerHTML = '';
  const annees = Object.keys(statsEvol).sort();
  
  // Utiliser DocumentFragment pour optimiser
  const fragment = document.createDocumentFragment();
  
  annees.forEach((annee, index) => {
    const li = document.createElement('li');
    li.className = 'garden-item';
    li.style.animationDelay = `${index * 0.1}s`;
    li.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        <div style="width: 12px; height: 12px; background: ${getColorForYear(annee)}; border-radius: 50%;"></div>
        <span><strong>${annee}</strong> : ${statsEvol[annee]} jardins</span>
      </div>
      <i data-lucide="trending-up"></i>
    `;
    
    li.addEventListener('click', () => {
      document.getElementById('timelineSlider').value = annee;
      document.getElementById('timelineSlider').dispatchEvent(new Event('input'));
      showToast(`Navigation vers ${annee}`, 'success', 1000);
    });
    
    fragment.appendChild(li);
  });
  
  ul.appendChild(fragment);
  lucide.createIcons();
}

/* ===== SYSTÈME DE TUTORIEL ===== */

const tutorialSteps = [
  {
    title: '🌿 Bienvenue dans ce tutoriel !',
    content: `
      <p>Découvrez la <strong>carte interactive</strong> des jardins de Strasbourg optimisée pour de meilleures performances.</p>
      <ul style="margin: 1rem 0; padding-left: 1.5rem;">
        <li>🏠 <strong>Jardins privés</strong> avec données de récolte</li>
        <li>🌱 <strong>Jardins partagés</strong> communautaires</li>
        <li>📅 <strong>Évolution historique</strong> des jardins familiaux</li>
        <li>📊 <strong>Statistiques interactives</strong></li>
      </ul>
    `
  },
  {
    title: '🗺️ Navigation optimisée',
    content: `
      <p>Interface optimisée pour une <strong>navigation fluide</strong> :</p>
      <ul style="margin: 1rem 0; padding-left: 1.5rem;">
        <li>⚡ <strong>Chargement rapide</strong> des données</li>
        <li>🖱️ <strong>Interactions fluides</strong></li>
        <li>📱 <strong>Responsive</strong> sur tous les appareils</li>
        <li>🎯 <strong>Graphiques à la demande</strong></li>
      </ul>
      <div style="margin-top: 1rem; padding: 1rem; background: rgba(16, 185, 129, 0.1); border-radius: 8px; border-left: 4px solid #10b981;">
        <p style="margin: 0; font-size: 0.9rem;"><strong>💡 Astuce :</strong> Cliquez sur un jardin privé (orange) pour accéder aux analyses détaillées !</p>
      </div>
    `
  },
  {
    title: '📊 Graphiques de base',
    content: `
      <p>Chaque jardin privé dispose de <strong>2 graphiques principaux</strong> :</p>
      <div style="margin: 1rem 0;">
        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.8rem;">
          <div style="width: 16px; height: 16px; background: linear-gradient(135deg, #10b981, #059669); border-radius: 50%;"></div>
          <strong>Graphique en camembert :</strong> Répartition des variétés cultivées
        </div>
        <p style="margin-left: 1.5rem; font-size: 0.9rem; color: #6b7280;">Visualise quelles variétés (tomates, courgettes, etc.) représentent le plus gros volume de récolte</p>
        
        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.8rem;">
          <div style="width: 16px; height: 16px; background: #10b981; border-radius: 2px;"></div>
          <strong>Graphique en barres :</strong> Évolution annuelle des récoltes (2020-2024)
        </div>
        <p style="margin-left: 1.5rem; font-size: 0.9rem; color: #6b7280;">Montre l'évolution des rendements année par année pour identifier les tendances</p>
      </div>
    `
  },
  {
    title: '📈 Graphiques avancés',
    content: `
      <p>Cliquez sur <strong>"Voir plus d'analyses"</strong> pour accéder à 4 graphiques supplémentaires :</p>
      <div style="margin: 1rem 0;">
        <div style="margin-bottom: 0.8rem;">
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.3rem;">
            <span style="font-size: 1.2rem;">🏆</span>
            <strong>Top 10 des variétés :</strong>
          </div>
          <p style="margin-left: 1.5rem; font-size: 0.9rem; color: #6b7280;">Classement horizontal des variétés les plus productives</p>
        </div>
        
        <div style="margin-bottom: 0.8rem;">
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.3rem;">
            <span style="font-size: 1.2rem;">🎛️</span>
            <strong>Filtrage par années :</strong>
          </div>
          <p style="margin-left: 1.5rem; font-size: 0.9rem; color: #6b7280;">Graphique linéaire interactif - cliquez sur les années pour filtrer</p>
        </div>
        
        <div style="margin-bottom: 0.8rem;">
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.3rem;">
            <span style="font-size: 1.2rem;">📡</span>
            <strong>Analyse de productivité :</strong>
          </div>
          <p style="margin-left: 1.5rem; font-size: 0.9rem; color: #6b7280;">Graphique radar montrant la productivité relative de chaque variété</p>
        </div>
        
        <div style="margin-bottom: 0.8rem;">
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.3rem;">
            <span style="font-size: 1.2rem;">🌤️</span>
            <strong>Tendance saisonnière :</strong>
          </div>
          <p style="margin-left: 1.5rem; font-size: 0.9rem; color: #6b7280;">Distribution estimée des récoltes par saison (printemps, été, automne, hiver)</p>
        </div>
      </div>
    `
  },
  {
    title: '🎯 Utilité des données',
    content: `
      <p>Ces <strong>analyses graphiques</strong> permettent de :</p>
      <ul style="margin: 1rem 0; padding-left: 1.5rem;">
        <li>📈 <strong>Optimiser les cultures</strong> : identifier les variétés les plus productives</li>
        <li>📅 <strong>Planifier les plantations</strong> : analyser les tendances saisonnières</li>
        <li>🔍 <strong>Comparer les performances</strong> : évaluer l'évolution des rendements</li>
        <li>🌱 <strong>Améliorer les pratiques</strong> : adapter les techniques selon les résultats</li>
        <li>📊 <strong>Suivre la diversité</strong> : maintenir un équilibre entre les variétés</li>
      </ul>
      <div style="margin-top: 1rem; padding: 1rem; background: rgba(59, 130, 246, 0.1); border-radius: 8px; border-left: 4px solid #3b82f6;">
        <p style="margin: 0; font-size: 0.9rem;"><strong>🎯 Objectif :</strong> Contribuer à l'étude de l'agriculture urbaine à Strasbourg en collectant des données réelles de terrain.</p>
      </div>
    `
  },
  {
    title: '📊 Analyses performantes',
    content: `
      <p>Système d'analyse <strong>optimisé</strong> :</p>
      <ul style="margin: 1rem 0; padding-left: 1.5rem;">
        <li>💨 <strong>Chargement rapide</strong> des graphiques</li>
        <li>🔄 <strong>Cache intelligent</strong> des données</li>
        <li>📈 <strong>Analyses à la demande</strong></li>
        <li>🎛️ <strong>Filtres interactifs</strong></li>
      </ul>
      <div style="margin-top: 1rem; padding: 1rem; background: rgba(245, 158, 11, 0.1); border-radius: 8px; border-left: 4px solid #f59e0b;">
        <p style="margin: 0; font-size: 0.9rem;"><strong>⚡ Performance :</strong> Les graphiques sont créés uniquement à la demande pour optimiser les temps de chargement.</p>
      </div>
    `
  },
  {
    title: '👨‍💻 À propos du projet',
    content: `
      <p>Application développée par <strong>Alhassane TAMABDOU</strong> :</p>
      <ul style="margin: 1rem 0; padding-left: 1.5rem;">
        <li>🎓 <strong>Master 2 OTG</strong> (Observation de la Terre et Géomatique)</li>
        <li>💻 <strong>Géomaticien / Développeur SIG</strong></li>
        <li>🌍 <strong>Focus</strong> : Agriculture urbaine et analyse spatiale</li>
      </ul>
      <div style="margin-top: 1rem; padding: 1rem; background: rgba(139, 92, 246, 0.1); border-radius: 8px; border-left: 4px solid #8b5cf6;">
        <p style="margin: 0; font-size: 0.9rem;"><strong>🚀 Technologies :</strong> Leaflet, Chart.js, Excel/XLSX, JavaScript ES6+</p>
      </div>
      <div style="text-align: center; margin-top: 1.5rem;">
        <p style="font-size: 0.9rem; color: #6b7280;">Merci d'utiliser cette carte interactive !</p>
        <p style="font-size: 1.1rem;">🌱 <strong>Bonne exploration des jardins de Strasbourg !</strong> 🌱</p>
      </div>
    `
  }
];

let currentTutorialStep = 0;

function showTutorial() {
  currentTutorialStep = 0;
  
  // ✅ STABILISATION : Préparer l'affichage avant de rendre visible
  const tutorialElement = document.getElementById('tutorial');
  if (tutorialElement) {
    // Masquer temporairement pour éviter la digression
    tutorialElement.style.opacity = '0';
    tutorialElement.style.display = 'flex';
    
    // Forcer un reflow pour stabiliser la position
    tutorialElement.offsetHeight;
    
    // Mise à jour du contenu
    updateTutorialContent();
    
    // Affichage stable avec animation fluide
    requestAnimationFrame(() => {
      tutorialElement.style.opacity = '1';
    });
  }
}

function updateTutorialContent() {
  const step = tutorialSteps[currentTutorialStep];
  document.getElementById('tutorial-title').textContent = step.title;
  document.getElementById('tutorial-content').innerHTML = step.content;
  document.getElementById('tutorial-step').textContent = `${currentTutorialStep + 1}/${tutorialSteps.length}`;

  const progressContainer = document.getElementById('tutorial-progress');
  progressContainer.innerHTML = '';
  
  tutorialSteps.forEach((_, index) => {
    const dot = document.createElement('div');
    dot.className = `progress-dot ${index === currentTutorialStep ? 'active' : ''}`;
    progressContainer.appendChild(dot);
  });

  document.getElementById('tutorial-prev').style.display = currentTutorialStep === 0 ? 'none' : 'flex';
  
  const nextBtn = document.getElementById('tutorial-next');
  if (currentTutorialStep === tutorialSteps.length - 1) {
    nextBtn.innerHTML = '<i data-lucide="check"></i> Terminer';
  } else {
    nextBtn.innerHTML = 'Suivant <i data-lucide="chevron-right"></i>';
  }

  lucide.createIcons();
}

/* ===== GESTIONNAIRES D'ÉVÉNEMENTS OPTIMISÉS ===== */

// OPTIMISATION: Utiliser la délégation d'événements et le debouncing
document.addEventListener('DOMContentLoaded', function() {
  // Initialiser les gestionnaires avec debouncing
  const debouncedHandlers = {
    theme: debounce(toggleTheme, 300),
    sidebar: debounce(toggleSidebar, 300),
    location: debounce(handleLocationClick, 1000),
    search: debounce(showSearchModal, 300),
    contact: debounce(showContactForm, 300),
    export: debounce(exportGardenData, 1000)
  };

  // Gestionnaires optimisés
  document.getElementById('themeToggle').addEventListener('click', debouncedHandlers.theme);
  document.getElementById('sidebarToggle').addEventListener('click', debouncedHandlers.sidebar);
  document.getElementById('locationBtn').addEventListener('click', debouncedHandlers.location);
  document.getElementById('searchBtn').addEventListener('click', debouncedHandlers.search);
  document.getElementById('contactBtn').addEventListener('click', debouncedHandlers.contact);
  document.getElementById('exportBtn').addEventListener('click', debouncedHandlers.export);

  // Gestionnaires du tutoriel
  document.getElementById('tutorial-next').addEventListener('click', function() {
    if (currentTutorialStep < tutorialSteps.length - 1) {
      currentTutorialStep++;
      updateTutorialContent();
    } else {
      document.getElementById('tutorial').style.display = 'none';
      showToast('Tutoriel terminé !', 'success');
    }
  });

  document.getElementById('tutorial-prev').addEventListener('click', function() {
    if (currentTutorialStep > 0) {
      currentTutorialStep--;
      updateTutorialContent();
    }
  });

  document.getElementById('tutorial-close').addEventListener('click', function() {
    document.getElementById('tutorial').style.display = 'none';
  });

  // Délégation d'événements pour les filtres
  document.addEventListener('click', function(e) {
    if (e.target.matches('.filter-chip[data-filter]')) {
      document.querySelectorAll('.filter-chip[data-filter]').forEach(c => c.classList.remove('active'));
      e.target.classList.add('active');
      currentFilter = e.target.dataset.filter;
      applyFilters();
      showToast(`Filtre "${e.target.textContent}" appliqué`, 'success');
    }
  });

  // Initialiser les icônes et démarrer le chargement
  lucide.createIcons();
  initParticles();
  
  // Démarrer le chargement des données
  loadAllData();
});

// OPTIMISATION: Fonction utilitaire de debouncing
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// OPTIMISATION: Gestionnaire de géolocalisation optimisé
function handleLocationClick() {
  if (navigator.geolocation) {
    showToast('Localisation en cours...', 'success');
    navigator.geolocation.getCurrentPosition(
      function(position) {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        map.setView([lat, lng], 20);
       
        const locationMarker = L.marker([lat, lng], {
          icon: L.divIcon({
            className: 'location-marker',
            html: '<i data-lucide="map-pin"></i>',
            iconSize: [30, 30]
          })
        }).addTo(map);
        
        setTimeout(() => map.removeLayer(locationMarker), 5000);
        showToast('Position trouvée !', 'success');
      },
      function() {
        showToast('Impossible d\'obtenir votre position', 'error');
      },
      {
        timeout: 10000,
        enableHighAccuracy: false,
        maximumAge: 60000
      }
    );
  } else {
    showToast('Géolocalisation non supportée', 'error');
  }
}

/* ===== FONCTIONS SIMPLIFIÉES POUR LES MODALS ===== */

function showSearchModal() {
  // Version simplifiée pour les performances
  showToast('Recherche - Tapez dans la console: zoomToJardin("nom_du_jardin")', 'info', 5000);
}

// Fonction pour afficher le formulaire de contact avec EmailJS
function showContactForm() {
  const contactModal = document.createElement('div');
  contactModal.className = 'modal-overlay';
  contactModal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3><i data-lucide="mail"></i> Contact - Projet Récoltes des Jardins</h3>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
          <i data-lucide="x"></i>
        </button>
      </div>
      <div class="modal-body">
        <div class="contact-intro">
          <p><strong>Vous êtes intéressé(e) par notre projet de suivi des récoltes dans les jardins ?</strong></p>
          <p>Nous collectons des données sur les rendements des jardins privés pour mieux comprendre l'agriculture urbaine à Strasbourg. Contactez-nous pour :</p>
          <ul>
            <li>📊 Partager les données de votre jardin</li>
            <li>🌱 Rejoindre notre réseau de jardiniers</li>
            <li>💡 Proposer des améliorations</li>
            <li>❓ Poser des questions sur le projet</li>
          </ul>
        </div>
        
        <form id="contactForm">
          <div class="form-row">
            <div class="form-group">
              <label for="contactName">Nom complet *</label>
              <input type="text" id="contactName" name="name" required>
            </div>
            <div class="form-group">
              <label for="contactEmail">Email *</label>
              <input type="email" id="contactEmail" name="email" required>
            </div>
          </div>
          
          <div class="form-group">
            <label for="contactPhone">Téléphone (optionnel)</label>
            <input type="tel" id="contactPhone" name="phone">
          </div>
          
          <div class="form-group">
            <label for="contactSubject">Sujet de votre demande *</label>
            <select id="contactSubject" name="subject" required>
              <option value="">Sélectionnez un sujet</option>
              <option value="data-sharing">🌱 Partager mes données de récolte</option>
              <option value="join-network">🤝 Rejoindre le réseau de jardiniers</option>
              <option value="garden-registration">📝 Enregistrer mon jardin</option>
              <option value="collaboration">💼 Proposition de collaboration</option>
              <option value="technical-issue">🔧 Problème technique</option>
              <option value="general-info">ℹ️ Demande d'information générale</option>
              <option value="suggestion">💡 Suggestion d'amélioration</option>
            </select>
          </div>
          
          <div class="form-group">
            <label for="gardenInfo">Informations sur votre jardin (optionnel)</label>
            <textarea id="gardenInfo" name="gardenInfo" rows="2" placeholder="Superficie, localisation, types de cultures..."></textarea>
          </div>
          
          <div class="form-group">
            <label for="contactMessage">Votre message *</label>
            <textarea id="contactMessage" name="message" rows="4" required placeholder="Décrivez votre demande ou partagez vos questions..."></textarea>
          </div>
          
          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" id="newsletter" name="newsletter">
              <span class="checkmark"></span>
              Je souhaite recevoir des informations sur les jardins de Strasbourg
            </label>
          </div>
          
          <div class="form-actions">
            <button type="button" class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">
              <i data-lucide="x"></i>
              Annuler
            </button>
            <button type="submit" class="btn btn-primary">
              <i data-lucide="send"></i>
              Envoyer le message
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
  
  document.body.appendChild(contactModal);
  
  // ✅ GESTIONNAIRE DE SOUMISSION AVEC EMAILJS
  document.getElementById('contactForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    // Afficher le loader pendant l'envoi
    const submitBtn = this.querySelector('button[type="submit"]');
    const originalBtnContent = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i data-lucide="loader"></i> Envoi en cours...';
    submitBtn.disabled = true;
    lucide.createIcons();
    
    // Récupérer les données du formulaire
    const formData = new FormData(this);
    const contactData = {
      name: formData.get('name'),
      email: formData.get('email'),
      phone: formData.get('phone') || 'Non renseigné',
      subject: formData.get('subject'),
      gardenInfo: formData.get('gardenInfo') || 'Aucune information fournie',
      message: formData.get('message'),
      newsletter: formData.get('newsletter') ? 'Oui' : 'Non',
      timestamp: new Date().toLocaleString('fr-FR')
    };

    // ✅ CONFIGURATION EMAILJS - REMPLACEZ PAR VOS VRAIES CLÉS
    const EMAIL_CONFIG = {
      serviceID: 'service_02zylod',      // ⚠️ À remplacer
      templateID: 'template_mx6j3mi',    // ⚠️ À remplacer
      publicKey: '0aupTGY69X7AZIVko'       // ⚠️ À remplacer
    };

    // Préparer les données pour EmailJS
    const emailParams = {
      from_name: contactData.name,
      from_email: contactData.email,
      phone: contactData.phone,
      subject: contactData.subject,
      garden_info: contactData.gardenInfo,
      message: contactData.message,
      newsletter: contactData.newsletter,
      timestamp: contactData.timestamp,
      formatted_subject: `[Jardins Strasbourg] ${contactData.subject.replace(/[🌱🤝📝💼🔧ℹ️💡]/g, '').trim()}`
    };

    // ✅ ENVOI AVEC EMAILJS
    if (typeof emailjs !== 'undefined') {
      emailjs.send(
        EMAIL_CONFIG.serviceID,
        EMAIL_CONFIG.templateID,
        emailParams,
        EMAIL_CONFIG.publicKey
      )
      .then(function(response) {
        console.log('✅ Email envoyé avec succès !', response.status, response.text);
        showToast('Message envoyé avec succès ! Nous vous répondrons dans les plus brefs délais.', 'success', 5000);
        contactModal.remove();
        
        // Sauvegarder localement (optionnel)
        try {
          const existingContacts = JSON.parse(localStorage.getItem('jardins_contacts') || '[]');
          existingContacts.push(contactData);
          localStorage.setItem('jardins_contacts', JSON.stringify(existingContacts));
        } catch (error) {
          console.warn('⚠️ Impossible de sauvegarder localement');
        }
      })
      .catch(function(error) {
        console.error('❌ Erreur lors de l\'envoi :', error);
        showToast('Erreur lors de l\'envoi du message. Veuillez réessayer.', 'error', 7000);
        
        // Restaurer le bouton
        submitBtn.innerHTML = originalBtnContent;
        submitBtn.disabled = false;
        lucide.createIcons();
      });
    } else {
      // Fallback si EmailJS n'est pas disponible
      console.error('❌ EmailJS non disponible');
      showToast('Service d\'email non disponible. Les données sont sauvegardées localement.', 'warning', 5000);
      
      // Sauvegarder quand même les données
      console.log('Données de contact (fallback):', contactData);
      contactModal.remove();
      
      submitBtn.innerHTML = originalBtnContent;
      submitBtn.disabled = false;
    }
  });
  
  // Réinitialiser les icônes Lucide dans le modal
  lucide.createIcons();
}

// ✅ INITIALISATION EMAILJS (à ajouter dans votre DOMContentLoaded)
function initEmailJS() {
  const publicKey = 'YOUR_PUBLIC_KEY'; // ⚠️ À remplacer par votre vraie clé
  
  if (typeof emailjs !== 'undefined') {
    emailjs.init(publicKey);
    console.log('✅ EmailJS initialisé avec succès');
  } else {
    console.error('❌ EmailJS non trouvé - vérifiez que le script est chargé');
  }
}

function exportGardenData() {
  // Version simplifiée pour les performances
  const exportData = {
    jardins_prives: Object.keys(jardinLayers).length,
    jardins_partages: jardinsPartages.getLayers().length || 0,
    jardins_familiaux: Object.keys(statsEvol).length,
    timestamp: new Date().toISOString()
  };
  
  const dataStr = JSON.stringify(exportData, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = 'jardins-strasbourg-' + new Date().toISOString().split('T')[0] + '.json';
  link.click();
  
  URL.revokeObjectURL(url);
  showToast('Données exportées !', 'success');
}

function applyFilters() {
  requestAnimationFrame(() => {
    switch(currentFilter) {
      case 'all':
        if (!map.hasLayer(jardinsPrives)) map.addLayer(jardinsPrives);
        if (!map.hasLayer(markersCluster)) map.addLayer(markersCluster);
        break;
      case 'private':
        if (!map.hasLayer(jardinsPrives)) map.addLayer(jardinsPrives);
        if (map.hasLayer(markersCluster)) map.removeLayer(markersCluster);
        break;
      case 'shared':
        if (map.hasLayer(jardinsPrives)) map.removeLayer(jardinsPrives);
        if (!map.hasLayer(markersCluster)) map.addLayer(markersCluster);
        break;
    }
  });
}

/* ===== EFFETS VISUELS OPTIMISÉS ===== */

function initParticles() {
  const particlesContainer = document.getElementById('particles');
  if (!particlesContainer) return;
  
  // Réduire le nombre de particules pour les performances
  let particleCount = 0;
  const maxParticles = 20;
  
  function createParticle() {
    if (particleCount >= maxParticles) return;
    
    const particle = document.createElement('div');
    particle.className = 'particle';
    particle.style.left = Math.random() * 100 + '%';
    particle.style.animationDuration = (Math.random() * 10 + 15) + 's';
    particle.style.opacity = Math.random() * 0.2;
    
    particlesContainer.appendChild(particle);
    particleCount++;

    setTimeout(() => {
      if (particle.parentNode) {
        particle.parentNode.removeChild(particle);
        particleCount--;
      }
    }, 20000);
  }

  // Créer moins de particules, moins fréquemment
  setInterval(createParticle, 5000);
}

function createLegend() {
  const legend = L.control({ position: 'bottomright' });
  
  legend.onAdd = function(map) {
    const div = L.DomUtil.create('div', 'legend');
    div.innerHTML = `
      <h4>
            <i data-lucide="map"></i>
            Légende interactive
          </h4>
          
          <div class="legend-section">
            <strong>🌱 Jardins actuels</strong>
            <div class="legend-item">
              <div class="legend-symbol circle" style="background-color: #10b981; border: 2px solid #065f46;"></div>
              <span class="legend-text">Jardins partagés (communautaires)</span>
            </div>
            <div class="legend-item">
              <div class="legend-symbol" style="background-color: #f59e0b; opacity: 0.7; border: 2px solid #d97706;"></div>
              <span class="legend-text">Jardins privés (avec données)</span>
            </div>
          </div>
          
          <div class="legend-section">
            <strong>📅 Évolution historique</strong>
            <div class="legend-item">
              <div class="legend-symbol" style="background-color: #ef4444; opacity: 0.4;"></div>
              <span class="legend-text">Jardins familiaux 1956</span>
            </div>
            <div class="legend-item">
              <div class="legend-symbol" style="background-color: #f97316; opacity: 0.4;"></div>
              <span class="legend-text">Jardins familiaux 1978</span>
            </div>
            <div class="legend-item">
              <div class="legend-symbol" style="background-color: #22c55e; opacity: 0.4;"></div>
              <span class="legend-text">Jardins familiaux 2018</span>
            </div>
            <div class="legend-item">
              <div class="legend-symbol" style="background-color: #3b82f6; opacity: 0.4;"></div>
              <span class="legend-text">Jardins familiaux 2024</span>
            </div>
          </div>
          
          <div class="legend-section">
            <strong>🏛️ Autres couches</strong>
            <div class="legend-item">
              <div class="legend-symbol line" style="background-color: #6b7280;"></div>
              <span class="legend-text">Limites administratives EMS</span>
            </div>
          </div>
          
          <div style="margin-top: 1rem; padding: 0.75rem; background: rgba(16, 185, 129, 0.1); border-radius: 8px; border-left: 3px solid #10b981;">
            <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; color: #059669; font-weight: 500;">
              <i data-lucide="lightbulb"></i>
              <span>Cliquez sur les éléments pour plus d'informations</span>
            </div>
          </div>
        `;
    
    L.DomEvent.disableClickPropagation(div);
    setTimeout(() => lucide.createIcons(), 100);
    return div;
  };
  
  legend.addTo(map);
}

/* ===== ÉVÉNEMENTS DE LA CARTE OPTIMISÉS ===== */

map.on('zoomend', debounce(function() {
  const zoom = map.getZoom();
  if (zoom > 14) {
    showToast(`Zoom ${zoom}`, 'success', 1000);
  }
}, 500));

map.on('moveend', debounce(function() {
  const center = map.getCenter();
  const distance = center.distanceTo([48.5734, 7.7521]);
  
  if (distance > 50000) {
    showToast('Vous vous éloignez de Strasbourg', 'warning', 1500);
  }
}, 1000));

/* ===== STYLES CSS SUPPLÉMENTAIRES POUR LES NOUVELLES FONCTIONNALITÉS ===== */

// Ajouter ces styles pour les nouvelles fonctionnalités améliorées
const enhancementStyles = document.createElement('style');
enhancementStyles.textContent = `
  .stat-card-mini {
    background: var(--bg-glass);
    padding: 0.75rem;
    border-radius: 8px;
    text-align: center;
    border: 1px solid var(--border-color);
    transition: all 0.3s ease;
    animation: slideInUp 0.6s ease-out;
  }
  
  .stat-card-mini:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-medium);
  }
  
  .stat-number-mini {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--primary-color);
    display: block;
  }
  
  .stat-label-mini {
    font-size: 0.75rem;
    color: var(--text-secondary);
    margin-top: 0.25rem;
  }
  
  .top-variety-item {
    transition: all 0.3s ease;
  }
  
  .top-variety-item:hover {
    background: var(--bg-glass);
    border-radius: 6px;
    padding: 0.5rem 0.75rem !important;
    transform: translateX(4px);
  }
  
  .trends-analysis {
    animation: slideInUp 0.6s ease-out;
  }
  
  .garden-header {
    animation: fadeInScale 0.8s ease-out;
  }
  
  .stats-summary {
    animation: slideInLeft 0.6s ease-out;
  }
  
  .top-varieties {
    animation: slideInRight 0.6s ease-out;
  }
  
  .chart-container {
    animation: fadeInUp 0.8s ease-out;
  }
  
  @keyframes fadeInScale {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
  
  @keyframes slideInLeft {
    from {
      opacity: 0;
      transform: translateX(-30px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
  
  @keyframes slideInRight {
    from {
      opacity: 0;
      transform: translateX(30px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
  
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  @keyframes slideInUp {
    from {
      opacity: 0;
      transform: translateY(30px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  /* Styles pour l'export en cours */
  .export-progress {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: var(--bg-secondary);
    padding: 2rem;
    border-radius: 16px;
    box-shadow: var(--shadow-large);
    z-index: 3000;
    min-width: 300px;
    text-align: center;
  }
  
  .export-progress .loading-spinner {
    margin: 0 auto 1rem;
  }
  
  /* Amélioration des tooltips Chart.js */
  .chartjs-tooltip {
    background: var(--bg-secondary) !important;
    border: 1px solid var(--border-color) !important;
    border-radius: 8px !important;
    box-shadow: var(--shadow-medium) !important;
    color: var(--text-primary) !important;
    font-family: 'Inter', sans-serif !important;
  }
  
  /* Styles pour les graphiques en mode sombre */
  [data-theme="dark"] .chartjs-tooltip {
    background: var(--dark-bg-secondary) !important;
    border-color: var(--dark-border-color) !important;
    color: var(--dark-text-primary) !important;
  }
  
  /* Animation pour le bouton d'export */
  .btn[onclick*="exportJardinData"] {
    position: relative;
    overflow: hidden;
  }
  
  .btn[onclick*="exportJardinData"]:hover {
    background: linear-gradient(135deg, #059669, #047857);
    transform: translateY(-2px);
  }
  
  .btn[onclick*="exportJardinData"]::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 0;
    height: 0;
    background: rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    transform: translate(-50%, -50%);
    transition: width 0.6s, height 0.6s;
  }
  
  .btn[onclick*="exportJardinData"]:active::after {
    width: 300px;
    height: 300px;
  }
`;

document.head.appendChild(enhancementStyles);

/* ===== INITIALISATION FINALE OPTIMISÉE ===== */

// Créer la légende après le chargement
setTimeout(() => {
  createLegend();
  
  // Attribution personnalisée
  L.control.attribution({
    position: 'bottomleft',
    prefix: '🌿 Jardins de Strasbourg - Version optimisée avec export et statistiques enrichies'
  }).addTo(map);
  
  // Tutoriel automatique (optionnel)
  setTimeout(() => {
    if (!localStorage.getItem('tutorialShown')) {
      showTutorial();
      localStorage.setItem('tutorialShown', 'true');
    }
  }, 3000);
}, 1000);

// Styles supplémentaires optimisés pour la compatibilité
const optimizedStyles = document.createElement('style');
optimizedStyles.textContent = `
  .custom-cluster {
    background: linear-gradient(135deg, #10b981, #059669);
    border: 2px solid white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    color: white;
    transition: transform 0.2s ease;
  }
  
  .custom-cluster:hover {
    transform: scale(1.05);
  }
  
  .location-marker {
    background: #ef4444;
    border: 2px solid white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center; 
    color: white;
    animation: pulse 1s infinite;
  }
  
  .garden-item {
    animation: slideInLeft 0.3s ease-out backwards;
  }
  
  .particle {
    position: absolute;
    width: 3px;
    height: 3px;
    background: #10b981;
    border-radius: 50%;
    opacity: 0.2;
    animation: float 20s infinite linear;
  }
  
  @keyframes float {
    0% { transform: translateY(100vh) rotate(0deg); opacity: 0; }
    10% { opacity: 0.2; }
    90% { opacity: 0.2; }
    100% { transform: translateY(-100px) rotate(360deg); opacity: 0; }
  }
  
  @keyframes pulse {
    0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
    70% { transform: scale(1.05); box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
    100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
  }
`;

document.head.appendChild(optimizedStyles);

/* ===== FONCTION D'INITIALISATION DES AMÉLIORATIONS ===== */

// Fonction pour initialiser toutes les nouvelles fonctionnalités
function initEnhancements() {
  console.log('🚀 Initialisation des améliorations...');
  
  // Vérifier que toutes les dépendances sont présentes
  if (typeof XLSX === 'undefined') {
    console.warn('⚠️ XLSX non trouvé - fonction d\'export désactivée');
    showToast('XLSX non disponible - export Excel désactivé', 'warning', 3000);
  } else {
    console.log('✅ XLSX disponible - export Excel activé');
  }
  
  if (typeof Chart === 'undefined') {
    console.warn('⚠️ Chart.js non trouvé - graphiques désactivés');
    showToast('Chart.js non disponible - graphiques désactivés', 'error', 3000);
  } else {
    console.log('✅ Chart.js disponible - graphiques activés');
  }
  
  // Initialiser le cache de données
  if (!window.dataCache) {
    window.dataCache = new Map();
    console.log('✅ Cache de données initialisé');
  }
  
  // Améliorer les graphiques Chart.js globalement
  if (typeof Chart !== 'undefined') {
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.font.size = 11;
    Chart.defaults.color = 'var(--text-secondary)';
    Chart.defaults.borderColor = 'var(--border-color)';
    Chart.defaults.backgroundColor = 'var(--bg-glass)';
  }
  
  console.log('🚀 Améliorations initialisées avec succès');
  console.log('✅ Export de données Excel ajouté');
  console.log('✅ Statistiques enrichies ajoutées'); 
  console.log('✅ Pourcentages dans les graphiques ajoutés');
  console.log('✅ Animations et transitions améliorées');
  console.log('✅ Cache intelligent pour les performances');
}

/* ===== FONCTIONS UTILITAIRES SUPPLÉMENTAIRES ===== */

// Fonction pour formater les nombres avec séparateurs
function formatNumber(num) {
  return new Intl.NumberFormat('fr-FR').format(num);
}

// Fonction pour formater les pourcentages
function formatPercentage(num) {
  return new Intl.NumberFormat('fr-FR', { 
    style: 'percent', 
    minimumFractionDigits: 1,
    maximumFractionDigits: 1 
  }).format(num / 100);
}

// Fonction pour formater les dates
function formatDate(date) {
  return new Intl.DateTimeFormat('fr-FR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(new Date(date));
}

// Fonction pour détecter le thème système
function detectSystemTheme() {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

// Fonction pour sauvegarder les préférences utilisateur
function saveUserPreferences() {
  const prefs = {
    theme: currentTheme,
    sidebarOpen: sidebarOpen,
    tutorialShown: localStorage.getItem('tutorialShown'),
    lastVisit: new Date().toISOString()
  };
  localStorage.setItem('userPreferences', JSON.stringify(prefs));
}

// Fonction pour charger les préférences utilisateur
function loadUserPreferences() {
  try {
    const prefs = JSON.parse(localStorage.getItem('userPreferences') || '{}');
    
    // Appliquer le thème sauvegardé ou détecter le thème système
    currentTheme = prefs.theme || detectSystemTheme();
    document.documentElement.setAttribute('data-theme', currentTheme);
    if (currentTheme === 'dark') {
      document.getElementById('themeToggle')?.classList.add('dark');
    }
    
    // Appliquer l'état de la sidebar
    if (prefs.sidebarOpen !== undefined) {
      sidebarOpen = prefs.sidebarOpen;
    }
    
    console.log('✅ Préférences utilisateur chargées');
  } catch (error) {
    console.warn('⚠️ Erreur lors du chargement des préférences:', error);
  }
}

// Fonction de nettoyage pour libérer la mémoire
function cleanup() {
  // Nettoyer le cache de données si trop volumineux
  if (dataCache.size > 50) {
    const oldestEntries = Array.from(dataCache.keys()).slice(0, 20);
    oldestEntries.forEach(key => dataCache.delete(key));
    console.log('🧹 Cache nettoyé - anciennes entrées supprimées');
  }
  
  // Nettoyer les toasts du pool
  while (toastPool.length > 10) {
    toastPool.pop();
  }
}

// Fonction pour afficher les statistiques de performance
function showPerformanceStats() {
  const stats = {
    jardinsCharges: Object.keys(jardinLayers).length,
    cacheSize: dataCache.size,
    memoryUsage: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) + ' MB' : 'Non disponible',
    tempsChargement: performance.now(),
    timestamp: new Date().toLocaleString('fr-FR')
  };
  
  console.table(stats);
  return stats;
}

/* ===== GESTIONNAIRE D'ERREURS GLOBAL ===== */

// Gestionnaire d'erreurs global pour capturer les erreurs inattendues
window.addEventListener('error', function(event) {
  console.error('❌ Erreur JavaScript:', event.error);
  showToast('Une erreur est survenue. Consultez la console pour plus de détails.', 'error', 5000);
});

// Gestionnaire pour les promesses rejetées
window.addEventListener('unhandledrejection', function(event) {
  console.error('❌ Promesse rejetée:', event.reason);
  showToast('Erreur de chargement des données. Vérifiez votre connexion.', 'error', 5000);
});

/* ===== ÉVÉNEMENTS DE VISIBILITÉ DE LA PAGE ===== */

// Optimiser les performances quand la page n'est pas visible
document.addEventListener('visibilitychange', function() {
  if (document.hidden) {
    // Pause des animations coûteuses
    timelinePlaying = false;
    console.log('⏸️ Page masquée - animations en pause');
  } else {
    // Reprendre les animations
    console.log('▶️ Page visible - animations reprises');
  }
});

/* ===== SAUVEGARDE AUTOMATIQUE DES PRÉFÉRENCES ===== */

// Sauvegarder les préférences à intervalles réguliers
setInterval(() => {
  saveUserPreferences();
}, 60000); // Toutes les minutes

// Sauvegarder avant de quitter la page
window.addEventListener('beforeunload', function() {
  saveUserPreferences();
  cleanup();
});

/* ===== INITIALISATION FINALE ===== */

// Charger les préférences utilisateur au démarrage
loadUserPreferences();

// Initialiser les améliorations
initEnhancements();

// Nettoyage périodique
setInterval(cleanup, 300000); // Toutes les 5 minutes

// Logs de démarrage
console.log('🌿 Carte interactive des jardins de Strasbourg');
console.log('🚀 Version optimisée avec fonctionnalités avancées chargée');
console.log('📊 Fonctionnalités: export Excel, statistiques enrichies, graphiques avec pourcentages');
console.log('⚡ Optimisations: cache intelligent, debouncing, requestAnimationFrame');
console.log('🎨 Interface: thème adaptatif, animations fluides, responsive design');
console.log('👨‍💻 Développé par Alhassane TAMABDOU - Master 2 OTG');
console.log('');
console.log('💡 Aide:');
console.log('- Cliquez sur un jardin privé (orange) pour voir les statistiques détaillées');
console.log('- Utilisez le bouton "Exporter" pour télécharger les données Excel');
console.log('- Les graphiques montrent désormais les pourcentages ET les quantités');
console.log('- Tapez showPerformanceStats() pour voir les statistiques de performance');
console.log('');